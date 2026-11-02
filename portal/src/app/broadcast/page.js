import ModulePreviewView from "../components/ModulePreviewView";

export default function BroadcastPage() {
  return (
    <ModulePreviewView
      moduleKey="broadcast"
      title="Chiến Dịch Gửi Tin Hàng Loạt & Smart Broadcast Queue"
      wbsBadge="AI Broadcast"
      subtitle="Hàng đợi gửi tin thông minh: Giãn cách 45-120s ngẫu nhiên, giới hạn 70 tin/nick/ngày chống khóa Zalo"
    />
  );
}
