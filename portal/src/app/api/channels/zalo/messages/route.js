import { NextResponse } from "next/server";
import {
  runZaloCommand,
  getActiveZaloHome,
  getOwnIdForHome,
  ensureZaloMcpDaemon,
  getAllZaloHistoryFiles,
  processIncomingZaloMessageWithBot,
} from "../../../../../lib/zaloRunner.js";
import { getThreadMessages } from "@/lib/unifiedMessageRouter.js";
import fs from "fs";

/**
 * ADDP Omnichannel AI CRM — API Lịch Sử Tin Nhắn Đa Kênh Thật 100% (WBS-21 -> WBS-25)
 * Tuân thủ Điều 11 AGENTS.md: Trích xuất tin nhắn thật từ history.jsonl, crm-group-history.jsonl & Meta Graph API.
 * Tuyệt đối không mở kết nối WebSocket trùng lặp (tránh lỗi CLOSE_DUPLICATE 3000).
 */

function formatMessageTime(timestamp) {
  if (!timestamp) return { time: "Vừa xong", date: "Hôm nay" };
  let rawTs = Number(timestamp) || Date.now();
  const ts = rawTs > 2e12 ? Math.floor(rawTs / 1000) : rawTs < 1e11 ? rawTs * 1000 : rawTs;
  const d = new Date(ts);
  const now = new Date();
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");

  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();

  return {
    time: `${hours}:${mins}`,
    date: isToday ? "Hôm nay" : isYesterday ? "Hôm qua" : `${day}/${month}/${year}`,
  };
}

