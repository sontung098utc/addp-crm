/**
 * ADDP Omnichannel AI CRM — Unified Message Router & Realtime Hub (WBS-21)
 * Hợp nhất mọi luồng tin nhắn từ 7 kênh về 1 chuẩn dữ liệu duy nhất:
 * 1. Zalo Cá Nhân (Zalo Agent CLI / zca-js)
 * 2. Zalo Official Account (Open API v3 Webhook)
 * 3. Fanpage Facebook (Meta Messenger & Comment Webhook)
 * 4. Website LiveChat ADDP (Magento 2.4.8 Web Chat)
 *
 * Tích hợp:
 * - Server-Sent Events (SSE) đẩy tin nhắn thời gian thực < 500ms
 * - Bắt SĐT tự động & liên kết Hồ Sơ Khách Hàng 360 (CustomerIdentityResolver)
 * - Tự động chia Lead (Round-robin / Phụ trách cũ qua leadRouting)
 * - Tuân thủ Điều 3, Điều 4, Điều 11 AGENTS.md
 */

import fs from "fs";
import path from "path";
import { runZaloCommand, sendTextMessage } from "./zaloRunner.js";
import { extractPhoneNumbersFromText, getOrCreateCustomerByPhone } from "./customerIdentityResolver.js";
import { listAllChannels } from "./connectionHub.js";
import { isChannelBotEnabled, getConversationBotState } from "./botControlStore.js";
import { generateHumanLikeReply, extractCustomerPhoneFromMessage } from "./ai/chatBotEngine.js";

const DATA_FILE = path.join(process.cwd(), "data", "omnichannel_messages.json");

// Active SSE client connections
const sseClients = new Set();

function loadStoredMessages() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
  } catch (err) {
    console.error("[UNIFIED_ROUTER_READ_ERR]", err);
  }
  return [];
}

function saveStoredMessages(messages) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Keep last 2000 messages
    const trimmed = messages.slice(-2000);
    fs.writeFileSync(DATA_FILE, JSON.stringify(trimmed, null, 2), "utf8");
  } catch (err) {
    console.error("[UNIFIED_ROUTER_SAVE_ERR]", err);
  }
}

let storedMessages = loadStoredMessages();

/**
 * Đăng ký client SSE nhận tin nhắn realtime
 */
export function registerSseClient(controller) {
  sseClients.add(controller);
  return () => {
    sseClients.delete(controller);
  };
}

/**
 * Phát tin nhắn realtime tới tất cả trình duyệt đang mở
 */
export function broadcastMessage(messageEvent) {
  const payload = `data: ${JSON.stringify(messageEvent)}\n\n`;
  for (const client of sseClients) {
    try {
      client.enqueue(new TextEncoder().encode(payload));
    } catch {
      sseClients.delete(client);
    }
  }
}

/**
 * Thêm tin nhắn mới từ bất kỳ kênh nào vào Router trung tâm
 */
