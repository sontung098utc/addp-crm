import { NextResponse } from "next/server";
import {
  listBotProfiles,
  upsertBotProfile,
  deleteBotProfile,
} from "@/lib/ai/botProfileStore";
import {
  getAccountLearnedData,
  learnFromAccountHistory,
} from "@/lib/ai/accountLearner";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profiles = listBotProfiles().map((p) => {
      const learned = getAccountLearnedData({
        accountKey: p.accountKey,
        homeDir: p.homeDir || "",
        accountName: p.accountName || "",
      });
      return {
        ...p,
        learnedStats: learned
          ? {
              totalConversations: learned.totalConversations || 0,
              totalMessages: learned.totalMessages || 0,
              staffMessagesAnalyzed: learned.staffMessagesAnalyzed || 0,
              qaCount: learned.qaCount || 0,
              styleSummary: learned.styleSummary || "",
              learnedAt: learned.learnedAt || null,
            }
          : null,
      };
    });
    return NextResponse.json({
      ok: true,
      profiles,
      total: profiles.length,
    });
  } catch (err) {
    console.error("[GET /api/ai/bot-profiles]", err);
    return NextResponse.json(
      { ok: false, error: `Không tải được danh sách Bot: ${err.message}` },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();

    if (body?.action === "LEARN_HISTORY") {
      const accountKey = String(body.accountKey || "").trim();
      const profiles = listBotProfiles();
      const matched = profiles.find((p) => p.accountKey === accountKey);
      const learned = learnFromAccountHistory({
        accountKey: accountKey || matched?.accountKey || "default",
        homeDir: body.homeDir || matched?.homeDir || "",
        accountName: body.accountName || matched?.accountName || "",
      });
      return NextResponse.json({
        ok: true,
        message: `Bot "${learned.accountName || accountKey}" đã học xong ${learned.totalConversations} hội thoại (${learned.qaCount} mẫu tư vấn thực tế)!`,
        learnedStats: {
          totalConversations: learned.totalConversations,
          totalMessages: learned.totalMessages,
          staffMessagesAnalyzed: learned.staffMessagesAnalyzed,
          qaCount: learned.qaCount,
          styleSummary: learned.styleSummary,
          learnedAt: learned.learnedAt,
        },
      });
    }

    let accountKey = String(body.accountKey || "").trim();
    if (!accountKey) {
      const channel = String(body.channel || "ZALO_PERSONAL").trim();
      const accountId = String(body.accountId || "").trim() || `manual_${Date.now()}`;
      accountKey = `${channel}:${accountId}`;
    }
    if (!String(body.accountName || "").trim() && !body.accountKey) {
      return NextResponse.json(
        { ok: false, error: "Vui lòng nhập tên tài khoản kênh cho Bot." },
        { status: 400 }
      );
    }
    const profile = upsertBotProfile({ ...body, accountKey });
    return NextResponse.json({
      ok: true,
      message: `Đã lưu cấu hình Bot cho tài khoản "${profile.accountName}" (${profile.mode}).`,
      profile,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const accountKey = searchParams.get("accountKey") || "";
    if (!accountKey) {
      return NextResponse.json({ ok: false, error: "Thiếu accountKey." }, { status: 400 });
    }
    deleteBotProfile(accountKey);
    return NextResponse.json({ ok: true, message: "Đã xóa cấu hình Bot." });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
