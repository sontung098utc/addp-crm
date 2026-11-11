import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import {
  getActiveZaloHome,
  getAllActiveZaloHomes,
  ensureZaloMcpDaemon,
  stopAllZaloMcpDaemons,
  syncZaloGroupsAndMetadata,
  getAllZaloHistoryFiles,
  getZaloSyncStatus,
  scanAndAutoReplyZaloHistories,
} from "../../../../../lib/zaloRunner.js";
import {
  getOmnichannelConversations,
  getConnectedFacebookPages,
} from "@/lib/unifiedMessageRouter.js";
import { listAllChannels } from "@/lib/connectionHub.js";
import { getChannelBotMode, isBotActiveForThread } from "@/lib/botControlStore.js";
import { getAllConversationTags } from "@/lib/tagStore.js";
import { normalizePhone } from "@/lib/phone.js";
import { guardApiRequest } from "@/lib/rbac.js";
import { getStaffByIdOrCode } from "@/lib/auth.js";
import fs from "fs";

function attachConversationTags(conv, allThreadTags) {
  const byId = Array.isArray(allThreadTags[conv.id]) ? allThreadTags[conv.id] : [];
  const normPhone = normalizePhone(conv.phone || conv.zaloPhone || "");
  const byPhone = normPhone && Array.isArray(allThreadTags[normPhone]) ? allThreadTags[normPhone] : [];
  const existing = Array.isArray(conv.tags) ? conv.tags : [];
  const merged = Array.from(new Set([...byId, ...byPhone, ...existing].filter(Boolean)));
  return {
    ...conv,
    tags: merged,
  };
}

/**
 * ADDP Omnichannel AI CRM — API Danh Sách Hội Thoại Đa Kênh Thật 100% (WBS-21 -> WBS-25)
 * Tuân thủ Điều 11 AGENTS.md: Không dùng số liệu giả, 100% dữ liệu lấy từ Zalo Client, history.jsonl & Meta Graph API.
 * Đảm bảo thứ tự hội thoại ổn định tuyệt đối theo đúng thời gian tin nhắn thực tế (không nhảy danh sách).
 */

