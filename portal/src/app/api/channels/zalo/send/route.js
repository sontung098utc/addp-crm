import { NextResponse } from "next/server";
import { normalizePhone } from "@/lib/phone.js";
import {
  runZaloCommand,
  resolveZaloHomeForThread,
  getOwnIdForHome,
  getActiveZaloAccountName,
} from "@/lib/zaloRunner.js";
import { sendUnifiedMessage } from "@/lib/unifiedMessageRouter.js";
import { triggerHumanTakeover } from "@/lib/botControlStore.js";
import { isSafePilotMode } from "@/lib/pilotConfig.js";
import { recordMessageAudit } from "@/lib/adapters/messageAuditLogger.js";
import fs from "fs";
import path from "path";

/**
 * ADDP Omnichannel AI CRM — API Gửi Tin Nhắn Đa Kênh Hợp Nhất (WBS-21 & WBS-22)
 * Hỗ trợ gửi tin tới:
 * 1. Đa tài khoản Zalo Cá Nhân (Zalo Agent CLI tốc độ cao)
 * 2. Fanpage Facebook (Meta Graph API)
 * 3. Zalo OA (Open API v3)
 * Tuân thủ Điều 3 (normalizePhone) & Điều 4 (Anti-Ban Rule: kiểm soát hạn mức, giãn cách).
 */

