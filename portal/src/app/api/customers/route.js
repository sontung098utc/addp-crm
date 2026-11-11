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

    let customers = getAllCustomers();

    // 1. Phân quyền RBAC (Điều 5 AGENTS.md)
    customers = filterRecordsByRbac(currentStaff, customers, "customers");

    // Hợp nhất thẻ tag từ conversation_tags.json theo SĐT chuẩn
    const convTagsMap = getAllConversationTags();
    const tagPalette = getTags();
    customers = customers.map((c) => {
      const cleanPhone = normalizePhone(c.phone);
      const phoneTags = cleanPhone && Array.isArray(convTagsMap[cleanPhone]) ? convTagsMap[cleanPhone] : [];
      const mergedTags = Array.from(new Set([...(Array.isArray(c.tags) ? c.tags : []), ...phoneTags].filter(Boolean)));
      return {
        ...c,
        phone: cleanPhone || c.phone || "",
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

    for (const c of customers) {
      for (const t of c.tags) filterTagSet.add(t);
      if (c.assignedStaff && c.assignedStaff !== "Chưa gán") filterStaffSet.add(c.assignedStaff);
      for (const p of c.purchasedProducts) filterProductSet.add(p);
      if (c.purchaseLevel) filterPurchaseLevelSet.add(c.purchaseLevel);
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
      filterOptions: {
        tags: Array.from(filterTagSet),
        staffs: Array.from(filterStaffSet).sort(),
        products: Array.from(filterProductSet).sort(),
        purchaseLevels: Array.from(filterPurchaseLevelSet),
      },
      currentStaff: currentStaff
        ? { id: currentStaff.id, name: currentStaff.name, role: currentStaff.role }
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
