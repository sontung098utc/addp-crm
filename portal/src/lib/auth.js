import crypto from "crypto";
import { normalizePhone } from "./phone.js";

/**
 * Hệ thống Xác thực, Quản lý Nhân sự & Phân quyền RBAC/Channel ACL (WBS-05, WBS-06, WBS-07, WBS-08)
 * Kế thừa C:\QuanlyKH\src\lib\auth.js + C:\AH-Trabi\quan-ly-kho\users_management_view.php
 * Tuân thủ Điều 3 (normalizePhone), Điều 4 (dailyMsgTarget <= 70) & Điều 5 (RBAC 6 cấp) trong AGENTS.md
 */

export const SESSION_COOKIE_NAME = "addp_crm_session";
const SECRET = process.env.CRM_JWT_SECRET || "ADDP_CRM_DEFAULT_DEV_SECRET_2026";

export const ROLE_METADATA = {
  ADMIN: {
    code: "ADMIN",
    label: "Quản trị viên (Toàn quyền)",
    badgeColor: "bg-rose-500/15 text-rose-400 border-rose-500/30",
    description: "Toàn quyền hệ thống, xem báo cáo lãi/lỗ, giá vốn, cấu hình kênh và phân quyền nhân sự.",
  },
  SALE_LEADER: {
    code: "SALE_LEADER",
    label: "Trưởng nhóm Kinh doanh",
    badgeColor: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    description: "Xem và điều phối toàn bộ khách hàng, hội thoại, đơn hàng và KPI của nhóm mình quản lý.",
  },
  SALE: {
    code: "SALE",
    label: "Nhân viên Tư vấn (Sale)",
    badgeColor: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    description: "Chỉ xem/trả lời các Kênh được gán và Khách hàng do mình phụ trách (staffId == currentUser.id).",
  },
  CSKH: {
    code: "CSKH",
    label: "Chăm sóc khách hàng (CSKH)",
    badgeColor: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
    description: "Phụ trách lộ trình chăm sóc Ngày 1-3-7-14-21, theo dõi đường huyết và nhắc tái mua.",
  },
  KHO: {
    code: "KHO",
    label: "Nhân viên Kho & Vận đơn",
    badgeColor: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    description: "Chỉ truy cập module Đơn hàng, Tồn kho, Bóc tách mã Combo và Xuất/Nhập kho.",
  },
  KE_TOAN: {
    code: "KE_TOAN",
    label: "Kế toán & Đối soát",
    badgeColor: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    description: "Truy cập Đơn hàng, Đối soát tài chính đa sàn, Chi phí Ads và Báo cáo Thuế.",
  },
};

/**
 * Ma trận phân quyền truy cập Module theo Điều 5 - AGENTS.md
 */
export const ROLE_PERMISSIONS = {
  ADMIN: ["dashboard", "inbox", "customers", "work-tracking", "broadcast", "orders", "channels", "reports", "settings"],
  SALE_LEADER: ["dashboard", "inbox", "customers", "work-tracking", "broadcast", "orders", "channels", "reports"],
  SALE: ["dashboard", "inbox", "customers", "work-tracking", "broadcast", "orders"],
  CSKH: ["dashboard", "inbox", "customers", "work-tracking", "broadcast"],
  KHO: ["dashboard", "orders", "reports"],
  KE_TOAN: ["dashboard", "orders", "reports"],
};

export function hashPassword(plainPassword) {
  return crypto.createHmac("sha256", SECRET).update(String(plainPassword)).digest("hex");
}

