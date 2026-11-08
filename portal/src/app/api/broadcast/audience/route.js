import { NextResponse } from "next/server";
import {
  filterCustomersByTags,
  getAllAvailableCustomerTags,
  STANDARD_CUSTOMER_TAGS,
} from "@/lib/customerIdentityResolver.js";

/**
 * ADDP Omnichannel AI CRM — API Bộ Lọc Tệp Khách Nhận Broadcast & Đếm Trước (Module 1 - WBS-35)
 * GET  /api/broadcast/audience -> Trả về danh sách thẻ khách hàng & thống kê mặc định
 * POST /api/broadcast/audience -> Nhận { includeTags, excludeTags, channel, operator } và trả về:
 *   - totalCount: Tổng số khách đạt điều kiện
 *   - previewList: Danh sách 10 khách đầu tiên (Họ tên, SĐT đã che 3 số giữa, danh sách tags)
 *   - channelBreakdown: Số khách có Zalo, số khách có Messenger, số khách có Zalo OA
 */

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const channel = searchParams.get("channel") || "ALL";
    const result = filterCustomersByTags({
      includeTags: [],
      excludeTags: ["Đã Hủy Đơn", "Khiếu Nại", "Dừng Chăm Sóc"],
      channel,
      operator: "AND",
    });

    return NextResponse.json({
      ok: true,
      totalCount: result.totalCount,
      previewList: result.previewList,
      channelBreakdown: result.channelBreakdown,
      availableTags: getAllAvailableCustomerTags(),
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
      includeTags = [],
      excludeTags = [],
      channel = "ALL",
      operator = "AND",
    } = body || {};

    const result = filterCustomersByTags({
      includeTags: Array.isArray(includeTags) ? includeTags : [],
      excludeTags: Array.isArray(excludeTags) ? excludeTags : [],
      channel,
      operator,
    });

    return NextResponse.json({
      ok: true,
      totalCount: result.totalCount,
      previewList: result.previewList,
      channelBreakdown: result.channelBreakdown,
      availableTags: getAllAvailableCustomerTags(),
    });
  } catch (error) {
    console.error("[POST /api/broadcast/audience ERROR]", error);
    return NextResponse.json(
      { ok: false, error: "Lỗi khi lọc tệp khách hàng theo thẻ." },
      { status: 500 }
    );
  }
}
