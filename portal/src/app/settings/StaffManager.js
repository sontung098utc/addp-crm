"use client";

import { useState, useEffect } from "react";
import { ROLE_PERMISSIONS, getDefaultAllowedTabsForRole } from "../../lib/auth";

const MODULE_LABELS = {
  dashboard: "📊 Tổng quan",
  inbox: "💬 Hộp thư đa kênh",
  customers: "👥 Khách hàng",
  tags: "🏷️ Quản lý Thẻ Tag",
  "work-tracking": "📅 Lộ trình CSKH",
  broadcast: "📢 Chiến dịch AI",
  orders: "📦 Đơn hàng",
  inventory: "🏭 Kho Combo & SKU",
  channels: "🔌 Kết nối 7 kênh",
  reports: "📈 Báo cáo & Lãi/Lỗ",
  settings: "⚙️ Phân quyền",
  guide: "📘 Sổ tay",
};

const TAB_OPTIONS = [
  { route: "/", key: "dashboard", label: "📊 Tổng quan CRM" },
  { route: "/inbox", key: "inbox", label: "💬 Hộp thư Đa kênh" },
  { route: "/customers", key: "customers", label: "👥 Khách hàng" },
  { route: "/settings/tags", key: "tags", label: "🏷️ Quản lý Thẻ Tag" },
  { route: "/work-tracking", key: "work-tracking", label: "📅 Lịch Chăm sóc" },
  { route: "/broadcast", key: "broadcast", label: "📢 AI & Gửi Hàng loạt" },
  { route: "/orders", key: "orders", label: "📦 Đơn hàng Đa sàn" },
  { route: "/inventory", key: "inventory", label: "🏭 Kho Combo & SKU" },
  { route: "/channels", key: "channels", label: "🔌 Kết nối 7 Kênh" },
  { route: "/reports", key: "reports", label: "📈 Báo cáo BI & Lãi/Lỗ" },
  { route: "/settings", key: "settings", label: "⚙️ Nhân sự & Phân quyền" },
];

const ROLE_OPTIONS = [
  { value: "SALE", label: "SALE — Nhân viên Tư vấn & Chốt đơn" },
  { value: "CSKH", label: "CSKH — Chăm sóc Liệu trình 1-3-7-14-21" },
  { value: "SALE_LEADER", label: "SALE_LEADER — Trưởng nhóm Kinh doanh" },
  { value: "KHO", label: "KHO — Nhân viên Kho & Bóc tách Combo" },
  { value: "KE_TOAN", label: "KE_TOAN — Kế toán Đối soát & Thuế" },
  { value: "ADMIN", label: "ADMIN — Quản trị viên Toàn quyền" },
];

const createDefaultAddForm = (role = "SALE") => ({
  code: "",
  name: "",
  phone: "",
  email: "",
  role,
  teamName: "Team Sale 01",
  kpi: 100,
  revenueTarget: 120000000,
  dailyCareTarget: 15,
  dailyMsgTarget: 70,
  allowedTabs: getDefaultAllowedTabsForRole(role),
  assignedChannels: [],
  customerScope: role === "ADMIN" || role === "SALE_LEADER" ? "all" : "assigned_only",
});