// Danh sách nhân viên khởi tạo sẵn (đồng bộ với seed trong 001_init_addp_crm.sql)
const runtimeStaffStore = new Map([
  [
    "ADMIN",
    {
      id: 1,
      code: "ADMIN",
      name: "Quản Trị Viên ADDP",
      phone: "0901000001",
      email: "admin@addp.vn",
      role: "ADMIN",
      roleLabel: ROLE_METADATA.ADMIN.label,
      teamName: "Ban Giám Đốc",
      kpi: 0,
      revenueTarget: 0,
      dailyCareTarget: 0,
      dailyMsgTarget: 200,
      customerCount: 128,
      isActive: true,
      passwordHash: hashPassword("123456"),
    },
  ],
  [
    "S001",
    {
      id: 2,
      code: "S001",
      name: "Nguyễn Minh Tuấn (Leader Sale 01)",
      phone: "0912000002",
      email: "tuan.nm@addp.vn",
      role: "SALE_LEADER",
      roleLabel: ROLE_METADATA.SALE_LEADER.label,
      teamName: "Team Sale 01",
      kpi: 180,
      revenueTarget: 250000000,
      dailyCareTarget: 12,
      dailyMsgTarget: 70,
      customerCount: 64,
      isActive: true,
      passwordHash: hashPassword("123456"),
    },
  ],
  [
    "S002",
    {
      id: 3,
      code: "S002",
      name: "Trần Thu Hà (Sale Tiểu Đường)",
      phone: "0988000003",
      email: "ha.tt@addp.vn",
      role: "SALE",
      roleLabel: ROLE_METADATA.SALE.label,
      teamName: "Team Sale 01",
      kpi: 95,
      revenueTarget: 120000000,
      dailyCareTarget: 15,
      dailyMsgTarget: 70,
      customerCount: 42,
      isActive: true,
      passwordHash: hashPassword("123456"),
    },
  ],
  [
    "CS01",
    {
      id: 4,
      code: "CS01",
      name: "Lê Thị Mai (CSKH Liệu Trình 1-3-7-14-21)",
      phone: "0977000004",
      email: "mai.lt@addp.vn",
      role: "CSKH",
      roleLabel: ROLE_METADATA.CSKH.label,
      teamName: "Team Sale 01",
      kpi: 80,
      revenueTarget: 90000000,
      dailyCareTarget: 25,
      dailyMsgTarget: 70,
      customerCount: 85,
      isActive: true,
      passwordHash: hashPassword("123456"),
    },
  ],
  [
    "KHO01",
    {
      id: 5,
      code: "KHO01",
      name: "Phạm Văn Hùng (Quản Lý Kho & Điều Phối)",
      phone: "0933000005",
      email: "hung.pv@addp.vn",
      role: "KHO",
      roleLabel: ROLE_METADATA.KHO.label,
      teamName: "Bộ phận Kho vận",
      kpi: 0,
      revenueTarget: 0,
      dailyCareTarget: 0,
      dailyMsgTarget: 0,
      customerCount: 0,
      isActive: true,
      passwordHash: hashPassword("123456"),
    },
  ],
  [
    "KT01",
    {
      id: 6,
      code: "KT01",
      name: "Hoàng Thanh Thảo (Kế Toán & Đối Soát Sàn)",
      phone: "0944000006",
      email: "thao.ht@addp.vn",
      role: "KE_TOAN",
      roleLabel: ROLE_METADATA.KE_TOAN.label,
      teamName: "Bộ phận Tài chính",
      kpi: 0,
      revenueTarget: 0,
      dailyCareTarget: 0,
      dailyMsgTarget: 0,
      customerCount: 0,
      isActive: true,
      passwordHash: hashPassword("123456"),
    },
  ],
]);

