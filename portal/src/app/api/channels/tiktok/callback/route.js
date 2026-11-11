import { NextResponse } from "next/server";
import { createChannelAccount } from "@/lib/connectionHub.js";
import {
  TIKTOK_APP_KEY,
  TIKTOK_APP_SECRET,
  TIKTOK_SERVICE_ID,
  exchangeTikTokAuthCode,
  fetchTikTokAuthorizedShops,
} from "@/lib/tiktokConfig.js";

export const dynamic = "force-dynamic";

function resolvePublicOrigin(request) {
  const fwdHost = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "")
    .split(",")[0]
    .trim();
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
  return process.env.NEXT_PUBLIC_APP_URL || "https://crm.addp.vn";
}

function normalizeExpiryTimestamp(expireInRaw) {
  const num = Number(expireInRaw || 0);
  if (!Number.isFinite(num) || num <= 0) {
    return Date.now() + 7 * 24 * 3600 * 1000;
  }
  if (num > 1e12) return num;
  if (num > 1e9) return num * 1000;
  return Date.now() + num * 1000;
}

async function processTikTokOAuthCode(authCode) {
  const exchange = await exchangeTikTokAuthCode(authCode, {
    appKey: TIKTOK_APP_KEY,
    appSecret: TIKTOK_APP_SECRET,
  });

  if (!exchange.ok || !exchange.data) {
    return {
      ok: false,
      error: exchange.error || "token_exchange_failed",
      raw: exchange.raw || null,
    };
  }

  const {
    access_token,
    refresh_token,
    access_token_expire_in,
    refresh_token_expire_in,
    open_id,
    seller_name,
    seller_base_region,
  } = exchange.data;

  const tokenExpiresAt = normalizeExpiryTimestamp(access_token_expire_in);
  const refreshTokenExpiresAt = normalizeExpiryTimestamp(refresh_token_expire_in);
  const cleanOpenId = String(open_id || "").trim();
  const defaultSellerName =
    String(seller_name || "").trim() ||
    (cleanOpenId ? `Gian Hàng TikTok #${cleanOpenId.slice(-4)}` : "Gian Hàng TikTok Shop");

  const authorizedShops = await fetchTikTokAuthorizedShops({
    accessToken: access_token,
    appKey: TIKTOK_APP_KEY,
    appSecret: TIKTOK_APP_SECRET,
  });

  const savedChannels = [];

  if (Array.isArray(authorizedShops) && authorizedShops.length > 0) {
    for (const shop of authorizedShops) {
      const shopId = String(shop.id || shop.shop_id || cleanOpenId || Date.now()).trim();
      const shopCipher = String(shop.cipher || shop.shop_cipher || "").trim();
      const shopName = String(shop.name || shop.shop_name || defaultSellerName).trim();
      const channelId = `tiktok_shop_${shopId}`;

      const res = createChannelAccount({
        id: channelId,
        platform: "TIKTOK_SHOP",
        name: `TikTok Shop - ${shopName}`,
        externalId: shopId,
        status: "CONNECTED",
        statusLabel: "Đã ủy quyền OAuth TikTok Shop",
        extraFields: {
          type: "tiktok_shop",
          channel_type: "tiktok_shop",
          shopId,
          accountId: shopCipher || shopId,
          shopCode: shop.code || "",
          shopCipher,
          shop_cipher: shopCipher,
          region: shop.region || seller_base_region || "VN",
          sellerName: shopName,
          openId: cleanOpenId,
          refreshToken: refresh_token,
          accessToken: access_token,
          tokenExpiresAt,
          refreshTokenExpiresAt,
          oauthStatus: "active",
        },
        config: {
          serviceId: TIKTOK_SERVICE_ID,
          appKey: TIKTOK_APP_KEY,
          appSecret: TIKTOK_APP_SECRET,
          shopId,
          accountId: shopCipher || shopId,
          shopCode: shop.code || "",
          shopCipher,
          shop_cipher: shopCipher,
          region: shop.region || seller_base_region || "VN",
          sellerName: shopName,
          openId: cleanOpenId,
          accessToken: access_token,
          refreshToken: refresh_token,
          tokenExpiresAt,
          refreshTokenExpiresAt,
        },
      });

      if (res.ok && res.channel) {
        savedChannels.push(res.channel);
      }
    }
  } else {
    const fallbackShopId = cleanOpenId || String(Date.now());
    const channelId = `tiktok_shop_${fallbackShopId}`;

    const res = createChannelAccount({
      id: channelId,
      platform: "TIKTOK_SHOP",
      name: `TikTok Shop - ${defaultSellerName}`,
      externalId: fallbackShopId,
      status: "CONNECTED",
      statusLabel: "Đã ủy quyền OAuth TikTok Shop",
      extraFields: {
        type: "tiktok_shop",
        channel_type: "tiktok_shop",
        shopId: fallbackShopId,
        region: seller_base_region || "VN",
        sellerName: defaultSellerName,
        openId: cleanOpenId,
        refreshToken: refresh_token,
        accessToken: access_token,
        tokenExpiresAt,
        refreshTokenExpiresAt,
        oauthStatus: "active",
      },
      config: {
        serviceId: TIKTOK_SERVICE_ID,
        appKey: TIKTOK_APP_KEY,
        appSecret: TIKTOK_APP_SECRET,
        shopId: fallbackShopId,
        region: seller_base_region || "VN",
        sellerName: defaultSellerName,
        openId: cleanOpenId,
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiresAt,
        refreshTokenExpiresAt,
      },
    });

    if (res.ok && res.channel) {
      savedChannels.push(res.channel);
    }
  }

  const shopNames = savedChannels.map((c) => c.sellerName || c.name);
  const displayShopName = shopNames.join(", ") || defaultSellerName;

  return {
    ok: true,
    shopName: displayShopName,
    count: savedChannels.length || 1,
    channels: savedChannels,
    message: `Kết nối thành công TikTok Shop: ${displayShopName}`,
  };
}

