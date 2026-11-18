import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import {
  guardApiRequest,
  isChannelScopeRestricted,
  isConversationAllowedForStaff,
} from "@/lib/rbac.js";
import { listAllChannels } from "@/lib/connectionHub.js";
import {
  runZaloCommand,
  getOwnIdForHome,
  getActiveZaloAccountName,
  resolveZaloHomeForThread,
  ensureZaloMcpDaemon,
  getAllZaloHistoryFiles,
  getZaloSyncStatus,
  startZaloRealtimeAiWatcher,
  scanAndAutoReplyZaloHistories,
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

if (!globalThis.__ADDP_ZALO_MSG_INDEX__) {
  globalThis.__ADDP_ZALO_MSG_INDEX__ = new Map();
}
if (!globalThis.__ZALO_HISTORY_PARSED_CACHE__) {
  globalThis.__ZALO_HISTORY_PARSED_CACHE__ = globalThis.__ADDP_ZALO_MSG_INDEX__;
}
if (!globalThis.__ADDP_ZALO_RESOLVED_ACC_CACHE__) {
  globalThis.__ADDP_ZALO_RESOLVED_ACC_CACHE__ = new Map();
}
if (!globalThis.__ADDP_ZALO_HIST_FILES_CACHE__) {
  globalThis.__ADDP_ZALO_HIST_FILES_CACHE__ = new Map();
}
if (!globalThis.__ADDP_ZALO_BG_THROTTLE__) {
  globalThis.__ADDP_ZALO_BG_THROTTLE__ = new Map();
}

function getCachedHistoryFiles(zaloHome, includeAllHomes = false, forceRefresh = false) {
  const key = `${zaloHome || "__DEFAULT__"}::${includeAllHomes ? "ALL" : "OWN"}`;
  const now = Date.now();
  const cached = globalThis.__ADDP_ZALO_HIST_FILES_CACHE__.get(key);
  if (!forceRefresh && cached && now - cached.ts < 15000) {
    return cached.files;
  }
  const files = getAllZaloHistoryFiles(zaloHome, includeAllHomes);
  globalThis.__ADDP_ZALO_HIST_FILES_CACHE__.set(key, { ts: now, files });
  return files;
}

function getCachedResolvedAccount(threadId, homeDirParam = "", accountId = "", forceRefresh = false) {
  const key = `${threadId || ""}::${homeDirParam || ""}::${accountId || ""}`;
  const now = Date.now();
  const cached = globalThis.__ADDP_ZALO_RESOLVED_ACC_CACHE__.get(key);
  if (!forceRefresh && cached && now - cached.ts < 30000) {
    return cached.value;
  }
  const resolvedAcc = resolveZaloHomeForThread(threadId, homeDirParam, accountId);
  const targetHome = resolvedAcc.homeDir;
  const ownId = resolvedAcc.ownId || getOwnIdForHome(targetHome);
  const selfName = resolvedAcc.displayName || getActiveZaloAccountName(targetHome);
  const value = {
    resolvedAcc,
    targetHome,
    ownId,
    selfName,
  };
  globalThis.__ADDP_ZALO_RESOLVED_ACC_CACHE__.set(key, { ts: now, value });
  return value;
}

function normalizeRawHistoryEntry(msg, fallbackIndex = 0) {
  const rawTs = Number(msg.timestamp) || 0;
  const ts =
    rawTs > 2e12 ? Math.floor(rawTs / 1000) : rawTs > 0 && rawTs < 1e11 ? rawTs * 1000 : rawTs;
  const id = String(msg.msgId || msg.cliMsgId || `${ts}_${fallbackIndex}`);
  const { time, date } = formatMessageTime(ts);

  let rawText = msg.text || (msg.type === "chat.photo" ? "[Hình ảnh]" : "[Tin nhắn]");
  const isRecalled =
    Boolean(msg.recalled) ||
    (rawText &&
      (String(rawText).startsWith("[chat.undo") ||
        String(rawText).startsWith("[chat.delete") ||
        String(rawText).includes("chat.undo") ||
        String(rawText).includes("chat.delete")));

  if (isRecalled) {
    rawText = "Tin nhắn đã được thu hồi";
  } else if (
    typeof rawText === "string" &&
    (/^#[A-Za-z0-9+/=]+=\d+,\d+$/.test(rawText) ||
      (rawText.startsWith("#") && rawText.includes("=") && rawText.length > 20))
  ) {
    rawText = "[Nhãn dán]";
  } else if (rawText && typeof rawText === "string" && rawText.startsWith("{") && rawText.endsWith("}")) {
    try {
      const p = JSON.parse(rawText);
      if (p.actionType || p.deleteMsg !== undefined || p.globalMsgId) {
        rawText = "Tin nhắn đã được thu hồi";
      }
    } catch {}
  }

  return {
    id,
    msgId: String(msg.msgId || id),
    cliMsgId: String(msg.cliMsgId || ""),
    text: rawText,
    isRecalled: Boolean(isRecalled),
    edited: Boolean(msg.edited),
    senderId: String(msg.senderId || ""),
    rawSenderName: String(msg.senderName || ""),
    rawIsSelf: Boolean(msg.isSelf),
    timestamp: ts,
    time,
    date,
    type: msg.type || "text",
    status: "sent",
  };
}

/**
 * Chỉ mục RAM theo từng file history.jsonl (kiểm tra mtimeMs + size) ánh xạ trực tiếp `threadId -> messages[]`
 * giúp truy xuất lịch sử hội thoại trong < 5ms mà không cần đọc đĩa hay JSON.parse lại toàn bộ file trên mỗi cú click.
 */
function getFileThreadIndexCached(filePath) {
  try {
    const st = fs.statSync(filePath);
    const todayKey = new Date().toDateString();
    const cached = globalThis.__ADDP_ZALO_MSG_INDEX__.get(filePath);
    if (
      cached &&
      cached.mtimeMs === st.mtimeMs &&
      cached.size === st.size &&
      cached.dayKey === todayKey &&
      cached.byThread instanceof Map
    ) {
      return cached.byThread;
    }

    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n");
    const byThread = new Map();
    let idx = 0;

    const pushToBucket = (key, item) => {
      if (!key) return;
      let bucket = byThread.get(key);
      if (!bucket) {
        bucket = [];
        byThread.set(key, bucket);
      }
      bucket.push(item);
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed);
        idx++;
        const msgTid = String(msg.threadId || "").trim();
        const msgTidClean = msgTid.replace(/^[gu]_/, "");
        const msgSenderId = String(msg.senderId || msg.fromId || msg.uidFrom || "").trim();
        const msgRecipientId = String(msg.recipientId || msg.dId || msg.toId || "").trim();

        if (!msgTid && !msgSenderId && !msgRecipientId) continue;

        const normalized = normalizeRawHistoryEntry(msg, idx);
        const keys = new Set();
        if (msgTid) keys.add(msgTid);
        if (msgTidClean) keys.add(msgTidClean);
        if (msg.threadType === "dm") {
          if (msgSenderId) keys.add(msgSenderId);
          if (msgRecipientId) keys.add(msgRecipientId);
        }

        for (const k of keys) {
          pushToBucket(k, normalized);
        }
      } catch {}
    }

    globalThis.__ADDP_ZALO_MSG_INDEX__.set(filePath, {
      mtimeMs: st.mtimeMs,
      size: st.size,
      dayKey: todayKey,
      byThread,
    });
    return byThread;
  } catch (err) {
    console.error("[ZALO_MESSAGES_HISTORY_READ_ERROR]", filePath, err.message);
    return new Map();
  }
}