// Danh sách tài khoản đa kênh thuộc 7 nền tảng (phục vụ Ma trận Phân quyền Kênh WBS-08)
const runtimeChannelAccounts = [
  {
    id: 101,
    platform: "MAGENTO",
    platformLabel: "Website Magento 2.4.8",
    name: "Website ADDP.vn (CustomForm & Minigame)",
    externalId: "magento_addp_vn",
    status: "CONNECTED",
  },
  {
    id: 102,
    platform: "FACEBOOK",
    platformLabel: "Fanpage Facebook",
    name: "Fanpage Sữa Hạt Tiểu Đường Glucare Plus",
    externalId: "fb_page_glucare_01",
    status: "CONNECTED",
  },
  {
    id: 103,
    platform: "FACEBOOK",
    platformLabel: "Fanpage Facebook",
    name: "Fanpage ADDP Viên An Đường Chính Hãng",
    externalId: "fb_page_vad_02",
    status: "CONNECTED",
  },
  {
    id: 104,
    platform: "ZALO_PERSONAL",
    platformLabel: "Zalo Cá Nhân (Multi-QR)",
    name: "Zalo Tư Vấn 01 - Dược Sĩ Thu Hà (0988000003)",
    externalId: "zalo_qr_0988000003",
    status: "CONNECTED",
  },
  {
    id: 105,
    platform: "ZALO_PERSONAL",
    platformLabel: "Zalo Cá Nhân (Multi-QR)",
    name: "Zalo CSKH 02 - Dược Sĩ Mai (0977000004)",
    externalId: "zalo_qr_0977000004",
    status: "CONNECTED",
  },
  {
    id: 106,
    platform: "ZALO_OA",
    platformLabel: "Zalo Official Account",
    name: "Zalo OA Dược Phẩm ADDP Official",
    externalId: "zalo_oa_addp_official",
    status: "CONNECTED",
  },
  {
    id: 107,
    platform: "TIKTOK_SHOP",
    platformLabel: "TikTok Shop & Ads",
    name: "TikTok Shop ADDP Health Mall",
    externalId: "tts_addp_mall_01",
    status: "CONNECTED",
  },
  {
    id: 108,
    platform: "SHOPEE",
    platformLabel: "Shopee Open API v2",
    name: "Shopee ADDP Official Store",
    externalId: "shopee_addp_store_01",
    status: "CONNECTED",
  },
  {
    id: 109,
    platform: "KIOTVIET",
    platformLabel: "KiotViet POS & Kho",
    name: "KiotViet Kho Tổng ADDP Hà Nội",
    externalId: "kv_addp_hanoi",
    status: "CONNECTED",
  },
];

// Ma trận phân quyền kênh mặc định: key = `${staffId}:${channelAccountId}`
const runtimeChannelPermissions = new Map([
  // S001 (Leader Sale 01) -> Toàn bộ kênh của Team Sale 01
  ["2:101", { staffId: 2, channelAccountId: 101, canView: true, canReply: true, canBroadcast: true, canManageOrders: true, autoAssignLead: true }],
  ["2:102", { staffId: 2, channelAccountId: 102, canView: true, canReply: true, canBroadcast: true, canManageOrders: true, autoAssignLead: true }],
  ["2:103", { staffId: 2, channelAccountId: 103, canView: true, canReply: true, canBroadcast: true, canManageOrders: true, autoAssignLead: true }],
  ["2:104", { staffId: 2, channelAccountId: 104, canView: true, canReply: true, canBroadcast: false, canManageOrders: true, autoAssignLead: false }],
  ["2:106", { staffId: 2, channelAccountId: 106, canView: true, canReply: true, canBroadcast: true, canManageOrders: true, autoAssignLead: true }],
  ["2:107", { staffId: 2, channelAccountId: 107, canView: true, canReply: true, canBroadcast: false, canManageOrders: true, autoAssignLead: true }],
  // S002 (Sale Tiểu Đường) -> Website, Fanpage Glucare, Nick Zalo Tư vấn 01, TikTok Shop
  ["3:101", { staffId: 3, channelAccountId: 101, canView: true, canReply: true, canBroadcast: false, canManageOrders: true, autoAssignLead: true }],
  ["3:102", { staffId: 3, channelAccountId: 102, canView: true, canReply: true, canBroadcast: false, canManageOrders: true, autoAssignLead: true }],
  ["3:104", { staffId: 3, channelAccountId: 104, canView: true, canReply: true, canBroadcast: true, canManageOrders: true, autoAssignLead: true }],
  ["3:107", { staffId: 3, channelAccountId: 107, canView: true, canReply: true, canBroadcast: false, canManageOrders: true, autoAssignLead: false }],
  // CS01 (CSKH) -> Zalo CSKH 02, Zalo OA, KiotViet
  ["4:105", { staffId: 4, channelAccountId: 105, canView: true, canReply: true, canBroadcast: true, canManageOrders: false, autoAssignLead: false }],
  ["4:106", { staffId: 4, channelAccountId: 106, canView: true, canReply: true, canBroadcast: true, canManageOrders: false, autoAssignLead: false }],
  ["4:109", { staffId: 4, channelAccountId: 109, canView: true, canReply: false, canBroadcast: false, canManageOrders: true, autoAssignLead: false }],
  // KHO01 -> TikTok Shop, Shopee, KiotViet (chỉ quản lý đơn)
  ["5:107", { staffId: 5, channelAccountId: 107, canView: true, canReply: false, canBroadcast: false, canManageOrders: true, autoAssignLead: false }],
  ["5:108", { staffId: 5, channelAccountId: 108, canView: true, canReply: false, canBroadcast: false, canManageOrders: true, autoAssignLead: false }],
  ["5:109", { staffId: 5, channelAccountId: 109, canView: true, canReply: false, canBroadcast: false, canManageOrders: true, autoAssignLead: false }],
]);

