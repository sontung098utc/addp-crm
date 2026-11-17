"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Send } from "lucide-react";
import { VIP_LEVELS, calculateVipLevel } from "@/lib/customerTiers";
import BulkMessageModal from "../components/BulkMessageModal";

const CHANNEL_META = {
  KHACHHANG_OLD: {
    label: "khachhang.addp.vn",
    icon: "📦",
    badgeClass: "bg-purple-500/15 text-purple-300 border-purple-500/35",
  },
  FACEBOOK: {
    label: "Facebook",
    icon: "📘",
    badgeClass: "bg-blue-500/15 text-blue-300 border-blue-500/35",
  },
  ZALO_PERSONAL: {
    label: "Zalo",
    icon: "💬",
    badgeClass: "bg-cyan-500/15 text-cyan-300 border-cyan-500/35",
  },
  ZALO_OA: {
    label: "Zalo OA",
    icon: "📱",
    badgeClass: "bg-sky-500/15 text-sky-300 border-sky-500/35",
  },
  TIKTOK: {
    label: "TikTok Shop",
    icon: "🎵",
    badgeClass: "bg-zinc-950 text-zinc-100 border-zinc-600",
  },
  TIKTOK_SHOP: {
    label: "TikTok Shop",
    icon: "🎵",
    badgeClass: "bg-zinc-950 text-zinc-100 border-zinc-600",
  },
  SHOPEE: {
    label: "Shopee",
    icon: "🟧",
    badgeClass: "bg-orange-500/15 text-orange-300 border-orange-500/40",
  },
  WEBSITE: {
    label: "Website",
    icon: "🌐",
    badgeClass: "bg-sky-500/15 text-sky-300 border-sky-500/35",
  },
  WEBSITE_MAGENTO: {
    label: "Website",
    icon: "🌐",
    badgeClass: "bg-sky-500/15 text-sky-300 border-sky-500/35",
  },
  KIOTVIET: {
    label: "KiotViet POS",
    icon: "🏪",
    badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/35",
  },
  CALL: {
    label: "Hotline",
    icon: "📞",
    badgeClass: "bg-teal-500/15 text-teal-300 border-teal-500/35",
  },
  OTHER: {
    label: "Hệ thống cũ",
    icon: "📦",
    badgeClass: "bg-purple-500/15 text-purple-300 border-purple-500/35",
  },
};

function resolveCustomerChannelBadge(customer = {}) {
  const key = String(
    customer.normalizedPlatform ||
      customer.sourceChannel ||
      customer.source ||
      customer.channel ||
      "KHACHHANG_OLD"
  )
    .trim()
    .toUpperCase();
  const base = CHANNEL_META[key] || {
    label: customer.channelLabel || key || "Hệ thống cũ",
    icon: "🏷️",
    badgeClass: "bg-slate-800 text-slate-300 border-slate-700",
  };
  return {
    key,
    icon: base.icon,
    label:
      key === "KHACHHANG_OLD" && customer.channelLabel && !/khachhang/i.test(customer.channelLabel)
        ? customer.channelLabel
        : base.label,
    badgeClass: base.badgeClass,
    isLegacy: Boolean(customer.isLegacySource || customer.migratedFrom === "khachhang.addp.vn"),
  };
}

