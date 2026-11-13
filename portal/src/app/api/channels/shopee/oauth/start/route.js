import { NextResponse } from "next/server";
import {
  getShopeeConfig,
  saveShopeeConfig,
  generateShopeeAuthUrl,
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
  try {
    const { searchParams } = new URL(request.url);
    const queryPartnerId = (searchParams.get("partner_id") || searchParams.get("partnerId") || "").trim();
    const queryPartnerKey = (searchParams.get("partner_key") || searchParams.get("partnerKey") || "").trim();
    const isSandbox = searchParams.get("sandbox") === "true";

    const config = getShopeeConfig();
    const partnerId = queryPartnerId || config.partnerId || process.env.SHOPEE_PARTNER_ID;
    const partnerKey = queryPartnerKey || config.partnerKey || process.env.SHOPEE_PARTNER_KEY;

    if (!partnerId || !partnerKey) {
      return NextResponse.json(
        {
          ok: false,
          error: "MISSING_CREDENTIALS",
          message: "Vui lòng nhập Partner ID và Partner Key của Shopee Open Platform để tạo link ủy quyền.",
        },
        { status: 400 }
      );
    }

    // Lưu lại thông tin cấu hình vào shopee_app.json
    saveShopeeConfig({
      partnerId,
      partnerKey,
      isSandbox,
      updatedAt: new Date().toISOString(),
    });

    const publicOrigin = resolvePublicOrigin(request);
    const redirectUrl = `${publicOrigin}/api/channels/shopee/callback`;

    const authUrl = generateShopeeAuthUrl({
      partnerId,
      partnerKey,
      redirectUrl,
      isSandbox,
    });

    const format = searchParams.get("format");
    if (format === "json") {
      return NextResponse.json({
        ok: true,
        authUrl,
        redirectUrl,
        partnerId,
      });
    }

    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("[SHOPEE_OAUTH_START_ERR]", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Lỗi tạo đường dẫn ủy quyền Shopee." },
      { status: 500 }
    );
  }
}
