import { NextResponse } from "next/server";
import {
  getAllCampaigns,
  createBroadcastCampaign,
  updateCampaignStatus,
} from "@/lib/smartBroadcastQueue";
import { getSessionStaff } from "@/lib/auth";

export async function GET(request) {
  try {
    const campaigns = getAllCampaigns();
    return NextResponse.json({
      ok: true,
      campaigns,
      total: campaigns.length,
      antiBanRules: {
        minDelaySec: 45,
        maxDelaySec: 120,
        dailyTargetLimit: 70,
        policy: "Điều 4 AGENTS.md: Giãn cách 45-120s ngẫu nhiên, tối đa 70 tin chủ động/ngày/nick Zalo",
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
    const { action, id, status, campaign } = body;

    if (action === "UPDATE_STATUS" && id && status) {
      const updated = updateCampaignStatus(id, status);
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