function getThreadMessagesFromAllHistories(
  zaloHome,
  threadId,
  ownId = "1781287338457243967",
  selfSenderName = "Sơn Tùng",
  includeAllHomes = false,
  forceRefresh = false
) {
  const historyFiles = getCachedHistoryFiles(zaloHome, includeAllHomes, forceRefresh);
  const messages = [];
  const seenIds = new Set();
  const tid = String(threadId || "").trim();
  const tidClean = tid.replace(/^[gu]_/, "");

  for (const filePath of historyFiles) {
    const byThread = getFileThreadIndexCached(filePath);
    const bucketA = byThread.get(tid) || [];
    const bucketB = tidClean && tidClean !== tid ? byThread.get(tidClean) || [] : [];
    const candidates = bucketB.length > 0 ? [...bucketA, ...bucketB] : bucketA;

    for (const item of candidates) {
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);

      const isMe = Boolean(item.rawIsSelf || (ownId && item.senderId === String(ownId)));
      messages.push({
        id: item.id,
        msgId: item.msgId,
        cliMsgId: item.cliMsgId,
        text: item.text,
        isRecalled: item.isRecalled,
        edited: item.edited,
        senderId: item.senderId,
        senderName: item.rawSenderName || (isMe ? selfSenderName : "Khách"),
        isMe,
        timestamp: item.timestamp,
        time: item.time,
        date: item.date,
        type: item.type,
        status: "sent",
      });
    }
  }

  messages.sort((a, b) => a.timestamp - b.timestamp || String(a.id).localeCompare(String(b.id)));
  return messages;
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
    const threadId = searchParams.get("threadId");
    const channel = searchParams.get("channel") || "";
    const pageId = searchParams.get("pageId") || "";
    const accountId = searchParams.get("accountId") || "";
    const shopId = searchParams.get("shopId") || "";
    const homeDirParam = searchParams.get("homeDir") || "";
    const sinceParam = Math.max(0, Number(searchParams.get("since")) || 0);
    const beforeParam = Math.max(0, Number(searchParams.get("before")) || 0);
    const limitParam = Math.min(500, Math.max(10, Number(searchParams.get("limit")) || 100));
    const forceRefresh = searchParams.get("refresh") === "1";

    if (!threadId) {
      return NextResponse.json({ error: "Thiếu tham số threadId." }, { status: 400 });
    }

    if (isChannelScopeRestricted(guard.staff) && (pageId || accountId || shopId)) {
      const allowed = isConversationAllowedForStaff(
        guard.staff,
        { pageId, accountId, shopId },
        listAllChannels()
      );
      if (!allowed) {
        return NextResponse.json(
          { error: "Từ chối truy cập (RBAC): Bạn chưa được phân quyền tài khoản kênh này." },
          { status: 403 }
        );
      }
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

    // 1b. Nếu là hội thoại TikTok Shop -> Lấy từ TikTok Customer Service Open API + lịch sử đã đồng bộ
    const channelUpper = String(channel || "").toUpperCase();
    const threadStr = String(threadId || "").trim();
    const customerNameHint =
      searchParams.get("name") ||
      searchParams.get("customerName") ||
      "";
    const isShopee =
      channelUpper === "SHOPEE" ||
      threadStr.toLowerCase().startsWith("shopee_");

    if (isShopee) {
      const spMsgs = await getThreadMessages(
        threadId,
        "SHOPEE",
        accountId || pageId,
        customerNameHint
      );
      const formatted = spMsgs.map((m) => {
        const { time, date } = formatMessageTime(m.timestamp);
        return {
          id: m.id,
          text: m.text,
          sender: m.sender || (m.isMe ? "STAFF" : "CUSTOMER"),
          senderId: m.senderId,
          senderName: m.senderName,
          isMe: Boolean(m.isMe || m.sender === "STAFF"),
          timestamp: m.timestamp,
          time: m.time || time,
          date: m.date || date,
          type: m.type || "text",
          mediaUrl: m.mediaUrl || null,
          status: "sent",
        };
      });

      return NextResponse.json({
        ok: true,
        source: "shopee",
        threadId,
        count: formatted.length,
        messages: formatted,
      });
    }

    const isTikTok =
      channelUpper === "TIKTOK_SHOP" ||
      channelUpper === "TIKTOK" ||
      threadStr.toLowerCase().startsWith("tiktok_") ||
      threadStr.toLowerCase().startsWith("tt_");

    if (isTikTok) {
      const ttMsgs = await getThreadMessages(
        threadId,
        "TIKTOK_SHOP",
        accountId || pageId,
        customerNameHint
      );
      const formatted = ttMsgs.map((m) => {
        const { time, date } = formatMessageTime(m.timestamp);
        return {
          id: m.id,
          text: m.text,
          sender: m.sender || (m.isMe ? "STAFF" : "CUSTOMER"),
          senderId: m.senderId,
          senderName: m.senderName,
          isMe: Boolean(m.isMe || m.sender === "STAFF"),
          timestamp: m.timestamp,
          time: m.time || time,
          date: m.date || date,
          type: m.type || "text",
          mediaUrl: m.mediaUrl || null,
          status: "sent",
        };
      });

      return NextResponse.json({
        ok: true,
        source: "tiktok_shop",
        threadId,
        count: formatted.length,
        messages: formatted,
      });
    }

    const { resolvedAcc, targetHome, ownId, selfName } = getCachedResolvedAccount(
      threadId,
      homeDirParam,
      accountId,
      forceRefresh
    );
    if (
      isChannelScopeRestricted(guard.staff) &&
      !isConversationAllowedForStaff(
        guard.staff,
        { accountId: resolvedAcc.accountId, ownId },
        listAllChannels()
      )
    ) {
      return NextResponse.json(
        { error: "Từ chối truy cập (RBAC): Bạn chưa được phân quyền tài khoản Zalo này." },
        { status: 403 }
      );
    }

    const getCachedSyncStatusFast = () => {
      const syncKey = `sync::${targetHome || ""}`;
      const now = Date.now();
      const cachedSync = globalThis.__ADDP_ZALO_BG_THROTTLE__.get(syncKey);
      if (!forceRefresh && cachedSync && now - cachedSync.ts < 3000) {
        return cachedSync.status;
      }
      const status = getZaloSyncStatus(targetHome);
      globalThis.__ADDP_ZALO_BG_THROTTLE__.set(syncKey, { ts: now, status });
      return status;
    };

    if (sinceParam === 0) {
      const bgKey = `daemon::${targetHome || ""}`;
      const lastBgTs = Number(globalThis.__ADDP_ZALO_BG_THROTTLE__.get(bgKey) || 0);
      if (Date.now() - lastBgTs > 15000) {
        globalThis.__ADDP_ZALO_BG_THROTTLE__.set(bgKey, Date.now());
        setTimeout(() => {
          try {
            if (!getZaloSyncStatus(targetHome).isSyncing) {
              ensureZaloMcpDaemon(targetHome);
            }
            startZaloRealtimeAiWatcher();
            scanAndAutoReplyZaloHistories(targetHome, ownId).catch(() => {});
          } catch {}
        }, 0);
      }
    }

    // 2. Ưu tiên đọc lịch sử tin nhắn thật từ chỉ mục RAM (globalThis.__ADDP_ZALO_MSG_INDEX__) của đúng tài khoản Zalo này (< 5ms)
    let localMessages = getThreadMessagesFromAllHistories(
      targetHome,
      threadId,
      ownId,
      selfName,
      false,
      forceRefresh
    );

    // 2b. Nếu chưa thấy tin trong targetHome, quét toàn bộ file history của tất cả tài khoản Zalo trên hệ thống (fallback an toàn tuyệt đối)
    if (localMessages.length === 0) {
      localMessages = getThreadMessagesFromAllHistories(
        null,
        threadId,
        ownId,
        selfName,
        true,
        forceRefresh
      );
    }

    // 2c. Chỉ gọi live history qua Zalo CLI đồng bộ khi truyền refresh=1 (hoặc chạy ngầm không chặn GET khi chưa có tin)
    const threadType = searchParams.get("type") || "DIRECT";
    const isGroup = threadType === "GROUP";

    const fetchAndPersistLiveHistory = async () => {
      try {
        const fetchArgs = isGroup
          ? ["group", "history", threadId, "-n", "50", "--json"]
          : ["msg", "history", threadId, "-t", "0", "-n", "50", "--json"];

        const liveRes = await runZaloCommand(fetchArgs, {
          homeDir: targetHome,
          timeout: 6000,
        });

        if (liveRes.ok && Array.isArray(liveRes.data?.messages) && liveRes.data.messages.length > 0) {
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
          const fetchedMsgs = [];
          for (const m of liveRes.data.messages) {
            const rawTs = Number(m.timestamp) || Date.now();
            const ts = rawTs > 2e12 ? Math.floor(rawTs / 1000) : rawTs < 1e11 ? rawTs * 1000 : rawTs;
            const { time, date } = formatMessageTime(ts);
            const fromUid = String(m.fromUid || m.senderId || m.uidFrom || "");
            const isMe = Boolean(m.isSelf || (ownId && fromUid === String(ownId)));
            const senderName = isMe
              ? selfName
              : friendNames.get(fromUid) || m.senderName || (isGroup ? `Thành viên (${fromUid.slice(-4)})` : "Khách");
            let text =
              typeof m.content === "string"
                ? m.content
                : m.text || m.content?.title || m.content?.href || (m.msgType === "chat.photo" ? "[Hình ảnh]" : "[Tin nhắn]");

            const isRecalled =
              text &&
              (String(text).startsWith("[chat.undo") ||
                String(text).startsWith("[chat.delete") ||
                String(text).includes("chat.undo") ||
                String(text).includes("chat.delete"));

            if (isRecalled) {
              text = "Tin nhắn đã được thu hồi";
            } else if (
              typeof text === "string" &&
              (/^#[A-Za-z0-9+/=]+=\d+,\d+$/.test(text) ||
                (text.startsWith("#") && text.includes("=") && text.length > 20))
            ) {
              text = "[Nhãn dán]";
            } else if (text && typeof text === "string" && text.startsWith("{") && text.endsWith("}")) {
              try {
                const p = JSON.parse(text);
                if (p.actionType || p.deleteMsg !== undefined || p.globalMsgId) {
                  text = "Tin nhắn đã được thu hồi";
                }
              } catch {}
            }

            const id = String(m.msgId || m.cliMsgId || ts);

            toPersist.push({
              msgId: id,
              cliMsgId: m.cliMsgId ? String(m.cliMsgId) : null,
              threadId: String(threadId),
              threadType: isGroup ? "group" : "dm",
              senderId: isMe && ownId ? String(ownId) : fromUid,
              senderName,
              isSelf: isMe,
              text,
              timestamp: ts,
              type: m.msgType || (typeof m.content === "string" ? "text" : "attachment"),
            });

            fetchedMsgs.push({
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
            });
          }

          try {
            const saveFile = isGroup
              ? path.join(targetHome, ".zalo-agent-cli", "crm-group-history.jsonl")
              : path.join(targetHome, ".zalo-agent-cli", "history.jsonl");
            fs.mkdirSync(path.dirname(saveFile), { recursive: true });
            const linesToAppend = toPersist.map((item) => JSON.stringify(item)).join("\n") + "\n";
            fs.appendFileSync(saveFile, linesToAppend, "utf8");
            globalThis.__ADDP_ZALO_MSG_INDEX__.delete(path.resolve(saveFile));
          } catch {}

          return fetchedMsgs;
        }
      } catch (liveErr) {
        console.warn("[ZALO_LIVE_FETCH_HISTORY_WARN]", liveErr.message);
      }
      return [];
    };

    if (forceRefresh && localMessages.length === 0) {
      const liveFetched = await fetchAndPersistLiveHistory();
      if (liveFetched.length > 0) {
        localMessages.push(...liveFetched);
      }
    } else if (localMessages.length === 0 && sinceParam === 0) {
      const liveThrottleKey = `live::${targetHome || ""}::${threadId}`;
      const lastLiveAttempt = Number(globalThis.__ADDP_ZALO_BG_THROTTLE__.get(liveThrottleKey) || 0);
      if (Date.now() - lastLiveAttempt > 60000) {
        globalThis.__ADDP_ZALO_BG_THROTTLE__.set(liveThrottleKey, Date.now());
        setTimeout(() => {
          fetchAndPersistLiveHistory().catch(() => {});
        }, 0);
      }
    }

    // 3. Kèm theo tin nhắn vừa gửi từ CRM trong phiên làm việc (bỏ qua nếu là ZALO_PERSONAL đã có tin trong history)
    if (localMessages.length === 0 && channelUpper !== "ZALO_PERSONAL") {
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
    }

    const syncStatus = getCachedSyncStatusFast();

    if (localMessages.length > 0) {
      const totalCount = localMessages.length;
      const globalLatestTs = localMessages[totalCount - 1]?.timestamp || 0;

      if (sinceParam > 0) {
        const incrementalMsgs = localMessages.filter((m) => Number(m.timestamp) > sinceParam);
        return NextResponse.json({
          ok: true,
          source: "realtime_history",
          incremental: true,
          threadId,
          accountId: resolvedAcc.accountId,
          count: incrementalMsgs.length,
          totalCount,
          latestTimestamp: globalLatestTs,
          oldestTimestamp: incrementalMsgs[0]?.timestamp || 0,
          hasMore: false,
          messages: incrementalMsgs,
          syncStatus,
        });
      }

      const filtered = beforeParam > 0
        ? localMessages.filter((m) => Number(m.timestamp) < beforeParam)
        : localMessages;
      const sliced = filtered.slice(-limitParam);
      const hasMore = filtered.length > sliced.length;

      return NextResponse.json({
        ok: true,
        source: "realtime_history",
        incremental: false,
        threadId,
        accountId: resolvedAcc.accountId,
        count: sliced.length,
        totalCount,
        latestTimestamp: globalLatestTs,
        oldestTimestamp: sliced[0]?.timestamp || 0,
        hasMore,
        historyLimited: threadType !== "GROUP" && !hasMore,
        messages: sliced,
        syncStatus,
      });
    }

    const isDirectZalo = threadType !== "GROUP";
    return NextResponse.json({
      ok: true,
      source: "empty",
      threadId,
      accountId: resolvedAcc.accountId,
      count: 0,
      totalCount: 0,
      latestTimestamp: 0,
      oldestTimestamp: 0,
      hasMore: false,
      historyLimited: isDirectZalo,
      limitationReason: isDirectZalo
        ? "Zalo Web chỉ đồng bộ các tin nhắn DM phát sinh gần đây trên cloud; lịch sử cũ chỉ lưu cục bộ trên điện thoại không thể kéo từ cloud."
        : "",
      messages: [],
      syncStatus,
    });
  } catch (error) {
    console.error("[ZALO_MESSAGES_EXCEPTION]", error);
    return NextResponse.json({ error: "Lỗi khi tải lịch sử tin nhắn." }, { status: 500 });
  }
}
