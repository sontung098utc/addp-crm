import GuideClient from "./GuideClient";

export const metadata = {
  title: "Sổ Tay Hướng Dẫn Sử Dụng & Vận Hành Toàn Diện | ADDP CRM",
  description:
    "Cẩm nang hướng dẫn đăng nhập, kết nối 7 kênh, trực chat AI, lịch chăm sóc tự động, quản lý kho combo và đối soát tài chính cho người dùng ADDP.",
};

export default function GuidePage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <GuideClient />
    </div>
  );
}
