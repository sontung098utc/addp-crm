"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";

const PRIORITY_BADGE = {
  1: { text: "Đến hẹn chăm sóc", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  2: { text: "Vừa nhận được hàng", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  3: { text: "Quá hạn chăm sóc", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  4: { text: "Sắp hết hàng", cls: "bg-purple-50 text-purple-700 border-purple-200" },
  5: { text: "Sắp đến hẹn", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  10: { text: "Chưa có hẹn", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  99: { text: "Đã CS hôm nay", cls: "bg-teal-50 text-teal-700 border-teal-200" },
};

function getVietnamHour() {
  const now = new Date();
  const vnTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return vnTime.getUTCHours();
}

export default function WorkTrackingPage() {
  const [rows, setRows] = useState([]);
  const [staffs, setStaffs] = useState([]);
  const [metrics, setMetrics] = useState({
    monthCount: 0,
    weekCount: 0,
    todayCount: 0,
    dailyCareTarget: 7,
    dailyMsgTarget: 70,
    todayPending: 0,
    overdue: 0,
    completedToday: 0,
  });
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Filters matching khachhang.addp.vn
  const [staffFilter, setStaffFilter] = useState("ALL");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterCarePath, setFilterCarePath] = useState("");
  const [filterCareStatus, setFilterCareStatus] = useState("");
  const [filterResponseStatus, setFilterResponseStatus] = useState("");
  const [search, setSearch] = useState("");
  const [showFutureOrUnscheduled, setShowFutureOrUnscheduled] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Multi-select & bulk delete
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Vietnam time (UTC+7) hour for after-17:00 warning banner
  const [vnHour, setVnHour] = useState(() => getVietnamHour());

  // Inline row edits: { [rowId]: { carePath, careStatus, responseStatus, note, nextDate } }
  const [rowStates, setRowStates] = useState({});
  const [savingRowId, setSavingRowId] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (staffFilter !== "ALL") params.set("staffId", staffFilter);

      const res = await fetch(`/api/care/tasks?${params.toString()}`);
      const data = await res.json();
      if (data.ok) {
        setRows(data.rows || []);
        if (Array.isArray(data.staffs)) setStaffs(data.staffs);
        if (data.metrics) setMetrics(data.metrics);
        setLastSyncedAt(data.lastSyncedAt || null);
      }
    } catch (err) {
      console.error("Lỗi tải bảng công việc:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [staffFilter]);

  useEffect(() => {
    const timer = setInterval(() => {
      setVnHour(getVietnamHour());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const handleSyncLegacy = async () => {
    try {
      setSyncing(true);
      const res = await fetch("/api/care/sync-legacy", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showToast("error", data.error || "Không thể đồng bộ dữ liệu từ khachhang.addp.vn.");
        return;
      }
      showToast("success", data.message);
      await fetchTasks();
    } catch (err) {
      showToast("error", `Lỗi kết nối đồng bộ: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleRowStateChange = (rowId, field, value) => {
    setRowStates((prev) => ({
      ...prev,
      [rowId]: {
        ...(prev[rowId] || {}),
        [field]: value,
      },
    }));
  };

  const handleCompleteRow = async (row) => {
    const edited = rowStates[row.id] || {};
    const finalCarePath = edited.carePath !== undefined ? edited.carePath : row.carePath || "";
    const finalCareStatus =
      edited.careStatus !== undefined ? edited.careStatus : row.careStatus || "";
    const finalResponse =
      edited.responseStatus !== undefined
        ? edited.responseStatus
        : row.responseStatus || "";
    const finalNote = edited.note !== undefined ? edited.note : row.lastNote || "";
    const finalNextDate =
      edited.nextDate !== undefined
        ? edited.nextDate
        : row.nextCareDate || new Date().toISOString().slice(0, 10);

    if (!finalCareStatus) {
      showToast("error", "Vui lòng chọn Trạng thái CS (Gọi điện / Nhắn tin / Bình luận) trước khi hoàn thành.");
      return;
    }

    try {
      setSavingRowId(row.id);
      const res = await fetch("/api/care/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "COMPLETE",
          customerId: row.id,
          taskId: row.taskId,
          carePath: finalCarePath,
          careStatus: finalCareStatus,
          responseStatus: finalResponse,
          note: finalNote,
          nextCareDate: finalNextDate,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showToast("error", data.error || "Không thể lưu kết quả chăm sóc.");
        return;
      }
      showToast("success", `Đã hoàn thành chăm sóc ${row.fullName} & cập nhật lịch hẹn!`);
      await fetchTasks();
    } catch (err) {
      showToast("error", `Lỗi lưu chăm sóc: ${err.message}`);
    } finally {
      setSavingRowId(null);
    }
  };

  const hiddenFutureCount = useMemo(
    () => rows.filter((r) => r.priority === 5 || r.priority === 10).length,
    [rows]
  );

  const dueCount = useMemo(
    () => rows.filter((r) => r.priority === 1 || r.priority === 2).length,
    [rows]
  );

  const overdueCount = useMemo(
    () => rows.filter((r) => r.priority === 3).length,
    [rows]
  );

  const showAfter17Alert = !loading && vnHour >= 17 && (dueCount > 0 || overdueCount > 0);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const hasActiveFilterOrSearch = Boolean(
      q || filterPriority || filterCarePath || filterCareStatus || filterResponseStatus
    );
    return rows.filter((r) => {
      if (
        !showFutureOrUnscheduled &&
        !hasActiveFilterOrSearch &&
        (r.priority === 5 || r.priority === 10)
      ) {
        return false;
      }
      if (filterPriority && String(r.priority) !== String(filterPriority)) return false;
      if (filterCarePath && String(r.carePath || "") !== String(filterCarePath)) return false;
      if (
        filterCareStatus &&
        !String(r.careStatus || "").toLowerCase().includes(filterCareStatus.toLowerCase())
      ) {
        return false;
      }
      if (
        filterResponseStatus &&
        String(r.responseStatus || "") !== String(filterResponseStatus)
      ) {
        return false;
      }
      if (q) {
        const hay = `${r.fullName || ""} ${r.phone || ""} ${r.pathology || ""} ${r.lastNote || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    rows,
    filterPriority,
    filterCarePath,
    filterCareStatus,
    filterResponseStatus,
    search,
    showFutureOrUnscheduled,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const pagedIds = pagedRows.map((r) => r.id);
  const allPagedSelected =
    pagedIds.length > 0 && pagedIds.every((id) => selectedIds.includes(id));

  const toggleSelectAllPaged = () => {
    if (allPagedSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pagedIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pagedIds])));
    }
  };

  const toggleSelectRow = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const confirmed = window.confirm(
      `Bạn có chắc chắn muốn xóa ${selectedIds.length} khách hàng đã chọn? Hành động này không thể hoàn tác.`
    );
    if (!confirmed) return;

    try {
      setBulkDeleting(true);
      const res = await fetch("/api/customers/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          customerIds: selectedIds,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showToast("error", data.error || "Không thể xóa hàng loạt khách hàng đã chọn.");
        return;
      }
      showToast(
        "success",
        data.message || `Đã xóa thành công ${selectedIds.length} khách hàng.`
      );
      setSelectedIds([]);
      await fetchTasks();
    } catch (err) {
      showToast("error", `Lỗi xóa hàng loạt: ${err.message}`);
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-6">
      <div className="max-w-[1440px] mx-auto space-y-5">
        {/* Toast */}
        {toast && (
          <div
            className={`fixed top-5 right-5 z-50 rounded-xl px-4 py-3 text-sm font-medium shadow-xl border ${
              toast.type === "error"
                ? "bg-rose-50 border-rose-300 text-rose-700"
                : "bg-emerald-50 border-emerald-300 text-emerald-700"
            }`}
          >
            {toast.type === "error" ? "⚠️ " : "✅ "}
            {toast.message}
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                Theo dõi CV Khách hàng (Work Tracking)
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-[#007aff] dark:text-blue-400 border border-blue-500/20">
                Đồng bộ khachhang.addp.vn
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Thống kê tương tác, lộ trình chăm sóc (Ngày 1, 3, 7, 14, 21, Dùng 1/2 &amp; 2/3) và lịch hẹn tiếp theo.
              {lastSyncedAt && (
                <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  • Đồng bộ gần nhất: {new Date(lastSyncedAt).toLocaleString("vi-VN")}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={handleSyncLegacy}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer disabled:opacity-60"
            >
              <span>{syncing ? "⏳ Đang đồng bộ..." : "🔄 Đồng bộ khachhang.addp.vn"}</span>
            </button>
            <Link
              href="/inbox"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#007aff] hover:bg-[#0066d6] text-white text-xs font-semibold shadow-xs transition"
            >
              <span>💬 Mở Hộp Thư Đa Kênh</span>
            </Link>
          </div>
        </div>

        {/* Cảnh báo đỏ sau 17h00 (giờ Việt Nam UTC+7) nếu còn khách đến hẹn / quá hạn */}
        {showAfter17Alert && (
          <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3.5 text-rose-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-start sm:items-center gap-2.5 text-sm font-semibold">
              <span className="text-lg leading-none">🚨</span>
              <span>
                Cảnh báo cuối ngày (đã qua 17:00 giờ VN): Vẫn còn{" "}
                <span className="font-bold underline">{dueCount} khách đến hẹn chăm sóc</span> và{" "}
                <span className="font-bold underline">{overdueCount} khách quá hạn chăm sóc</span>{" "}
                chưa được hoàn thành hôm nay!
              </span>
            </div>
            <button
              onClick={() => {
                setFilterPriority("1");
                setPage(1);
              }}
              className="shrink-0 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition cursor-pointer"
            >
              Lọc khách đến hẹn
            </button>
          </div>
        )}

        {/* Chỉ Số Mục Tiêu & Thực Tế (Apple Widgets) */}
        <div className="bg-white dark:bg-slate-900/60 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-4 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="font-semibold text-xs text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <span className="text-emerald-600 dark:text-emerald-400">📊</span>
              <span>Chỉ Số Mục Tiêu &amp; Thực Tế</span>
            </div>
            <select
              value={staffFilter}
              onChange={(e) => {
                setStaffFilter(e.target.value);
                setPage(1);
              }}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-[#007aff]"
            >
              <option value="ALL">Tất cả nhân viên (Gộp)</option>
              {staffs.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-200/70 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-800/40 p-3.5 text-center">
              <div className="text-[10px] font-semibold uppercase text-slate-500 tracking-wide">Tháng này</div>
              <div className="text-xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
                {metrics.monthCount} <span className="text-xs font-normal text-slate-400">/ - KH</span>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200/70 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-800/40 p-3.5 text-center">
              <div className="text-[10px] font-semibold uppercase text-slate-500 tracking-wide">Tuần này</div>
              <div className="text-xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
                {metrics.weekCount} <span className="text-xs font-normal text-slate-400">/ - KH</span>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200/70 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-800/40 p-3.5 text-center">
              <div className="text-[10px] font-semibold uppercase text-slate-500 tracking-wide">
                Hôm nay (Chăm sóc)
              </div>
              <div className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1 tabular-nums">
                {metrics.todayCount}{" "}
                <span className="text-xs font-normal text-slate-400">
                  / {metrics.dailyCareTarget} KH
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200/70 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-800/40 p-3.5 text-center">
              <div className="text-[10px] font-semibold uppercase text-slate-500 tracking-wide">
                Chỉ tiêu nhắn tin
              </div>
              <div className="text-xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
                {metrics.dailyMsgTarget}{" "}
                <span className="text-xs font-normal text-slate-400">TN/ngày</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bộ lọc đầy đủ */}
        <div className="bg-white dark:bg-slate-900/60 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-3.5 shadow-xs flex flex-wrap items-center gap-2">
          <select
            value={filterPriority}
            onChange={(e) => {
              setFilterPriority(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-[#007aff]"
          >
            <option value="">-- Phân loại --</option>
            <option value="1">Đến hẹn chăm sóc ({rows.filter((r) => r.priority === 1).length})</option>
            <option value="2">Vừa nhận được hàng ({rows.filter((r) => r.priority === 2).length})</option>
            <option value="3">Quá hạn chăm sóc ({rows.filter((r) => r.priority === 3).length})</option>
            <option value="4">Sắp hết hàng ({rows.filter((r) => r.priority === 4).length})</option>
            <option value="5">Sắp đến hẹn ({rows.filter((r) => r.priority === 5).length})</option>
            <option value="10">Chưa có hẹn ({rows.filter((r) => r.priority === 10).length})</option>
            <option value="99">Đã CS hôm nay ({rows.filter((r) => r.priority === 99).length})</option>
          </select>

          <select
            value={filterCarePath}
            onChange={(e) => {
              setFilterCarePath(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-[#007aff]"
          >
            <option value="">-- Lộ trình CS --</option>
            <option value="Đã chốt">Đã chốt</option>
            <option value="Tiềm năng">Tiềm năng</option>
            <option value="Cần chăm tiếp">Cần chăm tiếp</option>
            <option value="Không có nhu cầu">Không có nhu cầu</option>
          </select>

          <select
            value={filterCareStatus}
            onChange={(e) => {
              setFilterCareStatus(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-[#007aff]"
          >
            <option value="">-- Trạng thái CS --</option>
            <option value="Gọi điện">Gọi điện (GĐ)</option>
            <option value="Nhắn tin">Nhắn tin (NT)</option>
            <option value="Bình luận">Bình luận (BL)</option>
          </select>

          <select
            value={filterResponseStatus}
            onChange={(e) => {
              setFilterResponseStatus(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-[#007aff]"
          >
            <option value="">-- Phản hồi --</option>
            <option value="Đã phản hồi">Đã phản hồi</option>
            <option value="Chưa phản hồi">Chưa phản hồi</option>
          </select>

          <input
            type="text"
            placeholder="🔍 Tìm theo Tên, SĐT, Bệnh lý..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="flex-1 min-w-[200px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-[#007aff]"
          />

          <button
            type="button"
            onClick={() => {
              setShowFutureOrUnscheduled((prev) => !prev);
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
              showFutureOrUnscheduled
                ? "bg-sky-600 text-white border-sky-600"
                : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100"
            }`}
          >
            {showFutureOrUnscheduled
              ? `✓ Đang hiện cả sắp đến hẹn / chưa có hẹn (${hiddenFutureCount})`
              : `Hiện cả sắp đến hẹn / chưa có hẹn (${hiddenFutureCount})`}
          </button>

          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer disabled:opacity-60"
            >
              {bulkDeleting
                ? "Đang xóa..."
                : `🗑️ Xóa hàng loạt (${selectedIds.length})`}
            </button>
          )}

          {(filterPriority || filterCarePath || filterCareStatus || filterResponseStatus || search) && (
            <button
              onClick={() => {
                setFilterPriority("");
                setFilterCarePath("");
                setFilterCareStatus("");
                setFilterResponseStatus("");
                setSearch("");
                setPage(1);
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              Xóa lọc
            </button>
          )}
        </div>

        {/* Bảng Theo Dõi */}
        <div className="bg-white dark:bg-slate-900/60 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-slate-500 text-sm">
              Đang tải dữ liệu chăm sóc khách hàng...
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="text-slate-700 font-semibold">
                Chưa có dữ liệu khớp bộ lọc (Tổng {rows.length} khách hàng).
              </div>
              {rows.length === 0 && (
                <button
                  onClick={handleSyncLegacy}
                  disabled={syncing}
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold cursor-pointer"
                >
                  🔄 Bấm để đồng bộ toàn bộ từ khachhang.addp.vn
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1160px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-3 w-[40px] text-center">
                      <input
                        type="checkbox"
                        checked={allPagedSelected}
                        onChange={toggleSelectAllPaged}
                        aria-label="Chọn tất cả khách hàng trên trang"
                        className="h-4 w-4 rounded border-slate-300 text-[#007aff] cursor-pointer"
                      />
                    </th>
                    <th className="py-3 px-3 w-[155px]">Phân loại</th>
                    <th className="py-3 px-3 w-[210px]">Khách hàng</th>
                    <th className="py-3 px-3 w-[155px]">Lộ trình CS</th>
                    <th className="py-3 px-3 w-[155px]">Trạng thái CS</th>
                    <th className="py-3 px-3 w-[140px]">Phản hồi</th>
                    <th className="py-3 px-3 min-w-[200px]">Lịch sử CS</th>
                    <th className="py-3 px-3 w-[145px]">Hẹn tiếp</th>
                    <th className="py-3 px-3 w-[115px] text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {pagedRows.map((row) => {
                    const edited = rowStates[row.id] || {};
                    const badge = PRIORITY_BADGE[row.priority] || PRIORITY_BADGE[10];
                    const carePathVal =
                      edited.carePath !== undefined ? edited.carePath : row.carePath || "";
                    const careStatusVal =
                      edited.careStatus !== undefined ? edited.careStatus : row.careStatus || "";
                    const responseVal =
                      edited.responseStatus !== undefined
                        ? edited.responseStatus
                        : row.responseStatus || "";
                    const noteVal = edited.note !== undefined ? edited.note : row.lastNote || "";
                    const nextDateVal =
                      edited.nextDate !== undefined
                        ? edited.nextDate
                        : row.nextCareDate || new Date().toISOString().slice(0, 10);

                    return (
                      <tr key={row.id} className="hover:bg-slate-50/70 transition align-top">
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(row.id)}
                            onChange={() => toggleSelectRow(row.id)}
                            aria-label={`Chọn ${row.fullName}`}
                            className="h-4 w-4 rounded border-slate-300 text-[#007aff] cursor-pointer mt-1"
                          />
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-block px-2 py-1 rounded-md text-xs font-semibold border ${badge.cls}`}
                          >
                            {badge.text}
                          </span>
                          {row.daysText && row.priority !== 99 && (
                            <div className="text-[11px] text-slate-500 mt-1">{row.daysText}</div>
                          )}
                        </td>

                        <td className="py-3 px-3">
                          <Link
                            href={`/customers/${row.id}`}
                            className="font-semibold text-blue-700 hover:underline block"
                          >
                            {row.fullName}
                          </Link>
                          <div className="flex items-center gap-1.5 flex-wrap mt-1">
                            <span className="text-xs text-slate-600 font-mono">{row.phone}</span>
                            {row.vpageUrl && (
                              <a
                                href={row.vpageUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="px-1.5 py-0.5 rounded bg-blue-600 text-white text-[10px] font-bold"
                              >
                                Vpage
                              </a>
                            )}
                            {row.facebook && (
                              <a
                                href={row.facebook}
                                target="_blank"
                                rel="noreferrer"
                                className="px-1.5 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-bold"
                              >
                                FB
                              </a>
                            )}
                            <Link
                              href={`/inbox?phone=${encodeURIComponent(row.phone || "")}&name=${encodeURIComponent(
                                row.fullName || ""
                              )}&customerId=${encodeURIComponent(row.id || "")}&staff=${encodeURIComponent(
                                row.staffName || ""
                              )}${row.preferredZaloAccountId ? `&accountId=${encodeURIComponent(row.preferredZaloAccountId)}` : ""}&autoOpen=true`}
                              className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 text-[10px] font-bold hover:bg-sky-200"
                            >
                              💬 Zalo
                            </Link>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-1">
                            Sale: <span className="font-medium text-slate-700">{row.staffName}</span>
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <select
                            value={carePathVal}
                            onChange={(e) =>
                              handleRowStateChange(row.id, "carePath", e.target.value)
                            }
                            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800"
                          >
                            <option value="">-- Chọn Thẻ --</option>
                            <option value="Đã chốt">Đã chốt</option>
                            <option value="Tiềm năng">Tiềm năng</option>
                            <option value="Cần chăm tiếp">Cần chăm tiếp</option>
                            <option value="Không có nhu cầu">Không có nhu cầu</option>
                          </select>
                          {row.level && (
                            <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[11px] font-medium">
                              {row.level}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3">
                          <select
                            value={careStatusVal}
                            onChange={(e) =>
                              handleRowStateChange(row.id, "careStatus", e.target.value)
                            }
                            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800"
                          >
                            <option value="">-- Chọn --</option>
                            <option value="Gọi điện">Gọi điện (GĐ)</option>
                            <option value="Nhắn tin">Nhắn tin (NT)</option>
                            <option value="Bình luận">Bình luận (BL)</option>
                          </select>
                        </td>

                        <td className="py-3 px-3">
                          <select
                            value={responseVal}
                            onChange={(e) =>
                              handleRowStateChange(row.id, "responseStatus", e.target.value)
                            }
                            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800"
                          >
                            <option value="">-- Chọn --</option>
                            <option value="Đã phản hồi">Đã phản hồi</option>
                            <option value="Chưa phản hồi">Chưa phản hồi</option>
                          </select>
                        </td>

                        <td className="py-3 px-3">
                          <textarea
                            rows={2}
                            placeholder="Ghi chú CS..."
                            value={noteVal}
                            onChange={(e) => handleRowStateChange(row.id, "note", e.target.value)}
                            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 resize-y"
                          />
                        </td>

                        <td className="py-3 px-3">
                          <input
                            type="date"
                            value={nextDateVal}
                            onChange={(e) =>
                              handleRowStateChange(row.id, "nextDate", e.target.value)
                            }
                            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800"
                          />
                        </td>

                        <td className="py-3 px-3 text-center space-y-1.5">
                          <Link
                            href={`/inbox?phone=${encodeURIComponent(row.phone || "")}&name=${encodeURIComponent(
                              row.fullName || ""
                            )}&customerId=${encodeURIComponent(row.id || "")}&staff=${encodeURIComponent(
                              row.staffName || ""
                            )}${row.preferredZaloAccountId ? `&accountId=${encodeURIComponent(row.preferredZaloAccountId)}` : ""}&autoOpen=true`}
                            className="block w-full px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs transition"
                          >
                            💬 Chăm sóc
                          </Link>
                          <button
                            onClick={() => handleCompleteRow(row)}
                            disabled={savingRowId === row.id}
                            className="w-full px-3 py-1.5 rounded-xl bg-[#007aff] hover:bg-[#0066d6] text-white text-xs font-semibold shadow-xs transition cursor-pointer disabled:opacity-60"
                          >
                            {savingRowId === row.id ? "Đang lưu..." : "Hoàn thành"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {filteredRows.length > pageSize && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-600">
              <span>
                Hiển thị {(safePage - 1) * pageSize + 1}–
                {Math.min(safePage * pageSize, filteredRows.length)} / {filteredRows.length} khách
                hàng
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="px-2.5 py-1 rounded border border-slate-300 bg-white disabled:opacity-40 cursor-pointer"
                >
                  Trước
                </button>
                <span className="px-2 font-semibold">
                  Trang {safePage} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="px-2.5 py-1 rounded border border-slate-300 bg-white disabled:opacity-40 cursor-pointer"
                >
                  Sau
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
