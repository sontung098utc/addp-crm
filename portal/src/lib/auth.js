import fs from "fs";
import path from "path";
import crypto from "crypto";
import { normalizePhone } from "./phone.js";
import { DEFAULT_DAILY_ZALO_MSG_LIMIT } from "./pilotConfig.js";

export * from "./authConstants.js";
import {
  SESSION_COOKIE_NAME,
  ROLE_METADATA,
  ROLE_PERMISSIONS,
  MODULE_TO_ROUTE,
  getDefaultAllowedTabsForRole,
  canAccessModule,
} from "./authConstants.js";

/**
 * Hệ thống Xác thực, Quản lý Nhân sự & Phân quyền RBAC/Channel ACL (WBS-05, WBS-06, WBS-07, WBS-08)
 * Kế thừa C:\QuanlyKH\src\lib\auth.js + C:\AH-Trabi\quan-ly-kho\users_management_view.php
 * Tuân thủ Điều 3 (normalizePhone), Điều 4 (dailyMsgTarget <= 70) & Điều 5 (RBAC 6 cấp) trong AGENTS.md
 */

export function getAuthSecret() {
  const secret = process.env.CRM_JWT_SECRET;
  if (!secret) {
    throw new Error(
      "[SECURITY_CONFIG_ERROR] Biến môi trường CRM_JWT_SECRET chưa được cấu hình. Hệ thống từ chối tạo hoặc xác thực phiên làm việc (Fail closed)."
    );
  }
  return secret;
}

export function hashPassword(plainPassword) {
  const secret = getAuthSecret();
  return crypto.createHmac("sha256", secret).update(String(plainPassword)).digest("hex");
}

export function getInitialAdminPassword() {
  const pwd = process.env.INITIAL_ADMIN_PASSWORD;
  if (!pwd || typeof pwd !== "string" || pwd.trim().length === 0) {
    throw new Error(
      "[SECURITY_CONFIG_ERROR] Biến môi trường bắt buộc INITIAL_ADMIN_PASSWORD chưa được thiết lập. Hệ thống từ chối khởi tạo tài khoản quản trị mặc định (Fail-closed)."
    );
  }
  if (pwd.length < 8 || !/^(?=.*[A-Za-z])(?=.*\d)/.test(pwd)) {
    throw new Error(
      "[SECURITY_CONFIG_ERROR] INITIAL_ADMIN_PASSWORD phải có ít nhất 8 ký tự và bao gồm cả chữ và số."
    );
  }
  return pwd;
}

function getNodeFsAndPath() {
  if (typeof window !== "undefined") return null;
  try {
    const dataDir = process.env.DATA_DIR || ".data";
    const storagePath = path.isAbsolute(dataDir)
      ? path.join(dataDir, "staff.json")
      : path.join(process.cwd(), dataDir, "staff.json");
    return { fs, path, storagePath };
  } catch {
    return null;
  }
}

export function _resetStaffStoreForTest() {
  runtimeStaffStore = loadPersistentStaffStore();
  return runtimeStaffStore;
}

function loadPersistentStaffStore() {
  const map = new Map();
  const nodeEnv = getNodeFsAndPath();
  if (nodeEnv) {
    try {
      const { fs, storagePath } = nodeEnv;
      if (fs.existsSync(storagePath)) {
        const raw = JSON.parse(fs.readFileSync(storagePath, "utf8"));
        if (Array.isArray(raw)) {
          for (const item of raw) {
            if (item && item.code) {
              map.set(String(item.code).toUpperCase(), item);
            }
          }
        }
      }
    } catch (err) {
      console.error("[STAFF_STORAGE_LOAD_ERROR]", err);
    }
  }

  // Khởi tạo tài khoản Quản trị nếu chưa có trong DB/file lưu trữ
  if (!map.has("ADMIN")) {
    const initialPwd = process.env.INITIAL_ADMIN_PASSWORD;
    if (initialPwd && initialPwd.trim().length >= 8 && /^(?=.*[A-Za-z])(?=.*\d)/.test(initialPwd)) {
      map.set("ADMIN", {
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
        dailyMsgTarget: DEFAULT_DAILY_ZALO_MSG_LIMIT,
        customerCount: 0,
        isActive: true,
        mustChangePassword: true, // Bắt buộc đổi mật khẩu sau đăng nhập đầu tiên
        passwordHash: hashPassword(initialPwd),
      });
      if (nodeEnv) {
        savePersistentStaffStore(map);
      }
    }
    // Nếu thiếu INITIAL_ADMIN_PASSWORD: Fail-closed, không tạo tài khoản admin với fallback cứng!
  }

  return map;
}

