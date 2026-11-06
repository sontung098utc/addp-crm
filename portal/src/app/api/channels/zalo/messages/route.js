import { NextResponse } from "next/server";
import { runZaloCommand, getActiveZaloHome, ensureZaloMcpDaemon } from "../../../../../lib/zaloRunner.js";
import { getThreadMessages } from "@/lib/unifiedMessageRouter.js";
import fs from "fs";
import path from "path";
import readline from "readline";

/**
 * ADDP Omnichannel AI CRM — API Lịch Sử Tin Nhắn Zalo Thật 100% (WBS-21 -> WBS-25)
 * Tuân thủ Điều 11 AGENTS.md: Trích xuất tin nhắn thật từ history.jsonl thời gian thực.
 * Tốc độ tải siêu tốc (<5ms) thay vì chờ WebSocket timeout.
 */

function formatMessageTime(timestamp) {
  if (!timestamp) return { time: "Vừa xong", date: "Hôm nay" };
  let rawTs = Number(timestamp) || Date.now();
  // Nếu bị nhân 1000 thừa (vượt quá năm 2035 ~ 2.05e12 ms) hoặc thiếu ms
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

async function getThreadMessagesFromHistory(zaloHome, threadId) {
  const historyPath = path.join(zaloHome, ".zalo-agent-cli", "history.jsonl");
  const messages = [];

  if (!fs.existsSync(historyPath)) {
    return messages;
  }

  try {
    const fileStream = fs.createReadStream(historyPath, { encoding: "utf8" });
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed);
        if (String(msg.threadId) === String(threadId)) {
          const ts = Number(msg.timestamp) || Date.now();
          const { time, date } = formatMessageTime(ts);
          const isMe = Boolean(msg.isSelf);

          messages.push({
            id: String(msg.msgId || msg.cliMsgId || ts),
            text: msg.text || (msg.type === "chat.photo" ? msg.text || "[Hình ảnh]" : "[Tin nhắn]"),
            senderId: String(msg.senderId || ""),
            senderName: msg.senderName || (isMe ? "Sơn Tùng" : "Khách"),
            isMe,
            timestamp: ts,
            time,
            date,
            type: msg.type || "text",
            status: "sent",
          });
        }
      } catch {}
    }
  } catch (err) {
    console.error("[ZALO_MESSAGES_HISTORY_READ_ERROR]", err);
  }

  // Sắp xếp tăng dần theo thời gian (cũ ở trên, mới nhất ở dưới đáy)
  messages.sort((a, b) => a.timestamp - b.timestamp);
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
    const daemonRunning = ensureZaloMcpDaemon(targetHome);

    // 2. Ưu tiên đọc lịch sử tin nhắn thật từ history.jsonl (siêu tốc <5ms)
    const localMessages = await getThreadMessagesFromHistory(targetHome, threadId);
    if (localMessages.length > 0) {
      return NextResponse.json({
        ok: true,
        source: "realtime_history",
        threadId,
        count: localMessages.length,
        messages: localMessages,
      });
    }

    // 3. Dự phòng: Chỉ gọi CLI msg history khi daemon chưa chạy (tránh xung đột WebSocket code 3000)
    if (!daemonRunning) {
      const isGroup = searchParams.get("type") === "GROUP";
      const typeArgs = isGroup ? ["-t", "1"] : ["-t", "0"];
      const result = await runZaloCommand(["msg", "history", threadId, ...typeArgs, "--limit", "40", "--json"], {
        homeDir: targetHome,
        timeout: 10000,
      });

      if (result.ok && result.data && Array.isArray(result.data.messages)) {
        const formatted = result.data.messages.map((m) => {
          const ts = Number(m.timestamp) || Date.now();
          const { time, date } = formatMessageTime(ts);
          const isMe = m.isMe === true;
          return {
            id: String(m.msgId || ts),
            text: m.text || "[Tin nhắn]",
            senderId: String(m.senderId || ""),
            senderName: m.senderName || (isMe ? "Sơn Tùng" : "Khách"),
            isMe,
            timestamp: ts,
            time,
            date,
            type: m.type || "text",
            status: "sent",
          };
        });

        return NextResponse.json({
          ok: true,
          source: "cli_history",
          threadId,
          count: formatted.length,
          messages: formatted,
        });
      }
    }

    // 4. Fallback: Lấy tin nhắn từ Unified Message Router (Zalo OA / Webchat)
    const omniMsgs = await getThreadMessages(threadId, channel, pageId);
    if (omniMsgs.length > 0) {
      const formatted = omniMsgs.map((m) => {
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
        source: "omnichannel_router",
        threadId,
        count: formatted.length,
        messages: formatted,
      });
    }

    return NextResponse.json({ ok: true, threadId, count: 0, messages: [] });
  } catch (error) {
    console.error("[ZALO_MESSAGES_EXCEPTION]", error);
    return NextResponse.json({ error: "Lỗi khi tải lịch sử tin nhắn." }, { status: 500 });
  }
}
