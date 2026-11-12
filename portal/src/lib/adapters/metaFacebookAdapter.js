import { isSafePilotMode } from "../pilotConfig.js";
import { recordMessageAudit, maskRecipient } from "./messageAuditLogger.js";

/**
 * ADDP CRM — ADAPTER GỬI TIN NHẮN FACEBOOK FANPAGE CHÍNH THỨC (META GRAPH API)
 * - Sử dụng giao thức chính thức Meta Graph API v20.0 /me/messages.
 * - KHÔNG sử dụng trình duyệt tự động hóa, cào dữ liệu hoặc giả lập đăng nhập.
 * - Kiểm soát an toàn: Xác nhận từ nhân viên, danh sách người nhận thử nghiệm Staging,
 *   chống gửi lặp (idempotency 5s), timeout 10s, che giấu thông tin nhạy cảm.
 * - TUYỆT ĐỐI KHÔNG commit hoặc ghi Access Token vào log/mã nguồn.
 */

const GRAPH_API_VERSION = process.env.META_GRAPH_VERSION || "v20.0";
const META_SEND_TIMEOUT_MS = Number(process.env.META_SEND_TIMEOUT_MS) || 10000;

// Bộ nhớ đệm chống gửi trùng lặp tin nhắn trong 5 giây (RAM cache)
if (!globalThis.__META_IDEMPOTENCY_CACHE__) {
  globalThis.__META_IDEMPOTENCY_CACHE__ = new Map();
}
const recentMetaSends = globalThis.__META_IDEMPOTENCY_CACHE__;

function cleanOldIdempotencyRecords() {
  const now = Date.now();
  for (const [k, ts] of recentMetaSends.entries()) {
    if (now - ts > 15000) {
      recentMetaSends.delete(k);
    }
  }
}

/**
 * Kiểm tra danh sách người nhận thử nghiệm được phép trên Staging
 */
function isAllowedStagingRecipient(recipientPsid) {
  const isStagingOnly =
    process.env.STAGING_TEST_ONLY_MODE === "true" ||
    process.env.NODE_ENV === "test" ||
    Boolean(process.env.STAGING_CONTROLLED_RECIPIENTS);

  if (!isStagingOnly) return true;

  const rawAllowed = [
    process.env.STAGING_CONTROLLED_RECIPIENTS || "",
    process.env.META_TEST_RECIPIENT_PSID || "",
  ]
    .join(",")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (rawAllowed.length === 0) return true;
  return rawAllowed.includes(String(recipientPsid).trim());
}

/**
 * Gửi tin nhắn 1-1 chính thức qua Meta Graph API
 */
