/**
 * ADDP Omnichannel AI CRM — TikTok Shop Connector (WBS-18)
 * Kế thừa từ C:\AH-Trabi\quan-ly-kho\tiktok_functions.php & C:\AdsTiktok
 * Xử lý OAuth2, Refresh Token, đồng bộ đơn hàng & tách công thức Combo
 */

import crypto from "crypto";

export async function refreshTikTokToken(config) {
  const params = new URLSearchParams({
    app_key: config.appKey,
    app_secret: config.appSecret,
    refresh_token: config.refreshToken,
    grant_type: "refresh_token",
  });

  const url = `https://auth.tiktok-shops.com/api/v2/token/refresh?${params.toString()}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.code === 0 && data.data) {
    return {
      ok: true,
      accessToken: data.data.access_token,
      refreshToken: data.data.refresh_token,
      expiresIn: data.data.access_token_expire_in,
    };
  }
  return { ok: false, error: data.message || "Không thể làm mới TikTok Token" };
}

export function generateTikTokSign(path, params, appSecret, body = "") {
  // Sort parameters alphabetically
  const keys = Object.keys(params).sort();
  let base = path;
  for (const k of keys) {
    base += `${k}${params[k]}`;
  }
  base += body;
  return crypto.createHmac("sha256", appSecret).update(base).digest("hex");
}
