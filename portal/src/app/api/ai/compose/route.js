import { NextResponse } from "next/server";
import { judgeCustomerMessage } from "@/lib/aiAssistant";
import { generateHumanLikeReply } from "@/lib/ai/chatBotEngine.js";

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      message,
      customerMessage,
      draftIdea,
      customerName,
      customerPhone,
      phone,
      pathology,
      currentGlucose,
      accountName,
      conversationHistory,
      recentMessages,
      channel,
      pageId,
      accountId,
    } = body || {};

    const rawHistory = Array.isArray(conversationHistory) && conversationHistory.length > 0
      ? conversationHistory
      : Array.isArray(recentMessages)
      ? recentMessages
      : [];

    const normalizedHistory = rawHistory
      .filter((m) => m && (m.text || m.content))
      .map((m) => ({
        isMe: Boolean(m.isMe || m.isSelf || m.role === "assistant"),
        text: String(m.text || m.content || "").trim(),
        senderName: m.senderName || "",
        timestamp: m.timestamp || 0,
      }));

    const lastCustomerMsg =
      [...normalizedHistory].reverse().find((m) => !m.isMe && m.text)?.text || "";

    const effectiveText =
      (typeof draftIdea === "string" && draftIdea.trim()) ||
      (typeof customerMessage === "string" && customerMessage.trim()) ||
      (typeof message === "string" && message.trim()) ||
      lastCustomerMsg ||
      `Xin chào ${customerName || "anh/chị"}`;

    const resolvedPhone = customerPhone || phone || null;

    // 1. Phán xử tin nhắn khách (AI Judge)
    const judge = judgeCustomerMessage(customerMessage || lastCustomerMsg || effectiveText);

    // 2. Sinh câu trả lời chuẩn Chuyên viên tư vấn dinh dưỡng ADDP
    const aiResult = await generateHumanLikeReply({
      customerMessage: effectiveText,
      customerProfile: {
        fullName: customerName || "",
        phone: resolvedPhone,
        pathology: pathology || "",
        currentGlucose: currentGlucose || null,
      },
      accountName: accountName || "",
      channelConfig: {
        channel: channel || "ZALO_PERSONAL",
        pageId: pageId || "",
        channelId: accountId || pageId || "",
      },
      conversationHistory: normalizedHistory,
    });

    const replyText = String(aiResult?.replyText || "").trim();
    if (!replyText) {
      return NextResponse.json(
        { ok: false, error: "AI chưa thể sinh câu trả lời phù hợp cho hội thoại này." },
        { status: 400 }
      );
    }

    const mergedTags = Array.from(
      new Set([
        ...(judge.detectedTags || []),
        ...(aiResult.autoTags || []),
        ...(aiResult.matchedProducts?.includes("glucare_plus") ? ["Sữa hạt Glucare Plus"] : []),
        ...(aiResult.matchedProducts?.includes("dovital") ? ["Mát Gan Dovital"] : []),
      ])
    );

    return NextResponse.json({
      ok: true,
      suggestion: replyText,
      replyText,
      typingDelayMs: aiResult.typingDelayMs,
      references: aiResult.matchedProducts,
      tags: mergedTags,
      medicalRecord: aiResult.medicalRecord,
      decision: judge.decision,
      judgeReason: judge.reason,
      detectedPhone: aiResult.detectedPhone || judge.detectedPhone,
    });
  } catch (error) {
    console.error("POST /api/ai/compose error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
