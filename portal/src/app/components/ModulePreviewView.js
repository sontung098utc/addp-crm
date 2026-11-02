"use client";

import Link from "next/link";

export default function ModulePreviewView({
  moduleKey,
  title,
  wbsBadge,
  subtitle,
}) {
  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-blue-500/15 border border-blue-500/30 px-2.5 py-0.5 text-xs font-bold text-blue-400">
              {wbsBadge}
            </span>
            <h1 className="text-lg font-bold text-white">{title}</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/channels"
            className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 transition shadow"
          >
            🔌 Kết Nối Kênh Bán Hàng
          </Link>
          <Link
            href="/settings"
            className="rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3.5 py-2 transition"
          >
            ⚙️ Phân Quyền Nhân Sự
          </Link>
        </div>
      </div>

      {/* Empty State Clean - Tuân thủ Điều 11 AGENTS.md */}
      <section className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center space-y-4">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-2xl">
          {moduleKey === "inbox" && "💬"}
          {moduleKey === "customers" && "👥"}
          {moduleKey === "work-tracking" && "📅"}
          {moduleKey === "broadcast" && "📢"}
          {moduleKey === "orders" && "📦"}
          {moduleKey === "reports" && "📈"}
          {moduleKey === "channels" && "🔌"}
        </div>

        <div className="max-w-md mx-auto space-y-2">
          <h3 className="text-base font-bold text-white">Chưa Có Dữ Liệu Thực Tế</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Hệ thống tuân thủ nghiêm ngặt{" "}
            <strong className="text-amber-400">Điều 11 — AGENTS.md</strong> (Nghiêm cấm hiển thị số
            liệu ảo / số liệu giả lập không xác thực).
          </p>
          <p className="text-xs text-slate-500 leading-relaxed">
            Dữ liệu hội thoại, đơn hàng và khách hàng sẽ tự động đồng bộ theo thời gian thực ngay khi
            bạn kết nối các tài khoản thuộc 7 nền tảng (Website Magento 2.4.8, Fanpage Facebook, Zalo
            Cá Nhân QR, Zalo OA, TikTok Shop, Shopee, KiotViet) ở <strong>Giai đoạn 2</strong>.
          </p>
        </div>

        <div className="pt-2 flex justify-center gap-3">
          <Link
            href="/channels"
            className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2.5 transition shadow"
          >
            + Kết Nối Tài Khoản Kênh Mới
          </Link>
          <Link
            href="/settings"
            className="rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold px-4 py-2.5 transition"
          >
            Kiểm Tra Phân Quyền Kênh
          </Link>
        </div>
      </section>

      {/* Quy trình đồng bộ dữ liệu thật */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-1">
          <div className="font-bold text-blue-400">1. Kênh Chat & Tin Nhắn</div>
          <div className="text-slate-400">
            Quét mã QR Zalo cá nhân trên Server hoặc nhập Token Fanpage / OA để nhận tin nhắn và bình luận trực tiếp.
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-1">
          <div className="font-bold text-emerald-400">2. Kênh Sàn & Đơn Hàng</div>
          <div className="text-slate-400">
            Đăng nhập OAuth2 TikTok Shop, Shopee Open API hoặc Webhook KiotViet/Magento để kéo đơn hàng và khách hàng thật.
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-1">
          <div className="font-bold text-purple-400">3. Hồ Sơ Khách Hàng 360</div>
          <div className="text-slate-400">
            Tự động gộp dữ liệu từ 7 nền tảng về 1 hồ sơ duy nhất dựa trên khóa số điện thoại chuẩn 10 số (normalizePhone).
          </div>
        </div>
      </div>
    </div>
  );
}
