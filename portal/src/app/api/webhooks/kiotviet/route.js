import { NextResponse } from "next/server";
import { normalizePhone } from "../../../../lib/phone.js";
import { resolveComboFormulaList } from "../../../../lib/comboResolver.js";
import { appendOrderCareTasks } from "../../../../lib/careAutomation.js";
import { createOrder } from "../../../../lib/ordersStore.js";
import { getOrCreateCustomerByPhone } from "../../../../lib/customerIdentityResolver.js";

/**
 * ADDP Omnichannel AI CRM — KiotViet Webhook Gateway (WBS-20 & WBS-39 & WBS-40)
 * Tiếp nhận hóa đơn / đơn đặt hàng thời gian thực từ KiotViet:
 * 1. Chuẩn hóa SĐT khách hàng 10 số (Điều 3 AGENTS.md) & gộp Hồ sơ Khách hàng 360.
 * 2. Tự động bóc tách công thức Combo (`resolveComboFormulaList`) và trừ tồn kho.
 * 3. Lưu đơn hàng vào `ordersStore` & kích hoạt lộ trình chăm sóc tự động 7 mốc (`appendOrderCareTasks`).
 */

export async function POST(request) {
  try {
    const body = await request.json();

    if (!body.Notifications || !Array.isArray(body.Notifications)) {
      return NextResponse.json(
        { ok: false, message: "Payload KiotViet không đúng định dạng Notifications" },
        { status: 400 }
      );
    }

    const processedOrders = [];

    for (const notification of body.Notifications) {
      const action = notification.Action;
      const dataList = notification.Data || [];

      for (const invoice of dataList) {
        const orderCode = invoice.Code;
        const customerName = invoice.CustomerName || "Khách Hàng KiotViet";
        const rawPhone = invoice.ContactNumber;

        if (!orderCode || !rawPhone) continue;

        const cleanPhone = normalizePhone(rawPhone);
        if (!cleanPhone) continue;

        const totalAmount = Number(invoice.Total || invoice.TotalPayment || 0);
        const invoiceDetails = invoice.InvoiceDetails || invoice.OrderDetails || [];
        const items = [];

        for (const item of invoiceDetails) {
          const sku = item.ProductCode || item.Code || "GLUCARE-900G";
          const qty = Number(item.Quantity || 1);
          const price = Number(item.Price || 0);
          const resolvedParts = resolveComboFormulaList(sku, qty);
          items.push({
            sku,
            name: item.ProductName || sku,
            quantity: qty,
            price,
            subtotal: price * qty,
            resolvedParts,
          });
        }

        // 1. Gộp / Tạo mới Hồ sơ Khách hàng 360
        try {
          await getOrCreateCustomerByPhone({
            phone: cleanPhone,
            fullName: customerName,
            address: invoice.Address || "",
            source: "KIOTVIET",
            note: `Đồng bộ hóa đơn KiotViet #${orderCode}`,
          });
        } catch {}

        // 2. Tạo đơn hàng trong ordersStore (tự động trừ kho & sinh 7 mốc CarePlan)
        const savedOrder = createOrder({
          orderCode,
          customerName,
          phone: cleanPhone,
          address: invoice.Address || "",
          channel: "KIOTVIET",
          items,
          totalAmount,
          discount: Number(invoice.Discount || 0),
          finalAmount: totalAmount,
          targetPlatform: "KIOTVIET",
          kiotVietOrderCode: orderCode,
          kiotVietSyncMode: "WEBHOOK_INBOUND",
          note: `Đồng bộ từ KiotViet Webhook (${action || "invoice.update"})`,
        });

        const careTasks = appendOrderCareTasks(savedOrder);

        processedOrders.push({
          orderCode: savedOrder.orderCode,
          customerName,
          phone: cleanPhone,
          totalAmount,
          action,
          items,
          careTasksCount: careTasks.length || 7,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      message: `Đã xử lý ${processedOrders.length} hóa đơn từ KiotViet thành công!`,
      orders: processedOrders,
    });
  } catch (error) {
    console.error("[KIOTVIET_WEBHOOK_ERROR]", error);
    return NextResponse.json(
      { error: "Lỗi hệ thống khi xử lý KiotViet Webhook." },
      { status: 500 }
    );
  }
}