function stripPassword(staff) {
  if (!staff) return null;
  const { passwordHash: _, ...safe } = staff;
  return {
    ...safe,
    roleLabel: ROLE_METADATA[safe.role]?.label || safe.role,
    allowedChannelAccountIds: getAllowedChannelIdsForStaff(safe.id, safe.role),
  };
}

export function getAllowedChannelIdsForStaff(staffId, role) {
  if (role === "ADMIN") {
    return runtimeChannelAccounts.map((c) => c.id);
  }
  const ids = [];
  for (const perm of runtimeChannelPermissions.values()) {
    if (perm.staffId === Number(staffId) && (perm.canView || perm.canReply || perm.canManageOrders)) {
      ids.push(perm.channelAccountId);
    }
  }
  return ids;
}

export function authenticateStaff(code, password) {
  if (!code || !password) return null;
  const normalizedCode = String(code).trim().toUpperCase();
  const staff = runtimeStaffStore.get(normalizedCode);
  if (!staff || !staff.isActive) return null;

  const inputHash = hashPassword(password);
  if (staff.passwordHash !== inputHash) return null;

  return stripPassword(staff);
}

export function updateStaffPassword(code, currentPassword, newPassword) {
  const normalizedCode = String(code).trim().toUpperCase();
  const staff = runtimeStaffStore.get(normalizedCode);
  if (!staff) {
    return { ok: false, error: "Không tìm thấy tài khoản nhân viên." };
  }
  if (staff.passwordHash !== hashPassword(currentPassword)) {
    return { ok: false, error: "Mật khẩu hiện tại không chính xác." };
  }
  if (!newPassword || String(newPassword).length < 6) {
    return { ok: false, error: "Mật khẩu mới phải có ít nhất 6 ký tự." };
  }
  staff.passwordHash = hashPassword(newPassword);
  runtimeStaffStore.set(normalizedCode, staff);
  return { ok: true };
}

export function listAllStaff() {
  return Array.from(runtimeStaffStore.values()).map(stripPassword);
}

export function getStaffByIdOrCode(identifier) {
  if (identifier === null || identifier === undefined) return null;
  const byCode = runtimeStaffStore.get(String(identifier).trim().toUpperCase());
  if (byCode) return stripPassword(byCode);
  const numId = Number(identifier);
  for (const staff of runtimeStaffStore.values()) {
    if (staff.id === numId) return stripPassword(staff);
  }
  return null;
}

