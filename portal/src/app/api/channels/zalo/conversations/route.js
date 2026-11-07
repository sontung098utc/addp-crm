import { NextResponse } from "next/server";
import {
  getActiveZaloHome,
  ensureZaloMcpDaemon,
  syncZaloGroupsAndMetadata,
  getAllZaloHistoryFiles,
} from "../../../../../lib/zaloRunner.js";
import {
  getOmnichannelConversations,
  getConnectedFacebookPages,
} from "@/lib/unifiedMessageRouter.js";
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
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get("refresh") === "1";
    const targetHome = getActiveZaloHome();

    // 1. Đảm bảo daemon `mcp start --http 3099` luôn chạy ngầm 24/7 để nhận tin nhắn realtime
    ensureZaloMcpDaemon(targetHome);

    // 2. Đồng bộ song song Metadata + Tin nhắn Nhóm Zalo (HTTP REST) & Hội thoại Fanpage FB
    const [{ ownId, friendMap, groupMap, pinnedSet }, otherConversations] = await Promise.all([
      syncZaloGroupsAndMetadata(targetHome, forceRefresh),
      getOmnichannelConversations(forceRefresh),
    ]);

    // 3. Đọc toàn bộ lịch sử tin nhắn thực tế sau khi worker đã cập nhật
    const threadsMap = getLatestThreadsFromAllHistories(targetHome, ownId);

    const activeZaloConversations = [];
    const contactOnlyConversations = [];
    const processedIds = new Set();

    // 4. Xây dựng danh sách các cuộc hội thoại Zalo có tin nhắn thực tế (timestamp > 0)
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
          name = "My Documents (Cloud của tôi)";
        } else if (f) {
          name = f.displayName || f.zaloName || thread.peerName || "Khách Zalo";
          avatar = f.avatar || "";
          phone = f.phoneNumber || "";
        } else if (thread.peerName) {
          name = thread.peerName;
        } else if (thread.isSelf) {
          name = "My Documents (Cloud của tôi)";
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
        accountName: "Zalo: Sơn Tùng",
        channelLabel: "Zalo Cá Nhân (Sơn Tùng)",
      });
    }

    // 5. Các nhóm & bạn bè trong danh bạ chưa có tin nhắn: đặt cố định ở cuối danh sách (timestamp = 0),
    // sắp xếp theo bảng chữ cái để tuyệt đối không bao giờ nhảy lên đầu danh sách hội thoại đang chat.
    for (const [gid, g] of groupMap.entries()) {
      if (!processedIds.has(gid)) {
        processedIds.add(gid);
        const isPinned = pinnedSet.has(gid) || g.name === "Nhóm Học Tập";
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
          accountName: "Zalo: Sơn Tùng",
          channelLabel: "Zalo Cá Nhân (Sơn Tùng)",
        });
      }
    }

    for (const [uid, f] of friendMap.entries()) {
      if (!processedIds.has(uid)) {
        processedIds.add(uid);
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
          accountName: "Zalo: Sơn Tùng",
          channelLabel: "Zalo Cá Nhân (Sơn Tùng)",
        });
      }
    }

    contactOnlyConversations.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return String(a.name).localeCompare(String(b.name), "vi");
    });

    // 6. Hợp nhất tất cả cuộc hội thoại có tin nhắn thật (Zalo + 3 Fanpage FB + Zalo OA)
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
      connectedPages,
      conversations: combined,
    });
  } catch (error) {
    console.error("[ZALO_CONV_EXCEPTION]", error);
    return NextResponse.json({ error: "Lỗi khi tải danh sách hội thoại Zalo." }, { status: 500 });
  }
}
