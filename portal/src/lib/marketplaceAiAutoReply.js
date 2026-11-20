import fs from "fs";
import path from "path";
import { isBotActiveForThread, getChannelBotMode } from "./botControlStore.js";
import { generateAiDraftResponse } from "./aiAssistant.js";
import { isSafePilotMode } from "./pilotConfig.js";

/**
 * ADDP Omnichannel AI CRM — Marketplace Auto-Reply Engine (TikTok Shop & Shopee)
 * Tự động trả lời tin nhắn khách hàng trên TikTok Shop & Shopee khi gian hàng bật chế độ "A.I. Tự Động 24/7".
 * - Tôn trọng Human-Takeover 45 phút (nếu Sale vừa nhắn tay thì AI tạm dừng).
 * - Dedupe bền vững trên RAM + đĩa (.data/mkt_ai_replied.json) để không bao giờ trả lời lặp 1 tin nhắn.
 * - Chỉ phản hồi tin nhắn mới của khách trong vòng 12 giờ gần nhất.
 */

const REPLIED_STORE_PATH = path.join(process.cwd(), ".data", "mkt_ai_replied.json");
const MAX_REPLIED_KEYS = 2000;
const MAX_MESSAGE_AGE_MS = 12 * 60 * 60 * 1000; // 12 giờ

if (!globalThis.__ADDP_MKT_AI_LOCK__) {
  globalThis.__ADDP_MKT_AI_LOCK__ = false;
}

function loadRepliedKeys() {
  if (globalThis.__ADDP_MKT_AI_REPLIED__ instanceof Set) {
    return globalThis.__ADDP_MKT_AI_REPLIED__;
  }
  const set = new Set();
  try {
    if (fs.existsSync(REPLIED_STORE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(REPLIED_STORE_PATH, "utf8"));
      if (Array.isArray(raw)) {
        for (const k of raw) set.add(String(k));
      }
    }
  } catch {}
  globalThis.__ADDP_MKT_AI_REPLIED__ = set;
  return set;
}

