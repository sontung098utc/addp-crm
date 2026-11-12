import { isSafePilotMode } from "../pilotConfig.js";
import { recordMessageAudit, maskRecipient } from "./messageAuditLogger.js";

/**
 * ADDP CRM — ADAPTER GỬI TIN NHẮN ZALO OA CHÍNH THỨC (ZALO OPENAPI V3)
 * - Sử dụng giao thức chính thức Zalo OpenAPI v3.0 /oa/message/cs (Chăm sóc khách hàng).
 * - KHÔNG sử dụng trình duyệt tự động hóa, cào dữ liệu hoặc giả lập đăng nhập.
 * - Kiểm soát an toàn: Xác nhận từ nhân viên, danh sách người nhận thử nghiệm Staging,
 *   chống gửi lặp (idempotency 5s), timeout 10s, che giấu thông tin nhạy cảm.
 * - TUYỆT ĐỐI KHÔNG commit hoặc ghi Access Token vào log/mã nguồn.
 */

const ZALO_OA_ENDPOINT = process.env.ZALO_OA_CS_ENDPOINT || "https://openapi.zalo.me/v3.0/oa/message/cs";
const ZALO_OA_TIMEOUT_MS = Number(process.env.ZALO_OA_TIMEOUT_MS) || 10000;

// Bộ nhớ đệm chống gửi trùng lặp tin nhắn trong 5 giây (RAM cache)
if (!globalThis.__ZALO_OA_IDEMPOTENCY_CACHE__) {
  globalThis.__ZALO_OA_IDEMPOTENCY_CACHE__ = new Map();
}
const recentZaloOaSends = globalThis.__ZALO_OA_IDEMPOTENCY_CACHE__;

function cleanOldIdempotencyRecords() {
  const now = Date.now();
  for (const [k, ts] of recentZaloOaSends.entries()) {
    if (now - ts > 15000) {
      recentZaloOaSends.delete(k);
    }
  }
}

/**
 * Kiểm tra danh sách người nhận thử nghiệm được phép trên Staging
 */
function isAllowedStagingRecipient(recipientUserId) {
  const isStagingOnly =
    process.env.STAGING_TEST_ONLY_MODE === "true" ||
    process.env.NODE_ENV === "test" ||
    Boolean(process.env.STAGING_CONTROLLED_RECIPIENTS);

  if (!isStagingOnly) return true;

  const rawAllowed = [
    process.env.STAGING_CONTROLLED_RECIPIENTS || "",
    process.env.ZALO_OA_TEST_RECIPIENT_USER_ID || "",
  ]
    .join(",")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (rawAllowed.length === 0) return true;
  return rawAllowed.includes(String(recipientUserId).trim());
}

/**
 * Gửi tin nhắn 1-1 chính thức qua Zalo OpenAPI v3
 */
