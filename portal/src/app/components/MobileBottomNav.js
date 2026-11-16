"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { canAccessModule } from "@/lib/authConstants";
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Receipt,
  PackageSearch,
  TrendingUp,
  CalendarClock,
  Menu,
} from "lucide-react";

const BOTTOM_NAV_CANDIDATES = [
  { key: "dashboard", label: "Tổng quan", href: "/", icon: LayoutDashboard },
  { key: "inbox", label: "Hộp thư", href: "/inbox", icon: MessageSquare },
  { key: "customers", label: "Khách hàng", href: "/customers", icon: Users },
  { key: "orders", label: "Đơn hàng", href: "/orders", icon: Receipt },
  { key: "inventory", label: "Kho hàng", href: "/inventory", icon: PackageSearch },
  { key: "work-tracking", label: "Chăm sóc", href: "/work-tracking", icon: CalendarClock },
  { key: "reports", label: "Báo cáo", href: "/reports", icon: TrendingUp },
];

export default function MobileBottomNav({ currentUser, onOpenMenu, isMenuOpen = false }) {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (pathname === "/login" || !currentUser) return;
    let cancelled = false;

    const loadUnread = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      fetch("/api/sidebar-stats", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (cancelled || !data?.ok) return;
          setUnreadCount(Number(data.inboxUnreadCount) || 0);
        })
        .catch(() => {});
    };

    const handleRealtimeUnread = (e) => {
      if (typeof e?.detail?.count === "number") {
        setUnreadCount(e.detail.count);
      }
    };

    loadUnread();
    window.addEventListener("addp:unread-count", handleRealtimeUnread);
    return () => {
      cancelled = true;
      window.removeEventListener("addp:unread-count", handleRealtimeUnread);
    };
  }, [pathname, currentUser]);

  if (pathname === "/login" || !currentUser) return null;

  const userRole = currentUser?.role || "ADMIN";
  const accessibleLinks = BOTTOM_NAV_CANDIDATES.filter((item) =>
    canAccessModule(currentUser || userRole, item.key)
  ).slice(0, 4);

  return (
    <nav
      aria-label="Điều hướng chính trên di động"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-200/80 dark:border-slate-800/90 bg-white/92 dark:bg-[#0e131f]/95 backdrop-blur-xl pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.08)]"
    >
      <div className="flex items-stretch justify-around px-1">
        {accessibleLinks.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));
          const showBadge = item.key === "inbox" && unreadCount > 0;

          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`relative flex-1 min-w-[44px] min-h-[54px] py-1.5 px-1 flex flex-col items-center justify-center gap-1 transition-colors ${
                isActive
                  ? "text-[#007aff] font-semibold"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-medium"
              }`}
            >
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 inset-x-4 h-0.5 rounded-full bg-[#007aff]"
                />
              )}
              <div className="relative">
                <Icon className="w-5 h-5 shrink-0" />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#ff3b30] text-white text-[10px] font-bold flex items-center justify-center leading-none shadow-xs">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </div>
              <span className="text-[11px] leading-none truncate max-w-full">
                {item.label}
              </span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Mở thêm danh mục"
          aria-expanded={isMenuOpen}
          className={`relative flex-1 min-w-[44px] min-h-[54px] py-1.5 px-1 flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
            isMenuOpen
              ? "text-[#007aff] font-semibold"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-medium"
          }`}
        >
          <Menu className="w-5 h-5 shrink-0" />
          <span className="text-[11px] leading-none">Thêm</span>
        </button>
      </div>
    </nav>
  );
}
