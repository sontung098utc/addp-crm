import { NextResponse } from "next/server";
import {
  getAllBroadcastCampaigns,
  createBroadcastCampaign,
  controlBroadcastCampaign,
  generateAiSpinTemplate,
  spinAndPersonalizeText,
  getSentCountTodayForChannel,
} from "@/lib/broadcastEngine.js";

/**
 * ADDP Omnichannel AI CRM — API Quản Lý Chiến Dịch Smart Broadcast (Module 2 - WBS-35)
 * GET  /api/broadcast/campaigns -> Lấy danh sách chiến dịch & tiến độ % gửi realtime
 * POST /api/broadcast/campaigns -> Tạo chiến dịch mới (hoặc sinh AI Spin Text preview)
 */

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channelId") || "ZALO_PERSONAL";
    const campaigns = getAllBroadcastCampaigns();
    const sentToday = getSentCountTodayForChannel(channelId);

    return NextResponse.json({
      ok: true,
      campaigns,
      total: campaigns.length,
      sentToday,
      dailyLimit: 150,
      speedRange: [45, 120],
    });
  } catch (error) {
    console.error("[GET /api/broadcast/campaigns ERROR]", error);
    return NextResponse.json(
      { ok: false, error: "Không thể tải danh sách chiến dịch Broadcast." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();

    // Hỗ trợ sinh biến thể AI Spin Text tức thì cho nút "✨ AI Sinh Biến Thể Spin Text"
    if (body.action === "GENERATE_SPIN_TEXT") {
      const spunTemplate = generateAiSpinTemplate(body.templateText || "");
      const samplePreview = spinAndPersonalizeText(spunTemplate, {
        fullName: body.sampleName || "Nguyễn Thị Lan",
        phone: body.samplePhone || "0912345678",
        assignedStaff: "Dược sĩ Thảo",
      });
      return NextResponse.json({
        ok: true,
        spunTemplate,
        samplePreview,
      });
    }

    // Hỗ trợ điều khiển trực tiếp nếu truyền action + id
    if (body.id && ["start", "pause", "resume", "cancel"].includes(String(body.action || "").toLowerCase())) {
      const updated = controlBroadcastCampaign(body.id, body.action, body.reason);
      if (!updated) {
        return NextResponse.json(
          { ok: false, error: "Không tìm thấy chiến dịch." },
          { status: 404 }
        );
      }
      return NextResponse.json({ ok: true, campaign: updated });
    }

    const created = createBroadcastCampaign(body);
    return NextResponse.json({
      ok: true,
      campaign: created,
      message: "Đã khởi tạo chiến dịch và đưa vào Hàng đợi Smart Broadcast!",
    });
  } catch (error) {
    console.error("[POST /api/broadcast/campaigns ERROR]", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Lỗi khi tạo chiến dịch Broadcast." },
      { status: 400 }
    );
  }
}
