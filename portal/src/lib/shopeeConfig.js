import crypto from "crypto";
import fs from "fs";
import path from "path";
import { listAllChannels, updateChannelAccount } from "./connectionHub.js";

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

export async function refreshShopeeToken({ refreshToken, shopId, partnerId, partnerKey, isSandbox = false }) {
  const pId = Number(partnerId);
  const pKey = String(partnerKey).trim();
  const sId = Number(shopId);
  const timestamp = Math.floor(Date.now() / 1000);
  const apiPath = "/api/v2/auth/access_token/get";
  const sign = generateShopeeSign(apiPath, timestamp, pKey, pId);

  const host = isSandbox
    ? "partner.test-stable.shopeemobile.com"
    : "partner.shopeemobile.com";

  const url = `https://${host}${apiPath}?partner_id=${pId}&timestamp=${timestamp}&sign=${sign}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      refresh_token: String(refreshToken).trim(),
      partner_id: pId,
      shop_id: sId,
    }),
    signal: AbortSignal.timeout(10000),
  });

  const json = await res.json().catch(() => null);
  if (json && !json.error) {
    const resp = json.response || json.data || json;
    return {
      ok: true,
      accessToken: resp.access_token,
      refreshToken: resp.refresh_token || refreshToken,
      expiresIn: resp.expire_in || 14400,
    };
  }
  return {
    ok: false,
    error: json?.message || json?.error || "Không thể làm mới token Shopee.",
    raw: json,
  };
}

export function getActiveShopeeChannels() {
  const channels = listAllChannels();
  return channels.filter((c) => {
    const isShopee =
      c.platform === "SHOPEE" ||
      c.type === "shopee" ||
      c.channel_type === "shopee";
    const statusNorm = String(c.status || "").toUpperCase();
    return (
      isShopee &&
      statusNorm !== "DISCONNECTED" &&
      statusNorm !== "DELETED" &&
      statusNorm !== "INACTIVE"
    );
  });
}

export async function callShopeeApi({
  channel,
  apiPath,
  method = "GET",
  queryParams = {},
  body = null,
}) {
  const globalCfg = getShopeeConfig();
  const cfg = channel?.config || {};
  const partnerId = Number(cfg.partnerId || channel?.partnerId || globalCfg.partnerId || process.env.SHOPEE_PARTNER_ID);
  const partnerKey = String(cfg.partnerKey || globalCfg.partnerKey || process.env.SHOPEE_PARTNER_KEY || "").trim();
  const shopId = Number(cfg.shopId || channel?.shopId || channel?.externalId);
  const isSandbox = Boolean(cfg.isSandbox ?? channel?.isSandbox ?? globalCfg.isSandbox);

  let accessToken = String(cfg.accessToken || channel?.accessToken || "").trim();
  const refreshToken = String(cfg.refreshToken || channel?.refreshToken || "").trim();
  const tokenExpiresAt = Number(cfg.tokenExpiresAt || channel?.tokenExpiresAt || 0);

  if (!partnerId || !partnerKey || !shopId || !accessToken) {
    return { ok: false, error: "Thiếu thông tin xác thực Shopee (partnerId/partnerKey/shopId/accessToken)." };
  }

  // Tự động làm mới token nếu sắp hết hạn (còn < 5 phút)
  if (refreshToken && tokenExpiresAt > 0 && Date.now() > tokenExpiresAt - 5 * 60 * 1000) {
    const refreshed = await refreshShopeeToken({
      refreshToken,
      shopId,
      partnerId,
      partnerKey,
      isSandbox,
    }).catch(() => null);
    if (refreshed?.ok && refreshed.accessToken) {
      accessToken = refreshed.accessToken;
      const newExpiresAt = Date.now() + (refreshed.expiresIn || 14400) * 1000;
      try {
        updateChannelAccount(channel.id, {
          config: {
            ...cfg,
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken,
            tokenExpiresAt: newExpiresAt,
          },
        });
      } catch {}
    }
  }

  const host = isSandbox
    ? "partner.test-stable.shopeemobile.com"
    : "partner.shopeemobile.com";

  const makeRequest = async (tokenToUse) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = generateShopeeSign(apiPath, timestamp, partnerKey, partnerId, tokenToUse, shopId);
    const qs = new URLSearchParams({
      partner_id: String(partnerId),
      timestamp: String(timestamp),
      access_token: tokenToUse,
      shop_id: String(shopId),
      sign,
    });
    for (const [k, v] of Object.entries(queryParams || {})) {
      if (v !== undefined && v !== null && v !== "") {
        qs.set(k, String(v));
      }
    }
    const url = `https://${host}${apiPath}?${qs.toString()}`;
    const res = await fetch(url, {
      method,
      headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: method === "POST" && body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  };

  let { status, json } = await makeRequest(accessToken);

  // Retry 1 lần nếu token hết hạn bất ngờ
  if ((json?.error === "error_auth" || status === 403) && refreshToken) {
    const refreshed = await refreshShopeeToken({
      refreshToken,
      shopId,
      partnerId,
      partnerKey,
      isSandbox,
    }).catch(() => null);
    if (refreshed?.ok && refreshed.accessToken) {
      accessToken = refreshed.accessToken;
      try {
        updateChannelAccount(channel.id, {
          config: {
            ...cfg,
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken,
            tokenExpiresAt: Date.now() + (refreshed.expiresIn || 14400) * 1000,
          },
        });
      } catch {}
      ({ status, json } = await makeRequest(accessToken));
    }
  }

  if (!json || json.error) {
    return {
      ok: false,
      error: json?.message || json?.error || `Shopee API lỗi (HTTP ${status})`,
      errorCode: json?.error || "",
      raw: json,
    };
  }

  return { ok: true, response: json.response || json.data || json, raw: json };
}

export async function fetchShopeeConversations(channel, { pageSize = 25 } = {}) {
  return callShopeeApi({
    channel,
    apiPath: "/api/v2/sellerchat/get_conversation_list",
    method: "GET",
    queryParams: {
      direction: "older",
      type: "all",
      page_size: pageSize,
    },
  });
}

export async function fetchShopeeMessages(channel, conversationId, { pageSize = 30 } = {}) {
  return callShopeeApi({
    channel,
    apiPath: "/api/v2/sellerchat/get_message",
    method: "GET",
    queryParams: {
      conversation_id: conversationId,
      page_size: pageSize,
    },
  });
}

export async function sendShopeeMessage(channel, { toId, text }) {
  return callShopeeApi({
    channel,
    apiPath: "/api/v2/sellerchat/send_message",
    method: "POST",
    body: {
      to_id: Number(toId) || toId,
      message_type: "text",
      content: { text: String(text || "") },
    },
  });
}
