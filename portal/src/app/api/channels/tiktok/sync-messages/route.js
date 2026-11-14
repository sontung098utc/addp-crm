import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import {
  guardApiRequest,
  isChannelScopeRestricted,
  filterChannelsForStaff,
} from "@/lib/rbac.js";
import {
  syncTikTokShopMessages,
  getConnectedTikTokShops,
} from "@/lib/unifiedMessageRouter.js";

export const dynamic = "force-dynamic";

/**
 * POST /api/channels/tiktok/sync-messages
 * Kéo danh sách hội thoại & tin nhắn từ TikTok Shop Open API (Customer Service)
 * về kho hội thoại hợp nhất CRM (tự động làm mới Token nếu hết hạn).
 */
export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const reqHeaders = await headers();
    const guard = guardApiRequest(cookieStore, reqHeaders, {
      allowedRoles: ["ADMIN", "SALE_LEADER", "SALE", "CSKH"],
      moduleKey: "inbox",
    });
    if (!guard.ok) {
      return guard.response;
    }

    const body = await request.json().catch(() => ({}));
    const shopId = String(body?.shopId || "").trim();

    if (isChannelScopeRestricted(guard.staff)) {
      const allowedShops = filterChannelsForStaff(guard.staff, getConnectedTikTokShops());
      if (shopId) {
        const isAllowed = allowedShops.some(
          (s) => String(s.shopId) === shopId || String(s.id) === shopId
        );
        if (!isAllowed) {
          return NextResponse.json(
            {
              ok: false,
              message: "Từ chối truy cập (RBAC): Bạn chưa được phân quyền gian hàng TikTok Shop này.",
            },
            { status: 403 }
          );
        }
      } else if (allowedShops.length === 0) {
        return NextResponse.json(
          {
            ok: false,
            message: "Từ chối truy cập (RBAC): Bạn chưa được phân quyền gian hàng TikTok Shop nào.",
          },
          { status: 403 }
        );
      } else if (allowedShops.length === 1) {
        const result = await syncTikTokShopMessages({ shopId: allowedShops[0].shopId });
        return NextResponse.json(result, { status: 200 });
      }
    }

    const result = await syncTikTokShopMessages({ shopId });
    return NextResponse.json(result, { status: result.ok ? 200 : 200 });
  } catch (error) {
    console.error("[TIKTOK_SYNC_MESSAGES_ERR]", error);
    return NextResponse.json(
      { ok: false, message: error?.message || "Lỗi đồng bộ tin nhắn TikTok Shop." },
      { status: 500 }
    );
  }
}
