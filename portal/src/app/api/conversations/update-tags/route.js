import { NextResponse } from "next/server";
import { updateConversationTags, getConversationTags } from "@/lib/tagStore.js";

export async function POST(request) {
  try {
    const body = await request.json();
    const threadId = body?.thread_id || body?.threadId || body?.id;
    const tags = body?.tags || [];

    if (!threadId) {
      return NextResponse.json(
        { ok: false, error: "Thiếu thread_id hoặc conversation id" },
        { status: 400 }
      );
    }

    const updatedTags = updateConversationTags(threadId, tags);
    return NextResponse.json({
      ok: true,
      thread_id: threadId,
      threadId,
      tags: updatedTags,
      message: "Cập nhật thẻ tag thành công",
    });
  } catch (error) {
    console.error("[POST /api/conversations/update-tags error]:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const threadId = searchParams.get("thread_id") || searchParams.get("threadId");
    if (!threadId) {
      return NextResponse.json({ ok: false, error: "Thiếu thread_id" }, { status: 400 });
    }
    const tags = getConversationTags(threadId);
    return NextResponse.json({ ok: true, thread_id: threadId, tags });
  } catch (error) {
    console.error("[GET /api/conversations/update-tags error]:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