function markRepliedKey(key) {
  const set = loadRepliedKeys();
  set.add(key);
  try {
    const dir = path.dirname(REPLIED_STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const arr = Array.from(set).slice(-MAX_REPLIED_KEYS);
    globalThis.__ADDP_MKT_AI_REPLIED__ = new Set(arr);
    fs.writeFileSync(REPLIED_STORE_PATH, JSON.stringify(arr, null, 2), "utf8");
  } catch {}
}

function isSystemOrEmptyMessage(text = "") {
  const t = String(text || "").trim();
  if (!t) return true;
  if (/^\[(notification|tin nhắn shopee|tin nhắn tiktok|hình ảnh|tệp đính kèm)\]$/i.test(t)) {
    return true;
  }
  if (/^(the chat has been assigned|bạn:|\[other\])/i.test(t)) {
    return true;
  }
  return false;
}

/**
 * Quét danh sách hội thoại TikTok Shop / Shopee vừa đồng bộ và tự động trả lời bằng AI nếu đủ điều kiện.
 * @param {Array} conversations
 * @param {{ getThreadMessages: Function, sendUnifiedMessage: Function }} deps
 */
export async function processMarketplaceAiAutoReply(
  conversations = [],
  { getThreadMessages, sendUnifiedMessage } = {}
) {
  if (isSafePilotMode()) return { ok: true, skipped: "PILOT_SAFE_MODE", repliedCount: 0 };
  if (!Array.isArray(conversations) || conversations.length === 0) {
    return { ok: true, repliedCount: 0 };
  }
  if (typeof getThreadMessages !== "function" || typeof sendUnifiedMessage !== "function") {
    return { ok: false, error: "MISSING_ROUTER_DEPS" };
  }
  if (globalThis.__ADDP_MKT_AI_LOCK__) {
    return { ok: true, skipped: "LOCKED", repliedCount: 0 };
  }

  globalThis.__ADDP_MKT_AI_LOCK__ = true;
  let repliedCount = 0;

  try {
    const repliedKeys = loadRepliedKeys();
    const now = Date.now();

    for (const conv of conversations) {
      if (!conv) continue;
      const ch = String(conv.channel || "").toUpperCase();
      if (ch !== "TIKTOK_SHOP" && ch !== "TIKTOK" && ch !== "SHOPEE") continue;

      const shopId = String(conv.shopId || conv.pageId || conv.accountId || "").trim();
      const threadId = String(conv.id || conv.conversationId || "").trim();
      if (!shopId || !threadId) continue;

      // 1. Kiểm tra chế độ AI ở cấp gian hàng & cấp hội thoại (tôn trọng Human-Takeover 45 phút)
      if (getChannelBotMode(shopId) !== "AI") continue;
      if (!isBotActiveForThread(shopId, threadId)) continue;

      // 2. Bỏ qua nếu tin cuối là của Shop hoặc tin hệ thống / tin quá cũ (> 12h)
      if (conv.lastMessageFromMe || conv.isSelf) continue;
      const ts = Number(conv.timestamp || conv.updatedAt || 0);
      if (ts > 0 && now - ts > MAX_MESSAGE_AGE_MS) continue;
      if (isSystemOrEmptyMessage(conv.lastMessage)) continue;

      const dedupeSig = `${ch}:${threadId}:${ts || String(conv.lastMessage || "").slice(0, 40)}`;
      if (repliedKeys.has(dedupeSig)) continue;

      // Đánh dấu trước để tránh chạy trùng nếu có vòng polling kế tiếp
      markRepliedKey(dedupeSig);

      try {
        // 3. Lấy lịch sử tin nhắn chi tiết để chắc chắn tin cuối là của khách hàng
        const history = await getThreadMessages(threadId, ch, shopId, conv.name || "");
        if (!Array.isArray(history) || history.length === 0) continue;

        const lastMsg = history[history.length - 1];
        if (!lastMsg || lastMsg.isMe) continue;
        if (isSystemOrEmptyMessage(lastMsg.text)) continue;

        const exactSig = `${ch}:${threadId}:${lastMsg.id || lastMsg.timestamp || lastMsg.text.slice(0, 40)}`;
        if (exactSig !== dedupeSig && repliedKeys.has(exactSig)) continue;
        markRepliedKey(exactSig);

        const msgAge = lastMsg.timestamp ? now - Number(lastMsg.timestamp) : 0;
        if (msgAge > MAX_MESSAGE_AGE_MS) continue;

        // 4. Sinh câu trả lời AI theo Second Brain Dược Phẩm ADDP
        const formattedHistory = history.slice(-10).map((m) => ({
          role: m.isMe ? "assistant" : "user",
          content: String(m.text || "").trim(),
        }));

        const aiDraft = await generateAiDraftResponse({
          customerMessage: lastMsg.text,
          customerName: conv.name || conv.customerName || "Anh/Chị",
          accountName: conv.accountName || conv.channelLabel || shopId,
          conversationHistory: formattedHistory,
        });

        const replyText = String(aiDraft?.replyText || "").trim();
        if (!replyText) continue;

        // 5. Gửi phản hồi thật qua TikTok Shop / Shopee Open API
        const sendRes = await sendUnifiedMessage({
          channel: ch,
          recipientId: conv.recipientId || conv.toId || threadId,
          conversationId: threadId,
          pageId: shopId,
          channelId: shopId,
          text: replyText,
          staffId: "AI_BOT",
          staffName: "Trợ lý AI ADDP",
          staffConfirmed: true,
        });

        if (sendRes?.ok) {
          repliedCount++;
          console.log(
            `[MKT_AI_AUTO_REPLY] Đã trả lời AI thành công (${ch} | Shop ${shopId} | Thread ${threadId})`
          );
        } else {
          console.warn(
            `[MKT_AI_AUTO_REPLY_FAIL] (${ch} | Thread ${threadId}):`,
            sendRes?.error || "Unknown error"
          );
        }
      } catch (convErr) {
        console.warn(`[MKT_AI_CONV_ERR] (${ch} | ${threadId}):`, convErr?.message || convErr);
      }
    }
  } finally {
    globalThis.__ADDP_MKT_AI_LOCK__ = false;
  }

  return { ok: true, repliedCount };
}
