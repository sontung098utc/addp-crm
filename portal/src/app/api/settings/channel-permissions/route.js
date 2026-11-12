import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import {
  getChannelPermissionMatrix,
  upsertChannelPermission,
} from "../../../../lib/auth.js";
import { guardApiRequest } from "../../../../lib/rbac.js";

/**
 * API Ma trận Phân quyền Kênh & Tự động Chia Lead cho Sale/CSKH (WBS-08)
 * Quản lý quyền truy cập từng Fanpage, nick Zalo QR, Zalo OA, TikTok Shop, Shopee, KiotViet, Magento 2.4.8
 */

export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const reqHeaders = await headers();
    const guard = guardApiRequest(cookieStore, reqHeaders, {
      allowedRoles: ["ADMIN", "SALE_LEADER"],
      moduleKey: "settings",
    });
    if (!guard.ok) {
      return guard.response;
    }

    const matrix = getChannelPermissionMatrix();
    return NextResponse.json({
      ok: true,
      ...matrix,
    });
  } catch (error) {
    console.error("[CHANNEL_ACL_GET_ERROR]", error);
    return NextResponse.json(
      { error: "Lỗi máy chủ khi tải ma trận phân quyền kênh." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const reqHeaders = await headers();
    const guard = guardApiRequest(cookieStore, reqHeaders, {
      allowedRoles: ["ADMIN", "SALE_LEADER"],
      moduleKey: "settings",
    });
    if (!guard.ok) {
      return guard.response;
    }

    const body = await request.json();

    // Hỗ trợ cập nhật hàng loạt (batch) hoặc từng ô đơn lẻ
    if (Array.isArray(body.items)) {
      for (const item of body.items) {
        upsertChannelPermission(item);
      }
      return NextResponse.json({
        ok: true,
        message: `Đã cập nhật phân quyền cho ${body.items.length} kết nối kênh thành công!`,
        ...getChannelPermissionMatrix(),
      });
    }

    const result = upsertChannelPermission(body);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      message: "Đã lưu phân quyền truy cập kênh cho nhân viên!",
      ...getChannelPermissionMatrix(),
    });
  } catch (error) {
    console.error("[CHANNEL_ACL_POST_ERROR]", error);
    return NextResponse.json(
      { error: "Lỗi máy chủ khi lưu phân quyền kênh." },
      { status: 500 }
    );
  }
}
