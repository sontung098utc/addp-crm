import {
  getAllCustomers,
  updateCustomer,
  resolveCustomerIdentity,
  normalizePhone,
  isValidVietnamPhone,
} from "../../../lib/customerIdentityResolver.js";
import { getTags, getAllConversationTags } from "../../../lib/tagStore.js";
import { getSessionStaff, listAllStaff } from "../../../lib/auth.js";
import { filterRecordsByRbac, guardApiRequest } from "../../../lib/rbac.js";

function normalizeCustomerPlatform(customer = {}) {
  const raw = String(
    customer.source || customer.sourceChannel || customer.channel || ""
  )
    .trim()
    .toUpperCase();
  const labelLower = String(customer.channelLabel || "").trim().toLowerCase();

  if (
    raw === "FACEBOOK" ||
    raw === "FB" ||
    raw === "FANPAGE" ||
    raw === "VPAGE" ||
    labelLower.includes("facebook") ||
    labelLower.includes("fanpage")
  ) {
    return "FACEBOOK";
  }
  if (
    raw === "ZALO_PERSONAL" ||
    raw === "ZALO" ||
    raw === "ZALO_QR" ||
    raw === "ZALO_OA" ||
    labelLower.includes("zalo")
  ) {
    return "ZALO_PERSONAL";
  }
  if (raw === "TIKTOK" || raw === "TIKTOK_SHOP" || labelLower.includes("tiktok")) {
    return "TIKTOK";
  }
  if (raw === "SHOPEE" || labelLower.includes("shopee")) {
    return "SHOPEE";
  }
  if (
    raw === "WEBSITE" ||
    raw === "WEBSITE_MAGENTO" ||
    raw === "MAGENTO" ||
    labelLower.includes("magento") ||
    labelLower.includes("website")
  ) {
    return "WEBSITE";
  }
  if (
    raw === "KHACHHANG_OLD" ||
    raw === "OTHER" ||
    customer.migratedFrom === "khachhang.addp.vn" ||
    Boolean(customer.legacyId) ||
    labelLower.includes("khachhang.addp.vn") ||
    labelLower.includes("vpage") ||
    labelLower.includes("hệ thống cũ")
  ) {
    return "KHACHHANG_OLD";
  }
  return raw || "KHACHHANG_OLD";
}

function isLegacySystemCustomer(customer = {}) {
  const raw = String(
    customer.source || customer.sourceChannel || customer.channel || ""
  )
    .trim()
    .toUpperCase();
  const labelLower = String(customer.channelLabel || "").trim().toLowerCase();
  return (
    customer.migratedFrom === "khachhang.addp.vn" ||
    Boolean(customer.legacyId) ||
    raw === "KHACHHANG_OLD" ||
    raw === "OTHER" ||
    labelLower.includes("khachhang.addp.vn") ||
    labelLower.includes("vpage") ||
    labelLower.includes("hệ thống cũ")
  );
}

