"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "../components/ThemeProvider";
import {
  Sun,
  Moon,
  Lock,
  User,
  ArrowRight,
  AlertCircle,
  Loader2,
} from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 relative transition-colors duration-150">
      {/* Nút chuyển chế độ Sáng / Tối ở góc trên bên phải */}
      <div className="absolute top-5 right-5 z-20">
        <button
          type="button"
          onClick={toggleTheme}
          title={theme === "light" ? "Chuyển sang Chế độ Tối" : "Chuyển sang Chế độ Sáng"}
          className="h-10 px-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-md transition-all duration-150"
        >
          {theme === "light" ? (
            <>
              <Sun className="w-4 h-4 text-amber-500" />
              <span className="text-slate-800 font-semibold">Chế độ Sáng</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-indigo-400" />
              <span className="text-slate-200 font-medium">Chế độ Tối</span>
            </>
          )}
        </button>
      </div>

      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-8 shadow-2xl space-y-6">
        <div className="text-center space-y-3">
          {/* Logo chính thức của ADDP Pharmacy */}
          <div className="flex justify-center items-center py-1">
            <img
              src={theme === "light" ? "/addp-logo-transparent.png" : "/addp-logo-white.png"}
              alt="ADDP Pharmacy"
              className="h-14 w-auto max-w-[240px] object-contain drop-shadow-sm transition-transform hover:scale-105"
            />
          </div>
          <h1 className="text-xl font-extrabold tracking-tight text-white">
            ADDP CRM
          </h1>
          <p className="text-xs text-slate-400">
            Hệ thống quản trị hợp nhất 7 kênh • <span className="text-emerald-400 font-semibold">crm.addp.vn</span>
          </p>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-500/15 border border-rose-500/30 p-3 text-xs text-rose-300 font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-blue-400" />
              <span>Mã nhân viên (Username)</span>
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Nhập tên đăng nhập hoặc mã nhân viên"
              className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-blue-400" />
              <span>Mật khẩu</span>
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-[0.99] py-2.5 text-sm font-bold text-white shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang xác thực...</span>
              </>
            ) : (
              <>
                <span>Đăng nhập Hệ thống</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
