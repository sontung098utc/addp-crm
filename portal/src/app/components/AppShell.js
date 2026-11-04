"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import Header from "./Header";

export default function AppShell({ children }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [currentUser, setCurrentUser] = useState({
    id: "staff_admin",
    name: "Quản Trị Viên ADDP",
    code: "ADMIN",
    role: "ADMIN",
    roleLabel: "Quản trị viên (Toàn quyền)",
  });

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
        <main suppressHydrationWarning className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