export async function GET(request) {
  try {
    const currentStaff = await getSessionStaff(request);
    if (!currentStaff) {
      return Response.json(
        { ok: false, error: "Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại." },
        { status: 401 }
      );
    }

    if (currentStaff.mustChangePassword) {
      return Response.json(
        {
          ok: false,
          error: "Bắt buộc đổi mật khẩu: Tài khoản cần đổi mật khẩu khởi tạo trước khi truy cập các phân hệ nghiệp vụ.",
          code: "MUST_CHANGE_PASSWORD",
          mustChangePassword: true,
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);

    const search = searchParams.get("search") || "";
    const vipLevel = searchParams.get("vipLevel") || "ALL";
    const status = searchParams.get("status") || "ALL";
    const staffIdParam = searchParams.get("staffId") || "ALL";
    const tagParam = searchParams.get("tag") || "ALL";
    const staffNameParam = searchParams.get("staff") || "ALL";
    const productParam = searchParams.get("product") || "ALL";
    const purchaseLevelParam = searchParams.get("purchaseLevel") || "ALL";
    const rawPlatformParam =
      searchParams.get("platform") || searchParams.get("source") || "all";
    const platformFilter = String(rawPlatformParam).trim();

    // 0. Kiểm tra quyền xuất toàn bộ dữ liệu (Điều 5 AGENTS.md)
    const isExportAllRequested =
      searchParams.get("exportAll") === "true" ||
      searchParams.get("export") === "all";

    if (isExportAllRequested && currentStaff?.role !== "ADMIN") {
      return Response.json(
        {
          ok: false,
          error: "Forbidden: Nhân viên không có quyền xuất toàn bộ danh sách khách hàng của công ty (Điều 5 AGENTS.md).",
        },
        { status: 403 }
      );
    }

    let customers = getAllCustomers();

    // 1. Phân quyền RBAC (Điều 5 AGENTS.md)
    customers = filterRecordsByRbac(currentStaff, customers, "customers");

    // Hợp nhất thẻ tag từ conversation_tags.json theo SĐT chuẩn & chuẩn hóa trường Nguồn/Nền tảng
    const convTagsMap = getAllConversationTags();
    const tagPalette = getTags();
    customers = customers.map((c) => {
      const cleanPhone = normalizePhone(c.phone);
      const phoneTags = cleanPhone && Array.isArray(convTagsMap[cleanPhone]) ? convTagsMap[cleanPhone] : [];
      const mergedTags = Array.from(new Set([...(Array.isArray(c.tags) ? c.tags : []), ...phoneTags].filter(Boolean)));
      const normalizedPlatform = normalizeCustomerPlatform(c);
      const isLegacy = isLegacySystemCustomer(c);
      return {
        ...c,
        phone: cleanPhone || c.phone || "",
        source: c.source || normalizedPlatform,
        normalizedPlatform,
        isLegacySource: isLegacy,
        assignedStaff: c.assignedStaff || c.staffName || "Chưa gán",
        purchasedProducts: Array.isArray(c.purchasedProducts) ? c.purchasedProducts : [],
        tags: mergedTags,
      };
    });

    // Tập hợp metadata phục vụ bộ lọc giao diện trước khi filter chi tiết
    const filterTagSet = new Set(tagPalette.map((t) => t.name).filter(Boolean));
    const filterStaffSet = new Set();
    const filterProductSet = new Set();
    const filterPurchaseLevelSet = new Set();
    const platformCounts = {
      KHACHHANG_OLD: 0,
      FACEBOOK: 0,
      ZALO_PERSONAL: 0,
      TIKTOK: 0,
      SHOPEE: 0,
      WEBSITE: 0,
    };

    for (const c of customers) {
      for (const t of c.tags) filterTagSet.add(t);
      if (c.assignedStaff && c.assignedStaff !== "Chưa gán") filterStaffSet.add(c.assignedStaff);
      for (const p of c.purchasedProducts) filterProductSet.add(p);
      if (c.purchaseLevel) filterPurchaseLevelSet.add(c.purchaseLevel);
      if (c.isLegacySource) platformCounts.KHACHHANG_OLD += 1;
      if (c.normalizedPlatform && platformCounts[c.normalizedPlatform] !== undefined) {
        if (c.normalizedPlatform !== "KHACHHANG_OLD") {
          platformCounts[c.normalizedPlatform] += 1;
        }
      }
    }

    const platformOptions = [
      { value: "KHACHHANG_OLD", label: "📦 Hệ thống cũ (khachhang.addp.vn / Vpage)", count: platformCounts.KHACHHANG_OLD },
      { value: "FACEBOOK", label: "📘 Fanpage Facebook", count: platformCounts.FACEBOOK },
      { value: "ZALO_PERSONAL", label: "💬 Zalo Cá Nhân", count: platformCounts.ZALO_PERSONAL },
      { value: "TIKTOK", label: "🎵 TikTok Shop", count: platformCounts.TIKTOK },
      { value: "SHOPEE", label: "🟧 Shopee", count: platformCounts.SHOPEE },
      { value: "WEBSITE", label: "🌐 Website ADDP (Magento)", count: platformCounts.WEBSITE },
    ];

    // 1.5 Lọc theo Nền tảng / Nguồn khách hàng
    const normPlatformParam = platformFilter.toUpperCase();
    if (normPlatformParam && normPlatformParam !== "ALL") {
      if (normPlatformParam === "KHACHHANG_OLD") {
        customers = customers.filter((c) => c.isLegacySource || c.normalizedPlatform === "KHACHHANG_OLD");
      } else {
        customers = customers.filter((c) => c.normalizedPlatform === normPlatformParam);
      }
    }

    // 2. Lọc theo nhân viên chỉ định (ID hoặc Tên nhân viên)
    if (staffIdParam !== "ALL") {
      customers = customers.filter((c) => String(c.staffId) === String(staffIdParam));
    }
    if (staffNameParam !== "ALL") {
      const targetStaffLower = staffNameParam.trim().toLowerCase();
      customers = customers.filter(
        (c) => String(c.assignedStaff || c.staffName || "").trim().toLowerCase() === targetStaffLower
      );
    }

    // 3. Lọc theo Thẻ Tag Lộ trình chăm sóc
    if (tagParam !== "ALL") {
      customers = customers.filter(
        (c) => c.tags.includes(tagParam) || c.careRoute === tagParam || c.status === tagParam
      );
    }

    // 4. Lọc theo Sản phẩm đã mua
    if (productParam !== "ALL") {
      customers = customers.filter((c) => c.purchasedProducts.includes(productParam));
    }

    // 5. Lọc theo Mức độ mua hàng (KH VIP, KH Cũ, KH Mới...)
    if (purchaseLevelParam !== "ALL") {
      customers = customers.filter((c) => c.purchaseLevel === purchaseLevelParam);
    }

    // 6. Lọc theo VIP Level
    if (vipLevel !== "ALL") {
      customers = customers.filter((c) => c.vipLevel === vipLevel);
    }

    // 7. Lọc theo trạng thái chăm sóc
    if (status !== "ALL") {
      customers = customers.filter((c) => c.status === status || c.careStatus === status);
    }

    // 8. Tìm kiếm theo Tên, SĐT, Sản phẩm, Bệnh lý, Địa chỉ hoặc Mã KH
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      customers = customers.filter(
        (c) =>
          (c.fullName && c.fullName.toLowerCase().includes(q)) ||
          (c.phone && c.phone.includes(q)) ||
          (c.zaloUid && String(c.zaloUid).toLowerCase() === q) ||
          (c.zaloThreadId && String(c.zaloThreadId).toLowerCase() === q) ||
          (c.pathology && c.pathology.toLowerCase().includes(q)) ||
          (c.code && c.code.toLowerCase().includes(q)) ||
          (c.assignedStaff && c.assignedStaff.toLowerCase().includes(q)) ||
          c.purchasedProducts.some((p) => p.toLowerCase().includes(q))
      );
    }

    return Response.json({
      ok: true,
      customers,
      total: customers.length,
      tagCatalog: tagPalette,
      platformOptions,
      filterOptions: {
        tags: Array.from(filterTagSet),
        staffs: Array.from(filterStaffSet).sort(),
        products: Array.from(filterProductSet).sort(),
        purchaseLevels: Array.from(filterPurchaseLevelSet),
        platforms: platformOptions,
      },
      currentStaff: currentStaff
        ? {
            id: currentStaff.id,
            name: currentStaff.fullName || currentStaff.name,
            fullName: currentStaff.fullName || currentStaff.name,
            role: currentStaff.role,
            customerScope: currentStaff.customerScope || (currentStaff.role === "ADMIN" || currentStaff.role === "SALE_LEADER" ? "all" : "assigned_only"),
            canExportAllCustomers: currentStaff.role === "ADMIN",
          }
        : null,
    });
  } catch (error) {
    console.error("GET /api/customers error:", error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const cookieHeader = request.headers.get("cookie") || "";
    const cookieStore = request.cookies || {
      get: (name) => {
        const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
        return match ? { value: decodeURIComponent(match[1]) } : null;
      },
    };
    const reqHeaders = request.headers;
    const guard = guardApiRequest(cookieStore, reqHeaders, {
      allowedRoles: ["ADMIN", "SALE_LEADER", "SALE", "CSKH"],
      moduleKey: "customers",
      resourceType: "customers",
    });
    if (!guard.ok) {
      return guard.response;
    }

    const body = await request.json();
    const cleanPhone = normalizePhone(body?.phone);
    if (!isValidVietnamPhone(cleanPhone)) {
      return Response.json(
        {
          ok: false,
          error: "Số điện thoại không hợp lệ. Vui lòng nhập SĐT chuẩn 10 số Việt Nam (bắt đầu bằng 03, 05, 07, 08, 09).",
        },
        { status: 400 }
      );
    }

    const allStaff = listAllStaff();
    const requestedStaffId =
      guard.staff?.role === "SALE" || guard.staff?.role === "CSKH"
        ? guard.staff.id
        : body?.staffId || guard.staff?.id || 1;
    const targetStaff = allStaff.find((s) => Number(s.id) === Number(requestedStaffId));

    // Kiểm tra tồn tại theo SĐT chuẩn (Điều 3 AGENTS.md + Cơ chế Khách hàng vô chủ)
    const allCustomers = getAllCustomers();
    const existingByPhone = allCustomers.find(
      (c) => normalizePhone(c.phone) === cleanPhone
    );

    if (existingByPhone) {
      const isUnassigned =
        existingByPhone.staffId === null ||
        existingByPhone.staffId === undefined ||
        existingByPhone.staffId === "";

      if (isUnassigned) {
        // Khách vô chủ -> Tự động gán chủ mới và cập nhật thông tin bổ sung (nếu có)
        const newOwnerId = targetStaff ? targetStaff.id : Number(requestedStaffId) || guard.staff?.id || 1;
        const newOwnerName = String(
          targetStaff?.fullName ||
            targetStaff?.name ||
            guard.staff?.fullName ||
            guard.staff?.name ||
            "Nhân viên"
        ).trim();

        const adoptUpdates = {
          staffId: newOwnerId,
          staffCode: targetStaff?.code || existingByPhone.staffCode || "",
          assignedStaff: newOwnerName,
          staffName: newOwnerName,
        };

        if (body?.fullName && String(body.fullName).trim()) {
          adoptUpdates.fullName = String(body.fullName).trim();
        }
        if (body?.pathology && String(body.pathology).trim()) {
          adoptUpdates.pathology = String(body.pathology).trim();
        }
        if (body?.notes && String(body.notes).trim()) {
          adoptUpdates.notes = String(body.notes).trim();
        }
        if (body?.address && String(body.address).trim()) {
          adoptUpdates.address = String(body.address).trim();
        }
        if (body?.province && String(body.province).trim()) {
          adoptUpdates.province = String(body.province).trim();
        }
        if (body?.age !== undefined && body?.age !== null && body?.age !== "") {
          adoptUpdates.age = body.age;
        }
        if (body?.gender && String(body.gender).trim()) {
          adoptUpdates.gender = String(body.gender).trim();
        }
        if (body?.purchaseLevel && String(body.purchaseLevel).trim()) {
          adoptUpdates.purchaseLevel = String(body.purchaseLevel).trim();
        }
        if (body?.zaloUid && !existingByPhone.zaloUid) {
          adoptUpdates.zaloUid = body.zaloUid;
        }
        if (body?.facebookUrl && !existingByPhone.facebookUrl) {
          adoptUpdates.facebookUrl = body.facebookUrl;
        }
        if (Array.isArray(body?.tags) && body.tags.length > 0) {
          adoptUpdates.tags = Array.from(
            new Set([
              ...(Array.isArray(existingByPhone.tags) ? existingByPhone.tags : []),
              ...body.tags.map((t) => String(t || "").trim()).filter(Boolean),
            ])
          );
        }

        const adoptedCustomer = updateCustomer(existingByPhone.id, adoptUpdates);
        return Response.json({
          ok: true,
          adopted: true,
          customer: adoptedCustomer,
          isNew: false,
          matchMethod: "PHONE_ADOPTED_UNASSIGNED",
          message: "Đã tự động nhận chăm sóc khách hàng vô chủ từ kho chung",
        });
      }

      // Đã có nhân viên phụ trách -> Trả về HTTP 409 kèm tên nhân viên (nếu có)
      const ownerStaff = allStaff.find(
        (s) => Number(s.id) === Number(existingByPhone.staffId)
      );
      const rawOwnerName =
        existingByPhone.assignedStaff && existingByPhone.assignedStaff !== "Chưa gán"
          ? existingByPhone.assignedStaff
          : existingByPhone.staffName && existingByPhone.staffName !== "Chưa gán"
            ? existingByPhone.staffName
            : ownerStaff?.fullName || ownerStaff?.name || "";
      const ownerName = String(rawOwnerName || "").trim();

      return Response.json(
        {
          ok: false,
          error: ownerName
            ? `Khách hàng đã thuộc quyền phụ trách của nhân viên khác (${ownerName}).`
            : "Khách hàng đã thuộc quyền phụ trách của nhân viên khác.",
          existingCustomerId: existingByPhone.id,
          staffId: existingByPhone.staffId,
          assignedStaff: ownerName || null,
        },
        { status: 409 }
      );
    }

    const payload = {
      ...body,
      phone: cleanPhone,
      staffId: requestedStaffId,
    };

    const result = await resolveCustomerIdentity(payload);

    // Kiểm tra phạm vi dữ liệu: Nếu khách hàng đã tồn tại nhưng thuộc quyền nhân sự khác
    if (!result.isNew && (guard.staff?.role === "SALE" || guard.staff?.role === "CSKH")) {
      const accessible = filterRecordsByRbac(guard.staff, [result.customer], "customers");
      if (accessible.length === 0) {
        return Response.json(
          {
            ok: false,
            error: "Từ chối truy cập: Khách hàng này thuộc phạm vi quản lý của nhân sự khác.",
          },
          { status: 403 }
        );
      }
    }

    return Response.json({
      ok: true,
      customer: result.customer,
      isNew: result.isNew,
      matchMethod: result.matchMethod,
    });
  } catch (error) {
    console.error("POST /api/customers error:", error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