function savePersistentStaffStore(storeMap) {
  const nodeEnv = getNodeFsAndPath();
  if (!nodeEnv) return;
  try {
    const { fs, path, storagePath } = nodeEnv;
    const dir = path.dirname(storagePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const list = Array.from(storeMap.values());
    fs.writeFileSync(storagePath, JSON.stringify(list, null, 2), "utf8");
  } catch (err) {
    console.error("[STAFF_STORAGE_SAVE_ERROR]", err);
  }
}

let runtimeStaffStore = loadPersistentStaffStore();

function refreshStaffStore() {
  if (typeof window === "undefined") {
    runtimeStaffStore = loadPersistentStaffStore();
  }
  return runtimeStaffStore;
}

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
  const allowedTabs =
    Array.isArray(safe.allowedTabs) && safe.allowedTabs.length > 0
      ? safe.allowedTabs
      : getDefaultAllowedTabsForRole(safe.role);
  const assignedChannels = Array.isArray(safe.assignedChannels)
    ? safe.assignedChannels.map((c) => String(c))
    : [];
  const customerScope =
    safe.customerScope || (["ADMIN", "SALE_LEADER"].includes(safe.role) ? "all" : "assigned_only");
  return {
    ...safe,
    mustChangePassword: Boolean(staff.mustChangePassword),
    username: safe.username || safe.code,
    fullName: safe.fullName || safe.name,
    roleLabel: ROLE_METADATA[safe.role]?.label || safe.role,
    allowedTabs,
    assignedChannels,
    customerScope,
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
  const store = refreshStaffStore();
  const normalizedCode = String(code).trim().toUpperCase();
  const staff = store.get(normalizedCode);
  if (!staff || !staff.isActive) return null;

  const inputHash = hashPassword(password);
  if (staff.passwordHash !== inputHash) return null;

  return stripPassword(staff);
}

export function updateStaffPassword(code, currentPassword, newPassword) {
  const store = refreshStaffStore();
  const normalizedCode = String(code).trim().toUpperCase();
  const staff = store.get(normalizedCode);
  if (!staff) {
    return { ok: false, error: "Không tìm thấy tài khoản nhân viên." };
  }
  if (staff.passwordHash !== hashPassword(currentPassword)) {
    return { ok: false, error: "Mật khẩu hiện tại không chính xác." };
  }
  if (!newPassword || String(newPassword).length < 8 || !/^(?=.*[A-Za-z])(?=.*\d)/.test(newPassword)) {
    return {
      ok: false,
      error: "Mật khẩu mới phải có ít nhất 8 ký tự và bao gồm cả chữ và số.",
    };
  }
  staff.passwordHash = hashPassword(newPassword);
  staff.mustChangePassword = false; // Đã đổi mật khẩu thành công
  store.set(normalizedCode, staff);
  savePersistentStaffStore(store);
  return { ok: true };
}

export function listAllStaff() {
  return Array.from(refreshStaffStore().values()).map(stripPassword);
}

export function getStaffByIdOrCode(identifier) {
  if (identifier === null || identifier === undefined) return null;
  const store = refreshStaffStore();
  const byCode = store.get(String(identifier).trim().toUpperCase());
  if (byCode) return stripPassword(byCode);
  const numId = Number(identifier);
  for (const staff of store.values()) {
    if (staff.id === numId) return stripPassword(staff);
  }
  return null;
}

export function createStaffRecord(input) {
  const store = refreshStaffStore();
  const code = String(input.code || input.username || "").trim().toUpperCase();
  const name = String(input.name || input.fullName || "").trim();
  const role = ROLE_METADATA[input.role] ? input.role : "SALE";

  if (!code || !name) {
    return { ok: false, error: "Vui lòng nhập đầy đủ Tên đăng nhập (Mã NV) và Họ tên." };
  }
  if (store.has(code)) {
    return { ok: false, error: `Mã nhân viên / Tên đăng nhập '${code}' đã tồn tại trong hệ thống.` };
  }

  const plainPassword = String(input.password || "").trim();
  if (!plainPassword || plainPassword.length < 8 || !/^(?=.*[A-Za-z])(?=.*\d)/.test(plainPassword)) {
    return {
      ok: false,
      error: "Mật khẩu đăng nhập là bắt buộc và phải có ít nhất 8 ký tự, bao gồm cả chữ cái và chữ số. Không được để trống hoặc dùng mật khẩu yếu mặc định.",
    };
  }

  const nextId = Math.max(0, ...Array.from(runtimeStaffStore.values()).map((s) => s.id)) + 1;
  const normalizedPhone = input.phone ? normalizePhone(input.phone) : "";
  // Bảo vệ tài khoản Zalo cá nhân theo Điều 4 AGENTS.md: mặc định <= 70 tin/ngày cho Sale/CSKH
  const rawDailyMsg = Number(input.dailyMsgTarget ?? 70);
  const safeDailyMsgTarget = role === "ADMIN" ? rawDailyMsg : Math.min(70, Math.max(0, rawDailyMsg));

  const allowedTabs = Array.isArray(input.allowedTabs)
    ? input.allowedTabs.map((t) => String(t).trim()).filter(Boolean)
    : getDefaultAllowedTabsForRole(role);
  const assignedChannels = Array.isArray(input.assignedChannels)
    ? input.assignedChannels.map((c) => String(c).trim()).filter(Boolean)
    : [];
  const customerScope =
    input.customerScope === "all" || input.customerScope === "assigned_only"
      ? input.customerScope
      : role === "ADMIN" || role === "SALE_LEADER"
        ? "all"
        : "assigned_only";

  const newStaff = {
    id: nextId,
    code,
    username: code,
    name,
    fullName: name,
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
    allowedTabs,
    assignedChannels,
    customerScope,
    mustChangePassword: Boolean(input.mustChangePassword),
    passwordHash: hashPassword(plainPassword),
  };

  runtimeStaffStore.set(code, newStaff);
  savePersistentStaffStore(runtimeStaffStore);
  return { ok: true, staff: stripPassword(newStaff) };
}

export function updateStaffRecord(idOrCode, updates) {
  const store = refreshStaffStore();
  let target = null;
  for (const s of store.values()) {
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

  const nextName = updates.fullName !== undefined ? updates.fullName : updates.name;
  if (nextName !== undefined) {
    const cleanName = String(nextName).trim();
    if (cleanName) {
      target.name = cleanName;
      target.fullName = cleanName;
    }
  }
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
  if (updates.allowedTabs !== undefined && target.code !== "ADMIN") {
    target.allowedTabs = Array.isArray(updates.allowedTabs)
      ? updates.allowedTabs.map((t) => String(t).trim()).filter(Boolean)
      : getDefaultAllowedTabsForRole(target.role);
  }
  if (updates.assignedChannels !== undefined) {
    target.assignedChannels = Array.isArray(updates.assignedChannels)
      ? updates.assignedChannels.map((c) => String(c).trim()).filter(Boolean)
      : [];
  }
  if (updates.customerScope === "all" || updates.customerScope === "assigned_only") {
    target.customerScope = target.code === "ADMIN" ? "all" : updates.customerScope;
  }
  if (updates.isActive !== undefined && target.code !== "ADMIN") {
    target.isActive = Boolean(updates.isActive);
  }
  if (updates.resetPassword) {
    const pw = String(updates.resetPassword).trim();
    if (pw.length < 8 || !/^(?=.*[A-Za-z])(?=.*\d)/.test(pw)) {
      return {
        ok: false,
        error: "Mật khẩu đặt lại phải có tối thiểu 8 ký tự, bao gồm cả chữ cái và chữ số.",
      };
    }
    target.passwordHash = hashPassword(pw);
  }

  store.set(target.code, target);
  savePersistentStaffStore(store);
  return { ok: true, staff: stripPassword(target) };
}

export function deleteStaffRecord(idOrCode) {
  const store = refreshStaffStore();
  let target = null;
  for (const s of store.values()) {
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
  store.delete(target.code);
  savePersistentStaffStore(store);
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
  const safeUser = user || {
    id: "ADMIN",
    code: "ADMIN",
    name: "Quản Trị Viên ADDP",
    role: "ADMIN",
  };
  const safeId = safeUser?.id || safeUser?.staffId || "ADMIN";
  const safeRole = safeUser?.role || "ADMIN";
  const allowedTabs = Array.isArray(safeUser?.allowedTabs)
    ? safeUser.allowedTabs
    : getDefaultAllowedTabsForRole(safeRole);
  const assignedChannels = Array.isArray(safeUser?.assignedChannels)
    ? safeUser.assignedChannels.map((c) => String(c))
    : [];
  const customerScope =
    safeRole === "ADMIN" || safeRole === "SALE_LEADER"
      ? safeUser?.customerScope || "all"
      : safeUser?.customerScope === "all"
        ? "all"
        : "assigned_only";

  const payload = {
    id: safeId,
    code: safeUser?.code || safeId,
    username: safeUser?.username || safeUser?.code || safeId,
    name: safeUser?.fullName || safeUser?.name || "Quản Trị Viên ADDP",
    fullName: safeUser?.fullName || safeUser?.name || "Quản Trị Viên ADDP",
    role: safeRole,
    roleLabel: safeUser?.roleLabel || ROLE_METADATA[safeRole]?.label || safeRole,
    teamName: safeUser?.teamName || "Ban Giám Đốc",
    dailyCareTarget: safeUser?.dailyCareTarget ?? 0,
    dailyMsgTarget: safeUser?.dailyMsgTarget ?? DEFAULT_DAILY_ZALO_MSG_LIMIT,
    allowedTabs,
    assignedChannels,
    customerScope,
    allowedChannelAccountIds: getAllowedChannelIdsForStaff(safeId, safeRole),
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 ngày
  };
  const secret = getAuthSecret();
  const base64Payload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(base64Payload).digest("base64url");
  return `${base64Payload}.${signature}`;
}

export function verifySessionToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  let secret;
  try {
    secret = getAuthSecret();
  } catch {
    return null; // Fail closed nếu chưa cấu hình secret
  }
  const [base64Payload, signature] = token.split(".");
  const expectedSig = crypto.createHmac("sha256", secret).update(base64Payload).digest("base64url");
  if (signature !== expectedSig) return null;

  try {
    const payload = JSON.parse(Buffer.from(base64Payload, "base64url").toString("utf8"));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
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
  if (staff.customerScope === "all") return true;
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
    }
    if (!token && request?.headers?.get) {
      const cookieHeader = request.headers.get("cookie") || "";
      const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
      if (match) token = match[1];
      if (!token) {
        const authHeader = request.headers.get("authorization") || "";
        if (authHeader.toLowerCase().startsWith("bearer ")) {
          token = authHeader.slice(7).trim();
        }
      }
    }
    if (!token) {
      return null;
    }
    const payload = verifySessionToken(token);
    if (!payload) return null;
    return getStaffByIdOrCode(payload.code) || payload;
  } catch {
    return null;
  }
}

export async function getCurrentStaff(request) {
  return getSessionStaff(request);
}