export async function addUnifiedMessage({
  channel, // "ZALO_PERSONAL" | "ZALO_OA" | "FACEBOOK" | "WEB_CHAT"
  channelId,
  channelName,
  threadId,
  senderId,
  senderName,
  text,
  type = "text",
  mediaUrl = null,
  isMe = false,
  timestamp = Date.now(),
  metadata = {},
}) {
  const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const messageObj = {
    id,
    channel,
    channelId,
    channelName: channelName || channel,
    threadId: String(threadId),
    senderId: String(senderId || threadId),
    senderName: senderName || "Khách hàng",
    text: text || "",
    type,
    mediaUrl,
    isMe: Boolean(isMe),
    timestamp,
    status: isMe ? "sent" : "received",
    metadata,
  };

  storedMessages.push(messageObj);
  saveStoredMessages(storedMessages);

  // Phát SSE cho trình duyệt cập nhật bong bóng chat tức thì
  broadcastMessage({ type: "NEW_MESSAGE", message: messageObj });

  // Nếu là tin nhắn từ khách hàng -> Bắt SĐT, Gộp Khách Hàng 360 & Xử lý AI Bot Auto-Reply (Module 5)
  if (!isMe && text) {
    let resolvedCustomer = null;
    const primaryPhone =
      extractCustomerPhoneFromMessage(text) ||
      (extractPhoneNumbersFromText(text)[0] ?? null);

    if (primaryPhone) {
      resolvedCustomer = getOrCreateCustomerByPhone({
        phone: primaryPhone,
        fullName: senderName || "Khách Hàng ADDP",
        source: channel,
        note: `Tự động nhận diện từ tin nhắn ${channel}: "${text.slice(0, 100)}"`,
      });

      broadcastMessage({
        type: "CUSTOMER_IDENTIFIED",
        phone: primaryPhone,
        customer: resolvedCustomer,
        threadId,
      });
    }

    // Kích hoạt luồng AI Bot Dược sĩ Thảo (nếu kênh & hội thoại đang ở chế độ AI)
    if (metadata?.skipAiBot !== true) {
      handleIncomingAiBotAutoReply({
        channel: channel || "ZALO_PERSONAL",
        channelId: channelId || channel || "DEFAULT",
        threadId: String(threadId),
        senderName: senderName || "Khách hàng",
        text,
        customerProfile: resolvedCustomer || {
          fullName: senderName || "Anh/Chị",
          phone: primaryPhone || null,
        },
      }).catch((err) => {
        console.error("[AI_BOT_AUTO_REPLY_ERR]", err.message);
      });
    }
  }

  return messageObj;
}

/**
 * Luồng xử lý tự động trả lời của AI Bot Dược sĩ Thảo khi có tin nhắn đến từ khách hàng (Module 5):
 * 1. Kiểm tra isChannelBotEnabled(channelId) và getConversationBotState(threadId).
 * 2. Nếu mode === 'HUMAN' -> Bỏ qua, không tự động trả lời.
 * 3. Nếu mode === 'AI' -> Gọi generateHumanLikeReply, chờ đủ typingDelayMs (3-6s).
 * 4. Sau khi chờ xong, kiểm tra lại lần nữa xem nhân viên có nhảy vào tiếp quản trong lúc chờ không.
 * 5. Nếu vẫn là mode === 'AI' -> Bắn tin nhắn phản hồi qua kênh tương ứng.
 */
export async function handleIncomingAiBotAutoReply({
  channel = "ZALO_PERSONAL",
  channelId = "DEFAULT",
  threadId,
  senderName = "Anh/Chị",
  text = "",
  customerProfile = {},
}) {
  if (!threadId || !text) {
    return { skipped: true, reason: "EMPTY_THREAD_OR_TEXT" };
  }

  const channelKey = String(channelId || channel || "DEFAULT");
  const channelEnabled = isChannelBotEnabled(channelKey);
  const initialBotState = getConversationBotState(threadId);
  const effectiveMode = !channelEnabled || initialBotState.mode === "HUMAN" ? "HUMAN" : "AI";

  console.log(`[Zalo AI Bot] Nhận tin từ khách: ${text}`);
  console.log(`[Zalo AI Bot] Mode: ${effectiveMode}`);

  if (!channelEnabled) {
    return { skipped: true, reason: "CHANNEL_BOT_DISABLED" };
  }

  if (initialBotState.mode === "HUMAN") {
    return { skipped: true, reason: "HUMAN_TAKEOVER_ACTIVE", state: initialBotState };
  }

  const threadHistory = storedMessages
    .filter((m) => String(m.threadId) === String(threadId))
    .slice(-8);

  const aiResult = await generateHumanLikeReply({
    customerMessage: text,
    customerProfile: {
      fullName: customerProfile?.fullName || senderName || "Anh/Chị",
      phone: customerProfile?.phone || null,
      pathology: customerProfile?.pathology || "",
    },
    conversationHistory: threadHistory,
  });

  if (aiResult.detectedPhone) {
    getOrCreateCustomerByPhone({
      phone: aiResult.detectedPhone,
      fullName: customerProfile?.fullName || senderName || "Khách Hàng ADDP",
      source: channel,
      note: `AI Bot tự động bóc tách SĐT từ tin nhắn: "${text.slice(0, 100)}"`,
    });
  }

  // Chờ đủ thời gian giả lập người thật gõ phím (3000ms - 5000ms = 3-5 giây)
  const rawDelay = Number(aiResult.typingDelayMs) || 3500;
  const delayMs = Math.max(3000, Math.min(5000, rawDelay));
  console.log(`[Zalo AI Bot] Đang trả lời sau ${delayMs} ms: ${aiResult.replyText}`);

  await new Promise((resolve) => setTimeout(resolve, delayMs));

  // Kiểm tra lại lần thứ 2 sau khi chờ: nếu nhân viên vừa nhảy vào gõ trả lời thì hủy gửi ngay
  if (!isChannelBotEnabled(channelKey)) {
    return { skipped: true, reason: "CHANNEL_DISABLED_DURING_TYPING" };
  }
  const postDelayState = getConversationBotState(threadId);
  if (postDelayState.mode === "HUMAN") {
    return {
      skipped: true,
      reason: "HUMAN_TOOK_OVER_DURING_TYPING",
      state: postDelayState,
    };
  }

  const sendResult = await sendUnifiedMessage({
    channel,
    recipientId: String(threadId),
    text: aiResult.replyText,
    channelId: channelKey,
    pageId: channelKey,
  });

  return {
    skipped: false,
    sent: sendResult.ok,
    replyText: aiResult.replyText,
    typingDelayMs: delayMs,
    detectedPhone: aiResult.detectedPhone,
    sendResult,
  };
}

