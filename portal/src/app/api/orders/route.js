import { NextResponse } from "next/server";
import {
  getStoredOrders,
  createOrderWithKiotVietSync,
  updateOrderStatus,
} from "@/lib/ordersStore";
import { getSessionStaff } from "@/lib/auth";
import { filterRecordsByRbac } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const staff = await getSessionStaff(req);
    const { searchParams } = new URL(req.url);
    const channel = searchParams.get("channel");
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    let orders = getStoredOrders();

    // 1. Lọc RBAC (Điều 5 AGENTS.md)
    orders = filterRecordsByRbac(staff, orders, "orders");

    // 2. Lọc theo kênh
    if (channel && channel !== "ALL") {
      orders = orders.filter((o) => o.channel === channel);
    }

    // 3. Lọc theo trạng thái
    if (status && status !== "ALL") {
      orders = orders.filter((o) => o.status === status);
    }

    // 4. Tìm kiếm từ khóa (Mã đơn, Mã KiotViet, SĐT, Tên)
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      orders = orders.filter(
        (o) =>
          o.orderCode?.toLowerCase().includes(q) ||
          o.kiotVietOrderCode?.toLowerCase().includes(q) ||
          o.customerName?.toLowerCase().includes(q) ||
          o.phone?.includes(q)
      );
    }

    return NextResponse.json({
      ok: true,
      total: orders.length,
      orders,
    });
  } catch (err) {
    console.error("Lỗi GET /api/orders:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const staff = await getSessionStaff(req);
    const body = await req.json();

    if (!body.phone) {
      return NextResponse.json(
        { ok: false, error: "Vui lòng nhập số điện thoại khách hàng" },
        { status: 400 }
      );
    }

    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Vui lòng chọn ít nhất 1 sản phẩm vào đơn hàng" },
        { status: 400 }
      );
    }

    const { order, kiotViet } = await createOrderWithKiotVietSync({
      customerName: body.customerName,
      phone: body.phone,
      address: body.address,
      channel: body.channel || "ZALO_PERSONAL",
      items: body.items,
      totalAmount: body.totalAmount,
      discount: body.discount,
      finalAmount: body.finalAmount,
      staffId: staff?.id || 1,
      staffName: staff?.name || "Admin Quản Trị",
      note: body.note,
      targetPlatform: body.targetPlatform || "KIOTVIET",
      branchId: body.branchId || 1,
      paymentMethod: body.paymentMethod || "Cash",
    });

    return NextResponse.json({
      ok: true,
      message: `Đã tạo thành công đơn hàng ${order.orderCode} (${
        order.kiotVietOrderCode ? `KiotViet: ${order.kiotVietOrderCode}` : "Đã lưu kho"
      }) & sinh 7 mốc CarePlan!`,
      order,
      kiotViet,
    });
  } catch (err) {
    console.error("Lỗi POST /api/orders:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(req) {
  try {
    const body = await req.json();
    const { orderId, status, deliveryStatus } = body || {};
    if (!orderId || !status) {
      return NextResponse.json(
        { ok: false, error: "Thiếu mã đơn hàng hoặc trạng thái" },
        { status: 400 }
      );
    }
    const updated = updateOrderStatus(orderId, {
      status,
      ...(deliveryStatus ? { deliveryStatus } : {}),
    });
    if (!updated) {
      return NextResponse.json(
        { ok: false, error: "Không tìm thấy đơn hàng" },
        { status: 404 }
      );
    }
    return NextResponse.json({
      ok: true,
      message: `Đã cập nhật trạng thái đơn hàng ${updated.orderCode}`,
      order: updated,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
