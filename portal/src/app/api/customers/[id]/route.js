import { NextResponse } from "next/server";
import { getCustomerById, updateCustomer } from "@/lib/customerIdentityResolver";
import { getSessionStaff, canAccessStaffData } from "@/lib/auth";
import { buildCareSchedule } from "@/lib/careAutomation";

// Force dynamic execution for customer detail API
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const customer = getCustomerById(id);

    if (!customer) {
      return NextResponse.json({ ok: false, error: "Không tìm thấy khách hàng" }, { status: 404 });
    }

    const currentStaff = await getSessionStaff(request);
    // RBAC check
    if (currentStaff && !canAccessStaffData(currentStaff, customer.staffId)) {
      return NextResponse.json(
        { ok: false, error: "Từ chối truy cập: Bạn không phụ trách khách hàng này" },
        { status: 403 }
      );
    }

    // Tự sinh lộ trình chăm sóc mẫu dựa trên sản phẩm đang dùng
    const careSchedule = buildCareSchedule({
      customerName: customer.fullName,
      productName: "Sữa hạt Glucare Plus",
      startDate: customer.lastOrderDate || new Date(),
      durationDays: 30,
    });

    return NextResponse.json({
      ok: true,
      customer,
      careSchedule,
    });
  } catch (error) {
    console.error("GET /api/customers/[id] error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const updated = updateCustomer(id, body);

    if (!updated) {
      return NextResponse.json({ ok: false, error: "Không tìm thấy khách hàng để cập nhật" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      customer: updated,
      message: "Cập nhật hồ sơ khách hàng thành công",
    });
  } catch (error) {
    console.error("PUT /api/customers/[id] error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
