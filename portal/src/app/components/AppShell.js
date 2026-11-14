"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Sidebar from "./Sidebar";
import Header from "./Header";
import GlobalAddOrderModal from "./GlobalAddOrderModal";
import { canAccessModule } from "@/lib/authConstants";
import { ShieldAlert, ArrowLeft } from "lucide-react";

function resolveModuleKeyFromPathname(pathname) {
  if (!pathname || pathname === "/") return "dashboard";
  if (pathname.startsWith("/inbox")) return "inbox";
  if (pathname.startsWith("/customers")) return "customers";
  if (pathname.startsWith("/work-tracking")) return "work-tracking";
  if (pathname.startsWith("/ai-bots")) return "ai-bots";
  if (pathname.startsWith("/broadcast")) return "broadcast";
  if (pathname.startsWith("/orders")) return "orders";
  if (pathname.startsWith("/inventory")) return "inventory";
  if (pathname.startsWith("/channels")) return "channels";
  if (pathname.startsWith("/reports")) return "reports";
  if (pathname.startsWith("/settings/tags")) return "tags";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/guide")) return "guide";
  return "dashboard";
}

export default function AppShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/login";
  const isInboxPage = pathname?.startsWith("/inbox");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [showGlobalOrderModal, setShowGlobalOrderModal] = useState(false);

  useEffect(() => {
    if (isLoginPage) {
      setAuthChecked(true);
      return;
    }
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (data?.authenticated && data?.user) {
          setCurrentUser(data.user);
          setAuthChecked(true);
        } else {
          setCurrentUser(null);
          setAuthChecked(false);
          router.replace("/login");
        }
      })
      .catch(() => {
        if (!cancelled) {
          router.replace("/login");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, isLoginPage, router]);

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (!authChecked || !currentUser) {
    return (
      <div suppressHydrationWarning className="h-screen w-screen flex items-center justify-center bg-[#f5f5f7] dark:bg-[#0b0f19] text-slate-700 dark:text-slate-300 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="h-4 w-4 border-2 border-[#007aff] border-t-transparent rounded-full animate-spin" />
          <span>Đang kiểm tra phiên đăng nhập ADDP CRM...</span>
        </div>
      </div>
    );
  }

  const activeModuleKey = resolveModuleKeyFromPathname(pathname);
  const hasPermission = canAccessModule(currentUser, activeModuleKey);

  return (
    <div suppressHydrationWarning className="h-screen overflow-hidden flex bg-[#f5f5f7] dark:bg-[#0b0f19] text-slate-900 dark:text-slate-100 antialiased">
      <Sidebar
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        currentUser={currentUser}
      />
      <div suppressHydrationWarning className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <div className="flex items-center shrink-0">
          <div className="flex-1 min-w-0">
            <Header currentUser={currentUser} />
          </div>
          <div className="h-15 backdrop-blur-xl bg-white/80 dark:bg-[#0e131f]/90 border-b border-slate-200/70 dark:border-slate-800/80 pr-4 flex items-center shrink-0 z-30 sticky top-0">
            <button
              type="button"
              onClick={() => setShowGlobalOrderModal(true)}
              className="h-8.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shadow-sm shadow-emerald-600/25"
            >
              <span>🛒 Lên đơn nhanh</span>
            </button>
          </div>
        </div>
        <main
          suppressHydrationWarning
          className={`flex-1 min-h-0 ${
            isInboxPage ? "overflow-hidden p-2.5 sm:p-3" : "overflow-y-auto p-4 sm:p-6"
          }`}
        >
          {hasPermission ? (
            children
          ) : (
            <div className="h-full flex items-center justify-center p-6">
              <div className="max-w-md w-full rounded-2xl border border-rose-500/30 bg-slate-900/90 p-6 text-center space-y-4 shadow-xl">
                <div className="h-12 w-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-base font-bold text-white">
                    Từ chối truy cập phân hệ (RBAC Security)
                  </h2>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Tài khoản <strong>{currentUser.name} ({currentUser.code})</strong> với vai trò{" "}
                    <strong className="text-rose-400">{currentUser.roleLabel || currentUser.role}</strong>{" "}
                    không được cấp quyền truy cập phân hệ <code>{activeModuleKey}</code> theo Điều 5 - AGENTS.md.
                  </p>
                </div>
                <Link
                  href="/"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-bold text-white transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Quay về Trang Tổng Quan</span>
                </Link>
              </div>
            </div>
          )}
        </main>
      </div>
      <GlobalAddOrderModal
        isOpen={showGlobalOrderModal}
        onClose={() => setShowGlobalOrderModal(false)}
        onSuccess={() => {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("addp:order-created"));
          }
        }}
      />
    </div>
  );
}
