import { NextResponse } from "next/server";
import {
  getAllCustomers,
  resolveCustomerIdentity,
  normalizePhone,
  isValidVietnamPhone,
} from "@/lib/customerIdentityResolver";
import { getTags, getAllConversationTags } from "@/lib/tagStore";
import { getSessionStaff } from "@/lib/auth";
import { filterRecordsByRbac } from "@/lib/rbac";

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

    return NextResponse.json({
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
          }
        : null,
    });
  } catch (error) {
    console.error("GET /api/customers error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const cleanPhone = normalizePhone(body?.phone);
    if (!isValidVietnamPhone(cleanPhone)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Số điện thoại không hợp lệ. Vui lòng nhập SĐT chuẩn 10 số Việt Nam (bắt đầu bằng 03, 05, 07, 08, 09).",
        },
        { status: 400 }
      );
    }

    const result = await resolveCustomerIdentity({ ...body, phone: cleanPhone });

    return NextResponse.json({
      ok: true,
      customer: result.customer,
      isNew: result.isNew,
      matchMethod: result.matchMethod,
    });
  } catch (error) {
    console.error("POST /api/customers error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
