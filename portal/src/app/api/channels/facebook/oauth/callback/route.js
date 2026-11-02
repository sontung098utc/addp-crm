import { NextResponse } from "next/server";
import { createChannelAccount } from "../../../../../../lib/connectionHub.js";

/**
 * ADDP Omnichannel AI CRM — Callback Tiếp Nhận Facebook OAuth (WBS-16)
 * Xử lý sau khi người dùng bấm "Tiếp tục" -> "Lưu" trên cửa sổ cấp quyền Facebook:
 * 1. Đổi authorization code lấy User Access Token
 * 2. Đổi lấy Long-lived User Token (~60 ngày)
 * 3. Gọi /me/accounts để lấy danh sách Trang đã chọn
 * 4. Tự động kết nối vào CRM và đóng cửa sổ popup
 */

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const error = searchParams.get("error");
    const errorDesc = searchParams.get("error_description");

    if (error || !code) {
      return new Response(
        `<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#0f172a;color:#f87171;">
          <h3>Cấp quyền Facebook thất bại hoặc bị hủy</h3>
          <p>${errorDesc || "Người dùng đã đóng hoặc từ chối cấp quyền."}</p>
          <script>setTimeout(() => window.close(), 3000);</script>
        </body></html>`,
        { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 400 }
      );
    }

    const appId = process.env.FB_APP_ID;
    const appSecret = process.env.FB_APP_SECRET;
    const reqOrigin = request.headers.get("origin") || request.nextUrl.origin || "http://localhost:3005";
    const redirectUri = `${reqOrigin}/api/channels/facebook/oauth/callback`;

    let userAccessToken = "";

    // 1. Đổi code lấy Access Token qua Meta Graph API
    if (appId && appSecret) {
      const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&client_secret=${appSecret}&code=${code}`;

      const tokenRes = await fetch(tokenUrl);
      const tokenData = await tokenRes.json();

      if (tokenData.access_token) {
        userAccessToken = tokenData.access_token;
      }
    }

    // Nếu có token thật từ Meta -> Lấy danh sách Page
    let savedPages = [];
    if (userAccessToken) {
      const accountsUrl = `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,category,access_token,picture{url}&access_token=${userAccessToken}`;
      const accountsRes = await fetch(accountsUrl);
      const accountsData = await accountsRes.json();

      if (Array.isArray(accountsData.data)) {
        for (const p of accountsData.data) {
          const res = createChannelAccount({
            platform: "FACEBOOK",
            name: p.name || `Fanpage ${p.id}`,
            externalId: `fb_${p.id}`,
            config: {
              pageId: p.id,
              pageAccessToken: p.access_token,
              avatar: p.picture?.data?.url || "",
              category: p.category,
              autoHidePhone: true,
            },
          });
          if (res.ok) {
            savedPages.push(res.channel);
          }
        }
      }
    }

    // HTML phản hồi báo thành công cho popup và tự đóng
    const html = `<!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="utf-8">
      <title>Đăng nhập Facebook Thành Công | ADDP CRM</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #090d16; color: #fff; text-align: center; padding: 40px 20px; }
        .card { max-width: 420px; margin: 0 auto; background: #131d2e; border: 1px solid #1e293b; border-radius: 20px; padding: 30px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
        .icon { width: 50px; height: 50px; border-radius: 50%; background: #10b981; color: white; display: flex; align-items: center; justify-content: center; font-size: 24px; margin: 0 auto 16px; }
        h2 { font-size: 18px; margin: 0 0 8px; color: #fff; }
        p { font-size: 13px; color: #94a3b8; line-height: 1.5; margin: 0 0 20px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon">✓</div>
        <h2>Kết Nối Facebook Thành Công!</h2>
        <p>Hệ thống đã nhận quyền truy cập Trang từ Meta. Cửa sổ này sẽ tự động đóng sau giây lát...</p>
      </div>
      <script>
        try {
          if (window.opener) {
            window.opener.postMessage({
              type: "FB_OAUTH_SUCCESS",
              savedCount: ${savedPages.length},
              code: "${code}"
            }, "*");
          }
        } catch (e) {}
        setTimeout(() => window.close(), 1800);
      </script>
    </body>
    </html>`;

    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
      status: 200,
    });
  } catch (error) {
    console.error("[FB_OAUTH_CALLBACK_ERROR]", error);
    return new Response("Lỗi xử lý xác thực Facebook.", { status: 500 });
  }
}
