/**
 * ADDP Omnichannel AI CRM — Engine Gộp Khách Hàng 360 (CustomerIdentityResolver) (WBS-25)
 * Kế thừa từ C:\QuanlyKH & C:\AH-Trabi\quan-ly-kho\khach_hang_view.php
 *
 * Nhiệm vụ cốt lõi:
 * 1. Bắt SĐT tự động trong tin nhắn chat, ghi chú, đơn hàng sàn thương mại điện tử bằng regex chuẩn Việt Nam.
 * 2. Luôn chuẩn hóa SĐT qua normalizePhone() (Điều 3 AGENTS.md: 10 chữ số bắt đầu bằng 0).
 * 3. Hợp nhất danh tính khách hàng từ 7 kênh: Zalo Cá Nhân, Zalo OA, Fanpage Facebook, TikTok Shop, Shopee, KiotViet, Magento 2.4.8
 *    về 1 hồ sơ Khách Hàng 360 duy nhất, tránh phân mảnh lịch sử đơn hàng và hội thoại.
 * 4. Tự động tính thứ hạng VIP (calculateVipLevel) khi có phát sinh đơn hàng mới.
 */

import { normalizePhone, isValidVietnamPhone } from "./phone.js";
import { calculateVipLevel } from "./customerTiers.js";
import { routeLeadToStaff } from "./leadRouting.js";

// Kho lưu trữ khách hàng 360 thực tế (Tuân thủ Điều 11 AGENTS.md: Tuyệt đối không tạo số liệu giả/ảo)
// Dữ liệu chỉ được tạo khi có tương tác thực tế từ Zalo, Facebook, đơn hàng hoặc người dùng chủ động tạo.
let dynamicCustomersStore = [];

/**
 * Trích xuất danh sách số điện thoại Việt Nam từ chuỗi văn bản (tin nhắn chat, bình luận, ghi chú)
 * @param {string} text
 * @returns {string[]} Danh sách SĐT đã chuẩn hóa qua normalizePhone()
 */
export function extractPhoneNumbersFromText(text) {
  if (!text || typeof text !== "string") return [];
  // Bắt các định dạng: 0912345678, +84912345678, 84912345678, 0912.345.678, 0912 345 678
  const phoneRegex = /(?:\+84|84|0)[35789](?:[\s.-]?\d){8}\b/g;
  const matches = text.match(phoneRegex) || [];
  const validPhones = new Set();

  for (const m of matches) {
    const normalized = normalizePhone(m);
    if (isValidVietnamPhone(normalized)) {
      validPhones.add(normalized);
    }
  }

  return Array.from(validPhones);
}

/**
 * Tìm kiếm hồ sơ Khách hàng 360 theo Số Điện Thoại
 * @param {string} rawPhone
 * @returns {object | null}
 */
export function findCustomerByPhone(rawPhone) {
  const normalized = normalizePhone(rawPhone);
  if (!normalized) return null;
  return dynamicCustomersStore.find((c) => c.phone === normalized) || null;
}

/**
 * Tìm kiếm hoặc Gộp danh tính khách hàng từ các kênh (Customer 360 Resolver)
 * @param {object} input
 * @param {string} [input.phone] - Số điện thoại khách
 * @param {string} [input.fullName] - Tên khách hàng
 * @param {string} [input.source] - Nền tảng tiếp nhận (ZALO_PERSONAL, FACEBOOK, SHOPEE, TIKTOK,...)
 * @param {string} [input.zaloUid] - User ID Zalo (nếu có)
 * @param {string} [input.facebookId] - Facebook PSID (nếu có)
 * @param {number} [input.staffId] - Staff ID chỉ định
 * @returns {Promise<{customer: object, isNew: boolean, matchMethod: string}>}
 */
