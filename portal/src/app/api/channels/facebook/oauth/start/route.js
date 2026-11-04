import { NextResponse } from "next/server";
import { getMetaConfig, saveMetaConfig } from "@/lib/metaConfig.js";

/**
 * ADDP Omnichannel AI CRM — Bắt đầu luồng Meta Official OAuth Dialog (WBS-16 & 17)
 * Mở cửa sổ cấp quyền chính thức của Facebook:
 * facebook.com/dialog/oauth?client_id=...&redirect_uri=...&scope=...
 */

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const passedAppId = searchParams.get("appId");
    const passedAppSecret = searchParams.get("appSecret");

    if (passedAppId || passedAppSecret) {
      saveMetaConfig({ appId: passedAppId, appSecret: passedAppSecret });
    }

    const config = getMetaConfig();
    const appId = config.appId;
    const reqOrigin = request.headers.get("origin") || request.nextUrl.origin || "http://localhost:3005";
    const redirectUri = `${reqOrigin}/api/channels/facebook/oauth/callback`;

    // Các quyền chính thức Meta yêu cầu cho CRM/CSKH
    const scopes = [
      "pages_show_list",
      "pages_messaging",
      "pages_read_engagement",
      "pages_manage_metadata",
      "pages_read_user_content",
      "pages_manage_posts",
      "business_management",
    ].join(",");

    const state = `fb_oauth_${Date.now()}`;
    const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${encodeURIComponent(
      appId
    )}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(
      scopes
    )}&response_type=code&state=${state}`;

    return NextResponse.json({
      ok: true,
      authUrl,
      appId,
      redirectUri,
    });
  } catch (error) {
    console.error("[FB_OAUTH_START_ERROR]", error);
    return NextResponse.json({ error: "Lỗi khởi tạo luồng OAuth Facebook." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { appId, appSecret, verifyToken } = body;
    const res = saveMetaConfig({ appId, appSecret, verifyToken });
    return NextResponse.json(res);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
