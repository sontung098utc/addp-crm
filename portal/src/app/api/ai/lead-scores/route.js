import { NextResponse } from "next/server";
import {
  getLeadScore,
  saveLeadScore,
  getAllLeadScores,
  recalculateAndSaveLeadScore,
  getLeadScoresSummary,
} from "../../../../lib/ai/leadScoreStore.js";
import { evaluateLeadScore } from "../../../../lib/ai/leadScorer.js";
import { getCustomerById } from "../../../../lib/customerIdentityResolver.js";

/**
 * ADDP Omnichannel AI CRM — API AI Lead Scoring (Chấm điểm mức độ quan tâm của khách hàng)
 *
 * GET /api/ai/lead-scores
 * Query params:
 *   - customerId: Lấy điểm số của 1 khách hàng cụ thể
 *   - tier: Lọc theo phân loại HOT | WARM | COLD
 *   - search: Tìm kiếm theo tên, số điện thoại hoặc mã khách
 *   - summary: Nếu true, chỉ trả về thống kê tổng hợp số lượng HOT/WARM/COLD
 *   - limit, offset: Phân trang
 *
 * POST /api/ai/lead-scores
 * Body:
 *   - customerId: ID khách hàng
 *   - messages: Danh sách tin nhắn hoặc chuỗi hội thoại để phân tích
 *   - customer: Dữ liệu hồ sơ khách hàng bổ sung (optional)
 *   - forceRecalculate: Bắt buộc tính lại ngay cả khi đã có điểm
 */

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");
    const tier = searchParams.get("tier");
    const search = searchParams.get("search");
    const summaryOnly = searchParams.get("summary") === "true";
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // 1. Nếu yêu cầu xem tóm tắt thống kê tổng
    if (summaryOnly) {
      const summary = getLeadScoresSummary();
      return NextResponse.json({
        ok: true,
        summary,
      });
    }

    // 2. Nếu truy vấn cho 1 khách hàng cụ thể
    if (customerId) {
      const scoreData = getLeadScore(customerId);
      if (!scoreData) {
        // Thử tìm customer xem có tồn tại không
        const customer = getCustomerById(customerId);
        if (!customer) {
          return NextResponse.json(
            { ok: false, error: `Không tìm thấy khách hàng với ID: ${customerId}` },
            { status: 404 }
          );
        }
        // Tính điểm ban đầu cho khách hàng
        const initialScore = evaluateLeadScore({ customer });
        return NextResponse.json({
          ok: true,
          customerId,
          leadScore: {
            customerId: String(customer.id),
            ...initialScore,
            customerName: customer.fullName || "",
            phone: customer.phone || "",
          },
        });
      }

      return NextResponse.json({
        ok: true,
        customerId,
        leadScore: scoreData,
      });
    }

    // 3. Lấy danh sách điểm số theo bộ lọc
    const result = getAllLeadScores({
      tier,
      search,
      limit,
      offset,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error("[GET /api/ai/lead-scores ERROR]", error);
    return NextResponse.json(
      { ok: false, error: "Lỗi hệ thống khi lấy thông tin điểm tiềm năng: " + error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { customerId, messages, customer, scoreData, forceRecalculate } = body;

    // Trường hợp 1: Chấm điểm nhanh tin nhắn/hồ sơ không gắn kèm customerId
    if (!customerId && !customer?.id && messages) {
      const evaluation = evaluateLeadScore({
        messages,
        customer,
      });
      return NextResponse.json({
        ok: true,
        leadScore: evaluation,
      });
    }

    const effectiveCustomerId = customerId || customer?.id;
    if (!effectiveCustomerId) {
      return NextResponse.json(
        { ok: false, error: "Vui lòng cung cấp customerId hoặc nội dung tin nhắn để chấm điểm." },
        { status: 400 }
      );
    }

    // Trường hợp 2: Ghi trực tiếp scoreData nếu có
    if (scoreData && typeof scoreData === "object") {
      const saved = saveLeadScore(effectiveCustomerId, scoreData, {
        customerName: customer?.fullName,
        phone: customer?.phone,
      });
      return NextResponse.json({
        ok: true,
        leadScore: saved,
      });
    }

    // Trường hợp 3: Tính toán lại dựa trên messages và hồ sơ khách hàng
    const targetCustomer = customer || getCustomerById(effectiveCustomerId);
    const result = recalculateAndSaveLeadScore(targetCustomer || effectiveCustomerId, messages || []);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[POST /api/ai/lead-scores ERROR]", error);
    return NextResponse.json(
      { ok: false, error: "Lỗi hệ thống khi tính điểm tiềm năng: " + error.message },
      { status: 500 }
    );
  }
}
