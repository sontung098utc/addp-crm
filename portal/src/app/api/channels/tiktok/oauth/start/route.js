import { NextResponse } from "next/server";
import {
  getTikTokConfig,
  saveTikTokConfig,
  buildTikTokAuthUrl,
} from "@/lib/tiktokConfig.js";

export const dynamic = "force-dynamic";

function resolvePublicOrigin(request) {
  try {
    const { searchParams } = new URL(request.url);
    const explicitOrigin = searchParams.get("origin");
    if (
      explicitOrigin &&
      explicitOrigin.startsWith("http") &&
      !explicitOrigin.includes("0.0.0.0") &&
      !explicitOrigin.includes("127.0.0.1") &&
      !explicitOrigin.includes("localhost")
    ) {
      return explicitOrigin.replace(/\/$/, "");
    }
  } catch {}

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

  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://crm.addp.vn"
  );
}

/**
 * GET /api/channels/tiktok/oauth/start
 * Lấy URL ủy quyền TikTok Shop 1-Click động và trạng thái cấu hình hiện tại
 */
export async function GET(request) {
  try {
    const publicOrigin = resolvePublicOrigin(request);
    const redirectUri = `${publicOrigin}/channels`;
    const callbackUri = `${publicOrigin}/api/channels/tiktok/callback`;
    const webhookUri = `${publicOrigin}/api/webhooks/tiktok`;

    const config = getTikTokConfig();
    const authUrl = buildTikTokAuthUrl({
      serviceId: config.serviceId,
      appKey: config.appKey,
      redirectUri,
    });

    const appKeyMasked = config.appKey
      ? config.appKey.length > 8
        ? `${config.appKey.slice(0, 4)}••••${config.appKey.slice(-4)}`
        : "••••••••"
      : "";

    return NextResponse.json({
      ok: true,
      authUrl,
      serviceId: config.serviceId,
      appKey: config.appKey,
      appKeyMasked,
      hasAppKey: Boolean(config.appKey),
      hasAppSecret: Boolean(config.appSecret),
      isConfigured: config.isConfigured,
      defaultShopCipher: config.defaultShopCipher,
      region: config.region,
      redirectUri,
      callbackUri,
      webhookUri,
    });
  } catch (error) {
    console.error("[TIKTOK_OAUTH_START_ERR]", error);
    return NextResponse.json(
      { ok: false, error: "Lỗi khởi tạo đường dẫn ủy quyền TikTok Shop." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/channels/tiktok/oauth/start
 * Lưu cấu hình App Key / App Secret / Service ID từ giao diện quản trị
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { serviceId, appKey, appSecret, defaultShopId, defaultShopCipher, region } = body;

    const res = saveTikTokConfig({
      serviceId,
      appKey,
      appSecret,
      defaultShopId,
      defaultShopCipher,
      region,
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: 500 });
    }

    const publicOrigin = resolvePublicOrigin(request);
    const authUrl = buildTikTokAuthUrl({
      serviceId: res.config.serviceId,
      appKey: res.config.appKey,
      redirectUri: `${publicOrigin}/channels`,
    });

    return NextResponse.json({
      ok: true,
      message: "Đã lưu cấu hình TikTok Shop Partner thành công!",
      config: {
        serviceId: res.config.serviceId,
        appKeyMasked: res.config.appKey
          ? `${res.config.appKey.slice(0, 4)}••••${res.config.appKey.slice(-4)}`
          : "",
        isConfigured: Boolean(res.config.appKey && res.config.appSecret),
        defaultShopCipher: res.config.defaultShopCipher,
        region: res.config.region,
      },
      authUrl,
    });
  } catch (error) {
    console.error("[TIKTOK_OAUTH_CONFIG_SAVE_ERR]", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Lỗi lưu cấu hình TikTok Shop." },
      { status: 500 }
    );
  }
}
