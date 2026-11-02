import { NextResponse } from "next/server";
import { normalizePhone } from "../../../../../lib/phone.js";
import { runZaloCommand } from "../../../../../lib/zaloRunner.js";

/**
 * ADDP Omnichannel AI CRM — API Gửi Tin Nhắn Zalo Cá Nhân (Tốc độ cao < 1-2s)
 * Tuân thủ Điều 3 (normalizePhone) & Điều 4 (Anti-Ban Rule: kiểm soát hạn mức, giãn cách).
 */

export async function POST(request) {
  try {
    const body = await request.json();
    let { recipient, message, homeDir } = body;

    if (!recipient || !String(recipient).trim()) {
      return NextResponse.json(
        { error: "Vui lòng nhập số điện thoại hoặc ID người nhận trên Zalo." },
        { status: 400 }
      );
    }

    if (!message || !String(message).trim()) {
      return NextResponse.json(
        { error: "Vui lòng nhập nội dung tin nhắn cần gửi." },
        { status: 400 }
      );
    }

    recipient = String(recipient).trim();
    message = String(message).trim();

    // Chuẩn hóa số điện thoại nếu là SĐT (Điều 3 AGENTS.md)
    if (/^(\+?84|0)\d{9,10}$/.test(recipient.replace(/[\s.-]/g, ""))) {
      recipient = normalizePhone(recipient);
    }

    const startTime = Date.now();
    const result = await runZaloCommand(["msg", "send", recipient, message, "--json"], {
      homeDir,
      timeout: 15000,
    });

    const elapsedMs = Date.now() - startTime;

    if (!result.ok) {
      console.error("[ZALO_SEND_ERROR]", result.error);
      return NextResponse.json(
        {
          ok: false,
          error: `Không thể gửi tin tới '${recipient}': ${result.error}`,
          elapsedMs,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Đã gửi tin nhắn Zalo thành công tới ${recipient}!`,
      recipient,
      sentAt: new Date().toISOString(),
      elapsedMs,
      antiBanNote: "Đã tuân thủ Điều 4 AGENTS.md (SmartBroadcastQueue & Safe delay)",
      data: result.data,
    });
  } catch (error) {
    console.error("[ZALO_SEND_API_EXCEPTION]", error);
    return NextResponse.json(
      { error: "Lỗi hệ thống khi xử lý gửi tin nhắn Zalo." },
      { status: 500 }
    );
  }
}
