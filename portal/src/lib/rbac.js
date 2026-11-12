import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
  getStaffByIdOrCode,
  listAllStaff,
  canAccessModule,
} from "./auth.js";

/**
 * Backend RBAC Middleware & Data Scope Filter (WBS-06)
 * Kế thừa C:\AH-Trabi\quan-ly-kho\users_management_view.php
 * Thực thi Điều 5 - AGENTS.md:
 * - ADMIN: Xem & thao tác toàn bộ hệ thống, xem báo cáo lãi/lỗ & giá vốn.
 * - SALE_LEADER: Xem dữ liệu của nhóm mình quản lý (teamName).
 * - SALE / CSKH: Chỉ xem/nhận tin nhắn từ Kênh được phân quyền & Khách hàng do mình phụ trách (staffId == currentUser.id).
 *   Không được phép xuất toàn bộ danh sách khách hàng công ty.
 * - KHO / KE_TOAN: Chỉ truy cập Đơn hàng, Tồn kho, Combo, Đối soát & Thuế.
 */

const SENSITIVE_FINANCIAL_FIELDS = ["cogsAmount", "netProfit", "adsCostAllocated", "costPrice"];

export function getCurrentStaffFromCookieOrHeader(cookieStore, headers) {
  let token = cookieStore?.get?.(SESSION_COOKIE_NAME)?.value;
  if (!token && headers?.get) {
    const authHeader = headers.get("authorization") || "";
    if (authHeader.toLowerCase().startsWith("bearer ")) {
      token = authHeader.slice(7).trim();
    }
  }
  const session = verifySessionToken(token);
  if (!session) return null;

  const liveStaff = getStaffByIdOrCode(session.code || session.id);
  return liveStaff || session;
}

/**
 * Xây dựng bộ lọc phạm vi dữ liệu (Data Scope Filter) theo vai trò và staffId
 * @param {object} staff Thông tin nhân viên đăng nhập
 * @param {"customers"|"conversations"|"orders"|"tasks"|"finance"} resourceType Loại tài nguyên truy vấn
 */
