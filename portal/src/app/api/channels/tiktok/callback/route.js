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

/**
 * GET /api/channels/tiktok/callback?code=...&app_key=...
 * Callback OAuth 1-Click TikTok Shop:
 * 1. Đổi auth_code lấy access_token, refresh_token, open_id, seller_name
 * 2. Gọi API /authorization/202309/shops để lấy chi tiết từng gian hàng đã cấp quyền
 * 3. Lưu nhiều gian hàng song song (Multi-Shop) vào channels.json qua connectionHub
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

    if (errorParam && !authCode) {
      return NextResponse.redirect(
        `${publicOrigin}/channels?error=${encodeURIComponent(errorParam)}`
      );
    }

    if (!authCode) {
      return NextResponse.redirect(`${publicOrigin}/channels?error=missing_code`);
    }

    // 1. Đổi auth_code lấy Access Token & Refresh Token
    const exchange = await exchangeTikTokAuthCode(authCode, {
      appKey: TIKTOK_APP_KEY,
      appSecret: TIKTOK_APP_SECRET,
    });

    if (!exchange.ok || !exchange.data) {
      console.error("[TIKTOK_TOKEN_EXCHANGE_ERR]", exchange);
      return NextResponse.redirect(
        `${publicOrigin}/channels?error=${encodeURIComponent(
          exchange.error || "token_exchange_failed"
        )}`
      );
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

    // 2. Lấy danh sách chi tiết các gian hàng đã cấp quyền
    const authorizedShops = await fetchTikTokAuthorizedShops({
      accessToken: access_token,
      appKey: TIKTOK_APP_KEY,
      appSecret: TIKTOK_APP_SECRET,
    });

    const savedShops = [];

    if (Array.isArray(authorizedShops) && authorizedShops.length > 0) {
      for (const shop of authorizedShops) {
        const shopId = String(shop.id || shop.shop_id || cleanOpenId || Date.now()).trim();
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
            shopCode: shop.code || "",
            shopCipher: shop.cipher || "",
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
            shopCode: shop.code || "",
            shopCipher: shop.cipher || "",
            region: shop.region || seller_base_region || "VN",
            sellerName: shopName,
            openId: cleanOpenId,
            accessToken: access_token,
            refreshToken: refresh_token,
            tokenExpiresAt,
            refreshTokenExpiresAt,
          },
        });

        if (res.ok) {
          savedShops.push(shopName);
        }
      }
    } else {
      // Fallback nếu API /shops trả rỗng -> vẫn lưu gian hàng theo open_id / seller_name
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

      if (res.ok) {
        savedShops.push(defaultSellerName);
      }
    }

    const displayShopParam = savedShops.join(", ") || defaultSellerName;
    const redirectUrl = `${publicOrigin}/channels?success=tiktok_connected&shop=${encodeURIComponent(
      displayShopParam
    )}&count=${savedShops.length || 1}`;
    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    console.error("[TIKTOK_OAUTH_CALLBACK_EXCEPTION]", err);
    return NextResponse.redirect(`${publicOrigin}/channels?error=internal_error`);
  }
}
