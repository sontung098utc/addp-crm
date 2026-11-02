/**
 * ADDP Omnichannel AI CRM — Shopee Open API v2 Connector (WBS-18)
 * Kế thừa từ C:\AH-Trabi\quan-ly-kho\shopee_functions.php
 * Ký HMAC-SHA256 chuẩn Shopee v2, tự động làm mới Refresh Token
 */

import crypto from "crypto";

export function generateShopeeSign(path, timestamp, partnerKey, partnerId, accessToken = null, shopId = null) {
  let base = `${partnerId}${path}${timestamp}`;
  if (accessToken && shopId) {
    base += `${accessToken}${shopId}`;
  }
  return crypto.createHmac("sha256", partnerKey).update(base).digest("hex");
}

export async function refreshShopeeToken(config) {
  const partnerId = Number(config.partnerId);
  const partnerKey = config.partnerKey;
  const refreshToken = config.refreshToken;
  const shopId = Number(config.shopId);
  const timestamp = Math.floor(Date.now() / 1000);
  const path = "/api/v2/auth/access_token/get";

  const sign = generateShopeeSign(path, timestamp, partnerKey, partnerId);
  const host = config.isSandbox ? "partner.test-stable.shopeemobile.com" : "partner.shopeemobile.com";
  const url = `https://${host}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}`;

  const body = {
    partner_id: partnerId,
    refresh_token: refreshToken,
    shop_id: shopId,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!data.error) {
    return {
      ok: true,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expire_in || 14400,
    };
  }
  return { ok: false, error: data.message || "Không thể làm mới Shopee Token" };
}
