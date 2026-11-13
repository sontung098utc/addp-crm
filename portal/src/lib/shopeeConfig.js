import crypto from "crypto";
import fs from "fs";
import path from "path";

const CONFIG_PATH = path.join(process.cwd(), "config", "shopee_app.json");

export function getShopeeConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const raw = fs.readFileSync(CONFIG_PATH, "utf8");
      return JSON.parse(raw);
    } catch {}
  }
  return {
    partnerId: process.env.SHOPEE_PARTNER_ID || "",
    partnerKey: process.env.SHOPEE_PARTNER_KEY || "",
    isSandbox: process.env.SHOPEE_IS_SANDBOX === "true",
    updatedAt: new Date().toISOString(),
  };
}

export function saveShopeeConfig(cfg) {
  try {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");
    return true;
  } catch (err) {
    console.error("[SAVE_SHOPEE_CONFIG_ERR]", err);
    return false;
  }
}

export function generateShopeeSign(apiPath, timestamp, partnerKey, partnerId, accessToken = null, shopId = null) {
  let base = `${partnerId}${apiPath}${timestamp}`;
  if (accessToken && shopId) {
    base += `${accessToken}${shopId}`;
  }
  return crypto.createHmac("sha256", String(partnerKey).trim()).update(base).digest("hex");
}

export function generateShopeeAuthUrl({ partnerId, partnerKey, redirectUrl, isSandbox = false }) {
  const pId = Number(partnerId);
  const pKey = String(partnerKey).trim();
  const timestamp = Math.floor(Date.now() / 1000);
  const apiPath = "/api/v2/shop/auth_partner";
  const sign = generateShopeeSign(apiPath, timestamp, pKey, pId);

  const host = isSandbox
    ? "partner.test-stable.shopeemobile.com"
    : "partner.shopeemobile.com";

  const qs = new URLSearchParams({
    partner_id: String(pId),
    timestamp: String(timestamp),
    sign,
    redirect: redirectUrl,
  });

  return `https://${host}${apiPath}?${qs.toString()}`;
}

export async function exchangeShopeeCodeForToken({ code, shopId, partnerId, partnerKey, isSandbox = false }) {
  const pId = Number(partnerId);
  const pKey = String(partnerKey).trim();
  const sId = Number(shopId);
  const timestamp = Math.floor(Date.now() / 1000);
  const apiPath = "/api/v2/auth/token/get";
  const sign = generateShopeeSign(apiPath, timestamp, pKey, pId);

  const host = isSandbox
    ? "partner.test-stable.shopeemobile.com"
    : "partner.shopeemobile.com";

  const url = `https://${host}${apiPath}?partner_id=${pId}&timestamp=${timestamp}&sign=${sign}`;

  const body = {
    code: String(code).trim(),
    partner_id: pId,
    shop_id: sId,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });

  const json = await res.json().catch(() => null);

  if (json && !json.error) {
    const resp = json.response || json.data || json;
    return {
      ok: true,
      accessToken: resp.access_token,
      refreshToken: resp.refresh_token,
      expiresIn: resp.expire_in || 14400,
      shopId: sId,
    };
  }

  return {
    ok: false,
    error: json?.message || json?.error || "Không thể lấy token Shopee từ mã code.",
    raw: json,
  };
}
