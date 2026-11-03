import OrdersClient from "./OrdersClient";

export const metadata = {
  title: "Quản Lý Đơn Hàng Đa Nền Tảng | ADDP CRM",
  description: "Quản lý đơn hàng tập trung từ Magento 2.4.8, KiotViet, TikTok Shop, Shopee và Hộp thư Zalo",
};

export default function OrdersPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <OrdersClient />
    </div>
  );
}
