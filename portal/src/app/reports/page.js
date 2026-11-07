import { cookies, headers } from "next/headers";
import ReportsClient from "./ReportsClient";
import { getFinancialOverview } from "@/lib/financialEngine";
import { guardApiRequest } from "@/lib/rbac";

export const metadata = {
  title: "Báo Cáo Doanh Số, Lãi/Lỗ Thực & Đối Soát BI | ADDP CRM",
  description: "Báo cáo doanh số 7 kênh, đối soát giá vốn COGS qua bóc tách combo, tỷ lệ hoàn hàng và lãi ròng",
};

export default async function ReportsPage({ searchParams }) {
  const sp = await searchParams;
  const initialTab = sp?.tab || "channels";
  const initialChannel = sp?.channel || "ALL";

  let initialReport = null;
  try {
    const cookieStore = await cookies();
    const reqHeaders = await headers();
    const guard = guardApiRequest(cookieStore, reqHeaders, {
      allowedRoles: ["ADMIN", "SALE_LEADER", "KE_TOAN"],
      moduleKey: "reports",
      resourceType: "finance",
    });

    if (guard.ok) {
      initialReport = getFinancialOverview({ channel: initialChannel });
      if (!guard.scope.canViewFinancialCost && initialReport?.financeBreakdown) {
        delete initialReport.financeBreakdown.cogs;
        delete initialReport.financeBreakdown.netProfit;
      }
    }
  } catch (e) {
    console.error("Lỗi SSR Financial Report:", e);
  }

  return (
    <ReportsClient
      initialReport={initialReport}
      initialTab={initialTab}
      initialChannel={initialChannel}
    />
  );
}
