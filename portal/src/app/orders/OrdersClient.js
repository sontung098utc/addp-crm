"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import QuickOrderModal from "../components/QuickOrderModal";

const CHANNELS = [
  { key: "ALL", label: "Tất Cả Kênh (7 Kênh)" },
  { key: "WEBSITE_MAGENTO", label: "Website Magento 2.4.8" },
  { key: "KIOTVIET", label: "KiotViet POS" },
  { key: "TIKTOK_SHOP", label: "TikTok Shop" },
  { key: "SHOPEE", label: "Shopee" },
  { key: "ZALO_PERSONAL", label: "Zalo Cá Nhân" },
  { key: "FACEBOOK", label: "Fanpage Facebook" },
];

const STATUSES = [
  { key: "ALL", label: "Tất Cả Trạng Thái" },
  { key: "CONFIRMED", label: "Đã Chốt / Chờ Gửi" },
  { key: "SHIPPING", label: "Đang Vận Chuyển" },
  { key: "DELIVERED", label: "Giao Thành Công" },
  { key: "CANCELLED", label: "Đã Hủy" },
];

export default function OrdersClient() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedChannel, setSelectedChannel] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [toast, setToast] = useState(null);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/orders");
      const data = await res.json();
      if (data.ok && Array.isArray(data.orders)) {
        setOrders(data.orders);
      }
    } catch (err) {
      console.error("Lỗi nạp đơn hàng:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const filteredOrders = orders.filter((o) => {
    if (selectedChannel !== "ALL" && o.channel !== selectedChannel) return false;
    if (selectedStatus !== "ALL" && o.status !== selectedStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const match =
        o.orderCode?.toLowerCase().includes(q) ||
        o.customerName?.toLowerCase().includes(q) ||
        o.phone?.includes(q);
      if (!match) return false;
    }
    return true;
  });

  // KPI Calculations
  const totalRevenue = filteredOrders.reduce((sum, o) => sum + (o.finalAmount || 0), 0);
  const confirmedCount = filteredOrders.filter((o) => o.status === "CONFIRMED").length;
  const deliveredCount = filteredOrders.filter((o) => o.status === "DELIVERED").length;

  const getChannelBadge = (ch) => {
    switch (ch) {
      case "WEBSITE_MAGENTO":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">Magento 2.4.8</span>;
      case "KIOTVIET":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">KiotViet POS</span>;
      case "TIKTOK_SHOP":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-pink-500/20 text-pink-400 border border-pink-500/30">TikTok Shop</span>;
      case "SHOPEE":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">Shopee</span>;
      case "FACEBOOK":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">Facebook FB</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30">Zalo Cá Nhân</span>;
    }
  };

  const getStatusBadge = (st) => {
    switch (st) {
      case "DELIVERED":
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Giao Thành Công</span>;
      case "SHIPPING":
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">Đang Vận Chuyển</span>;
      case "CANCELLED":
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">Đã Hủy</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">Đã Chốt / Chờ Gửi</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-xl border border-emerald-500/40 bg-emerald-950/90 px-4 py-2.5 text-xs text-emerald-200 backdrop-blur-md shadow-xl flex items-center gap-2">
          <span>✓ {toast}</span>
          <button onClick={() => setToast(null)} className="ml-2 font-bold hover:text-white">✕</button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
            <span>📦 Quản Lý Đơn Hàng Đa Nền Tảng Tập Trung</span>
            <span className="rounded bg-emerald-500/20 text-emerald-400 text-xs font-semibold px-2 py-0.5">
              WBS-40
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Đồng bộ thời gian thực từ Website Magento 2.4.8, KiotViet, TikTok Shop, Shopee & Hộp Thư Zalo
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchOrders}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
          >
            🔄 Làm Mới
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-900/30 transition flex items-center gap-1.5"
          >
            <span>+ Tạo Đơn Hàng Mới</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-xs text-slate-400 font-medium">Tổng Đơn Hàng</div>
          <div className="text-2xl font-bold text-white">{filteredOrders.length}</div>
          <div className="text-[11px] text-slate-500">Trên các kênh được lọc</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-xs text-slate-400 font-medium">Tổng Doanh Thu</div>
          <div className="text-2xl font-bold text-emerald-400 font-mono">
            {totalRevenue.toLocaleString("vi-VN")} đ
          </div>
          <div className="text-[11px] text-slate-500">Sau khi trừ chiết khấu</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-xs text-slate-400 font-medium">Chờ Đóng Gói / Gửi</div>
          <div className="text-2xl font-bold text-amber-400">{confirmedCount}</div>
          <div className="text-[11px] text-slate-500">Đơn cần xử lý kho</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-xs text-slate-400 font-medium">Giao Thành Công</div>
          <div className="text-2xl font-bold text-blue-400">{deliveredCount}</div>
          <div className="text-[11px] text-slate-500">Đã chốt chăm sóc định kỳ</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={selectedChannel}
            onChange={(e) => setSelectedChannel(e.target.value)}
            className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
          >
            {CHANNELS.map((ch) => (
              <option key={ch.key} value={ch.key}>
                {ch.label}
              </option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
          >
            {STATUSES.map((st) => (
              <option key={st.key} value={st.key}>
                {st.label}
              </option>
            ))}
          </select>
        </div>

        <div className="w-full sm:w-72">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo Mã đơn, Khách hàng, SĐT..."
            className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Orders Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-4 py-3 font-semibold">Mã Đơn</th>
                <th className="px-4 py-3 font-semibold">Khách Hàng (SĐT)</th>
                <th className="px-4 py-3 font-semibold">Kênh Bán</th>
                <th className="px-4 py-3 font-semibold">Sản Phẩm</th>
                <th className="px-4 py-3 font-semibold">Tổng Tiền</th>
                <th className="px-4 py-3 font-semibold">Trạng Thái</th>
                <th className="px-4 py-3 font-semibold">Sale Phụ Trách</th>
                <th className="px-4 py-3 font-semibold">Ngày Tạo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500">
                    Đang nạp danh sách đơn hàng...
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-slate-500">
                    Chưa có đơn hàng nào khớp với bộ lọc.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-4 py-3 font-mono font-bold text-blue-400">
                      {o.orderCode}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-white">{o.customerName}</div>
                      <div className="text-[11px] font-mono text-slate-400">{o.phone}</div>
                    </td>
                    <td className="px-4 py-3">{getChannelBadge(o.channel)}</td>
                    <td className="px-4 py-3 max-w-xs">
                      {Array.isArray(o.items) && o.items.length > 0 ? (
                        <div className="space-y-0.5">
                          {o.items.map((it, idx) => (
                            <div key={idx} className="text-[11px] text-slate-300 truncate">
                              • {it.name} <span className="text-slate-500">x{it.quantity}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-500">Không có chi tiết</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-emerald-400">
                      {(o.finalAmount || 0).toLocaleString("vi-VN")} đ
                    </td>
                    <td className="px-4 py-3">{getStatusBadge(o.status)}</td>
                    <td className="px-4 py-3 text-slate-300">{o.staffName || "Chưa gán"}</td>
                    <td className="px-4 py-3 text-slate-400 text-[11px]">
                      {new Date(o.createdAt).toLocaleDateString("vi-VN")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Lên đơn hàng nhanh */}
      <QuickOrderModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        customer={null}
        onSuccess={(newOrd) => {
          fetchOrders();
          setToast(`Đã tạo đơn hàng ${newOrd.orderCode} thành công!`);
          setTimeout(() => setToast(null), 3000);
        }}
      />
    </div>
  );
}
