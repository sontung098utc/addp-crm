"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { VIP_LEVELS } from "@/lib/customerTiers";

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const customerId = params?.id;

  const [customer, setCustomer] = useState(null);
  const [careSchedule, setCareSchedule] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form cập nhật chỉ số sức khỏe
  const [editingHealth, setEditingHealth] = useState(false);
  const [healthForm, setHealthForm] = useState({
    currentGlucose: "",
    pathology: "",
    weeklyFeedback: "",
    status: "",
  });
  const [savingHealth, setSavingHealth] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!customerId) return;
    async function loadCustomer() {
      try {
        setLoading(true);
        const res = await fetch(`/api/customers/${customerId}`);
        const data = await res.json();
        if (data.ok && data.customer) {
          setCustomer(data.customer);
          setCareSchedule(data.careSchedule || []);
          setHealthForm({
            currentGlucose: data.customer.currentGlucose || "",
            pathology: data.customer.pathology || "",
            weeklyFeedback: data.customer.weeklyFeedback || "",
            status: data.customer.status || "Đang chăm sóc",
          });
        } else {
          setError(data.error || "Không tìm thấy khách hàng");
        }
      } catch (err) {
        setError("Lỗi kết nối khi tải hồ sơ khách hàng.");
      } finally {
        setLoading(false);
      }
    }
    loadCustomer();
  }, [customerId]);

  const handleUpdateHealth = async (e) => {
    e.preventDefault();
    try {
      setSavingHealth(true);
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentGlucose: parseFloat(healthForm.currentGlucose) || null,
          pathology: healthForm.pathology,
          weeklyFeedback: healthForm.weeklyFeedback,
          status: healthForm.status,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setCustomer(data.customer);
        setEditingHealth(false);
        setToast({ type: "success", text: "Cập nhật chỉ số sức khỏe thành công!" });
        setTimeout(() => setToast(null), 3000);
      } else {
        alert(data.error || "Không thể cập nhật hồ sơ");
      }
    } catch {
      alert("Lỗi kết nối khi cập nhật");
    } finally {
      setSavingHealth(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-3 text-slate-400">
        <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs">Đang mở hồ sơ khách hàng...</p>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="p-8 text-center space-y-4">
        <div className="rounded-2xl border border-rose-500/30 bg-rose-950/40 p-6 text-rose-300 max-w-md mx-auto">
          <p className="font-bold text-sm">⚠️ {error || "Không tìm thấy khách hàng"}</p>
          <Link
            href="/customers"
            className="mt-4 inline-block rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700"
          >
            ← Quay lại danh sách
          </Link>
        </div>
      </div>
    );
  }

  const vipInfo = VIP_LEVELS[customer.vipLevel] || VIP_LEVELS.POTENTIAL;

  return (
    <div className="space-y-6">
      {/* Toast thông báo */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-xl border border-emerald-500/40 bg-emerald-950/90 px-4 py-2.5 text-xs text-emerald-200 backdrop-blur-md shadow-xl">
          ✓ {toast.text}
        </div>
      )}

      {/* Breadcrumb & Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Link href="/customers" className="hover:text-white transition">
            ← Danh sách Khách hàng
          </Link>
          <span>/</span>
          <span className="text-white font-semibold">{customer.fullName} ({customer.code})</span>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/inbox"
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-blue-500 transition shadow-lg shadow-blue-600/30"
          >
            <span>💬 Nhắn Tin Zalo</span>
          </Link>
          <button
            onClick={() => setEditingHealth(!editingHealth)}
            className="rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:text-white transition"
          >
            {editingHealth ? "Đóng chỉnh sửa" : "✏️ Cập nhật Sức Khỏe"}
          </button>
        </div>
      </div>

      {/* Header Profile Khách Hàng */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-tr from-blue-700 to-indigo-600 border border-slate-700 flex items-center justify-center text-xl font-bold text-white shadow-inner flex-shrink-0">
            {customer.fullName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl font-bold text-white">{customer.fullName}</h2>
              <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${vipInfo.badgeColor}`}>
                {customer.vipLabel || vipInfo.label}
              </span>
              <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300 font-semibold border border-slate-700">
                {customer.status || "Đang chăm sóc"}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 flex-wrap">
              <span className="font-mono text-emerald-400 font-bold">{customer.phone}</span>
              <span>•</span>
              <span>{customer.age ? `${customer.age} tuổi` : "Chưa rõ tuổi"} ({customer.gender})</span>
              <span>•</span>
              <span>{customer.province || "Chưa cập nhật địa phương"}</span>
              <span>•</span>
              <span>Kênh: <strong className="text-white">{customer.channelLabel || customer.source}</strong></span>
            </div>
          </div>
        </div>

        {/* Thống kê đơn & Nhân viên phụ trách */}
        <div className="flex items-center gap-6 border-t md:border-t-0 md:border-l border-slate-800 pt-4 md:pt-0 md:pl-6">
          <div>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">Tổng Đơn Hàng</span>
            <span className="text-base font-bold text-white">{customer.totalOrders} đơn</span>
            <span className="block text-[10px] text-slate-500">{Number(customer.totalSpent).toLocaleString("vi-VN")} đ</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">Sale Phụ Trách</span>
            <span className="text-base font-bold text-blue-400">{customer.staffName || "Chưa gán"}</span>
            <span className="block text-[10px] text-slate-500">{customer.staffCode || "—"}</span>
          </div>
        </div>
      </div>

      {/* Grid chi tiết: 2 Cột (Trái: Sức khỏe & Bệnh lý | Phải: Lộ trình chăm sóc & Đơn hàng) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ========================================================================= */}
        {/* CỘT TRÁI: HỒ SƠ SỨC KHỎE & BỆNH LÝ CHUYÊN SÂU (WBS-27)                    */}
        {/* ========================================================================= */}
        <div className="space-y-6 lg:col-span-1">
          {/* Form chỉnh sửa nhanh nếu bật */}
          {editingHealth && (
            <form onSubmit={handleUpdateHealth} className="rounded-2xl border border-blue-500/40 bg-slate-900/90 p-5 shadow-2xl space-y-3 text-xs">
              <h3 className="font-bold text-white text-sm border-b border-slate-800 pb-2">
                Cập nhật Chỉ Số Đường Huyết & Bệnh Lý
              </h3>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Chỉ số Đường Huyết Hiện Tại (mmol/L)</label>
                <input
                  type="number"
                  step="0.1"
                  value={healthForm.currentGlucose}
                  onChange={(e) => setHealthForm({ ...healthForm, currentGlucose: e.target.value })}
                  placeholder="VD: 6.8"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Tình trạng Bệnh lý & Triệu chứng</label>
                <textarea
                  rows={2}
                  value={healthForm.pathology}
                  onChange={(e) => setHealthForm({ ...healthForm, pathology: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Phản hồi Tuần này của Khách</label>
                <textarea
                  rows={3}
                  value={healthForm.weeklyFeedback}
                  onChange={(e) => setHealthForm({ ...healthForm, weeklyFeedback: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingHealth(false)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-slate-300 hover:text-white"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingHealth}
                  className="rounded-xl bg-blue-600 px-3 py-1.5 font-bold text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {savingHealth ? "Đang lưu..." : "Lưu thay đổi"}
                </button>
              </div>
            </form>
          )}

          {/* Thẻ chỉ số đường huyết */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
            <h3 className="font-bold text-white text-sm flex items-center justify-between border-b border-slate-800 pb-3">
              <span>🩺 Chỉ Số Đường Huyết & Bệnh Lý</span>
              <span className="text-[10px] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                WBS-27
              </span>
            </h3>

            {/* Khung so sánh đường huyết */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-center">
                <span className="text-[10px] text-slate-400 block font-semibold">Đường huyết ban đầu</span>
                <span className="text-xl font-bold text-rose-400 mt-1 block">
                  {customer.initialGlucose ? `${customer.initialGlucose}` : "—"}
                </span>
                <span className="text-[10px] text-slate-500">mmol/L</span>
              </div>

              <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3 text-center">
                <span className="text-[10px] text-emerald-400 block font-semibold">Đường huyết hiện tại</span>
                <span className="text-xl font-bold text-emerald-400 mt-1 block">
                  {customer.currentGlucose ? `${customer.currentGlucose}` : "—"}
                </span>
                <span className="text-[10px] text-emerald-500">mmol/L (Đã kiểm soát)</span>
              </div>
            </div>

            {/* Chi tiết bệnh lý */}
            <div className="space-y-2 text-xs">
              <div>
                <span className="text-slate-400 font-semibold block mb-0.5">Mô tả bệnh lý:</span>
                <p className="text-slate-200 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
                  {customer.pathology || "Chưa có thông tin bệnh lý chi tiết."}
                </p>
              </div>

              <div>
                <span className="text-slate-400 font-semibold block mb-0.5">Địa chỉ nhận hàng:</span>
                <p className="text-slate-300">
                  {customer.address || "Chưa cập nhật địa chỉ"}
                </p>
              </div>

              <div>
                <span className="text-slate-400 font-semibold block mb-0.5">Thẻ phân loại:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {Array.isArray(customer.tags) && customer.tags.map((tag, i) => (
                    <span key={i} className="rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-300 px-2 py-0.5 text-[10px] font-semibold">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Phản hồi hàng tuần */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
            <h3 className="font-bold text-white text-sm border-b border-slate-800 pb-2">
              📝 Phản Hồi Gần Nhất Của Khách
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/50 p-3 rounded-xl border border-slate-800">
              &quot;{customer.weeklyFeedback || "Chưa có ghi chú phản hồi nào."}&quot;
            </p>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* CỘT PHẢI: LỘ TRÌNH CHĂM SÓC VÀNG (7 MỐC WBS-28) & ĐƠN HÀNG                 */}
        {/* ========================================================================= */}
        <div className="space-y-6 lg:col-span-2">
          {/* Lộ trình chăm sóc 7 mốc vàng */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <span>📅 Lộ Trình Chăm Sóc Vàng 7 Mốc (Glucare Care Automation)</span>
                  <span className="rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] px-2 py-0.5 font-bold">
                    WBS-28
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Tự động sinh các mốc Ngày 1, 3, 7, 14, 21, Dùng 1/2 và 2/3 liệu trình kèm kịch bản tư vấn chuẩn
                </p>
              </div>

              <Link
                href="/work-tracking"
                className="rounded-lg bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition"
              >
                Xem Bảng Công Việc →
              </Link>
            </div>

            {/* Danh sách các mốc chăm sóc */}
            <div className="space-y-3">
              {careSchedule.map((task, idx) => {
                const isFirst = idx === 0;
                return (
                  <div
                    key={idx}
                    className={`rounded-xl border p-3.5 transition space-y-2 ${
                      isFirst
                        ? "border-emerald-500/40 bg-emerald-950/20"
                        : "border-slate-800 bg-slate-950/50 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${isFirst ? "bg-emerald-400 animate-pulse" : "bg-slate-600"}`} />
                        <span className="font-bold text-xs text-white">{task.title}</span>
                      </div>
                      <span className="text-[11px] font-mono font-semibold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                        Hạn: {task.dueDate}
                      </span>
                    </div>

                    {/* Mẫu tin nhắn gợi ý */}
                    <div className="rounded-lg bg-slate-900 border border-slate-800/80 p-2.5 text-[11px] text-slate-300">
                      <span className="text-slate-500 font-semibold block text-[10px] mb-1">Kịch bản gợi ý cho Sale:</span>
                      <p className="italic">&quot;{task.suggestedMessage}&quot;</p>
                    </div>

                    {/* Quick action buttons */}
                    <div className="flex items-center justify-end gap-2 pt-1 text-[11px]">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(task.suggestedMessage);
                          setToast({ type: "success", text: "Đã copy kịch bản vào khay nhớ tạm!" });
                          setTimeout(() => setToast(null), 2500);
                        }}
                        className="rounded bg-slate-800 hover:bg-slate-700 px-2.5 py-1 text-slate-300 hover:text-white transition"
                      >
                        📋 Copy Kịch Bản
                      </button>
                      <Link
                        href="/inbox"
                        className="rounded bg-blue-600 hover:bg-blue-500 px-2.5 py-1 font-bold text-white transition"
                      >
                        Gửi Qua Zalo ✈️
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Lịch sử đơn hàng */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
            <h3 className="font-bold text-white text-sm border-b border-slate-800 pb-3">
              📦 Lịch Sử Mua Hàng & Đơn Hàng ({customer.totalOrders} đơn)
            </h3>

            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 flex items-center justify-between text-xs">
              <div>
                <span className="font-bold text-white block">Sữa Hạt Tiểu Đường Glucare Plus (Liệu trình 30 ngày)</span>
                <span className="text-slate-400 text-[11px]">
                  Mã đơn: <strong className="text-slate-200">DH-ADDP-20261028</strong> • Kênh: {customer.channelLabel || customer.source}
                </span>
              </div>
              <div className="text-right">
                <span className="font-bold text-emerald-400 block text-sm">
                  {Number(customer.totalSpent || 950000).toLocaleString("vi-VN")} đ
                </span>
                <span className="inline-block rounded bg-emerald-500/20 text-emerald-300 px-2 py-0.5 text-[10px] font-semibold mt-0.5">
                  Giao thành công
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