/**
 * GET /api/channels/tiktok/callback?code=...&app_key=...
 * Hỗ trợ cả redirect trực tiếp về `/channels` lẫn trả JSON (`?mode=json` hoặc Accept: application/json)
 */
export async function GET(request) {
  const publicOrigin = resolvePublicOrigin(request);

  try {
    const { searchParams } = new URL(request.url);
    const authCode = (
      searchParams.get("code") ||
      searchParams.get("auth_code") ||
      ""
    ).trim();
    const errorParam = (searchParams.get("error") || searchParams.get("err_msg") || "").trim();
    const wantsJson =
      searchParams.get("mode") === "json" ||
      String(request.headers.get("accept") || "").includes("application/json");

    if (errorParam && !authCode) {
      if (wantsJson) {
        return NextResponse.json({ ok: false, error: errorParam }, { status: 400 });
      }
      return NextResponse.redirect(
        `${publicOrigin}/channels?error=${encodeURIComponent(errorParam)}`
      );
    }

    if (!authCode) {
      if (wantsJson) {
        return NextResponse.json(
          { ok: false, error: "Thiếu mã ủy quyền (code) từ TikTok Shop." },
          { status: 400 }
        );
      }
      return NextResponse.redirect(`${publicOrigin}/channels?error=missing_code`);
    }

    const result = await processTikTokOAuthCode(authCode);

    if (!result.ok) {
      console.error("[TIKTOK_TOKEN_EXCHANGE_ERR]", result);
      if (wantsJson) {
        return NextResponse.json(
          { ok: false, error: result.error || "token_exchange_failed" },
          { status: 400 }
        );
      }
      return NextResponse.redirect(
        `${publicOrigin}/channels?error=${encodeURIComponent(
          result.error || "token_exchange_failed"
        )}`
      );
    }

    if (wantsJson) {
      return NextResponse.json(result);
    }

    const redirectUrl = `${publicOrigin}/channels?success=tiktok_connected&shop=${encodeURIComponent(
      result.shopName
    )}&count=${result.count}`;
    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    console.error("[TIKTOK_OAUTH_CALLBACK_EXCEPTION]", err);
    return NextResponse.redirect(`${publicOrigin}/channels?error=internal_error`);
  }
}

/**
 * POST /api/channels/tiktok/callback
 * Đổi mã code ngầm (JSON) khi người dùng được redirect về `/?code=...` hoặc `/channels?code=...`
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const authCode = String(body?.code || body?.auth_code || "").trim();

    if (!authCode) {
      return NextResponse.json(
        { ok: false, error: "Thiếu mã ủy quyền (code) từ TikTok Shop." },
        { status: 400 }
      );
    }

    const result = await processTikTokOAuthCode(authCode);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error || "Đổi Token TikTok Shop thất bại." },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[TIKTOK_OAUTH_CALLBACK_POST_ERR]", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Lỗi hệ thống khi xử lý ủy quyền TikTok Shop." },
      { status: 500 }
    );
  }
}