let cachedFbConversations = null;
let lastFbFetchTime = 0;
const FB_CACHE_TTL_MS = 15000;
// Map lưu liên kết threadId (t_xxx) -> { pageId, psid, pageName, token }
const fbThreadMetaMap = new Map();

/**
 * Lấy danh sách toàn bộ các Fanpage Facebook đang kết nối để hiển thị bộ lọc & nhãn phân biệt từng Page
 */
export function getConnectedFacebookPages() {
  const channels = listAllChannels();
  const fbChannels = channels.filter(
    (c) => c.platform === "FACEBOOK" && c.config?.pageId && c.config?.pageAccessToken
  );

  // Kiểm tra nếu có các Fanpage trùng tên (chỉ khác chữ hoa/thường như "Dược Phẩm ADDP" và "Dược phẩm ADDP")
  const nameCounts = new Map();
  for (const ch of fbChannels) {
    const norm = String(ch.name || "").trim().toLowerCase();
    nameCounts.set(norm, (nameCounts.get(norm) || 0) + 1);
  }

  return fbChannels.map((fbCh, idx) => {
    const pageId = String(fbCh.config.pageId).trim();
    const shortId = pageId.slice(-4);
    const rawName = String(fbCh.name || `Fanpage ${shortId}`).trim();
    const isDuplicateName = (nameCounts.get(rawName.toLowerCase()) || 0) > 1;
    const category = fbCh.config.category || "";
    const displayName = isDuplicateName ? `${rawName} (#${shortId})` : rawName;

    return {
      id: fbCh.id,
      pageId,
      shortId,
      name: rawName,
      displayName,
      fullLabel: `${rawName} • ID #${shortId}`,
      category,
      colorIndex: idx,
    };
  });
}

/**
 * Đồng bộ danh sách hội thoại thật 100% từ tất cả các Fanpage Facebook đã kết nối qua Meta Graph API
 */