const PAGE_SIZE = 50;

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [tagCatalog, setTagCatalog] = useState([]);
  const [filterOptions, setFilterOptions] = useState({
    tags: [],
    staffs: [],
    products: [],
    purchaseLevels: [],
    platforms: [],
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState("all");
  const [tagFilter, setTagFilter] = useState("ALL");
  const [staffFilter, setStaffFilter] = useState("ALL");
  const [productFilter, setProductFilter] = useState("ALL");
  const [purchaseLevelFilter, setPurchaseLevelFilter] = useState("ALL");
  const [vipFilter, setVipFilter] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [currentStaff, setCurrentStaff] = useState(null);
  const [staffDirectory, setStaffDirectory] = useState([]);
  const [actionMessage, setActionMessage] = useState(null);
  const [syncingKiotViet, setSyncingKiotViet] = useState(false);

  const handleSyncKiotVietFrom2026 = async () => {
    if (syncingKiotViet) return;
    try {
      setSyncingKiotViet(true);
      const res = await fetch("/api/orders/kiotviet/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "full",
          fromDate: "2026-01-01",
          maxPages: 100,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        setActionMessage({
          text: data.message || `Đã đồng bộ ${data.syncedCount || 0} đơn hàng & khách hàng KiotViet từ 01/01/2026!`,
        });
        await fetchCustomers();
      } else {
        setActionMessage({
          text: data?.error || "Không thể đồng bộ KiotViet. Vui lòng thử lại.",
        });
      }
    } catch (err) {
      setActionMessage({ text: `Lỗi kết nối đồng bộ KiotViet: ${err.message}` });
    } finally {
      setSyncingKiotViet(false);
    }
  };

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

  // Chọn hàng loạt & Thao tác hàng loạt (Bulk Selection / Bulk Tag / Bulk Delete / Bulk Message)
  const [selectedCustomerIds, setSelectedCustomerIds] = useState([]);
  const [isBulkTagModalOpen, setIsBulkTagModalOpen] = useState(false);
  const [selectedBulkTagId, setSelectedBulkTagId] = useState("");
  const [customBulkTagName, setCustomBulkTagName] = useState("");
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [isBulkMessageModalOpen, setIsBulkMessageModalOpen] = useState(false);
  const [zaloAccounts, setZaloAccounts] = useState([]);
  const [bulkActionBusy, setBulkActionBusy] = useState(false);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (selectedPlatform && selectedPlatform !== "all") params.set("platform", selectedPlatform);
      if (tagFilter !== "ALL") params.set("tag", tagFilter);
      if (staffFilter !== "ALL") params.set("staff", staffFilter);
      if (productFilter !== "ALL") params.set("product", productFilter);
      if (purchaseLevelFilter !== "ALL") params.set("purchaseLevel", purchaseLevelFilter);
      if (vipFilter !== "ALL") params.set("vipLevel", vipFilter);

      const res = await fetch(`/api/customers?${params.toString()}`);
      const data = await res.json();
      if (data.ok) {
        setCustomers(data.customers || []);
        setSelectedCustomerIds([]);
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

    fetch("/api/channels", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.ok && Array.isArray(data.channels)) {
          const zaloChs = data.channels.filter(
            (ch) =>
              ch.platform === "ZALO_PERSONAL" ||
              ch.type === "zalo_personal" ||
              ch.platform === "ZALO_OA"
          );
          setZaloAccounts(zaloChs);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [selectedPlatform, tagFilter, staffFilter, productFilter, purchaseLevelFilter, vipFilter]);

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

  const handleBulkDelete = () => {
    if (selectedCustomerIds.length === 0) return;
    setIsBulkDeleteModalOpen(true);
  };

  const handleConfirmBulkDelete = async () => {
    if (selectedCustomerIds.length === 0) return;
    try {
      setBulkActionBusy(true);
      const res = await fetch("/api/customers/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          customerIds: selectedCustomerIds,
        }),
      });
      const data = await res.json();
      if (data.ok || data.success) {
        setIsBulkDeleteModalOpen(false);
        setSelectedCustomerIds([]);
        setActionMessage({
          type: "success",
          text: data.message || `Đã xóa thành công ${data.count || 0} khách hàng.`,
        });
        fetchCustomers();
      } else {
        alert(data.error || "Không thể xóa hàng loạt khách hàng.");
      }
    } catch {
      alert("Lỗi kết nối khi xóa hàng loạt khách hàng.");
    } finally {
      setBulkActionBusy(false);
    }
  };

  const handleConfirmBulkAddTag = async (e) => {
    e?.preventDefault();
    if (selectedCustomerIds.length === 0) return;
    const tagIdTrimmed = String(selectedBulkTagId || "").trim();
    const tagNameTrimmed = String(customBulkTagName || "").trim();
    if (!tagIdTrimmed && !tagNameTrimmed) {
      alert("Vui lòng chọn thẻ tag hoặc nhập tên thẻ mới.");
      return;
    }

    try {
      setBulkActionBusy(true);
      const res = await fetch("/api/customers/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_tag",
          customerIds: selectedCustomerIds,
          tagId: tagIdTrimmed,
          tagName: tagNameTrimmed,
        }),
      });
      const data = await res.json();
      if (data.ok || data.success) {
        setIsBulkTagModalOpen(false);
        setSelectedBulkTagId("");
        setCustomBulkTagName("");
        setSelectedCustomerIds([]);
        setActionMessage({
          type: "success",
          text:
            data.message ||
            `Đã gắn thẻ "${data.tag || tagNameTrimmed || tagIdTrimmed}" cho ${data.count || 0} khách hàng.`,
        });
        fetchCustomers();
      } else {
        alert(data.error || "Không thể gắn thẻ hàng loạt.");
      }
    } catch {
      alert("Lỗi kết nối khi gắn thẻ hàng loạt.");
    } finally {
      setBulkActionBusy(false);
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

  const selectedCustomers = useMemo(() => {
    if (selectedCustomerIds.length === 0) return [];
    const idSet = new Set(selectedCustomerIds);
    return customers
      .filter((c) => idSet.has(c.id))
      .map((c) => ({
        id: c.id,
        name: c.fullName || c.name || "Khách hàng",
        fullName: c.fullName || c.name || "Khách hàng",
        phone: c.phone || "",
        zaloId: c.zaloUid || c.zaloThreadId || c.zaloId || null,
        zaloUid: c.zaloUid || c.zaloThreadId || c.zaloId || null,
        zaloThreadId: c.zaloThreadId || c.zaloUid || c.threadId || null,
        threadId: c.zaloThreadId || c.threadId || null,
        facebookId: c.facebookId || c.psid || null,
        zaloOaUserId: c.zaloOaUserId || c.oaUserId || null,
        channel:
          c.normalizedPlatform ||
          c.sourceChannel ||
          c.source ||
          c.channel ||
          "ZALO_PERSONAL",
        pathology: c.pathology || "",
        assignedStaff: c.assignedStaff || c.staffName || "",
        purchasedProducts: Array.isArray(c.purchasedProducts) ? c.purchasedProducts : [],
        tags: Array.isArray(c.tags) ? c.tags : [],
      }));
  }, [customers, selectedCustomerIds]);

  const selectedValidContactCount = useMemo(() => {
    return selectedCustomers.filter((c) => {
      const phoneDigits = String(c.phone || "").replace(/\D/g, "");
      return (
        phoneDigits.length >= 9 ||
        Boolean(c.zaloUid || c.zaloThreadId || c.zaloId || c.facebookId)
      );
    }).length;
  }, [selectedCustomers]);

  const hasActiveFilters =
    search.trim() !== "" ||
    selectedPlatform !== "all" ||
    tagFilter !== "ALL" ||
    staffFilter !== "ALL" ||
    productFilter !== "ALL" ||
    purchaseLevelFilter !== "ALL" ||
    vipFilter !== "ALL";

  const handleResetFilters = () => {
    setSearch("");
    setSelectedPlatform("all");
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
    const zaloUid = String(customer.zaloUid || customer.zaloThreadId || "").trim();
    const staffParam = customer.assignedStaff || customer.staffName || "";
    const qs = new URLSearchParams();
    if (cleanPhone) qs.set("phone", cleanPhone);
    if (zaloUid) qs.set("zaloUid", zaloUid);
    if (customer.fullName) qs.set("name", String(customer.fullName).trim());
    if (customer.id) qs.set("customerId", String(customer.id));
    if (staffParam) qs.set("staff", staffParam);
    qs.set("autoOpen", "true");
    window.open(`/inbox?${qs.toString()}`, "_blank");
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

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSyncKiotVietFrom2026}
            disabled={syncingKiotViet}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-600/15 px-3.5 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-xs font-semibold text-emerald-300 hover:bg-emerald-600 hover:text-white transition cursor-pointer disabled:opacity-60"
            title="Kéo toàn bộ đơn hàng & khách hàng từ KiotViet từ ngày 01/01/2026 đến nay"
          >
            <span>{syncingKiotViet ? "⏳ Đang đồng bộ KiotViet..." : "🔄 Đồng bộ KiotViet từ 01/01/2026"}</span>
          </button>
          <Link
            href="/settings/tags"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-xs font-semibold text-slate-200 hover:bg-slate-800 transition"
          >
            <span>🏷️</span>
            <span>Quản Lý Thẻ Tag</span>
          </Link>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-xs font-bold text-white hover:bg-blue-500 transition shadow-lg shadow-blue-600/30 cursor-pointer"
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
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3.5 sm:p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2.5">
          {/* Ô tìm kiếm */}
          <form onSubmit={handleSearchSubmit} className="lg:col-span-2 relative">
            <input
              type="text"
              placeholder="Tìm Tên, SĐT 10 số, Sản phẩm, Bệnh lý..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-9 pr-16 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-base sm:text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
            <span className="absolute left-3 top-3 sm:top-2.5 text-slate-500 text-xs">🔍</span>
            <button
              type="submit"
              className="absolute right-1.5 top-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 px-3 py-1.5 sm:px-2.5 sm:py-1 min-h-[32px] sm:min-h-0 text-xs sm:text-[11px] font-semibold text-slate-200 transition cursor-pointer"
            >
              Tìm
            </button>
          </form>

          {/* Lọc theo Nền tảng / Nguồn khách hàng */}
          <div className="relative">
            <select
              value={selectedPlatform}
              onChange={(e) => {
                setSelectedPlatform(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-base sm:text-xs text-white focus:border-blue-500 focus:outline-none cursor-pointer"
              title="Lọc khách hàng theo nền tảng / nguồn"
            >
              <option value="all">🌐 Tất Cả Nền Tảng</option>
              {(filterOptions.platforms && filterOptions.platforms.length > 0
                ? filterOptions.platforms
                : [
                    { value: "KHACHHANG_OLD", label: "📦 Hệ thống cũ (khachhang.addp.vn / Vpage)" },
                    { value: "FACEBOOK", label: "📘 Fanpage Facebook" },
                    { value: "ZALO_PERSONAL", label: "💬 Zalo Cá Nhân" },
                    { value: "TIKTOK", label: "🎵 TikTok Shop" },
                    { value: "SHOPEE", label: "🟧 Shopee" },
                    { value: "WEBSITE", label: "🌐 Website ADDP (Magento)" },
                  ]
              ).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.count !== undefined ? `${opt.label} (${opt.count})` : opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Lọc theo Thẻ Tag Lộ trình */}
          <div>
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-base sm:text-xs text-white focus:border-blue-500 focus:outline-none"
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
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-base sm:text-xs text-white focus:border-blue-500 focus:outline-none"
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
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-base sm:text-xs text-white focus:border-blue-500 focus:outline-none"
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
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-base sm:text-xs text-white focus:border-blue-500 focus:outline-none"
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
            {/* Mobile Stacked Cards (< md) */}
            <div className="md:hidden divide-y divide-slate-800/70">
              <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/60 text-xs text-slate-400">
                <label className="flex items-center gap-2.5 cursor-pointer min-h-[36px]">
                  <input
                    type="checkbox"
                    checked={customers.length > 0 && selectedCustomerIds.length === customers.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedCustomerIds(customers.map((c) => c.id));
                      } else {
                        setSelectedCustomerIds([]);
                      }
                    }}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="font-semibold text-slate-300">Chọn tất cả ({customers.length})</span>
                </label>
                <span className="text-[11px] text-slate-500">Trang {currentPage}/{totalPages}</span>
              </div>

              {paginatedCustomers.map((c) => {
                const vipInfo =
                  (c.vipLevel && VIP_LEVELS[c.vipLevel]) ||
                  calculateVipLevel(c.totalOrders, c.totalSpent) ||
                  VIP_LEVELS.POTENTIAL;
                const chBadge = resolveCustomerChannelBadge(c);
                const productsList = Array.isArray(c.purchasedProducts) ? c.purchasedProducts : [];
                const tagsList = Array.isArray(c.tags) ? c.tags : [];
                const staffDisplay = c.assignedStaff || c.staffName || "Chưa gán";
                const hasPhoneForCare = Boolean(
                  String(c.phone || "").replace(/\D/g, "").length >= 9 ||
                    c.zaloUid ||
                    c.zaloThreadId
                );
                const isRowSelected = selectedCustomerIds.includes(c.id);

                return (
                  <div
                    key={c.id || c.code}
                    className={`p-4 space-y-3 ${isRowSelected ? "bg-blue-950/25" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <label className="pt-0.5 cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={isRowSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedCustomerIds((prev) =>
                                  prev.includes(c.id) ? prev : [...prev, c.id]
                                );
                              } else {
                                setSelectedCustomerIds((prev) => prev.filter((id) => id !== c.id));
                              }
                            }}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </label>
                        <div className="min-w-0">
                          <Link
                            href={`/customers/${c.id}`}
                            className="font-bold text-sm text-white hover:text-blue-400 block truncate"
                          >
                            {c.fullName}
                          </Link>
                          <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
                            <span>{c.code}</span>
                            {c.age && <span>• {c.age}t</span>}
                            {(c.province || c.address) && (
                              <span className="truncate max-w-[180px]">• {c.province || c.address}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold shrink-0 ${vipInfo.badgeColor}`}
                      >
                        {c.purchaseLevel && c.purchaseLevel !== "Chưa mua"
                          ? c.purchaseLevel
                          : vipInfo.label}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-950/70 border border-slate-800/80 px-3 py-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <span className="font-mono font-semibold text-emerald-400">
                          {c.phone || "Chưa có SĐT"}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold border ${chBadge.badgeClass}`}
                        >
                          <span>{chBadge.icon}</span>
                          <span>{chBadge.label}</span>
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-bold text-white tabular-nums">
                          {Number(c.totalSpent || 0).toLocaleString("vi-VN")} đ
                        </span>
                        <span className="text-[10px] text-slate-400 ml-1">({c.totalOrders || 0} đơn)</span>
                      </div>
                    </div>

                    {(productsList.length > 0 || c.pathology || c.initialGlucose || c.currentGlucose) && (
                      <div className="space-y-1 text-xs">
                        {productsList.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {productsList.slice(0, 3).map((prod) => (
                              <span
                                key={prod}
                                className="inline-block rounded bg-cyan-500/15 border border-cyan-500/30 px-1.5 py-0.5 text-[10px] font-medium text-cyan-300"
                              >
                                {prod}
                              </span>
                            ))}
                            {productsList.length > 3 && (
                              <span className="text-[10px] text-slate-400">+{productsList.length - 3}</span>
                            )}
                          </div>
                        )}
                        {c.pathology && <div className="text-[11px] text-slate-300">{c.pathology}</div>}
                        {(c.initialGlucose || c.currentGlucose) && (
                          <div className="flex items-center gap-1.5 text-[11px]">
                            {c.initialGlucose && <span className="text-rose-400">ĐH: {c.initialGlucose}</span>}
                            {c.currentGlucose && (
                              <span className="text-emerald-400 font-bold">→ {c.currentGlucose}</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <div className="flex flex-wrap gap-1 items-center min-w-0">
                        {tagsList.length > 0 ? (
                          <>
                            {tagsList.slice(0, 3).map((tagName) => {
                              const cls =
                                tagColorMap.get(tagName) ||
                                "bg-amber-500/15 text-amber-300 border-amber-500/30";
                              return (
                                <span
                                  key={tagName}
                                  className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}
                                >
                                  {tagName}
                                </span>
                              );
                            })}
                            {tagsList.length > 3 && (
                              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                                +{tagsList.length - 3}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-[10px] text-slate-500 italic">Chưa gắn thẻ</span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400 shrink-0">
                        NV: <strong className="text-slate-200">{staffDisplay}</strong>
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleOpenInboxCare(c)}
                        disabled={!hasPhoneForCare}
                        className="rounded-xl bg-emerald-600/20 hover:bg-emerald-600/40 disabled:opacity-40 disabled:cursor-not-allowed border border-emerald-500/40 px-2.5 py-2 min-h-[40px] text-xs font-bold text-emerald-300 transition cursor-pointer text-center"
                      >
                        💬 Zalo
                      </button>
                      <Link
                        href={`/customers/${c.id}`}
                        className="inline-flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2.5 py-2 min-h-[40px] text-xs font-semibold text-slate-200 transition text-center"
                      >
                        Chi Tiết
                      </Link>
                      <button
                        type="button"
                        onClick={() => openEditModal(c)}
                        className="rounded-xl bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/40 px-2.5 py-2 min-h-[40px] text-xs font-semibold text-blue-300 transition cursor-pointer text-center"
                      >
                        ✏️ Sửa
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingCustomer(c)}
                        className="rounded-xl bg-rose-600/15 hover:bg-rose-600/35 border border-rose-500/35 px-2.5 py-2 min-h-[40px] text-xs font-semibold text-rose-300 transition cursor-pointer text-center"
                      >
                        🗑️ Xóa
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table (>= md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full table-fixed min-w-[900px] xl:min-w-0 text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="w-10 px-3 py-3">
                      <input
                        type="checkbox"
                        checked={customers.length > 0 && selectedCustomerIds.length === customers.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedCustomerIds(customers.map((c) => c.id));
                          } else {
                            setSelectedCustomerIds([]);
                          }
                        }}
                        title="Chọn / Bỏ chọn tất cả khách hàng"
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </th>
                    <th className="py-2.5 pl-2 pr-2 w-[14%]">Khách Hàng</th>
                    <th className="py-2.5 px-2 w-[12%]">SĐT & Kênh</th>
                    <th className="py-2.5 px-2 w-[16%]">Sản Phẩm / Bệnh Lý</th>
                    <th className="py-2.5 px-2 w-[11%]">Chi Tiêu / Mức Độ</th>
                    <th className="py-2.5 px-2 w-[16%]">Thẻ Tag Lộ Trình</th>
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
                    const chBadge = resolveCustomerChannelBadge(c);
                    const productsList = Array.isArray(c.purchasedProducts) ? c.purchasedProducts : [];
                    const tagsList = Array.isArray(c.tags) ? c.tags : [];
                    const staffDisplay = c.assignedStaff || c.staffName || "Chưa gán";
                    const hasPhoneForCare = Boolean(
                      String(c.phone || "").replace(/\D/g, "").length >= 9 ||
                        c.zaloUid ||
                        c.zaloThreadId
                    );
                    const isRowSelected = selectedCustomerIds.includes(c.id);

                    return (
                      <tr
                        key={c.id || c.code}
                        className={`hover:bg-slate-800/30 transition align-middle ${
                          isRowSelected ? "bg-blue-950/25" : ""
                        }`}
                      >
                        {/* Cột Checkbox */}
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={isRowSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedCustomerIds((prev) =>
                                  prev.includes(c.id) ? prev : [...prev, c.id]
                                );
                              } else {
                                setSelectedCustomerIds((prev) => prev.filter((id) => id !== c.id));
                              }
                            }}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>

                        {/* Cột Tên & Mã */}
                        <td className="py-2.5 pl-2 pr-2">
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
                            className={`mt-0.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold border max-w-full truncate ${chBadge.badgeClass}`}
                            title={
                              chBadge.isLegacy
                                ? `${chBadge.label} • Đồng bộ từ khachhang.addp.vn`
                                : chBadge.label
                            }
                          >
                            <span className="shrink-0">{chBadge.icon}</span>
                            <span className="truncate">{chBadge.label}</span>
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
                                  ? `Mở hộp thoại Zalo chăm sóc (${c.phone || c.zaloUid} - NV: ${staffDisplay})`
                                  : "Khách chưa có SĐT hợp lệ hoặc Zalo UID để mở hội thoại"
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
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-800 bg-slate-950/40 px-4 py-3 text-xs text-slate-400">
                <span>
                  Trang <strong className="text-white">{currentPage}</strong> / {totalPages} • Hiển thị{" "}
                  <strong className="text-white">{paginatedCustomers.length}</strong> / {customers.length} khách
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 sm:px-3 sm:py-1 min-h-[40px] sm:min-h-0 text-xs sm:text-[11px] font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                  >
                    ← Trước
                  </button>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 sm:px-3 sm:py-1 min-h-[40px] sm:min-h-0 text-xs sm:text-[11px] font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg max-h-[92dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4 shrink-0">
              <h3 className="text-base font-bold text-white">Thêm Hồ Sơ Khách Hàng Mới</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                aria-label="Đóng"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="flex flex-col flex-1 min-h-0 text-xs">
              <div className="p-5 overflow-y-auto flex-1 min-h-0 space-y-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Họ và tên khách hàng *</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Bác Trần Văn Nam"
                    value={newCustomerForm.fullName}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, fullName: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-base sm:text-xs text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 mb-1 font-semibold">Số điện thoại * (Tự chuẩn hóa)</label>
                    <input
                      type="text"
                      required
                      placeholder="VD: 0912345678"
                      value={newCustomerForm.phone}
                      onChange={(e) => setNewCustomerForm({ ...newCustomerForm, phone: e.target.value })}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-base sm:text-xs text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1 font-semibold">Độ tuổi</label>
                    <input
                      type="number"
                      placeholder="VD: 58"
                      value={newCustomerForm.age}
                      onChange={(e) => setNewCustomerForm({ ...newCustomerForm, age: e.target.value })}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-base sm:text-xs text-white focus:border-blue-500 focus:outline-none"
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
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-base sm:text-xs text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 mb-1 font-semibold">Đường huyết lúc đói (mmol/L)</label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="VD: 8.5"
                      value={newCustomerForm.initialGlucose}
                      onChange={(e) => setNewCustomerForm({ ...newCustomerForm, initialGlucose: e.target.value })}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-base sm:text-xs text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1 font-semibold">Nguồn tiếp nhận</label>
                    <select
                      value={newCustomerForm.source}
                      onChange={(e) => setNewCustomerForm({ ...newCustomerForm, source: e.target.value })}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-base sm:text-xs text-white focus:border-blue-500 focus:outline-none"
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
              </div>

              <div className="flex flex-wrap justify-end gap-2 px-5 py-3.5 border-t border-slate-800 shrink-0 bg-slate-900">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 font-semibold text-slate-300 hover:text-white cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={savingNew}
                  className="rounded-xl bg-blue-600 px-4 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 font-bold text-white hover:bg-blue-500 disabled:opacity-50 cursor-pointer"
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg max-h-[92dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4 shrink-0">
              <div className="min-w-0 pr-2">
                <h3 className="text-base font-bold text-white">✏️ Chỉnh Sửa Thông Tin Khách Hàng</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Mã: {editingCustomer.code || editingCustomer.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingCustomer(null)}
                aria-label="Đóng"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 text-lg font-bold cursor-pointer shrink-0"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateCustomer} className="flex flex-col flex-1 min-h-0 text-xs">
              <div className="p-5 overflow-y-auto flex-1 min-h-0 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 mb-1 font-semibold">Họ và tên khách hàng *</label>
                    <input
                      type="text"
                      required
                      value={editForm.fullName}
                      onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-base sm:text-xs text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1 font-semibold">Số điện thoại (10 số VN)</label>
                    <input
                      type="text"
                      value={editForm.phone}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                      placeholder="VD: 0912345678"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-base sm:text-xs text-white font-mono focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Nhân viên phụ trách</label>
                  <select
                    value={editForm.assignedStaff}
                    onChange={(e) => setEditForm({ ...editForm, assignedStaff: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-base sm:text-xs text-white focus:border-blue-500 focus:outline-none"
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
                            className={`rounded-full border px-3 py-1.5 sm:px-2.5 sm:py-1 min-h-[36px] sm:min-h-0 text-xs sm:text-[11px] font-medium transition cursor-pointer ${
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
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-base sm:text-xs text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Ghi chú chăm sóc</label>
                  <textarea
                    rows={2}
                    value={editForm.notes}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    placeholder="Ghi chú nội bộ về khách hàng..."
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-base sm:text-xs text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2 px-5 py-3.5 border-t border-slate-800 shrink-0 bg-slate-900">
                <button
                  type="button"
                  onClick={() => setEditingCustomer(null)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 font-semibold text-slate-300 hover:text-white cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="rounded-xl bg-blue-600 px-4 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 font-bold text-white hover:bg-blue-500 disabled:opacity-50 cursor-pointer"
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4 backdrop-blur-sm">
          <div className="w-full max-w-md max-h-[92dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-rose-500/30 bg-slate-900 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 shrink-0">
              <h3 className="text-base font-bold text-rose-400">🗑️ Xác Nhận Xóa Khách Hàng</h3>
            </div>
            <div className="p-5 overflow-y-auto flex-1 min-h-0">
              <p className="text-xs text-slate-300 leading-relaxed">
                Bạn có chắc chắn muốn xóa hồ sơ khách hàng{" "}
                <strong className="text-white">{deletingCustomer.fullName}</strong> (SĐT:{" "}
                <span className="font-mono text-amber-300">{deletingCustomer.phone || "Chưa có"}</span>)?
                Thao tác này sẽ xóa khách hàng và các thẻ tag gắn kèm khỏi hệ thống.
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2 px-5 py-3.5 border-t border-slate-800 shrink-0 bg-slate-900">
              <button
                type="button"
                onClick={() => setDeletingCustomer(null)}
                disabled={deletingBusy}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteCustomer}
                disabled={deletingBusy}
                className="rounded-xl bg-rose-600 px-4 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-50 cursor-pointer"
              >
                {deletingBusy ? "Đang xóa..." : "Xác Nhận Xóa"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Thanh Tác Vụ Hàng Loạt Nổi (Floating Bulk Action Bar) */}
      {selectedCustomerIds.length > 0 && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 transform -translate-x-1/2 bg-slate-900 text-white px-4 py-3 sm:px-6 sm:py-3.5 rounded-2xl shadow-2xl flex flex-wrap items-center justify-center sm:justify-start gap-2 sm:gap-3 z-50 border border-slate-700 w-[calc(100%-1.5rem)] sm:w-auto max-w-[95vw]">
          <span className="text-xs sm:text-sm font-medium whitespace-nowrap">
            Đã chọn <b className="text-blue-400">{selectedCustomerIds.length}</b> khách hàng
            <span className="ml-1.5 text-xs text-emerald-400">
              ({selectedValidContactCount} có SĐT/Zalo)
            </span>
          </span>

          <div className="h-5 w-[1px] bg-slate-700 hidden sm:block" />

          <button
            type="button"
            onClick={() => setIsBulkMessageModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 sm:py-1.5 min-h-[40px] sm:min-h-0 bg-gradient-to-r from-purple-600 to-emerald-600 hover:from-purple-500 hover:to-emerald-500 text-white rounded-xl sm:rounded-lg text-xs font-bold shadow-md shadow-purple-500/20 transition-all cursor-pointer whitespace-nowrap"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Gửi Tin Nhắn Hàng Loạt</span>
          </button>

          <button
            type="button"
            onClick={() => setIsBulkTagModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 sm:py-1.5 min-h-[40px] sm:min-h-0 bg-blue-600 hover:bg-blue-500 rounded-xl sm:rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap"
          >
            🏷️ Gắn Thẻ Hàng Loạt
          </button>

          <button
            type="button"
            onClick={handleBulkDelete}
            className="flex items-center gap-1.5 px-3 py-2 sm:py-1.5 min-h-[40px] sm:min-h-0 bg-rose-600 hover:bg-rose-500 rounded-xl sm:rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap"
          >
            🗑️ Xóa Hàng Loạt
          </button>

          <button
            type="button"
            onClick={() => setSelectedCustomerIds([])}
            className="text-xs text-slate-400 hover:text-white px-2 py-2 sm:py-1 min-h-[40px] sm:min-h-0 cursor-pointer whitespace-nowrap"
          >
            Bỏ chọn
          </button>
        </div>
      )}

      {/* Modal Gắn Thẻ Hàng Loạt */}
      {isBulkTagModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4 backdrop-blur-sm">
          <form
            onSubmit={handleConfirmBulkAddTag}
            className="w-full max-w-md max-h-[92dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl text-xs overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4 shrink-0">
              <h3 className="text-base font-bold text-white">
                🏷️ Gắn Thẻ Cho {selectedCustomerIds.length} Khách Hàng
              </h3>
              <button
                type="button"
                onClick={() => setIsBulkTagModalOpen(false)}
                aria-label="Đóng"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer shrink-0"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 min-h-0 space-y-4">
              <div>
                <label className="block text-slate-300 mb-2 font-semibold">
                  Chọn thẻ có sẵn trong hệ thống
                </label>
                {tagCatalog.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-3">
                    {tagCatalog.map((tag) => {
                      const isSelected =
                        selectedBulkTagId === tag.id || selectedBulkTagId === tag.name;
                      return (
                        <button
                          key={tag.id || tag.name}
                          type="button"
                          onClick={() => {
                            setSelectedBulkTagId(isSelected ? "" : tag.id || tag.name);
                            if (!isSelected) setCustomBulkTagName("");
                          }}
                          className={`rounded-md border px-3 py-1.5 sm:px-2.5 sm:py-1 min-h-[36px] sm:min-h-0 text-xs sm:text-[11px] font-semibold transition cursor-pointer ${
                            isSelected
                              ? "bg-blue-600/30 border-blue-400 text-blue-200 ring-1 ring-blue-400"
                              : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800"
                          }`}
                        >
                          {isSelected ? "✓ " : ""}
                          🏷️ {tag.name}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 italic">
                    Chưa có thẻ sẵn trong danh mục. Nhập tên thẻ mới ở ô bên dưới.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-slate-300 mb-1.5 font-semibold">
                  Hoặc nhập tên thẻ mới
                </label>
                <input
                  type="text"
                  value={customBulkTagName}
                  onChange={(e) => {
                    setCustomBulkTagName(e.target.value);
                    if (e.target.value.trim()) setSelectedBulkTagId("");
                  }}
                  placeholder="VD: Khách VIP T11..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-base sm:text-xs text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 px-5 py-3.5 border-t border-slate-800 shrink-0 bg-slate-900">
              <button
                type="button"
                onClick={() => setIsBulkTagModalOpen(false)}
                disabled={bulkActionBusy}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 font-semibold text-slate-300 hover:text-white cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                disabled={bulkActionBusy || (!selectedBulkTagId && !customBulkTagName.trim())}
                className="rounded-xl bg-blue-600 px-4 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 font-bold text-white hover:bg-blue-500 disabled:opacity-50 cursor-pointer"
              >
                {bulkActionBusy
                  ? "Đang gắn thẻ..."
                  : `Gắn Thẻ (${selectedCustomerIds.length})`}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Xác Nhận Xóa Hàng Loạt */}
      {isBulkDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4 backdrop-blur-sm">
          <div className="w-full max-w-md max-h-[92dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-rose-500/30 bg-slate-900 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 shrink-0">
              <h3 className="text-base font-bold text-rose-400">
                🗑️ Xác Nhận Xóa {selectedCustomerIds.length} Khách Hàng
              </h3>
            </div>
            <div className="p-5 overflow-y-auto flex-1 min-h-0">
              <p className="text-xs text-slate-300 leading-relaxed">
                Bạn có chắc chắn muốn xóa hàng loạt{" "}
                <strong className="text-white">{selectedCustomerIds.length}</strong> hồ sơ khách
                hàng đã chọn? Hệ thống sẽ đồng thời dọn sạch mapping thẻ tag tương ứng trong{" "}
                <code className="text-amber-300">conversation_tags.json</code>.
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2 px-5 py-3.5 border-t border-slate-800 shrink-0 bg-slate-900">
              <button
                type="button"
                onClick={() => setIsBulkDeleteModalOpen(false)}
                disabled={bulkActionBusy}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkDelete}
                disabled={bulkActionBusy}
                className="rounded-xl bg-rose-600 px-4 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-50 cursor-pointer"
              >
                {bulkActionBusy
                  ? "Đang xóa..."
                  : `Xác Nhận Xóa (${selectedCustomerIds.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Gửi Tin Nhắn Hàng Loạt */}
      <BulkMessageModal
        isOpen={isBulkMessageModalOpen}
        onClose={() => setIsBulkMessageModalOpen(false)}
        zaloAccounts={zaloAccounts}
        availableTags={tagCatalog}
        initialSelectedCustomers={selectedCustomers}
        onCampaignCreated={(camp) => {
          setIsBulkMessageModalOpen(false);
          setSelectedCustomerIds([]);
          setActionMessage({
            type: "success",
            text: `Đã khởi tạo chiến dịch "${camp?.name || "Gửi tin hàng loạt"}" cho ${camp?.totalRecipients || selectedValidContactCount} khách hàng!`,
          });
        }}
      />
    </div>
  );
}
