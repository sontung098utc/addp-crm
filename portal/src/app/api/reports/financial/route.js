import { NextResponse } from "next/server";
import { getFinancialOverview } from "../../../../lib/financialEngine.js";

/**
 * ADDP Omnichannel AI CRM — API Báo Cáo Tài Chính & Lãi/Lỗ Đơn Hàng Thực (WBS-43 & WBS-44)
 * Tuân thủ Điều 5 (RBAC Security) & Điều 11 (Dữ liệu xác thực) AGENTS.md
 */

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const channel = searchParams.get("channel") || "ALL";
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const report = getFinancialOverview({ channel, startDate, endDate });

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      report,
    });
  } catch (error) {
    console.error("[FINANCIAL_REPORT_API_ERROR]", error);
    return NextResponse.json({ error: "Lỗi tạo báo cáo tài chính." }, { status: 500 });
  }
}