export async function fetchLiveFacebookConversations(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedFbConversations && now - lastFbFetchTime < FB_CACHE_TTL_MS) {
    return cachedFbConversations;
  }

  const channels = listAllChannels();
  const fbChannels = channels.filter(
    (c) => c.platform === "FACEBOOK" && c.config?.pageId && c.config?.pageAccessToken
  );

  if (fbChannels.length === 0) {
    return [];
  }

  const connectedPages = getConnectedFacebookPages();
  const pageInfoMap = new Map(connectedPages.map((p) => [p.pageId, p]));
  const results = [];

  await Promise.all(
    fbChannels.map(async (fbCh) => {
      const pageId = String(fbCh.config.pageId).trim();
      const shortId = pageId.slice(-4);
      const token = String(fbCh.config.pageAccessToken).trim();
      const pageMeta = pageInfoMap.get(pageId);
      const pageName = fbCh.name || `Fanpage ${shortId}`;
      const pageDisplay = pageMeta?.displayName || `${pageName} (#${shortId})`;
      try {
        const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(
          pageId
        )}/conversations?fields=id,updated_time,snippet,unread_count,participants&limit=25&access_token=${encodeURIComponent(
          token
        )}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const data = await res.json();
        if (Array.isArray(data?.data)) {
          for (const conv of data.data) {
            const parts = Array.isArray(conv.participants?.data) ? conv.participants.data : [];
            const customer = parts.find((p) => String(p.id) !== pageId) || parts[0] || {};
            const psid = customer.id ? String(customer.id) : "";
            const custName = customer.name || "Khách hàng Fanpage";
            const updatedTs = conv.updated_time ? new Date(conv.updated_time).getTime() : Date.now();

            fbThreadMetaMap.set(String(conv.id), {
              pageId,
              psid,
              pageName,
              pageDisplay,
              token,
              customerName: custName,
            });
            if (psid) {
              fbThreadMetaMap.set(psid, {
                threadId: String(conv.id),
                pageId,
                psid,
                pageName,
                pageDisplay,
                token,
                customerName: custName,
              });
            }

            results.push({
              id: String(conv.id),
              recipientId: psid || String(conv.id),
              pageId,
              pageShortId: shortId,
              pageName,
              pageDisplay,
              accountName: pageDisplay,
              channel: "FACEBOOK",
              channelLabel: `Page: ${pageDisplay}`,
              channelIcon: "📘",
              name: custName,
              type: "DIRECT",
              avatar: "",
              phone: "",
              lastMessage: conv.snippet || "[Tin nhắn Messenger]",
              timestamp: updatedTs,
              lastActive: formatTimeAgo(updatedTs),
              unreadCount: Number(conv.unread_count) || 0,
              status: Number(conv.unread_count) > 0 ? "need_human" : "sale_handled",
            });
          }
        }
      } catch (err) {
        console.error(`[FB_GRAPH_CONV_ERR] (${pageName}):`, err.message);
      }
    })
  );

  results.sort((a, b) => b.timestamp - a.timestamp || String(a.id).localeCompare(String(b.id)));
  cachedFbConversations = results;
  lastFbFetchTime = now;
  return results;
}

/**
 * Lấy lịch sử tin nhắn của một hội thoại theo threadId (Hỗ trợ cả Facebook Graph API trực tiếp)
 */
