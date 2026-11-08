import { NextResponse } from "next/server";
import { controlBroadcastCampaign } from "@/lib/broadcastEngine.js";

/**
 * ADDP Omnichannel AI CRM — API Điều Khiển Chiến Dịch Broadcast (Module 2.4 - WBS-35)
 * POST /api/broadcast/campaigns/[id]/action
 * Body: { action: 'start' | 'pause' | 'resume' | 'cancel', reason?: string }
 */

export async function POST(request, context) {
  try {
    const resolvedParams = await Promise.resolve(context.params);
    const id = resolvedParams?.id;
    const body = await request.json();
    const { action = "pause", reason = "" } = body || {};

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Thiếu mã chiến dịch (id)." },
        { status: 400 }
      );
    }

    const validActions = ["start", "pause", "resume", "cancel"];
    const normAction = String(action || "").toLowerCase();
    if (!validActions.includes(normAction)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Hành động không hợp lệ. Chỉ chấp nhận: ${validActions.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const updated = controlBroadcastCampaign(id, normAction, reason);
    if (!updated) {
      return NextResponse.json(
        { ok: false, error: `Không tìm thấy chiến dịch #${id}.` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      action: normAction,
      campaign: updated,
    });
  } catch (error) {
    console.error("[POST /api/broadcast/campaigns/[id]/action ERROR]", error);
    return NextResponse.json(
      { ok: false, error: "Lỗi khi điều khiển chiến dịch Broadcast." },
      { status: 500 }
    );
  }
}
