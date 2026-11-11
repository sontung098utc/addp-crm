import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { guardApiRequest } from "@/lib/rbac.js";
import { getChannelById, updateChannelAccount } from "@/lib/connectionHub.js";
import {
  TIKTOK_APP_KEY,
  TIKTOK_APP_SECRET,
  refreshTikTokOAuthToken,
  fetchTikTokAuthorizedShopsDetailed,
} from "@/lib/tiktokConfig.js";

export const dynamic = "force-dynamic";

/**
 * POST /api/channels/tiktok/refresh
 * Làm mới Access Token & Refresh Token cho một gian hàng TikTok Shop cụ thể
 */
export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const reqHeaders = await headers();
    const guard = guardApiRequest(cookieStore, reqHeaders, {
      allowedRoles: ["ADMIN", "SALE_LEADER"],
      moduleKey: "channels",
    });
    const currentToken = cookieStore.get("addp_crm_session")?.value;
    if (currentToken && !guard.ok) {
      return guard.response;
    }

    const body = await request.json();
    const channelId = String(body?.channelId || "").trim();
    if (!channelId) {
      return NextResponse.json(
        { ok: false, error: "Thiếu mã kênh channelId." },
        { status: 400 }
      );
    }

    const channel = getChannelById(channelId);
    if (!channel || channel.platform !== "TIKTOK_SHOP") {
      return NextResponse.json(
        { ok: false, error: "Không tìm thấy gian hàng TikTok Shop này." },
        { status: 404 }
      );
    }

    const refreshToken = channel.refreshToken || channel.config?.refreshToken || "";
    const appKey = channel.config?.appKey || TIKTOK_APP_KEY;
    const appSecret = channel.config?.appSecret || TIKTOK_APP_SECRET;

    const refreshed = await refreshTikTokOAuthToken({
      refreshToken,
      appKey,
      appSecret,
    });

    if (!refreshed.ok) {
      return NextResponse.json(
        { ok: false, error: refreshed.error || "Làm mới Token TikTok thất bại." },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    let resolvedCipher = channel.shopCipher || channel.config?.shopCipher || "";
    let resolvedShopId = channel.shopId || channel.config?.shopId || "";
    let resolvedShopCode = channel.shopCode || channel.config?.shopCode || "";

    if (!resolvedCipher && refreshed.accessToken) {
      const authShops = await fetchTikTokAuthorizedShopsDetailed({
        accessToken: refreshed.accessToken,
        appKey,
        appSecret,
      });
      const matched =
        (authShops.shops || []).find((s) => String(s.id) === String(resolvedShopId)) ||
        authShops.shops?.[0];
      if (matched?.cipher) {
        resolvedCipher = matched.cipher;
        resolvedShopId = matched.id || resolvedShopId;
        resolvedShopCode = matched.code || resolvedShopCode;
      }
    }

    const updated = updateChannelAccount(channel.id, {
      status: "CONNECTED",
      statusLabel: "Đã làm mới Token OAuth TikTok Shop",
      extraFields: {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        tokenExpiresAt: refreshed.tokenExpiresAt,
        ...(resolvedCipher ? { shopCipher: resolvedCipher } : {}),
        ...(resolvedShopId ? { shopId: resolvedShopId } : {}),
        ...(resolvedShopCode ? { shopCode: resolvedShopCode } : {}),
        oauthStatus: "active",
        updatedAt: nowIso,
      },
      config: {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        tokenExpiresAt: refreshed.tokenExpiresAt,
        ...(resolvedCipher ? { shopCipher: resolvedCipher } : {}),
        ...(resolvedShopId ? { shopId: resolvedShopId } : {}),
        ...(resolvedShopCode ? { shopCode: resolvedShopCode } : {}),
      },
    });

    return NextResponse.json({
      ok: true,
      channel: updated.channel || channel,
      message: `Đã làm mới Token thành công cho "${channel.name}".`,
    });
  } catch (err) {
    console.error("[TIKTOK_REFRESH_ERR]", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Lỗi máy chủ khi làm mới Token TikTok Shop." },
      { status: 500 }
    );
  }
}
