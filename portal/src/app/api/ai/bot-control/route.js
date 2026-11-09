import { NextResponse } from "next/server";
import {
  isChannelBotEnabled,
  getChannelBotMode,
  setChannelBotStatus,
  getConversationBotState,
  isBotActiveForThread,
  syncBotStatesWithChannels,
  triggerHumanTakeover,
  resumeAiBot,
} from "@/lib/botControlStore.js";
import { scanAndAutoReplyZaloHistories } from "@/lib/zaloRunner.js";

/**
 * ADDP Omnichannel AI CRM — API Điều Khiển AI Bot & Human-Takeover Phân Cấp (Hierarchical Bot Control)
 * GET  /api/ai/bot-control?threadId=...&channelId=...&accountId=...
 * POST /api/ai/bot-control { threadId, channelId, accountId, action: 'pause' | 'resume' | 'set_account_mode', pauseMinutes, staffId, enabled, scope }
 */

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const threadId = searchParams.get("threadId") || "";
    const channelId = searchParams.get("channelId") || "DEFAULT";
    const accountId = searchParams.get("accountId") || "";
    const accountKey = accountId || channelId;

    // Phán xử phân cấp theo Master Rule (Cấp Tài Khoản) và Sub Rule (Cấp Hội Thoại)
    const botCheck = isBotActiveForThread(threadId, accountKey);

    return NextResponse.json({
      ok: true,
      threadId,
      channelId,
      accountId,
      accountMode: botCheck.accountMode,
      channelEnabled: botCheck.accountMode !== "HUMAN",
      effectiveMode: botCheck.mode,
      state: {
        threadId,
        mode: botCheck.mode,
        reason: botCheck.reason,
        pausedUntil: botCheck.pausedUntil,
        staffId: botCheck.staffId,
        accountMode: botCheck.accountMode,
      },
    });
  } catch (error) {
    console.error("[GET /api/ai/bot-control ERROR]", error);
    return NextResponse.json(
      { ok: false, error: "Không thể lấy trạng thái AI Bot." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      threadId = "",
      channelId = "DEFAULT",
      accountId = "",
      action = "pause",
      pauseMinutes = 45,
      staffId = "STAFF",
      enabled,
      scope = "thread", // 'thread' | 'account'
    } = body || {};

    const targetAccountKey = accountId || channelId;

    // 1. Chuyển đổi chế độ cấp độ Tài Khoản (Channel-level Master Rule)
    if (
      action === "set_account_mode" ||
      action === "toggle_channel" ||
      scope === "account" ||
      (typeof enabled === "boolean" && !threadId)
    ) {
      const willEnable =
        typeof enabled === "boolean"
          ? enabled
          : action === "resume" || enabled === "AI";
      const chStatus = setChannelBotStatus(targetAccountKey, willEnable);
      syncBotStatesWithChannels();

      if (threadId) {
        if (!willEnable) {
          triggerHumanTakeover(threadId, staffId, 1440);
        } else {
          resumeAiBot(threadId);
        }
      }

      const updatedCheck = isBotActiveForThread(threadId, targetAccountKey);
      return NextResponse.json({
        ok: true,
        channelId,
        accountId: targetAccountKey,
        accountMode: willEnable ? "AI" : "HUMAN",
        channelEnabled: willEnable,
        effectiveMode: updatedCheck.mode,
        state: updatedCheck,
      });
    }

    if (!threadId) {
      return NextResponse.json(
        { ok: false, error: "Thiếu mã hội thoại (threadId)." },
        { status: 400 }
      );
    }

    // 2. Chuyển đổi chế độ cấp độ Hội Thoại (Thread-level Sub Rule)
    let state;
    if (action === "resume") {
      // Nếu cấp Tài khoản đang bị khóa HUMAN, khi người dùng chủ động bấm Bật lại Bot AI tại Header /inbox,
      // tự động mở lại AI cho cả tài khoản Zalo sở hữu hội thoại
      const currentAccountMode = getChannelBotMode(targetAccountKey);
      if (currentAccountMode === "HUMAN") {
        setChannelBotStatus(targetAccountKey, true);
        syncBotStatesWithChannels();
        console.log(
          `[Zalo AI Bot] Người dùng bật lại AI tại Header /inbox -> Đã chuyển tài khoản ${targetAccountKey} sang Mode AI.`
        );
      }

      state = resumeAiBot(threadId);
      console.log(
        `[Zalo AI Bot] Đã bật chế độ AI Tự động 24/7 cho hội thoại ${threadId} (Mode: AI)`
      );
      scanAndAutoReplyZaloHistories().catch((err) => {
        console.error("[Zalo AI Bot] Lỗi quét tự động trả lời khi resume:", err.message);
      });
    } else {
      state = triggerHumanTakeover(threadId, staffId, pauseMinutes);
      console.log(
        `[Zalo AI Bot] Nhân viên tiếp quản hội thoại ${threadId} (Mode: HUMAN, tạm dừng ${pauseMinutes} phút)`
      );
    }

    const finalCheck = isBotActiveForThread(threadId, targetAccountKey);

    return NextResponse.json({
      ok: true,
      threadId,
      channelId,
      accountId: targetAccountKey,
      accountMode: finalCheck.accountMode,
      channelEnabled: finalCheck.accountMode !== "HUMAN",
      effectiveMode: finalCheck.mode,
      state: finalCheck,
    });
  } catch (error) {
    console.error("[POST /api/ai/bot-control ERROR]", error);
    return NextResponse.json(
      { ok: false, error: "Lỗi khi cập nhật trạng thái AI Bot." },
      { status: 500 }
    );
  }
}
