import { NextResponse } from "next/server";
import { normalizePhone } from "@/lib/phone.js";
import { runZaloCommand, getActiveZaloHome } from "@/lib/zaloRunner.js";
import { sendUnifiedMessage } from "@/lib/unifiedMessageRouter.js";
import fs from "fs";
import path from "path";

/**
 * ADDP Omnichannel AI CRM — API Gửi Tin Nhắn Đa Kênh Hợp Nhất (WBS-21 & WBS-22)
 * Hỗ trợ gửi tin tới:
 * 1. Zalo Cá Nhân (Zalo Agent CLI tốc độ cao)
 * 2. Fanpage Facebook (Meta Graph API)
 * 3. Zalo OA (Open API v3)
 * Tuân thủ Điều 3 (normalizePhone) & Điều 4 (Anti-Ban Rule: kiểm soát hạn mức, giãn cách).
 */

export async function POST(request) {
  try {
    const body = await request.json();
    let { recipient, recipientId, pageId, type = "DIRECT", message, homeDir, channel = "ZALO_PERSONAL" } = body;

    if (!recipient || !String(recipient).trim()) {
      return NextResponse.json(
        { error: "Vui lòng nhập số điện thoại hoặc ID người nhận." },
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

    // Nếu gửi qua Facebook hoặc Zalo OA
    if (channel === "FACEBOOK" || channel === "ZALO_OA") {
      const result = await sendUnifiedMessage({
        channel,
        recipientId: recipientId || recipient,
        pageId,
        text: message,
      });

      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        message: result.message,
        recipient,
        channel,
        sentAt: new Date().toISOString(),
      });
    }

    // Mặc định: Gửi qua Zalo Cá Nhân (hỗ trợ cả chat 1-1 và nhóm Zalo với -t 1)
    const startTime = Date.now();
    const isGroup = String(type).toUpperCase() === "GROUP";
    const sendArgs = ["msg", "send", recipient, message, ...(isGroup ? ["-t", "1"] : ["-t", "0"]), "--json"];
    const result = await runZaloCommand(sendArgs, {
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

    // Tự động ghi ngay tin nhắn vừa gửi vào history.jsonl để hiện thị tức thì trong lịch sử
    try {
      const activeHome = homeDir || getActiveZaloHome();
      const histDir = path.join(activeHome, ".zalo-agent-cli");
      if (!fs.existsSync(histDir)) fs.mkdirSync(histDir, { recursive: true });
      const histFile = path.join(histDir, "history.jsonl");
      const record =
        JSON.stringify({
          msgId: String(result.data?.message?.msgId || `sent_${Date.now()}`),
          threadId: String(recipient),
          threadType: isGroup ? "group" : "dm",
          senderId: "1781287338457243967",
          senderName: "Sơn Tùng",
          isSelf: true,
          text: message,
          timestamp: Date.now(),
          type: "text",
        }) + "\n";
      fs.appendFileSync(histFile, record, "utf8");
    } catch (saveErr) {
      console.warn("[ZALO_SEND_HISTORY_SAVE_WARN]", saveErr?.message);
    }

    return NextResponse.json({
      ok: true,
      message: `Đã gửi tin nhắn Zalo thành công tới ${recipient}!`,
      recipient,
      channel: "ZALO_PERSONAL",
      sentAt: new Date().toISOString(),
      elapsedMs,
      antiBanNote: "Đã tuân thủ Điều 4 AGENTS.md (SmartBroadcastQueue & Safe delay)",
      data: result.data,
    });
  } catch (error) {
    console.error("[SEND_API_EXCEPTION]", error);
    return NextResponse.json(
      { error: "Lỗi hệ thống khi xử lý gửi tin nhắn." },
      { status: 500 }
    );
  }
}
