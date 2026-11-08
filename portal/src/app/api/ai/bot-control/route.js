import { NextResponse } from "next/server";
import {
  isChannelBotEnabled,
  setChannelBotStatus,
  getConversationBotState,
  triggerHumanTakeover,
  resumeAiBot,
} from "@/lib/botControlStore.js";

/**
 * ADDP Omnichannel AI CRM — API Điều Khiển AI Bot & Human-Takeover (Module 2 & 3)
 * GET  /api/ai/bot-control?threadId=...&channelId=...
 * POST /api/ai/bot-control { threadId, channelId, action: 'pause' | 'resume', pauseMinutes, staffId, enabled }
 */

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const threadId = searchParams.get("threadId") || "";
    const channelId = searchParams.get("channelId") || "DEFAULT";

    const channelEnabled = isChannelBotEnabled(channelId);
    const state = threadId
      ? getConversationBotState(threadId)
      : { threadId: "", mode: "AI", pausedUntil: null, staffId: null };

    return NextResponse.json({
      ok: true,
      threadId,
      channelId,
      channelEnabled,
      state,
    });
  } catch (error) {
    console.error("[GET /api/ai/bot-control ERROR]", error);
    return NextResponse.json(
      { ok: false, error: "Không thể lấy trạng thái AI Bot." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      threadId = "",
      channelId = "DEFAULT",
      action = "pause",
      pauseMinutes = 45,
      staffId = "STAFF",
      enabled,
    } = body || {};

    if (action === "toggle_channel" || typeof enabled === "boolean") {
      const chStatus = setChannelBotStatus(channelId, Boolean(enabled));
      return NextResponse.json({
        ok: true,
        channelId,
        channelEnabled: chStatus.enabled,
        state: threadId ? getConversationBotState(threadId) : null,
      });
    }

    if (!threadId) {
      return NextResponse.json(
        { ok: false, error: "Thiếu mã hội thoại (threadId)." },
        { status: 400 }
      );
    }

    let state;
    if (action === "resume") {
      state = resumeAiBot(threadId);
    } else {
      state = triggerHumanTakeover(threadId, staffId, pauseMinutes);
    }

    return NextResponse.json({
      ok: true,
      threadId,
      channelId,
      channelEnabled: isChannelBotEnabled(channelId),
      state,
    });
  } catch (error) {
    console.error("[POST /api/ai/bot-control ERROR]", error);
    return NextResponse.json(
      { ok: false, error: "Lỗi khi cập nhật trạng thái AI Bot." },
      { status: 500 }
    );
  }
}
