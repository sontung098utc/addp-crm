import fs from "fs";
import path from "path";
import crypto from "crypto";

/**
 * ADDP AI CRM — KHO KIỂM SOÁT TÍNH BẢO TOÀN VÀ CHỐNG TRÙNG LẶP (IDEMPOTENCY STORE)
 * Đảm bảo các Webhook và thao tác tài chính/tồn kho/đơn hàng lặp lại không bị xử lý nhiều lần.
 */

function resolveIdempotencyFilePath() {
  const candidates = [
    path.resolve(process.cwd(), ".data", "webhook_idempotency.json"),
    path.resolve(process.cwd(), "portal", ".data", "webhook_idempotency.json"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) || fs.existsSync(path.dirname(c))) {
      return c;
    }
  }
  const fallback = candidates[0];
  fs.mkdirSync(path.dirname(fallback), { recursive: true });
  return fallback;
}

const IDEMPOTENCY_FILE = resolveIdempotencyFilePath();

// Bộ nhớ cache nhanh trong RAM
if (!globalThis.__IDEMPOTENCY_CACHE__) {
  globalThis.__IDEMPOTENCY_CACHE__ = new Map();
}
const memCache = globalThis.__IDEMPOTENCY_CACHE__;

function loadStoredIdempotency() {
  try {
    if (fs.existsSync(IDEMPOTENCY_FILE)) {
      const raw = fs.readFileSync(IDEMPOTENCY_FILE, "utf8").replace(/^\uFEFF/, "");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item?.key) {
            memCache.set(item.key, item);
          }
        }
      }
    }
  } catch (err) {
    console.error("[IDEMPOTENCY_LOAD_ERROR]", err.message);
  }
}

// Khởi tạo một lần
loadStoredIdempotency();

function saveStoredIdempotency() {
  try {
    const dir = path.dirname(IDEMPOTENCY_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const items = Array.from(memCache.values()).slice(-2000); // Giữ tối đa 2000 bản ghi gần nhất
    fs.writeFileSync(IDEMPOTENCY_FILE, JSON.stringify(items, null, 2), "utf8");
  } catch (err) {
    console.error("[IDEMPOTENCY_SAVE_ERROR]", err.message);
  }
}

/**
 * Kiểm tra xem một Idempotency Key đã được xử lý hay chưa
 * @param {string} key Khóa duy nhất (ví dụ: `kiotviet_invoice_HD001`)
 * @returns {boolean}
 */
export function isIdempotencyKeyProcessed(key) {
  if (!key) return false;
  const item = memCache.get(String(key).trim());
  return Boolean(item && item.status === "PROCESSED");
}

/**
 * Đặt chỗ nguyên tử (Atomic reservation) cho Idempotency Key trước khi bắt đầu xử lý request
 * Ngăn chặn Race Condition khi nhiều webhook giống hệt nhau gửi đến đồng thời (cùng millisecond).
 * @param {string} key
 * @param {number} [ttlMs=60000] Thời gian giữ chỗ tối đa (mặc định 60s)
 * @returns {{ reserved: boolean, status: string, reason?: string }}
 */
export function reserveIdempotencyKey(key, ttlMs = 60000) {
  if (!key) return { reserved: false, status: "INVALID_KEY", reason: "Khóa không hợp lệ" };
  const cleanKey = String(key).trim();
  const now = Date.now();
  const existing = memCache.get(cleanKey);

  if (existing) {
    if (existing.status === "PROCESSED") {
      return { reserved: false, status: "PROCESSED", reason: "Yêu cầu đã được xử lý thành công trước đó." };
    }
    // Nếu đang IN_PROGRESS và chưa hết hạn TTL
    if (existing.status === "IN_PROGRESS" && existing.reservedAt && (now - existing.reservedAt) < ttlMs) {
      return { reserved: false, status: "IN_PROGRESS", reason: "Yêu cầu tương đương đang được xử lý song song." };
    }
  }

  // Đặt chỗ ngay lập tức trong bộ nhớ
  memCache.set(cleanKey, {
    key: cleanKey,
    status: "IN_PROGRESS",
    reservedAt: now,
  });
  return { reserved: true, status: "RESERVED" };
}

/**
 * Hủy đặt chỗ nếu request gặp lỗi không mong muốn để cho phép retry sau
 */
export function releaseIdempotencyReservation(key) {
  if (!key) return;
  const cleanKey = String(key).trim();
  const existing = memCache.get(cleanKey);
  if (existing && existing.status === "IN_PROGRESS") {
    memCache.delete(cleanKey);
  }
}

/**
 * Lấy thông tin bản ghi Idempotency đã xử lý
 */
export function getIdempotencyRecord(key) {
  if (!key) return null;
  return memCache.get(String(key).trim()) || null;
}

/**
 * Đánh dấu một key đã được xử lý thành công
 * @param {string} key
 * @param {object} metadata
 */
export function markIdempotencyKeyProcessed(key, metadata = {}) {
  if (!key) return;
  const cleanKey = String(key).trim();
  const record = {
    key: cleanKey,
    processedAt: new Date().toISOString(),
    status: "PROCESSED",
    ...metadata,
  };
  memCache.set(cleanKey, record);
  saveStoredIdempotency();
  return record;
}

/**
 * Tạo hash băm SHA-256 từ payload để kiểm tra trùng nội dung
 */
export function hashPayload(payload) {
  const str = typeof payload === "string" ? payload : JSON.stringify(payload || {});
  return crypto.createHash("sha256").update(str).digest("hex");
}