function getThreadMessagesFromAllHistories(zaloHome, threadId, ownId = "1781287338457243967") {
  const historyFiles = getAllZaloHistoryFiles(zaloHome);
  const messages = [];
  const seenIds = new Set();

  for (const filePath of historyFiles) {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed);
          if (String(msg.threadId) !== String(threadId)) continue;

          const rawTs = Number(msg.timestamp) || Date.now();
          const ts = rawTs > 2e12 ? Math.floor(rawTs / 1000) : rawTs < 1e11 ? rawTs * 1000 : rawTs;
          const id = String(msg.msgId || msg.cliMsgId || `${ts}_${messages.length}`);
          if (seenIds.has(id)) continue;
          seenIds.add(id);

          const { time, date } = formatMessageTime(ts);
          const isMe = Boolean(msg.isSelf || (ownId && String(msg.senderId) === String(ownId)));

          messages.push({
            id,
            text: msg.text || (msg.type === "chat.photo" ? "[Hình ảnh]" : "[Tin nhắn]"),
            senderId: String(msg.senderId || ""),
            senderName: msg.senderName || (isMe ? "Sơn Tùng" : "Khách"),
            isMe,
            timestamp: ts,
            time,
            date,
            type: msg.type || "text",
            status: "sent",
          });
        } catch {}
      }
    } catch (err) {
      console.error("[ZALO_MESSAGES_HISTORY_READ_ERROR]", filePath, err.message);
    }
  }

  messages.sort((a, b) => a.timestamp - b.timestamp || String(a.id).localeCompare(String(b.id)));
  return messages;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const threadId = searchParams.get("threadId");
    const channel = searchParams.get("channel") || "";
    const pageId = searchParams.get("pageId") || "";

    if (!threadId) {
      return NextResponse.json({ error: "Thiếu tham số threadId." }, { status: 400 });
    }

    // 1. Nếu là hội thoại Fanpage Facebook (t_xxx hoặc channel === FACEBOOK) -> Lấy trực tiếp từ Meta Graph API
    if (channel === "FACEBOOK" || String(threadId).startsWith("t_")) {
      const fbMsgs = await getThreadMessages(threadId, "FACEBOOK", pageId);
      const formatted = fbMsgs.map((m) => {
        const { time, date } = formatMessageTime(m.timestamp);
        return {
          id: m.id,
          text: m.text,
          senderId: m.senderId,
          senderName: m.senderName,
          isMe: m.isMe,
          timestamp: m.timestamp,
          time,
          date,
          type: m.type || "text",
          mediaUrl: m.mediaUrl,
          status: "sent",
        };
      });

      return NextResponse.json({
        ok: true,
        source: "facebook_graph",
        threadId,
        count: formatted.length,
        messages: formatted,
      });
    }

    const targetHome = getActiveZaloHome();
    const ownId = getOwnIdForHome(targetHome);
    ensureZaloMcpDaemon(targetHome);

    // 2. Ưu tiên đọc lịch sử tin nhắn thật từ tất cả các file history JSONL (siêu tốc <5ms)
    const localMessages = getThreadMessagesFromAllHistories(targetHome, threadId, ownId);

    // 3. Kèm theo tin nhắn vừa gửi từ CRM trong phiên làm việc (Unified Message Router)
    const omniMsgs = await getThreadMessages(threadId, channel, pageId);
    const seenIds = new Set(localMessages.map((m) => String(m.id)));
    for (const m of omniMsgs) {
      if (!seenIds.has(String(m.id))) {
        const { time, date } = formatMessageTime(m.timestamp);
        localMessages.push({
          id: String(m.id),
          text: m.text,
          senderId: m.senderId,
          senderName: m.senderName,
          isMe: m.isMe,
          timestamp: m.timestamp,
          time,
          date,
          type: m.type || "text",
          mediaUrl: m.mediaUrl,
          status: "sent",
        });
      }
    }

    if (localMessages.length > 0) {
      localMessages.sort((a, b) => a.timestamp - b.timestamp);

      // Nếu tin nhắn mới nhất là của khách hàng (!isMe) vừa gửi đến trong 15 phút gần đây -> Chạy luồng AI Bot Dược sĩ Thảo
      const lastMsg = localMessages[localMessages.length - 1];
      if (
        lastMsg &&
        !lastMsg.isMe &&
        searchParams.get("type") !== "GROUP" &&
        String(threadId) !== String(ownId) &&
        Date.now() - Number(lastMsg.timestamp || 0) < 15 * 60 * 1000
      ) {
        processIncomingZaloMessageWithBot({
          msgId: lastMsg.id,
          threadId,
          senderName: lastMsg.senderName || "Khách Zalo",
          text: lastMsg.text,
          isMe: false,
          type: "DIRECT",
          channelId: channel || "ZALO_PERSONAL",
          conversationHistory: localMessages.slice(-8),
          homeDir: targetHome,
        }).catch((err) => {
          console.error("[Zalo AI Bot] Lỗi xử lý tại messages API:", err.message);
        });
      }

      return NextResponse.json({
        ok: true,
        source: "realtime_history",
        threadId,
        count: localMessages.length,
        messages: localMessages,
      });
    }

    // 4. Nếu là Nhóm Zalo mà chưa kịp đồng bộ -> Gọi `group history` qua HTTP REST (không chạm WebSocket)
    if (searchParams.get("type") === "GROUP") {
      const gRes = await runZaloCommand(["group", "history", threadId, "-n", "30", "--json"], {
        homeDir: targetHome,
        timeout: 10000,
      });
      if (gRes.ok && Array.isArray(gRes.data?.messages)) {
        const formatted = gRes.data.messages.map((m) => {
          const ts = Number(m.timestamp) || Date.now();
          const { time, date } = formatMessageTime(ts);
          const isMe = Boolean(m.isSelf);
          return {
            id: String(m.msgId || m.cliMsgId || ts),
            text: typeof m.content === "string" ? m.content : "[Tệp đính kèm]",
            senderId: String(m.fromUid || ""),
            senderName: isMe ? "Sơn Tùng" : `Thành viên (${String(m.fromUid || "").slice(-4)})`,
            isMe,
            timestamp: ts,
            time,
            date,
            type: m.msgType || "text",
            status: "sent",
          };
        });
        formatted.sort((a, b) => a.timestamp - b.timestamp);
        return NextResponse.json({
          ok: true,
          source: "group_http_history",
          threadId,
          count: formatted.length,
          messages: formatted,
        });
      }
    }

    return NextResponse.json({ ok: true, threadId, count: 0, messages: [] });
  } catch (error) {
    console.error("[ZALO_MESSAGES_EXCEPTION]", error);
    return NextResponse.json({ error: "Lỗi khi tải lịch sử tin nhắn." }, { status: 500 });
  }
}