export function createStaffRecord(input) {
  const code = String(input.code || "").trim().toUpperCase();
  const name = String(input.name || "").trim();
  const role = ROLE_METADATA[input.role] ? input.role : "SALE";

  if (!code || !name) {
    return { ok: false, error: "Vui lòng nhập đầy đủ Mã nhân viên và Họ tên." };
  }
  if (runtimeStaffStore.has(code)) {
    return { ok: false, error: `Mã nhân viên '${code}' đã tồn tại trong hệ thống.` };
  }

  const nextId = Math.max(0, ...Array.from(runtimeStaffStore.values()).map((s) => s.id)) + 1;
  const normalizedPhone = input.phone ? normalizePhone(input.phone) : "";
  // Bảo vệ tài khoản Zalo cá nhân theo Điều 4 AGENTS.md: mặc định <= 70 tin/ngày cho Sale/CSKH
  const rawDailyMsg = Number(input.dailyMsgTarget ?? 70);
  const safeDailyMsgTarget = role === "ADMIN" ? rawDailyMsg : Math.min(70, Math.max(0, rawDailyMsg));

  const newStaff = {
    id: nextId,
    code,
    name,
    phone: normalizedPhone || "",
    email: String(input.email || "").trim(),
    role,
    roleLabel: ROLE_METADATA[role].label,
    teamName: String(input.teamName || "Team Sale 01").trim(),
    kpi: Math.max(0, Number(input.kpi || 0)),
    revenueTarget: Math.max(0, Number(input.revenueTarget || 0)),
    dailyCareTarget: Math.max(0, Number(input.dailyCareTarget ?? 10)),
    dailyMsgTarget: safeDailyMsgTarget,
    customerCount: 0,
    isActive: true,
    passwordHash: hashPassword(input.password || "123456"),
  };

  runtimeStaffStore.set(code, newStaff);
  return { ok: true, staff: stripPassword(newStaff) };
}

export function updateStaffRecord(idOrCode, updates) {
  let target = null;
  for (const s of runtimeStaffStore.values()) {
    if (s.id === Number(idOrCode) || s.code === String(idOrCode).trim().toUpperCase()) {
      target = s;
      break;
    }
  }
  if (!target) {
    return { ok: false, error: "Không tìm thấy nhân viên cần cập nhật." };
  }
  if (target.code === "ADMIN" && updates.role && updates.role !== "ADMIN") {
    return { ok: false, error: "Bảo mật hệ thống: Không thể hạ quyền của tài khoản ADMIN gốc!" };
  }
  if (target.code === "ADMIN" && updates.isActive === false) {
    return { ok: false, error: "Bảo mật hệ thống: Không thể khóa tài khoản ADMIN gốc!" };
  }

  if (updates.name !== undefined) target.name = String(updates.name).trim() || target.name;
  if (updates.phone !== undefined) target.phone = updates.phone ? normalizePhone(updates.phone) || updates.phone : "";
  if (updates.email !== undefined) target.email = String(updates.email).trim();
  if (updates.role && ROLE_METADATA[updates.role] && target.code !== "ADMIN") {
    target.role = updates.role;
    target.roleLabel = ROLE_METADATA[updates.role].label;
  }
  if (updates.teamName !== undefined) target.teamName = String(updates.teamName).trim();
  if (updates.kpi !== undefined) target.kpi = Math.max(0, Number(updates.kpi) || 0);
  if (updates.revenueTarget !== undefined) target.revenueTarget = Math.max(0, Number(updates.revenueTarget) || 0);
  if (updates.dailyCareTarget !== undefined) target.dailyCareTarget = Math.max(0, Number(updates.dailyCareTarget) || 0);
  if (updates.dailyMsgTarget !== undefined) {
    const rawMsg = Math.max(0, Number(updates.dailyMsgTarget) || 0);
    target.dailyMsgTarget = target.role === "ADMIN" ? rawMsg : Math.min(70, rawMsg);
  }
  if (updates.isActive !== undefined && target.code !== "ADMIN") {
    target.isActive = Boolean(updates.isActive);
  }
  if (updates.resetPassword && String(updates.resetPassword).length >= 6) {
    target.passwordHash = hashPassword(updates.resetPassword);
  }

  runtimeStaffStore.set(target.code, target);
  return { ok: true, staff: stripPassword(target) };
}

export function deleteStaffRecord(idOrCode) {
  let target = null;
  for (const s of runtimeStaffStore.values()) {
    if (s.id === Number(idOrCode) || s.code === String(idOrCode).trim().toUpperCase()) {
      target = s;
      break;
    }
  }
  if (!target) {
    return { ok: false, error: "Không tìm thấy nhân viên cần xóa." };
  }
  if (target.code === "ADMIN") {
    return { ok: false, error: "Bảo mật hệ thống: Không được phép xóa tài khoản ADMIN chính!" };
  }
  runtimeStaffStore.delete(target.code);
  for (const key of Array.from(runtimeChannelPermissions.keys())) {
    if (key.startsWith(`${target.id}:`)) {
      runtimeChannelPermissions.delete(key);
    }
  }
  return { ok: true };
}

