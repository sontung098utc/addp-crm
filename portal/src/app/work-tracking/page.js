"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function WorkTrackingPage() {
  const [tasks, setTasks] = useState([]);
  const [metrics, setMetrics] = useState({ todayPending: 0, overdue: 0, completedToday: 0 });
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState("TODAY"); // 'TODAY' | 'OVERDUE' | 'COMPLETED' | 'ALL'
  const [staffFilter, setStaffFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  // Modal hoàn thành chăm sóc
  const [selectedTask, setSelectedTask] = useState(null);
  const [completeForm, setCompleteForm] = useState({
    resultNote: "",
    careStatus: "Đang chăm sóc",
    nextCareDate: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterDate) params.set("filterDate", filterDate);
      if (staffFilter !== "ALL") params.set("staffId", staffFilter);

      const res = await fetch(`/api/care/tasks?${params.toString()}`);
      const data = await res.json();
      if (data.ok) {
        setTasks(data.tasks || []);
        if (data.metrics) setMetrics(data.metrics);
      }
    } catch (err) {
      console.error("Lỗi tải bảng công việc:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [filterDate, staffFilter]);

  const handleOpenCompleteModal = (task) => {
    setSelectedTask(task);
    // Gợi ý ngày chăm tiếp theo là 3 hoặc 7 ngày sau
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 4);
    setCompleteForm({
      resultNote: "Khách phản hồi tốt, đã uống đúng hướng dẫn.",
      careStatus: "Đang chăm sóc",
      nextCareDate: nextDate.toISOString().slice(0, 10),
    });
  };

  const handleCompleteTask = async (e) => {
    e.preventDefault();
    if (!selectedTask) return;

    try {
      setSubmitting(true);
      const res = await fetch("/api/care/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: selectedTask.id,
          action: "COMPLETE",
          resultNote: completeForm.resultNote,
          careStatus: completeForm.careStatus,
          nextCareDate: completeForm.nextCareDate,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setSelectedTask(null);
        setToast({ type: "success", text: "Đã hoàn thành công việc chăm sóc khách hàng!" });
        setTimeout(() => setToast(null), 3000);
        fetchTasks();
      } else {
        alert(data.error || "Không thể cập nhật công việc");
      }
    } catch {
      alert("Lỗi kết nối khi hoàn thành công việc");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredTasks = tasks.filter((t) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      t.customerName.toLowerCase().includes(q) ||
      t.customerPhone.includes(q) ||
      (t.title && t.title.toLowerCase().includes(q)) ||
      (t.customerPathology && t.customerPathology.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Toast thông báo */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-xl border border-emerald-500/40 bg-emerald-950/90 px-4 py-2.5 text-xs text-emerald-200 backdrop-blur-md shadow-xl">
          ✓ {toast.text}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Bảng Theo Dõi Chăm Sóc Hàng Ngày (Work Tracking)
            </h1>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
              WBS-29
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Kế thừa từ QuanlyKH — Danh sách khách hàng đến hạn chăm sóc theo 7 mốc vàng (Ngày 1, 3, 7, 14, 21, Dùng 1/2 và 2/3 liệu trình)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/inbox"
            className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 transition shadow-lg shadow-blue-600/30 flex items-center gap-1.5"
          >
            <span>💬 Mở Hộp Thư Zalo Đa Kênh</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {/* Card 1: Hôm nay */}
        <div
          onClick={() => setFilterDate("TODAY")}
          className={`cursor-pointer rounded-2xl border p-4 transition ${
            filterDate === "TODAY"
              ? "border-blue-500/60 bg-blue-950/30 ring-1 ring-blue-500/40"
              : "border-slate-800 bg-slate-900/60 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Cần Chăm Hôm Nay</span>
            <span className="text-base">📅</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{metrics.todayPending}</span>
            <span className="text-xs text-slate-500">/ Chỉ tiêu 7 KH/ngày</span>
          </div>
        </div>

        {/* Card 2: Quá hạn */}
        <div
          onClick={() => setFilterDate("OVERDUE")}
          className={`cursor-pointer rounded-2xl border p-4 transition ${
            filterDate === "OVERDUE"
              ? "border-rose-500/60 bg-rose-950/30 ring-1 ring-rose-500/40"
              : "border-slate-800 bg-slate-900/60 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-rose-400">
            <span>Quá Hạn (Báo Đỏ)</span>
            <span className="text-base">⚠️</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-rose-400">{metrics.overdue}</span>
            <span className="text-xs text-rose-500/80">Cần xử lý ngay</span>
          </div>
        </div>

        {/* Card 3: Đã hoàn thành */}
        <div
          onClick={() => setFilterDate("COMPLETED")}
          className={`cursor-pointer rounded-2xl border p-4 transition ${
            filterDate === "COMPLETED"
              ? "border-emerald-500/60 bg-emerald-950/30 ring-1 ring-emerald-500/40"
              : "border-slate-800 bg-slate-900/60 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-emerald-400">
            <span>Đã Hoàn Thành</span>
            <span className="text-base">✅</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-400">{metrics.completedToday}</span>
            <span className="text-xs text-emerald-500/80">Đã ghi nhận kết quả</span>
          </div>
        </div>

        {/* Card 4: Tất cả */}
        <div
          onClick={() => setFilterDate("ALL")}
          className={`cursor-pointer rounded-2xl border p-4 transition ${
            filterDate === "ALL"
              ? "border-purple-500/60 bg-purple-950/30 ring-1 ring-purple-500/40"
              : "border-slate-800 bg-slate-900/60 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-purple-400">
            <span>Tất Cả Lộ Trình</span>
            <span className="text-base">📋</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-purple-300">
              {metrics.todayPending + metrics.overdue + metrics.completedToday}
            </span>
            <span className="text-xs text-purple-500/80">Tổng công việc</span>
          </div>
        </div>
      </div>

      {/* Bộ lọc thanh công cụ */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Ô tìm kiếm */}
          <div className="md:col-span-2 relative">
            <input
              type="text"
              placeholder="Tìm theo Tên khách, SĐT, Bệnh lý..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
            <span className="absolute left-3 top-2.5 text-slate-500 text-xs">🔍</span>
          </div>

          {/* Lọc nhân viên phụ trách */}
          <div>
            <select
              value={staffFilter}
              onChange={(e) => setStaffFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="ALL">Tất cả nhân viên Sale</option>
              <option value="2">S001 - Nguyễn Minh Tuấn (Leader)</option>
              <option value="3">S002 - Trần Thu Hà (Sale 01)</option>
              <option value="4">CS01 - Lê Thị Mai (CSKH 01)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Bảng Danh sách Công việc Chăm sóc */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500 space-y-2">
            <div className="h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p>Đang tải bảng công việc chăm sóc...</p>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="text-3xl">📋</div>
            <h3 className="text-sm font-bold text-white">Chưa có công việc chăm sóc</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              Chưa có dữ liệu công việc chăm sóc. Lộ trình chăm sóc 7 mốc vàng (Ngày 1, 3, 7, 14, 21, 1/2 và 2/3 liệu trình) sẽ tự động kích hoạt ngay khi đơn hàng được tạo hoặc chuyển sang trạng thái Giao thành công.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Khách Hàng & SĐT</th>
                  <th className="py-3 px-4">Bệnh Lý & Đường Huyết</th>
                  <th className="py-3 px-4">Mốc Chăm Sóc & Hạn</th>
                  <th className="py-3 px-4">Kịch Bản Tư Vấn Chuẩn</th>
                  <th className="py-3 px-4">Sale Phụ Trách</th>
                  <th className="py-3 px-4 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filteredTasks.map((t) => {
                  const isOverdue = !t.isCompleted && t.deadline < new Date().toISOString().slice(0, 10);
                  return (
                    <tr
                      key={t.id}
                      className={`hover:bg-slate-800/30 transition ${
                        isOverdue ? "bg-rose-950/10" : ""
                      }`}
                    >
                      {/* Khách hàng & SĐT */}
                      <td className="py-3.5 px-4">
                        <Link
                          href={`/customers/${t.customerId}`}
                          className="font-bold text-white hover:text-blue-400 block"
                        >
                          {t.customerName}
                        </Link>
                        <span className="font-mono text-emerald-400 text-[11px] block mt-0.5">
                          {t.customerPhone}
                        </span>
                      </td>

                      {/* Bệnh lý */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="truncate text-white font-medium" title={t.customerPathology}>
                          {t.customerPathology || "Tiểu đường tuýp 2"}
                        </div>
                        {t.customerGlucose && (
                          <span className="text-[10px] text-emerald-400 block mt-0.5">
                            Đường huyết: {t.customerGlucose} mmol/L
                          </span>
                        )}
                      </td>

                      {/* Mốc chăm sóc */}
                      <td className="py-3.5 px-4">
                        <span className="inline-block rounded bg-blue-500/10 border border-blue-500/30 text-blue-300 px-2 py-0.5 text-[10px] font-bold">
                          {t.taskType === "DAY_1" ? "Ngày 1 (Nhận hàng)" :
                           t.taskType === "DAY_3" ? "Ngày 3 (Cảm nhận)" :
                           t.taskType === "DAY_7" ? "Ngày 7 (Đo đường huyết)" :
                           t.taskType === "DAY_14" ? "Ngày 14 (Chế độ ăn)" :
                           t.taskType === "DAY_21" ? "Ngày 21 (Liệu trình 3w)" :
                           t.taskType === "HALF_USAGE" ? "Dùng 1/2 Liệu Trình" :
                           t.taskType === "TWO_THIRD_USAGE" ? "Dùng 2/3 (Tái Mua)" :
                           "Chăm sóc định kỳ"}
                        </span>
                        <div className="text-[10px] mt-1">
                          Hạn:{" "}
                          <span className={`font-mono font-bold ${isOverdue ? "text-rose-400" : "text-slate-400"}`}>
                            {t.deadline} {isOverdue ? "(Quá hạn)" : ""}
                          </span>
                        </div>
                      </td>

                      {/* Kịch bản tư vấn */}
                      <td className="py-3.5 px-4 max-w-sm">
                        <div className="rounded-lg bg-slate-950 p-2 text-[11px] text-slate-300 border border-slate-800 line-clamp-2 italic">
                          &quot;{t.suggestedMessage}&quot;
                        </div>
                      </td>

                      {/* Sale */}
                      <td className="py-3.5 px-4">
                        <span className="text-white font-medium">{t.staffName || "Sơn Tùng"}</span>
                      </td>

                      {/* Thao tác */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href="/inbox"
                            className="rounded-lg bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 px-2.5 py-1 text-[11px] font-bold text-blue-300 transition"
                            title="Nhắn tin Zalo"
                          >
                            💬 Chat Zalo
                          </Link>
                          {t.isCompleted ? (
                            <span className="rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 text-[11px] font-bold">
                              ✓ Đã xong
                            </span>
                          ) : (
                            <button
                              onClick={() => handleOpenCompleteModal(t)}
                              className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-2.5 py-1 text-[11px] font-bold text-white transition shadow-sm"
                            >
                              ✓ Hoàn thành
                            </button>
                          )}
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

      {/* Modal Hoàn Thành Chăm Sóc */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white">
                Ghi Nhận Kết Quả Chăm Sóc — {selectedTask.customerName}
              </h3>
              <button
                onClick={() => setSelectedTask(null)}
                className="text-slate-400 hover:text-white text-base font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCompleteTask} className="space-y-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Kết quả cuộc gọi / trao đổi</label>
                <textarea
                  rows={3}
                  required
                  value={completeForm.resultNote}
                  onChange={(e) => setCompleteForm({ ...completeForm, resultNote: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Trạng thái chăm sóc sau tương tác</label>
                <select
                  value={completeForm.careStatus}
                  onChange={(e) => setCompleteForm({ ...completeForm, careStatus: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="Đang chăm sóc">Đang chăm sóc (Tốt)</option>
                  <option value="Cần chăm tiếp">Cần chăm tiếp (Có thắc mắc)</option>
                  <option value="Đã chốt">Đã chốt thêm đơn tái mua</option>
                  <option value="Không có nhu cầu">Tạm ngưng / Không có nhu cầu</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Hẹn ngày liên hệ tiếp theo (Tự sinh Task mới)</label>
                <input
                  type="date"
                  value={completeForm.nextCareDate}
                  onChange={(e) => setCompleteForm({ ...completeForm, nextCareDate: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedTask(null)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 font-semibold text-slate-300 hover:text-white"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-emerald-600 px-4 py-1.5 font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {submitting ? "Đang lưu..." : "Lưu Hoàn Thành ✓"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
