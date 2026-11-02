"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { canAccessModule } from "@/lib/auth";

const MENU_ITEMS = [
  { key: "dashboard", name: "Tổng quan CRM", href: "/", icon: "📊", badge: null },
  { key: "inbox", name: "Hộp thư Đa kênh", href: "/inbox", icon: "💬", badge: "4 cần xử lý" },
  { key: "customers", name: "Khách hàng 360", href: "/customers", icon: "👥", badge: null },
  { key: "work-tracking", name: "Lịch Chăm sóc", href: "/work-tracking", icon: "📋", badge: "7 hôm nay" },
  { key: "broadcast", name: "AI & Gửi Hàng loạt", href: "/broadcast", icon: "🤖", badge: null },
  { key: "orders", name: "Đơn hàng & Kho Combo", href: "/orders", icon: "📦", badge: null },
  { key: "channels", name: "Kết nối 7 Kênh", href: "/channels", icon: "🌐", badge: "7 nền tảng" },
  { key: "reports", name: "Báo cáo BI & Lãi/Lỗ", href: "/reports", icon: "📈", badge: null },
  { key: "settings", name: "Nhân sự & Phân quyền", href: "/settings", icon: "⚙️", badge: null },
];

export default function Sidebar({ isCollapsed, setIsCollapsed, currentUser }) {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  const userRole = currentUser?.role || "ADMIN";
  const visibleItems = MENU_ITEMS.filter((item) => canAccessModule(userRole, item.key));

  return (
    <aside
      className={`bg-slate-900 border-r border-slate-800 text-slate-100 flex flex-col transition-all duration-200 select-none shrink-0 ${
        isCollapsed ? "w-20" : "w-64"
      }`}
    >
      {/* Logo & Nút thu gọn */}
      <div className="h-16 px-4 border-b border-slate-800 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 overflow-hidden">
          <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center font-extrabold text-white shadow shrink-0">
            +
          </div>
          {!isCollapsed && (
            <div className="leading-tight">
              <div className="font-bold text-sm tracking-tight text-white">ADDP CRM</div>
              <div className="text-[11px] text-emerald-400 font-medium">crm.addp.vn</div>
            </div>
          )}
        </Link>
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
          className="h-7 w-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-xs cursor-pointer"
        >
          {isCollapsed ? "❯" : "❮"}
        </button>
      </div>

      {/* Danh sách phân hệ theo quyền RBAC */}
      <nav className="flex-1 py-4 px-2.5 space-y-1 overflow-y-auto">
        {visibleItems.map((item) => {
          const isActive =
            pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.key}
              href={item.href}
              title={isCollapsed ? item.name : undefined}
              className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-base shrink-0">{item.icon}</span>
                {!isCollapsed && <span className="truncate">{item.name}</span>}
              </div>
              {!isCollapsed && item.badge && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${
                    isActive
                      ? "bg-white/20 text-white"
                      : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Thông tin hạn mức chống khóa Zalo ở chân Sidebar */}
      {!isCollapsed && (
        <div className="p-3 m-2.5 rounded-xl bg-slate-800/70 border border-slate-700/70 text-xs space-y-1.5">
          <div className="flex items-center justify-between text-slate-300 font-medium">
            <span>🛡️ Bảo vệ Zalo (Anti-Ban)</span>
            <span className="text-emerald-400">Bật</span>
          </div>
          <div className="text-[11px] text-slate-400">
            Giãn cách gửi: <strong>45–120s/tin</strong> • Định mức:{" "}
            <strong>{currentUser?.dailyMsgTarget || 70} tin/ngày</strong>
          </div>
        </div>
      )}
    </aside>
  );
}