export function buildDataScopeFilter(staff, resourceType = "customers") {
  if (!staff) {
    return {
      allowed: false,
      scopeType: "NONE",
      reason: "Chưa đăng nhập phiên làm việc.",
      prismaWhere: { id: -1 },
      canViewFinancialCost: false,
      canExportAllCustomers: false,
    };
  }

  const role = staff.role;
  const staffId = Number(staff.id);
  const allowedChannels = Array.isArray(staff.allowedChannelAccountIds)
    ? staff.allowedChannelAccountIds
    : [];

  // 1. ADMIN: Toàn quyền trên mọi tài nguyên
  if (role === "ADMIN") {
    return {
      allowed: true,
      scopeType: "COMPANY_ALL",
      description: "Toàn quyền truy cập dữ liệu toàn công ty, bao gồm giá vốn và lãi/lỗ ròng.",
      prismaWhere: {},
      allowedStaffIds: null, // null = tất cả
      allowedChannelAccountIds: allowedChannels,
      canViewFinancialCost: true,
      canExportAllCustomers: true,
    };
  }

  // 2. KHO / KE_TOAN: Chỉ truy cập Đơn hàng, Tồn kho, Combo, Đối soát & Thuế
  if (role === "KHO" || role === "KE_TOAN") {
    if (resourceType === "conversations" || resourceType === "tasks") {
      return {
        allowed: false,
        scopeType: "BLOCKED_BY_ROLE",
        description: `Vai trò ${role} chỉ truy cập Đơn hàng, Kho, Combo và Đối soát; không truy cập Hộp thư hoặc Lịch CSKH.`,
        prismaWhere: { id: -1 },
        allowedStaffIds: [],
        allowedChannelAccountIds: allowedChannels,
        canViewFinancialCost: role === "KE_TOAN",
        canExportAllCustomers: false,
      };
    }

    return {
      allowed: true,
      scopeType: "OPERATIONS_ONLY",
      description:
        role === "KE_TOAN"
          ? "Truy cập toàn bộ Đơn hàng, Đối soát tài chính sàn và Báo cáo Thuế."
          : "Truy cập Đơn hàng, Tồn kho và Bóc tách mã Combo để đóng gói xuất kho.",
      prismaWhere: {},
      allowedStaffIds: null,
      allowedChannelAccountIds: allowedChannels,
      canViewFinancialCost: role === "KE_TOAN",
      canExportAllCustomers: false,
    };
  }

  // 3. SALE_LEADER: Xem dữ liệu của nhóm mình quản lý (teamName)
  if (role === "SALE_LEADER") {
    const teamMembers = listAllStaff().filter(
      (s) => s.teamName === staff.teamName || s.id === staffId
    );
    const teamStaffIds = teamMembers.map((s) => s.id);

    const prismaWhere =
      resourceType === "conversations"
        ? {
            OR: [
              { assignedStaffId: { in: teamStaffIds } },
              { channelAccountId: { in: allowedChannels } },
            ],
          }
        : { staffId: { in: teamStaffIds } };

    return {
      allowed: true,
      scopeType: "TEAM_SCOPE",
      description: `Xem và điều phối dữ liệu của nhóm '${staff.teamName}' (${teamStaffIds.length} nhân sự: ${teamMembers.map((m) => m.code).join(", ")}).`,
      prismaWhere,
      allowedStaffIds: teamStaffIds,
      allowedChannelAccountIds: allowedChannels,
      canViewFinancialCost: false,
      canExportAllCustomers: false,
    };
  }

  const customerScope =
    staff.customerScope === "all" || staff.customerScope === "assigned_only"
      ? staff.customerScope
      : "assigned_only";
  const assignedChannels = Array.isArray(staff.assignedChannels)
    ? staff.assignedChannels.map((c) => String(c))
    : [];
  const staffFullName = String(staff.fullName || staff.name || "").trim();

  if (resourceType === "customers" && customerScope === "all") {
    return {
      allowed: true,
      scopeType: "COMPANY_ALL",
      customerScope: "all",
      description: `Được cấp quyền xem toàn bộ khách hàng (customerScope = all).`,
      prismaWhere: {},
      allowedChannelAccountIds: assignedChannels.length ? assignedChannels : allowedChannels,
      canViewFinancialCost: false,
      canExportAllCustomers: false,
    };
  }

  // 4. SALE / CSKH: Chỉ xem Khách hàng/Đơn hàng do mình phụ trách (staffId == currentUser.id) & Kênh được gán
  const prismaWhere =
    resourceType === "conversations"
      ? {
          AND: [
            { channelAccountId: { in: allowedChannels } },
            { OR: [{ assignedStaffId: staffId }, { assignedStaffId: null }] },
          ],
        }
      : { staffId };

  return {
    allowed: true,
    scopeType: "OWN_ASSIGNED_ONLY",
    customerScope,
    description: `Chỉ xem dữ liệu do cá nhân phụ trách (staffId = ${staffId} / ${staff.code}) và ${assignedChannels.length || allowedChannels.length} tài khoản kênh được phân quyền.`,
    prismaWhere,
    allowedStaffIds: [staffId],
    allowedStaffNames: staffFullName ? [staffFullName] : [],
    allowedChannelAccountIds: allowedChannels.length ? assignedChannels : allowedChannels,
    canViewFinancialCost: false,
    canExportAllCustomers: false,
  };
}

/**
 * Lọc danh sách bản ghi thực tế theo RBAC và che giấu các cột tài chính nhạy cảm (giá vốn, lãi ròng) nếu không đủ quyền
 */