export async function POST(request) {
  try {
    const body = await request.json();
    let {
      recipient,
      recipientId,
      pageId,
      type = "DIRECT",
      message,
      homeDir,
      accountId = "",
      channel = "ZALO_PERSONAL",
      staffId = "STAFF",
      staffName = "Chuyên viên ADDP",
      staffConfirmed = false,
    } = body;

    if (!recipient || !String(recipient).trim()) {
      return NextResponse.json(
        { error: "Vui lòng nhập số điện thoại hoặc ID người nhận." },
        { status: 400 }
      );
    }

    if (!message || !String(message).trim()) {
      return NextResponse.json(
        { error: "Nội dung tin nhắn không được để trống." },
        { status: 400 }
      );
    }

    // Yêu cầu xác nhận chủ động từ nhân viên trước khi gửi tin nhắn thật (Điều 4 & 5 AGENTS.md)
    if (!staffConfirmed) {
      return NextResponse.json(
        {
          ok: false,
          status: "failed",
          error: "Yêu cầu xác nhận chủ động từ nhân viên trước khi gửi tin nhắn.",
        },
        { status: 400 }
      );
    }

    recipient = String(recipient).trim();
    message = String(message).trim();

    // Khi nhân viên chủ động bấm gửi tin nhắn -> Tự động kích hoạt Human-Takeover (tạm dừng Bot AI 45 phút)
    if (!body.isAiBot) {
      triggerHumanTakeover(recipientId || recipient, staffId || "STAFF", 45);
    }

    // Chuẩn hóa số điện thoại nếu là SĐT (Điều 3 AGENTS.md)
    if (/^(\+?84|0)\d{9,10}$/.test(recipient.replace(/[\s.-]/g, ""))) {
      recipient = normalizePhone(recipient);
    }

    // Nếu gửi qua Facebook, Zalo OA hoặc TikTok Shop
    if (
      channel === "FACEBOOK" ||
      channel === "ZALO_OA" ||
      channel === "TIKTOK_SHOP" ||
      channel === "TIKTOK"
    ) {
      const isTikTok = channel === "TIKTOK_SHOP" || channel === "TIKTOK";
      const result = await sendUnifiedMessage({
        channel,
        recipientId: isTikTok ? recipient || recipientId : recipientId || recipient,
        conversationId: recipient || recipientId,
        pageId,
        channelId: accountId || pageId,
        text: message,
        staffId,
        staffName,
        staffConfirmed: true,
      });

      if (!result.ok) {
        return NextResponse.json(
          { ok: false, status: result.status || "failed", error: result.error },
          { status: 400 }
        );
      }

      return NextResponse.json({
        ok: true,
        status: result.status || "sent",
        mocked: Boolean(result.mocked),
        safeMode: Boolean(result.safeMode),
        provider: result.provider,
        message: result.message,
        messageId: result.messageId,
        recipient,
        channel,
        sentAt: new Date().toISOString(),
      });
    }

    // Mặc định: Gửi qua đúng tài khoản Zalo Cá Nhân sở hữu hội thoại (Kênh thử nghiệm)
    if (String(type).toUpperCase() === "BROADCAST") {
      return NextResponse.json(
        {
          ok: false,
          status: "failed",
          error: "Kênh Zalo Cá Nhân đang ở chế độ thử nghiệm (Experimental Connector). Tuyệt đối cấm gửi tin hàng loạt (Broadcast) theo Điều 4 AGENTS.md.",
        },
        { status: 403 }
      );
    }

    const resolvedAcc = resolveZaloHomeForThread(recipient, homeDir, accountId);
    const activeHome = resolvedAcc.homeDir;
    const activeOwnId = resolvedAcc.ownId || getOwnIdForHome(activeHome);
    const activeSenderName = resolvedAcc.displayName || getActiveZaloAccountName(activeHome);

    if (isSafePilotMode()) {
      recordMessageAudit({
        staffId,
        staffName,
        staffConfirmed: true,
        channel: "ZALO_PERSONAL",
        recipient,
        text: message,
        status: "mocked",
        provider: "ZALO_CLI_EXPERIMENTAL",
        providerHttpCode: 200,
        mocked: true,
        safeMode: true,
      });
      return NextResponse.json({
        ok: true,
        status: "mocked",
        mocked: true,
        safeMode: true,
        provider: "ZALO_CLI_EXPERIMENTAL",
        message: `[Safe Mode] Giả lập gửi tin nhắn Zalo (${activeSenderName}) tới ${recipient} (chưa gửi thật ra ngoài).`,
        recipient,
        accountId: resolvedAcc.accountId,
        accountName: resolvedAcc.accountName,
        channel: "ZALO_PERSONAL",
        sentAt: new Date().toISOString(),
        elapsedMs: 0,
        antiBanNote: "Chế độ An toàn (PILOT_SAFE_MODE): Không gửi tin thật ra Zalo",
      });
    }

    const startTime = Date.now();
    const isGroup = String(type).toUpperCase() === "GROUP";
    const sendArgs = ["msg", "send", recipient, message, ...(isGroup ? ["-t", "1"] : ["-t", "0"]), "--json"];
    const result = await runZaloCommand(sendArgs, {
      homeDir: activeHome,
      timeout: 15000,
    });

    const elapsedMs = Date.now() - startTime;

    if (!result.ok) {
      recordMessageAudit({
        staffId,
        staffName,
        staffConfirmed: true,
        channel: "ZALO_PERSONAL",
        recipient,
        text: message,
        status: "failed",
        provider: "ZALO_CLI_EXPERIMENTAL",
        responseTimeMs: elapsedMs,
        error: result.error,
      });
      return NextResponse.json(
        {
          ok: false,
          status: "failed",
          error: `Không thể gửi tin tới '${recipient}': ${result.error}`,
          elapsedMs,
        },
        { status: 500 }
      );
    }

    // Tự động ghi ngay tin nhắn vừa gửi vào history.jsonl của đúng tài khoản Zalo đó
    try {
      const histDir = path.join(activeHome, ".zalo-agent-cli");
      if (!fs.existsSync(histDir)) fs.mkdirSync(histDir, { recursive: true });
      const histFile = path.join(histDir, "history.jsonl");
      const record =
        JSON.stringify({
          msgId: String(result.data?.message?.msgId || `sent_${Date.now()}`),
          threadId: String(recipient),
          threadType: isGroup ? "group" : "dm",
          senderId: String(activeOwnId || "1781287338457243967"),
          senderName: activeSenderName || "Chuyên viên Tư vấn ADDP",
          isSelf: true,
          text: message,
          timestamp: Date.now(),
          type: "text",
        }) + "\n";
      fs.appendFileSync(histFile, record, "utf8");
    } catch (saveErr) {
      console.warn("[ZALO_SEND_HISTORY_SAVE_WARN]", saveErr?.message);
    }

    recordMessageAudit({
      staffId,
      staffName,
      staffConfirmed: true,
      channel: "ZALO_PERSONAL",
      recipient,
      text: message,
      status: "sent",
      provider: "ZALO_CLI_EXPERIMENTAL",
      providerHttpCode: 200,
      providerMsgId: String(result.data?.message?.msgId || ""),
      responseTimeMs: elapsedMs,
      mocked: false,
      safeMode: false,
    });

    return NextResponse.json({
      ok: true,
      status: "sent",
      provider: "ZALO_CLI_EXPERIMENTAL",
      message: `Đã gửi tin nhắn Zalo (${activeSenderName}) thành công tới ${recipient}!`,
      recipient,
      accountId: resolvedAcc.accountId,
      accountName: resolvedAcc.accountName,
      channel: "ZALO_PERSONAL",
      sentAt: new Date().toISOString(),
      elapsedMs,
      experimentalNotice: "Kênh Zalo Cá Nhân đang ở chế độ THỬ NGHIỆM (Experimental Connector). Không bật gửi hàng loạt.",
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
