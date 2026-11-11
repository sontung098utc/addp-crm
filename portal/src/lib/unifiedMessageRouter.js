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
import { listAllChannels, updateChannelAccount } from "./connectionHub.js";
import {
  TIKTOK_APP_KEY,
  TIKTOK_APP_SECRET,
  TIKTOK_DEFAULT_SHOP_CIPHER,
  generateTikTokSignV2,
  refreshTikTokOAuthToken,
} from "./tiktokConfig.js";
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

  // Nếu là tin nhắn từ khách hàng -> Chỉ cập nhật AI Bot nếu không phải sync/lịch sử cũ;
  // KHÔNG tự ý lấy SĐT trong nội dung tin nhắn tạo mới hồ sơ Khách hàng
  if (!isMe && text) {
    // Kích hoạt luồng AI Bot Dược sĩ Thảo CHỈ cho tin nhắn mới thực tế (< 2 phút), tuyệt đối không chạy khi sync lịch sử
    const isHistoricalSync =
      metadata?.skipAiBot === true ||
      metadata?.source === "history_sync" ||
      Date.now() - Number(timestamp || Date.now()) > 120000;

    if (!isHistoricalSync) {
      handleIncomingAiBotAutoReply({
        channel: channel || "ZALO_PERSONAL",
        channelId: channelId || channel || "DEFAULT",
        threadId: String(threadId),
        senderName: senderName || "Khách hàng",
        text,
        customerProfile: {
          fullName: senderName || "Anh/Chị",
          phone: null,
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

let cachedTikTokConversations = null;
let lastTikTokFetchTime = 0;
const TIKTOK_CACHE_TTL_MS = 60 * 1000;

/**
 * Lấy danh sách toàn bộ các gian hàng TikTok Shop đang kết nối (an toàn, không lộ token)
 */
export function getConnectedTikTokShops() {
  const channels = listAllChannels();
  const tiktokChannels = channels.filter((c) => {
    const isTikTok =
      c.platform === "TIKTOK_SHOP" ||
      c.type === "tiktok_shop" ||
      c.channel_type === "tiktok_shop";
    const statusNorm = String(c.status || "").toUpperCase();
    const isActive =
      statusNorm !== "DISCONNECTED" &&
      statusNorm !== "DELETED" &&
      statusNorm !== "INACTIVE";
    return isTikTok && isActive;
  });

  const nameCounts = new Map();
  for (const ch of tiktokChannels) {
    const norm = String(ch.name || ch.sellerName || "").trim().toLowerCase();
    nameCounts.set(norm, (nameCounts.get(norm) || 0) + 1);
  }

  return tiktokChannels.map((ch, idx) => {
    const shopId = String(
      ch.shopId || ch.config?.shopId || ch.externalId || ch.id || ""
    ).trim();
    const shortId = shopId ? shopId.slice(-4) : String(idx + 1);
    const sellerName = String(
      ch.sellerName || ch.config?.sellerName || ch.name || "TikTok Shop"
    ).trim();
    const rawName = String(ch.name || sellerName).trim();
    const isDuplicateName = (nameCounts.get(rawName.toLowerCase()) || 0) > 1;
    const displayName = isDuplicateName && shortId ? `${rawName} (#${shortId})` : rawName;

    return {
      id: ch.id,
      shopId: shopId || String(ch.id),
      shortId,
      name: rawName,
      displayName,
      sellerName,
      status: ch.status || "CONNECTED",
      colorIndex: idx,
    };
  });
}

function parseTikTokMessageText(msg) {
  if (!msg) return "[Tin nhắn]";
  const rawContent = msg.content ?? msg.text ?? "";
  let parsed = null;
  if (typeof rawContent === "string" && rawContent.trim().startsWith("{")) {
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      parsed = null;
    }
  } else if (rawContent && typeof rawContent === "object") {
    parsed = rawContent;
  }

  if (parsed) {
    const txt = parsed.content || parsed.text || parsed.msg || "";
    if (txt) return String(txt);
    if (parsed.url || parsed.image_url) return "[Hình ảnh]";
    if (parsed.product_name || parsed.product_id) {
      return `[Sản phẩm${parsed.product_name ? `: ${parsed.product_name}` : ""}]`;
    }
    if (parsed.order_id) return `[Đơn hàng #${parsed.order_id}]`;
  }

  const msgType = String(msg.type || "").toUpperCase();
  if (msgType === "IMAGE") return "[Hình ảnh]";
  if (msgType === "PRODUCT_CARD") return "[Thẻ sản phẩm]";
  if (msgType === "ORDER_CARD") return "[Thẻ đơn hàng]";
  return String(rawContent || "[Tin nhắn]");
}

function normalizeTikTokTs(rawTs) {
  const num = Number(rawTs) || 0;
  if (!num) return Date.now();
  return num < 1e12 ? num * 1000 : num;
}

function getActiveTikTokChannels(shopIdFilter = "") {
  const channels = listAllChannels();
  const active = channels.filter((c) => {
    const isTikTok =
      c.platform === "TIKTOK_SHOP" ||
      c.type === "tiktok_shop" ||
      c.channel_type === "tiktok_shop";
    const statusNorm = String(c.status || "").toUpperCase();
    const token = c.accessToken || c.config?.accessToken;
    return (
      isTikTok &&
      statusNorm !== "DISCONNECTED" &&
      statusNorm !== "DELETED" &&
      statusNorm !== "INACTIVE" &&
      Boolean(token)
    );
  });

  if (!shopIdFilter || shopIdFilter === "ALL") return active;
  const target = String(shopIdFilter).trim();
  const matched = active.filter((c) => {
    const sId = String(c.shopId || c.config?.shopId || c.externalId || c.id || "").trim();
    return sId === target || String(c.id) === target;
  });
  return matched.length > 0 ? matched : active;
}

function formatTikTokFriendlyError(code, rawMessage = "", endpoint = "") {
  const rawCode = code !== undefined && code !== null ? code : -1;
  const numCode = Number(rawCode);
  const cleanRawMessage = String(
    rawMessage || "Không thể kết nối TikTok Shop Open API."
  ).trim();
  const msgLower = cleanRawMessage.toLowerCase();
  const isCipherOrScopeOrTokenIssue =
    numCode === 105005 ||
    numCode === 105001 ||
    numCode === 105002 ||
    numCode === 105003 ||
    numCode === 105004 ||
    msgLower.includes("invalid shop_cipher") ||
    msgLower.includes("shop_cipher") ||
    msgLower.includes("access denied") ||
    msgLower.includes("permission") ||
    msgLower.includes("token") ||
    msgLower.includes("unauthorized");

  let message = `Lỗi TikTok [Code: ${rawCode}]: ${cleanRawMessage}`;
  if (numCode === 105005) {
    message +=
      " — Quyền Customer Service (Chat) chưa được duyệt trên Partner Center hoặc Shop chưa bấm ủy quyền lại.";
  }
  if (endpoint) {
    message += ` (${endpoint})`;
  }

  return {
    needsTokenRefresh: isCipherOrScopeOrTokenIssue,
    rawCode,
    rawMessage: cleanRawMessage,
    endpoint: endpoint || "",
    message,
  };
}

async function persistTikTokTokens(channelId, refreshed) {
  updateChannelAccount(channelId, {
    status: "CONNECTED",
    extraFields: {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      tokenExpiresAt: refreshed.tokenExpiresAt,
      oauthStatus: "active",
    },
    config: {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      tokenExpiresAt: refreshed.tokenExpiresAt,
    },
  });
}

async function resolveTikTokSession(channel) {
  const appKey = channel.config?.appKey || TIKTOK_APP_KEY;
  const appSecret = channel.config?.appSecret || TIKTOK_APP_SECRET;
  let accessToken = channel.accessToken || channel.config?.accessToken || "";
  let refreshToken = channel.refreshToken || channel.config?.refreshToken || "";
  // Dùng trực tiếp shop_cipher đã cấu hình (bỏ qua /authorization/202309/shops do endpoint này bị lỗi 105005)
  const shopCipher = String(
    channel.shopCipher ||
      channel.shop_cipher ||
      channel.config?.shopCipher ||
      channel.config?.shop_cipher ||
      TIKTOK_DEFAULT_SHOP_CIPHER ||
      "ROW_ZYlTfAAAAAAKQlKl19lz-hy5D_kGf-VJK"
  ).trim();

  if (!accessToken) {
    const rawMsg = "Thiếu accessToken trong channels.json cho gian hàng TikTok Shop.";
    const formatted = formatTikTokFriendlyError(
      "MISSING_ACCESS_TOKEN",
      rawMsg,
      "resolveTikTokSession"
    );
    return {
      ok: false,
      needsTokenRefresh: true,
      accessToken: "",
      refreshToken,
      shopCipher: "",
      appKey,
      appSecret,
      code: "MISSING_ACCESS_TOKEN",
      rawCode: "MISSING_ACCESS_TOKEN",
      rawMessage: rawMsg,
      endpoint: "resolveTikTokSession",
      error: formatted.message,
    };
  }

  const expiresAt = Number(channel.tokenExpiresAt || channel.config?.tokenExpiresAt || 0);
  const isNearExpiry = expiresAt > 0 && expiresAt <= Date.now() + 5 * 60 * 1000;

  if (isNearExpiry && refreshToken) {
    const refreshed = await refreshTikTokOAuthToken({
      refreshToken,
      appKey,
      appSecret,
    });
    if (refreshed.ok && refreshed.accessToken) {
      accessToken = refreshed.accessToken;
      refreshToken = refreshed.refreshToken || refreshToken;
      persistTikTokTokens(channel.id, {
        ...refreshed,
        refreshToken,
      });
    }
  }

  return {
    ok: true,
    accessToken,
    refreshToken,
    shopCipher,
    appKey,
    appSecret,
  };
}

async function callTikTokShopApi(
  channel,
  {
    method = "GET",
    reqPath,
    queryParams = {},
    bodyObj = null,
    timeoutMs = 6000,
  }
) {
  let session = await resolveTikTokSession(channel);
  if (!session.ok || !session.shopCipher) {
    const rawCode = session.rawCode ?? session.code ?? -1;
    const rawMessage =
      session.rawMessage ||
      session.error ||
      "Thiếu accessToken hoặc shop_cipher TikTok Shop chưa hợp lệ.";
    const endpoint = session.endpoint || "resolveTikTokSession";
    return {
      status: 400,
      needsTokenRefresh: true,
      endpoint,
      rawCode,
      rawMessage,
      json: {
        code: rawCode,
        message: rawMessage,
      },
    };
  }

  const bodyStr = bodyObj ? JSON.stringify(bodyObj) : "";

  const sendOnce = async (token, cipher) => {
    const params = {
      app_key: session.appKey,
      shop_cipher: cipher,
      timestamp: String(Math.floor(Date.now() / 1000)),
      ...queryParams,
    };
    const sign = generateTikTokSignV2(reqPath, params, session.appSecret, bodyStr);
    const qs = new URLSearchParams({ ...params, sign });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(
        `https://open-api.tiktokglobalshop.com${reqPath}?${qs.toString()}`,
        {
          method,
          headers: {
            "Content-Type": "application/json",
            "x-tts-access-token": token,
          },
          body: bodyStr || undefined,
          signal: controller.signal,
        }
      );
      const json = await res.json().catch(() => null);
      return { status: res.status, endpoint: reqPath, json };
    } finally {
      clearTimeout(timer);
    }
  };

  let attempt = await sendOnce(session.accessToken, session.shopCipher);
  const code = Number(attempt?.json?.code ?? -1);
  const msgLower = String(attempt?.json?.message || "").toLowerCase();
  const isAuthOrCipherMismatch =
    attempt.status === 401 ||
    code === 105001 ||
    code === 105002 ||
    code === 105003 ||
    code === 105004 ||
    code === 105005 ||
    msgLower.includes("invalid shop_cipher") ||
    msgLower.includes("shop_cipher");

  if (isAuthOrCipherMismatch && session.refreshToken) {
    const refreshed = await refreshTikTokOAuthToken({
      refreshToken: session.refreshToken,
      appKey: session.appKey,
      appSecret: session.appSecret,
    });
    if (refreshed.ok && refreshed.accessToken) {
      persistTikTokTokens(channel.id, {
        ...refreshed,
        refreshToken: refreshed.refreshToken || session.refreshToken,
      });
      session = {
        ...session,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken || session.refreshToken,
      };
      attempt = await sendOnce(session.accessToken, session.shopCipher);
    }
  }

  return {
    ...attempt,
    endpoint: attempt?.endpoint || reqPath,
    rawCode: attempt?.json?.code ?? attempt?.status ?? -1,
    rawMessage: attempt?.json?.message || "",
  };
}

function mergeSyncedMessagesBatch(newMsgs = []) {
  if (!Array.isArray(newMsgs) || newMsgs.length === 0) return 0;
  const idxMap = new Map();
  storedMessages.forEach((m, idx) => {
    idxMap.set(`${m.channel}_${m.threadId}_${m.id}`, idx);
  });

  let addedOrUpdated = 0;
  for (const msg of newMsgs) {
    const key = `${msg.channel}_${msg.threadId}_${msg.id}`;
    const existingIdx = idxMap.get(key);
    if (existingIdx !== undefined) {
      storedMessages[existingIdx] = { ...storedMessages[existingIdx], ...msg };
    } else {
      idxMap.set(key, storedMessages.length);
      storedMessages.push(msg);
      addedOrUpdated += 1;
    }
  }

  storedMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  if (storedMessages.length > 3000) {
    storedMessages = storedMessages.slice(-3000);
  }
  saveStoredMessages(storedMessages);
  return addedOrUpdated;
}

/**
 * Đồng bộ hội thoại thật từ TikTok Shop Open API (nếu gian hàng có quyền Customer Service)
 */
export async function fetchLiveTikTokConversations(forceRefresh = false) {
  const now = Date.now();
  if (
    !forceRefresh &&
    cachedTikTokConversations &&
    now - lastTikTokFetchTime < TIKTOK_CACHE_TTL_MS
  ) {
    return cachedTikTokConversations;
  }

  const tiktokChannels = getActiveTikTokChannels();
  if (tiktokChannels.length === 0) {
    cachedTikTokConversations = [];
    lastTikTokFetchTime = now;
    return [];
  }

  const results = [];
  for (const ch of tiktokChannels) {
    const shopId = String(ch.shopId || ch.config?.shopId || ch.externalId || ch.id || "").trim();
    const shopName = String(ch.name || ch.sellerName || "TikTok Shop").trim();

    try {
      const { json } = await callTikTokShopApi(ch, {
        method: "GET",
        reqPath: "/customer_service/202309/conversations",
        queryParams: { page_size: "20" },
        timeoutMs: 4500,
      });
      const convList = Array.isArray(json?.data?.conversations)
        ? json.data.conversations
        : [];
      for (const c of convList) {
        const ts = normalizeTikTokTs(c.latest_message?.create_time || c.create_time);
        const buyer = Array.isArray(c.participants)
          ? c.participants.find((p) => String(p.role || "").toUpperCase() === "BUYER") ||
            c.participants[0]
          : null;
        results.push({
          id: String(c.id),
          recipientId: buyer?.im_user_id || buyer?.user_id || String(c.id),
          shopId,
          accountId: shopId,
          accountName: shopName,
          accountDisplayName: shopName,
          channel: "TIKTOK_SHOP",
          channelLabel: shopName,
          channelIcon: "🎵",
          name: buyer?.nickname || buyer?.name || "Khách TikTok Shop",
          type: "DIRECT",
          avatar: buyer?.avatar || "",
          lastMessage: parseTikTokMessageText(c.latest_message),
          timestamp: ts,
          lastActive: formatTimeAgo(ts),
          unreadCount: Number(c.unread_count || 0),
          unread: Number(c.unread_count || 0),
          status: Number(c.unread_count || 0) > 0 ? "need_human" : "sale_handled",
        });
      }
    } catch (err) {
      console.warn(`[TIKTOK_CONV_FETCH_WARN] ${shopName}:`, err?.message || err);
    }
  }

  cachedTikTokConversations = results;
  lastTikTokFetchTime = now;
  return results;
}

/**
 * Chủ động kéo toàn bộ hội thoại & lịch sử tin nhắn từ TikTok Shop Open API về omnichannel_messages.json
 */
export async function syncTikTokShopMessages({ shopId = "" } = {}) {
  const tiktokChannels = getActiveTikTokChannels(shopId);
  if (tiktokChannels.length === 0) {
    return {
      ok: false,
      syncedConversations: 0,
      syncedMessages: 0,
      conversations: [],
      message: "Chưa có gian hàng TikTok Shop nào đang kết nối hoặc thiếu Access Token.",
    };
  }

  let syncedConversations = 0;
  let syncedMessages = 0;
  const collectedConvs = [];
  const shopResults = [];
  const messagesToMerge = [];

  for (const ch of tiktokChannels) {
    const chShopId = String(ch.shopId || ch.config?.shopId || ch.externalId || ch.id || "").trim();
    const shopName = String(ch.name || ch.sellerName || "TikTok Shop").trim();

    try {
      const apiRes = await callTikTokShopApi(ch, {
        method: "GET",
        reqPath: "/customer_service/202309/conversations",
        queryParams: { page_size: "20" },
        timeoutMs: 8000,
      });
      const { json } = apiRes;

      if (!json || (json.code !== undefined && Number(json.code) !== 0)) {
        const endpoint = apiRes?.endpoint || "/customer_service/202309/conversations";
        const rawCode = json?.code ?? apiRes?.rawCode ?? apiRes?.status ?? -1;
        const rawMessage =
          json?.message ||
          apiRes?.rawMessage ||
          "Không nhận được phản hồi hợp lệ từ TikTok Shop Open API.";
        const friendly = formatTikTokFriendlyError(rawCode, rawMessage, endpoint);
        shopResults.push({
          shopId: chShopId,
          shopName,
          ok: false,
          code: rawCode,
          rawCode,
          rawMessage,
          endpoint,
          needsTokenRefresh: Boolean(apiRes.needsTokenRefresh || friendly.needsTokenRefresh),
          error: friendly.message,
        });
        continue;
      }

      const convList = Array.isArray(json?.data?.conversations)
        ? json.data.conversations
        : [];
      let shopMsgCount = 0;

      for (const conv of convList) {
        const convId = String(conv.id || "").trim();
        if (!convId) continue;
        syncedConversations += 1;
        collectedConvs.push(conv);

        const buyer = Array.isArray(conv.participants)
          ? conv.participants.find((p) => String(p.role || "").toUpperCase() === "BUYER") ||
            conv.participants[0]
          : null;
        const buyerName = buyer?.nickname || buyer?.name || "Khách TikTok Shop";
        const buyerAvatar = buyer?.avatar || "";
        const buyerId = String(buyer?.im_user_id || buyer?.user_id || convId);

        let convMsgs = [];
        try {
          const msgAttempt = await callTikTokShopApi(ch, {
            method: "GET",
            reqPath: `/customer_service/202309/conversations/${encodeURIComponent(
              convId
            )}/messages`,
            queryParams: { page_size: "50" },
            timeoutMs: 8000,
          });
          if (Array.isArray(msgAttempt?.json?.data?.messages)) {
            convMsgs = msgAttempt.json.data.messages;
          }
        } catch (err) {
          console.warn(`[TIKTOK_SYNC_MSGS_WARN] conv ${convId}:`, err?.message || err);
        }

        if (convMsgs.length === 0 && conv.latest_message) {
          convMsgs = [conv.latest_message];
        }

        for (const m of convMsgs) {
          const senderRole = String(m.sender?.role || "").toUpperCase();
          const isMe =
            senderRole === "SHOP" ||
            senderRole === "CUSTOMER_SERVICE" ||
            senderRole === "SELLER" ||
            senderRole === "SYSTEM";
          const ts = normalizeTikTokTs(m.create_time || conv.create_time);
          const msgId = String(m.id || `${convId}_${ts}`);

          messagesToMerge.push({
            id: msgId,
            channel: "TIKTOK_SHOP",
            channelId: chShopId,
            channelName: shopName,
            threadId: convId,
            senderId: String(m.sender?.im_user_id || (isMe ? "me" : buyerId)),
            senderName: isMe ? shopName : buyerName,
            text: parseTikTokMessageText(m),
            type: String(m.type || "text").toLowerCase(),
            isMe,
            timestamp: ts,
            metadata: {
              buyerName,
              avatar: buyerAvatar,
              shopId: chShopId,
              unreadCount: Number(conv.unread_count || 0),
            },
          });
          syncedMessages += 1;
          shopMsgCount += 1;
        }
      }

      shopResults.push({
        shopId: chShopId,
        shopName,
        ok: true,
        conversations: convList.length,
        messages: shopMsgCount,
      });
    } catch (err) {
      const rawMessage = err?.message || "Lỗi kết nối TikTok Shop Open API.";
      shopResults.push({
        shopId: chShopId,
        shopName,
        ok: false,
        code: "NETWORK_ERROR",
        rawCode: "NETWORK_ERROR",
        rawMessage,
        endpoint: "/customer_service/202309/conversations",
        error: `Lỗi TikTok [Code: NETWORK_ERROR]: ${rawMessage} (/customer_service/202309/conversations)`,
      });
    }
  }

  mergeSyncedMessagesBatch(messagesToMerge);
  cachedTikTokConversations = null;
  lastTikTokFetchTime = 0;

  const anySuccess = shopResults.some((r) => r.ok);
  const firstFailed = shopResults.find((r) => !r.ok) || null;
  const firstErr = firstFailed?.error || "";

  return {
    ok: anySuccess,
    syncedConversations,
    syncedMessages,
    syncedCount: syncedConversations,
    needsTokenRefresh: Boolean(!anySuccess && firstFailed?.needsTokenRefresh),
    errorCode: !anySuccess ? firstFailed?.code ?? null : null,
    rawCode: !anySuccess ? firstFailed?.rawCode ?? firstFailed?.code ?? null : null,
    rawMessage: !anySuccess ? firstFailed?.rawMessage ?? null : null,
    endpoint: !anySuccess ? firstFailed?.endpoint ?? null : null,
    shopResults,
    conversations: collectedConvs,
    message: anySuccess
      ? `Đã đồng bộ ${syncedConversations} hội thoại (${syncedMessages} tin nhắn) từ TikTok Shop.`
      : firstErr || "Không thể đồng bộ tin nhắn từ TikTok Shop.",
  };
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
              avatar: psid
                ? `/api/media/avatar-proxy?type=fb&id=${encodeURIComponent(psid)}&pageId=${encodeURIComponent(pageId)}&name=${encodeURIComponent(custName)}`
                : `/api/media/avatar-proxy?name=${encodeURIComponent(custName)}&type=fb`,
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

  // Nếu là hội thoại TikTok Shop -> Kéo tin nhắn chi tiết trực tiếp từ TikTok CS API + gộp lịch sử cục bộ
  if (channel === "TIKTOK_SHOP" || channel === "TIKTOK" || tid.startsWith("tiktok_")) {
    const rawTid = tid.replace(/^tiktok_/, "");
    const channels = getActiveTikTokChannels(pageIdHint);
    const mergedMap = new Map();

    for (const m of storedMessages) {
      if (
        (m.channel === "TIKTOK_SHOP" || m.channel === "TIKTOK") &&
        (String(m.threadId) === tid || String(m.threadId) === rawTid)
      ) {
        mergedMap.set(String(m.id), m);
      }
    }

    for (const ch of channels) {
      const chShopId = String(ch.shopId || ch.config?.shopId || ch.externalId || ch.id || "").trim();
      const shopName = String(ch.name || ch.sellerName || "TikTok Shop").trim();
      try {
        const { json } = await callTikTokShopApi(ch, {
          method: "GET",
          reqPath: `/customer_service/202309/conversations/${encodeURIComponent(rawTid)}/messages`,
          queryParams: { page_size: "50" },
          timeoutMs: 6000,
        });
        if (Array.isArray(json?.data?.messages)) {
          for (const m of json.data.messages) {
            const senderRole = String(m.sender?.role || "").toUpperCase();
            const isMe =
              senderRole === "SHOP" ||
              senderRole === "CUSTOMER_SERVICE" ||
              senderRole === "SELLER" ||
              senderRole === "SYSTEM";
            const ts = normalizeTikTokTs(m.create_time);
            const msgObj = {
              id: String(m.id || `${rawTid}_${ts}`),
              channel: "TIKTOK_SHOP",
              channelId: chShopId,
              channelName: shopName,
              threadId: rawTid,
              senderId: String(m.sender?.im_user_id || (isMe ? "me" : rawTid)),
              senderName: isMe ? shopName : "Khách TikTok Shop",
              text: parseTikTokMessageText(m),
              type: String(m.type || "text").toLowerCase(),
              isMe,
              timestamp: ts,
              status: "sent",
            };
            mergedMap.set(msgObj.id, msgObj);
          }
          break;
        }
      } catch (err) {
        console.warn("[TIKTOK_THREAD_MSG_WARN]", err?.message || err);
      }
    }

    return Array.from(mergedMap.values()).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
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

  // 1. Lấy hội thoại thật từ các Fanpage Facebook & TikTok Shop qua API
  const [liveFb, liveTikTok] = await Promise.all([
    fetchLiveFacebookConversations(forceRefresh),
    fetchLiveTikTokConversations(forceRefresh).catch(() => []),
  ]);
  for (const fbConv of liveFb) {
    convMap.set(`FACEBOOK_${fbConv.id}`, fbConv);
  }
  for (const ttConv of liveTikTok) {
    convMap.set(`TIKTOK_SHOP_${ttConv.id}`, ttConv);
  }

  // 2. Bổ sung các tin nhắn realtime nhận qua Webhook
  for (const m of storedMessages) {
    // Không gom lại Zalo cá nhân vì Zalo cá nhân đọc từ history.jsonl trực tiếp
    if (m.channel === "ZALO_PERSONAL") continue;
    // Loại bỏ dữ liệu mẫu test cũ (nếu còn sót)
    if (String(m.threadId) === "zalo_oa_user_8899") continue;

    const normalizedChannel =
      m.channel === "TIKTOK" || m.channel === "tiktok_shop" ? "TIKTOK_SHOP" : m.channel;
    const key = `${normalizedChannel}_${m.threadId}`;
    const existing = convMap.get(key);

    if (!existing || m.timestamp >= existing.timestamp) {
      const resolvedPageId = existing?.pageId || m.channelId || "";
      const shortId = resolvedPageId ? String(resolvedPageId).slice(-4) : "";
      const pageDisplay =
        existing?.pageDisplay ||
        (m.channelName && shortId ? `${m.channelName} (#${shortId})` : m.channelName || "");
      let icon = "🌐";
      let channelLabel = m.channelName || normalizedChannel;
      if (normalizedChannel === "FACEBOOK") {
        icon = "📘";
        channelLabel = pageDisplay ? `Page: ${pageDisplay}` : "Fanpage Facebook";
      } else if (normalizedChannel === "ZALO_OA") {
        icon = "🏢";
        channelLabel = "Zalo OA";
      } else if (normalizedChannel === "TIKTOK_SHOP") {
        icon = "🎵";
        channelLabel = m.channelName || existing?.accountName || "TikTok Shop";
      }

      convMap.set(key, {
        id: m.threadId,
        recipientId: existing?.recipientId || m.senderId || m.threadId,
        pageId: resolvedPageId,
        pageShortId: existing?.pageShortId || shortId,
        pageName: existing?.pageName || m.channelName || "",
        pageDisplay,
        shopId: existing?.shopId || (normalizedChannel === "TIKTOK_SHOP" ? m.channelId || "" : ""),
        accountId: existing?.accountId || m.channelId || "",
        accountName:
          normalizedChannel === "TIKTOK_SHOP"
            ? m.channelName || existing?.accountName || "TikTok Shop"
            : pageDisplay || existing?.accountName || channelLabel,
        channel: normalizedChannel,
        channelLabel,
        channelIcon: icon,
        name:
          existing?.name ||
          m.metadata?.buyerName ||
          (!m.isMe ? m.senderName : "") ||
          `Khách ${normalizedChannel}`,
        type: "DIRECT",
        avatar: existing?.avatar || m.metadata?.avatar || "",
        unreadCount: existing?.unreadCount ?? m.metadata?.unreadCount ?? 0,
        unread: existing?.unread ?? m.metadata?.unreadCount ?? 0,
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

  if (channel === "TIKTOK_SHOP" || channel === "TIKTOK") {
    const channels = getActiveTikTokChannels(channelId || pageId || "");
    const ch = channels[0];
    if (!ch) {
      return { ok: false, error: "Chưa tìm thấy gian hàng TikTok Shop đang kết nối." };
    }

    const chShopId = String(ch.shopId || ch.config?.shopId || ch.externalId || ch.id || "").trim();
    const shopName = String(ch.name || ch.sellerName || "TikTok Shop").trim();
    const rawConvId = String(recipientId).replace(/^tiktok_/, "");

    try {
      const { json } = await callTikTokShopApi(ch, {
        method: "POST",
        reqPath: `/customer_service/202309/conversations/${encodeURIComponent(
          rawConvId
        )}/messages`,
        bodyObj: {
          type: "TEXT",
          content: JSON.stringify({ content: text }),
        },
        timeoutMs: 8000,
      });

      if (json && Number(json.code) === 0) {
        await addUnifiedMessage({
          channel: "TIKTOK_SHOP",
          channelId: chShopId,
          channelName: shopName,
          threadId: rawConvId,
          senderId: "me",
          senderName: shopName,
          text,
          isMe: true,
        });
        return { ok: true, message: `Đã gửi tin nhắn qua ${shopName}!` };
      }

      return {
        ok: false,
        error: json?.message
          ? `TikTok Shop báo lỗi (${json.code ?? ""}): ${json.message}`
          : "Không thể gửi tin nhắn qua TikTok Shop Open API.",
      };
    } catch (err) {
      console.error("[TIKTOK_SEND_ERR]", err);
      return { ok: false, error: `Lỗi kết nối TikTok Shop API: ${err.message}` };
    }
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
