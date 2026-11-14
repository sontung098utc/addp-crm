import { NextResponse } from "next/server";
import {
  generateGroundedConversationSummary,
  EMPTY_PATHOLOGY,
  EMPTY_DEMAND,
  EMPTY_CONCERNS,
} from "@/lib/ai/conversationSummary.js";

/**
 * POST /api/zalo/ai-summary
 * Trợ lý AI Tóm Tắt 4 Mục (Chống bịa đặt / Grounded Extraction):
 * 1. Bệnh Lý & Triệu Chứng
 * 2. Nhu Cầu & Sản Phẩm
 * 3. Điểm Còn Băn Khoăn
 * 4. Gợi Ý Kịch Bản Chốt
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { thread_id, messages = [], customer = {} } = body || {};

    const summary = await generateGroundedConversationSummary({
      messages,
      customer,
      useLlm: true,
    });

    return NextResponse.json({
      ok: true,
      thread_id,
      summary,
    });
  } catch (error) {
    console.error("[POST /api/zalo/ai-summary ERROR]", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Lỗi tạo tóm tắt AI",
        summary: {
          pathology: EMPTY_PATHOLOGY,
          demand: EMPTY_DEMAND,
          concerns: EMPTY_CONCERNS,
          closing_script:
            "Dạ em chào anh/chị, không biết hôm nay mình đang cần em hỗ trợ thông tin hoặc sản phẩm nào bên em ạ?",
        },
      },
      { status: 200 }
    );
  }
}
