import InventoryManager from "./InventoryManager";

export const metadata = {
  title: "Kho Combo & Quản Lý Tồn Kho Đa Sàn | ADDP CRM",
  description: "Giải mã công thức combo đệ quy, quản lý hàng đóng sẵn và ánh xạ SKU giữa TikTok Shop, Shopee, Magento và KiotViet (WBS-41 & WBS-42)",
};

export default function InventoryPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <InventoryManager />
    </div>
  );
}
