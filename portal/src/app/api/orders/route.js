import { NextResponse } from "next/server";
import {
  getStoredOrders,
  createOrderWithKiotVietSync,
  updateOrderStatus,
} from "@/lib/ordersStore";
import { getSessionStaff } from "@/lib/auth";
import { filterRecordsByRbac, buildDataScopeFilter } from "@/lib/rbac";
import { normalizePhone } from "@/lib/phone";
import { calculateOrderSummaryForPhone } from "@/lib/kiotvietSync";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const staff = await getSessionStaff(req);
    const { searchParams } = new URL(req.url);
    const channel = searchParams.get("channel");
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const phoneParam = searchParams.get("phone");

    let orders = getStoredOrders();

    // 1. Tra cứu nhanh theo SĐT chuẩn hóa (dùng cho Inbox Right Panel & Hồ sơ 360)
    if (phoneParam !== null) {
      const normPhone = normalizePhone(phoneParam);
      const scope = buildDataScopeFilter(staff, "orders");
      if (!scope.allowed || !normPhone) {
        return NextResponse.json({
          ok: true,
          total: 0,
          orders: [],
          summary: {
            totalOrders: 0,
            totalSpent: 0,
            deliveredCount: 0,
            cancelledCount: 0,
            deliveryRate: "0%",
          },
        });
      }

      let matched = orders.filter((o) => normalizePhone(o.phone) === normPhone);

      if (scope.scopeType !== "COMPANY_ALL" && scope.scopeType !== "OPERATIONS_ONLY") {
        matched = matched.filter(
          (o) =>
            filterRecordsByRbac(staff, [o], "orders").length > 0 ||
            ((o.channel === "KIOTVIET" || o.syncedKiotViet) && !o.staffId)
        );
      }

      if (!scope.canViewFinancialCost) {
        matched = matched.map((o) => {
          const clone = { ...o };
          delete clone.costPrice;
          delete clone.cogs;
          delete clone.grossProfit;
          delete clone.netProfit;
          delete clone.adsCost;
          delete clone.kiotVietPayload;
          return clone;
        });
      }

      matched.sort(
        (a, b) =>
          new Date(b.createdAt || b.createdDate || 0).getTime() -
          new Date(a.createdAt || a.createdDate || 0).getTime()
      );

      const summary = calculateOrderSummaryForPhone(matched, normPhone);
      return NextResponse.json({
        ok: true,
        total: matched.length,
        orders: matched,
        summary,
      });
    }

    // 2. Lọc RBAC (Điều 5 AGENTS.md)
    orders = filterRecordsByRbac(staff, orders, "orders");

    // 3. Lọc theo kênh
    if (channel && channel !== "ALL") {
      orders = orders.filter((o) => o.channel === channel);
    }

    // 4. Lọc theo trạng thái
    if (status && status !== "ALL") {
      orders = orders.filter((o) => o.status === status);
    }

    // 5. Tìm kiếm từ khóa (Mã đơn, Mã KiotViet, SĐT chuẩn hóa, Tên)
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      const normQ = normalizePhone(search);
      orders = orders.filter(
        (o) =>
          o.orderCode?.toLowerCase().includes(q) ||
          o.kiotVietOrderCode?.toLowerCase().includes(q) ||
          o.customerName?.toLowerCase().includes(q) ||
          o.phone?.includes(q) ||
          (normQ && normalizePhone(o.phone).includes(normQ))
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

    const result = await createOrderWithKiotVietSync({
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

    if (!result.ok || !result.order) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error || "Không thể đẩy đơn hàng lên KiotViet.",
          kiotViet: result.kiotViet || null,
        },
        { status: 400 }
      );
    }

    const { order, kiotViet } = result;

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
