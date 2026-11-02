import { NextResponse } from "next/server";
import { normalizePhone } from "../../../../lib/phone.js";

/**
 * ADDP Omnichannel AI CRM — Magento 2.4.8 Webhook Gateway (WBS-20)
 * Kế thừa từ C:\ADDP\CustomForm & C:\ADDP Minigame
 * Tiếp nhận Lead từ form đăng ký tư vấn, minigame nhận quà và đơn hàng website addp.vn.
 * Tuân thủ Điều 6 (Bất đồng bộ không làm chậm TTFB website chính) & Điều 3 (normalizePhone).
 */

export async function POST(request) {
  try {
    const body = await request.json();

    const leadSource = body.source || "MAGENTO_CUSTOM_FORM";
    const customerName = body.fullname || body.name || body.customer_name || "Khách Website ADDP";
    const rawPhone = body.telephone || body.phone || body.contact_phone;
    const note = body.comment || body.message || body.health_note || "";
    const bloodSugar = body.blood_sugar || body.initial_glucose || "";

    if (!rawPhone) {
      return NextResponse.json({ ok: false, error: "Thiếu số điện thoại khách hàng." }, { status: 400 });
    }

    const cleanPhone = normalizePhone(rawPhone);

    const leadData = {
      id: `lead_magento_${Date.now()}`,
      name: customerName,
      phone: cleanPhone,
      source: leadSource,
      note,
      bloodSugar,
      receivedAt: new Date().toISOString(),
      status: "CHỜ_SALE_LIÊN_HỆ",
    };

    console.log(`[MAGENTO_WEBHOOK] Nhận Lead mới từ https://addp.vn: ${customerName} (${cleanPhone}) - Đường huyết: ${bloodSugar || "Chưa rõ"}`);

    return NextResponse.json({
      ok: true,
      message: `Đã tiếp nhận Lead '${customerName}' từ website Magento 2.4.8 thành công!`,
      lead: leadData,
    });
  } catch (error) {
    console.error("[MAGENTO_WEBHOOK_ERROR]", error);
    return NextResponse.json({ error: "Lỗi hệ thống khi tiếp nhận lead từ Magento." }, { status: 500 });
  }
}
