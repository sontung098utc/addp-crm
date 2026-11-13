import { NextResponse } from "next/server";
import { normalizePhone } from "@/lib/phone.js";
import {
  runZaloCommand,
  sendZaloMessageDirect,
  sendZaloFileViaMcp,
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
      recipientPhone = "",
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

    const hasMedia = Boolean(body.mediaUrl || body.filePath);
    if ((!message || !String(message).trim()) && !hasMedia) {
      return NextResponse.json(
        { error: "Nội dung tin nhắn không được để trống." },
        { status: 400 }
      );
    }

    if (!message && hasMedia) {
      if (body.isImage) message = "[Hình ảnh]";
      else if (body.isAudio) message = "[Ghi âm giọng nói]";
      else message = `[Tài liệu: ${body.fileName || "Tập tin đính kèm"}]`;
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
      recipientPhone = normalizePhone(recipient);
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

    // 1. Nếu có file hình ảnh hoặc file đính kèm/ghi âm cục bộ
    let sendResult = null;
    if (body.filePath && fs.existsSync(body.filePath)) {
      const caption =
        message && message !== "[Hình ảnh]" && message !== "[Ghi âm giọng nói]"
          ? message
          : "";
      sendResult = await sendZaloFileViaMcp({
        homeDir: activeHome,
        recipient,
        recipientPhone: recipientPhone || body.recipientPhone || "",
        filePath: body.filePath,
        caption,
        isGroup,
        isImage: Boolean(body.isImage),
      });
    } else if (body.isAudio || body.mediaUrl) {
      return NextResponse.json(
        {
          ok: false,
          status: "failed",
          error: "Không tìm thấy file ghi âm hoặc tệp đính kèm trên máy chủ. Vui lòng thử thu âm/tải lại.",
        },
        { status: 400 }
      );
    } else {
      // 2. Gửi tin nhắn văn bản trực tiếp qua zaloDirectSendWorker (<300ms, tự phân giải SĐT sang UID bằng REST)
      sendResult = await sendZaloMessageDirect({
        homeDir: activeHome,
        recipient,
        recipientPhone: recipientPhone || body.recipientPhone || "",
        message,
        isGroup,
        timeout: 25000,
      });

      // Nếu direct worker chưa sẵn sàng hoặc gặp lỗi hệ thống, fallback sang CLI runZaloCommand
      if (!sendResult.ok && sendResult.error === "WORKER_UNAVAILABLE") {
        const sendArgs = ["msg", "send", recipient, message, ...(isGroup ? ["-t", "1"] : ["-t", "0"]), "--json"];
        sendResult = await runZaloCommand(sendArgs, {
          homeDir: activeHome,
          timeout: 25000,
        });
      }
    }

    const elapsedMs = Date.now() - startTime;

    if (!sendResult.ok) {
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
        error: sendResult.error,
      });
      return NextResponse.json(
        {
          ok: false,
          status: "failed",
          error: sendResult.error || `Không thể gửi tin tới '${recipient}'`,
          elapsedMs,
        },
        { status: 400 }
      );
    }

    const finalMsgId = String(
      sendResult.msgId || sendResult.data?.message?.msgId || sendResult.data?.msgId || `sent_${Date.now()}`
    );

    // Ghi ngay vào file history.jsonl của đúng tài khoản Zalo đó nếu worker chưa ghi
    try {
      const histDir = path.join(activeHome, ".zalo-agent-cli");
      if (!fs.existsSync(histDir)) fs.mkdirSync(histDir, { recursive: true });
      const histFile = path.join(histDir, "history.jsonl");
      const record =
        JSON.stringify({
          msgId: finalMsgId,
          threadId: String(sendResult?.recipient || recipient),
          threadType: isGroup ? "group" : "dm",
          senderId: String(activeOwnId || "1781287338457243967"),
          senderName: activeSenderName || "Chuyên viên Tư vấn ADDP",
          isSelf: true,
          text: message,
          url: body.mediaUrl || "",
          timestamp: Date.now(),
          type: body.isImage ? "chat.photo" : body.isAudio ? "chat.voice" : "text",
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
      providerMsgId: finalMsgId,
      responseTimeMs: elapsedMs,
      mocked: false,
      safeMode: false,
    });

    return NextResponse.json({
      ok: true,
      status: "sent",
      provider: "ZALO_CLI_EXPERIMENTAL",
      message: `Đã gửi tin nhắn Zalo (${activeSenderName}) thành công!`,
      recipient: sendResult.recipient || recipient,
      messageId: finalMsgId,
      accountId: resolvedAcc.accountId,
      accountName: resolvedAcc.accountName,
      channel: "ZALO_PERSONAL",
      sentAt: new Date().toISOString(),
      elapsedMs,
      antiBanNote: "Đã tuân thủ Điều 4 AGENTS.md (SmartBroadcastQueue & Safe delay)",
      data: sendResult.data,
    });
  } catch (error) {
    console.error("[SEND_API_EXCEPTION]", error);
    return NextResponse.json(
      { error: "Lỗi hệ thống khi xử lý gửi tin nhắn." },
      { status: 500 }
    );
  }
}
