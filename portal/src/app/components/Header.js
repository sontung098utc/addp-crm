"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTheme } from "./ThemeProvider";

const SAMPLE_NOTIFICATIONS = [
  {
    id: 1,
    channel: "Zalo Cá nhân",
    text: "Khách Nguyễn Văn Hùng (0912345678) hỏi tư vấn Combo 3 Mát Gan + 1 Glucare",
    time: "Vừa xong",
    unread: true,
  },
  {
    id: 2,
    channel: "KiotViet Webhook",
    text: "Đơn KV-HD8821 đã Giao thành công -> Đã tự tạo 7 mốc nhắc lịch chăm sóc",
    time: "5 phút trước",
    unread: true,
  },
  {
    id: 3,
    channel: "Magento 2.4.8",
    text: "Khách điền CustomForm tư vấn tiểu đường tuýp 2 trên ADDP.vn",
    time: "12 phút trước",
    unread: false,
  },
];

export default function Header({ currentUser }) {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [showNotif, setShowNotif] = useState(false);
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwdMessage, setPwdMessage] = useState({ type: "", text: "" });
  const [loadingPwd, setLoadingPwd] = useState(false);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setLoadingPwd(true);
    setPwdMessage({ type: "", text: "" });
    try {
      const res = await fetch("/api/staff/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setPwdMessage({ type: "error", text: data.error || "Đổi mật khẩu thất bại." });
      } else {
        setPwdMessage({ type: "success", text: data.message });
        setCurrentPassword("");
        setNewPassword("");
      }
    } catch {
      setPwdMessage({ type: "error", text: "Lỗi kết nối máy chủ." });
    } finally {
      setLoadingPwd(false);
    }
  };

  return (
    <>
      <header suppressHydrationWarning className="h-16 bg-slate-900/90 border-b border-slate-800 px-6 flex items-center justify-between gap-4 shrink-0">
        {/* Trạng thái các kênh */}
        <div className="flex items-center gap-3 overflow-x-auto">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            ● 7 Kênh Hợp Nhất
          </span>
          <span className="hidden md:inline-block text-xs text-slate-400">
            Magento 2.4.8 • Fanpage FB • Zalo QR • Zalo OA • TikTok Shop • Shopee • KiotViet
          </span>
        </div>

        {/* Khu vực Hướng dẫn, Đổi Giao diện Sáng/Tối, Thông báo & Tài khoản */}
        <div className="flex items-center gap-2.5">
          {/* Nút xem Hướng Dẫn Sử Dụng nhanh */}
          <Link
            href="/guide"
            title="Sổ tay Hướng dẫn sử dụng ADDP CRM"
            className="hidden lg:flex items-center gap-1.5 h-9 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium cursor-pointer transition-colors"
          >
            <span>📖</span>
            <span>Hướng dẫn</span>
          </Link>

          {/* Nút chuyển đổi Giao diện Sáng / Tối (Theme Toggle) */}
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === "light" ? "Chuyển sang Chế độ Tối (Dark mode)" : "Chuyển sang Chế độ Sáng (Light mode)"}
            className="h-9 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold flex items-center gap-2 cursor-pointer transition-all duration-200 border border-slate-700/60 shadow-xs"
          >
            {theme === "light" ? (
              <>
                <span className="text-amber-500 text-sm">☀️</span>
                <span className="text-slate-800 font-semibold hidden sm:inline">Chế độ Sáng</span>
              </>
            ) : (
              <>
                <span className="text-indigo-400 text-sm">🌙</span>
                <span className="text-slate-200 font-medium hidden sm:inline">Chế độ Tối</span>
              </>
            )}
          </button>

          {/* Chuông thông báo thời gian thực */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowNotif(!showNotif)}
              className="relative h-9 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-2 cursor-pointer"
            >
              <span>🔔 Thông báo</span>
              <span className="h-5 min-w-5 px-1 rounded-full bg-rose-500 text-white text-[11px] font-bold flex items-center justify-center">
                2
              </span>
            </button>

            {showNotif && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-4 z-50 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-bold text-sm text-white">Thông báo Thời gian thực</span>
                  <button
                    type="button"
                    onClick={() => setShowNotif(false)}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    Đóng ✕
                  </button>
                </div>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {SAMPLE_NOTIFICATIONS.map((n) => (
                    <div
                      key={n.id}
                      className={`p-2.5 rounded-xl border text-xs space-y-1 ${
                        n.unread
                          ? "bg-blue-950/40 border-blue-500/30 text-slate-100"
                          : "bg-slate-800/40 border-slate-800 text-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between font-semibold text-blue-400">
                        <span>{n.channel}</span>
                        <span className="text-[11px] text-slate-400">{n.time}</span>
                      </div>
                      <p className="leading-relaxed">{n.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Thông tin người đăng nhập */}
          {currentUser ? (
            <div className="flex items-center gap-2">
              <div className="hidden sm:block text-right">
                <div className="text-xs font-bold text-white">
                  {currentUser.name} ({currentUser.code})
                </div>
                <div className="text-[11px] text-blue-400 font-medium">
                  {currentUser.roleLabel || currentUser.role}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPwdMessage({ type: "", text: "" });
                  setShowPwdModal(true);
                }}
                className="h-9 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium cursor-pointer"
              >
                🔑 Đổi MK
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="h-9 px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-medium cursor-pointer"
              >
                Đăng xuất
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center"
            >
              Đăng nhập
            </Link>
          )}
        </div>
      </header>

      {/* Modal Đổi mật khẩu (WBS-05) */}
      {showPwdModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl space-y-4 text-slate-100">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">🔑 Đổi mật khẩu tài khoản ({currentUser?.code})</h3>
              <button
                type="button"
                onClick={() => setShowPwdModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {pwdMessage.text && (
              <div
                className={`p-3 rounded-xl text-xs font-medium ${
                  pwdMessage.type === "success"
                    ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                    : "bg-rose-500/15 text-rose-300 border border-rose-500/30"
                }`}
              >
                {pwdMessage.text}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Mật khẩu hiện tại
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Nhập mật khẩu đang dùng (mặc định: 123456)"
                  className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Mật khẩu mới (tối thiểu 6 ký tự)
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nhập mật khẩu mới"
                  className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPwdModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={loadingPwd}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white cursor-pointer"
                >
                  {loadingPwd ? "Đang lưu..." : "Lưu mật khẩu mới"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
