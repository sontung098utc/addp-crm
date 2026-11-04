import ReportsClient from "./ReportsClient";
import { getFinancialOverview } from "@/lib/financialEngine";

export const metadata = {
  title: "Báo Cáo Doanh Số, Lãi/Lỗ Thực & Đối Soát BI | ADDP CRM",
  description: "Báo cáo doanh số 7 kênh, đối soát giá vốn COGS qua bóc tách combo, tỷ lệ hoàn hàng và lãi ròng",
};

export default async function ReportsPage({ searchParams }) {
  const sp = await searchParams;
  const initialTab = sp?.tab || "channels";
  const initialChannel = sp?.channel || "ALL";

  // Lấy dữ liệu tài chính ban đầu trực tiếp trên Server (SSR) để UI hiển thị tức thì, không bị giật số 0 đ
  let initialReport = null;
  try {
    initialReport = getFinancialOverview({ channel: initialChannel });
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
