import ModulePreviewView from "../components/ModulePreviewView";

export default function ReportsPage() {
  return (
    <ModulePreviewView
      moduleKey="reports"
      title="Báo Cáo Doanh Số, Lãi/Lỗ Đơn Hàng & Đối Soát Tài Chính"
      wbsBadge="Báo Cáo BI"
      subtitle="Báo cáo doanh số theo kênh, nhân viên, phân tích tỷ lệ hoàn hàng và đối soát giá vốn / lãi ròng theo phân quyền RBAC"
    />
  );
}