function buildSafeAvatarUrl(rawAvatar, type, id, name, pageId = "") {
  const safeName = encodeURIComponent(String(name || "").trim() || "Khách Hàng");
  const safeId = encodeURIComponent(String(id || ""));
  const safePageId = pageId ? `&pageId=${encodeURIComponent(pageId)}` : "";
  if (rawAvatar && typeof rawAvatar === "string" && rawAvatar.trim() && (rawAvatar.startsWith("http://") || rawAvatar.startsWith("https://") || rawAvatar.startsWith("//"))) {
    return `/api/media/avatar-proxy?url=${encodeURIComponent(rawAvatar.trim())}&type=${type}&id=${safeId}${safePageId}&name=${safeName}`;
  }
  return `/api/media/avatar-proxy?type=${type}&id=${safeId}${safePageId}&name=${safeName}`;
}

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

    const liveStaff =
      (guard.staff?.code || guard.staff?.id
        ? getStaffByIdOrCode(guard.staff.code || guard.staff.id)
        : null) || guard.staff;

    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get("refresh") === "1";

    // 1. Lấy danh sách TẤT CẢ các tài khoản Zalo Cá Nhân đang active trong cấu hình Channels (đồng bộ 100% với /channels)
    const systemActiveZaloChannels = listAllChannels().filter(
      (c) =>
        (c.platform === "ZALO_PERSONAL" ||
          c.type === "zalo_personal" ||
          c.channel_type === "zalo_personal" ||
          c.type === "zalo") &&
        c.status !== "DISCONNECTED" &&
        c.status !== "deleted" &&
        c.status !== "INACTIVE"
    );

    const hasChannelScope =
      liveStaff &&
      liveStaff.role !== "ADMIN" &&
      Array.isArray(liveStaff.assignedChannels);
    const allowedZaloSet = new Set(
      hasChannelScope ? liveStaff.assignedChannels.map((id) => String(id).trim()) : []
    );

    const activeChannels = hasChannelScope
      ? systemActiveZaloChannels.filter((c) => {
          const ownId = String(c.config?.ownId || c.externalId || "").trim();
          const chId = String(c.id || "").trim();
          return (ownId && allowedZaloSet.has(ownId)) || (chId && allowedZaloSet.has(chId));
        })
      : systemActiveZaloChannels;

    // 2. NẾU KHÔNG CÒN TÀI KHOẢN ZALO CÁ NHÂN NÀO ĐANG ACTIVE / ĐƯỢC PHÂN QUYỀN CHO NHÂN VIÊN:
    // Chỉ dừng daemon khi cả hệ thống thực sự có 0 nick Zalo đang kết nối; trả về connectedZaloAccounts: []
    if (activeChannels.length === 0) {
      if (systemActiveZaloChannels.length === 0) {
        stopAllZaloMcpDaemons();
      }

      const otherConversations = await getOmnichannelConversations(forceRefresh);
      const filteredOther = (otherConversations || [])
        .filter(
          (c) =>
            c.channel !== "ZALO_PERSONAL" &&
            c.channel !== "zalo" &&
            c.type !== "zalo_personal"
        )
        .sort(
          (a, b) => (b.timestamp || 0) - (a.timestamp || 0) || String(a.id).localeCompare(String(b.id))
        );

      const allThreadTags = getAllConversationTags();
      const combinedWithTags = filteredOther.map((conv) => attachConversationTags(conv, allThreadTags));

      return NextResponse.json({
        ok: true,
        total: combinedWithTags.length,
        activeCount: combinedWithTags.length,
        connectedZaloAccounts: [],
        connectedPages: getConnectedFacebookPages(),
        conversations: combinedWithTags,
      });
    }

    const activeZaloOwnIds = new Set(
      activeChannels.map((c) => String(c.config?.ownId || c.externalId || "")).filter(Boolean)
    );
    const activeZaloNames = new Set(
      activeChannels
        .map((c) => String(c.config?.accountName || c.config?.label || c.name || "").toLowerCase())
        .filter(Boolean)
    );

    const discoveredAccounts = getAllActiveZaloHomes();
    const zaloAccountsToSync = discoveredAccounts.filter((acc) => {
      const own = String(acc.ownId || acc.accountId || "");
      const name = String(acc.displayName || acc.name || "").toLowerCase();
      if (activeZaloOwnIds.size > 0 && activeZaloOwnIds.has(own)) return true;
      for (const an of activeZaloNames) {
        if (an && (name.includes(an) || an.includes(name))) return true;
      }
      return false;
    });

    // 3. Đảm bảo daemon `mcp start --http` chỉ chạy cho tài khoản Zalo đang thực sự active
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

          const syncStatus = getZaloSyncStatus(acc.homeDir);

          return {
            acc,
            ownId: effectiveOwnId,
            friendMap: meta.friendMap,
            groupMap: meta.groupMap,
            pinnedSet: meta.pinnedSet,
            threadsMap,
            syncStatus,
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
          avatar = g?.avatar || g?.avt || g?.fullAvt || g?.groupTopic?.avatar || "";
          memberCount = g?.memberCount || 0;
        } else {
          const f = friendMap.get(thread.threadId);
          if (String(thread.threadId) === String(ownId)) {
            name = `My Documents (${displayName})`;
          } else if (f) {
            name = f.displayName || f.zaloName || thread.peerName || "Khách Zalo";
            avatar = f.avatar || f.avatar_url || f.thumb || f.picture || f.avt || f.fullAvt || "";
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
        const safeAvatar = buildSafeAvatarUrl(
          avatar,
          isGroup ? "group" : "zalo",
          thread.threadId,
          name
        );
        activeZaloConversations.push({
          id: thread.threadId,
          name,
          type: isGroup ? "GROUP" : "DIRECT",
          avatar: safeAvatar,
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
          const safeAvatar = buildSafeAvatarUrl(
            g.avatar || g.avt || g.fullAvt || "",
            "group",
            gid,
            g.name || "Nhóm Zalo"
          );
          contactOnlyConversations.push({
            id: gid,
            name: g.name || "Nhóm Zalo",
            type: "GROUP",
            avatar: safeAvatar,
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
          const friendName = f.displayName || f.zaloName || "Bạn bè";
          const rawFriendAvatar = f.avatar || f.avatar_url || f.thumb || f.picture || f.avt || f.fullAvt || "";
          const safeAvatar = buildSafeAvatarUrl(rawFriendAvatar, "zalo", uid, friendName);
          const lastAct = Number(f.lastActionTime) || 0;
          const contactLastActive = lastAct > 0 ? formatZaloTimeLabel(lastAct) : "Danh bạ";
          contactOnlyConversations.push({
            id: uid,
            name: friendName,
            type: "DIRECT",
            avatar: safeAvatar,
            phone: f.phoneNumber || "",
            isPinned: pinnedSet.has(uid),
            isContactOnly: true,
            lastActionTime: lastAct,
            lastMessage: lastAct > 0 ? `Tương tác gần đây (${contactLastActive})` : "Danh bạ Zalo",
            lastActive: contactLastActive,
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

      // Chỉ đưa vào danh sách nếu tài khoản Zalo này có hoạt động (không hiển thị nick 0 tin nhắn đã ngắt kết nối)
      if (accActiveCount + accContactCount > 0 || zaloSyncResults[accIdx].syncStatus?.isSyncing) {
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
          syncStatus: zaloSyncResults[accIdx].syncStatus || { isSyncing: false },
          colorIndex: accIdx,
        });
      }
    }

    contactOnlyConversations.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      const actA = Number(a.lastActionTime) || 0;
      const actB = Number(b.lastActionTime) || 0;
      if (actA !== actB) return actB - actA;
      return String(a.name).localeCompare(String(b.name), "vi");
    });

    // 6. Hợp nhất tất cả cuộc hội thoại có tin nhắn thật (Đa Zalo QR + Fanpage FB + Zalo OA)
    // Sắp xếp cố định theo thời gian thực giảm dần, khử hoàn toàn hiện tượng nhảy danh sách
    const allActive = [...activeZaloConversations, ...otherConversations].sort(
      (a, b) => b.timestamp - a.timestamp || String(a.id).localeCompare(String(b.id))
    );

    const combined = [...allActive, ...contactOnlyConversations];
    const connectedPages = getConnectedFacebookPages();

    // Gắn thẻ tag đã lưu vào từng hội thoại (hỗ trợ cả threadId và SĐT chuẩn từ migrate)
    const allThreadTags = getAllConversationTags();
    const combinedWithTags = combined.map((conv) => attachConversationTags(conv, allThreadTags));

    const isAnyZaloSyncing = zaloSyncResults.some((r) => Boolean(r?.syncStatus?.isSyncing));
    const syncAccounts = zaloSyncResults.map((r) => ({
      name: r?.acc?.displayName || r?.acc?.name || "Zalo",
      ownId: r?.ownId || "",
      ...(r?.syncStatus || { isSyncing: false }),
    }));

    return NextResponse.json({
      ok: true,
      total: combinedWithTags.length,
      activeCount: allActive.length,
      connectedZaloAccounts,
      connectedPages,
      syncStatus: {
        isSyncing: isAnyZaloSyncing,
        accounts: syncAccounts,
      },
      conversations: combinedWithTags,
    });
  } catch (error) {
    console.error("[ZALO_CONV_EXCEPTION]", error);
    return NextResponse.json({ error: "Lỗi khi tải danh sách hội thoại Zalo." }, { status: 500 });
  }
}
