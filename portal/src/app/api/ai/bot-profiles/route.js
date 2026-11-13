import { NextResponse } from "next/server";
import { listBotProfiles, upsertBotProfile } from "@/lib/ai/botProfileStore";

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
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const profile = upsertBotProfile(body);
    return NextResponse.json({
      ok: true,
      message: `Đã lưu cấu hình Bot cho tài khoản "${profile.accountName}" (${profile.mode}).`,
      profile,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
  }
}
