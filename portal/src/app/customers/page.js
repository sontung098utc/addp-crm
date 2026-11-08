"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { VIP_LEVELS, calculateVipLevel } from "@/lib/customerTiers";

const CHANNEL_META = {
  FACEBOOK: { label: "Fanpage FB", icon: "📘" },
  ZALO_PERSONAL: { label: "Zalo Cá Nhân", icon: "💬" },
  TIKTOK_SHOP: { label: "TikTok Shop", icon: "🎵" },
  SHOPEE: { label: "Shopee", icon: "🛍️" },
  WEBSITE_MAGENTO: { label: "Magento 2.4.8", icon: "🌐" },
  KIOTVIET: { label: "KiotViet POS", icon: "🏪" },
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [vipFilter, setVipFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [currentStaff, setCurrentStaff] = useState(null);

  // Modal tạo khách hàng mới
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({
    fullName: "",
    phone: "",
    age: "",
    province: "Hà Nội",
    pathology: "Tiểu đường tuýp 2",
    initialGlucose: "7.5",
    source: "ZALO_PERSONAL",
  });
  const [savingNew, setSavingNew] = useState(false);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (vipFilter !== "ALL") params.set("vipLevel", vipFilter);
      if (statusFilter !== "ALL") params.set("status", statusFilter);

      const res = await fetch(`/api/customers?${params.toString()}`);
      const data = await res.json();
      if (data.ok) {
        setCustomers(data.customers || []);
        if (data.currentStaff) setCurrentStaff(data.currentStaff);
      }
    } catch (err) {
      console.error("Lỗi tải danh sách khách hàng:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [vipFilter, statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchCustomers();
  };

  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    if (!newCustomerForm.fullName || !newCustomerForm.phone) {
      alert("Vui lòng nhập họ tên và số điện thoại.");
      return;
    }
    try {
      setSavingNew(true);
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newCustomerForm,
          age: Number(newCustomerForm.age) || null,
          initialGlucose: parseFloat(newCustomerForm.initialGlucose) || null,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setShowAddModal(false);
        setNewCustomerForm({
          fullName: "",
          phone: "",
          age: "",
          province: "Hà Nội",
          pathology: "Tiểu đường tuýp 2",
          initialGlucose: "7.5",
          source: "ZALO_PERSONAL",
        });
        fetchCustomers();
      } else {
        alert(data.error || "Không thể tạo khách hàng.");
      }
    } catch {
      alert("Lỗi kết nối khi tạo khách hàng.");
    } finally {
      setSavingNew(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Hồ Sơ Khách Hàng 360 & Bệnh Lý
            </h1>
            <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-400 border border-blue-500/20">
              WBS-25 & WBS-26
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Định danh hợp nhất SĐT 10 số (Điều 3 AGENTS.md), theo dõi chỉ số đường huyết, bệnh lý và phân hạng VIP tự động
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 transition shadow-lg shadow-blue-600/30"
          >
            <span>+</span>
            <span>Thêm Khách Hàng 360</span>
          </button>
        </div>
      </div>

      {/* Bộ lọc thông minh */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Ô tìm kiếm */}
          <form onSubmit={handleSearchSubmit} className="md:col-span-2 relative">
            <input
              type="text"
              placeholder="Tìm theo Tên, SĐT 10 số, Bệnh lý (VD: Tiểu đường, 0901...)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-9 pr-20 py-2 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
            <span className="absolute left-3 top-2.5 text-slate-500 text-xs">🔍</span>
            <button
              type="submit"
              className="absolute right-1.5 top-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 px-2.5 py-1 text-[11px] font-semibold text-slate-200 transition"
            >
              Tìm kiếm
            </button>
          </form>

          {/* Lọc Hạng VIP */}
          <div>
            <select
              value={vipFilter}
              onChange={(e) => setVipFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="ALL">Tất cả Hạng VIP</option>
              <option value="POTENTIAL">Tiềm năng (0 đơn)</option>
              <option value="NEW">Khách Mới (1 đơn)</option>
              <option value="REPEAT_2">Tái Mua Lần 2 (2 đơn)</option>
              <option value="LOYAL_3">Khách Thân Thiết (3-4 đơn)</option>
              <option value="VIP_5">Khách VIP (≥5 đơn / ≥10tr)</option>
            </select>
          </div>

          {/* Lọc Trạng thái CS */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="ALL">Tất cả trạng thái CS</option>
              <option value="Đang chăm sóc">Đang chăm sóc</option>
              <option value="Đã chốt">Đã chốt</option>
              <option value="Tiềm năng">Tiềm năng</option>
              <option value="Cần chăm tiếp">Cần chăm tiếp</option>
            </select>
          </div>
        </div>

        {/* Thống kê nhanh */}
        <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-400">
          <span>Tổng số khách: <strong className="text-white">{customers.length}</strong></span>
          <span>•</span>
          <span>Khách VIP: <strong className="text-amber-400">{customers.filter(c => c.vipLevel === 'VIP_5').length}</strong></span>
          <span>•</span>
          <span>Tái mua lần 2: <strong className="text-emerald-400">{customers.filter(c => c.vipLevel === 'REPEAT_2').length}</strong></span>
          <span>•</span>
          <span>Tiểu đường tuýp 2: <strong className="text-rose-400">{customers.filter(c => c.pathology?.includes('Tiểu đường')).length}</strong></span>
        </div>
      </div>

      {/* Danh sách bảng khách hàng */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500 space-y-2">
            <div className="h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p>Đang tải danh sách Khách Hàng 360...</p>
          </div>
        ) : customers.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="text-3xl">👥</div>
            <h3 className="text-sm font-bold text-white">Chưa có dữ liệu khách hàng</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              Hệ thống ở chế độ Vận Hành Sạch (Production Ready). Dữ liệu khách hàng sẽ tự động đồng bộ khi kết nối kênh hoặc tạo đơn mới.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 transition"
            >
              + Thêm Khách Hàng Thực Tế
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Mã / Khách Hàng</th>
                  <th className="py-3 px-4">Số Điện Thoại (Chuẩn)</th>
                  <th className="py-3 px-4">Bệnh Lý & Đường Huyết</th>
                  <th className="py-3 px-4">Hạng VIP & Đơn Hàng</th>
                  <th className="py-3 px-4">Nguồn Kênh</th>
                  <th className="py-3 px-4">Sale Phụ Trách</th>
                  <th className="py-3 px-4 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {customers.map((c) => {
                  const vipInfo = (c.vipLevel && VIP_LEVELS[c.vipLevel]) || calculateVipLevel(c.totalOrders, c.totalSpent) || VIP_LEVELS.POTENTIAL;
                  const rawSource = c.sourceChannel || c.source || c.channel || "ZALO_PERSONAL";
                  const ch = CHANNEL_META[rawSource] || { label: rawSource, icon: "🏷️" };
                  return (
                    <tr key={c.id} className="hover:bg-slate-800/30 transition">
                      {/* Cột Tên */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white hover:text-blue-400">
                          <Link href={`/customers/${c.id}`}>{c.fullName}</Link>
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <span>{c.code}</span>
                          {c.age && <span>• {c.age} tuổi</span>}
                          {c.province && <span>• {c.province}</span>}
                        </div>
                      </td>

                      {/* Cột SĐT */}
                      <td className="py-3.5 px-4 font-mono font-medium text-emerald-400">
                        {c.phone}
                      </td>

                      {/* Cột Bệnh lý & Đường huyết */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="text-white truncate font-medium" title={c.pathology}>
                          {c.pathology || "Chưa ghi nhận"}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] mt-0.5">
                          {c.initialGlucose && (
                            <span className="text-rose-400">
                              ĐH đầu: {c.initialGlucose} mmol/L
                            </span>
                          )}
                          {c.currentGlucose && (
                            <span className="text-emerald-400 font-bold">
                              Hiện tại: {c.currentGlucose} mmol/L
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Cột Hạng VIP & Đơn hàng */}
                      <td className="py-3.5 px-4">
                        <span className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold ${vipInfo.badgeColor}`}>
                          {vipInfo.label}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-1">
                          {c.totalOrders} đơn • {Number(c.totalSpent).toLocaleString("vi-VN")} đ
                        </div>
                      </td>

                      {/* Cột Nguồn Kênh */}
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 px-2 py-0.5 text-[10px] font-medium border border-slate-200 dark:border-slate-700/60">
                          <span>{ch.icon}</span>
                          <span>{ch.label}</span>
                        </span>
                      </td>

                      {/* Cột Sale Phụ Trách */}
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-200">
                          {c.staffName || "Chưa gán"}
                        </span>
                        {c.staffCode && (
                          <span className="block text-[10px] text-slate-500">
                            {c.staffCode}
                          </span>
                        )}
                      </td>

                      {/* Thao tác */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href="/inbox"
                            className="rounded-lg bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 px-2.5 py-1 text-[11px] font-bold text-blue-300 transition"
                            title="Nhắn tin Zalo ngay"
                          >
                            💬 Chat
                          </Link>
                          <Link
                            href={`/customers/${c.id}`}
                            className="rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2.5 py-1 text-[11px] font-semibold text-slate-200 transition"
                          >
                            Hồ Sơ 360
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Thêm Khách Hàng 360 */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Thêm Hồ Sơ Khách Hàng 360 Mới</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Họ và tên khách hàng *</label>
                <input
                  type="text"
                  required
                  placeholder="VD: Bác Trần Văn Nam"
                  value={newCustomerForm.fullName}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, fullName: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Số điện thoại * (Tự chuẩn hóa)</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: 0912345678"
                    value={newCustomerForm.phone}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, phone: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Độ tuổi</label>
                  <input
                    type="number"
                    placeholder="VD: 58"
                    value={newCustomerForm.age}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, age: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Tình trạng Bệnh lý</label>
                <input
                  type="text"
                  placeholder="VD: Tiểu đường tuýp 2 (5 năm), tê bì chân tay"
                  value={newCustomerForm.pathology}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, pathology: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Đường huyết lúc đói (mmol/L)</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="VD: 8.5"
                    value={newCustomerForm.initialGlucose}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, initialGlucose: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Nguồn tiếp nhận</label>
                  <select
                    value={newCustomerForm.source}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, source: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="ZALO_PERSONAL">Zalo Cá Nhân</option>
                    <option value="FACEBOOK">Fanpage Facebook</option>
                    <option value="TIKTOK_SHOP">TikTok Shop</option>
                    <option value="SHOPEE">Shopee</option>
                    <option value="MAGENTO">Website Magento 2.4.8</option>
                    <option value="KIOTVIET">KiotViet POS</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 font-semibold text-slate-300 hover:text-white"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={savingNew}
                  className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {savingNew ? "Đang lưu..." : "Lưu Khách Hàng 360"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