export default function StaffManager({ staffList = [], roles = {}, onRefresh }) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState(null);
  const [zaloChannels, setZaloChannels] = useState([]);

  const [newForm, setNewForm] = useState(() => createDefaultAddForm("SALE"));

  useEffect(() => {
    fetch("/api/channels", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.ok || !Array.isArray(data.channels)) return;
        const zaloList = data.channels
          .filter(
            (c) =>
              (c.platform === "ZALO_PERSONAL" ||
                c.type === "zalo_personal" ||
                c.channel_type === "zalo_personal" ||
                c.type === "zalo") &&
              c.status !== "DISCONNECTED" &&
              c.status !== "deleted" &&
              c.status !== "INACTIVE"
          )
          .map((c) => {
            const ownId = String(c.config?.ownId || c.externalId || c.id || "").trim();
            const label = String(c.config?.accountName || c.config?.label || c.name || ownId).trim();
            return { ownId, label, id: c.id };
          })
          .filter((c) => c.ownId);
        setZaloChannels(zaloList);
      })
      .catch(() => {});
  }, []);

  const toggleFormArrayItem = (arr = [], value) => {
    const strVal = String(value);
    return arr.includes(strVal) ? arr.filter((x) => x !== strVal) : [...arr, strVal];
  };

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setBanner(null);
    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newForm,
          username: newForm.code,
          fullName: newForm.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ type: "error", text: data.error || "Không thể tạo nhân viên." });
      } else {
        setBanner({ type: "success", text: data.message });
        setIsAddOpen(false);
        setNewForm(createDefaultAddForm("SALE"));
        onRefresh?.();
      }
    } catch {
      setBanner({ type: "error", text: "Lỗi kết nối máy chủ khi tạo nhân viên." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStaff = async (e) => {
    e.preventDefault();
    if (!editingStaff) return;
    setSubmitting(true);
    setBanner(null);
    try {
      const res = await fetch("/api/staff", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editingStaff,
          fullName: editingStaff.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ type: "error", text: data.error || "Không thể cập nhật nhân viên." });
      } else {
        setBanner({ type: "success", text: data.message });
        setEditingStaff(null);
        onRefresh?.();
      }
    } catch {
      setBanner({ type: "error", text: "Lỗi kết nối máy chủ khi cập nhật." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteStaff = async (staff) => {
    if (staff.code === "ADMIN") return;
    if (!window.confirm(`Bạn có chắc chắn muốn xóa tài khoản '${staff.code} - ${staff.name}' khỏi hệ thống?`)) {
      return;
    }
    setBanner(null);
    try {
      const res = await fetch(`/api/staff?code=${encodeURIComponent(staff.code)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ type: "error", text: data.error });
      } else {
        setBanner({ type: "success", text: data.message });
        onRefresh?.();
      }
    } catch {
      setBanner({ type: "error", text: "Lỗi kết nối máy chủ khi xóa tài khoản." });
    }
  };

  return (
    <div className="space-y-4">
      {banner && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-medium flex items-center justify-between ${
            banner.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/10 border-rose-500/30 text-rose-300"
          }`}
        >
          <span>{banner.text}</span>
          <button onClick={() => setBanner(null)} className="text-slate-400 hover:text-white ml-4">
            ✕
          </button>
        </div>
      )}

      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div>
          <h3 className="text-sm font-bold text-white">
            Danh Sách Nhân Sự, Vai Trò RBAC & Chỉ Tiêu KPI ({staffList.length} tài khoản)
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Kế thừa từ <code className="text-blue-400">QuanlyKH/StaffManager.js</code> &{" "}
            <code className="text-blue-400">quan-ly-kho/users_management_view.php</code> • Mật khẩu mặc định:{" "}
            <strong className="text-emerald-400">123456</strong>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsAddOpen(true)}
          className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2.5 shadow transition"
        >
          + Thêm Nhân Sự Mới
        </button>
      </div>

      {/* Staff Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4">Mã NV</th>
                <th className="py-3.5 px-4">Họ tên & Liên hệ</th>
                <th className="py-3.5 px-4">Vai trò (Role RBAC)</th>
                <th className="py-3.5 px-4">Phân hệ được cấp quyền</th>
                <th className="py-3.5 px-4">Chỉ tiêu KPI / Tháng</th>
                <th className="py-3.5 px-4">Định mức CSKH & Zalo / Ngày</th>
                <th className="py-3.5 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {staffList.map((s) => {
                const roleMeta = roles[s.role] || {};
                const staffTabs = Array.isArray(s.allowedTabs)
                  ? s.allowedTabs
                  : getDefaultAllowedTabsForRole(s.role);
                const staffAssignedChannels = Array.isArray(s.assignedChannels)
                  ? s.assignedChannels
                  : [];
                const staffCustomerScope =
                  s.customerScope ||
                  (s.role === "ADMIN" || s.role === "SALE_LEADER" ? "all" : "assigned_only");

                return (
                  <tr key={s.code} className="hover:bg-slate-800/30 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-blue-400">
                      <div>{s.code}</div>
                      <span
                        className={`inline-block mt-1 rounded px-1.5 py-0.5 text-[10px] ${
                          s.isActive
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-slate-800 text-slate-500"
                        }`}
                      >
                        {s.isActive ? "Đang hoạt động" : "Đã khóa"}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-100 text-sm">{s.fullName || s.name}</div>
                      <div className="text-slate-400 mt-0.5">
                        Đội nhóm: <span className="text-slate-300">{s.teamName || "Chưa gán"}</span>
                      </div>
                      <div className="text-slate-500 mt-0.5">
                        SĐT: {s.phone || "—"} • KH phụ trách:{" "}
                        <strong className="text-slate-300">{s.customerCount || 0}</strong>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-block rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                          roleMeta.badgeColor || "bg-slate-800 text-slate-300 border-slate-700"
                        }`}
                      >
                        {s.role}
                      </span>
                      <div className="text-[11px] text-slate-400 mt-1">{s.roleLabel}</div>
                    </td>
                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="flex flex-wrap gap-1">
                        {TAB_OPTIONS.filter((t) =>
                          s.role === "ADMIN" ? true : staffTabs.includes(t.route) || staffTabs.includes(t.key)
                        )
                          .slice(0, 6)
                          .map((tab) => (
                            <span
                              key={tab.route}
                              className="rounded-md bg-slate-950 border border-slate-800 px-2 py-0.5 text-[11px] text-slate-300"
                            >
                              {tab.label}
                            </span>
                          ))}
                        {s.role !== "ADMIN" && staffTabs.length > 6 && (
                          <span className="rounded-md bg-slate-950 border border-slate-800 px-2 py-0.5 text-[11px] text-slate-400">
                            +{staffTabs.length - 6} tab
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] mt-1.5">
                        <span className="text-blue-400">
                          Nick Zalo: {s.role === "ADMIN" ? "Toàn bộ" : `${staffAssignedChannels.length} kênh`}
                        </span>
                        <span className="text-slate-600">•</span>
                        <span className={staffCustomerScope === "all" ? "text-emerald-400" : "text-amber-300"}>
                          {staffCustomerScope === "all" ? "🌐 Toàn bộ KH" : "🔒 Chỉ KH phụ trách"}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-emerald-400">{s.kpi} đơn / tháng</div>
                      <div className="text-slate-400 mt-0.5">
                        Doanh số:{" "}
                        <span className="text-slate-200 font-medium">
                          {Number(s.revenueTarget || 0).toLocaleString("vi-VN")} đ
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-amber-400 font-semibold">
                        CSKH: {s.dailyCareTarget} khách / ngày
                      </div>
                      <div className="text-purple-400 mt-0.5">
                        Zalo Anti-Ban: tối đa {s.dailyMsgTarget} tin / ngày
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() =>
                          setEditingStaff({
                            ...s,
                            name: s.fullName || s.name,
                            allowedTabs: Array.isArray(s.allowedTabs)
                              ? s.allowedTabs
                              : getDefaultAllowedTabsForRole(s.role),
                            assignedChannels: Array.isArray(s.assignedChannels)
                              ? s.assignedChannels.map(String)
                              : [],
                            customerScope:
                              s.customerScope ||
                              (s.role === "ADMIN" || s.role === "SALE_LEADER" ? "all" : "assigned_only"),
                            resetPassword: "",
                          })
                        }
                        className="rounded-lg border border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 px-2.5 py-1.5 font-semibold transition"
                      >
                        ⚙️ Sửa KPI & Quyền
                      </button>
                      {s.code !== "ADMIN" && (
                        <button
                          type="button"
                          onClick={() => handleDeleteStaff(s)}
                          className="rounded-lg border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 px-2.5 py-1.5 font-semibold transition"
                        >
                          ✕ Xóa
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Thêm Nhân Sự Mới */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Thêm Nhân Sự & Phân Quyền Đa Tầng</h3>
                <p className="text-xs text-slate-400">
                  Mật khẩu đăng nhập mặc định sẽ là <strong className="text-emerald-400">123456</strong>
                </p>
              </div>
              <button onClick={() => setIsAddOpen(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Tên đăng nhập / Mã NV (VD: NGOCLINH, S003) *
                  </label>
                  <input
                    required
                    value={newForm.code}
                    onChange={(e) => setNewForm({ ...newForm, code: e.target.value.toUpperCase() })}
                    placeholder="VD: S003"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Số điện thoại (10 số)</label>
                  <input
                    value={newForm.phone}
                    onChange={(e) => setNewForm({ ...newForm, phone: e.target.value })}
                    placeholder="VD: 0912345678"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Họ và tên nhân viên *</label>
                  <input
                    required
                    value={newForm.name}
                    onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                    placeholder="VD: Ngọc Linh"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Đội nhóm (Team)</label>
                  <input
                    value={newForm.teamName}
                    onChange={(e) => setNewForm({ ...newForm, teamName: e.target.value })}
                    placeholder="VD: Team Sale 01"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Vai trò phân quyền (Role RBAC)</label>
                  <select
                    value={newForm.role}
                    onChange={(e) => {
                      const nextRole = e.target.value;
                      setNewForm({
                        ...newForm,
                        role: nextRole,
                        allowedTabs: getDefaultAllowedTabsForRole(nextRole),
                        customerScope:
                          nextRole === "ADMIN" || nextRole === "SALE_LEADER"
                            ? "all"
                            : "assigned_only",
                      });
                    }}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  >
                    {ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Phạm vi Khách hàng (customerScope)
                  </label>
                  <select
                    value={newForm.customerScope}
                    onChange={(e) => setNewForm({ ...newForm, customerScope: e.target.value })}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="assigned_only">🔒 Chỉ xem khách hàng được phân công (Mặc định Sale)</option>
                    <option value="all">🌐 Xem toàn bộ khách hàng hệ thống</option>
                  </select>
                </div>
              </div>

              {/* Phân quyền Tab Truy Cập */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">
                    Phân quyền Tab truy cập (Menu Sidebar)
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Đã chọn {newForm.allowedTabs?.length || 0} tab
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {TAB_OPTIONS.map((tab) => {
                    const checked = (newForm.allowedTabs || []).includes(tab.route);
                    return (
                      <label
                        key={tab.route}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 cursor-pointer transition ${
                          checked
                            ? "border-blue-500/50 bg-blue-500/10 text-white"
                            : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setNewForm((prev) => ({
                              ...prev,
                              allowedTabs: toggleFormArrayItem(prev.allowedTabs, tab.route),
                            }))
                          }
                          className="rounded border-slate-700"
                        />
                        <span className="truncate">{tab.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Phân quyền Tài khoản Zalo / Kênh được xem */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">
                    Phân quyền Tài khoản Zalo Cá Nhân được xem (/inbox)
                  </span>
                  <span className="text-[11px] text-blue-400">
                    Đã gán {newForm.assignedChannels?.length || 0} nick Zalo
                  </span>
                </div>
                {zaloChannels.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {zaloChannels.map((ch) => {
                      const checked = (newForm.assignedChannels || []).includes(ch.ownId);
                      return (
                        <label
                          key={ch.ownId}
                          className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 cursor-pointer transition ${
                            checked
                              ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200"
                              : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setNewForm((prev) => ({
                                ...prev,
                                assignedChannels: toggleFormArrayItem(prev.assignedChannels, ch.ownId),
                              }))
                            }
                            className="rounded border-slate-700"
                          />
                          <span className="truncate font-medium">💬 {ch.label}</span>
                          <span className="text-[10px] text-slate-500 font-mono ml-auto">
                            {ch.ownId.slice(-6)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 italic">
                    Hiện chưa có tài khoản Zalo cá nhân nào đang kết nối tại trang Kết nối Kênh (/channels).
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">KPI Đơn hàng / tháng</label>
                  <input
                    type="number"
                    min={0}
                    value={newForm.kpi}
                    onChange={(e) => setNewForm({ ...newForm, kpi: e.target.value })}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">KPI Doanh số (VNĐ/tháng)</label>
                  <input
                    type="number"
                    min={0}
                    step={5000000}
                    value={newForm.revenueTarget}
                    onChange={(e) => setNewForm({ ...newForm, revenueTarget: e.target.value })}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Chỉ tiêu CSKH / ngày</label>
                  <input
                    type="number"
                    min={0}
                    value={newForm.dailyCareTarget}
                    onChange={(e) => setNewForm({ ...newForm, dailyCareTarget: e.target.value })}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Hạn mức tin Zalo / ngày (≤70)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={70}
                    value={newForm.dailyMsgTarget}
                    onChange={(e) => setNewForm({ ...newForm, dailyMsgTarget: e.target.value })}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 font-semibold"
                >
                  Hủy thao tác
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 font-semibold"
                >
                  {submitting ? "Đang tạo..." : "Tạo Tài Khoản"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Chỉnh sửa Nhân sự & KPI & Phân quyền Đa tầng */}
      {editingStaff && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">
                  Cấu Hình Tài Khoản & Phân Quyền: <span className="text-blue-400">{editingStaff.code}</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Cập nhật vai trò RBAC, tab truy cập, nick Zalo được xem và phạm vi khách hàng
                </p>
              </div>
              <button onClick={() => setEditingStaff(null)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateStaff} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Họ và tên nhân viên</label>
                  <input
                    required
                    value={editingStaff.name}
                    onChange={(e) => setEditingStaff({ ...editingStaff, name: e.target.value })}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Đội nhóm (Team)</label>
                  <input
                    value={editingStaff.teamName || ""}
                    onChange={(e) => setEditingStaff({ ...editingStaff, teamName: e.target.value })}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Số điện thoại</label>
                  <input
                    value={editingStaff.phone || ""}
                    onChange={(e) => setEditingStaff({ ...editingStaff, phone: e.target.value })}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Vai trò (Role RBAC)</label>
                  <select
                    disabled={editingStaff.code === "ADMIN"}
                    value={editingStaff.role}
                    onChange={(e) => setEditingStaff({ ...editingStaff, role: e.target.value })}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-white disabled:opacity-50"
                  >
                    {ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {editingStaff.code !== "ADMIN" && (
                <>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Phạm vi Khách hàng (customerScope)
                    </label>
                    <select
                      value={editingStaff.customerScope || "assigned_only"}
                      onChange={(e) =>
                        setEditingStaff({ ...editingStaff, customerScope: e.target.value })
                      }
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                    >
                      <option value="assigned_only">🔒 Chỉ xem khách hàng được phân công (Mặc định Sale)</option>
                      <option value="all">🌐 Xem toàn bộ khách hàng hệ thống</option>
                    </select>
                  </div>

                  {/* Phân quyền Tab Truy Cập */}
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-200">
                        Phân quyền Tab truy cập (Menu Sidebar)
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setEditingStaff((prev) => ({
                            ...prev,
                            allowedTabs: getDefaultAllowedTabsForRole(prev.role),
                          }))
                        }
                        className="text-[11px] text-blue-400 hover:text-blue-300 underline"
                      >
                        Đặt lại theo Role ({editingStaff.role})
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {TAB_OPTIONS.map((tab) => {
                        const checked = (editingStaff.allowedTabs || []).includes(tab.route);
                        return (
                          <label
                            key={tab.route}
                            className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 cursor-pointer transition ${
                              checked
                                ? "border-blue-500/50 bg-blue-500/10 text-white"
                                : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setEditingStaff((prev) => ({
                                  ...prev,
                                  allowedTabs: toggleFormArrayItem(prev.allowedTabs, tab.route),
                                }))
                              }
                              className="rounded border-slate-700"
                            />
                            <span className="truncate">{tab.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Phân quyền Tài khoản Zalo được xem */}
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-200">
                        Phân quyền Tài khoản Zalo Cá Nhân được xem (/inbox)
                      </span>
                      <span className="text-[11px] text-blue-400">
                        Đã gán {editingStaff.assignedChannels?.length || 0} nick Zalo
                      </span>
                    </div>
                    {zaloChannels.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {zaloChannels.map((ch) => {
                          const checked = (editingStaff.assignedChannels || []).includes(ch.ownId);
                          return (
                            <label
                              key={ch.ownId}
                              className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 cursor-pointer transition ${
                                checked
                                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200"
                                  : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setEditingStaff((prev) => ({
                                    ...prev,
                                    assignedChannels: toggleFormArrayItem(prev.assignedChannels, ch.ownId),
                                  }))
                                }
                                className="rounded border-slate-700"
                              />
                              <span className="truncate font-medium">💬 {ch.label}</span>
                              <span className="text-[10px] text-slate-500 font-mono ml-auto">
                                {ch.ownId.slice(-6)}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500 italic">
                        Hiện chưa có tài khoản Zalo cá nhân nào đang kết nối tại /channels.
                      </p>
                    )}
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">KPI Đơn hàng / tháng</label>
                  <input
                    type="number"
                    min={0}
                    value={editingStaff.kpi}
                    onChange={(e) => setEditingStaff({ ...editingStaff, kpi: e.target.value })}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">KPI Doanh số (VNĐ/tháng)</label>
                  <input
                    type="number"
                    min={0}
                    step={5000000}
                    value={editingStaff.revenueTarget || 0}
                    onChange={(e) => setEditingStaff({ ...editingStaff, revenueTarget: e.target.value })}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Chỉ tiêu CSKH / ngày</label>
                  <input
                    type="number"
                    min={0}
                    value={editingStaff.dailyCareTarget}
                    onChange={(e) => setEditingStaff({ ...editingStaff, dailyCareTarget: e.target.value })}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Hạn mức tin Zalo / ngày (≤70)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={editingStaff.role === "ADMIN" ? 500 : 70}
                    value={editingStaff.dailyMsgTarget}
                    onChange={(e) => setEditingStaff({ ...editingStaff, dailyMsgTarget: e.target.value })}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    🔑 Đặt lại mật khẩu mới (để trống nếu giữ nguyên)
                  </label>
                  <input
                    type="password"
                    placeholder="Nhập mật khẩu mới ≥ 6 ký tự..."
                    value={editingStaff.resetPassword || ""}
                    onChange={(e) => setEditingStaff({ ...editingStaff, resetPassword: e.target.value })}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-white"
                  />
                </div>
                <div className="flex items-end pb-1">
                  {editingStaff.code !== "ADMIN" && (
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={editingStaff.isActive}
                        onChange={(e) =>
                          setEditingStaff({ ...editingStaff, isActive: e.target.checked })
                        }
                        className="rounded border-slate-700"
                      />
                      <span>Cho phép đăng nhập hệ thống (Active)</span>
                    </label>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingStaff(null)}
                  className="rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 font-semibold"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 font-semibold"
                >
                  {submitting ? "Đang lưu..." : "💾 Lưu Thay Đổi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
