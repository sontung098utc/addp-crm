import { NextResponse } from "next/server";
import {
  listBotProfiles,
  upsertBotProfile,
  deleteBotProfile,
} from "@/lib/ai/botProfileStore";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profiles = listBotProfiles();
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