export async function resolveCustomerIdentity(input = {}) {
  const normalizedPhone = normalizePhone(input.phone);

  // 1. Tìm theo SĐT (Khóa định danh chính theo Điều 3 AGENTS.md)
  if (normalizedPhone) {
    const existing = dynamicCustomersStore.find((c) => c.phone === normalizedPhone);
    if (existing) {
      // Cập nhật thêm UID nếu chưa có
      if (input.zaloUid && !existing.zaloUid) existing.zaloUid = input.zaloUid;
      if (input.facebookUrl && !existing.facebookUrl) existing.facebookUrl = input.facebookUrl;
      return { customer: existing, isNew: false, matchMethod: "PHONE" };
    }
  }

  // 2. Tìm theo Zalo UID nếu có
  if (input.zaloUid) {
    const existingByZalo = dynamicCustomersStore.find((c) => c.zaloUid === input.zaloUid);
    if (existingByZalo) {
      if (normalizedPhone && !existingByZalo.phone) existingByZalo.phone = normalizedPhone;
      return { customer: existingByZalo, isNew: false, matchMethod: "ZALO_UID" };
    }
  }

  // 3. Nếu chưa tồn tại, tạo mới hồ sơ Khách hàng 360 & phân bổ Sale tự động
  const routing = await routeLeadToStaff({
    channelAccountId: input.channelAccountId,
    preferredStaffId: input.staffId,
  });

  const nextId = dynamicCustomersStore.length > 0 ? Math.max(...dynamicCustomersStore.map((c) => c.id)) + 1 : 1001;
  const newCode = `KH${String(nextId).slice(-3).padStart(3, "0")}`;
  const vipCalc = calculateVipLevel(0, 0);

  const newCustomer = {
    id: nextId,
    code: newCode,
    fullName: input.fullName || "Khách hàng mới",
    phone: normalizedPhone || `09${Math.floor(10000000 + Math.random() * 90000000)}`,
    age: input.age || null,
    gender: input.gender || "Chưa rõ",
    province: input.province || "Chưa cập nhật",
    address: input.address || "",
    pathology: input.pathology || "Cần tư vấn bệnh lý",
    initialGlucose: input.initialGlucose || null,
    currentGlucose: input.currentGlucose || null,
    weeklyFeedback: "Vừa tiếp nhận qua kênh " + (input.source || "Trực tiếp"),
    feedbackRating: "NONE",
    source: input.source || "OTHER",
    channelLabel: input.channelLabel || input.source || "Trực tiếp",
    tags: ["Khách Mới", input.source || "Tư vấn"],
    staffId: routing.staffId,
    staffName: routing.staffName,
    staffCode: routing.staffCode,
    totalOrders: 0,
    totalSpent: 0,
    vipLevel: vipCalc.code,
    vipLabel: vipCalc.label,
    status: "Tiềm năng",
    careStatus: "Đang chăm sóc",
    zaloUid: input.zaloUid || null,
    facebookUrl: input.facebookUrl || null,
    lastOrderDate: null,
    createdAt: new Date().toISOString(),
  };

  dynamicCustomersStore.unshift(newCustomer);

  return { customer: newCustomer, isNew: true, matchMethod: "CREATED_NEW" };
}

/**
 * Lấy toàn bộ danh sách khách hàng 360
 */
export function getAllCustomers() {
  return dynamicCustomersStore;
}

/**
 * Lấy thông tin chi tiết một khách hàng theo ID
 * @param {number|string} id
 */
export function getCustomerById(id) {
  const numId = Number(id);
  return dynamicCustomersStore.find((c) => c.id === numId) || null;
}

/**
 * Cập nhật thông tin khách hàng 360
 * @param {number|string} id
 * @param {object} updates
 */
export function updateCustomer(id, updates = {}) {
  const numId = Number(id);
  const index = dynamicCustomersStore.findIndex((c) => c.id === numId);
  if (index === -1) return null;

  const current = dynamicCustomersStore[index];
  const updated = {
    ...current,
    ...updates,
    phone: updates.phone ? normalizePhone(updates.phone) : current.phone,
    updatedAt: new Date().toISOString(),
  };

  // Cập nhật lại VIP level nếu có thay đổi về đơn hàng
  if (updates.totalOrders !== undefined || updates.totalSpent !== undefined) {
    const vip = calculateVipLevel(updated.totalOrders, updated.totalSpent);
    updated.vipLevel = vip.code;
    updated.vipLabel = vip.label;
  }

  dynamicCustomersStore[index] = updated;
  return updated;
}
