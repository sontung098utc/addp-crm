import crypto from "crypto";

/**
 * ADDP Omnichannel AI CRM — TikTok Shop Official Partner Configuration
 * Hỗ trợ OAuth 1-Click Multi-Shop, Token Exchange, Refresh Token & Authorized Shops Lookup.
 */

export const TIKTOK_SERVICE_ID =
  process.env.TIKTOK_SERVICE_ID || "7706525357121636097";
export const TIKTOK_APP_KEY =
  process.env.TIKTOK_APP_KEY || "6ls9j0lb830he";
export const TIKTOK_APP_SECRET =
  process.env.TIKTOK_APP_SECRET || "b32f208f743dda776a98432d9c8ac714372fda61";
export const TIKTOK_DEFAULT_SHOP_ID =
  process.env.TIKTOK_SHOP_ID || "7495657895504611503";
export const TIKTOK_DEFAULT_SHOP_CIPHER =
  process.env.TIKTOK_SHOP_CIPHER || "ROW_ZYiTiAAAAAAKQIKT19iz-hy3D_kGFVJk";

export const OLD_OCR_TIKTOK_CIPHER = "ROW_ZYlTfAAAAAAKQlKl19lz-hy5D_kGf-VJK";

export function isUsableTikTokCipher(value) {
  const v = String(value || "").trim();
  if (
    !v ||
    v === "tts_pending" ||
    v === "null" ||
    v === "undefined" ||
    v === OLD_OCR_TIKTOK_CIPHER
  ) {
    return false;
  }
  // Cipher hợp lệ của TikTok Shop có tiền tố ROW_ hoặc là chuỗi mã hóa ký tự đặc biệt
  return v.length >= 6 && !/^\d+$/.test(v);
}

export function isLikelyTikTokCipher(value) {
  const v = String(value || "").trim();
  if (!isUsableTikTokCipher(v)) return false;
  return v.startsWith("ROW_");
}

/**
 * Trích xuất shop_cipher thật từ bản ghi kênh TikTok Shop trong channels.json,
 * ưu tiên các trường đã cấu hình và fallback về TIKTOK_DEFAULT_SHOP_CIPHER.
 */
export function extractRealTikTokCipherFromChannel(channel) {
  if (!channel || typeof channel !== "object") return TIKTOK_DEFAULT_SHOP_CIPHER;
  const explicitCandidates = [
    channel.shopCipher,
    channel.shop_cipher,
    channel.cipher,
    channel.config?.shopCipher,
    channel.config?.shop_cipher,
    channel.config?.cipher,
  ];
  for (const cand of explicitCandidates) {
    const v = String(cand || "").trim();
    if (isUsableTikTokCipher(v) && v.startsWith("ROW_") && !v.startsWith("tiktok_shop_")) {
      return v;
    }
  }

  const rawId = String(channel.id || "").trim();
  const strippedId = rawId.startsWith("tiktok_shop_")
    ? rawId.slice("tiktok_shop_".length)
    : rawId;
  const idCandidates = [
    channel.externalId,
    channel.accountId,
    channel.config?.externalId,
    channel.config?.accountId,
    rawId,
    strippedId,
  ];
  for (const cand of idCandidates) {
    const v = String(cand || "").trim();
    if (isLikelyTikTokCipher(v)) {
      return v;
    }
  }
  return TIKTOK_DEFAULT_SHOP_CIPHER;
}

export const TIKTOK_AUTH_URL = `https://services.tiktokshop.com/open/authorize?service_id=${TIKTOK_SERVICE_ID}`;

/**
 * Tạo chữ ký HMAC-SHA256 chuẩn TikTok Shop Open API v2
 * Base = app_secret + path + sorted(params without sign/access_token) + bodyStr + app_secret
 */
export function generateTikTokSignV2(reqPath, params = {}, appSecret = TIKTOK_APP_SECRET, body = "") {
  const cleanParams = { ...params };
  delete cleanParams.sign;
  delete cleanParams.access_token;

  const keys = Object.keys(cleanParams).sort();
  let paramPart = "";
  for (const k of keys) {
    if (cleanParams[k] !== undefined && cleanParams[k] !== null) {
      paramPart += `${k}${cleanParams[k]}`;
    }
  }
  const bodyStr = body ? (typeof body === "string" ? body : JSON.stringify(body)) : "";
  const base = `${appSecret}${reqPath}${paramPart}${bodyStr}${appSecret}`;
  return crypto.createHmac("sha256", appSecret).update(base).digest("hex");
}

/**
 * Đổi authorization code (auth_code) lấy access_token, refresh_token, open_id, seller_name
 */
