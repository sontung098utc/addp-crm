import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { getFinancialOverview } from "../../../../lib/financialEngine.js";
import { guardApiRequest } from "../../../../lib/rbac.js";

/**
 * ADDP Omnichannel AI CRM — API Báo Cáo Tài Chính & Lãi/Lỗ Đơn Hàng Thực (WBS-43 & WBS-44)
 * Tuân thủ Điều 5 (RBAC Security) & Điều 11 (Dữ liệu xác thực) AGENTS.md
 */

export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const reqHeaders = await headers();
    const guard = guardApiRequest(cookieStore, reqHeaders, {
      allowedRoles: ["ADMIN", "SALE_LEADER", "KE_TOAN"],
      moduleKey: "reports",
      resourceType: "finance",
    });

    if (!guard.ok) {
      return guard.response;
    }

    const { searchParams } = new URL(request.url);
    const channel = searchParams.get("channel") || "ALL";
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const report = getFinancialOverview({ channel, startDate, endDate });

    // Nếu là SALE_LEADER (không phải ADMIN hoặc KE_TOAN), ẩn chi tiết giá vốn & lợi nhuận ròng theo Điều 5 AGENTS.md
    if (!guard.scope.canViewFinancialCost && report) {
      if (report.financeBreakdown) {
        delete report.financeBreakdown.cogs;
        delete report.financeBreakdown.cogsRatioPct;
        delete report.financeBreakdown.netProfit;
        delete report.financeBreakdown.netMarginPct;
      }
      if (Array.isArray(report.channelStats)) {
        report.channelStats = report.channelStats.map(({ cogs, netProfit, netMarginPct, ...rest }) => rest);
      }
      if (Array.isArray(report.orderDetails)) {
        report.orderDetails = report.orderDetails.map(({ cogs, netProfit, marginPct, ...rest }) => rest);
      }
    }

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
