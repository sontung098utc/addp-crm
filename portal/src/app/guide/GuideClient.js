"use client";

import { useState } from "react";
import Link from "next/link";
import { useTheme } from "../components/ThemeProvider";

/**
 * ADDP Omnichannel AI CRM — Sổ Tay Hướng Dẫn Sử Dụng & Vận Hành Toàn Diện
 * Tài liệu đào tạo và hướng dẫn thao tác thực tế dành cho:
 * - Nhân viên Sale / Telesale
 * - Nhân viên Chăm Sóc Khách Hàng (CSKH)
 * - Thủ Kho & Nhân viên Đóng gói
 * - Kế toán & Đối soát Doanh thu
 * - Trưởng nhóm (Leader) & Quản trị viên (Admin)
 */

const GUIDE_TABS = [
  { key: "overview", label: "🌟 Tổng Quan Hệ Thống", icon: "🌐" },
  { key: "login", label: "🔑 Đăng Nhập & Phân Quyền", icon: "👤" },
  { key: "channels", label: "🔗 Kết Nối & Cấu Hình 7 Kênh", icon: "🔌" },
  { key: "inbox-ai", label: "💬 Hộp Thư Đa Kênh & AI Soạn", icon: "🤖" },
  { key: "work-tracking", label: "📋 Lộ Trình CSKH 1-3-7-14-21", icon: "🩺" },
  { key: "broadcast", label: "📢 Gửi Tin Hàng Loạt & Anti-Ban", icon: "⚡" },
  { key: "inventory-bi", label: "📦 Kho Combo & Đối Soát BI", icon: "📈" },
];

