import { NextResponse } from "next/server";
import { normalizePhone } from "../../../../lib/phone.js";
import { resolveComboFormula } from "../../../../lib/comboResolver.js";
import { buildCareSchedule } from "../../../../lib/careAutomation.js";

/**
 * ADDP Omnichannel AI CRM — KiotViet Webhook Gateway (WBS-20)
 * Kế thừa trực tiếp từ C:\QuanlyKH\src\app\api\kiotviet\route.js
 * Tiếp nhận hóa đơn bán hàng tại quầy / kho:
 * - Chuẩn hóa SĐT khách hàng (Điều 3 AGENTS.md)
 * - Tự động bóc tách công thức Combo Glucare
 * - Kích hoạt lộ trình chăm sóc tự động Ngày 1, 3, 7, 14, 21 (careAutomation)
 */

export async function POST(request) {
  try {
    const body = await request.json();

    if (!body.Notifications || !Array.isArray(body.Notifications)) {
      return NextResponse.json({ ok: false, message: "Payload KiotViet không đúng định dạng Notifications" }, { status: 400 });
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
        const totalAmount = Number(invoice.Total || invoice.TotalPayment || 0);

        // Bóc tách combo từ các mặt hàng trong hóa đơn
        const invoiceDetails = invoice.InvoiceDetails || [];
        const comboItems = [];
        for (const item of invoiceDetails) {
          const sku = item.ProductCode || item.Code;
          const qty = Number(item.Quantity || 1);
          const resolved = resolveComboFormula(sku, qty);
          comboItems.push({
            sku,
            productName: item.ProductName || sku,
            quantity: qty,
            resolvedParts: resolved.parts,
          });
        }

        // Tự động xây dựng lịch chăm sóc sau bán
        const careSchedule = buildCareSchedule({
          deliveredAt: invoice.PurchaseDate || new Date().toISOString(),
          productSku: comboItems[0]?.sku || "COMBO-GLUCARE-01",
        });

        processedOrders.push({
          orderCode,
          customerName,
          phone: cleanPhone,
          totalAmount,
          action,
          items: comboItems,
          careTasksCount: careSchedule.length,
        });

        console.log(`[KIOTVIET_WEBHOOK] Đã tiếp nhận đơn ${orderCode} (${cleanPhone}) - Kích hoạt ${careSchedule.length} công việc chăm sóc.`);
      }
    }

    return NextResponse.json({
      ok: true,
      message: `Đã xử lý ${processedOrders.length} hóa đơn từ KiotViet thành công!`,
      orders: processedOrders,
    });
  } catch (error) {
    console.error("[KIOTVIET_WEBHOOK_ERROR]", error);
    return NextResponse.json({ error: "Lỗi hệ thống khi xử lý KiotViet Webhook." }, { status: 500 });
  }
}
