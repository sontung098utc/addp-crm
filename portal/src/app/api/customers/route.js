import { NextResponse } from "next/server";
import { getAllCustomers, resolveCustomerIdentity } from "@/lib/customerIdentityResolver";
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

    // 5. Tìm kiếm theo Tên, SĐT, Bệnh lý
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      customers = customers.filter(
        (c) =>
          c.fullName.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
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
    const result = await resolveCustomerIdentity(body);

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
