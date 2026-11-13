import { NextResponse } from "next/server";
import { createChannelAccount } from "@/lib/connectionHub.js";
import {
  getShopeeConfig,
  exchangeShopeeCodeForToken,
} from "@/lib/shopeeConfig.js";

export const dynamic = "force-dynamic";

function resolvePublicOrigin(request) {
  const fwdHost = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "")
    .split(",")[0]
    .trim();

  if (
    fwdHost &&
    !fwdHost.includes("0.0.0.0") &&
    !fwdHost.includes("127.0.0.1") &&
    !fwdHost.includes("localhost")
  ) {
    const rawProto = (request.headers.get("x-forwarded-proto") || "https").split(",")[0].trim();
    const proto = rawProto === "http" || rawProto === "https" ? rawProto : "https";
    return `${proto}://${fwdHost}`;
  }
  return process.env.NEXT_PUBLIC_APP_URL || "https://crm.addp.vn";
}

export async function GET(request) {
  const publicOrigin = resolvePublicOrigin(request);
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const shopId = searchParams.get("shop_id") || searchParams.get("shopId");
    const errorParam = searchParams.get("error");
    const messageParam = searchParams.get("message");

    if (errorParam) {
      console.warn("[SHOPEE_OAUTH_REJECTED]", errorParam, messageParam);
      return NextResponse.redirect(
        `${publicOrigin}/channels?error=${encodeURIComponent(messageParam || errorParam)}`
      );
    }

    if (!code || !shopId) {
      return NextResponse.redirect(
        `${publicOrigin}/channels?error=${encodeURIComponent("Thiếu mã authorization code hoặc shop_id từ Shopee.")}`
      );
    }

    const config = getShopeeConfig();
    const partnerId = config.partnerId || process.env.SHOPEE_PARTNER_ID;
    const partnerKey = config.partnerKey || process.env.SHOPEE_PARTNER_KEY;
    const isSandbox = config.isSandbox || false;

    if (!partnerId || !partnerKey) {
      return NextResponse.redirect(
        `${publicOrigin}/channels?error=${encodeURIComponent("Chưa có Partner ID hoặc Partner Key trong hệ thống.")}`
      );
    }

    const tokenRes = await exchangeShopeeCodeForToken({
      code,
      shopId,
      partnerId,
      partnerKey,
      isSandbox,
    });

    if (!tokenRes.ok) {
      console.error("[SHOPEE_TOKEN_EXCHANGE_ERR]", tokenRes.error, tokenRes.raw);
      return NextResponse.redirect(
        `${publicOrigin}/channels?error=${encodeURIComponent(tokenRes.error || "Không thể đổi mã Shopee sang Token.")}`
      );
    }

    const channelId = `shopee_${shopId}`;
    const cleanShopId = String(shopId);

    const saved = createChannelAccount({
      id: channelId,
      platform: "SHOPEE",
      name: `Shopee - Gian hàng #${cleanShopId}`,
      externalId: cleanShopId,
      status: "CONNECTED",
      statusLabel: "Đã ủy quyền Shopee Open API v2",
      extraFields: {
        type: "shopee",
        channel_type: "shopee",
        shopId: cleanShopId,
        accountId: cleanShopId,
        partnerId: String(partnerId),
        accessToken: tokenRes.accessToken,
        refreshToken: tokenRes.refreshToken,
        tokenExpiresAt: Date.now() + (tokenRes.expiresIn || 14400) * 1000,
        refreshTokenExpiresAt: Date.now() + 30 * 24 * 3600 * 1000,
        isSandbox,
      },
      config: {
        partnerId: String(partnerId),
        partnerKey: String(partnerKey),
        shopId: cleanShopId,
        accountId: cleanShopId,
        accessToken: tokenRes.accessToken,
        refreshToken: tokenRes.refreshToken,
        tokenExpiresAt: Date.now() + (tokenRes.expiresIn || 14400) * 1000,
        refreshTokenExpiresAt: Date.now() + 30 * 24 * 3600 * 1000,
        isSandbox,
      },
    });

    return NextResponse.redirect(
      `${publicOrigin}/channels?success=shopee_connected&shopId=${encodeURIComponent(cleanShopId)}`
    );
  } catch (err) {
    console.error("[SHOPEE_CALLBACK_FATAL]", err);
    return NextResponse.redirect(
      `${publicOrigin}/channels?error=${encodeURIComponent(err.message || "Lỗi xử lý phản hồi từ Shopee.")}`
    );
  }
}
