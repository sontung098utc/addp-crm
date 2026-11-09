import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import {
  getActiveZaloHome,
  getAllActiveZaloHomes,
  ensureZaloMcpDaemon,
  syncZaloGroupsAndMetadata,
  getAllZaloHistoryFiles,
  scanAndAutoReplyZaloHistories,
} from "../../../../../lib/zaloRunner.js";
import {
  getOmnichannelConversations,
  getConnectedFacebookPages,
} from "@/lib/unifiedMessageRouter.js";
import { getChannelBotMode, isBotActiveForThread } from "@/lib/botControlStore.js";
import { guardApiRequest } from "@/lib/rbac.js";
import fs from "fs";

/**
 * ADDP Omnichannel AI CRM — API Danh Sách Hội Thoại Đa Kênh Thật 100% (WBS-21 -> WBS-25)
 * Tuân thủ Điều 11 AGENTS.md: Không dùng số liệu giả, 100% dữ liệu lấy từ Zalo Client, history.jsonl & Meta Graph API.
 * Đảm bảo thứ tự hội thoại ổn định tuyệt đối theo đúng thời gian tin nhắn thực tế (không nhảy danh sách).
 */

function cleanMessageSnippet(rawText, msgType) {
  const str = String(rawText || "").trim();
  if (!str) {
    if (msgType === "chat.photo" || msgType === "image") return "[Hình ảnh]";
    if (msgType === "chat.sticker") return "[Nhãn dán]";
    return "[Tin nhắn]";
  }
  if (
    (str.startsWith("http://") || str.startsWith("https://")) &&
    (str.includes("zdn.vn") || str.endsWith(".jpg") || str.endsWith(".png") || str.endsWith(".webp"))
  ) {
    return "[Hình ảnh]";
  }
  if (str.startsWith("{") && str.includes('"phone"') && str.includes('"qrCodeUrl"')) {
    return "[Danh thiếp Zalo]";
  }
  if (str === "[chat.webcontent]") {
    return "[Liên kết đính kèm]";
  }
  return str.replace(/\s+/g, " ");
}

/**
 * Đọc toàn bộ luồng tin nhắn thực tế từ các file history JSONL (đã khử trùng lặp theo msgId)
 */
function getLatestThreadsFromAllHistories(zaloHome, ownId = "1781287338457243967") {
  const historyFiles = getAllZaloHistoryFiles(zaloHome);
  const threadsMap = new Map();
  const seenMsgIds = new Set();

  for (const filePath of historyFiles) {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed);
          const tid = String(msg.threadId || "");
          if (!tid) continue;

          const msgId = msg.msgId ? String(msg.msgId) : "";
          if (msgId && seenMsgIds.has(msgId)) continue;
          if (msgId) seenMsgIds.add(msgId);

          let rawTs = Number(msg.timestamp) || 0;
          const ts =
            rawTs > 2e12 ? Math.floor(rawTs / 1000) : rawTs > 0 && rawTs < 1e11 ? rawTs * 1000 : rawTs;
          if (ts <= 0) continue;

          const isSelf = Boolean(msg.isSelf || (ownId && String(msg.senderId) === String(ownId)));
          const senderName = msg.senderName || "";
          const existing = threadsMap.get(tid);

          // Lưu lại tên khách hàng (nếu tin nhắn chiều đến) để hiển thị đúng tên hội thoại DM
          const peerName = !isSelf && senderName ? senderName : existing?.peerName || "";

          if (!existing || ts >= existing.timestamp) {
            threadsMap.set(tid, {
              threadId: tid,
              threadType: msg.threadType || (msg.isGroup ? "group" : "dm"),
              senderName,
              peerName,
              senderId: String(msg.senderId || ""),
              isSelf,
              text: cleanMessageSnippet(msg.text, msg.type),
              type: msg.type || "text",
              timestamp: ts,
            });
          } else if (existing && !existing.peerName && peerName) {
            existing.peerName = peerName;
          }
        } catch {}
      }
    } catch (err) {
      console.error("[ZALO_HISTORY_READ_ERROR]", filePath, err.message);
    }
  }

  return threadsMap;
}

/**
 * Định dạng nhãn thời gian chuẩn xác giống Zalo PC ("Vài giây", "9 phút", "8 giờ", "Hôm qua", "DD/MM")
 */