export async function sendZaloOaMessage({
  oaId = "",
  accessToken = "",
  recipientUserId = "",
  text = "",
  staffId = "STAFF",
  staffName = "Chuyên viên ADDP",
  staffConfirmed = false,
}) {
  const startTime = Date.now();
  const cleanUserId = String(recipientUserId || "").trim();
  const cleanText = String(text || "").trim();

  // 1. Kiểm tra xác nhận chủ động từ nhân viên
  if (!staffConfirmed) {
    const errorMsg = "Yêu cầu xác nhận chủ động từ nhân viên trước khi gửi tin nhắn thật qua Zalo OA.";
    recordMessageAudit({
      staffId,
      staffName,
      staffConfirmed: false,
      channel: "ZALO_OA",
      recipient: cleanUserId,
      text: cleanText,
      status: "failed",
      provider: "ZALO_OPENAPI",
      error: errorMsg,
    });
    return { ok: false, status: "failed", error: errorMsg };
  }

  if (!cleanUserId) {
    return { ok: false, status: "failed", error: "Thiếu User ID người nhận trên Zalo OA." };
  }
  if (!cleanText) {
    return { ok: false, status: "failed", error: "Nội dung tin nhắn không được để trống." };
  }

  // 2. Chặn an toàn trên môi trường Staging: Chỉ gửi tới tài khoản thử nghiệm do công ty kiểm soát
  if (!isAllowedStagingRecipient(cleanUserId)) {
    const safeError = `CHẶN AN TOÀN STAGING: Zalo User ID (${maskRecipient(cleanUserId)}) không nằm trong danh sách tài khoản thử nghiệm nội bộ do công ty kiểm soát (STAGING_CONTROLLED_RECIPIENTS). Không gửi tới khách hàng thật.`;
    recordMessageAudit({
      staffId,
      staffName,
      staffConfirmed: true,
      channel: "ZALO_OA",
      recipient: cleanUserId,
      text: cleanText,
      status: "failed",
      provider: "ZALO_OPENAPI",
      error: safeError,
    });
    return { ok: false, status: "failed", error: safeError };
  }

  // 3. Trong Safe Mode: Bắt buộc không gọi ra provider bên ngoài, ghi nhận trạng thái mocked
  if (isSafePilotMode()) {
    const mockMsgId = `mock_oa_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const elapsed = Date.now() - startTime;
    recordMessageAudit({
      staffId,
      staffName,
      staffConfirmed: true,
      channel: "ZALO_OA",
      recipient: cleanUserId,
      text: cleanText,
      status: "mocked",
      provider: "ZALO_OPENAPI",
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
      provider: "ZALO_OPENAPI",
      messageId: mockMsgId,
      message: "[Safe Mode] Đã mô phỏng gửi tin nhắn Zalo OpenAPI an toàn (không gọi internet).",
      responseTimeMs: elapsed,
    };
  }

  // 4. Kiểm tra Access Token
  const effectiveToken = accessToken || process.env.ZALO_OA_TEST_ACCESS_TOKEN || "";
  if (!effectiveToken) {
    const tokenErr = "Chưa cấu hình Access Token hợp lệ cho Zalo OA này (Kiểm tra cấu hình kênh hoặc biến môi trường ZALO_OA_TEST_ACCESS_TOKEN).";
    recordMessageAudit({
      staffId,
      staffName,
      staffConfirmed: true,
      channel: "ZALO_OA",
      recipient: cleanUserId,
      text: cleanText,
      status: "failed",
      provider: "ZALO_OPENAPI",
      error: tokenErr,
    });
    return { ok: false, status: "failed", error: tokenErr };
  }

  // 5. Kiểm tra chống gửi lặp trong 5 giây (Idempotency)
  cleanOldIdempotencyRecords();
  const idemKey = `oa_${oaId}_${cleanUserId}_${cleanText}`;
  const lastSent = recentZaloOaSends.get(idemKey);
  if (lastSent && Date.now() - lastSent < 5000) {
    const dupErr = "Phát hiện gửi lặp: Tin nhắn tương tự vừa được gửi tới người nhận này trong vòng 5 giây.";
    recordMessageAudit({
      staffId,
      staffName,
      staffConfirmed: true,
      channel: "ZALO_OA",
      recipient: cleanUserId,
      text: cleanText,
      status: "failed",
      provider: "ZALO_OPENAPI",
      error: dupErr,
    });
    return { ok: false, status: "failed", error: dupErr };
  }
  recentZaloOaSends.set(idemKey, Date.now());

  // 6. Gửi request chính thức tới Zalo OpenAPI với timeout
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ZALO_OA_TIMEOUT_MS);

  try {
    const payload = {
      recipient: { user_id: cleanUserId },
      message: { text: cleanText },
    };

    const res = await fetch(ZALO_OA_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        access_token: effectiveToken,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const elapsed = Date.now() - startTime;
    const data = await res.json().catch(() => null);

    // Zalo OpenAPI v3 quy ước: error === 0 là thành công
    if (res.ok && data?.error === 0) {
      const msgId = data?.data?.message_id || `oa_mid_${Date.now()}`;
      recordMessageAudit({
        staffId,
        staffName,
        staffConfirmed: true,
        channel: "ZALO_OA",
        recipient: cleanUserId,
        text: cleanText,
        status: "sent",
        provider: "ZALO_OPENAPI",
        providerHttpCode: res.status,
        providerMsgId: msgId,
        responseTimeMs: elapsed,
        mocked: false,
        safeMode: false,
      });

      return {
        ok: true,
        status: "sent",
        provider: "ZALO_OPENAPI",
        messageId: msgId,
        recipientId: cleanUserId,
        responseTimeMs: elapsed,
      };
    }

    // Xử lý chi tiết các mã lỗi từ Zalo OpenAPI
    const errCode = data?.error;
    let friendlyMessage = data?.message || `Lỗi từ Zalo OpenAPI (Mã ${errCode ?? "UNKNOWN"}).`;

    if (errCode === -216 || errCode === -204) {
      friendlyMessage = "Access Token Zalo OA đã hết hạn hoặc không hợp lệ (Mã -216). Vui lòng làm mới Access Token trong Zalo Developers.";
    } else if (errCode === -213) {
      friendlyMessage = "Người dùng đã quá 48 giờ chưa nhắn tin với Zalo OA (Mã -213). Không thể gửi tin nhắn CSKH miễn phí.";
    } else if (errCode === -212) {
      friendlyMessage = "Người dùng chưa quan tâm hoặc đã chặn/từ chối nhận tin nhắn từ Zalo OA này (Mã -212).";
    } else if (errCode === -215) {
      friendlyMessage = "Zalo OA đã vượt quá hạn mức tin nhắn trong ngày hoặc gói dịch vụ (Mã -215).";
    }

    recordMessageAudit({
      staffId,
      staffName,
      staffConfirmed: true,
      channel: "ZALO_OA",
      recipient: cleanUserId,
      text: cleanText,
      status: "failed",
      provider: "ZALO_OPENAPI",
      providerHttpCode: res.status,
      providerErrorCode: String(errCode ?? "ERR"),
      responseTimeMs: elapsed,
      mocked: false,
      safeMode: false,
      error: friendlyMessage,
    });

    return {
      ok: false,
      status: "failed",
      provider: "ZALO_OPENAPI",
      error: friendlyMessage,
      providerHttpCode: res.status,
      providerErrorCode: errCode,
      responseTimeMs: elapsed,
    };
  } catch (netErr) {
    clearTimeout(timer);
    const elapsed = Date.now() - startTime;
    const isTimeout = netErr.name === "AbortError";
    const netErrMsg = isTimeout
      ? `Quá thời gian chờ phản hồi từ Zalo OpenAPI (${ZALO_OA_TIMEOUT_MS}ms).`
      : `Lỗi kết nối mạng tới Zalo OpenAPI: ${netErr.message}`;

    recordMessageAudit({
      staffId,
      staffName,
      staffConfirmed: true,
      channel: "ZALO_OA",
      recipient: cleanUserId,
      text: cleanText,
      status: "failed",
      provider: "ZALO_OPENAPI",
      providerErrorCode: isTimeout ? "TIMEOUT" : "NETWORK_ERROR",
      responseTimeMs: elapsed,
      mocked: false,
      safeMode: false,
      error: netErrMsg,
    });

    return {
      ok: false,
      status: "failed",
      provider: "ZALO_OPENAPI",
      error: netErrMsg,
      responseTimeMs: elapsed,
    };
  }
}
