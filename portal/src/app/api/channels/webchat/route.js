import { NextResponse } from "next/server";
import { askSecondBrain } from "@/lib/secondBrain.js";
import { normalizePhone, resolveCustomerIdentity } from "@/lib/customerIdentityResolver.js";
import { assignLeadToStaff } from "@/lib/leadRouting.js";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const body = await req.json();
    const message = body.message || "";
    let phone = body.phone || "";
    const name = body.name || "Khách Website ADDP.vn";

    // Bắt SĐT từ tin nhắn nếu khách nhập SĐT trong đoạn chat
    const phoneMatch = message.match(/(0\d{9}|\+84\d{9})/);
    if (!phone && phoneMatch) {
      phone = phoneMatch[0];
    }

    if (phone) {
      const cleanPhone = normalizePhone(phone);
      const assignedStaff = assignLeadToStaff({
        phone: cleanPhone,
        channel: "WEBSITE_CHAT",
        customerName: name,
      });

      await resolveCustomerIdentity({
        phone: cleanPhone,
        name,
        channel: "WEBSITE_MAGENTO",
        channelIdentity: `webchat_${cleanPhone}`,
        source: "LiveChat Website ADDP.vn",
        assignedStaffId: assignedStaff?.id || 1,
        assignedStaffName: assignedStaff?.name || "Trần Thu Hà",
        notes: `Khách hỏi từ LiveChat web: "${message}"`,
      });
    }

    // AI Dược sĩ trả lời dựa trên Second Brain
    const knowledgeResult = askSecondBrain(message);
    let reply = knowledgeResult.answer;

    // Nếu khách chưa để lại SĐT và hỏi về giá hoặc tư vấn bệnh, khéo léo xin SĐT để dược sĩ gọi hỗ trợ
    if (!phone && (message.toLowerCase().includes("giá") || message.toLowerCase().includes("mua") || message.toLowerCase().includes("uống"))) {
      reply += "<br><br>👉 <em>Bạn có thể để lại Số Điện Thoại để Dược sĩ ADDP gọi trực tiếp hướng dẫn kỹ hơn cho mình nhé!</em>";
    }

    return NextResponse.json({
      ok: true,
      reply,
      hasPhone: Boolean(phone),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Lỗi POST /api/channels/webchat:", err);
    return NextResponse.json(
      {
        ok: false,
        reply: "Dược sĩ ADDP đã nhận được câu hỏi của bạn. Vui lòng để lại SĐT để chúng tôi tư vấn chi tiết nhất nhé!",
      },
      { status: 500 }
    );
  }
}
