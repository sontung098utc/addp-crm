"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { VIP_LEVELS, calculateVipLevel } from "@/lib/customerTiers";

const CHANNEL_META = {
  FACEBOOK: { label: "Fanpage FB / Vpage", icon: "📘" },
  ZALO_PERSONAL: { label: "Zalo Cá Nhân", icon: "💬" },
  ZALO_OA: { label: "Zalo OA", icon: "📱" },
  TIKTOK_SHOP: { label: "TikTok Shop", icon: "🎵" },
  SHOPEE: { label: "Shopee", icon: "🛍️" },
  WEBSITE_MAGENTO: { label: "Magento 2.4.8", icon: "🌐" },
  KIOTVIET: { label: "KiotViet POS", icon: "🏪" },
  CALL: { label: "Hotline / Tư vấn", icon: "📞" },
  OTHER: { label: "Vpage / Hệ thống cũ", icon: "🏷️" },
};

const PAGE_SIZE = 50;

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [tagCatalog, setTagCatalog] = useState([]);
  const [filterOptions, setFilterOptions] = useState({
    tags: [],
    staffs: [],
    products: [],
    purchaseLevels: [],
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("ALL");
  const [staffFilter, setStaffFilter] = useState("ALL");
  const [productFilter, setProductFilter] = useState("ALL");
  const [purchaseLevelFilter, setPurchaseLevelFilter] = useState("ALL");
  const [vipFilter, setVipFilter] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);
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
      if (tagFilter !== "ALL") params.set("tag", tagFilter);
      if (staffFilter !== "ALL") params.set("staff", staffFilter);
      if (productFilter !== "ALL") params.set("product", productFilter);
      if (purchaseLevelFilter !== "ALL") params.set("purchaseLevel", purchaseLevelFilter);
      if (vipFilter !== "ALL") params.set("vipLevel", vipFilter);

      const res = await fetch(`/api/customers?${params.toString()}`);
      const data = await res.json();
      if (data.ok) {
        setCustomers(data.customers || []);
        setCurrentPage(1);
        if (Array.isArray(data.tagCatalog)) setTagCatalog(data.tagCatalog);
        if (data.filterOptions) setFilterOptions(data.filterOptions);
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
  }, [tagFilter, staffFilter, productFilter, purchaseLevelFilter, vipFilter]);

  const tagColorMap = useMemo(() => {
    const map = new Map();
    for (const t of tagCatalog || []) {
      if (t?.name) map.set(t.name, t.bg || "bg-amber-500/15 text-amber-300 border-amber-500/30");
    }
    return map;
  }, [tagCatalog]);

  const totalPages = Math.max(1, Math.ceil(customers.length / PAGE_SIZE));
  const paginatedCustomers = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return customers.slice(start, start + PAGE_SIZE);
  }, [customers, currentPage]);

  const hasActiveFilters =
    search.trim() !== "" ||
    tagFilter !== "ALL" ||
    staffFilter !== "ALL" ||
    productFilter !== "ALL" ||
    purchaseLevelFilter !== "ALL" ||
    vipFilter !== "ALL";

  const handleResetFilters = () => {
    setSearch("");
    setTagFilter("ALL");
    setStaffFilter("ALL");
    setProductFilter("ALL");
    setPurchaseLevelFilter("ALL");
    setVipFilter("ALL");
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchCustomers();
  };

  const handleOpenInboxCare = (customer) => {
    const cleanPhone = String(customer.phone || "").replace(/\D/g, "");
    const staffParam = encodeURIComponent(customer.assignedStaff || customer.staffName || "");
    window.open(`/inbox?phone=${encodeURIComponent(cleanPhone)}&staff=${staffParam}&autoOpen=true`, "_blank");
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
              Hồ Sơ Khách Hàng 360 & Lộ Trình Chăm Sóc
            </h1>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
              {customers.length} khách
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Hợp nhất dữ liệu từ khachhang.addp.vn & đa kênh theo SĐT 10 số — bấm "Chăm Sóc" để mở thẳng hội thoại Zalo tương ứng
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/settings/tags"
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 transition"
          >
            <span>🏷️</span>
            <span>Quản Lý Thẻ Tag</span>
          </Link>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 transition shadow-lg shadow-blue-600/30"
          >
            <span>+</span>
            <span>Thêm Khách Hàng 360</span>
          </button>
        </div>
      </div>

      {/* Bộ lọc thông minh đa chiều */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* Ô tìm kiếm */}
          <form onSubmit={handleSearchSubmit} className="lg:col-span-2 relative">
            <input
              type="text"
              placeholder="Tìm Tên, SĐT 10 số, Sản phẩm, Bệnh lý..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-9 pr-20 py-2 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
            <span className="absolute left-3 top-2.5 text-slate-500 text-xs">🔍</span>
            <button
              type="submit"
              className="absolute right-1.5 top-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 px-2.5 py-1 text-[11px] font-semibold text-slate-200 transition"
            >
              Tìm
            </button>
          </form>

          {/* Lọc theo Thẻ Tag Lộ trình */}
          <div>
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="ALL">🏷️ Tất cả Thẻ Tag</option>
              {(filterOptions.tags || []).map((tagName) => (
                <option key={tagName} value={tagName}>
                  {tagName}
                </option>
              ))}
            </select>
          </div>

          {/* Lọc theo Nhân viên phụ trách */}
          <div>
            <select
              value={staffFilter}
              onChange={(e) => setStaffFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="ALL">👤 Tất cả NV Phụ Trách</option>
              {(filterOptions.staffs || []).map((stName) => (
                <option key={stName} value={stName}>
                  {stName}
                </option>
              ))}
            </select>
          </div>

          {/* Lọc theo Sản phẩm đã mua */}
          <div>
            <select
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="ALL">📦 Tất cả Sản Phẩm</option>
              {(filterOptions.products || []).map((prodName) => (
                <option key={prodName} value={prodName}>
                  {prodName}
                </option>
              ))}
            </select>
          </div>

          {/* Lọc theo Mức độ mua hàng / Hạng VIP */}
          <div>
            <select
              value={purchaseLevelFilter}
              onChange={(e) => setPurchaseLevelFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="ALL">💎 Mức Độ Mua Hàng</option>
              {(filterOptions.purchaseLevels || []).map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Thống kê nhanh & Reset */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-[11px] text-slate-400">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              Tổng khách phù hợp: <strong className="text-white">{customers.length}</strong>
            </span>
            <span>•</span>
            <span>
              Khách VIP:{" "}
              <strong className="text-amber-400">
                {customers.filter((c) => c.vipLevel === "VIP_5" || c.purchaseLevel === "KH VIP").length}
              </strong>
            </span>
            <span>•</span>
            <span>
              Có SĐT chuẩn VN:{" "}
              <strong className="text-emerald-400">
                {customers.filter((c) => /^0[35789]\d{8}$/.test(c.phone || "")).length}
              </strong>
            </span>
            <span>•</span>
            <span>
              Có Thẻ Lộ trình:{" "}
              <strong className="text-cyan-400">
                {customers.filter((c) => Array.isArray(c.tags) && c.tags.length > 0).length}
              </strong>
            </span>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 px-2.5 py-1 text-[11px] font-semibold text-slate-200 transition"
            >
              ✕ Xóa bộ lọc
            </button>
          )}
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
            <h3 className="text-sm font-bold text-white">Không tìm thấy hồ sơ khách hàng phù hợp</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              Nếu bạn vừa chuyển hệ thống từ khachhang.addp.vn, hãy chạy script{" "}
              <code className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300">
                node portal/scripts/migrate_from_khachhang.js
              </code>{" "}
              hoặc điều chỉnh lại bộ lọc phía trên.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 transition"
            >
              + Thêm Khách Hàng Thực Tế
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Khách Hàng</th>
                    <th className="py-3 px-4">SĐT & Kênh</th>
                    <th className="py-3 px-4">Sản Phẩm Đã Mua / Bệnh Lý</th>
                    <th className="py-3 px-4">Tổng Chi Tiêu / Mức Độ</th>
                    <th className="py-3 px-4">Thẻ Tag Lộ Trình</th>
                    <th className="py-3 px-4">NV Phụ Trách</th>
                    <th className="py-3 px-4 text-right">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {paginatedCustomers.map((c) => {
                    const vipInfo =
                      (c.vipLevel && VIP_LEVELS[c.vipLevel]) ||
                      calculateVipLevel(c.totalOrders, c.totalSpent) ||
                      VIP_LEVELS.POTENTIAL;
                    const rawSource = c.sourceChannel || c.source || c.channel || "OTHER";
                    const ch = CHANNEL_META[rawSource] || { label: rawSource, icon: "🏷️" };
                    const channelDisplay = c.channelLabel || ch.label;
                    const productsList = Array.isArray(c.purchasedProducts) ? c.purchasedProducts : [];
                    const tagsList = Array.isArray(c.tags) ? c.tags : [];
                    const staffDisplay = c.assignedStaff || c.staffName || "Chưa gán";
                    const hasPhoneForCare = Boolean(String(c.phone || "").replace(/\D/g, "").length >= 9);

                    return (
                      <tr key={c.id || c.code} className="hover:bg-slate-800/30 transition">
                        {/* Cột Tên & Mã */}
                        <td className="py-3.5 px-4 max-w-[230px]">
                          <div className="font-bold text-white hover:text-blue-400 truncate">
                            <Link href={`/customers/${c.id}`}>{c.fullName}</Link>
                          </div>
                          <div className="text-[10px] text-slate-500 flex flex-wrap items-center gap-1.5 mt-0.5">
                            <span>{c.code}</span>
                            {c.age && <span>• {c.age} tuổi</span>}
                            {(c.province || c.address) && (
                              <span className="truncate max-w-[160px]" title={c.address || c.province}>
                                • {c.province || c.address}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Cột SĐT & Kênh */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="font-mono font-semibold text-emerald-400">
                            {c.phone || <span className="text-slate-500 font-sans">Chưa có SĐT</span>}
                          </div>
                          <span className="mt-1 inline-flex items-center gap-1 rounded bg-slate-800/90 text-slate-300 px-1.5 py-0.5 text-[10px] font-medium border border-slate-700/60">
                            <span>{ch.icon}</span>
                            <span>{channelDisplay}</span>
                          </span>
                        </td>

                        {/* Cột Sản phẩm đã mua & Bệnh lý */}
                        <td className="py-3.5 px-4 max-w-[260px]">
                          {productsList.length > 0 ? (
                            <div className="flex flex-wrap gap-1 mb-1">
                              {productsList.slice(0, 3).map((prod) => (
                                <span
                                  key={prod}
                                  className="inline-block rounded bg-cyan-500/15 border border-cyan-500/30 px-1.5 py-0.5 text-[10px] font-medium text-cyan-300 truncate max-w-[180px]"
                                  title={prod}
                                >
                                  {prod}
                                </span>
                              ))}
                              {productsList.length > 3 && (
                                <span className="text-[10px] text-slate-400">
                                  +{productsList.length - 3}
                                </span>
                              )}
                            </div>
                          ) : null}
                          <div
                            className="text-[11px] text-slate-300 truncate"
                            title={c.pathology || "Chưa ghi nhận bệnh lý"}
                          >
                            {c.pathology || (productsList.length === 0 ? "Chưa ghi nhận" : "")}
                          </div>
                          {(c.initialGlucose || c.currentGlucose) && (
                            <div className="flex items-center gap-2 text-[10px] mt-0.5">
                              {c.initialGlucose && (
                                <span className="text-rose-400">ĐH: {c.initialGlucose} mmol/L</span>
                              )}
                              {c.currentGlucose && (
                                <span className="text-emerald-400 font-bold">
                                  Hiện tại: {c.currentGlucose}
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Cột Tổng Chi Tiêu / Mức Độ */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span
                            className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold ${vipInfo.badgeColor}`}
                          >
                            {c.purchaseLevel && c.purchaseLevel !== "Chưa mua"
                              ? c.purchaseLevel
                              : vipInfo.label}
                          </span>
                          <div className="text-[11px] font-semibold text-white mt-1 tabular-nums">
                            {Number(c.totalSpent || 0).toLocaleString("vi-VN")} đ
                          </div>
                          <div className="text-[10px] text-slate-500">{c.totalOrders || 0} đơn hàng</div>
                        </td>

                        {/* Cột Thẻ Tag Lộ Trình */}
                        <td className="py-3.5 px-4 max-w-[200px]">
                          {tagsList.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {tagsList.slice(0, 3).map((tagName) => {
                                const cls =
                                  tagColorMap.get(tagName) ||
                                  "bg-amber-500/15 text-amber-300 border-amber-500/30";
                                return (
                                  <span
                                    key={tagName}
                                    className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}
                                  >
                                    🏷️ {tagName}
                                  </span>
                                );
                              })}
                              {tagsList.length > 3 && (
                                <span className="text-[10px] text-slate-400">
                                  +{tagsList.length - 3}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-500 italic">Chưa gắn thẻ</span>
                          )}
                        </td>

                        {/* Cột NV Phụ Trách */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="font-semibold text-slate-200">{staffDisplay}</span>
                          {c.staffCode && (
                            <span className="block text-[10px] text-slate-500">{c.staffCode}</span>
                          )}
                        </td>

                        {/* Thao tác */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenInboxCare(c)}
                              disabled={!hasPhoneForCare}
                              className="rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 disabled:opacity-40 disabled:cursor-not-allowed border border-emerald-500/40 px-2.5 py-1 text-[11px] font-bold text-emerald-300 transition cursor-pointer"
                              title={
                                hasPhoneForCare
                                  ? `Mở hộp thoại Zalo chăm sóc (${c.phone} - NV: ${staffDisplay})`
                                  : "Khách chưa có SĐT hợp lệ để mở hội thoại"
                              }
                            >
                              💬 Chăm Sóc
                            </button>
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

            {/* Phân trang */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950/40 px-4 py-3 text-xs text-slate-400">
                <span>
                  Trang <strong className="text-white">{currentPage}</strong> / {totalPages} • Hiển thị{" "}
                  <strong className="text-white">{paginatedCustomers.length}</strong> / {customers.length} khách
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                  >
                    ← Trước
                  </button>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                  >
                    Sau →
                  </button>
                </div>
              </div>
            )}
          </>
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
