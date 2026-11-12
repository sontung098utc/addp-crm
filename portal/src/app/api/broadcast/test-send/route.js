import { NextResponse } from "next/server";
import { spinAndPersonalizeText } from "@/lib/broadcastEngine.js";
import { sendTextMessage } from "@/lib/zaloRunner.js";
import { listAllChannels } from "@/lib/connectionHub.js";
import { isSafePilotMode } from "@/lib/pilotConfig.js";

/**
 * ADDP CRM — API Gửi Thử 1 Tin Nhắn Broadcast (Single Test Message)
 * POST /api/broadcast/test-send
 * Nhận { channel, target, message, accountName, testName }
 * Giúp Telesales/Quản lý kiểm tra văn phong, biến thể spin text và tốc độ trước khi chạy cả tệp.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      channel = "ZALO_PERSONAL",
      target = "",
      message = "",
      accountName = "Zalo Cá Nhân (Sơn Tùng)",
      testName = "Người Nhận Thử",
    } = body || {};

    const cleanTarget = String(target || "").trim();
    const cleanMessage = String(message || "").trim();

    if (!cleanTarget) {
      return NextResponse.json(
        { ok: false, error: "Vui lòng nhập Số điện thoại hoặc Zalo ID / FB PSID người nhận thử." },
        { status: 400 }
      );
    }

    if (!cleanMessage) {
      return NextResponse.json(
        { ok: false, error: "Nội dung tin nhắn không được để trống." },
        { status: 400 }
      );
    }

    // Render spin text & cá nhân hóa cho tin gửi thử
    const renderedText = spinAndPersonalizeText(cleanMessage, {
      fullName: testName,
      phone: cleanTarget,
      assignedStaff: "Dược sĩ Thảo",
      productName: "Sữa hạt Glucare Plus",
    });

    const chUpper = String(channel).toUpperCase();

    if (isSafePilotMode()) {
      return NextResponse.json({
        ok: true,
        mocked: true,
        safeMode: true,
        message: `[PILOT_SAFE_MODE] Đã giả lập gửi thử tin nhắn tới ${cleanTarget} (chưa gửi thật ra ngoài).`,
        renderedText,
        target: cleanTarget,
        timestamp: new Date().toISOString(),
        msgId: `mock_test_${Date.now()}`,
      });
    }

    // 1. Gửi thử qua Zalo Cá Nhân (zca-js)
    if (chUpper.includes("ZALO") && chUpper !== "ZALO_OA") {
      const zaloRes = await sendTextMessage(accountName, cleanTarget, renderedText);
      if (zaloRes.ok) {
        return NextResponse.json({
          ok: true,
          message: `Đã gửi thử tin nhắn Zalo thành công tới ${cleanTarget}!`,
          renderedText,
          target: cleanTarget,
          timestamp: new Date().toISOString(),
          msgId: zaloRes.data?.msgId || `test_${Date.now()}`,
        });
      } else {
        return NextResponse.json(
          {
            ok: false,
            error: zaloRes.error || "Không thể gửi tin nhắn qua Zalo Client. Vui lòng kiểm tra đăng nhập Zalo.",
            renderedText,
          },
          { status: 500 }
        );
      }
    }

    // 2. Gửi thử qua Fanpage Facebook
    if (chUpper.includes("FACEBOOK")) {
      const allChannels = listAllChannels();
      const fbCh = allChannels.find(
        (c) => c.platform === "FACEBOOK" && c.config?.pageAccessToken
      );

      if (!fbCh?.config?.pageAccessToken) {
        return NextResponse.json(
          { ok: false, error: "Chưa cấu hình Page Access Token cho Fanpage Facebook." },
          { status: 400 }
        );
      }

      const fbRes = await fetch(
        `https://graph.facebook.com/v20.0/me/messages?access_token=${encodeURIComponent(
          fbCh.config.pageAccessToken
        )}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_type: "RESPONSE",
            recipient: { id: cleanTarget },
            message: { text: renderedText },
          }),
        }
      );
      const fbData = await fbRes.json();
      if (fbData.message_id) {
        return NextResponse.json({
          ok: true,
          message: `Đã gửi thử tin nhắn Messenger thành công tới ${cleanTarget}!`,
          renderedText,
          target: cleanTarget,
          timestamp: new Date().toISOString(),
          msgId: fbData.message_id,
        });
      } else {
        return NextResponse.json(
          {
            ok: false,
            error: fbData.error?.message || "Meta Graph API từ chối gửi tin thử.",
            renderedText,
          },
          { status: 500 }
        );
      }
    }

    // 3. Kênh khác (Mock / fallback)
    return NextResponse.json({
      ok: true,
      message: `[Mô phỏng] Đã gửi thử thành công tới ${cleanTarget} qua ${channel}!`,
      renderedText,
      target: cleanTarget,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[POST /api/broadcast/test-send ERROR]", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Lỗi máy chủ khi gửi thử tin nhắn." },
      { status: 500 }
    );
  }
}
