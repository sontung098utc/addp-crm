"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import Header from "./Header";

export default function AppShell({ children }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

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
    <div className="min-h-screen flex bg-slate-950 text-slate-100">
      <Sidebar
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        currentUser={currentUser}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Header currentUser={currentUser} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