function formatZaloTimeLabel(timestamp) {
  if (!timestamp || timestamp <= 0) return "Danh bạ";
  let rawTs = Number(timestamp) || 0;
  const ts = rawTs > 2e12 ? Math.floor(rawTs / 1000) : rawTs < 1e11 ? rawTs * 1000 : rawTs;
  const nowMs = Date.now();
  const diffMs = Math.max(0, nowMs - ts);
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Vài giây";
  if (diffMins < 60) return `${diffMins} phút`;

  const date = new Date(ts);
  const now = new Date(nowMs);
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const diffHours = Math.floor(diffMins / 60);
  if (isToday && diffHours < 12) {
    return `${diffHours} giờ`;
  }
  if (isToday) {
    const hours = String(date.getHours()).padStart(2, "0");
    const mins = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${mins}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) return "Hôm qua";

  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${d}/${m}`;
}

export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const reqHeaders = await headers();
    const guard = guardApiRequest(cookieStore, reqHeaders, {
      allowedRoles: ["ADMIN", "SALE_LEADER", "SALE", "CSKH"],
      moduleKey: "inbox",
      resourceType: "conversations",
    });
    if (!guard.ok) {
      return guard.response;
    }

    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get("refresh") === "1";

    // Lấy danh sách TẤT CẢ các tài khoản Zalo Cá Nhân đang kết nối (Sơn Tùng, Lê Quyên...)
    const discoveredAccounts = getAllActiveZaloHomes();
    const zaloAccountsToSync =
      discoveredAccounts.length > 0
        ? discoveredAccounts
        : [
            {
              accountId: "1781287338457243967",
              ownId: "1781287338457243967",
              slug: "default",
              name: "Sơn Tùng",
              displayName: "Sơn Tùng",
              accountName: "Zalo: Sơn Tùng",
              channelLabel: "Zalo Cá Nhân (Sơn Tùng)",
              homeDir: getActiveZaloHome(),
            },
          ];

    // 1. Đảm bảo daemon `mcp start --http` luôn chạy ngầm 24/7 cho mọi tài khoản Zalo đang kết nối
    for (const acc of zaloAccountsToSync) {
      ensureZaloMcpDaemon(acc.homeDir);
    }

    // 2. Đồng bộ song song Metadata + Tin nhắn của tất cả tài khoản Zalo & Hội thoại Fanpage FB
    const [zaloSyncResults, otherConversations] = await Promise.all([
      Promise.all(
        zaloAccountsToSync.map(async (acc) => {
          const meta = await syncZaloGroupsAndMetadata(acc.homeDir, forceRefresh);
          const effectiveOwnId = String(acc.ownId || meta.ownId || "");
          const threadsMap = getLatestThreadsFromAllHistories(acc.homeDir, effectiveOwnId);

          // Kích hoạt kiểm tra và tự động trả lời ngay lập tức cho tài khoản Zalo này nếu có tin nhắn mới từ khách (!isSelf)
          scanAndAutoReplyZaloHistories(acc.homeDir, effectiveOwnId).catch((err) => {
            console.error(`[Zalo AI Bot] Lỗi scan từ conversations API (${acc.displayName}):`, err.message);
          });

          return {
            acc,
            ownId: effectiveOwnId,
            friendMap: meta.friendMap,
            groupMap: meta.groupMap,
            pinnedSet: meta.pinnedSet,
            threadsMap,
          };
        })
      ),
      getOmnichannelConversations(forceRefresh),
    ]);

    const activeZaloConversations = [];
    const contactOnlyConversations = [];
    const connectedZaloAccounts = [];

    // 3. Xây dựng danh sách các cuộc hội thoại từ TẤT CẢ các tài khoản Zalo đã kết nối
    for (let accIdx = 0; accIdx < zaloSyncResults.length; accIdx++) {
      const { acc, ownId, friendMap, groupMap, pinnedSet, threadsMap } = zaloSyncResults[accIdx];
      const accountId = String(acc.accountId || ownId || acc.slug || `zalo_${accIdx}`);
      const displayName = acc.displayName || acc.name || "Zalo Cá Nhân";
      const accountName = `Zalo: ${displayName}`;
      const channelLabel = `Zalo Cá Nhân (${displayName})`;
      const channelBotMode = getChannelBotMode(accountId || ownId || displayName);
      const processedIds = new Set();
      let accActiveCount = 0;
      let accContactCount = 0;

      const activeThreads = Array.from(threadsMap.values()).sort(
        (a, b) => b.timestamp - a.timestamp || String(a.threadId).localeCompare(String(b.threadId))
      );

      for (const thread of activeThreads) {
        processedIds.add(thread.threadId);
        const isGroup = thread.threadType === "group" || groupMap.has(thread.threadId);
        let name = "";
        let avatar = "";
        let memberCount = 0;
        let phone = "";

        if (isGroup) {
          const g = groupMap.get(thread.threadId);
          name = g?.name || `Nhóm Zalo (${thread.threadId.slice(-4)})`;
          avatar = g?.avatar || "";
          memberCount = g?.memberCount || 0;
        } else {
          const f = friendMap.get(thread.threadId);
          if (String(thread.threadId) === String(ownId)) {
            name = `My Documents (${displayName})`;
          } else if (f) {
            name = f.displayName || f.zaloName || thread.peerName || "Khách Zalo";
            avatar = f.avatar || "";
            phone = f.phoneNumber || "";
          } else if (thread.peerName) {
            name = thread.peerName;
          } else if (thread.isSelf) {
            name = `My Documents (${displayName})`;
          } else {
            name = thread.senderName || `Khách Zalo (${thread.threadId.slice(-4)})`;
          }
        }

        let snippet = thread.text || "[Tin nhắn]";
        if (thread.isSelf) {
          snippet = `Bạn: ${snippet}`;
        } else if (isGroup && thread.senderName) {
          snippet = `${thread.senderName}: ${snippet}`;
        }

        const isPinned =
          pinnedSet.has(thread.threadId) ||
          name.startsWith("My Documents") ||
          name === "Nhóm Học Tập";

        const botStatus = isBotActiveForThread(thread.threadId, accountId || ownId || displayName);
        accActiveCount++;
        activeZaloConversations.push({
          id: thread.threadId,
          name,
          type: isGroup ? "GROUP" : "DIRECT",
          avatar,
          phone,
          memberCount,
          isPinned,
          lastMessage: snippet,
          lastActive: formatZaloTimeLabel(thread.timestamp),
          timestamp: thread.timestamp,
          channel: "ZALO_PERSONAL",
          accountId,
          accountOwnId: ownId,
          accountDisplayName: displayName,
          accountName,
          channelLabel,
          channelBotMode,
          botMode: botStatus.mode,
          isAccountLevelHuman: channelBotMode === "HUMAN",
          zaloHome: acc.homeDir,
          colorIndex: accIdx,
        });
      }

      for (const [gid, g] of groupMap.entries()) {
        if (!processedIds.has(gid)) {
          processedIds.add(gid);
          const isPinned = pinnedSet.has(gid) || g.name === "Nhóm Học Tập";
          const gBotStatus = isBotActiveForThread(gid, accountId || ownId || displayName);
          accContactCount++;
          contactOnlyConversations.push({
            id: gid,
            name: g.name || "Nhóm Zalo",
            type: "GROUP",
            avatar: g.avatar || "",
            memberCount: g.memberCount || 0,
            isPinned,
            isContactOnly: true,
            lastMessage: `Nhóm ${g.memberCount || 0} thành viên`,
            lastActive: "Danh bạ",
            timestamp: 0,
            channel: "ZALO_PERSONAL",
            accountId,
            accountOwnId: ownId,
            accountDisplayName: displayName,
            accountName,
            channelLabel,
            channelBotMode,
            botMode: gBotStatus.mode,
            isAccountLevelHuman: channelBotMode === "HUMAN",
            zaloHome: acc.homeDir,
            colorIndex: accIdx,
          });
        }
      }

      for (const [uid, f] of friendMap.entries()) {
        if (!processedIds.has(uid)) {
          processedIds.add(uid);
          const fBotStatus = isBotActiveForThread(uid, accountId || ownId || displayName);
          accContactCount++;
          contactOnlyConversations.push({
            id: uid,
            name: f.displayName || f.zaloName || "Bạn bè",
            type: "DIRECT",
            avatar: f.avatar || "",
            phone: f.phoneNumber || "",
            isPinned: pinnedSet.has(uid),
            isContactOnly: true,
            lastMessage: "Danh bạ Zalo",
            lastActive: "Danh bạ",
            timestamp: 0,
            channel: "ZALO_PERSONAL",
            accountId,
            accountOwnId: ownId,
            accountDisplayName: displayName,
            accountName,
            channelLabel,
            channelBotMode,
            botMode: fBotStatus.mode,
            isAccountLevelHuman: channelBotMode === "HUMAN",
            zaloHome: acc.homeDir,
            colorIndex: accIdx,
          });
        }
      }

      connectedZaloAccounts.push({
        accountId,
        ownId,
        name: displayName,
        displayName: `Zalo ${displayName}`,
        label: accountName,
        channelLabel,
        botMode: channelBotMode,
        homeDir: acc.homeDir,
        activeCount: accActiveCount,
        contactCount: accContactCount,
        totalCount: accActiveCount + accContactCount,
        colorIndex: accIdx,
      });
    }

    contactOnlyConversations.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return String(a.name).localeCompare(String(b.name), "vi");
    });

    // 6. Hợp nhất tất cả cuộc hội thoại có tin nhắn thật (Đa Zalo QR + Fanpage FB + Zalo OA)
    // Sắp xếp cố định theo thời gian thực giảm dần, khử hoàn toàn hiện tượng nhảy danh sách
    const allActive = [...activeZaloConversations, ...otherConversations].sort(
      (a, b) => b.timestamp - a.timestamp || String(a.id).localeCompare(String(b.id))
    );

    const combined = [...allActive, ...contactOnlyConversations];
    const connectedPages = getConnectedFacebookPages();

    return NextResponse.json({
      ok: true,
      total: combined.length,
      activeCount: allActive.length,
      connectedZaloAccounts,
      connectedPages,
      conversations: combined,
    });
  } catch (error) {
    console.error("[ZALO_CONV_EXCEPTION]", error);
    return NextResponse.json({ error: "Lỗi khi tải danh sách hội thoại Zalo." }, { status: 500 });
  }
}
