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

const CUSTOMERS_FILE_PATH = fs.existsSync(path.join(process.cwd(), "portal", "package.json"))
  ? path.join(process.cwd(), "portal", ".data", "customers.json")
  : path.join(process.cwd(), ".data", "customers.json");

export const STANDARD_CUSTOMER_TAGS = [
  "Tiểu Đường Tuýp 2",
  "Tiểu Đường Tuýp 1",
  "Tiền Tiểu Đường",
  "Men Gan Cao",
  "Gan Nhiễm Mỡ",
  "VIP",
  "Đã Mua Glucare Plus",
  "Đã Mua Dovital",
  "Zalo Cá Nhân",
  "Fanpage FB",
  "Zalo OA",
  "Khách Mới",
  "Cần Tư Vấn Thêm",
  "Đã Hủy Đơn",
  "Khiếu Nại",
  "Dừng Chăm Sóc",
];

function ensureCustomerTagsArray(customer = {}) {
  const tagSet = new Set();
  if (Array.isArray(customer.tags)) {
    for (const t of customer.tags) {
      if (t && String(t).trim()) tagSet.add(String(t).trim());
    }
  } else if (typeof customer.tags === "string" && customer.tags.trim()) {
    for (const t of customer.tags.split(",")) {
      if (t.trim()) tagSet.add(t.trim());
    }
  }

  return {
    ...customer,
    tags: Array.from(tagSet),
  };
}

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
      const data = fs.readFileSync(CUSTOMERS_FILE_PATH, "utf8").replace(/^\uFEFF/, "");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed.map(ensureCustomerTagsArray);
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
 * Tìm kiếm hoặc tạo mới hồ sơ Khách hàng 360 qua threadId (Zalo/FB), SĐT hoặc Tên (Universal Upsert cho Chat Bot)
 */
