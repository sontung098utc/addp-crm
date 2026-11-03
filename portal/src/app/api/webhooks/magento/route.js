import { NextResponse } from "next/server";
import {
  processMagentoFormSubmission,
  processMagentoOrderWebhook,
} from "@/lib/magentoConnector";

export const dynamic = "force-dynamic";

/**
 * Webhook nhận dữ liệu tự động từ Magento 2.4.8 (WBS-37)
 * Nhận cả Form Lead từ Addp_CustomForm và Đơn hàng Magento
 */
export async function POST(req) {
  try {
    const payload = await req.json();

    // Xác định loại sự kiện
    const eventType = (
      payload.event ||
      payload.event_type ||
      (payload.increment_id ? "order_created" : "form_submission")
    ).toLowerCase();

    let result = null;

    if (eventType.includes("order") || payload.increment_id) {
      result = await processMagentoOrderWebhook(payload);
    } else {
      result = await processMagentoFormSubmission(payload);
    }

    return NextResponse.json({
      ok: true,
      message: "Đồng bộ từ Magento 2.4.8 thành công",
      data: result,
    });
  } catch (err) {
    console.error("Lỗi Webhook Magento 2.4.8:", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Lỗi xử lý webhook Magento" },
      { status: 400 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "ADDP CRM Magento 2.4.8 Webhook Gateway",
    status: "READY",
    acceptedEvents: ["form_submission", "order_created", "cart_abandoned"],
    docs: "Gửi POST JSON kèm phone, name, items hoặc message để đồng bộ",
  });
}