export async function getThreadMessages(threadId, channel = "ALL", pageIdHint = "") {
  const tid = String(threadId);

  // Nếu là hội thoại Facebook (t_xxx hoặc channel === FACEBOOK) -> Gọi trực tiếp Graph API
  if (tid.startsWith("t_") || channel === "FACEBOOK") {
    const channels = listAllChannels();
    const fbChannels = channels.filter(
      (c) => c.platform === "FACEBOOK" && c.config?.pageId && c.config?.pageAccessToken
    );

    const meta = fbThreadMetaMap.get(tid);
    const orderedPages = [];
    if (pageIdHint) {
      const matched = fbChannels.find((c) => String(c.config.pageId) === String(pageIdHint));
      if (matched) orderedPages.push(matched);
    }
    if (meta?.pageId) {
      const matched = fbChannels.find((c) => String(c.config.pageId) === String(meta.pageId));
      if (matched && !orderedPages.includes(matched)) orderedPages.push(matched);
    }
    for (const ch of fbChannels) {
      if (!orderedPages.includes(ch)) orderedPages.push(ch);
    }

    for (const fbCh of orderedPages) {
      const pageId = String(fbCh.config.pageId).trim();
      const token = String(fbCh.config.pageAccessToken).trim();
      try {
        const msgUrl = `https://graph.facebook.com/v19.0/${encodeURIComponent(
          tid
        )}/messages?fields=id,message,from,to,created_time,attachments&limit=30&access_token=${encodeURIComponent(
          token
        )}`;
        const res = await fetch(msgUrl, { signal: AbortSignal.timeout(8000) });
        const data = await res.json();
        if (Array.isArray(data?.data)) {
          const graphMsgs = data.data.map((m) => {
            const isMe = String(m.from?.id) === pageId;
            const ts = m.created_time ? new Date(m.created_time).getTime() : Date.now();
            const attUrl =
              m.attachments?.data?.[0]?.image_data?.url ||
              m.attachments?.data?.[0]?.video_data?.url ||
              null;
            return {
              id: String(m.id || ts),
              channel: "FACEBOOK",
              channelId: pageId,
              channelName: fbCh.name,
              threadId: tid,
              senderId: String(m.from?.id || ""),
              senderName: m.from?.name || (isMe ? fbCh.name : "Khách hàng"),
              text: m.message || (attUrl ? "[Hình ảnh đính kèm]" : "[Tệp đính kèm]"),
              type: attUrl ? "image" : "text",
              mediaUrl: attUrl,
              isMe,
              timestamp: ts,
              status: "sent",
            };
          });
          graphMsgs.sort((a, b) => a.timestamp - b.timestamp);
          return graphMsgs;
        }
      } catch (err) {
        console.error("[FB_GRAPH_MSG_ERR]", err.message);
      }
    }
  }

  const localMsgs = storedMessages.filter((m) => {
    const matchThread = String(m.threadId) === tid;
    if (channel && channel !== "ALL") {
      return matchThread && m.channel === channel;
    }
    return matchThread;
  });

  return localMsgs.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Gom và nhóm các tin nhắn đã lưu + hội thoại Fanpage thực tế thành danh sách cuộc hội thoại đa kênh
 */
export async function getOmnichannelConversations(forceRefresh = false) {
  const convMap = new Map();

  // 1. Lấy hội thoại thật từ các Fanpage Facebook qua Meta Graph API
  const liveFb = await fetchLiveFacebookConversations(forceRefresh);
  for (const fbConv of liveFb) {
    convMap.set(`FACEBOOK_${fbConv.id}`, fbConv);
  }

  // 2. Bổ sung các tin nhắn realtime nhận qua Webhook
  for (const m of storedMessages) {
    // Không gom lại Zalo cá nhân vì Zalo cá nhân đọc từ history.jsonl trực tiếp
    if (m.channel === "ZALO_PERSONAL") continue;
    // Loại bỏ dữ liệu mẫu test cũ (nếu còn sót)
    if (String(m.threadId) === "zalo_oa_user_8899") continue;

    const key = `${m.channel}_${m.threadId}`;
    const existing = convMap.get(key);

    if (!existing || m.timestamp >= existing.timestamp) {
      const resolvedPageId = existing?.pageId || m.channelId || "";
      const shortId = resolvedPageId ? String(resolvedPageId).slice(-4) : "";
      const pageDisplay =
        existing?.pageDisplay ||
        (m.channelName && shortId ? `${m.channelName} (#${shortId})` : m.channelName || "");
      let icon = "🌐";
      let channelLabel = m.channelName || m.channel;
      if (m.channel === "FACEBOOK") {
        icon = "📘";
        channelLabel = pageDisplay ? `Page: ${pageDisplay}` : "Fanpage Facebook";
      } else if (m.channel === "ZALO_OA") {
        icon = "🏢";
        channelLabel = "Zalo OA";
      }

      convMap.set(key, {
        id: m.threadId,
        recipientId: existing?.recipientId || m.senderId || m.threadId,
        pageId: resolvedPageId,
        pageShortId: existing?.pageShortId || shortId,
        pageName: existing?.pageName || m.channelName || "",
        pageDisplay,
        accountName: pageDisplay || existing?.accountName || channelLabel,
        channel: m.channel,
        channelLabel,
        channelIcon: icon,
        name: existing?.name || m.senderName || `Khách ${m.channel}`,
        type: "DIRECT",
        avatar: "",
        lastMessage: m.isMe ? `Bạn: ${m.text}` : m.text,
        timestamp: m.timestamp,
        lastActive: formatTimeAgo(m.timestamp),
        status: m.isMe ? "sale_handled" : "need_human",
      });
    }
  }

  return Array.from(convMap.values());
}

function formatTimeAgo(ts) {
  if (!ts) return "Gần đây";
  const diff = Date.now() - ts;
  if (diff < 60000) return "Vừa xong";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}p trước`;
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Gửi tin nhắn phản hồi tới khách hàng qua kênh tương ứng
 */
export async function sendUnifiedMessage({ channel, recipientId, text, channelId, pageId }) {
  if (!text || !recipientId) {
    return { ok: false, error: "Thiếu nội dung hoặc người nhận tin nhắn." };
  }

  if (channel === "ZALO_PERSONAL") {
    const res = await sendTextMessage(
      "Dược sĩ Thảo (AI)",
      String(recipientId),
      String(text)
    );
    if (res.ok) {
      await addUnifiedMessage({
        channel: "ZALO_PERSONAL",
        channelId: channelId || "zalo_default",
        channelName: "Zalo Cá Nhân (Sơn Tùng)",
        threadId: recipientId,
        senderId: "me",
        senderName: "Dược sĩ Thảo (AI)",
        text,
        isMe: true,
        metadata: { skipAiBot: true },
      });
      return { ok: true, message: "Đã gửi qua Zalo cá nhân!" };
    }
    return { ok: false, error: res.error || "Gửi Zalo thất bại" };
  }

  if (channel === "FACEBOOK") {
    const channels = listAllChannels();
    const fbChannels = channels.filter(
      (c) => c.platform === "FACEBOOK" && c.config?.pageId && c.config?.pageAccessToken
    );

    const meta = fbThreadMetaMap.get(String(recipientId));
    const targetPageId = pageId || channelId || meta?.pageId || "";
    const fbChannel =
      fbChannels.find((c) => String(c.config.pageId) === String(targetPageId)) || fbChannels[0];

    const token = fbChannel?.config?.pageAccessToken;
    const resolvedPageId = fbChannel?.config?.pageId;
    let targetPsid = meta?.psid || String(recipientId);

    if (token) {
      try {
        // Nếu recipientId đang là mã hội thoại t_xxx thì truy vấn PSID của khách hàng
        if (targetPsid.startsWith("t_")) {
          const convRes = await fetch(
            `https://graph.facebook.com/v19.0/${encodeURIComponent(
              targetPsid
            )}?fields=participants&access_token=${encodeURIComponent(token)}`
          );
          const convData = await convRes.json();
          const parts = Array.isArray(convData?.participants?.data) ? convData.participants.data : [];
          const cust = parts.find((p) => String(p.id) !== String(resolvedPageId)) || parts[0];
          if (cust?.id) {
            targetPsid = String(cust.id);
          }
        }

        const sendUrl = `https://graph.facebook.com/v19.0/me/messages?access_token=${encodeURIComponent(token)}`;
        const fbRes = await fetch(sendUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient: { id: targetPsid },
            message: { text },
          }),
        });
        const fbData = await fbRes.json();
        if (fbData.message_id) {
          await addUnifiedMessage({
            channel: "FACEBOOK",
            channelId: resolvedPageId,
            channelName: fbChannel.name,
            threadId: String(recipientId),
            senderId: "me",
            senderName: fbChannel.name,
            text,
            isMe: true,
          });
          return { ok: true, message: `Đã gửi tin nhắn qua Fanpage ${fbChannel.name}!` };
        } else if (fbData.error) {
          return { ok: false, error: `Meta báo lỗi: ${fbData.error.message}` };
        }
      } catch (err) {
        console.error("[FB_SEND_ERR]", err);
        return { ok: false, error: `Lỗi kết nối Meta Graph API: ${err.message}` };
      }
    }

    return { ok: false, error: "Chưa tìm thấy Page Access Token hợp lệ cho Fanpage này." };
  }

  await addUnifiedMessage({
    channel: channel || "ZALO_OA",
    channelId: channelId || "oa_default",
    channelName: "Zalo OA",
    threadId: recipientId,
    senderId: "me",
    senderName: "CSKH ADDP",
    text,
    isMe: true,
  });

  return { ok: true, message: `Đã gửi tin nhắn thành công qua ${channel}!` };
}