export async function upsertCustomerByThreadOrPhone(input = {}) {
  dynamicCustomersStore = loadPersistedCustomers();
  const normalizedPhone = normalizePhone(input.phone);
  const tid = String(input.threadId || input.zaloUid || "").trim();
  const nameClean = String(input.fullName || input.name || "").trim();

  // 1. Tìm theo SĐT chuẩn 10 số
  if (normalizedPhone) {
    const byPhone = dynamicCustomersStore.find((c) => c.phone === normalizedPhone);
    if (byPhone) {
      if (tid && !byPhone.zaloUid) byPhone.zaloUid = tid;
      savePersistedCustomers(dynamicCustomersStore);
      return byPhone;
    }
  }

  // 2. Tìm theo threadId / zaloUid / facebookId
  if (tid) {
    const byTid = dynamicCustomersStore.find(
      (c) =>
        String(c.zaloUid || "") === tid ||
        String(c.zaloThreadId || "") === tid ||
        String(c.facebookId || "") === tid ||
        String(c.psid || "") === tid
    );
    if (byTid) {
      if (normalizedPhone && !byTid.phone) byTid.phone = normalizedPhone;
      savePersistedCustomers(dynamicCustomersStore);
      return byTid;
    }
  }

  // 3. Tìm theo Họ tên nếu chưa có SĐT và threadId chưa khớp (tránh trùng khách đang chat)
  if (
    nameClean &&
    !["khách", "khách hàng", "khách zalo", "khách fb"].includes(nameClean.toLowerCase())
  ) {
    const byName = dynamicCustomersStore.find(
      (c) => String(c.fullName || "").toLowerCase().trim() === nameClean.toLowerCase()
    );
    if (byName) {
      if (tid && !byName.zaloUid) byName.zaloUid = tid;
      if (normalizedPhone && !byName.phone) byName.phone = normalizedPhone;
      savePersistedCustomers(dynamicCustomersStore);
      return byName;
    }
  }

  // 4. Tạo mới hồ sơ Khách hàng 360
  const routing = await routeLeadToStaff({
    channelAccountId: input.channelAccountId,
    preferredStaffId: input.staffId || null,
  });

  const nextId =
    dynamicCustomersStore.length > 0
      ? Math.max(...dynamicCustomersStore.map((c) => Number(c.id) || 1000)) + 1
      : 1001;
  const newCode = `KH${String(nextId).slice(-3).padStart(3, "0")}`;
  const vipCalc = calculateVipLevel(0, 0);
  const effectiveSource = input.source || input.channel || "ZALO_PERSONAL";

  const newCustomer = ensureCustomerTagsArray({
    id: nextId,
    code: newCode,
    fullName: nameClean || "Khách Zalo",
    phone: normalizedPhone || "",
    age: input.age || null,
    gender: input.gender || "UNKNOWN",
    pronoun: input.pronoun || "mình",
    province: input.province || "Chưa cập nhật",
    address: input.address || "",
    pathology: input.pathology || "Đang tư vấn dinh dưỡng tiểu đường",
    initialGlucose: input.initialGlucose || null,
    currentGlucose: input.currentGlucose || null,
    medicalRecord: input.medicalRecord || {
      bloodSugar: null,
      bloodSugarNumeric: null,
      duration: null,
      symptoms: [],
      goals: [],
    },
    weeklyFeedback:
      input.notes || input.note || "Tiếp nhận tự động qua kênh " + effectiveSource,
    feedbackRating: "NONE",
    source: effectiveSource,
    channelLabel: input.channelLabel || effectiveSource,
    tags: Array.isArray(input.tags) ? input.tags : [],
    staffId: routing.staffId,
    staffName: routing.staffName,
    staffCode: routing.staffCode,
    totalOrders: 0,
    totalSpent: 0,
    vipLevel: vipCalc.code,
    vipLabel: vipCalc.label,
    status: "Tiềm năng",
    careStatus: "Đang chăm sóc",
    zaloUid: tid || null,
    zaloThreadId: tid || null,
    facebookUrl: input.facebookUrl || null,
    avatar: input.avatar || "",
    lastOrderDate: null,
    createdAt: new Date().toISOString(),
  });

  dynamicCustomersStore.unshift(newCustomer);
  savePersistedCustomers(dynamicCustomersStore);
  return newCustomer;
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
    tags: Array.isArray(input.tags) ? input.tags : [],
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
 * Lấy thông tin chi tiết một khách hàng theo ID / Code / SĐT
 * @param {number|string} id
 */
export function getCustomerById(id) {
  const strId = String(id || "").trim();
  const numId = Number(id);
  const all = getAllCustomers();
  return (
    all.find(
      (c) =>
        (Number.isFinite(numId) && numId > 0 && Number(c.id) === numId) ||
        String(c.id) === strId ||
        (c.code && String(c.code) === strId)
    ) || null
  );
}

/**
 * Cập nhật thông tin khách hàng
 * @param {number|string} id
 * @param {object} updates
 */
export function updateCustomer(id, updates = {}) {
  dynamicCustomersStore = loadPersistedCustomers();
  const strId = String(id || "").trim();
  const numId = Number(id);
  const index = dynamicCustomersStore.findIndex(
    (c) =>
      (Number.isFinite(numId) && numId > 0 && Number(c.id) === numId) ||
      String(c.id) === strId ||
      (c.code && String(c.code) === strId)
  );
  if (index === -1) return null;

  const current = dynamicCustomersStore[index];
  const nextPhone =
    updates.phone !== undefined
      ? normalizePhone(updates.phone) || String(updates.phone || "").trim()
      : current.phone;

  const nextAssignedStaff =
    updates.assignedStaff !== undefined
      ? String(updates.assignedStaff || "").trim()
      : updates.staffName !== undefined
        ? String(updates.staffName || "").trim()
        : current.assignedStaff || current.staffName || "";

  const updated = {
    ...current,
    ...updates,
    phone: nextPhone,
    assignedStaff: nextAssignedStaff || "Chưa gán",
    staffName: nextAssignedStaff || "Chưa gán",
    updatedAt: new Date().toISOString(),
  };

  // Cập nhật lại VIP level nếu có thay đổi về đơn hàng
  if (updates.totalOrders !== undefined || updates.totalSpent !== undefined) {
    const vip = calculateVipLevel(updated.totalOrders, updated.totalSpent);
    updated.vipLevel = vip.code;
    updated.vipLabel = vip.label;
  }

  dynamicCustomersStore[index] = ensureCustomerTagsArray(updated);
  savePersistedCustomers(dynamicCustomersStore);
  return dynamicCustomersStore[index];
}

/**
 * Xóa khách hàng khỏi hệ thống theo ID hoặc Code
 * @param {number|string} id
 */
export function deleteCustomer(id) {
  dynamicCustomersStore = loadPersistedCustomers();
  const strId = String(id || "").trim();
  const numId = Number(id);
  const index = dynamicCustomersStore.findIndex(
    (c) =>
      (Number.isFinite(numId) && numId > 0 && Number(c.id) === numId) ||
      String(c.id) === strId ||
      (c.code && String(c.code) === strId)
  );
  if (index === -1) return null;

  const [removed] = dynamicCustomersStore.splice(index, 1);
  savePersistedCustomers(dynamicCustomersStore);
  return removed;
}

/**
 * Che 3 chữ số giữa của SĐT để hiển thị an toàn trên danh sách xem trước (VD: 0912345678 -> 091***5678)
 */
export function maskPhoneMiddle(phone = "") {
  const clean = String(phone || "").trim();
  if (!clean) return "Chưa có SĐT";
  if (clean.length < 8) return clean;
  return `${clean.slice(0, 3)}***${clean.slice(6)}`;
}

/**
 * Kiểm tra khách hàng có khả năng nhận tin trên kênh tương ứng hay không
 */
export function customerSupportsChannel(customer = {}, channel = "ALL") {
  const ch = String(channel || "ALL").toUpperCase();
  if (ch === "ALL") return true;

  const tagsLower = (Array.isArray(customer.tags) ? customer.tags : []).map((t) =>
    String(t).toLowerCase()
  );
  const src = String(customer.source || "").toUpperCase();
  const hasPhone = Boolean(customer.phone && String(customer.phone).trim().length >= 9);
  const hasZaloThread = Boolean(
    customer.zaloUid ||
      customer.zaloThreadId ||
      src === "ZALO_PERSONAL" ||
      tagsLower.includes("zalo cá nhân")
  );
  const hasFbPsid = Boolean(
    customer.facebookId ||
      customer.psid ||
      customer.facebookUrl ||
      src === "FACEBOOK" ||
      tagsLower.includes("fanpage fb")
  );

  if (ch === "ZALO_PERSONAL" || ch === "ZALO") {
    return hasPhone || hasZaloThread;
  }
  if (ch === "FACEBOOK") {
    return hasFbPsid;
  }
  if (ch === "ZALO_OA") {
    return hasPhone || Boolean(customer.zaloOaUid || src === "ZALO_OA" || tagsLower.includes("zalo oa"));
  }
  return true;
}

/**
 * Module 1 (WBS-35): Bộ Lọc Tệp Khách Theo Thẻ & Kênh (Audience Filter & Counter)
 * @param {object} params
 * @param {string[]} [params.includeTags] - Khách phải chứa thẻ (theo operator AND hoặc OR)
 * @param {string[]} [params.excludeTags] - Loại trừ khách chứa bất kỳ thẻ nào trong danh sách này
 * @param {string} [params.channel="ALL"] - "ALL" | "ZALO_PERSONAL" | "FACEBOOK" | "ZALO_OA"
 * @param {"AND"|"OR"} [params.operator="AND"]
 * @returns {{
 *   customers: Array<object>,
 *   totalCount: number,
 *   previewList: Array<object>,
 *   channelBreakdown: { zalo: number, messenger: number, zaloOa: number }
 * }}
 */
export function filterCustomersByTags({
  includeTags = [],
  excludeTags = [],
  channel = "ALL",
  operator = "AND",
} = {}) {
  const allCustomers = getAllCustomers();
  const normInclude = (Array.isArray(includeTags) ? includeTags : [])
    .map((t) => String(t || "").trim().toLowerCase())
    .filter(Boolean);
  const normExclude = (Array.isArray(excludeTags) ? excludeTags : [])
    .map((t) => String(t || "").trim().toLowerCase())
    .filter(Boolean);
  const op = String(operator || "AND").toUpperCase() === "OR" ? "OR" : "AND";

  // Lọc theo includeTags & excludeTags trước để tính breakdown đa kênh
  const tagMatchedCustomers = allCustomers.filter((cust) => {
    const custTagsLower = (Array.isArray(cust.tags) ? cust.tags : []).map((t) =>
      String(t || "").trim().toLowerCase()
    );

    // 1. Kiểm tra excludeTags: Nếu có bất kỳ thẻ loại trừ nào -> loại ngay
    if (normExclude.length > 0) {
      const hasExcluded = normExclude.some((exTag) =>
        custTagsLower.some((ct) => ct === exTag || ct.includes(exTag))
      );
      if (hasExcluded) return false;
    }

    // 2. Kiểm tra includeTags: Nếu rỗng -> lấy tất cả khách không bị loại trừ
    if (normInclude.length === 0) {
      return true;
    }

    if (op === "OR") {
      return normInclude.some((incTag) =>
        custTagsLower.some((ct) => ct === incTag || ct.includes(incTag))
      );
    }

    // Mặc định AND: Phải khớp tất cả các thẻ trong includeTags
    return normInclude.every((incTag) =>
      custTagsLower.some((ct) => ct === incTag || ct.includes(incTag))
    );
  });

  const channelBreakdown = {
    zalo: tagMatchedCustomers.filter((c) => customerSupportsChannel(c, "ZALO_PERSONAL")).length,
    messenger: tagMatchedCustomers.filter((c) => customerSupportsChannel(c, "FACEBOOK")).length,
    zaloOa: tagMatchedCustomers.filter((c) => customerSupportsChannel(c, "ZALO_OA")).length,
  };

  // Lọc theo channel đã chọn
  const finalCustomers = tagMatchedCustomers.filter((c) =>
    customerSupportsChannel(c, channel)
  );

  const previewList = finalCustomers.slice(0, 10).map((c) => ({
    id: c.id,
    code: c.code,
    fullName: c.fullName || "Khách hàng",
    phone: c.phone || "",
    maskedPhone: maskPhoneMiddle(c.phone),
    tags: Array.isArray(c.tags) ? c.tags : [],
    source: c.source || "ZALO_PERSONAL",
    assignedStaff: c.staffName || "Dược sĩ Thảo",
    zaloUid: c.zaloUid || null,
    facebookId: c.facebookId || c.psid || null,
    lastInteractionTime: c.lastInteractionTime || c.updatedAt || c.createdAt || null,
  }));

  return {
    customers: finalCustomers,
    totalCount: finalCustomers.length,
    previewList,
    channelBreakdown,
  };
}

/**
 * Lấy danh sách toàn bộ các thẻ khách hàng hiện có kèm thống kê số lượng khách từng thẻ
 */
export function getAllAvailableCustomerTags() {
  const allCustomers = getAllCustomers();
  const counts = new Map();

  for (const stdTag of STANDARD_CUSTOMER_TAGS) {
    counts.set(stdTag, 0);
  }

  for (const c of allCustomers) {
    const tags = Array.isArray(c.tags) ? c.tags : [];
    for (const t of tags) {
      const clean = String(t || "").trim();
      if (!clean) continue;
      counts.set(clean, (counts.get(clean) || 0) + 1);
    }
  }

  return Array.from(counts.entries()).map(([tag, count]) => ({
    tag,
    count,
  }));
}

/**
 * Xóa hàng loạt khách hàng theo danh sách ID / Code trong 1 lần ghi đĩa nguyên tử
 * @param {Array<string|number>} ids
 */
export function bulkDeleteCustomersByIds(ids = []) {
  dynamicCustomersStore = loadPersistedCustomers();
  const idSet = new Set(
    (Array.isArray(ids) ? ids : []).map((v) => String(v || "").trim()).filter(Boolean)
  );
  if (idSet.size === 0) {
    return { removed: [], remaining: dynamicCustomersStore };
  }

  const removed = [];
  const remaining = [];
  for (const c of dynamicCustomersStore) {
    const matchById = c.id !== undefined && c.id !== null && idSet.has(String(c.id).trim());
    const matchByCode = c.code && idSet.has(String(c.code).trim());
    if (matchById || matchByCode) {
      removed.push(c);
    } else {
      remaining.push(c);
    }
  }

  if (removed.length > 0) {
    dynamicCustomersStore = remaining;
    savePersistedCustomers(dynamicCustomersStore);
  }
  return { removed, remaining };
}

/**
 * Gắn thẻ hàng loạt cho danh sách khách hàng trong 1 lần ghi đĩa nguyên tử
 * @param {Array<string|number>} ids
 * @param {string} tagValue
 */
export function bulkAddTagToCustomersByIds(ids = [], tagValue = "") {
  const cleanTag = String(tagValue || "").trim();
  const idSet = new Set(
    (Array.isArray(ids) ? ids : []).map((v) => String(v || "").trim()).filter(Boolean)
  );
  if (!cleanTag || idSet.size === 0) {
    return { updated: [] };
  }

  dynamicCustomersStore = loadPersistedCustomers();
  const nowIso = new Date().toISOString();
  const updated = [];
  let changed = false;

  dynamicCustomersStore = dynamicCustomersStore.map((c) => {
    const matchById = c.id !== undefined && c.id !== null && idSet.has(String(c.id).trim());
    const matchByCode = c.code && idSet.has(String(c.code).trim());
    if (!matchById && !matchByCode) return c;

    const prevTags = Array.isArray(c.tags) ? c.tags : [];
    const nextTags = prevTags.includes(cleanTag) ? prevTags : [...prevTags, cleanTag];
    const nextCustomer = ensureCustomerTagsArray({
      ...c,
      tags: nextTags,
      updatedAt: prevTags.includes(cleanTag) ? c.updatedAt : nowIso,
    });
    if (!prevTags.includes(cleanTag)) changed = true;
    updated.push(nextCustomer);
    return nextCustomer;
  });

  if (changed) {
    savePersistedCustomers(dynamicCustomersStore);
  }
  return { updated };
}
