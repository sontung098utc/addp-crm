"use client";

import { useState } from "react";

const PLATFORM_BADGES = {
  MAGENTO: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  FACEBOOK: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  ZALO_PERSONAL: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  ZALO_OA: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  TIKTOK_SHOP: "bg-pink-500/15 text-pink-400 border-pink-500/30",
  SHOPEE: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  KIOTVIET: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

export default function ChannelPermissionMatrix({
  staffList = [],
  channels = [],
  permissions = [],
  onRefresh,
}) {
  const [selectedStaffId, setSelectedStaffId] = useState(staffList[0]?.id || 2);
  const [savingKey, setSavingKey] = useState(null);
  const [banner, setBanner] = useState(null);

  const nonAdminStaff = staffList.filter((s) => s.role !== "ADMIN");
  const currentStaff =
    nonAdminStaff.find((s) => s.id === Number(selectedStaffId)) || nonAdminStaff[0];

  const getPerm = (staffId, channelAccountId) => {
    return (
      permissions.find(
        (p) =>
          Number(p.staffId) === Number(staffId) &&
          Number(p.channelAccountId) === Number(channelAccountId)
      ) || {
        staffId: Number(staffId),
        channelAccountId: Number(channelAccountId),
        canView: false,
        canReply: false,
        canBroadcast: false,
        canManageOrders: false,
        autoAssignLead: false,
      }
    );
  };

  const handleTogglePerm = async (staffId, channelAccountId, field) => {
    const existing = getPerm(staffId, channelAccountId);
    const updated = {
      ...existing,
      [field]: !existing[field],
    };
    if (updated.canReply || updated.canBroadcast || updated.canManageOrders) {
      updated.canView = true;
    }

    const key = `${staffId}:${channelAccountId}:${field}`;
    setSavingKey(key);
    try {
      const res = await fetch("/api/settings/channel-permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      const data = await res.json();
      if (res.ok) {
        setBanner({ type: "success", text: data.message });
        onRefresh?.();
      } else {
        setBanner({ type: "error", text: data.error || "Lỗi lưu phân quyền kênh." });
      }
    } catch {
      setBanner({ type: "error", text: "Không thể kết nối máy chủ." });
    } finally {
      setSavingKey(null);
    }
  };

  const handleBulkAssignForStaff = async (grantAll) => {
    if (!currentStaff) return;
    setSavingKey("bulk");
    const items = channels.map((ch) => ({
      staffId: currentStaff.id,
      channelAccountId: ch.id,
      canView: grantAll,
      canReply: grantAll && currentStaff.role !== "KHO",
      canBroadcast: grantAll && ["SALE_LEADER", "SALE", "CSKH"].includes(currentStaff.role),
      canManageOrders: grantAll,
      autoAssignLead: grantAll && ["SALE_LEADER", "SALE"].includes(currentStaff.role),
    }));

    try {
      const res = await fetch("/api/settings/channel-permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (res.ok) {
        setBanner({
          type: "success",
          text: grantAll
            ? `Đã cấp quyền toàn bộ 9 tài khoản kênh cho ${currentStaff.code} (${currentStaff.name})!`
            : `Đã thu hồi toàn bộ quyền kênh của ${currentStaff.code}!`,
        });
        onRefresh?.();
      }
    } finally {
      setSavingKey(null);
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

      {/* Staff Selector & Bulk Actions */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-400 mr-1">Chọn nhân sự cấu hình:</span>
          {nonAdminStaff.map((s) => {
            const active = currentStaff?.id === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedStaffId(s.id)}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                  active
                    ? "bg-blue-600 border-blue-500 text-white shadow"
                    : "bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700"
                }`}
              >
                <span className="font-mono">{s.code}</span> — {s.name.split("(")[0].trim()} (
                {s.role})
              </button>
            );
          })}
        </div>

        {currentStaff && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={savingKey === "bulk"}
              onClick={() => handleBulkAssignForStaff(true)}
              className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 px-3 py-2 text-xs font-semibold transition"
            >
              ✓ Cấp tất cả kênh cho {currentStaff.code}
            </button>
            <button
              type="button"
              disabled={savingKey === "bulk"}
              onClick={() => handleBulkAssignForStaff(false)}
              className="rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 px-3 py-2 text-xs font-semibold transition"
            >
              ✕ Thu hồi tất cả
            </button>
          </div>
        )}
      </div>

      {/* Matrix Table for Selected Staff */}
      {currentStaff && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-950/60 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold text-white">
                Ma Trận Phân Quyền Kênh Của:{" "}
                <span className="text-blue-400">
                  {currentStaff.code} — {currentStaff.name}
                </span>
              </h4>
              <p className="text-xs text-slate-400">
                Vai trò: <strong className="text-slate-200">{currentStaff.roleLabel}</strong> • Đội
                nhóm: <strong className="text-slate-200">{currentStaff.teamName}</strong> (Lưu ý:
                Tài khoản ADMIN mặc định có toàn quyền trên mọi kênh)
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/90 text-slate-400 uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4">Nền tảng</th>
                  <th className="py-3.5 px-4">Tài khoản Kênh / Gian hàng</th>
                  <th className="py-3.5 px-4 text-center">👁️ Xem Hộp thư</th>
                  <th className="py-3.5 px-4 text-center">💬 Trả lời Khách</th>
                  <th className="py-3.5 px-4 text-center">📢 Bắn Broadcast</th>
                  <th className="py-3.5 px-4 text-center">📦 Xử lý Đơn hàng</th>
                  <th className="py-3.5 px-4 text-center">🎯 Nhận Lead Tự động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {channels.map((ch) => {
                  const perm = getPerm(currentStaff.id, ch.id);
                  const badgeStyle =
                    PLATFORM_BADGES[ch.platform] ||
                    "bg-slate-800 text-slate-300 border-slate-700";

                  const cols = [
                    { key: "canView", label: "Xem" },
                    { key: "canReply", label: "Trả lời" },
                    { key: "canBroadcast", label: "Broadcast" },
                    { key: "canManageOrders", label: "Đơn hàng" },
                    { key: "autoAssignLead", label: "Chia Lead" },
                  ];

                  return (
                    <tr key={ch.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${badgeStyle}`}
                        >
                          {ch.platformLabel}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-100">{ch.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          ID: {ch.externalId} • Trạng thái:{" "}
                          <span className="text-emerald-400">{ch.status}</span>
                        </div>
                      </td>
                      {cols.map((col) => {
                        const checked = Boolean(perm[col.key]);
                        const busy =
                          savingKey === `${currentStaff.id}:${ch.id}:${col.key}`;
                        return (
                          <td key={col.key} className="py-3 px-4 text-center">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                handleTogglePerm(currentStaff.id, ch.id, col.key)
                              }
                              className={`inline-flex items-center justify-center h-7 w-14 rounded-lg border text-xs font-bold transition ${
                                checked
                                  ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                                  : "bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700"
                              }`}
                            >
                              {busy ? "..." : checked ? "BẬT" : "TẮT"}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