export async function exchangeTikTokAuthCode(authCode, options = {}) {
  const appKey = options.appKey || TIKTOK_APP_KEY;
  const appSecret = options.appSecret || TIKTOK_APP_SECRET;

  // TikTok /api/v2/token/get hỗ trợ POST JSON hoặc GET query params tùy gateway khu vực
  let tokenData = null;
  let lastError = "";

  try {
    const postRes = await fetch("https://auth.tiktok-shops.com/api/v2/token/get", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_key: appKey,
        app_secret: appSecret,
        auth_code: authCode,
        grant_type: "authorized_code",
      }),
    });
    const rawText = await postRes.text();
    try {
      tokenData = JSON.parse(rawText);
    } catch {
      lastError = `HTTP ${postRes.status}: ${rawText.slice(0, 160)}`;
    }
  } catch (err) {
    lastError = err?.message || "POST token exchange failed";
  }

  // Fallback GET query params (theo đặc tả Partner API v2 GET /api/v2/token/get) nếu POST không trả code === 0
  if (!tokenData || (tokenData.code !== 0 && /method|get|invalid request/i.test(String(tokenData.message || lastError)))) {
    try {
      const qs = new URLSearchParams({
        app_key: appKey,
        app_secret: appSecret,
        auth_code: authCode,
        grant_type: "authorized_code",
      });
      const getRes = await fetch(`https://auth.tiktok-shops.com/api/v2/token/get?${qs.toString()}`);
      const getJson = await getRes.json();
      if (getJson && (getJson.code === 0 || !tokenData)) {
        tokenData = getJson;
      }
    } catch (err) {
      if (!lastError) lastError = err?.message || "GET token exchange failed";
    }
  }

  if (!tokenData || tokenData.code !== 0 || !tokenData.data) {
    return {
      ok: false,
      error: tokenData?.message || lastError || "token_exchange_failed",
      raw: tokenData,
    };
  }

  return {
    ok: true,
    data: tokenData.data,
  };
}

/**
 * Lấy danh sách gian hàng đã ủy quyền (Authorized Shops) kèm thông tin lỗi chi tiết (nếu có)
 */
export async function fetchTikTokAuthorizedShopsDetailed({
  accessToken,
  appKey = TIKTOK_APP_KEY,
  appSecret = TIKTOK_APP_SECRET,
}) {
  if (!accessToken) {
    return { ok: false, code: -1, message: "Thiếu accessToken TikTok Shop.", shops: [] };
  }
  try {
    const reqPath = "/authorization/202309/shops";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const queryParams = {
      app_key: appKey,
      timestamp,
    };
    const sign = generateTikTokSignV2(reqPath, queryParams, appSecret);
    const qs = new URLSearchParams({
      ...queryParams,
      sign,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let res;
    let data = null;
    try {
      res = await fetch(`https://open-api.tiktokglobalshop.com${reqPath}?${qs.toString()}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-tts-access-token": accessToken,
        },
        signal: controller.signal,
      });
      data = await res.json().catch(() => null);
    } finally {
      clearTimeout(timer);
    }

    if (data?.code === 0 && Array.isArray(data?.data?.shops)) {
      const normalizedShops = data.data.shops.map((s) => ({
        ...s,
        id: s.id || s.shop_id || "",
        name: s.name || s.shop_name || "",
        cipher: s.cipher || s.shop_cipher || "",
      }));
      return { ok: true, code: 0, message: "success", shops: normalizedShops };
    }

    return {
      ok: false,
      httpStatus: res?.status || 0,
      code: data?.code ?? -1,
      message: data?.message || `HTTP ${res?.status || 0}`,
      shops: [],
    };
  } catch (err) {
    console.warn("[TIKTOK_AUTHORIZED_SHOPS_WARN]", err?.message || err);
    return {
      ok: false,
      code: -1,
      message: err?.message || "Lỗi kết nối API /authorization/202309/shops",
      shops: [],
    };
  }
}

/**
 * Lấy danh sách gian hàng đã ủy quyền (Authorized Shops) bằng access_token thật
 */
export async function fetchTikTokAuthorizedShops({
  accessToken,
  appKey = TIKTOK_APP_KEY,
  appSecret = TIKTOK_APP_SECRET,
}) {
  const res = await fetchTikTokAuthorizedShopsDetailed({
    accessToken,
    appKey,
    appSecret,
  });
  return res.shops || [];
}

/**
 * Làm mới Access Token bằng Refresh Token
 */
export async function refreshTikTokOAuthToken({
  refreshToken,
  appKey = TIKTOK_APP_KEY,
  appSecret = TIKTOK_APP_SECRET,
}) {
  if (!refreshToken) {
    return { ok: false, error: "Kênh chưa có Refresh Token để làm mới." };
  }

  const qs = new URLSearchParams({
    app_key: appKey,
    app_secret: appSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch(`https://auth.tiktok-shops.com/api/v2/token/refresh?${qs.toString()}`);
  const data = await res.json();

  if (data?.code === 0 && data?.data) {
    const expireInSec = Number(data.data.access_token_expire_in || 0);
    const tokenExpiresAt =
      expireInSec > 1e11
        ? expireInSec
        : expireInSec > 1e9
        ? expireInSec * 1000
        : Date.now() + Math.max(expireInSec, 3600) * 1000;

    return {
      ok: true,
      accessToken: data.data.access_token,
      refreshToken: data.data.refresh_token || refreshToken,
      tokenExpiresAt,
      refreshTokenExpireIn: data.data.refresh_token_expire_in || null,
      openId: data.data.open_id || "",
      sellerName: data.data.seller_name || "",
    };
  }

  return {
    ok: false,
    error: data?.message || "Không thể làm mới TikTok Shop Token.",
  };
}
