export const SESSION_COOKIE_NAME = "addp_crm_session";

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
  ADMIN: ["dashboard", "inbox", "customers", "tags", "work-tracking", "broadcast", "orders", "inventory", "channels", "reports", "settings", "guide"],
  SALE_LEADER: ["dashboard", "inbox", "customers", "tags", "work-tracking", "broadcast", "orders", "inventory", "channels", "reports", "guide"],
  SALE: ["dashboard", "inbox", "customers", "tags", "work-tracking", "broadcast", "orders", "inventory", "guide"],
  CSKH: ["dashboard", "inbox", "customers", "tags", "work-tracking", "broadcast", "guide"],
  KHO: ["dashboard", "orders", "inventory", "reports", "guide"],
  KE_TOAN: ["dashboard", "orders", "inventory", "reports", "guide"],
};

export const MODULE_TO_ROUTE = {
  dashboard: "/",
  inbox: "/inbox",
  customers: "/customers",
  tags: "/settings/tags",
  "work-tracking": "/work-tracking",
  broadcast: "/broadcast",
  orders: "/orders",
  inventory: "/inventory",
  channels: "/channels",
  reports: "/reports",
  settings: "/settings",
  guide: "/guide",
};

export function getDefaultAllowedTabsForRole(role = "SALE") {
  const mods = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.SALE;
  return mods.map((m) => MODULE_TO_ROUTE[m]).filter(Boolean);
}

export function canAccessModule(roleOrUser, moduleKey) {
  if (moduleKey === "guide") return true;

  if (roleOrUser && typeof roleOrUser === "object") {
    if (roleOrUser.role === "ADMIN") return true;
    if (Array.isArray(roleOrUser.allowedTabs)) {
      const route = MODULE_TO_ROUTE[moduleKey];
      return (
        roleOrUser.allowedTabs.includes(moduleKey) ||
        (route ? roleOrUser.allowedTabs.includes(route) : false)
      );
    }
    const allowed = ROLE_PERMISSIONS[roleOrUser.role] || ROLE_PERMISSIONS.SALE;
    return allowed.includes(moduleKey);
  }

  const role = roleOrUser || "SALE";
  if (role === "ADMIN") return true;
  const allowed = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.SALE;
  return allowed.includes(moduleKey);
}
