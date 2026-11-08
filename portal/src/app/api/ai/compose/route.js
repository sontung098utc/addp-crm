import { NextResponse } from "next/server";
import { judgeCustomerMessage } from "@/lib/aiAssistant";
import { generateHumanLikeReply } from "@/lib/ai/chatBotEngine.js";

export async function POST(request) {
  try {
    const body = await request.json();
    const { message, customerMessage, draftIdea, customerName, customerPhone, pathology, mode } = body || {};

    const effectiveText =
      (typeof draftIdea === "string" && draftIdea.trim()) ||
      (typeof customerMessage === "string" && customerMessage.trim()) ||
      (typeof message === "string" && message.trim()) ||
      "";

    // 1. Phán xử tin nhắn khách (AI Judge)
    const judge = judgeCustomerMessage(customerMessage || effectiveText);

    // 2. Sinh câu trả lời chuẩn Dược sĩ Thảo từ RAG Dược phẩm (Glucare Plus & Mát Gan Dovital)
    const aiResult = await generateHumanLikeReply({
      customerMessage: effectiveText,
      customerProfile: {
        fullName: customerName || "Anh/Chị",
        phone: customerPhone || null,
        pathology: pathology || "",
      },
      conversationHistory: [],
    });

    const mergedTags = Array.from(
      new Set([
        ...(judge.detectedTags || []),
        ...(aiResult.matchedProducts?.includes("glucare_plus") ? ["Sữa hạt Glucare Plus"] : []),
        ...(aiResult.matchedProducts?.includes("dovital") ? ["Mát Gan Dovital"] : []),
      ])
    );

    return NextResponse.json({
      ok: true,
      replyText: aiResult.replyText,
      typingDelayMs: aiResult.typingDelayMs,
      references: aiResult.matchedProducts,
      tags: mergedTags,
      decision: judge.decision,
      judgeReason: judge.reason,
      detectedPhone: aiResult.detectedPhone || judge.detectedPhone,
    });
  } catch (error) {
    console.error("POST /api/ai/compose error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