export async function sendMetaFacebookMessage({
  pageId = "",
  pageAccessToken = "",
  recipientPsid = "",
  text = "",
  staffId = "STAFF",
  staffName = "Chuyên viên ADDP",
  staffConfirmed = false,
  messageTag = "",
}) {
  const startTime = Date.now();
  const cleanPsid = String(recipientPsid || "").trim();
  const cleanText = String(text || "").trim();

  // 1. Kiểm tra xác nhận chủ động từ nhân viên
  if (!staffConfirmed) {
    const errorMsg = "Yêu cầu xác nhận chủ động từ nhân viên trước khi gửi tin nhắn thật qua Fanpage.";
    recordMessageAudit({
      staffId,
      staffName,
      staffConfirmed: false,
      channel: "FACEBOOK",
      recipient: cleanPsid,
      text: cleanText,
      status: "failed",
      provider: "META_GRAPH_API",
      error: errorMsg,
    });
    return { ok: false, status: "failed", error: errorMsg };
  }

  if (!cleanPsid) {
    return { ok: false, status: "failed", error: "Thiếu PSID (ID người nhận) trên Fanpage Facebook." };
  }
  if (!cleanText) {
    return { ok: false, status: "failed", error: "Nội dung tin nhắn không được để trống." };
  }

  // 2. Chặn an toàn trên môi trường Staging: Chỉ gửi tới tài khoản thử nghiệm do công ty kiểm soát
  if (!isAllowedStagingRecipient(cleanPsid)) {
    const safeError = `CHẶN AN TOÀN STAGING: PSID (${maskRecipient(cleanPsid)}) không nằm trong danh sách tài khoản thử nghiệm nội bộ do công ty kiểm soát (STAGING_CONTROLLED_RECIPIENTS). Không gửi tới khách hàng thật.`;
    recordMessageAudit({
      staffId,
      staffName,
      staffConfirmed: true,
      channel: "FACEBOOK",
      recipient: cleanPsid,
      text: cleanText,
      status: "failed",
      provider: "META_GRAPH_API",
      error: safeError,
    });
    return { ok: false, status: "failed", error: safeError };
  }

  // 3. Trong Safe Mode: Bắt buộc không gọi ra provider bên ngoài, ghi nhận trạng thái mocked
  if (isSafePilotMode()) {
    const mockMsgId = `mock_meta_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const elapsed = Date.now() - startTime;
    recordMessageAudit({
      staffId,
      staffName,
      staffConfirmed: true,
      channel: "FACEBOOK",
      recipient: cleanPsid,
      text: cleanText,
      status: "mocked",
      provider: "META_GRAPH_API",
      providerHttpCode: 200,
      providerMsgId: mockMsgId,
      responseTimeMs: elapsed,
      mocked: true,
      safeMode: true,
    });
    return {
      ok: true,
      status: "mocked",
      mocked: true,
      safeMode: true,
      provider: "META_GRAPH_API",
      messageId: mockMsgId,
      message: "[Safe Mode] Đã mô phỏng gửi tin nhắn Meta Graph API an toàn (không gọi internet).",
      responseTimeMs: elapsed,
    };
  }

  // 4. Kiểm tra Access Token
  const effectiveToken = pageAccessToken || process.env.META_TEST_PAGE_ACCESS_TOKEN || "";
  if (!effectiveToken) {
    const tokenErr = "Chưa cấu hình Page Access Token hợp lệ cho Fanpage này (Kiểm tra cấu hình kênh hoặc biến môi trường META_TEST_PAGE_ACCESS_TOKEN).";
    recordMessageAudit({
      staffId,
      staffName,
      staffConfirmed: true,
      channel: "FACEBOOK",
      recipient: cleanPsid,
      text: cleanText,
      status: "failed",
      provider: "META_GRAPH_API",
      error: tokenErr,
    });
    return { ok: false, status: "failed", error: tokenErr };
  }

  // 5. Kiểm tra chống gửi lặp trong 5 giây (Idempotency)
  cleanOldIdempotencyRecords();
  const idemKey = `fb_${pageId}_${cleanPsid}_${cleanText}`;
  const lastSent = recentMetaSends.get(idemKey);
  if (lastSent && Date.now() - lastSent < 5000) {
    const dupErr = "Phát hiện gửi lặp: Tin nhắn tương tự vừa được gửi tới người nhận này trong vòng 5 giây.";
    recordMessageAudit({
      staffId,
      staffName,
      staffConfirmed: true,
      channel: "FACEBOOK",
      recipient: cleanPsid,
      text: cleanText,
      status: "failed",
      provider: "META_GRAPH_API",
      error: dupErr,
    });
    return { ok: false, status: "failed", error: dupErr };
  }
  recentMetaSends.set(idemKey, Date.now());

  // 6. Gửi request chính thức tới Meta Graph API với timeout
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), META_SEND_TIMEOUT_MS);

  try {
    const endpoint = `https://graph.facebook.com/${GRAPH_API_VERSION}/me/messages?access_token=${encodeURIComponent(
      effectiveToken
    )}`;

    const payload = {
      recipient: { id: cleanPsid },
      message: { text: cleanText },
      messaging_type: messageTag ? "MESSAGE_TAG" : "RESPONSE",
      ...(messageTag ? { tag: messageTag } : {}),
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const elapsed = Date.now() - startTime;
    const data = await res.json().catch(() => null);

    if (res.ok && data?.message_id) {
      recordMessageAudit({
        staffId,
        staffName,
        staffConfirmed: true,
        channel: "FACEBOOK",
        recipient: cleanPsid,
        text: cleanText,
        status: "sent",
        provider: "META_GRAPH_API",
        providerHttpCode: res.status,
        providerMsgId: data.message_id,
        responseTimeMs: elapsed,
        mocked: false,
        safeMode: false,
      });

      return {
        ok: true,
        status: "sent",
        provider: "META_GRAPH_API",
        messageId: data.message_id,
        recipientId: data.recipient_id || cleanPsid,
        responseTimeMs: elapsed,
      };
    }

    // Xử lý chi tiết các mã lỗi từ Meta
    const metaError = data?.error;
    const errorCode = metaError?.code;
    const subcode = metaError?.error_subcode;
    let friendlyMessage = metaError?.message || `Lỗi máy chủ Meta (HTTP ${res.status}).`;

    if (errorCode === 190) {
      friendlyMessage = "Token Fanpage đã hết hạn hoặc bị thu hồi (Meta Code 190). Vui lòng cấp lại Page Access Token.";
    } else if (errorCode === 200 || errorCode === 230) {
      friendlyMessage = `Lỗi phân quyền Fanpage (Meta Code ${errorCode}): Ứng dụng chưa được cấp quyền pages_messaging.`;
    } else if (errorCode === 551) {
      friendlyMessage = "Người dùng này hiện không khả dụng hoặc đã chặn tin nhắn từ Fanpage (Meta Code 551).";
    } else if (errorCode === 10) {
      friendlyMessage = "Vi phạm cửa sổ phản hồi 24 giờ của Meta hoặc cần đăng ký Message Tag phù hợp (Meta Code 10).";
    }

    recordMessageAudit({
      staffId,
      staffName,
      staffConfirmed: true,
      channel: "FACEBOOK",
      recipient: cleanPsid,
      text: cleanText,
      status: "failed",
      provider: "META_GRAPH_API",
      providerHttpCode: res.status,
      providerErrorCode: `${errorCode ?? "ERR"}${subcode ? `:${subcode}` : ""}`,
      responseTimeMs: elapsed,
      mocked: false,
      safeMode: false,
      error: friendlyMessage,
    });

    return {
      ok: false,
      status: "failed",
      provider: "META_GRAPH_API",
      error: friendlyMessage,
      providerHttpCode: res.status,
      providerErrorCode: errorCode,
      responseTimeMs: elapsed,
    };
  } catch (netErr) {
    clearTimeout(timer);
    const elapsed = Date.now() - startTime;
    const isTimeout = netErr.name === "AbortError";
    const netErrMsg = isTimeout
      ? `Quá thời gian chờ phản hồi từ Meta Graph API (${META_SEND_TIMEOUT_MS}ms).`
      : `Lỗi kết nối mạng tới Meta Graph API: ${netErr.message}`;

    recordMessageAudit({
      staffId,
      staffName,
      staffConfirmed: true,
      channel: "FACEBOOK",
      recipient: cleanPsid,
      text: cleanText,
      status: "failed",
      provider: "META_GRAPH_API",
      providerErrorCode: isTimeout ? "TIMEOUT" : "NETWORK_ERROR",
      responseTimeMs: elapsed,
      mocked: false,
      safeMode: false,
      error: netErrMsg,
    });

    return {
      ok: false,
      status: "failed",
      provider: "META_GRAPH_API",
      error: netErrMsg,
      responseTimeMs: elapsed,
    };
  }
}
