"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTheme } from "./ThemeProvider";
import {
  Sun,
  Moon,
  BookOpen,
  Bell,
  KeyRound,
  LogOut,
  Radio,
  X,
  Lock,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

export default function Header({ currentUser }) {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [showNotif, setShowNotif] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwdMessage, setPwdMessage] = useState({ type: "", text: "" });
  const [loadingPwd, setLoadingPwd] = useState(false);

  // Nạp dữ liệu thông báo hệ thống thực tế từ Đơn hàng & Lịch CSKH và lắng nghe SSE Stream (/api/inbox/stream)
  useEffect(() => {
    let cancelled = false;
    async function loadSystemNotifications() {
      try {
        const [ordersRes, tasksRes] = await Promise.all([
          fetch("/api/orders"),
          fetch("/api/care/tasks?filterDate=TODAY"),
        ]);
        const ordersData = ordersRes.ok ? await ordersRes.json() : null;
        const tasksData = tasksRes.ok ? await tasksRes.json() : null;

        if (cancelled) return;
        const list = [];

        if (ordersData?.ok && Array.isArray(ordersData.orders)) {
          ordersData.orders.slice(0, 2).forEach((ord) => {
            list.push({
              id: `notif_ord_${ord.id}`,
              channel: ord.channel || "Đơn hàng",
              text: `Đơn ${ord.orderCode} (${ord.customerName} - ${ord.phone}): ${(ord.finalAmount || 0).toLocaleString("vi-VN")} đ`,
              time: ord.createdAt ? new Date(ord.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "Gần đây",
              unread: true,
            });
          });
        }

        if (tasksData?.ok && Array.isArray(tasksData.tasks)) {
          tasksData.tasks.slice(0, 2).forEach((tsk) => {
            list.push({
              id: `notif_tsk_${tsk.id}`,
              channel: "Lịch CSKH 1-3-7-14-21",
              text: `${tsk.title} (${tsk.customerPhone})`,
              time: "Hôm nay",
              unread: !tsk.isCompleted,
            });
          });
        }

        setNotifications(list);
      } catch {}
    }

    const pollNotifications = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      loadSystemNotifications();
    };
    const handleVisibility = () => {
      if (!document.hidden) loadSystemNotifications();
    };

    loadSystemNotifications();
    const pollTimer = setInterval(pollNotifications, 20000);
    document.addEventListener("visibilitychange", handleVisibility);

    const handleRealtimeEvent = (e) => {
      try {
        const payload = e?.detail;
        if (!payload) return;
        if (payload.type === "NEW_MESSAGE" && payload.message) {
          const m = payload.message;
          setNotifications((prev) => [
            {
              id: `sse_msg_${m.id}`,
              channel: m.channelName || m.channel || "Tin nhắn mới",
              text: `${m.senderName}: ${m.text}`,
              time: "Vừa xong",
              unread: true,
            },
            ...prev.slice(0, 9),
          ]);
        } else if (payload.type === "NEW_ORDER" && payload.order) {
          setNotifications((prev) => [
            {
              id: `sse_ord_${payload.order.id}`,
              channel: payload.channel || "Đơn hàng mới",
              text: payload.text || `Đơn hàng mới ${payload.order.orderCode}`,
              time: "Vừa xong",
              unread: true,
            },
            ...prev.slice(0, 9),
          ]);
        } else if (payload.type === "CUSTOMER_IDENTIFIED" && payload.customer) {
          setNotifications((prev) => [
            {
              id: `sse_cust_${Date.now()}`,
              channel: "Khách hàng 360",
              text: `Đã nhận diện SĐT ${payload.phone} trong hội thoại`,
              time: "Vừa xong",
              unread: true,
            },
            ...prev.slice(0, 9),
          ]);
        }
      } catch {}
    };

    window.addEventListener("addp:realtime-event", handleRealtimeEvent);

    return () => {
      cancelled = true;
      clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("addp:realtime-event", handleRealtimeEvent);
    };
  }, []);

  const unreadCount = notifications.filter((n) => n.unread).length;

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
      <header
        suppressHydrationWarning
        className="h-15 backdrop-blur-xl bg-white/80 dark:bg-[#0e131f]/90 border-b border-slate-200/70 dark:border-slate-800/80 px-5 flex items-center justify-between gap-3 shrink-0 transition-colors duration-150 z-30 sticky top-0"
      >
        {/* Trạng thái các kênh */}
        <div className="flex items-center gap-2.5 min-w-0 overflow-hidden">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 whitespace-nowrap shrink-0 shadow-2xs">
            <Radio className="w-3.5 h-3.5 text-emerald-500 animate-pulse shrink-0" />
            <span>7 Kênh Hợp Nhất</span>
          </span>
          <span className="hidden xl:inline-block text-xs text-slate-500 dark:text-slate-400 truncate font-normal">
            Magento 2.4.8 • Fanpage FB • Zalo QR • Zalo OA • TikTok Shop • Shopee • KiotViet
          </span>
        </div>

        {/* Khu vực Hướng dẫn, Đổi Giao diện Sáng/Tối, Thông báo & Tài khoản */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Nút xem Hướng Dẫn Sử Dụng nhanh */}
          <Link
            href="/guide"
            title="Sổ tay Hướng dẫn sử dụng ADDP CRM"
            className="hidden lg:inline-flex items-center gap-1.5 h-8.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800/70 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 border border-slate-200/60 dark:border-slate-700/60 text-slate-700 dark:text-slate-200 text-xs font-medium cursor-pointer transition-colors whitespace-nowrap shrink-0 shadow-2xs"
          >
            <BookOpen className="w-3.5 h-3.5 text-[#007aff] shrink-0" />
            <span>Hướng dẫn</span>
          </Link>

          {/* Nút chuyển đổi Giao diện Sáng / Tối (Theme Toggle) */}
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === "light" ? "Chuyển sang Chế độ Tối (Dark mode)" : "Chuyển sang Chế độ Sáng (Light mode)"}
            className="h-8.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800/70 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-all duration-200 border border-slate-200/60 dark:border-slate-700/60 shadow-2xs whitespace-nowrap shrink-0 text-slate-700 dark:text-slate-200"
          >
            {theme === "light" ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="font-medium hidden sm:inline">Sáng</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="font-medium hidden sm:inline">Tối</span>
              </>
            )}
          </button>

          {/* Chuông thông báo thời gian thực */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowNotif(!showNotif)}
              aria-label="Thông báo thời gian thực"
              className="relative h-8.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800/70 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-slate-700/60 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0 shadow-2xs"
            >
              <Bell className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
              <span className="hidden md:inline">Thông báo</span>
              {unreadCount > 0 && (
                <span className="h-4.5 min-w-4.5 px-1.5 rounded-full bg-[#ff3b30] text-white text-[10px] font-bold inline-flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotif && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-700/80 shadow-2xl p-4 z-50 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-800 pb-2">
                  <span className="font-bold text-sm text-slate-900 dark:text-white">Thông báo Thời gian thực</span>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setNotifications((prev) => prev.map((item) => ({ ...item, unread: false })))
                        }
                        className="text-[11px] text-[#007aff] hover:underline cursor-pointer font-medium"
                      >
                        Đánh dấu đã đọc
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowNotif(false)}
                      aria-label="Đóng thông báo"
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      Chưa có thông báo mới.
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`p-2.5 rounded-xl border text-xs space-y-1 ${
                          n.unread
                            ? "bg-blue-50/70 dark:bg-blue-950/30 border-blue-200 dark:border-blue-500/30 text-slate-800 dark:text-slate-100"
                            : "bg-slate-50 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-800 text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between font-semibold text-[#007aff]">
                          <span>{n.channel}</span>
                          <span className="text-[11px] text-slate-400 font-normal">{n.time}</span>
                        </div>
                        <p className="leading-relaxed">{n.text}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Thông tin người đăng nhập */}
          {currentUser ? (
            <div className="flex items-center gap-2 shrink-0 pl-1.5 border-l border-slate-200/60 dark:border-slate-800/80">
              <div className="hidden sm:block text-right leading-tight whitespace-nowrap">
                <div className="text-xs font-semibold text-slate-900 dark:text-white">
                  {currentUser.name}
                </div>
                <div className="text-[10px] text-[#007aff] font-medium uppercase tracking-wide">
                  {currentUser.roleLabel || currentUser.role}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPwdMessage({ type: "", text: "" });
                  setShowPwdModal(true);
                }}
                title="Đổi mật khẩu tài khoản"
                className="h-8.5 px-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/70 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-slate-700/60 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0 shadow-2xs"
              >
                <KeyRound className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="hidden md:inline">Đổi MK</span>
              </button>
              <button
                type="button"
                onClick={handleLogout}
                title="Đăng xuất khỏi hệ thống"
                className="h-8.5 px-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0 shadow-2xs"
              >
                <LogOut className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden md:inline">Đăng xuất</span>
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="h-8.5 px-4 rounded-xl bg-[#007aff] hover:bg-[#0066d6] text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs transition-colors whitespace-nowrap shrink-0"
            >
              <span>Đăng nhập</span>
            </Link>
          )}
        </div>
      </header>

      {/* Modal Đổi mật khẩu (WBS-05) */}
      {showPwdModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl space-y-4 text-slate-100">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Lock className="w-4 h-4 text-blue-400" />
                <span>Đổi mật khẩu tài khoản ({currentUser?.code})</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowPwdModal(false)}
                aria-label="Đóng hộp thoại"
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {pwdMessage.text && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 font-medium ${
                  pwdMessage.type === "success"
                    ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300"
                    : "bg-rose-500/15 border border-rose-500/30 text-rose-300"
                }`}
              >
                {pwdMessage.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                )}
                <span>{pwdMessage.text}</span>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Mật khẩu hiện tại
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Nhập mật khẩu hiện tại..."
                  className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Mật khẩu mới (Tối thiểu 8 ký tự, gồm chữ và số)
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

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPwdModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={loadingPwd}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-semibold text-white cursor-pointer"
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
