import { NextResponse } from "next/server";
import { createChannelAccount } from "@/lib/connectionHub.js";
import { getMetaConfig } from "@/lib/metaConfig.js";

/**
 * ADDP Omnichannel AI CRM — Callback Tiếp Nhận Facebook OAuth (WBS-16)
 * Xử lý sau khi người dùng bấm "Tiếp tục" -> "Lưu" trên cửa sổ cấp quyền Facebook:
 * 1. Đổi authorization code lấy User Access Token bằng App Secret
 * 2. Đổi lấy Long-lived User Token (~60 ngày)
 * 3. Gọi /me/accounts để lấy danh sách Trang đã chọn
 * 4. Tự động kết nối vào CRM và đóng cửa sổ popup
 */

function resolvePublicOrigin(request) {
  const fwdHost = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "")
    .split(",")[0]
    .trim();

  const isStaging = process.env.APP_ENV === "staging" || process.env.NODE_ENV !== "production";
  if (isStaging) {
    const rawProto = (request.headers.get("x-forwarded-proto") || "http").split(",")[0].trim();
    return `${rawProto}://${fwdHost || `localhost:${process.env.PORT || 3006}`}`;
  }

  if (
    fwdHost &&
    !fwdHost.includes("0.0.0.0") &&
    !fwdHost.includes("127.0.0.1") &&
    !fwdHost.includes("localhost") &&
    !fwdHost.includes(":3005")
  ) {
    const rawProto = (request.headers.get("x-forwarded-proto") || "https").split(",")[0].trim();
    const proto = rawProto === "http" || rawProto === "https" ? rawProto : "https";
    return `${proto}://${fwdHost}`;
  }
  return process.env.NEXT_PUBLIC_SITE_URL || "https://crm.addp.vn";
}

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

    const metaConfig = getMetaConfig();
    const appId = metaConfig.appId;
    const appSecret = metaConfig.appSecret;
    const reqOrigin = resolvePublicOrigin(request);
    const redirectUri = `${reqOrigin}/api/channels/facebook/oauth/callback`;

    let userAccessToken = "";
    let exchangeError = "";

    // 1. Đổi code lấy Access Token qua Meta Graph API
    if (appId && appSecret) {
      const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${encodeURIComponent(
        appId
      )}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${encodeURIComponent(
        appSecret
      )}&code=${encodeURIComponent(code)}`;

      const tokenRes = await fetch(tokenUrl);
      const tokenData = await tokenRes.json();

      if (tokenData.access_token) {
        userAccessToken = tokenData.access_token;

        // 2. Đổi sang Long-Lived User Token (~60 ngày) để lấy Page Token vĩnh viễn
        try {
          const llUrl = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(
            appId
          )}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(
            userAccessToken
          )}`;
          const llRes = await fetch(llUrl);
          const llData = await llRes.json();
          if (llData.access_token) {
            userAccessToken = llData.access_token;
          }
        } catch (llErr) {
          console.warn("[FB_LONG_LIVED_WARN]", llErr);
        }
      } else {
        exchangeError = tokenData.error?.message || "Không thể đổi mã code lấy Access Token từ Facebook.";
        console.error("[FB_OAUTH_EXCHANGE_ERR]", tokenData);
      }
    } else {
      exchangeError = "Chưa cấu hình App Secret trong hệ thống. Vui lòng nhập App Secret trong cài đặt Facebook.";
    }

    // Nếu có token thật từ Meta -> Lấy danh sách Page
    let savedPages = [];
    if (userAccessToken) {
      const accountsUrl = `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,category,access_token,picture{url}&access_token=${encodeURIComponent(
        userAccessToken
      )}`;
      const accountsRes = await fetch(accountsUrl);
      const accountsData = await accountsRes.json();

      if (Array.isArray(accountsData.data)) {
        for (const p of accountsData.data) {
          // Tự động đăng ký Webhook cho Fanpage
          try {
            await fetch(
              `https://graph.facebook.com/v19.0/${p.id}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,feed&access_token=${encodeURIComponent(
                p.access_token
              )}`,
              { method: "POST" }
            );
          } catch {}

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

    // HTML phản hồi báo kết quả cho popup và tự đóng
    const isSuccess = savedPages.length > 0 || !exchangeError;
    const html = `<!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="utf-8">
      <title>${isSuccess ? "Kết Nối Facebook Thành Công" : "Lỗi Xác Thực Meta"} | ADDP CRM</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #090d16; color: #fff; text-align: center; padding: 40px 20px; }
        .card { max-width: 440px; margin: 0 auto; background: #131d2e; border: 1px solid #1e293b; border-radius: 20px; padding: 30px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
        .icon-ok { width: 50px; height: 50px; border-radius: 50%; background: #10b981; color: white; display: flex; align-items: center; justify-content: center; font-size: 24px; margin: 0 auto 16px; }
        .icon-err { width: 50px; height: 50px; border-radius: 50%; background: #ef4444; color: white; display: flex; align-items: center; justify-content: center; font-size: 24px; margin: 0 auto 16px; }
        h2 { font-size: 18px; margin: 0 0 8px; color: #fff; }
        p { font-size: 13px; color: #94a3b8; line-height: 1.5; margin: 0 0 20px; }
        .btn { display: inline-block; background: #2563eb; color: #fff; padding: 10px 24px; border-radius: 12px; text-decoration: none; font-size: 13px; font-weight: 600; cursor: pointer; border: none; }
      </style>
    </head>
    <body>
      <div class="card">
        ${
          isSuccess
            ? `<div class="icon-ok">✓</div>
               <h2>Kết Nối Facebook Thành Công!</h2>
               <p>Đã tiếp nhận quyền từ Meta và lưu thành công <strong>${savedPages.length}</strong> Fanpage. Cửa sổ này sẽ tự đóng...</p>`
            : `<div class="icon-err">✕</div>
               <h2>Cần Bổ Sung App Secret</h2>
               <p style="color:#fca5a5;">${exchangeError}</p>
               <button class="btn" onclick="window.close()">Đóng Cửa Sổ</button>`
        }
      </div>
      <script>
        try {
          if (window.opener) {
            window.opener.postMessage({
              type: "FB_OAUTH_SUCCESS",
              savedCount: ${savedPages.length},
              code: "${code}",
              error: "${exchangeError ? exchangeError.replace(/"/g, '\\"') : ""}"
            }, "*");
          }
        } catch (e) {}
        ${isSuccess ? "setTimeout(() => window.close(), 1800);" : ""}
      </script>
    </body>
    </html>`;

    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
      status: isSuccess ? 200 : 400,
    });
  } catch (error) {
    console.error("[FB_OAUTH_CALLBACK_ERROR]", error);
    return new Response("Lỗi xử lý xác thực Facebook.", { status: 500 });
  }
}
