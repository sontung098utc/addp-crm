import fs from "fs";
import path from "path";

/**
 * ADDP CRM — NHẬT KÝ KIỂM TOÁN GỬI TIN NHẮN (MESSAGE AUDIT LOGGER)
 * Ghi nhận chính xác 100% mọi lượt gửi tin nhắn đa kênh:
 * - Thời điểm, người gửi (staffId, staffName), trạng thái (queued, sent, failed, mocked).
 * - Nhà cung cấp (META_GRAPH_API, ZALO_OPENAPI, ZALO_CLI_EXPERIMENTAL, PILOT_MOCK).
 * - Mã phản hồi HTTP, mã lỗi từ provider, ID tin nhắn trả về.
 * - Che dấu thông tin nhạy cảm (SĐT, ID khách hàng), TUYỆT ĐỐI không lưu Access Token.
 */

function resolveAuditLogPath() {
  const candidates = [
    path.resolve(process.cwd(), ".data", "message_audit_log.json"),
    path.resolve(process.cwd(), "portal", ".data", "message_audit_log.json"),
    path.resolve(process.cwd(), "data", "message_audit_log.json"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) || fs.existsSync(path.dirname(c))) {
      return c;
    }
  }
  const fallback = candidates[0];
  try {
    fs.mkdirSync(path.dirname(fallback), { recursive: true });
  } catch {}
  return fallback;
}

const AUDIT_FILE = resolveAuditLogPath();

if (!globalThis.__ADDP_MESSAGE_AUDIT_LOGS__) {
  globalThis.__ADDP_MESSAGE_AUDIT_LOGS__ = [];
  try {
    if (fs.existsSync(AUDIT_FILE)) {
      const raw = fs.readFileSync(AUDIT_FILE, "utf8").replace(/^\uFEFF/, "");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        globalThis.__ADDP_MESSAGE_AUDIT_LOGS__ = parsed.slice(-1000);
      }
    }
  } catch {}
}

const auditMemoryStore = globalThis.__ADDP_MESSAGE_AUDIT_LOGS__;

function persistAuditLogs() {
  try {
    const dir = path.dirname(AUDIT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      AUDIT_FILE,
      JSON.stringify(auditMemoryStore.slice(-1000), null, 2),
      "utf8"
    );
  } catch (err) {
    console.warn("[AUDIT_PERSIST_WARN]", err.message);
  }
}

/**
 * Che dấu ID người nhận để bảo vệ quyền riêng tư (VD: "1234567890" -> "123****890")
 */
export function maskRecipient(id = "") {
  const s = String(id || "").trim();
  if (!s) return "ANONYMOUS";
  if (s.length <= 4) return "****";
  if (s.length <= 8) return `${s.slice(0, 2)}****${s.slice(-2)}`;
  return `${s.slice(0, 3)}****${s.slice(-3)}`;
}

/**
 * Che dấu số điện thoại khách hàng (VD: "0901234567" -> "090***4567")
 */
export function maskPhone(phone = "") {
  const p = String(phone || "").trim();
  if (!p) return "";
  if (p.length < 8) return "****";
  return `${p.slice(0, 3)}***${p.slice(-4)}`;
}

/**
 * Ghi nhận một sự kiện kiểm toán gửi tin nhắn
 */
export function recordMessageAudit({
  staffId = "SYSTEM",
  staffName = "Hệ thống",
  staffConfirmed = false,
  channel = "UNKNOWN",
  recipient = "",
  recipientMasked = "",
  text = "",
  status = "queued", // "queued" | "sent" | "failed" | "mocked"
  provider = "PILOT_MOCK", // "META_GRAPH_API" | "ZALO_OPENAPI" | "ZALO_CLI_EXPERIMENTAL" | "PILOT_MOCK"
  providerHttpCode = null,
  providerErrorCode = null,
  providerMsgId = null,
  responseTimeMs = 0,
  mocked = false,
  safeMode = false,
  error = null,
}) {
  const record = {
    id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    staffId: String(staffId || "SYSTEM"),
    staffName: String(staffName || "Hệ thống"),
    staffConfirmed: Boolean(staffConfirmed),
    channel: String(channel).toUpperCase(),
    recipientMasked: recipientMasked || maskRecipient(recipient),
    messageSnippet: String(text || "").slice(0, 80),
    status,
    provider,
    providerHttpCode: providerHttpCode !== null ? Number(providerHttpCode) : null,
    providerErrorCode: providerErrorCode !== null ? String(providerErrorCode) : null,
    providerMsgId: providerMsgId ? String(providerMsgId) : null,
    responseTimeMs: Math.max(0, Math.round(Number(responseTimeMs) || 0)),
    mocked: Boolean(mocked),
    safeMode: Boolean(safeMode),
    error: error ? String(error) : null,
  };

  auditMemoryStore.push(record);
  if (auditMemoryStore.length > 1000) {
    auditMemoryStore.splice(0, auditMemoryStore.length - 1000);
  }
  persistAuditLogs();

  // Log có kiểm soát với thông tin đã được che
  const safeLogMsg = `[MESSAGE_AUDIT] Staff: ${record.staffId} (${record.staffName}) -> ${record.channel} to ${record.recipientMasked} | Status: ${record.status} | Provider: ${record.provider} (HTTP ${record.providerHttpCode ?? "N/A"}) | Elapsed: ${record.responseTimeMs}ms${record.error ? ` | Error: ${record.error}` : ""}`;
  if (record.status === "failed") {
    console.error(safeLogMsg);
  } else {
    console.log(safeLogMsg);
  }

  return record;
}

/**
 * Lấy danh sách kiểm toán gần nhất
 */
export function getRecentMessageAudits(limit = 50) {
  return auditMemoryStore.slice(-Math.min(200, Math.max(1, limit))).reverse();
}
