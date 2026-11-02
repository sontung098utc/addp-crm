/**
 * Chuẩn hóa số điện thoại Việt Nam theo Điều 3 - AGENTS.md
 * Mọi SĐT từ Magento 2.4.8, KiotViet, TikTok Shop, Shopee, Fanpage, Zalo
 * khi lưu vào DB hoặc tìm kiếm BẮT BUỘC phải qua hàm này để gộp hồ sơ Khách hàng 360.
 *
 * Ví dụ:
 *   "+84 912 345 678" -> "0912345678"
 *   "84912345678"     -> "0912345678"
 *   "912345678"       -> "0912345678"
 *
 * @param {string | number | null | undefined} rawPhone
 * @returns {string} Số điện thoại đã chuẩn hóa (hoặc chuỗi rỗng nếu không hợp lệ)
 */
export function normalizePhone(rawPhone) {
  if (rawPhone === null || rawPhone === undefined) return "";
  let digits = String(rawPhone).replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("0084")) {
    digits = "0" + digits.slice(4);
  } else if (digits.startsWith("84") && digits.length >= 10) {
    digits = "0" + digits.slice(2);
  } else if (digits.length === 9 && !digits.startsWith("0")) {
    digits = "0" + digits;
  }

  return digits;
}

/**
 * Kiểm tra SĐT có đúng chuẩn di động Việt Nam 10 chữ số (03, 05, 07, 08, 09) hay không
 * @param {string} phone
 * @returns {boolean}
 */
export function isValidVietnamPhone(phone) {
  const normalized = normalizePhone(phone);
  return /^0[35789]\d{8}$/.test(normalized);
}
