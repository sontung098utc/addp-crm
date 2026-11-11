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
  const [staffDirectory, setStaffDirectory] = useState([]);
  const [actionMessage, setActionMessage] = useState(null);

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

  // Modal Chỉnh sửa & Xóa khách hàng
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editForm, setEditForm] = useState({
    fullName: "",
    phone: "",
    assignedStaff: "",
    tags: [],
    purchasedProductsText: "",
    notes: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingCustomer, setDeletingCustomer] = useState(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

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
    fetch("/api/staff", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.ok && Array.isArray(data.staff || data.staffList)) {
          setStaffDirectory(data.staff || data.staffList);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [tagFilter, staffFilter, productFilter, purchaseLevelFilter, vipFilter]);

  const staffOptionsList = useMemo(() => {
    const names = new Set();
    for (const s of staffDirectory || []) {
      const n = String(s.fullName || s.name || "").trim();
      if (n) names.add(n);
    }
    for (const s of filterOptions.staffs || []) {
      const n = String(s || "").trim();
      if (n && n !== "Chưa gán") names.add(n);
    }
    if (currentStaff?.fullName) names.add(String(currentStaff.fullName).trim());
    return Array.from(names).sort((a, b) => a.localeCompare(b, "vi"));
  }, [staffDirectory, filterOptions.staffs, currentStaff]);

  const openEditModal = (customer) => {
    setEditingCustomer(customer);
    setEditForm({
      fullName: customer.fullName || "",
      phone: customer.phone || "",
      assignedStaff:
        customer.assignedStaff && customer.assignedStaff !== "Chưa gán"
          ? customer.assignedStaff
          : "",
      tags: Array.isArray(customer.tags) ? [...customer.tags] : [],
      purchasedProductsText: Array.isArray(customer.purchasedProducts)
        ? customer.purchasedProducts.join(", ")
        : "",
      notes: customer.notes || "",
    });
  };

  const handleToggleEditTag = (tagName) => {
    setEditForm((prev) => {
      const exists = prev.tags.includes(tagName);
      return {
        ...prev,
        tags: exists ? prev.tags.filter((t) => t !== tagName) : [...prev.tags, tagName],
      };
    });
  };

  const handleUpdateCustomer = async (e) => {
    e.preventDefault();
    if (!editingCustomer) return;
    if (!editForm.fullName.trim()) {
      alert("Vui lòng nhập họ tên khách hàng.");
      return;
    }
    try {
      setSavingEdit(true);
      const matchedStaffObj = staffDirectory.find(
        (s) =>
          String(s.fullName || s.name || "").trim().toLowerCase() ===
          editForm.assignedStaff.trim().toLowerCase()
      );
      const purchasedProducts = editForm.purchasedProductsText
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);

      const res = await fetch(`/api/customers/${encodeURIComponent(editingCustomer.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: editForm.fullName.trim(),
          phone: editForm.phone.trim(),
          assignedStaff: editForm.assignedStaff.trim() || "Chưa gán",
          staffId: matchedStaffObj?.id,
          tags: editForm.tags,
          purchasedProducts,
          notes: editForm.notes.trim(),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setEditingCustomer(null);
        setActionMessage({ type: "success", text: data.message || "Đã cập nhật thông tin khách hàng." });
        fetchCustomers();
      } else {
        alert(data.error || "Không thể cập nhật thông tin khách hàng.");
      }
    } catch {
      alert("Lỗi kết nối khi cập nhật khách hàng.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleConfirmDeleteCustomer = async () => {
    if (!deletingCustomer) return;
    try {
      setDeletingBusy(true);
      const res = await fetch(`/api/customers/${encodeURIComponent(deletingCustomer.id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.ok) {
        setDeletingCustomer(null);
        setActionMessage({ type: "success", text: data.message || "Đã xóa khách hàng." });
        fetchCustomers();
      } else {
        alert(data.error || "Không thể xóa khách hàng.");
      }
    } catch {
      alert("Lỗi kết nối khi xóa khách hàng.");
    } finally {
      setDeletingBusy(false);
    }
  };

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
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Danh Sách Khách Hàng
            </h1>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
              {customers.length} khách
            </span>
            {currentStaff?.role !== "ADMIN" && currentStaff?.customerScope === "assigned_only" && (
              <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-blue-300 border border-blue-500/20">
                🔒 Phạm vi: Khách phụ trách ({currentStaff.fullName || currentStaff.name})
              </span>
            )}
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
            <span>Thêm Khách Hàng</span>
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-300">
          <span>✅ {actionMessage.text}</span>
          <button
            type="button"
            onClick={() => setActionMessage(null)}
            className="text-emerald-200 hover:text-white font-bold"
          >
            ✕
          </button>
        </div>
      )}

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
            <p>Đang tải danh sách Khách hàng...</p>
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
              <table className="w-full table-fixed min-w-[900px] xl:min-w-0 text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 pl-3.5 pr-2 w-[15%]">Khách Hàng</th>
                    <th className="py-2.5 px-2 w-[12%]">SĐT & Kênh</th>
                    <th className="py-2.5 px-2 w-[17%]">Sản Phẩm / Bệnh Lý</th>
                    <th className="py-2.5 px-2 w-[12%]">Chi Tiêu / Mức Độ</th>
                    <th className="py-2.5 px-2 w-[17%]">Thẻ Tag Lộ Trình</th>
                    <th className="py-2.5 px-2 w-[11%]">NV Phụ Trách</th>
                    <th className="py-2.5 pl-2 pr-3.5 text-right w-[16%]">Thao Tác</th>
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
                      <tr key={c.id || c.code} className="hover:bg-slate-800/30 transition align-middle">
                        {/* Cột Tên & Mã */}
                        <td className="py-2.5 pl-3.5 pr-2">
                          <div className="font-bold text-white hover:text-blue-400 truncate" title={c.fullName}>
                            <Link href={`/customers/${c.id}`}>{c.fullName}</Link>
                          </div>
                          <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5 truncate">
                            <span className="shrink-0">{c.code}</span>
                            {c.age && <span className="shrink-0">• {c.age}t</span>}
                            {(c.province || c.address) && (
                              <span className="truncate" title={c.address || c.province}>
                                • {c.province || c.address}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Cột SĐT & Kênh */}
                        <td className="py-2.5 px-2">
                          <div className="font-mono font-semibold text-emerald-400 truncate text-[11px]">
                            {c.phone || <span className="text-slate-500 font-sans">Chưa có SĐT</span>}
                          </div>
                          <span
                            className="mt-0.5 inline-flex items-center gap-1 rounded bg-slate-800/90 text-slate-300 px-1.5 py-0.5 text-[10px] font-medium border border-slate-700/60 max-w-full truncate"
                            title={channelDisplay}
                          >
                            <span className="shrink-0">{ch.icon}</span>
                            <span className="truncate">{channelDisplay}</span>
                          </span>
                        </td>

                        {/* Cột Sản phẩm đã mua & Bệnh lý */}
                        <td className="py-2.5 px-2">
                          {productsList.length > 0 ? (
                            <div className="flex flex-wrap gap-1 mb-0.5">
                              {productsList.slice(0, 2).map((prod) => (
                                <span
                                  key={prod}
                                  className="inline-block rounded bg-cyan-500/15 border border-cyan-500/30 px-1.5 py-0.5 text-[10px] font-medium text-cyan-300 truncate max-w-full"
                                  title={prod}
                                >
                                  {prod}
                                </span>
                              ))}
                              {productsList.length > 2 && (
                                <span className="text-[10px] text-slate-400">
                                  +{productsList.length - 2}
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
                            <div className="flex items-center gap-1.5 text-[10px] mt-0.5 truncate">
                              {c.initialGlucose && (
                                <span className="text-rose-400">ĐH: {c.initialGlucose}</span>
                              )}
                              {c.currentGlucose && (
                                <span className="text-emerald-400 font-bold">
                                  → {c.currentGlucose}
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Cột Tổng Chi Tiêu / Mức Độ */}
                        <td className="py-2.5 px-2">
                          <span
                            className={`inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-bold truncate max-w-full ${vipInfo.badgeColor}`}
                          >
                            {c.purchaseLevel && c.purchaseLevel !== "Chưa mua"
                              ? c.purchaseLevel
                              : vipInfo.label}
                          </span>
                          <div className="text-[11px] font-semibold text-white mt-0.5 tabular-nums truncate">
                            {Number(c.totalSpent || 0).toLocaleString("vi-VN")} đ
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">{c.totalOrders || 0} đơn</div>
                        </td>

                        {/* Cột Thẻ Tag Lộ Trình */}
                        <td className="py-2.5 px-2">
                          {tagsList.length > 0 ? (
                            <div className="flex flex-wrap gap-1 items-center">
                              {tagsList.slice(0, 2).map((tagName) => {
                                const cls =
                                  tagColorMap.get(tagName) ||
                                  "bg-amber-500/15 text-amber-300 border-amber-500/30";
                                return (
                                  <span
                                    key={tagName}
                                    title={tagName}
                                    className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold truncate max-w-[110px] ${cls}`}
                                  >
                                    {tagName}
                                  </span>
                                );
                              })}
                              {tagsList.length > 2 && (
                                <span
                                  title={tagsList.slice(2).join(", ")}
                                  className="inline-flex items-center rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400"
                                >
                                  +{tagsList.length - 2}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-500 italic">Chưa gắn thẻ</span>
                          )}
                        </td>

                        {/* Cột NV Phụ Trách */}
                        <td className="py-2.5 px-2">
                          <div className="font-semibold text-slate-200 truncate text-[11px]" title={staffDisplay}>
                            {staffDisplay}
                          </div>
                          {c.staffCode && (
                            <span className="block text-[10px] text-slate-500 truncate">{c.staffCode}</span>
                          )}
                        </td>

                        {/* Thao tác (Xếp gọn 2x2 vừa khít 1 khung hình) */}
                        <td className="py-2.5 pl-2 pr-3.5 text-right">
                          <div className="grid grid-cols-2 gap-1 ml-auto w-full max-w-[146px]">
                            <button
                              type="button"
                              onClick={() => handleOpenInboxCare(c)}
                              disabled={!hasPhoneForCare}
                              className="rounded-md bg-emerald-600/20 hover:bg-emerald-600/40 disabled:opacity-40 disabled:cursor-not-allowed border border-emerald-500/40 px-1.5 py-1 text-[10px] font-bold text-emerald-300 transition cursor-pointer truncate text-center"
                              title={
                                hasPhoneForCare
                                  ? `Mở hộp thoại Zalo chăm sóc (${c.phone} - NV: ${staffDisplay})`
                                  : "Khách chưa có SĐT hợp lệ để mở hội thoại"
                              }
                            >
                              💬 Zalo
                            </button>
                            <Link
                              href={`/customers/${c.id}`}
                              className="rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 px-1.5 py-1 text-[10px] font-semibold text-slate-200 transition truncate text-center"
                              title="Xem chi tiết hồ sơ"
                            >
                              Chi Tiết
                            </Link>
                            <button
                              type="button"
                              onClick={() => openEditModal(c)}
                              className="rounded-md bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/40 px-1.5 py-1 text-[10px] font-semibold text-blue-300 transition cursor-pointer truncate text-center"
                              title="Chỉnh sửa thông tin khách hàng"
                            >
                              ✏️ Sửa
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingCustomer(c)}
                              className="rounded-md bg-rose-600/15 hover:bg-rose-600/35 border border-rose-500/35 px-1.5 py-1 text-[10px] font-semibold text-rose-300 transition cursor-pointer truncate text-center"
                              title="Xóa khách hàng này"
                            >
                              🗑️ Xóa
                            </button>
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

      {/* Modal Thêm Khách Hàng */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Thêm Hồ Sơ Khách Hàng Mới</h3>
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
                  {savingNew ? "Đang lưu..." : "Lưu Khách Hàng"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Chỉnh sửa Khách hàng */}
      {editingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">✏️ Chỉnh Sửa Thông Tin Khách Hàng</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Mã: {editingCustomer.code || editingCustomer.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingCustomer(null)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateCustomer} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Họ và tên khách hàng *</label>
                  <input
                    type="text"
                    required
                    value={editForm.fullName}
                    onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Số điện thoại (10 số VN)</label>
                  <input
                    type="text"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    placeholder="VD: 0912345678"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white font-mono focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Nhân viên phụ trách</label>
                <select
                  value={editForm.assignedStaff}
                  onChange={(e) => setEditForm({ ...editForm, assignedStaff: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="">-- Chưa gán --</option>
                  {staffOptionsList.map((staffName) => (
                    <option key={staffName} value={staffName}>
                      {staffName}
                    </option>
                  ))}
                  {editForm.assignedStaff && !staffOptionsList.includes(editForm.assignedStaff) && (
                    <option value={editForm.assignedStaff}>{editForm.assignedStaff}</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1.5 font-semibold">
                  Thẻ Tag Lộ trình / Phân loại ({editForm.tags.length} đang gắn)
                </label>
                {tagCatalog.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-800 bg-slate-950/70 p-2.5 max-h-36 overflow-y-auto">
                    {tagCatalog.map((tag) => {
                      const active = editForm.tags.includes(tag.name);
                      return (
                        <button
                          key={tag.id || tag.name}
                          type="button"
                          onClick={() => handleToggleEditTag(tag.name)}
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                            active
                              ? "border-blue-500 bg-blue-600/30 text-white"
                              : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500"
                          }`}
                        >
                          {active ? "✓ " : ""}
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 italic">
                    Chưa có thẻ tag nào trong hệ thống. Tạo thẻ mới tại mục Quản lý Thẻ Tag.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">
                  Sản phẩm đã mua (phân cách bằng dấu phẩy)
                </label>
                <input
                  type="text"
                  value={editForm.purchasedProductsText}
                  onChange={(e) => setEditForm({ ...editForm, purchasedProductsText: e.target.value })}
                  placeholder="VD: Sữa hạt Glucare Plus, Viên sủi Dovital"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Ghi chú chăm sóc</label>
                <textarea
                  rows={2}
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  placeholder="Ghi chú nội bộ về khách hàng..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingCustomer(null)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 font-semibold text-slate-300 hover:text-white"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {savingEdit ? "Đang lưu..." : "Lưu Thay Đổi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Xác Nhận Xóa Khách hàng */}
      {deletingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-slate-900 p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-rose-400">🗑️ Xác Nhận Xóa Khách Hàng</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Bạn có chắc chắn muốn xóa hồ sơ khách hàng{" "}
              <strong className="text-white">{deletingCustomer.fullName}</strong> (SĐT:{" "}
              <span className="font-mono text-amber-300">{deletingCustomer.phone || "Chưa có"}</span>)?
              Thao tác này sẽ xóa khách hàng và các thẻ tag gắn kèm khỏi hệ thống.
            </p>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setDeletingCustomer(null)}
                disabled={deletingBusy}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteCustomer}
                disabled={deletingBusy}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-50"
              >
                {deletingBusy ? "Đang xóa..." : "Xác Nhận Xóa"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
