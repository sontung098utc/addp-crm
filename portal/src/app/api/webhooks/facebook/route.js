import { NextResponse } from "next/server";
import { normalizePhone } from "@/lib/phone.js";
import { addUnifiedMessage } from "@/lib/unifiedMessageRouter.js";

/**
 * ADDP Omnichannel AI CRM — Facebook Webhook (WBS-16 & WBS-21)
 * 1. GET: Xác thực Webhook với Meta (Hub Challenge)
 * 2. POST: Nhận tin nhắn Messenger & Bình luận Fanpage
 *    - Tự động đẩy tin nhắn vào Unified Message Router & SSE Realtime
 *    - Tự động phát hiện SĐT và gọi Meta Graph API để ẨN COMMENT CHỨA SĐT (Chống cướp khách)
 *    - Tuân thủ Điều 3 (normalizePhone) & Điều 11 (Dữ liệu xác thực) AGENTS.md
 */

const FB_VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN || "addp_crm_fb_webhook_secret_2026";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("hub.mode");
    const token = searchParams.get("hub.verify_token");
    const challenge = searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === FB_VERIFY_TOKEN) {
      console.log("[FB_WEBHOOK] Xác thực thành công từ Meta Graph API!");
      return new Response(challenge, { status: 200 });
    }

    return new Response("Mã xác thực Webhook không hợp lệ.", { status: 403 });
  } catch (error) {
    console.error("[FB_WEBHOOK_VERIFY_ERROR]", error);
    return new Response("Lỗi máy chủ.", { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();

    if (body.object !== "page") {
      return NextResponse.json({ ok: false, error: "Event không phải từ Fanpage." }, { status: 400 });
    }

    const entries = body.entry || [];
    for (const entry of entries) {
      const pageId = entry.id;

      // 1. Xử lý tin nhắn riêng tư Messenger (messaging)
      if (Array.isArray(entry.messaging)) {
        for (const event of entry.messaging) {
          const senderId = event.sender?.id;
          const text = event.message?.text;
          const isEcho = Boolean(event.message?.is_echo);

          if (senderId && text && !isEcho) {
            console.log(`[FB_MESSENGER] Nhận tin nhắn từ khách ${senderId} trên Page ${pageId}: "${text}"`);
            // Đẩy vào Router đa kênh realtime
            await addUnifiedMessage({
              channel: "FACEBOOK",
              channelId: pageId,
              channelName: "Fanpage Facebook",
              threadId: senderId,
              senderId,
              senderName: `Khách FB (${senderId.slice(-4)})`,
              text,
              isMe: false,
              timestamp: event.timestamp || Date.now(),
            });
          }
        }
      }

      // 2. Xử lý bình luận bài viết / Livestream (changes: feed)
      if (Array.isArray(entry.changes)) {
        for (const change of entry.changes) {
          if (change.field === "feed") {
            const val = change.value;
            if (val.item === "comment" && val.verb === "add") {
              const commentId = val.comment_id;
              const commentText = val.message || "";
              const senderName = val.from?.name || "Khách FB";
              const senderId = val.from?.id || commentId;

              console.log(`[FB_COMMENT] Bình luận mới từ ${senderName}: "${commentText}"`);

              // Đẩy comment vào hộp thư như một cuộc hội thoại
              await addUnifiedMessage({
                channel: "FACEBOOK",
                channelId: pageId,
                channelName: "Bình luận Fanpage",
                threadId: `post_${val.post_id || pageId}`,
                senderId,
                senderName,
                text: commentText,
                isMe: false,
                metadata: { commentId, postId: val.post_id },
              });

              // Kiểm tra xem comment có chứa số điện thoại không (Regex VN 10 số)
              const phoneMatch = commentText.match(/(0|\+?84)(3|5|7|8|9)[0-9]{8}/);
              if (phoneMatch && commentId) {
                const detectedPhone = normalizePhone(phoneMatch[0]);
                console.log(`[FB_AUTO_HIDE] Phát hiện SĐT ${detectedPhone} trong comment ${commentId}! Đang tiến hành ẩn comment...`);

                // Gọi Meta Graph API để tự động ẩn comment
                try {
                  const pageAccessToken = process.env.FB_PAGE_ACCESS_TOKEN;
                  if (pageAccessToken) {
                    await fetch(`https://graph.facebook.com/v19.0/${commentId}?is_hidden=true`, {
                      method: "POST",
                      headers: { Authorization: `Bearer ${pageAccessToken}` },
                    });
                    console.log(`[FB_AUTO_HIDE] Đã ẩn thành công bình luận ${commentId} để bảo vệ SĐT khách hàng!`);
                  }
                } catch (hideErr) {
                  console.error(`[FB_AUTO_HIDE_ERROR] Lỗi khi ẩn comment ${commentId}:`, hideErr);
                }
              }
            }
          }
        }
      }
    }

    return NextResponse.json({ status: "EVENT_RECEIVED" });
  } catch (error) {
    console.error("[FB_WEBHOOK_POST_ERROR]", error);
    return NextResponse.json({ error: "Lỗi xử lý Webhook Facebook." }, { status: 500 });
  }
}
