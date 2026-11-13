import crypto from "crypto";
import fs from "fs";
import path from "path";

/**
 * ADDP Omnichannel AI CRM — TikTok Shop Official Partner Configuration (WBS-18 & 20)
 * Hỗ trợ OAuth 1-Click Multi-Shop, Token Exchange, Refresh Token & Authorized Shops Lookup.
 * Lưu trữ cấu hình App Key / App Secret trong config/tiktok_app.json và đồng bộ biến môi trường.
 */

const CONFIG_PATH = path.join(process.cwd(), "config", "tiktok_app.json");

/**
 * Đọc cấu hình TikTok Shop từ file config/tiktok_app.json (ưu tiên) hoặc biến môi trường
 */
export function getTikTokConfig() {
  let fileConfig = {};
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) || {};
    }
  } catch (err) {
    console.error("[TIKTOK_CONFIG_READ_ERR]", err);
  }

  const serviceId =
    fileConfig.serviceId ||
    process.env.TIKTOK_SERVICE_ID ||
    "7706525357121636097";
  const appKey = fileConfig.appKey || process.env.TIKTOK_APP_KEY || "";
  const appSecret = fileConfig.appSecret || process.env.TIKTOK_APP_SECRET || "";
  const defaultShopId = fileConfig.defaultShopId || process.env.TIKTOK_SHOP_ID || "";
  const defaultShopCipher =
    fileConfig.defaultShopCipher ||
    process.env.TIKTOK_SHOP_CIPHER ||
    "ROW_ZYiTiAAAAAAKQIKT19iz-hy3D_kGFVJk";
  const region = fileConfig.region || process.env.TIKTOK_REGION || "VN";

  return {
    serviceId: String(serviceId).trim(),
    appKey: String(appKey).trim(),
    appSecret: String(appSecret).trim(),
    defaultShopId: String(defaultShopId).trim(),
    defaultShopCipher: String(defaultShopCipher).trim(),
    region: String(region).trim(),
    isConfigured: Boolean(String(appKey).trim() && String(appSecret).trim()),
  };
}

/**
 * Lưu cấu hình TikTok Shop vào file config/tiktok_app.json
 */
export function saveTikTokConfig({
  serviceId,
  appKey,
  appSecret,
  defaultShopId,
  defaultShopCipher,
  region,
}) {
  try {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const current = getTikTokConfig();
    const updated = {
      serviceId: serviceId !== undefined ? String(serviceId).trim() : current.serviceId,
      appKey: appKey !== undefined ? String(appKey).trim() : current.appKey,
      appSecret: appSecret !== undefined ? String(appSecret).trim() : current.appSecret,
      defaultShopId:
        defaultShopId !== undefined ? String(defaultShopId).trim() : current.defaultShopId,
      defaultShopCipher:
        defaultShopCipher !== undefined
          ? String(defaultShopCipher).trim()
          : current.defaultShopCipher,
      region: region !== undefined ? String(region).trim() : current.region,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), "utf8");
    return { ok: true, config: updated };
  } catch (err) {
    console.error("[TIKTOK_CONFIG_SAVE_ERR]", err);
    return { ok: false, error: err?.message || "Không thể lưu file config/tiktok_app.json" };
  }
}

export const TIKTOK_SERVICE_ID = process.env.TIKTOK_SERVICE_ID || "7706525357121636097";
export const TIKTOK_APP_KEY = process.env.TIKTOK_APP_KEY || "";
export const TIKTOK_APP_SECRET = process.env.TIKTOK_APP_SECRET || "";
export const TIKTOK_DEFAULT_SHOP_ID = process.env.TIKTOK_SHOP_ID || "";
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

/**
 * Khởi tạo đường dẫn cấp quyền TikTok Shop OAuth chuẩn TikTok Shop Partner / Seller API
 */
export function buildTikTokAuthUrl({ serviceId, appKey, redirectUri, state } = {}) {
  const cfg = getTikTokConfig();
  const effectiveServiceId = (serviceId || cfg.serviceId || TIKTOK_SERVICE_ID || "").trim();
  const effectiveAppKey = (appKey || cfg.appKey || TIKTOK_APP_KEY || "").trim();
  const effectiveState = state || `tiktok_oauth_${Date.now()}`;

  // Chuẩn 1 (Ưu tiên): Cấp quyền Seller qua TikTok Partner Service ID
  if (effectiveServiceId) {
    const qs = new URLSearchParams({
      service_id: effectiveServiceId,
    });
    if (effectiveState) qs.set("state", effectiveState);
    return `https://services.tiktokshop.com/open/authorize?${qs.toString()}`;
  }

  // Chuẩn 2 (Tùy chọn): Cấp quyền trực tiếp qua app_key + redirect_uri
  if (effectiveAppKey) {
    const qs = new URLSearchParams({
      app_key: effectiveAppKey,
      redirect_uri: redirectUri || "https://crm.addp.vn/channels",
      state: effectiveState,
    });
    return `https://services.tiktokshop.com/open/authorize?${qs.toString()}`;
  }

  return "https://services.tiktokshop.com/open/authorize?service_id=7706525357121636097";
}

export const TIKTOK_AUTH_URL = buildTikTokAuthUrl();

/**
 * Tạo chữ ký HMAC-SHA256 chuẩn TikTok Shop Open API v2
 * Base = app_secret + path + sorted(params without sign/access_token) + bodyStr + app_secret
 */
