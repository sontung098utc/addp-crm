"use client";

import { useState } from "react";
import { ROLE_PERMISSIONS } from "../../lib/auth";

const MODULE_LABELS = {
  dashboard: "📊 Tổng quan",
  inbox: "💬 Hộp thư đa kênh",
  customers: "👥 Khách hàng 360",
  "work-tracking": "📅 Lộ trình CSKH",
  broadcast: "📢 Chiến dịch AI",
  orders: "📦 Đơn hàng & Kho",
  channels: "🔌 Kết nối 7 kênh",
  reports: "📈 Báo cáo & Lãi/Lỗ",
  settings: "⚙️ Phân quyền",
};

const ROLE_OPTIONS = [
  { value: "SALE", label: "SALE — Nhân viên Tư vấn & Chốt đơn" },
  { value: "CSKH", label: "CSKH — Chăm sóc Liệu trình 1-3-7-14-21" },
  { value: "SALE_LEADER", label: "SALE_LEADER — Trưởng nhóm Kinh doanh" },
  { value: "KHO", label: "KHO — Nhân viên Kho & Bóc tách Combo" },
  { value: "KE_TOAN", label: "KE_TOAN — Kế toán Đối soát & Thuế" },
  { value: "ADMIN", label: "ADMIN — Quản trị viên Toàn quyền" },
];

export default function StaffManager({ staffList = [], roles = {}, onRefresh }) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState(null);

  const [newForm, setNewForm] = useState({
    code: "",
    name: "",
    phone: "",
    email: "",
    role: "SALE",
    teamName: "Team Sale 01",
    kpi: 100,
    revenueTarget: 120000000,
    dailyCareTarget: 15,
    dailyMsgTarget: 70,
  });

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setBanner(null);
    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ type: "error", text: data.error || "Không thể tạo nhân viên." });
      } else {
        setBanner({ type: "success", text: data.message });
        setIsAddOpen(false);
        setNewForm({
          code: "",
          name: "",
          phone: "",
          email: "",
          role: "SALE",
          teamName: "Team Sale 01",
          kpi: 100,
          revenueTarget: 120000000,
          dailyCareTarget: 15,
          dailyMsgTarget: 70,
        });
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
        body: JSON.stringify(editingStaff),
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
                const allowedModules = ROLE_PERMISSIONS[s.role] || [];
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
                      <div className="font-semibold text-slate-100 text-sm">{s.name}</div>
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
                        {allowedModules.map((mod) => (
                          <span
                            key={mod}
                            className="rounded-md bg-slate-950 border border-slate-800 px-2 py-0.5 text-[11px] text-slate-300"
                          >
                            {MODULE_LABELS[mod] || mod}
                          </span>
                        ))}
                      </div>
                      <div className="text-[11px] text-blue-400 mt-1.5">
                        Đã gán: {s.allowedChannelAccountIds?.length || 0} tài khoản kênh
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
                        onClick={() => setEditingStaff({ ...s, resetPassword: "" })}
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
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Thêm Nhân Sự Mới (WBS-07)</h3>
                <p className="text-xs text-slate-400">
                  Mật khẩu đăng nhập mặc định sẽ là <strong className="text-emerald-400">123456</strong>
                </p>
              </div>
              <button onClick={() => setIsAddOpen(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Mã đăng nhập (VD: S003, CS02) *
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
                    placeholder="VD: Nguyễn Thị Lan"
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

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Vai trò phân quyền (Role RBAC)</label>
                <select
                  value={newForm.role}
                  onChange={(e) => setNewForm({ ...newForm, role: e.target.value })}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
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

      {/* Modal Chỉnh sửa Nhân sự & KPI */}
      {editingStaff && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">
                  Cấu Hình Tài Khoản & KPI: <span className="text-blue-400">{editingStaff.code}</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Cập nhật vai trò RBAC, chỉ tiêu doanh số, định mức CSKH và mật khẩu
                </p>
              </div>
              <button onClick={() => setEditingStaff(null)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateStaff} className="space-y-3 text-xs">
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
