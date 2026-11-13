"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { canAccessModule } from "@/lib/authConstants";
import { useTheme } from "./ThemeProvider";
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  CalendarClock,
  Bot,
  Receipt,
  PackageSearch,
  Globe2,
  TrendingUp,
  ShieldCheck,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Shield,
  Circle,
  Tag,
} from "lucide-react";

const MENU_ITEMS = [
  { key: "dashboard", name: "Tổng quan CRM", href: "/", icon: LayoutDashboard, badge: null },
  { key: "inbox", name: "Hộp thư Đa kênh", href: "/inbox", icon: MessageSquare, badge: null },
  { key: "customers", name: "Khách hàng", href: "/customers", icon: Users, badge: null },
  { key: "tags", name: "Quản lý Thẻ Tag", href: "/settings/tags", icon: Tag, badge: null },
  { key: "work-tracking", name: "Lịch Chăm sóc", href: "/work-tracking", icon: CalendarClock, badge: null },
  { key: "ai-bots", name: "AI Bot & Tri Thức", href: "/ai-bots", icon: Bot, badge: "Mới" },
  { key: "broadcast", name: "AI & Gửi Hàng loạt", href: "/broadcast", icon: Bot, badge: null },
  { key: "orders", name: "Đơn hàng Đa sàn", href: "/orders", icon: Receipt, badge: null },
  { key: "inventory", name: "Kho Combo & SKU", href: "/inventory", icon: PackageSearch, badge: null },
  { key: "channels", name: "Kết nối 7 Kênh", href: "/channels", icon: Globe2, badge: null },
  { key: "reports", name: "Báo cáo BI & Lãi/Lỗ", href: "/reports", icon: TrendingUp, badge: null },
  { key: "settings", name: "Nhân sự & Phân quyền", href: "/settings", icon: ShieldCheck, badge: null },
  { key: "guide", name: "Hướng Dẫn Sử Dụng", href: "/guide", icon: BookOpen, badge: "Sổ tay" },
];

export default function Sidebar({ isCollapsed, setIsCollapsed, currentUser }) {
  const pathname = usePathname();
  const { theme } = useTheme();
  const [sidebarStats, setSidebarStats] = useState({
    inboxUnreadCount: 0,
    careTasksCount: 0,
    channelsCount: 0,
    dailyZaloMsgLimit: 70,
  });

  useEffect(() => {
    if (pathname === "/login" || !currentUser) return;
    let cancelled = false;

    const loadStats = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      fetch("/api/sidebar-stats", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (cancelled || !data?.ok) return;
          setSidebarStats({
            inboxUnreadCount: Number(data.inboxUnreadCount) || 0,
            careTasksCount: Number(data.careTasksCount) || 0,
            channelsCount: Number(data.channelsCount) || 0,
            dailyZaloMsgLimit: Number(data.dailyZaloMsgLimit) || 70,
          });
        })
        .catch(() => {});
    };

    const handleVisibility = () => {
      if (!document.hidden) loadStats();
    };

    const handleRealtimeUnread = (e) => {
      if (typeof e?.detail?.count === "number") {
        setSidebarStats((prev) => ({ ...prev, inboxUnreadCount: e.detail.count }));
      }
    };

    window.addEventListener("addp:unread-count", handleRealtimeUnread);

    loadStats();
    const timer = setInterval(loadStats, 45000);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("addp:unread-count", handleRealtimeUnread);
    };
  }, [pathname, currentUser]);

  if (pathname === "/login") return null;

  const userRole = currentUser?.role || "ADMIN";
  const visibleItems = MENU_ITEMS.filter((item) =>
    canAccessModule(currentUser || userRole, item.key)
  );

  return (
    <aside
      suppressHydrationWarning
      className={`h-screen bg-slate-900/95 dark:bg-[#0e131f] border-r border-slate-800/80 text-slate-100 flex flex-col transition-all duration-200 select-none shrink-0 ${
        isCollapsed ? "w-20" : "w-64"
      }`}
    >
      {/* Logo chính thức của ADDP Pharmacy & Nút thu gọn */}
      <div className="h-15 px-4 border-b border-slate-800/60 flex items-center justify-between gap-2 shrink-0">
        <Link href="/" className="flex items-center gap-2.5 overflow-hidden group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={theme === "light" ? "/addp-logo-transparent.png" : "/addp-logo-white.png"}
            alt="ADDP Pharmacy"
            className={`${
              isCollapsed ? "h-6 w-auto max-w-[48px]" : "h-7 w-auto max-w-[128px]"
            } object-contain shrink-0 transition-transform duration-150 group-hover:opacity-90`}
          />
          {!isCollapsed && (
            <div className="leading-tight shrink-0 border-l border-slate-700/50 pl-2">
              <span className="text-[10px] font-bold tracking-wider text-[#007aff]">
                CRM
              </span>
            </div>
          )}
        </Link>
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label={isCollapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
          title={isCollapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
          className="h-7 w-7 rounded-lg bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-xs cursor-pointer shrink-0 transition-colors"
        >
          {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Danh sách phân hệ theo quyền RBAC */}
      <nav className="flex-1 py-3 px-2.5 space-y-1 overflow-y-auto">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));

          let dynamicBadge = item.badge;
          if (item.key === "inbox") {
            dynamicBadge =
              sidebarStats.inboxUnreadCount > 0 ? String(sidebarStats.inboxUnreadCount) : null;
          } else if (item.key === "work-tracking") {
            dynamicBadge =
              sidebarStats.careTasksCount > 0 ? String(sidebarStats.careTasksCount) : null;
          } else if (item.key === "channels") {
            dynamicBadge =
              sidebarStats.channelsCount > 0 ? String(sidebarStats.channelsCount) : null;
          }

          return (
            <Link
              key={item.key}
              href={item.href}
              title={isCollapsed ? item.name : undefined}
              className={`group flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 ${
                isActive
                  ? "bg-[#007aff] text-white shadow-xs font-semibold"
                  : "text-slate-300 hover:bg-slate-800/50 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors duration-150 ${
                    isActive ? "text-white" : "text-slate-400 group-hover:text-[#007aff]"
                  }`}
                />
                {!isCollapsed && <span className="truncate tracking-tight">{item.name}</span>}
              </div>
              {!isCollapsed && dynamicBadge && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 whitespace-nowrap transition-colors ${
                    isActive
                      ? "bg-white/20 text-white"
                      : item.key === "inbox" && sidebarStats.inboxUnreadCount > 0
                      ? "bg-rose-500 text-white font-bold"
                      : "bg-slate-800 text-slate-300 border border-slate-700/60"
                  }`}
                >
                  {dynamicBadge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Thông tin hạn mức chống khóa Zalo ở chân Sidebar */}
      {!isCollapsed && (
        <div className="p-3 m-2.5 rounded-2xl bg-slate-800/40 border border-slate-700/40 text-xs space-y-1.5 shrink-0">
          <div className="flex items-center justify-between text-slate-300 font-medium">
            <span className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate text-[11px]">Bảo vệ Zalo (Anti-Ban)</span>
            </span>
            <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold text-[10px] shrink-0">
              <Circle className="w-1.5 h-1.5 fill-emerald-400 text-emerald-400" />
              Bật
            </span>
          </div>
          <div className="text-[11px] text-slate-400 leading-relaxed">
            Giãn cách: <strong>45–120s</strong> • Hạn mức:{" "}
            <strong>
              {sidebarStats.dailyZaloMsgLimit ||
                Math.min(Number(currentUser?.dailyMsgTarget) || 70, 70)}{" "}
              tin/ngày
            </strong>
          </div>
        </div>
      )}
    </aside>
  );
}
