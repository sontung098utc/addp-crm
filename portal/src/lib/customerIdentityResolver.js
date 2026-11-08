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

import fs from "fs";
import path from "path";
import { normalizePhone, isValidVietnamPhone } from "./phone.js";
export { normalizePhone, isValidVietnamPhone };
import { calculateVipLevel } from "./customerTiers.js";
import { routeLeadToStaff } from "./leadRouting.js";

const CUSTOMERS_FILE_PATH = path.join(process.cwd(), ".data", "customers.json");

function ensureStorage() {
  const dir = path.dirname(CUSTOMERS_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadPersistedCustomers() {
  ensureStorage();
  try {
    if (fs.existsSync(CUSTOMERS_FILE_PATH)) {
      const data = fs.readFileSync(CUSTOMERS_FILE_PATH, "utf8");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.error("Lỗi đọc file customers.json:", err);
  }
  return [];
}

function savePersistedCustomers(customers) {
  ensureStorage();
  try {
    fs.writeFileSync(CUSTOMERS_FILE_PATH, JSON.stringify(customers, null, 2), "utf8");
    return true;
  } catch (err) {
    console.error("Lỗi ghi file customers.json:", err);
    return false;
  }
}

// Kho lưu trữ khách hàng 360 thực tế
let dynamicCustomersStore = loadPersistedCustomers();

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
 * Tìm hoặc tạo mới hồ sơ Khách hàng 360 qua SĐT
 * @param {object} input
 * @returns {Promise<object>}
 */
export async function getOrCreateCustomerByPhone(input = {}) {
  const result = await resolveCustomerIdentity(input);
  return result.customer;
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

  // Tuân thủ Điều 3 & Điều 11 AGENTS.md: Tuyệt đối không sinh SĐT giả ngẫu nhiên
  if (!normalizedPhone && !input.zaloUid && !input.facebookId) {
    throw new Error("Bắt buộc phải có Số điện thoại chuẩn 10 số Việt Nam để định danh Khách hàng 360.");
  }

  // 3. Nếu chưa tồn tại, tạo mới hồ sơ Khách hàng 360 & phân bổ Sale tự động
  const preferredStaffId = input.staffId || input.assignedStaffId || null;
  const routing = await routeLeadToStaff({
    channelAccountId: input.channelAccountId,
    preferredStaffId,
  });

  const nextId = dynamicCustomersStore.length > 0 ? Math.max(...dynamicCustomersStore.map((c) => c.id)) + 1 : 1001;
  const newCode = `KH${String(nextId).slice(-3).padStart(3, "0")}`;
  const vipCalc = calculateVipLevel(0, 0);

  const effectiveName = (input.fullName || input.name || "").trim() || "Khách hàng mới";
  const effectivePathology =
    (input.pathology || input.initialPathology || "").trim() || "Cần tư vấn bệnh lý";
  const effectiveSource = input.source || input.channel || "OTHER";

  const newCustomer = {
    id: nextId,
    code: newCode,
    fullName: effectiveName,
    phone: normalizedPhone || "",
    age: input.age || null,
    gender: input.gender || "Chưa rõ",
    province: input.province || "Chưa cập nhật",
    address: input.address || "",
    pathology: effectivePathology,
    initialGlucose: input.initialGlucose || null,
    currentGlucose: input.currentGlucose || null,
    weeklyFeedback:
      input.notes || input.note || "Vừa tiếp nhận qua kênh " + (effectiveSource || "Trực tiếp"),
    feedbackRating: "NONE",
    source: effectiveSource,
    channelLabel: input.channelLabel || effectiveSource || "Trực tiếp",
    tags: ["Khách Mới", effectiveSource || "Tư vấn"],
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
  savePersistedCustomers(dynamicCustomersStore);

  return { customer: newCustomer, isNew: true, matchMethod: "CREATED_NEW" };
}

/**
 * Lấy toàn bộ danh sách khách hàng 360
 */
export function getAllCustomers() {
  dynamicCustomersStore = loadPersistedCustomers();
  return dynamicCustomersStore;
}

/**
 * Lấy thông tin chi tiết một khách hàng theo ID
 * @param {number|string} id
 */
export function getCustomerById(id) {
  const numId = Number(id);
  return getAllCustomers().find((c) => c.id === numId) || null;
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
  savePersistedCustomers(dynamicCustomersStore);
  return updated;
}
