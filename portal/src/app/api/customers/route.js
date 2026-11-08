import { NextResponse } from "next/server";
import {
  getAllCustomers,
  resolveCustomerIdentity,
  normalizePhone,
  isValidVietnamPhone,
} from "@/lib/customerIdentityResolver";
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

    let customers = getAllCustomers();

    // 1. Phân quyền RBAC (Điều 5 AGENTS.md)
    customers = filterRecordsByRbac(currentStaff, customers, "customers");

    // 2. Lọc theo nhân viên chỉ định (dành cho Admin/Leader)
    if (staffIdParam !== "ALL") {
      customers = customers.filter((c) => String(c.staffId) === String(staffIdParam));
    }

    // 3. Lọc theo VIP Level
    if (vipLevel !== "ALL") {
      customers = customers.filter((c) => c.vipLevel === vipLevel);
    }

    // 4. Lọc theo trạng thái chăm sóc
    if (status !== "ALL") {
      customers = customers.filter((c) => c.status === status || c.careStatus === status);
    }

    // 5. Tìm kiếm theo Tên, SĐT, Bệnh lý, hoặc Zalo UID / Thread ID
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      customers = customers.filter(
        (c) =>
          (c.fullName && c.fullName.toLowerCase().includes(q)) ||
          (c.phone && c.phone.includes(q)) ||
          (c.zaloUid && String(c.zaloUid).toLowerCase() === q) ||
          (c.zaloThreadId && String(c.zaloThreadId).toLowerCase() === q) ||
          (c.pathology && c.pathology.toLowerCase().includes(q)) ||
          (c.code && c.code.toLowerCase().includes(q))
      );
    }

    return NextResponse.json({
      ok: true,
      customers,
      total: customers.length,
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
