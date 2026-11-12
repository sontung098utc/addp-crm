import { NextResponse } from "next/server";
import { markThreadAsRead, getThreadReadTimestamp } from "@/lib/readReceiptStore.js";

export async function POST(request) {
  try {
    const body = await request.json();
    const threadId = body?.threadId || body?.thread_id || body?.id;
    const timestamp = body?.timestamp || Date.now();

    if (!threadId) {
      return NextResponse.json({ ok: false, error: "Thiếu threadId" }, { status: 400 });
    }

    markThreadAsRead(threadId, timestamp);
    return NextResponse.json({
      ok: true,
      threadId,
      timestamp,
      message: "Đã đánh dấu đã đọc",
    });
  } catch (error) {
    console.error("[POST /api/conversations/mark-read error]:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const threadId = searchParams.get("threadId") || searchParams.get("thread_id");
    if (!threadId) {
      return NextResponse.json({ ok: false, error: "Thiếu threadId" }, { status: 400 });
    }
    const timestamp = getThreadReadTimestamp(threadId);
    return NextResponse.json({ ok: true, threadId, timestamp });
  } catch (error) {
    console.error("[GET /api/conversations/mark-read error]:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