export function generateTikTokSignV2(reqPath, params = {}, appSecret = null, body = "") {
  const cfg = getTikTokConfig();
  const effectiveSecret = (appSecret || cfg.appSecret || TIKTOK_APP_SECRET || "").trim();
  if (!effectiveSecret) {
    throw new Error(
      "[SECURITY_CONFIG_ERROR] TIKTOK_APP_SECRET chưa được cấu hình (trong config/tiktok_app.json hoặc .env). Chặn ký request (Fail closed)."
    );
  }
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
  const base = `${effectiveSecret}${reqPath}${paramPart}${bodyStr}${effectiveSecret}`;
  return crypto.createHmac("sha256", effectiveSecret).update(base).digest("hex");
}

/**
 * Đổi authorization code (auth_code) lấy access_token, refresh_token, open_id, seller_name
 */
export async function exchangeTikTokAuthCode(authCode, options = {}) {
  const cfg = getTikTokConfig();
  const appKey = (options.appKey || cfg.appKey || TIKTOK_APP_KEY || "").trim();
  const appSecret = (options.appSecret || cfg.appSecret || TIKTOK_APP_SECRET || "").trim();

  const cleanAuthCode = String(authCode || "").trim();
  if (!cleanAuthCode) {
    return {
      ok: false,
      error: "Thiếu mã ủy quyền (code) từ TikTok Shop. Vui lòng bấm ủy quyền lại.",
      code: "MISSING_CODE",
    };
  }

  // Chặn gửi lên TikTok nếu thiếu App Key / App Secret để tránh lỗi mập mờ "invalid params"
  if (!appKey || !appSecret) {
    return {
      ok: false,
      error:
        "Chưa cấu hình TikTok App Key hoặc App Secret. Vui lòng nhập App Key và App Secret trong phần [Cấu Hình TikTok Partner] trước khi thực hiện ủy quyền.",
      code: "MISSING_CREDENTIALS",
      needsConfig: true,
    };
  }

  // TikTok /api/v2/token/get hỗ trợ POST JSON hoặc GET query params theo chuẩn Partner API v2
  let tokenData = null;
  let lastError = "";

  try {
    const postRes = await fetch("https://auth.tiktok-shops.com/api/v2/token/get", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_key: appKey,
        app_secret: appSecret,
        auth_code: cleanAuthCode,
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

  // Fallback GET query params (theo đặc tả Partner API v2 GET /api/v2/token/get) nếu POST chưa thành công
  if (
    !tokenData ||
    (tokenData.code !== 0 &&
      /method|get|invalid request|not found/i.test(String(tokenData.message || lastError)))
  ) {
    try {
      const qs = new URLSearchParams({
        app_key: appKey,
        app_secret: appSecret,
        auth_code: cleanAuthCode,
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
    let friendlyError = tokenData?.message || lastError || "token_exchange_failed";
    // Giải thích rõ ràng lỗi 'invalid params' từ TikTok
    if (
      friendlyError === "invalid params" ||
      friendlyError.toLowerCase().includes("invalid params")
    ) {
      friendlyError =
        "Lỗi xác thực TikTok Shop ('invalid params'): App Key hoặc App Secret không khớp với ứng dụng trong TikTok Shop Partner Center, hoặc mã ủy quyền (code) đã hết hạn (chỉ có hiệu lực 5 phút) / đã được sử dụng. Vui lòng kiểm tra lại App Key & App Secret rồi bấm ủy quyền lại.";
    }

    return {
      ok: false,
      error: friendlyError,
      rawCode: tokenData?.code,
      raw: tokenData,
      needsConfig:
        tokenData?.code === 105001 ||
        friendlyError.toLowerCase().includes("app_key") ||
        friendlyError.toLowerCase().includes("invalid params"),
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
  appKey = null,
  appSecret = null,
}) {
  const cfg = getTikTokConfig();
  const effectiveAppKey = (appKey || cfg.appKey || TIKTOK_APP_KEY || "").trim();
  const effectiveAppSecret = (appSecret || cfg.appSecret || TIKTOK_APP_SECRET || "").trim();

  if (!accessToken) {
    return { ok: false, code: -1, message: "Thiếu accessToken TikTok Shop.", shops: [] };
  }
  if (!effectiveAppKey || !effectiveAppSecret) {
    return {
      ok: false,
      code: -1,
      message: "Thiếu App Key hoặc App Secret để ký request lấy danh sách gian hàng.",
      shops: [],
    };
  }

  try {
    const reqPath = "/authorization/202309/shops";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const queryParams = {
      app_key: effectiveAppKey,
      timestamp,
    };
    const sign = generateTikTokSignV2(reqPath, queryParams, effectiveAppSecret);
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
  appKey = null,
  appSecret = null,
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
  appKey = null,
  appSecret = null,
}) {
  const cfg = getTikTokConfig();
  const effectiveAppKey = (appKey || cfg.appKey || TIKTOK_APP_KEY || "").trim();
  const effectiveAppSecret = (appSecret || cfg.appSecret || TIKTOK_APP_SECRET || "").trim();

  if (!refreshToken) {
    return { ok: false, error: "Kênh chưa có Refresh Token để làm mới." };
  }
  if (!effectiveAppKey || !effectiveAppSecret) {
    return { ok: false, error: "Chưa cấu hình App Key / App Secret để làm mới Token." };
  }

  const qs = new URLSearchParams({
    app_key: effectiveAppKey,
    app_secret: effectiveAppSecret,
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