export function filterRecordsByRbac(staff, records = [], resourceType = "customers") {
  const scope = buildDataScopeFilter(staff, resourceType);
  if (!scope.allowed) return [];

  const filtered = records.filter((item) => {
    if (scope.scopeType === "COMPANY_ALL" || scope.scopeType === "OPERATIONS_ONLY") {
      return true;
    }

    if (resourceType === "conversations") {
      const chId = String(item.channelAccountId || item.accountId || item.ownId || "");
      const channelOk =
        !chId ||
        scope.allowedChannelAccountIds.some((c) => String(c) === chId);
      const staffTarget = item.assignedStaffId ?? item.staffId;
      const staffOk =
        !staffTarget || scope.allowedStaffIds?.includes(Number(staffTarget));
      return channelOk && staffOk;
    }

    const recordStaffId = Number(item.staffId ?? item.assignedStaffId ?? 0);
    if (scope.allowedStaffIds?.includes(recordStaffId)) {
      // Nếu bản ghi được migrate có ghi rõ tên NV khác thì chỉ khớp theo tên NV, trừ khi staffId thực sự thuộc về nhân viên đó (> 1)
      const explicitName = String(item.assignedStaff || item.staffName || "").trim();
      if (!explicitName || recordStaffId > 1) return true;
    }

    const normalizeVi = (val) =>
      String(val || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .trim()
        .toLowerCase();

    const recordStaffName = normalizeVi(item.assignedStaff || item.staffName || "");
    if (recordStaffName && Array.isArray(scope.allowedStaffNames) && scope.allowedStaffNames.length > 0) {
      return scope.allowedStaffNames.some((n) => {
        const target = normalizeVi(n);
        return target && (recordStaffName === target || recordStaffName.includes(target));
      });
    }

    return false;
  });

  if (scope.canViewFinancialCost) {
    return filtered;
  }

  // Ẩn các trường giá vốn & lãi/lỗ đối với nhân viên không phải ADMIN / KE_TOAN
  return filtered.map((item) => {
    const clone = { ...item };
    for (const field of SENSITIVE_FINANCIAL_FIELDS) {
      if (field in clone) {
        delete clone[field];
      }
    }
    return clone;
  });
}

/**
 * Guard bảo vệ API Route của Next.js theo Role và Module
 */
export function guardApiRequest(cookieStore, headers, options = {}) {
  const { allowedRoles = null, moduleKey = null, resourceType = "customers", allowPasswordChange = false } = options;
  const staff = getCurrentStaffFromCookieOrHeader(cookieStore, headers);

  if (!staff) {
    return {
      ok: false,
      response: Response.json(
        { error: "Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại." },
        { status: 401 }
      ),
    };
  }

  // Bắt buộc đổi mật khẩu sau đăng nhập đầu tiên
  if (staff.mustChangePassword && !allowPasswordChange) {
    return {
      ok: false,
      response: Response.json(
        {
          ok: false,
          error: "Bắt buộc đổi mật khẩu: Tài khoản cần đổi mật khẩu khởi tạo trước khi truy cập các phân hệ nghiệp vụ.",
          code: "MUST_CHANGE_PASSWORD",
          mustChangePassword: true,
        },
        { status: 403 }
      ),
    };
  }

  if (Array.isArray(allowedRoles) && allowedRoles.length > 0 && !allowedRoles.includes(staff.role)) {
    return {
      ok: false,
      response: Response.json(
        {
          error: `Từ chối truy cập (RBAC): Vai trò '${staff.role}' không được cấp quyền thực hiện thao tác này.`,
        },
        { status: 403 }
      ),
    };
  }

  if (moduleKey && !canAccessModule(staff.role, moduleKey)) {
    return {
      ok: false,
      response: Response.json(
        {
          error: `Từ chối truy cập (RBAC): Vai trò '${staff.role}' không có quyền truy cập phân hệ '${moduleKey}'.`,
        },
        { status: 403 }
      ),
    };
  }

  const scope = buildDataScopeFilter(staff, resourceType);
  return { ok: true, staff, scope };
}

/**
 * Kiểm tra nhân viên hiện tại có quyền xem dữ liệu của targetStaffId hay không
 * @param {object} staff
 * @param {number|string} targetStaffId
 * @returns {boolean}
 */
export function canAccessStaffData(staff, targetStaffId) {
  if (!staff) return false;
  if (staff.role === "ADMIN" || staff.role === "KE_TOAN" || staff.role === "KHO") return true;
  if (!targetStaffId) return true; // Chưa gán ai thì ai cũng xem được để nhận khách
  if (staff.role === "SALE_LEADER") {
    const teamMembers = listAllStaff().filter((s) => s.teamName === staff.teamName || s.id === staff.id);
    return teamMembers.some((m) => m.id === Number(targetStaffId));
  }
  return Number(staff.id) === Number(targetStaffId);
}
