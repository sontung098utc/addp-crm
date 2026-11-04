import { NextResponse } from "next/server";
import { normalizePhone } from "@/lib/phone.js";
import { addUnifiedMessage } from "@/lib/unifiedMessageRouter.js";

/**
 * ADDP Omnichannel AI CRM — Zalo Official Account (OA) Webhook (WBS-15 & WBS-21)
 * Tiếp nhận sự kiện tương tác từ Zalo Open API v3:
 * - user_send_text, user_send_image: Khách chat với OA
 * - user_submit_info: Khách đồng ý cung cấp SĐT thật cho OA
 * - follow / unfollow: Khách quan tâm hoặc hủy quan tâm OA
 */

export async function GET(request) {
  // Xác thực tên miền crm.addp.vn với Zalo Developers
  const { searchParams } = new URL(request.url);
  const zaloCode = searchParams.get("zalo_verify");

  return NextResponse.json({
    status: "OK",
    service: "ADDP Omnichannel Zalo OA Gateway",
    domain: "crm.addp.vn",
    verified: true,
    code: zaloCode || "verified_addp_2026",
  });
}

export async function POST(request) {
  try {
    const event = await request.json();
    const eventName = event.event_name;
    const oaId = event.oa_id;
    const userId = event.user_id_by_app || event.user_id;
    const timestamp = event.timestamp || Date.now();

    console.log(`[ZALO_OA_WEBHOOK] Nhận sự kiện '${eventName}' từ User ${userId} trên OA ${oaId}`);

    switch (eventName) {
      case "user_send_text": {
        const text = event.message?.text || "";
        console.log(`[ZALO_OA_MESSAGE] Khách nhắn tới OA: "${text}"`);
        await addUnifiedMessage({
          channel: "ZALO_OA",
          channelId: oaId,
          channelName: "Zalo Official Account",
          threadId: String(userId),
          senderId: String(userId),
          senderName: `Khách Zalo OA (${String(userId).slice(-4)})`,
          text,
          isMe: false,
          timestamp,
        });
        break;
      }

      case "user_submit_info": {
        const rawPhone = event.info?.phone;
        const name = event.info?.name;
        if (rawPhone) {
          const phone = normalizePhone(rawPhone);
          console.log(`[ZALO_OA_LEAD] Khách ${name} cấp SĐT thật qua Zalo OA: ${phone}`);
          await addUnifiedMessage({
            channel: "ZALO_OA",
            channelId: oaId,
            channelName: "Zalo Official Account",
            threadId: String(userId),
            senderId: String(userId),
            senderName: name || `Khách ${phone}`,
            text: `[Đã cấp SĐT]: ${phone}`,
            isMe: false,
            timestamp,
          });
        }
        break;
      }

      case "follow": {
        console.log(`[ZALO_OA_FOLLOW] Khách ${userId} vừa quan tâm OA ${oaId}!`);
        await addUnifiedMessage({
          channel: "ZALO_OA",
          channelId: oaId,
          channelName: "Zalo Official Account",
          threadId: String(userId),
          senderId: String(userId),
          senderName: `Khách OA (${String(userId).slice(-4)})`,
          text: "[Hệ thống]: Khách hàng vừa nhấn Quan tâm Zalo OA!",
          isMe: false,
          timestamp,
        });
        break;
      }

      case "unfollow": {
        console.log(`[ZALO_OA_UNFOLLOW] Khách ${userId} vừa bỏ quan tâm OA ${oaId}.`);
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ error: 0, message: "Success" });
  } catch (error) {
    console.error("[ZALO_OA_WEBHOOK_ERROR]", error);
    return NextResponse.json({ error: -1, message: "Server Error" }, { status: 500 });
  }
}
