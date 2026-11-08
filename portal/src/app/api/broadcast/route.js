import { NextResponse } from "next/server";
import {
  getAllBroadcastCampaigns,
  createBroadcastCampaign,
  controlBroadcastCampaign,
  getSentCountTodayForChannel,
} from "@/lib/broadcastEngine.js";

export async function GET() {
  try {
    const campaigns = getAllBroadcastCampaigns();
    return NextResponse.json({
      ok: true,
      campaigns,
      total: campaigns.length,
      sentToday: getSentCountTodayForChannel("ZALO_PERSONAL"),
      antiBanRules: {
        minDelaySec: 45,
        maxDelaySec: 120,
        dailyTargetLimit: 150,
        policy: "Điều 4 AGENTS.md: Giãn cách 45-120s ngẫu nhiên, tối đa 150 tin/ngày/nick Zalo",
      },
    });
  } catch (error) {
    console.error("GET /api/broadcast error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action, id, status, campaign } = body || {};

    if ((action === "UPDATE_STATUS" || action) && id) {
      const updated = controlBroadcastCampaign(id, status || action);
      return NextResponse.json({ ok: true, campaign: updated });
    }

    const created = createBroadcastCampaign(campaign || body);
    return NextResponse.json({
      ok: true,
      campaign: created,
      message: "Chiến dịch đã được thêm vào Hàng đợi gửi tin thông minh (SmartBroadcastQueue).",
    });
  } catch (error) {
    console.error("POST /api/broadcast error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
