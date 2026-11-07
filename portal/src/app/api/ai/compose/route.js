import { NextResponse } from "next/server";
import { generateAiDraftResponse, judgeCustomerMessage } from "@/lib/aiAssistant";

export async function POST(request) {
  try {
    const body = await request.json();
    const { message, customerMessage, draftIdea, customerName, mode } = body || {};

    const effectiveText =
      (typeof draftIdea === "string" && draftIdea.trim()) ||
      (typeof customerMessage === "string" && customerMessage.trim()) ||
      (typeof message === "string" && message.trim()) ||
      "";

    // 1. Phán xử tin nhắn khách (AI Judge)
    const judge = judgeCustomerMessage(customerMessage || effectiveText);

    // 2. Sinh câu trả lời nháp từ Second Brain
    const draft = await generateAiDraftResponse({
      customerMessage: effectiveText,
      customerName: customerName || "Anh/Chị",
      context: mode || "DRAFT_ONLY",
    });

    const mergedTags = Array.from(new Set([...(draft.tags || []), ...(judge.detectedTags || [])]));

    return NextResponse.json({
      ok: true,
      replyText: draft.replyText,
      references: draft.references,
      tags: mergedTags,
      decision: judge.decision,
      judgeReason: judge.reason,
      detectedPhone: judge.detectedPhone,
    });
  } catch (error) {
    console.error("POST /api/ai/compose error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
