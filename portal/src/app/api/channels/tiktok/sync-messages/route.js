import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { guardApiRequest } from "@/lib/rbac.js";
import { syncTikTokShopMessages } from "@/lib/unifiedMessageRouter.js";

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
    const currentToken = cookieStore.get("addp_crm_session")?.value;
    if (currentToken && !guard.ok) {
      return guard.response;
    }

    const body = await request.json().catch(() => ({}));
    const shopId = String(body?.shopId || "").trim();

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
