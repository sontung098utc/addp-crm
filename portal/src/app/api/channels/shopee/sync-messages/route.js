import { NextResponse } from "next/server";
import {
  fetchLiveShopeeConversations,
  getLastShopeeSyncErrors,
} from "@/lib/unifiedMessageRouter.js";
import { getActiveShopeeChannels } from "@/lib/shopeeConfig.js";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const shops = getActiveShopeeChannels();
    if (shops.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Chưa có gian hàng Shopee nào đang kết nối." },
        { status: 400 }
      );
    }

    const conversations = await fetchLiveShopeeConversations(true);
    const errors = getLastShopeeSyncErrors();

    if (conversations.length === 0 && errors.length > 0) {
      const firstErr = errors[0];
      return NextResponse.json(
        {
          ok: false,
          shopsChecked: shops.length,
          totalSynced: 0,
          errors,
          error: `Shopee trả về lỗi (${firstErr.errorCode || "API"}): ${firstErr.error}. Lưu ý: App Shopee cần được cấp quyền Seller Chat API trên Shopee Open Platform.`,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      shopsChecked: shops.length,
      totalSynced: conversations.length,
      errors,
      conversations,
      message: `Đã đồng bộ ${conversations.length} hội thoại từ ${shops.length} gian hàng Shopee.`,
    });
  } catch (err) {
    console.error("[POST /api/channels/shopee/sync-messages Error]", err);
    return NextResponse.json(
      { ok: false, error: `Lỗi đồng bộ Shopee: ${err.message}` },
      { status: 500 }
    );
  }
}
