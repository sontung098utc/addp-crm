"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function ModulePreviewView({
  moduleKey,
  title,
  wbsBadge,
  subtitle,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/seed")
      .then((r) => r.json())
      .then((json) => {
        if (json.ok) setData(json);
      })
      .finally(() => setLoading(false));
  }, []);

  const customers = data?.seedData?.customers || [];
  const orders = data?.seedData?.orders || [];
  const tasks = data?.seedData?.tasks || [];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-blue-500/15 border border-blue-500/30 px-2.5 py-0.5 text-xs font-bold text-blue-400">
              {wbsBadge}
            </span>
            <h1 className="text-lg font-bold text-white">{title}</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/settings"
            className="rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3.5 py-2 transition"
          >
            ⚙️ Phân Quyền & KPI
          </Link>
          <Link
            href="/"
            className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3.5 py-2 transition"
          >
            📊 Về Tổng Quan
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-10 text-center text-xs text-slate-400">
          Đang tải dữ liệu từ Database Trung tâm addp_crm...
        </div>
      ) : (
        <>
          {(moduleKey === "customers" || moduleKey === "inbox") && (
            <section className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">
                  {moduleKey === "inbox"
                    ? "💬 Danh Sách Hội Thoại & Khách Hàng Đa Kênh (Dữ liệu Seed Giai đoạn 1)"
                    : "👥 Hồ Sơ Khách Hàng 360 — Bệnh Lý & Đường Huyết (Dữ liệu Seed Giai đoạn 1)"}
                </h3>
                <span className="text-xs text-emerald-400 font-semibold">
                  Hiển thị {customers.length} hồ sơ theo quyền RBAC
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 uppercase text-[11px]">
                      <th className="py-3 px-4">Mã KH</th>
                      <th className="py-3 px-4">Họ tên & SĐT (10 số)</th>
                      <th className="py-3 px-4">Nguồn Kênh</th>
                      <th className="py-3 px-4">Bệnh lý & Đường huyết</th>
                      <th className="py-3 px-4">Thẻ phân loại (Tags)</th>
                      <th className="py-3 px-4">Sale phụ trách</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {customers.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-800/30">
                        <td className="py-3 px-4 font-mono font-bold text-blue-400">{c.code}</td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">{c.fullName}</div>
                          <div className="text-slate-400 font-mono">{c.phone} • {c.province}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="rounded-lg bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-cyan-400">
                            {c.sourceChannel}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-slate-200">{c.pathology}</div>
                          <div className="text-emerald-400 font-semibold mt-0.5">
                            Đường huyết: {c.initialGlucose} → {c.currentGlucose} mmol/L
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1">
                            {c.tags?.map((t) => (
                              <span
                                key={t}
                                className="rounded bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-[11px] text-blue-300"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-300">
                          {c.staffCode} ({c.teamName})
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {(moduleKey === "work-tracking" || moduleKey === "broadcast") && (
            <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-3">
              <h3 className="text-sm font-bold text-white">
                📅 Danh Sách Công Việc CSKH 3 Màu (Đỏ: Quá hạn • Vàng: Hôm nay • Xanh: Sắp tới)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {tasks.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">{t.urgencyLabel}</span>
                      <span className="font-mono text-slate-400">Hạn: {t.dueDate}</span>
                    </div>
                    <div className="font-semibold text-blue-400">{t.title}</div>
                    <div className="text-slate-400">
                      SĐT Khách: <span className="font-mono text-slate-200">{t.customerPhone}</span> •
                      Phụ trách: <strong className="text-emerald-400">{t.staffCode}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {(moduleKey === "orders" || moduleKey === "reports" || moduleKey === "channels") && (
            <section className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">
                  📦 Đơn Hàng Đa Sàn, Bóc Tách Mã Combo & Đối Soát Lãi/Lỗ (Dữ liệu Seed Giai đoạn 1)
                </h3>
                <span className="text-xs text-amber-400 font-semibold">
                  {orders.length} đơn hàng
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 uppercase text-[11px]">
                      <th className="py-3 px-4">Mã Đơn & Sàn</th>
                      <th className="py-3 px-4">Khách hàng</th>
                      <th className="py-3 px-4">Mã Combo & Bóc tách gốc</th>
                      <th className="py-3 px-4">Doanh thu (Gross)</th>
                      <th className="py-3 px-4">Giá vốn & Lãi ròng (RBAC)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {orders.map((o) => (
                      <tr key={o.id} className="hover:bg-slate-800/30">
                        <td className="py-3 px-4">
                          <div className="font-mono font-bold text-blue-400">{o.orderCode}</div>
                          <span className="inline-block mt-1 rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
                            {o.platform} • {o.status}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">{o.customerName}</div>
                          <div className="font-mono text-slate-400">{o.customerPhone}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-mono font-semibold text-amber-400">{o.rawSku}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            →{" "}
                            {o.resolvedItems
                              ?.map((i) => `${i.sku} (x${i.quantity})`)
                              .join(" + ")}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-bold text-white">
                          {Number(o.grossAmount || 0).toLocaleString("vi-VN")} đ
                        </td>
                        <td className="py-3 px-4">
                          {"cogsAmount" in o ? (
                            <div>
                              <div className="text-slate-400">
                                Giá vốn: {Number(o.cogsAmount).toLocaleString("vi-VN")} đ
                              </div>
                              <div className="font-bold text-emerald-400">
                                Lãi ròng: +{Number(o.netProfit).toLocaleString("vi-VN")} đ
                              </div>
                            </div>
                          ) : (
                            <span className="text-rose-400 font-semibold">
                              🔒 Đã ẩn theo quyền RBAC (Điều 5)
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