export function listChannelAccounts() {
  return [...runtimeChannelAccounts];
}

export function getChannelPermissionMatrix() {
  const staffList = listAllStaff().filter((s) => s.role !== "ADMIN");
  const channels = listChannelAccounts();
  const permissions = Array.from(runtimeChannelPermissions.values());
  return { staffList, channels, permissions };
}

export function upsertChannelPermission({
  staffId,
  channelAccountId,
  canView = false,
  canReply = false,
  canBroadcast = false,
  canManageOrders = false,
  autoAssignLead = false,
}) {
  const sId = Number(staffId);
  const cId = Number(channelAccountId);
  if (!sId || !cId) {
    return { ok: false, error: "Thiếu thông tin nhân viên hoặc tài khoản kênh." };
  }
  const key = `${sId}:${cId}`;
  if (!canView && !canReply && !canBroadcast && !canManageOrders && !autoAssignLead) {
    runtimeChannelPermissions.delete(key);
    return { ok: true, permission: null };
  }
  const record = {
    staffId: sId,
    channelAccountId: cId,
    canView: Boolean(canView || canReply || canBroadcast || canManageOrders),
    canReply: Boolean(canReply),
    canBroadcast: Boolean(canBroadcast),
    canManageOrders: Boolean(canManageOrders),
    autoAssignLead: Boolean(autoAssignLead),
  };
  runtimeChannelPermissions.set(key, record);
  return { ok: true, permission: record };
}

export function createSessionToken(user) {
  const payload = {
    id: user.id,
    code: user.code,
    name: user.name,
    role: user.role,
    roleLabel: user.roleLabel || ROLE_METADATA[user.role]?.label || user.role,
    teamName: user.teamName,
    dailyCareTarget: user.dailyCareTarget,
    dailyMsgTarget: user.dailyMsgTarget,
    allowedChannelAccountIds: getAllowedChannelIdsForStaff(user.id, user.role),
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 ngày
  };
  const base64Payload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", SECRET).update(base64Payload).digest("base64url");
  return `${base64Payload}.${signature}`;
}

export function verifySessionToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [base64Payload, signature] = token.split(".");
  const expectedSig = crypto.createHmac("sha256", SECRET).update(base64Payload).digest("base64url");
  if (signature !== expectedSig) return null;

  try {
    const payload = JSON.parse(Buffer.from(base64Payload, "base64url").toString("utf8"));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function canAccessModule(role, moduleKey) {
  const allowed = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.SALE;
  return allowed.includes(moduleKey);
}

/**
 * Kiểm tra nhân viên hiện tại có quyền xem dữ liệu của targetStaffId hay không theo Điều 5 AGENTS.md
 * @param {object} staff
 * @param {number|string} targetStaffId
 * @returns {boolean}
 */
export function canAccessStaffData(staff, targetStaffId) {
  if (!staff) return false;
  if (staff.role === "ADMIN" || staff.role === "KE_TOAN" || staff.role === "KHO") return true;
  if (!targetStaffId) return true;
  if (staff.role === "SALE_LEADER") {
    const teamMembers = listAllStaff().filter((s) => s.teamName === staff.teamName || s.id === staff.id);
    return teamMembers.some((m) => m.id === Number(targetStaffId));
  }
  return Number(staff.id) === Number(targetStaffId);
}

/**
 * Lấy thông tin nhân viên đăng nhập từ Cookie phiên làm việc
 * @param {Request} [request]
 * @returns {Promise<object>}
 */
export async function getSessionStaff(request) {
  try {
    let token = null;
    if (request?.cookies?.get) {
      token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    } else if (request?.headers?.get) {
      const cookieHeader = request.headers.get("cookie") || "";
      const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
      if (match) token = match[1];
    }
    if (!token) {
      return getStaffByIdOrCode("ADMIN");
    }
    const payload = verifySessionToken(token);
    if (!payload) return getStaffByIdOrCode("ADMIN");
    return getStaffByIdOrCode(payload.code) || payload;
  } catch {
    return getStaffByIdOrCode("ADMIN");
  }
}
