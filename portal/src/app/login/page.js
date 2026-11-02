"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DEMO_ACCOUNTS = [
  { code: "ADMIN", label: "ADMIN (Toàn quyền hệ thống)", role: "Quản trị viên" },
  { code: "S001", label: "S001 (Trưởng nhóm Kinh doanh)", role: "Sale Leader" },
  { code: "S002", label: "S002 (Nhân viên Sale & CSKH)", role: "Sale / CSKH" },
  { code: "KHO01", label: "KHO01 (Quản lý Kho & Điều phối)", role: "Kho / Kế toán" },
];

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("ADMIN");
  const [password, setPassword] = useState("123456");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error || "Tài khoản hoặc mật khẩu không chính xác.");
        setIsLoading(false);
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Không thể kết nối tới máy chủ xác thực.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-8 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-blue-600 flex items-center justify-center font-extrabold text-2xl text-white shadow-lg">
            +
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            Hệ Thống ADDP Omnichannel AI CRM
          </h1>
          <p className="text-xs text-slate-400">
            Đăng nhập cổng quản trị hợp nhất 7 kênh • <span className="text-emerald-400">crm.addp.vn</span>
          </p>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-500/15 border border-rose-500/30 p-3 text-xs text-rose-300 font-medium">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Mã nhân viên (Username)
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="VD: ADMIN, S001, S002, KHO01"
              className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Mật khẩu
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 py-2.5 text-sm font-bold text-white shadow transition-colors cursor-pointer"
          >
            {isLoading ? "Đang xác thực..." : "Đăng nhập Hệ thống"}
          </button>
        </form>

        {/* Chọn nhanh tài khoản theo Vai trò RBAC để kiểm thử */}
        <div className="pt-4 border-t border-slate-800 space-y-2">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Chọn nhanh tài khoản kiểm thử phân quyền (MK: 123456)
          </div>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.code}
                type="button"
                onClick={() => {
                  setUsername(acc.code);
                  setPassword("123456");
                }}
                className={`text-left p-2 rounded-xl border text-xs transition-colors cursor-pointer ${
                  username === acc.code
                    ? "bg-blue-600/20 border-blue-500 text-white"
                    : "bg-slate-800/60 border-slate-800 text-slate-300 hover:bg-slate-800"
                }`}
              >
                <div className="font-bold">{acc.code}</div>
                <div className="text-[10px] text-slate-400 truncate">{acc.role}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
