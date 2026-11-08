import { NextResponse } from "next/server";
import {
  addUnifiedMessage,
  handleIncomingAiBotAutoReply,
} from "@/lib/unifiedMessageRouter.js";
import {
  isChannelBotEnabled,
  getConversationBotState,
} from "@/lib/botControlStore.js";
import {
  generateHumanLikeReply,
  extractCustomerPhoneFromMessage,
} from "@/lib/ai/chatBotEngine.js";
import { getOrCreateCustomerByPhone } from "@/lib/customerIdentityResolver.js";

/**
 * ADDP Omnichannel AI CRM — Zalo Incoming Message Webhook & AI Bot Auto-Reply (Module 5)
 * Endpoint: POST /api/channels/zalo/webhook
 *
 * Quy trình xử lý khi nhận tin nhắn mới từ khách (!isMe):
 * 1. Kiểm tra isChannelBotEnabled(channelId) và getConversationBotState(threadId).
 * 2. Nếu phát hiện SĐT mới trong tin nhắn -> Tự động cập nhật vào trường phone của khách hàng (Hồ sơ 360).
 * 3. Nếu mode === 'HUMAN' -> Bỏ qua, không tự động trả lời.
 * 4. Nếu mode === 'AI' -> Gọi generateHumanLikeReply, chờ đủ typingDelayMs (kiểm tra lại lần nữa xem trong lúc chờ
 *    nhân viên có nhảy vào gõ không), sau đó gửi tin nhắn phản hồi qua Zalo.
 */

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "ADDP Zalo Incoming Webhook & AI Bot Engine",
    status: "active",
  });
}

export async function POST(request) {
  try {
    const body = await request.json();

    const threadId = String(
      body.threadId ||
        body.sender?.id ||
        body.senderId ||
        body.fromUid ||
        body.user_id_by_app ||
        ""
    ).trim();

    const channel = body.channel || "ZALO_PERSONAL";
    const channelId = String(body.channelId || body.oa_id || channel || "ZALO_PERSONAL");
    const senderName =
      body.senderName || body.sender?.name || body.displayName || "Khách Zalo";
    const text = String(
      body.text || body.message?.text || body.content || ""
    ).trim();
    const isMe = Boolean(
      body.isMe ||
        body.isSelf ||
        body.event_name === "oa_send_text" ||
        body.event_name === "user_send_by_oa"
    );

    if (!threadId || !text) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "Thiếu threadId hoặc nội dung tin nhắn.",
      });
    }

    // 1. Lưu tin nhắn vào Unified Message Router (đồng thời bắn SSE lên giao diện Hộp thư)
    const savedMsg = await addUnifiedMessage({
      channel,
      channelId,
      channelName:
        channel === "ZALO_OA" ? "Zalo OA" : "Zalo Cá Nhân (Sơn Tùng)",
      threadId,
      senderId: body.senderId || threadId,
      senderName,
      text,
      isMe,
      timestamp: Number(body.timestamp) || Date.now(),
      metadata: { skipAiBot: true }, // Xử lý trực tiếp bên dưới để trả kết quả chi tiết
    });

    // Nếu là tin nhắn của chính nhân viên/OA gửi đi thì không kích hoạt AI Bot trả lời
    if (isMe) {
      return NextResponse.json({
        ok: true,
        message: savedMsg,
        botAction: "SKIPPED_SELF_MESSAGE",
      });
    }

    // 2. Nếu phát hiện SĐT mới trong tin nhắn -> Tự động cập nhật vào trường phone của khách hàng (Hồ sơ 360)
    const detectedPhone = extractCustomerPhoneFromMessage(text);
    let customerRecord = null;
    if (detectedPhone) {
      customerRecord = getOrCreateCustomerByPhone({
        phone: detectedPhone,
        fullName: senderName,
        source: channel,
        note: `Tự động cập nhật SĐT từ tin nhắn Zalo: "${text.slice(0, 100)}"`,
      });
    }

    // 3. Kiểm tra trạng thái Bot của Kênh và Hội thoại
    const channelEnabled = isChannelBotEnabled(channelId);
    const convState = getConversationBotState(threadId);

    if (!channelEnabled || convState.mode === "HUMAN") {
      return NextResponse.json({
        ok: true,
        message: savedMsg,
        detectedPhone,
        botState: convState,
        botAction: "SKIPPED_HUMAN_MODE",
      });
    }

    // 4. Nếu mode === 'AI': Chạy luồng tư vấn Dược sĩ Thảo + chờ typingDelayMs + kiểm tra lại Human-Takeover trước khi gửi
    if (body.waitForBotReply === true) {
      const botResult = await handleIncomingAiBotAutoReply({
        channel,
        channelId,
        threadId,
        senderName,
        text,
        customerProfile: customerRecord || {
          fullName: senderName,
          phone: detectedPhone,
        },
      });

      return NextResponse.json({
        ok: true,
        message: savedMsg,
        detectedPhone: botResult.detectedPhone || detectedPhone,
        botState: getConversationBotState(threadId),
        botResult,
      });
    }

    // Mặc định chạy bất đồng bộ để phản hồi Webhook < 200ms
    const previewAi = await generateHumanLikeReply({
      customerMessage: text,
      customerProfile: customerRecord || {
        fullName: senderName,
        phone: detectedPhone,
      },
    });

    handleIncomingAiBotAutoReply({
      channel,
      channelId,
      threadId,
      senderName,
      text,
      customerProfile: customerRecord || {
        fullName: senderName,
        phone: detectedPhone,
      },
    }).catch((err) => {
      console.error("[ZALO_WEBHOOK_BOT_ERR]", err.message);
    });

    return NextResponse.json({
      ok: true,
      message: savedMsg,
      detectedPhone: previewAi.detectedPhone || detectedPhone,
      botState: convState,
      botAction: "SCHEDULED_AI_REPLY",
      typingDelayMs: previewAi.typingDelayMs,
    });
  } catch (error) {
    console.error("[POST /api/channels/zalo/webhook ERROR]", error);
    return NextResponse.json(
      { ok: false, error: "Lỗi xử lý Webhook tin nhắn Zalo." },
      { status: 500 }
    );
  }
}
