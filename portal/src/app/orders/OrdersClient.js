"use client";

import { useState, useEffect } from "react";
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
  const [showKiotConfigModal, setShowKiotConfigModal] = useState(false);
  const [toast, setToast] = useState(null);

  // KiotViet Configuration state
  const [kiotConfig, setKiotConfig] = useState({
    retailer: "",
    clientId: "",
    clientSecret: "",
    branchId: 1,
    branchName: "Kho Tổng Dược Phẩm ADDP",
    autoSync: true,
    connected: false,
  });
  const [branches, setBranches] = useState([
    { id: 1, branchName: "Kho Tổng Dược Phẩm ADDP" },
  ]);
  const [savingKiot, setSavingKiot] = useState(false);
  const [syncingKiot, setSyncingKiot] = useState(false);

  const showToastMsg = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

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

  const fetchKiotVietInfo = async () => {
    try {
      const res = await fetch("/api/channels/kiotviet");
      const data = await res.json();
      if (data.ok && data.config) {
        setKiotConfig((prev) => ({
          ...prev,
          ...data.config,
          clientSecret: data.config.hasClientSecret ? "********" : "",
        }));
        if (Array.isArray(data.branches) && data.branches.length > 0) {
          setBranches(data.branches);
        }
      }
    } catch {}
  };

  useEffect(() => {
    fetchOrders();
    fetchKiotVietInfo();
  }, []);

  const handleSyncKiotViet = async (mode = "incremental") => {
    if (syncingKiot) return;
    try {
      setSyncingKiot(true);
      showToastMsg("Đang đồng bộ đơn hàng & hóa đơn từ KiotViet Open API...");
      const res = await fetch("/api/orders/kiotviet/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, registerWebhooks: true }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        showToastMsg(
          data.message ||
            `Đồng bộ KiotViet thành công! Nạp ${data.syncedCount || 0} đơn hàng.`
        );
        await fetchOrders();
      } else {
        showToastMsg(`Lỗi đồng bộ KiotViet: ${data.error || "Không xác định"}`);
      }
    } catch (err) {
      showToastMsg(`Lỗi kết nối đồng bộ: ${err.message}`);
    } finally {
      setSyncingKiot(false);
    }
  };

  const handleSaveKiotConfig = async (e) => {
    e.preventDefault();
    try {
      setSavingKiot(true);
      const res = await fetch("/api/channels/kiotviet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SAVE_CONFIG",
          ...kiotConfig,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        if (Array.isArray(data.branches) && data.branches.length > 0) {
          setBranches(data.branches);
        }
        setShowKiotConfigModal(false);
        showToastMsg(data.message || "Đã lưu cấu hình KiotViet Open API!");
        fetchKiotVietInfo();
        // Tự động kích hoạt đồng bộ đơn hàng và đăng ký Webhook
        handleSyncKiotViet("incremental");
      }
    } catch {
      showToastMsg("Không thể lưu cấu hình KiotViet.");
    } finally {
      setSavingKiot(false);
    }
  };

  const handlePushSingleOrderToKiotViet = async (orderId) => {
    try {
      const res = await fetch("/api/channels/kiotviet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "PUSH_ORDER", orderId }),
      });
      const data = await res.json();
      if (data.ok) {
        showToastMsg(
          `Đã đẩy đơn sang KiotViet thành công (Mã: ${data.kiotOrderCode})!`
        );
        fetchOrders();
      } else {
        showToastMsg(data.error || "Lỗi khi đẩy đơn sang KiotViet.");
      }
    } catch {
      showToastMsg("Lỗi kết nối khi đẩy đơn sang KiotViet.");
    }
  };

  const handleUpdateOrderStatus = async (orderId, nextStatus) => {
    try {
      const res = await fetch("/api/orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, status: nextStatus }),
      });
      const data = await res.json();
      if (data.ok) {
        fetchOrders();
        showToastMsg(
          nextStatus === "DELIVERED"
            ? `Đơn ${data.order.orderCode} đã Giao thành công & kích hoạt 7 mốc chăm sóc CarePlan!`
            : `Đã cập nhật trạng thái đơn ${data.order.orderCode}`
        );
      }
    } catch {}
  };

  const filteredOrders = orders.filter((o) => {
    if (selectedChannel !== "ALL" && o.channel !== selectedChannel) return false;
    if (selectedStatus !== "ALL" && o.status !== selectedStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const match =
        o.orderCode?.toLowerCase().includes(q) ||
        o.kiotVietOrderCode?.toLowerCase().includes(q) ||
        o.customerName?.toLowerCase().includes(q) ||
        o.phone?.includes(q);
      if (!match) return false;
    }
    return true;
  });

  // KPI Calculations
  const totalRevenue = filteredOrders.reduce(
    (sum, o) => sum + (o.finalAmount || 0),
    0
  );
  const confirmedCount = filteredOrders.filter(
    (o) => o.status === "CONFIRMED"
  ).length;
  const deliveredCount = filteredOrders.filter(
    (o) => o.status === "DELIVERED"
  ).length;

  const getChannelBadge = (ch) => {
    switch (ch) {
      case "WEBSITE_MAGENTO":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">
            Magento 2.4.8
          </span>
        );
      case "KIOTVIET":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
            KiotViet POS
          </span>
        );
      case "TIKTOK_SHOP":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-pink-500/20 text-pink-400 border border-pink-500/30">
            TikTok Shop
          </span>
        );
      case "SHOPEE":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
            Shopee
          </span>
        );
      case "FACEBOOK":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            Facebook FB
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30">
            Zalo Cá Nhân
          </span>
        );
    }
  };

  const getStatusBadge = (st) => {
    switch (st) {
      case "DELIVERED":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            Giao Thành Công
          </span>
        );
      case "SHIPPING":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
            Đang Vận Chuyển
          </span>
        );
      case "CANCELLED":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
            Đã Hủy
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
            Đã Chốt / Chờ Gửi
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-xl border border-emerald-500/40 bg-emerald-950/90 px-4 py-2.5 text-xs text-emerald-200 backdrop-blur-md shadow-xl flex items-center gap-2">
          <span>✓ {toast}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-2 font-bold hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2.5 flex-wrap">
            <span>📦 Quản Lý Đơn Hàng Đa Nền Tảng & Đồng Bộ KiotViet</span>
            <span className="rounded bg-emerald-500/20 text-emerald-400 text-xs font-semibold px-2 py-0.5">
              WBS-39 & WBS-40
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Tự động đẩy đơn sang KiotViet Open API, trừ tồn kho Combo và kích hoạt lộ trình chăm sóc 7 mốc CarePlan sau bán
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => handleSyncKiotViet("incremental")}
            disabled={syncingKiot}
            title="Đồng bộ hóa đơn và đơn đặt hàng mới nhất từ KiotViet về CRM"
            className="px-3.5 py-2 rounded-xl border border-sky-500/40 bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 text-xs font-semibold transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            <span>{syncingKiot ? "🔄 Đang Đồng Bộ..." : "🔄 Đồng Bộ KiotViet"}</span>
          </button>
          <button
            onClick={() => setShowKiotConfigModal(true)}
            className="px-3.5 py-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-semibold transition cursor-pointer"
          >
            ⚙️ Cấu Hình KiotViet ({kiotConfig.connected ? "Đã kết nối" : "Sẵn sàng"})
          </button>
          <button
            onClick={fetchOrders}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
          >
            🔄 Làm Mới
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-900/30 transition flex items-center gap-1.5 cursor-pointer"
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
          <div className="text-[11px] text-slate-500">Đã chốt chăm sóc 7 mốc</div>
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
            placeholder="Tìm theo Mã đơn, Mã KiotViet, SĐT..."
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
                <th className="px-4 py-3 font-semibold">Mã Đơn & KiotViet</th>
                <th className="px-4 py-3 font-semibold">Khách Hàng (SĐT)</th>
                <th className="px-4 py-3 font-semibold">Kênh Bán</th>
                <th className="px-4 py-3 font-semibold">Sản Phẩm & Tách Combo</th>
                <th className="px-4 py-3 font-semibold">Tổng Tiền</th>
                <th className="px-4 py-3 font-semibold">Trạng Thái & CarePlan</th>
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
                  <td colSpan={8} className="p-16 text-center space-y-3">
                    <div className="text-3xl">📦</div>
                    <div className="text-sm font-bold text-white">
                      Chưa có dữ liệu đơn hàng
                    </div>
                    <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                      Chưa có đơn hàng nào khớp với bộ lọc hoặc hệ thống chưa phát sinh đơn mới. Dữ liệu sẽ tự động đồng bộ khi kết nối kênh hoặc tạo đơn mới.
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(true)}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 transition cursor-pointer"
                    >
                      + Tạo Đơn Hàng Mới
                    </button>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-4 py-3">
                      <div className="font-mono font-bold text-blue-400">
                        {o.orderCode}
                      </div>
                      {o.kiotVietOrderCode ? (
                        <span className="mt-1 inline-block rounded bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-mono text-emerald-300">
                          ✓ KiotViet: {o.kiotVietOrderCode}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handlePushSingleOrderToKiotViet(o.id)}
                          className="mt-1 inline-block rounded bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-blue-300 cursor-pointer"
                        >
                          ⚡ Đẩy KiotViet
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-white">{o.customerName}</div>
                      <div className="text-[11px] font-mono text-slate-400">
                        {o.phone}
                      </div>
                    </td>
                    <td className="px-4 py-3">{getChannelBadge(o.channel)}</td>
                    <td className="px-4 py-3 max-w-xs">
                      {Array.isArray(o.items) && o.items.length > 0 ? (
                        <div className="space-y-0.5">
                          {o.items.map((it, idx) => (
                            <div
                              key={idx}
                              className="text-[11px] text-slate-300 truncate"
                            >
                              • {it.name}{" "}
                              <span className="text-slate-500">x{it.quantity}</span>
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
                    <td className="px-4 py-3 space-y-1">
                      <div className="flex items-center gap-1.5">
                        {getStatusBadge(o.status)}
                        {o.status !== "DELIVERED" && (
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateOrderStatus(o.id, "DELIVERED")
                            }
                            title="Xác nhận Giao thành công & Kích hoạt lịch chăm sóc 7 mốc"
                            className="px-2 py-0.5 rounded bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold transition cursor-pointer"
                          >
                            🚚 Giao thành công
                          </button>
                        )}
                      </div>
                      <div className="text-[10px] text-purple-300">
                        📅 Đã sinh {o.careTasksCount || 7} mốc CarePlan
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-300 font-medium">
                      {o.staffName}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {o.createdAt
                        ? new Date(o.createdAt).toLocaleString("vi-VN")
                        : "Vừa xong"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Cấu Hình KiotViet Open API */}
      {showKiotConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">
                  ⚙️ Cấu Hình KiotViet Open API (OAuth2 Bearer)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Tự động đổi Client Credentials Token & đẩy đơn hàng trực tiếp sang KiotViet POS
                </p>
              </div>
              <button
                onClick={() => setShowKiotConfigModal(false)}
                className="text-slate-400 hover:text-white text-base font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveKiotConfig} className="space-y-3.5">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Tên Gian Hàng KiotViet (Retailer Subdomain) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: duocphamaddp"
                  value={kiotConfig.retailer}
                  onChange={(e) =>
                    setKiotConfig({ ...kiotConfig, retailer: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Client ID *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Nhập KiotViet Client ID..."
                    value={kiotConfig.clientId}
                    onChange={(e) =>
                      setKiotConfig({ ...kiotConfig, clientId: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Client Secret *
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Nhập KiotViet Client Secret..."
                    value={kiotConfig.clientSecret}
                    onChange={(e) =>
                      setKiotConfig({
                        ...kiotConfig,
                        clientSecret: e.target.value,
                      })
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Chi nhánh xuất kho mặc định (Branch ID)
                </label>
                <select
                  value={kiotConfig.branchId}
                  onChange={(e) =>
                    setKiotConfig({
                      ...kiotConfig,
                      branchId: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.branchName} (ID: {b.id})
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 text-slate-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={kiotConfig.autoSync}
                  onChange={(e) =>
                    setKiotConfig({ ...kiotConfig, autoSync: e.target.checked })
                  }
                  className="rounded border-slate-700 bg-slate-900 text-blue-600"
                />
                <span>
                  Tự động đẩy đơn hàng mới sang KiotViet & đồng bộ tồn kho thời gian thực
                </span>
              </label>

              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-[11px] text-slate-400">
                Webhook URL nhận hóa đơn KiotViet:{" "}
                <code className="text-emerald-400 font-mono">
                  https://crm.addp.vn/api/webhooks/kiotviet
                </code>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowKiotConfigModal(false)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 font-semibold text-slate-300 hover:text-white cursor-pointer"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={savingKiot}
                  className="rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2 font-bold text-white cursor-pointer disabled:opacity-50"
                >
                  {savingKiot
                    ? "Đang xác thực OAuth2..."
                    : "Lưu & Kiểm Tra Kết Nối KiotViet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QuickOrderModal (Sử dụng cho nút + Tạo Đơn Hàng Mới) */}
      <QuickOrderModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        customer={null}
        onSuccess={(newOrd) => {
          setOrders((prev) => [newOrd, ...prev]);
          showToastMsg(
            `Đã tạo đơn ${newOrd.orderCode} (${
              newOrd.kiotVietOrderCode
                ? `KiotViet: ${newOrd.kiotVietOrderCode}`
                : "Đã lưu"
            }) & sinh 7 mốc CarePlan!`
          );
        }}
      />
    </div>
  );
}
