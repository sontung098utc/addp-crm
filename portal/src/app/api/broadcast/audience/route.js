import { NextResponse } from "next/server";
import { resolveBroadcastAudience } from "@/lib/broadcastAudienceResolver.js";
import { getTags } from "@/lib/tagStore.js";
import { STANDARD_CUSTOMER_TAGS } from "@/lib/customerIdentityResolver.js";

/**
 * ADDP Omnichannel AI CRM — API Bộ Lọc Tệp Khách Nhận Broadcast & Đếm Trước (Module 1 - WBS-35)
 * GET  /api/broadcast/audience -> Lấy danh sách thẻ & đếm mặc định theo danh bạ bạn bè Zalo
 * POST /api/broadcast/audience -> Nhận { audienceSource, includeTags, excludeTags, channel, operator, targetAccount }
 * Trả về:
 *   - totalCount: Tổng số khách đạt điều kiện (Xác thực 100%)
 *   - previewList: Danh sách 10 khách đầu tiên
 *   - channelBreakdown: { zalo, messenger, zaloOa }
 *   - availableTags: Danh sách các thẻ tag thực tế trong hệ thống
 */

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const channel = searchParams.get("channel") || "ALL";
    const audienceSource = searchParams.get("source") || "ZALO_FRIENDS";

    const result = resolveBroadcastAudience({
      audienceSource,
      includeTags: [],
      excludeTags: ["Đã Hủy Đơn", "Khiếu Nại", "Dừng Chăm Sóc"],
      channel,
      operator: "OR",
    });

    const activeTags = getTags().map((t) => t.name);

    return NextResponse.json({
      ok: true,
      audienceSource,
      totalCount: result.totalCount,
      previewList: result.previewList,
      channelBreakdown: result.channelBreakdown,
      availableTags: activeTags.length > 0 ? activeTags : STANDARD_CUSTOMER_TAGS,
      standardTags: STANDARD_CUSTOMER_TAGS,
    });
  } catch (error) {
    console.error("[GET /api/broadcast/audience ERROR]", error);
    return NextResponse.json(
      { ok: false, error: "Không thể tải danh sách tệp khách hàng." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      audienceSource = "ZALO_FRIENDS",
      includeTags = [],
      excludeTags = ["Đã Hủy Đơn", "Khiếu Nại", "Dừng Chăm Sóc"],
      channel = "ALL",
      operator = "OR",
      targetAccount = "ALL",
    } = body || {};

    const result = resolveBroadcastAudience({
      audienceSource,
      includeTags: Array.isArray(includeTags) ? includeTags : [],
      excludeTags: Array.isArray(excludeTags) ? excludeTags : [],
      channel,
      operator,
      targetAccount,
    });

    const activeTags = getTags().map((t) => t.name);

    return NextResponse.json({
      ok: true,
      audienceSource,
      totalCount: result.totalCount,
      previewList: result.previewList,
      channelBreakdown: result.channelBreakdown,
      availableTags: activeTags.length > 0 ? activeTags : STANDARD_CUSTOMER_TAGS,
    });
  } catch (error) {
    console.error("[POST /api/broadcast/audience ERROR]", error);
    return NextResponse.json(
      { ok: false, error: "Lỗi khi lọc tệp khách hàng theo bộ lọc." },
      { status: 500 }
    );
  }
}
