import crypto from "crypto";

/**
 * Hệ thống Xác thực & Phân quyền RBAC (WBS-05 & WBS-06)
 * Kế thừa C:\QuanlyKH\src\lib\auth.js + C:\AH-Trabi\quan-ly-kho\users_management_view.php
 * Tuân thủ Điều 5 - AGENTS.md (Phân quyền 6 cấp: ADMIN, SALE_LEADER, SALE, CSKH, KHO, KE_TOAN)
 */

export const SESSION_COOKIE_NAME = "addp_crm_session";
const SECRET = process.env.CRM_JWT_SECRET || "ADDP_CRM_DEFAULT_DEV_SECRET_2026";

// Danh sách nhân viên khởi tạo sẵn (đồng bộ với seed trong 001_init_addp_crm.sql)
// Mật khẩu mặc định cho nhân viên mới: "123456" (giống QuanlyKH)
const runtimeStaffStore = new Map([
  [
    "ADMIN",
    {
      id: 1,
      code: "ADMIN",
      name: "Quản Trị Viên ADDP",
      role: "ADMIN",
      roleLabel: "Quản trị viên (Toàn quyền)",
      teamName: "Ban Giám Đốc",
      kpi: 0,
      dailyCareTarget: 0,
      dailyMsgTarget: 200,
      passwordHash: hashPassword("123456"),
    },
  ],
  [
    "S001",
    {
      id: 2,
      code: "S001",
      name: "Trưởng Nhóm Sale ADDP",
      role: "SALE_LEADER",
      roleLabel: "Trưởng nhóm Kinh doanh",
      teamName: "Team Sale 01",
      kpi: 200000000,
      dailyCareTarget: 10,
      dailyMsgTarget: 70,
      passwordHash: hashPassword("123456"),
    },
  ],
  [
    "S002",
    {
      id: 3,
      code: "S002",
      name: "Nhân Viên Sale & CSKH 01",
      role: "SALE",
      roleLabel: "Nhân viên Sale / CSKH",
      teamName: "Team Sale 01",
      kpi: 100000000,
      dailyCareTarget: 7,
      dailyMsgTarget: 70,
      passwordHash: hashPassword("123456"),
    },
  ],
  [
    "KHO01",
    {
      id: 4,
      code: "KHO01",
      name: "Quản Lý Kho & Điều Phối Đơn",
      role: "KHO",
      roleLabel: "Nhân viên Kho & Đối soát",
      teamName: "Bộ phận Kho vận",
      kpi: 0,
      dailyCareTarget: 0,
      dailyMsgTarget: 0,
      passwordHash: hashPassword("123456"),
    },
  ],
]);

export function hashPassword(plainPassword) {
  return crypto.createHmac("sha256", SECRET).update(String(plainPassword)).digest("hex");
}

export function authenticateStaff(code, password) {
  if (!code || !password) return null;
  const normalizedCode = String(code).trim().toUpperCase();
  const staff = runtimeStaffStore.get(normalizedCode);
  if (!staff) return null;

  const inputHash = hashPassword(password);
  if (staff.passwordHash !== inputHash) return null;

  const { passwordHash: _, ...safeUser } = staff;
  return safeUser;
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

export function createSessionToken(user) {
  const payload = {
    id: user.id,
    code: user.code,
    name: user.name,
    role: user.role,
    roleLabel: user.roleLabel,
    teamName: user.teamName,
    dailyCareTarget: user.dailyCareTarget,
    dailyMsgTarget: user.dailyMsgTarget,
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

export function canAccessModule(role, moduleKey) {
  const allowed = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.SALE;
  return allowed.includes(moduleKey);
}
