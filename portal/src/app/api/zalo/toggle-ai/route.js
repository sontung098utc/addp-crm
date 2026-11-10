import { NextResponse } from "next/server";
import {
  triggerHumanTakeover,
  resumeAiBot,
  getConversationBotState,
  isBotActiveForThread,
} from "@/lib/botControlStore.js";

/**
 * POST /api/zalo/toggle-ai
 * Body: { thread_id, enabled, staff_id, pause_minutes }
 * Bật/tắt AI độc lập theo từng khách hàng / thread
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const threadId = body.thread_id || body.threadId;
    const enabled = body.enabled !== undefined ? Boolean(body.enabled) : true;
    const staffId = body.staff_id || body.staffId || "STAFF";
    const pauseMinutes = body.pause_minutes || body.pauseMinutes || 1440; // 24 giờ nếu tắt tay

    if (!threadId) {
      return NextResponse.json(
        { ok: false, error: "Thiếu thông tin thread_id" },
        { status: 400 }
      );
    }

    let state;
    if (enabled) {
      state = resumeAiBot(threadId);
    } else {
      state = triggerHumanTakeover(threadId, staffId, pauseMinutes);
    }

    const check = isBotActiveForThread(threadId);

    return NextResponse.json({
      ok: true,
      thread_id: threadId,
      enabled,
      mode: enabled ? "AI" : "HUMAN",
      state: {
        ...state,
        effectiveMode: check.mode,
      },
      message: enabled
        ? "Đã bật lại AI Đang Trực cho khách hàng."
        : "Đã chuyển sang Nhân Viên Trực tiếp quản.",
    });
  } catch (error) {
    console.error("[POST /api/zalo/toggle-ai ERROR]", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Lỗi cập nhật trạng thái AI" },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const threadId = searchParams.get("thread_id") || searchParams.get("threadId");
    if (!threadId) {
      return NextResponse.json(
        { ok: false, error: "Thiếu thread_id" },
        { status: 400 }
      );
    }

    const check = isBotActiveForThread(threadId);
    const isAi = check.mode === "AI";

    return NextResponse.json({
      ok: true,
      thread_id: threadId,
      enabled: isAi,
      mode: check.mode,
      reason: check.reason,
      accountMode: check.accountMode,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: "Lỗi kiểm tra trạng thái AI" },
      { status: 500 }
    );
  }
}
