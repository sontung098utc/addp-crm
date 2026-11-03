import { NextResponse } from "next/server";
import { generateAiDraftResponse, judgeCustomerMessage } from "@/lib/aiAssistant";

export async function POST(request) {
  try {
    const body = await request.json();
    const { message, customerName, mode } = body;

    // 1. Phán xử tin nhắn khách (AI Judge)
    const judge = judgeCustomerMessage(message || "");

    // 2. Sinh câu trả lời nháp từ Second Brain
    const draft = await generateAiDraftResponse({
      customerMessage: message || "",
      customerName: customerName || "Anh/Chị",
    });

    return NextResponse.json({
      ok: true,
      replyText: draft.replyText,
      references: draft.references,
      tags: [...draft.tags, ...judge.detectedTags],
      decision: judge.decision,
      judgeReason: judge.reason,
      detectedPhone: judge.detectedPhone,
    });
  } catch (error) {
    console.error("POST /api/ai/compose error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
