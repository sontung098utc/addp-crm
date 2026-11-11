import { NextResponse } from "next/server";
import {
  runZaloCommand,
  getOwnIdForHome,
  getActiveZaloAccountName,
  resolveZaloHomeForThread,
  ensureZaloMcpDaemon,
  getAllZaloHistoryFiles,
  getZaloSyncStatus,
} from "../../../../../lib/zaloRunner.js";
import { getThreadMessages } from "@/lib/unifiedMessageRouter.js";
import fs from "fs";
import path from "path";

/**
 * ADDP Omnichannel AI CRM — API Lịch Sử Tin Nhắn Đa Kênh Thật 100% (WBS-21 -> WBS-25)
 * Tuân thủ Điều 11 AGENTS.md: Trích xuất tin nhắn thật từ history.jsonl, crm-group-history.jsonl & Meta Graph API.
 * Tuyệt đối không mở kết nối WebSocket trùng lặp (tránh lỗi CLOSE_DUPLICATE 3000).
 */

function formatMessageTime(timestamp) {
  if (!timestamp || Number(timestamp) <= 0) return { time: "", date: "Lịch sử cũ" };
  let rawTs = Number(timestamp) || 0;
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

function getThreadMessagesFromAllHistories(zaloHome, threadId, ownId = "1781287338457243967", selfSenderName = "Sơn Tùng") {
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

          const rawTs = Number(msg.timestamp) || 0;
          const ts =
            rawTs > 2e12 ? Math.floor(rawTs / 1000) : rawTs > 0 && rawTs < 1e11 ? rawTs * 1000 : rawTs;
          const id = String(msg.msgId || msg.cliMsgId || `${ts}_${messages.length}`);
          if (seenIds.has(id)) continue;
          seenIds.add(id);

          const { time, date } = formatMessageTime(ts);
          const isMe = Boolean(msg.isSelf || (ownId && String(msg.senderId) === String(ownId)));

          messages.push({
            id,
            text: msg.text || (msg.type === "chat.photo" ? "[Hình ảnh]" : "[Tin nhắn]"),
            senderId: String(msg.senderId || ""),
            senderName: msg.senderName || (isMe ? selfSenderName : "Khách"),
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
    const accountId = searchParams.get("accountId") || "";
    const homeDirParam = searchParams.get("homeDir") || "";

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

    const resolvedAcc = resolveZaloHomeForThread(threadId, homeDirParam, accountId);
    const targetHome = resolvedAcc.homeDir;
    const ownId = resolvedAcc.ownId || getOwnIdForHome(targetHome);
    const selfName = resolvedAcc.displayName || getActiveZaloAccountName(targetHome);
    if (!getZaloSyncStatus(targetHome).isSyncing) {
      ensureZaloMcpDaemon(targetHome);
    }

    // 2. Ưu tiên đọc lịch sử tin nhắn thật từ các file history JSONL của đúng tài khoản Zalo này
    const localMessages = getThreadMessagesFromAllHistories(targetHome, threadId, ownId, selfName);

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

      return NextResponse.json({
        ok: true,
        source: "realtime_history",
        threadId,
        count: localMessages.length,
        messages: localMessages,
        syncStatus: getZaloSyncStatus(targetHome),
      });
    }

    const syncStatus = getZaloSyncStatus(targetHome);

    // 4. Nếu là Nhóm Zalo mà chưa kịp đồng bộ -> Gọi `group history` qua HTTP REST (không chạm WebSocket) và lưu luôn vào crm-group-history.jsonl
    if (searchParams.get("type") === "GROUP") {
      const gRes = await runZaloCommand(["group", "history", threadId, "-n", "50", "--json"], {
        homeDir: targetHome,
        timeout: 20000,
      });
      if (gRes.ok && Array.isArray(gRes.data?.messages) && gRes.data.messages.length > 0) {
        const friendNames = new Map();
        try {
          const metaPath = path.join(targetHome, ".zalo-agent-cli", "crm-meta-cache.json");
          if (fs.existsSync(metaPath)) {
            const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
            for (const f of meta?.friends || []) {
              if (f?.userId) friendNames.set(String(f.userId), f.displayName || f.zaloName || "");
            }
          }
        } catch {}

        const toPersist = [];
        const formatted = gRes.data.messages.map((m) => {
          const rawTs = Number(m.timestamp) || Date.now();
          const ts = rawTs > 2e12 ? Math.floor(rawTs / 1000) : rawTs < 1e11 ? rawTs * 1000 : rawTs;
          const { time, date } = formatMessageTime(ts);
          const fromUid = String(m.fromUid || "");
          const isMe = Boolean(m.isSelf || (ownId && fromUid === String(ownId)));
          const senderName = isMe
            ? selfName
            : friendNames.get(fromUid) || `Thành viên (${fromUid.slice(-4)})`;
          const text =
            typeof m.content === "string"
              ? m.content
              : m.content?.title || m.content?.href || "[Tệp đính kèm]";
          const id = String(m.msgId || m.cliMsgId || ts);

          toPersist.push({
            msgId: id,
            cliMsgId: m.cliMsgId ? String(m.cliMsgId) : null,
            threadId: String(threadId),
            threadType: "group",
            senderId: isMe && ownId ? String(ownId) : fromUid,
            senderName,
            isSelf: isMe,
            text,
            timestamp: ts,
            type: m.msgType || (typeof m.content === "string" ? "text" : "attachment"),
          });

          return {
            id,
            text,
            senderId: fromUid,
            senderName,
            isMe,
            timestamp: ts,
            time,
            date,
            type: m.msgType || "text",
            status: "sent",
          };
        });

        try {
          const groupHistoryPath = path.join(targetHome, ".zalo-agent-cli", "crm-group-history.jsonl");
          fs.mkdirSync(path.dirname(groupHistoryPath), { recursive: true });
          const persistLines = toPersist
            .sort((a, b) => a.timestamp - b.timestamp)
            .map((item) => JSON.stringify(item))
            .join("\n") + "\n";
          fs.appendFileSync(groupHistoryPath, persistLines, "utf8");
        } catch {}

        formatted.sort((a, b) => a.timestamp - b.timestamp);
        return NextResponse.json({
          ok: true,
          source: "group_http_history",
          threadId,
          count: formatted.length,
          messages: formatted,
          syncStatus,
        });
      }
    }

    return NextResponse.json({ ok: true, threadId, count: 0, messages: [], syncStatus });
  } catch (error) {
    console.error("[ZALO_MESSAGES_EXCEPTION]", error);
    return NextResponse.json({ error: "Lỗi khi tải lịch sử tin nhắn." }, { status: 500 });
  }
}
