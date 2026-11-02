"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import Header from "./Header";

export default function AppShell({ children }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";
  const [mounted, setMounted] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isLoginPage) return;
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.authenticated) {
          setCurrentUser(data.user);
        }
      })
      .catch(() => {});
  }, [pathname, isLoginPage]);

  // Chống lỗi Hydration Mismatch khi trình duyệt cài các tiện ích mở rộng can thiệp DOM (Bitdefender, PhoSEO...)
  if (!mounted) {
    return (
      <div
        suppressHydrationWarning
        className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center"
      >
        <div suppressHydrationWarning className="text-xs text-slate-400">
          Đang tải giao diện ADDP Omnichannel AI CRM...
        </div>
      </div>
    );
  }

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div suppressHydrationWarning className="min-h-screen flex bg-slate-950 text-slate-100">
      <Sidebar
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        currentUser={currentUser}
      />
      <div suppressHydrationWarning className="flex-1 flex flex-col min-w-0">
        <Header currentUser={currentUser} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