export default function GuideClient() {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState("overview");
  const [copiedKey, setCopiedKey] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Tiêu đề trang & Thanh công cụ */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <img
              src={theme === "light" ? "/addp-logo-transparent.png" : "/addp-logo-white.png"}
              alt="ADDP Pharmacy"
              className="h-8 w-auto object-contain"
            />
            <span className="rounded bg-blue-500/20 text-blue-400 text-[10px] font-semibold px-2 py-0.5 border border-blue-500/30">
              Sổ Tay Vận Hành 2026
            </span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-wide">
            Cẩm Nang Hướng Dẫn Sử Dụng & Vận Hành ADDP CRM
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Quy trình chuẩn hóa đăng nhập, kết nối đa kênh, tư vấn AI Dược sĩ, chăm sóc đường huyết định kỳ và quản lý kho vận trên ADDP CRM (<code>https://crm.addp.vn</code>).
          </p>
        </div>

        {/* Nút tác vụ nhanh */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 transition border border-slate-700"
          >
            <span>🖨️</span>
            <span>In Sổ Tay</span>
          </button>
          <Link
            href="/inbox"
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3.5 py-2 transition shadow shadow-blue-600/20"
          >
            <span>💬</span>
            <span>Vào Hộp Thư Làm Việc</span>
          </Link>
        </div>
      </div>

      {/* Thanh điều hướng Tab chuyên đề */}
      <div className="flex border-b border-slate-800 gap-1 overflow-x-auto pb-1">
        {GUIDE_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-1.5 pb-2.5 px-3.5 text-xs font-semibold transition border-b-2 whitespace-nowrap ${
              activeTab === t.key
                ? "border-blue-500 text-blue-400 bg-blue-500/10 rounded-t-xl"
                : "border-transparent text-slate-400 hover:text-white hover:bg-slate-800/40 rounded-t-xl"
            }`}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: TỔNG QUAN HỆ THỐNG                                                */}
      {/* ========================================================================= */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>🌟</span> Giới Thiệu Hệ Thống ADDP CRM
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Hệ thống <strong>ADDP CRM</strong> (triển khai tại địa chỉ nội bộ <code>https://crm.addp.vn</code>) là giải pháp quản trị khách hàng và thương mại đa kênh toàn diện của Công ty Cổ phần Dược Phẩm ADDP. Nền tảng hợp nhất toàn bộ dữ liệu từ <strong>7 kênh bán hàng và giao tiếp</strong>:
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 pt-2 text-center">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-xl block mb-1">💬</span>
                <div className="font-bold text-xs text-white">Zalo Cá Nhân</div>
                <div className="text-[10px] text-blue-400">Đăng nhập QR</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-xl block mb-1">📢</span>
                <div className="font-bold text-xs text-white">Zalo OA</div>
                <div className="text-[10px] text-blue-300">Open API & ZNS</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-xl block mb-1">📘</span>
                <div className="font-bold text-xs text-white">Fanpage FB</div>
                <div className="text-[10px] text-indigo-400">Tự ẩn SĐT</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-xl block mb-1">🎵</span>
                <div className="font-bold text-xs text-white">TikTok Shop</div>
                <div className="text-[10px] text-rose-400">Đơn & Ads GMV</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-xl block mb-1">🧡</span>
                <div className="font-bold text-xs text-white">Shopee</div>
                <div className="text-[10px] text-amber-400">Đồng bộ đa Shop</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-xl block mb-1">🌐</span>
                <div className="font-bold text-xs text-white">Magento 2.4.8</div>
                <div className="text-[10px] text-purple-400">ADDP.vn & Lead</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-xl block mb-1">🏪</span>
                <div className="font-bold text-xs text-white">KiotViet POS</div>
                <div className="text-[10px] text-emerald-400">Bán lẻ quầy</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
              <div className="p-4 rounded-xl bg-blue-950/20 border border-blue-900/40">
                <h4 className="font-bold text-xs text-blue-300 mb-1 flex items-center gap-1.5">
                  <span>🎯</span> Định Danh Khách Hàng 360
                </h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Gộp tất cả tin nhắn, bình luận và đơn hàng từ 7 nền tảng về đúng <strong>1 hồ sơ duy nhất</strong> theo Số Điện Thoại chuẩn Việt Nam 10 chữ số (Điều 3 AGENTS.md).
                </p>
              </div>

              <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-900/40">
                <h4 className="font-bold text-xs text-purple-300 mb-1 flex items-center gap-1.5">
                  <span>🤖</span> Trợ Lý AI Dược Sĩ Thông Minh
                </h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Tích hợp Kho Tri Thức Second Brain Wiki chuyên sâu về Glucare Plus, hỗ trợ 3 chế độ trực kênh và Bộ phán xử y tế (Judge) bảo đảm an toàn tư vấn 100%.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-900/40">
                <h4 className="font-bold text-xs text-emerald-300 mb-1 flex items-center gap-1.5">
                  <span>📦</span> Bóc Tách Combo & Loss Engine
                </h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Tự động quy đổi các mã combo khuyến mại ra sản phẩm lẻ để trừ tồn kho chính xác, hạch toán giá vốn COGS và tính lãi/lỗ thực tế sau trừ phí sàn.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-900/40">
                <h4 className="font-bold text-xs text-amber-300 mb-1 flex items-center gap-1.5">
                  <span>☀️/🌙</span> Chế Độ Sáng / Tối (Theme Switch)
                </h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Chuyển đổi 1-click giữa Giao diện Sáng trang nhã và Giao diện Tối chuyên nghiệp trên thanh Header & màn hình Đăng nhập, đồng bộ logo ADDP Pharmacy theo theme.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ĐĂNG NHẬP & PHÂN QUYỀN (RBAC)                                      */}
      {/* ========================================================================= */}
      {activeTab === "login" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>🔑</span> Hướng Dẫn Đăng Nhập & Bảng Tài Khoản Theo Vai Trò
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Mỗi nhân sự trong công ty được cấp một tài khoản với quyền hạn (Role) và phạm vi dữ liệu được kiểm soát nghiêm ngặt theo <strong>Điều 5 AGENTS.md</strong>:
            </p>

            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="p-3">Họ Tên / Vị Trí</th>
                    <th className="p-3">Tài Khoản (Username)</th>
                    <th className="p-3">Mật Khẩu Mặc Định</th>
                    <th className="p-3">Vai Trò (Role)</th>
                    <th className="p-3">Quyền Hạn & Dữ Liệu Truy Cập</th>
                    <th className="p-3 text-center">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  <tr className="hover:bg-slate-800/30 transition">
                    <td className="p-3 font-bold text-white">Quản Trị Viên Tối Cao</td>
                    <td className="p-3 font-mono text-cyan-400 font-semibold">admin</td>
                    <td className="p-3 font-mono text-amber-300 font-semibold">admin123</td>
                    <td className="p-3"><span className="rounded bg-rose-500/20 text-rose-300 px-2 py-0.5 text-[10px] font-bold border border-rose-500/30">ADMIN</span></td>
                    <td className="p-3 text-slate-300">Xem và thao tác toàn bộ hệ thống, báo cáo tài chính lãi/lỗ, phân quyền tài khoản.</td>
                    <td className="p-3 text-center">
                      <button onClick={() => handleCopy("admin|admin123", "admin")} className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold">
                        {copiedKey === "admin" ? "✓ Đã chép" : "Chép TK"}
                      </button>
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-800/30 transition">
                    <td className="p-3 font-bold text-white">Nguyễn Văn Quyết (Leader)</td>
                    <td className="p-3 font-mono text-cyan-400 font-semibold">sale_lead</td>
                    <td className="p-3 font-mono text-amber-300 font-semibold">lead123</td>
                    <td className="p-3"><span className="rounded bg-purple-500/20 text-purple-300 px-2 py-0.5 text-[10px] font-bold border border-purple-500/30">SALE_LEADER</span></td>
                    <td className="p-3 text-slate-300">Xem toàn bộ hội thoại và đơn hàng của nhóm Sale, chia lead, giám sát KPI.</td>
                    <td className="p-3 text-center">
                      <button onClick={() => handleCopy("sale_lead|lead123", "lead")} className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold">
                        {copiedKey === "lead" ? "✓ Đã chép" : "Chép TK"}
                      </button>
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-800/30 transition">
                    <td className="p-3 font-bold text-white">Trần Thu Hà (Sale chính)</td>
                    <td className="p-3 font-mono text-cyan-400 font-semibold">sale_ha</td>
                    <td className="p-3 font-mono text-amber-300 font-semibold">sale123</td>
                    <td className="p-3"><span className="rounded bg-blue-500/20 text-blue-300 px-2 py-0.5 text-[10px] font-bold border border-blue-500/30">SALE</span></td>
                    <td className="p-3 text-slate-300">Nhận tin nhắn các nick Zalo được phân công, chỉ xem khách hàng và đơn hàng do mình tạo.</td>
                    <td className="p-3 text-center">
                      <button onClick={() => handleCopy("sale_ha|sale123", "sale")} className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold">
                        {copiedKey === "sale" ? "✓ Đã chép" : "Chép TK"}
                      </button>
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-800/30 transition">
                    <td className="p-3 font-bold text-white">Lê Thị Mai (Chăm sóc KH)</td>
                    <td className="p-3 font-mono text-cyan-400 font-semibold">cskh_mai</td>
                    <td className="p-3 font-mono text-amber-300 font-semibold">cskh123</td>
                    <td className="p-3"><span className="rounded bg-teal-500/20 text-teal-300 px-2 py-0.5 text-[10px] font-bold border border-teal-500/30">CSKH</span></td>
                    <td className="p-3 text-slate-300">Xử lý bảng nhắc việc chăm sóc Ngày 1-3-7-14-21, ghi nhận chỉ số đường huyết sau dùng.</td>
                    <td className="p-3 text-center">
                      <button onClick={() => handleCopy("cskh_mai|cskh123", "cskh")} className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold">
                        {copiedKey === "cskh" ? "✓ Đã chép" : "Chép TK"}
                      </button>
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-800/30 transition">
                    <td className="p-3 font-bold text-white">Phạm Văn Trường (Thủ kho)</td>
                    <td className="p-3 font-mono text-cyan-400 font-semibold">kho_truong</td>
                    <td className="p-3 font-mono text-amber-300 font-semibold">kho123</td>
                    <td className="p-3"><span className="rounded bg-amber-500/20 text-amber-300 px-2 py-0.5 text-[10px] font-bold border border-amber-500/30">KHO</span></td>
                    <td className="p-3 text-slate-300">Quản lý đóng sẵn, xuất nhập tồn, tách công thức combo. Không xem thông tin chat riêng của khách.</td>
                    <td className="p-3 text-center">
                      <button onClick={() => handleCopy("kho_truong|kho123", "kho")} className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold">
                        {copiedKey === "kho" ? "✓ Đã chép" : "Chép TK"}
                      </button>
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-800/30 transition">
                    <td className="p-3 font-bold text-white">Hoàng Thị Lan (Kế toán)</td>
                    <td className="p-3 font-mono text-cyan-400 font-semibold">ketoan_lan</td>
                    <td className="p-3 font-mono text-amber-300 font-semibold">ketoan123</td>
                    <td className="p-3"><span className="rounded bg-emerald-500/20 text-emerald-300 px-2 py-0.5 text-[10px] font-bold border border-emerald-500/30">KE_TOAN</span></td>
                    <td className="p-3 text-slate-300">Đối soát doanh thu, giá vốn, phí sàn, hoàn hủy và xuất file Excel Thống kê Thuế VAT 8%.</td>
                    <td className="p-3 text-center">
                      <button onClick={() => handleCopy("ketoan_lan|ketoan123", "ketoan")} className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold">
                        {copiedKey === "ketoan" ? "✓ Đã chép" : "Chép TK"}
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-900/40 text-xs text-amber-200/90 leading-relaxed">
              ⚠️ <strong>Lưu ý bảo mật:</strong> Mọi nhân sự sau khi đăng nhập lần đầu tiên phải vào mục <code>Cài đặt tài khoản</code> để đổi mật khẩu cá nhân. Tuyệt đối không chia sẻ tài khoản cho người ngoài công ty.
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: KẾT NỐI & CẤU HÌNH 7 KÊNH (CHANNELS HUB)                           */}
      {/* ========================================================================= */}
      {activeTab === "channels" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl space-y-5">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>🔌</span> Quy Trình Kết Nối & Cấu Hình 7 Kênh Bán Hàng
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Truy cập menu <strong>Kết nối 7 Kênh (`/channels`)</strong> để xem danh sách tài khoản đã kích hoạt hoặc thêm kết nối mới:
            </p>

            <div className="space-y-4">
              {/* Kênh 1: Zalo Cá Nhân */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-blue-400 flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-blue-600 text-[10px] text-white font-bold">Z</span>
                    1. Zalo Cá Nhân (Đăng Nhập Nhiều Nick Bằng QR Code)
                  </h4>
                  <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded border border-blue-500/30">WBS-13 & 14</span>
                </div>
                <ol className="list-decimal list-inside text-xs text-slate-300 space-y-1 pl-2">
                  <li>Vào <strong>Kết nối 7 Kênh</strong> $\rightarrow$ chọn tab <strong>Zalo Cá Nhân</strong> $\rightarrow$ nhấn <strong>+ Thêm Tài Khoản Zalo Mới</strong>.</li>
                  <li>Mở ứng dụng Zalo trên điện thoại của nhân viên Sale $\rightarrow$ chọn tính năng <strong>Quét mã QR</strong>.</li>
                  <li>Sau khi quét, trên điện thoại bấm <strong>Đăng nhập trên thiết bị mới</strong>.</li>
                  <li>Hệ thống lưu trữ phiên an toàn (Session Hash) và tự động đồng bộ danh bạ, tin nhắn về Hộp Thư Đa Kênh.</li>
                </ol>
                <div className="text-[11px] text-emerald-400 bg-emerald-950/20 p-2.5 rounded-lg border border-emerald-900/30">
                  🛡️ <strong>Nguyên tắc chống khóa Zalo (Điều 4 AGENTS.md):</strong> Mọi tin nhắn chủ động từ CRM đều được hệ thống tự động giãn cách ngẫu nhiên 45 – 120 giây và giới hạn định mức 70 tin/ngày/nick.
                </div>
              </div>

              {/* Kênh 2: Fanpage Facebook */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-indigo-400 flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-indigo-600 text-[10px] text-white font-bold">f</span>
                    2. Fanpage Facebook Messenger & Webhook Meta
                  </h4>
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30">WBS-16 & 17</span>
                </div>
                <div className="text-xs text-slate-300 space-y-1.5 pl-2">
                  <p>Truy cập <code>developers.facebook.com</code> $\rightarrow$ Ứng dụng của công ty $\rightarrow$ Mục <strong>Webhooks</strong> $\rightarrow$ Chọn <strong>Page</strong>:</p>
                  <div className="p-2.5 rounded bg-slate-900 border border-slate-800 font-mono text-[11px] text-slate-200 flex items-center justify-between">
                    <span>URL gọi lại (Callback): <strong>https://crm.addp.vn/api/channels/facebook/webhook</strong></span>
                    <button onClick={() => handleCopy("https://crm.addp.vn/api/channels/facebook/webhook", "fb_url")} className="text-blue-400 hover:text-white">
                      {copiedKey === "fb_url" ? "✓ Đã chép" : "Chép"}
                    </button>
                  </div>
                  <div className="p-2.5 rounded bg-slate-900 border border-slate-800 font-mono text-[11px] text-slate-200 flex items-center justify-between">
                    <span>Mã xác minh (Verify Token): <strong>ADDP_FB_VERIFY_TOKEN_2026</strong></span>
                    <button onClick={() => handleCopy("ADDP_FB_VERIFY_TOKEN_2026", "fb_token")} className="text-blue-400 hover:text-white">
                      {copiedKey === "fb_token" ? "✓ Đã chép" : "Chép"}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">Đăng ký các trường: <code>messages</code>, <code>messaging_postbacks</code>, <code>feed</code> (để tự động ẩn số điện thoại bình luận).</p>
                </div>
              </div>

              {/* Kênh 3: TikTok Shop & Shopee */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-rose-400 flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-rose-600 text-[10px] text-white font-bold">TT</span>
                    3. TikTok Shop & Shopee (Đồng Bộ Đa Shop)
                  </h4>
                  <span className="text-[10px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded border border-rose-500/30">WBS-18 & 19</span>
                </div>
                <p className="text-xs text-slate-300 pl-2">
                  Bấm nút <strong>+ Kết Nối Shop Mới</strong> $\rightarrow$ Điền <strong>App Key</strong>, <strong>App Secret</strong> và <strong>Shop ID</strong> được cấp từ Cổng đối tác TikTok / Shopee Open Platform $\rightarrow$ Bấm <strong>Ủy quyền OAuth2</strong>. Hệ thống tự động kéo đơn hàng mới và doanh thu sau khi hoàn tất.
                </p>
              </div>

              {/* Kênh 4: Website Magento 2.4.8 (ADDP.vn) */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-purple-400 flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-purple-600 text-[10px] text-white font-bold">M</span>
                    4. Website Magento 2.4.8 (ADDP.vn) & Form Thu Thập Lead
                  </h4>
                  <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded border border-purple-500/30">WBS-20 & 37</span>
                </div>
                <div className="text-xs text-slate-300 space-y-1.5 pl-2">
                  <p>Mọi đơn đặt hàng, giỏ hàng bỏ quên và form tư vấn từ module <code>Addp_CustomForm</code> trên website ADDP.vn được gửi bất đồng bộ về endpoint:</p>
                  <div className="p-2.5 rounded bg-slate-900 border border-slate-800 font-mono text-[11px] text-purple-300 flex items-center justify-between">
                    <span>POST <strong>https://crm.addp.vn/api/webhooks/magento</strong></span>
                    <button onClick={() => handleCopy("https://crm.addp.vn/api/webhooks/magento", "magento_url")} className="text-blue-400 hover:text-white">
                      {copiedKey === "magento_url" ? "✓ Đã chép" : "Chép"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: HỘP THƯ ĐA KÊNH & AI SOẠN                                         */}
      {/* ========================================================================= */}
      {activeTab === "inbox-ai" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl space-y-5">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>💬</span> Hướng Dẫn Sử Dụng Hộp Thư Hợp Nhất 3 Cột & Trợ Lý AI
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Truy cập menu <strong>Hộp thư Đa kênh (`/inbox`)</strong> để tương tác trực tiếp với khách hàng từ tất cả các sàn và mạng xã hội trên cùng 1 màn hình:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Cột 1 */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <h4 className="font-bold text-xs text-blue-400 flex items-center gap-1.5">
                  <span>📱</span> CỘT 1: Danh Sách Hội Thoại
                </h4>
                <ul className="text-xs text-slate-300 space-y-1.5">
                  <li>• <strong>Tìm kiếm nhanh:</strong> Gõ Tên khách, Số điện thoại hoặc ID để định vị cuộc trò chuyện.</li>
                  <li>• <strong>Bộ lọc Kênh:</strong> Lọc riêng Zalo cá nhân, Zalo OA hoặc Facebook.</li>
                  <li>• <strong>Bộ lọc Trạng thái:</strong>
                    <div className="mt-1 space-y-0.5 text-[11px] pl-2">
                      <div>🟡 <em>Cần người hỗ trợ:</em> Khách hỏi câu khó hoặc khiếu nại.</div>
                      <div>🟢 <em>AI đang trực:</em> Khách đang được AI tư vấn tự động.</div>
                      <div>🔴 <em>Chưa đọc:</em> Tin nhắn mới từ khách chưa được mở.</div>
                    </div>
                  </li>
                </ul>
              </div>

              {/* Cột 2 */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <h4 className="font-bold text-xs text-purple-400 flex items-center gap-1.5">
                  <span>✨</span> CỘT 2: Khung Chat & Nút AI Soạn
                </h4>
                <ul className="text-xs text-slate-300 space-y-1.5">
                  <li>• <strong>Menu Trực Kênh (Top phải):</strong>
                    <div className="mt-1 space-y-0.5 text-[11px] pl-2">
                      <div>👤 <em>Nhân viên trực:</em> Sale tự tay trả lời.</div>
                      <div>📝 <em>A.I. Soạn nháp:</em> AI viết sẵn câu trả lời chờ duyệt.</div>
                      <div>🤖 <em>A.I. Tự động 24/7:</em> AI tự động gửi tin sau 3s.</div>
                    </div>
                  </li>
                  <li>• <strong>Cách dùng nút ✨ A.I. Soạn:</strong>
                    <div className="mt-1 text-[11px] text-slate-400 bg-slate-900 p-2 rounded border border-slate-800">
                      Gõ vào ô chat: <em>"bác an 65t tiểu đường 8.2 tư vấn 2 ly sáng tối"</em> $\rightarrow$ Bấm <strong>✨ A.I. Soạn</strong> $\rightarrow$ AI tự viết thành lời chào và phác đồ y khoa chuẩn Dược sĩ ADDP!
                    </div>
                  </li>
                </ul>
              </div>

              {/* Cột 3 */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <h4 className="font-bold text-xs text-emerald-400 flex items-center gap-1.5">
                  <span>👤</span> CỘT 3: Hồ Sơ 360 & Lên Đơn Nhanh
                </h4>
                <ul className="text-xs text-slate-300 space-y-1.5">
                  <li>• <strong>Thông tin Bệnh lý:</strong> Xem chỉ số đường huyết ban đầu, hiện tại và bệnh lý nền.</li>
                  <li>• <strong>Thẻ Tag màu:</strong> Xem các tag phân loại (Tiểu đường, Mua lần 2, VIP).</li>
                  <li>• <strong>Nút 🛒 Lên Đơn Hàng Nhanh:</strong>
                    <div className="mt-1 text-[11px] text-slate-400">
                      Mở modal tạo đơn ngay trong khung chat, chọn sản phẩm $\rightarrow$ Hệ thống tự động đồng bộ sang KiotViet và tính doanh số cho Sale.
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: LỘ TRÌNH CHĂM SÓC KHÁCH HÀNG (WORK TRACKING)                      */}
      {/* ========================================================================= */}
      {activeTab === "work-tracking" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>📋</span> Lộ Trình Chăm Sóc Khách Hàng 7 Mốc Tự Động (WorkTracking)
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Sau khi đơn hàng giao thành công, hệ thống tự động sinh lịch nhắc việc chăm sóc theo quy chuẩn ngành Y Dược của ADDP (kế thừa từ <code>C:\QuanlyKH</code>):
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <span className="font-bold text-xs text-blue-400 block mb-1">📅 Ngày 1 (Sau nhận hàng)</span>
                <p className="text-[11px] text-slate-300">Gọi điện/nhắn Zalo hỏi thăm khách đã nhận đủ hàng chưa, hướng dẫn cách pha nước ấm 45-50°C, uống 1 muỗng gạt.</p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <span className="font-bold text-xs text-indigo-400 block mb-1">📅 Ngày 3 (Kiểm tra hấp thu)</span>
                <p className="text-[11px] text-slate-300">Nhắn tin kiểm tra phản ứng đường tiêu hóa, vị giác của khách khi uống sữa Glucare Plus.</p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <span className="font-bold text-xs text-emerald-400 block mb-1">📅 Ngày 7 (Đo đường huyết tuần)</span>
                <p className="text-[11px] text-slate-300">Nhắc khách hàng bấm que đo đường huyết vào buổi sáng lúc đói, ghi nhận chỉ số vào Hồ sơ 360.</p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <span className="font-bold text-xs text-purple-400 block mb-1">📅 Ngày 14 & 21 (Đánh giá)</span>
                <p className="text-[11px] text-slate-300">Đánh giá mức độ ổn định đường huyết, kiểm tra giấc ngủ, tinh thần và độ tê bì chân tay.</p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <span className="font-bold text-xs text-amber-400 block mb-1">📅 Dùng 1/2 Hộp</span>
                <p className="text-[11px] text-slate-300">Tư vấn chế độ ăn bổ sung rau xanh, vận động nhẹ 20 phút mỗi ngày.</p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <span className="font-bold text-xs text-rose-400 block mb-1">📅 Dùng 2/3 Hộp (Chốt Re-order)</span>
                <p className="text-[11px] text-slate-300">Khách sắp hết sữa, gọi điện nhắc đặt đợt mới để liệu trình không bị gián đoạn, áp dụng ưu đãi khách quen.</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-1.5">
              <h4 className="font-bold text-white flex items-center gap-1.5">
                <span>⚡</span> Thao Tác Của Nhân Viên CSKH Hàng Ngày Tại <code>/work-tracking</code>:
              </h4>
              <p>1. Xem danh sách công việc cần làm hôm nay (Tab <em>Hôm nay</em>).</p>
              <p>2. Bấm nút <strong>Mở Chat</strong> để nhảy thẳng vào khung trò chuyện Zalo của khách hàng đó.</p>
              <p>3. Gửi tin theo mẫu kịch bản có sẵn $\rightarrow$ Nhập chỉ số đường huyết mới (nếu khách cung cấp) $\rightarrow$ Bấm nút <strong>✓ Đánh dấu Hoàn thành</strong>.</p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: CHIẾN DỊCH GỬI TIN HÀNG LOẠT (SMART BROADCAST)                     */}
      {/* ========================================================================= */}
      {activeTab === "broadcast" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>📢</span> Hướng Dẫn Tạo Chiến Dịch Gửi Tin Hàng Loạt (Smart Broadcast)
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Truy cập menu <strong>AI & Gửi Hàng loạt (`/broadcast`)</strong> để tạo chiến dịch chăm sóc khách hàng cũ hoặc thông báo ưu đãi:
            </p>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs text-slate-300">
              <h4 className="font-bold text-white flex items-center gap-1.5">
                <span>📝</span> Các bước tạo chiến dịch gửi tin:
              </h4>
              <ol className="list-decimal list-inside space-y-1.5 pl-2">
                <li>Bấm nút <strong>+ Tạo Chiến Dịch Mới</strong> ở góc phải.</li>
                <li><strong>Chọn kênh gửi:</strong> Chọn tài khoản Zalo cá nhân hoặc Zalo OA phụ trách.</li>
                <li><strong>Lọc tệp khách hàng mục tiêu:</strong>
                  <div className="pl-4 pt-1 text-[11px] text-slate-400 space-y-0.5">
                    <div>• Theo Thẻ Tag: <em>Tiểu đường</em>, <em>Cao huyết áp</em>, <em>VIP</em>.</div>
                    <div>• Theo Số ngày chưa mua lại: Ví dụ khách chưa mua trong 25 ngày qua.</div>
                  </div>
                </li>
                <li><strong>Soạn nội dung tin nhắn mẫu:</strong>
                  <div className="pl-4 pt-1 text-[11px] text-amber-300 font-mono">
                    "Chào &#123;fullName&#125;, Dược sĩ ADDP gửi tặng mình mã giảm 50k khi đặt tiếp liệu trình sữa Glucare Plus hôm nay..."
                  </div>
                </li>
                <li><strong>Bật tính năng AI Paraphrase:</strong> AI sẽ tự động biến thiên câu chào mở đầu cho từng người nhận để nội dung không bao giờ trùng lặp 100%, bảo đảm tài khoản Zalo hoạt động an toàn tuyệt đối.</li>
                <li>Bấm <strong>Bắt đầu chạy chiến dịch</strong>. Hàng đợi thông minh sẽ tự động gửi từng tin nhắn với độ trễ ngẫu nhiên 45 - 120 giây.</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 7: KHO COMBO & ĐỐI SOÁT TÀI CHÍNH BI                                 */}
      {/* ========================================================================= */}
      {activeTab === "inventory-bi" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl space-y-5">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>📦</span> Quản Lý Kho Combo & Báo Cáo Đối Soát Tài Chính BI
            </h3>

            {/* Phần Kho */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <h4 className="font-bold text-xs text-amber-400 flex items-center gap-1.5">
                <span>🏷️</span> 1. Quản Lý Kho & Bóc Tách Combo Đệ Quy (`/inventory`)
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed">
                Trên sàn TikTok Shop hoặc Shopee, khách hàng thường mua các gói Combo khuyến mại (ví dụ: <code>COMBO-2GLU-1DOV</code>). Khi đơn hàng phát sinh, thuật toán <code>resolve_all_formulas</code> kế thừa từ <code>C:\AH-Trabi\quan-ly-kho</code> sẽ:
              </p>
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-cyan-300">
                1 Combo [COMBO-2GLU-1DOV] $\rightarrow$ Tự động trừ tồn kho: 2 Lon Sữa Glucare Plus (800g) + 1 Tuýp Sủi Dovital.
              </div>
              <p className="text-[11px] text-slate-400">
                Thủ kho có thể dùng công cụ <strong>Interactive Combo Tester</strong> trên màn hình để kiểm tra trước công thức phân rã của bất kỳ mã hàng nào.
              </p>
            </div>

            {/* Phần Báo Cáo Tài Chính */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <h4 className="font-bold text-xs text-emerald-400 flex items-center gap-1.5">
                <span>📈</span> 2. Báo Cáo Doanh Số, Lãi/Lỗ Thực Tế & Thống Kê Thuế (`/reports`)
              </h4>
              <ul className="text-xs text-slate-300 space-y-1.5 pl-2">
                <li>• <strong>Doanh Thu Thực Nhận (Realized Revenue):</strong> Tiền thực tế thu về sau khi trừ đơn hủy trước xuất kho và đơn bom hoàn.</li>
                <li>• <strong>Giá Vốn COGS:</strong> Tính chính xác dựa trên giá xuất xưởng của từng sản phẩm lẻ trong combo.</li>
                <li>• <strong>Loss Engine:</strong> Tự động trừ cước vận chuyển 2 chiều đối với đơn bom hàng (TikTok: 32.000 đ, Shopee: 30.000 đ).</li>
                <li>• <strong>TikTok Ads & Khung Giờ Vàng:</strong> Biểu đồ phân bổ 24h giúp phân bổ ngân sách GMV Max vào khung giờ cao điểm (19:00 - 23:00).</li>
                <li>• <strong>Xuất Bảng Kê Thuế VAT 8%:</strong> Bấm nút <em>Xuất Bảng Kê Thuế (Excel/CSV)</em> để tải báo cáo thuế giao thành công cho cơ quan thuế và ban giám đốc.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
