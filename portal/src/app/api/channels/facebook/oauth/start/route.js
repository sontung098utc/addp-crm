import { NextResponse } from "next/server";

/**
 * ADDP Omnichannel AI CRM — Bắt đầu luồng Meta Official OAuth Dialog (WBS-16 & 17)
 * Mở cửa sổ cấp quyền chính thức của Facebook y hệt ảnh người dùng gửi:
 * facebook.com/dialog/oauth?client_id=...&redirect_uri=...&scope=...
 */

const DEFAULT_APP_ID = process.env.FB_APP_ID || "102938475610293"; // Placeholder nếu chưa cấu hình

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const appId = searchParams.get("appId") || DEFAULT_APP_ID;
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
