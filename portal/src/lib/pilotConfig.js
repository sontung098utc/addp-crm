/**
 * ADDP AI CRM — CẤU HÌNH AN TOÀN CHẾ ĐỘ PILOT & QA CỤC BỘ (WBS-PILOT-SAFE)
 * Quản lý cờ an toàn cách ly, ngăn chặn vô tình kích hoạt API bên thứ 3 và thống nhất định mức.
 */

// 1. Cờ an toàn chế độ Pilot / QA: Tắt gửi tin thật, tắt broadcast thật, mock thao tác tồn kho
export const IS_PILOT_SAFE_MODE =
  process.env.PILOT_SAFE_MODE === "true" ||
  process.env.QA_OFFLINE_MODE === "true" ||
  process.env.NODE_ENV === "test";

// 2. Cờ tắt đồng bộ tự động với các API bên thứ 3 (Facebook Graph API, TikTok Shop API, Zalo MCP Daemon)
export const IS_AUTO_SYNC_DISABLED =
  process.env.QA_DISABLE_AUTO_SYNC === "true" ||
  process.env.PILOT_DISABLE_AUTO_SYNC === "true" ||
  IS_PILOT_SAFE_MODE;

// 3. Định mức giới hạn tin nhắn Zalo cá nhân duy nhất toàn hệ thống (Điều 4 AGENTS.md)
// Mặc định: 70 tin/ngày/nick (đọc từ biến môi trường DAILY_ZALO_MSG_LIMIT nếu được cấu hình)
export const DEFAULT_DAILY_ZALO_MSG_LIMIT = Math.max(
  1,
  Number(process.env.DAILY_ZALO_MSG_LIMIT) || 70
);

/**
 * Kiểm tra xem hệ thống có đang ở chế độ an toàn hay không
 */
export function isSafePilotMode() {
  return IS_PILOT_SAFE_MODE;
}

/**
 * Kiểm tra xem có được phép gọi API đồng bộ bên ngoài hay không
 */
export function isAutoSyncAllowed() {
  return !IS_AUTO_SYNC_DISABLED;
}
