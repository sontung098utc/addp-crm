"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

/**
 * ADDP Omnichannel AI CRM — Dashboard Báo Cáo Doanh Số, Lãi/Lỗ Thực Tế & Đối Soát BI (WBS-43 -> WBS-48)
 * Kế thừa nghiệp vụ từ:
 * - C:\AdsTiktok (CommerceDashboardView.jsx, commerce_loss_engine.php, CommerceGoldenHoursView.jsx)
 * - C:\AH-Trabi\quan-ly-kho (thong_ke_thue_view.php, khach_hang_view.php)
 * - C:\QuanlyKH (ReportsClient.js - KPI nhân viên & Retention)
 * Tuân thủ Điều 2, Điều 5 (RBAC), Điều 11 (Dữ liệu xác thực 100%) AGENTS.md
 */

const PRESETS = [
  { key: "all", label: "Toàn thời gian" },
  { key: "today", label: "Hôm nay" },
  { key: "yesterday", label: "Hôm qua" },
  { key: "7days", label: "7 ngày qua" },
  { key: "30days", label: "30 ngày qua" },
];

const CHANNELS = [
  { key: "ALL", label: "Tất Cả 7 Kênh" },
  { key: "WEBSITE_MAGENTO", label: "Website Magento 2.4.8" },
  { key: "TIKTOK_SHOP", label: "TikTok Shop" },
  { key: "SHOPEE", label: "Shopee" },
  { key: "KIOTVIET", label: "KiotViet POS" },
  { key: "ZALO_PERSONAL", label: "Zalo Cá Nhân" },
  { key: "FACEBOOK", label: "Fanpage Facebook" },
];

const formatMoney = (val) => {
  return (Number(val) || 0).toLocaleString("vi-VN") + " đ";
};

export default function ReportsClient({
  initialReport = null,
  initialTab = "channels",
  initialChannel = "ALL",
}) {
  const [channel, setChannel] = useState(initialChannel);
  const [preset, setPreset] = useState("all");
  const [report, setReport] = useState(initialReport);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState(initialTab); // 'channels' | 'orders' | 'loss' | 'ads' | 'tax' | 'kpi' | 'customers'

  // State cho các tab mở rộng
  const [adsData, setAdsData] = useState(null);
  const [taxData, setTaxData] = useState(null);
  const [kpiData, setKpiData] = useState(null);
  const [customersData, setCustomersData] = useState(null);
  const [tabLoading, setTabLoading] = useState(false);

  // Tính startDate theo preset
  const getDateRange = () => {
    const now = new Date();
    if (preset === "today") {
      const d = now.toISOString().slice(0, 10);
      return { startDate: d, endDate: d };
    }
    if (preset === "yesterday") {
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      const d = y.toISOString().slice(0, 10);
      return { startDate: d, endDate: d };
    }
    if (preset === "7days") {
      const p = new Date(now);
      p.setDate(now.getDate() - 7);
      return { startDate: p.toISOString().slice(0, 10), endDate: now.toISOString().slice(0, 10) };
    }
    if (preset === "30days") {
      const p = new Date(now);
      p.setDate(now.getDate() - 30);
      return { startDate: p.toISOString().slice(0, 10), endDate: now.toISOString().slice(0, 10) };
    }
    return { startDate: null, endDate: null };
  };

  const fetchReport = async () => {
    try {
      setLoading(true);
      const { startDate, endDate } = getDateRange();
      const params = new URLSearchParams();
      if (channel !== "ALL") params.append("channel", channel);
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);

      const res = await fetch(`/api/reports/financial?${params.toString()}`);
      const data = await res.json();
      if (data.ok && data.report) {
        setReport(data.report);
      }
    } catch (err) {
      console.error("Lỗi nạp báo cáo tài chính:", err);
    } finally {
      setLoading(false);
    }
  };

  const isFirstMount = useRef(true);
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    fetchReport();
  }, [channel, preset]);

  // Nạp dữ liệu khi chuyển sang tab chuyên biệt
  useEffect(() => {
    const loadSpecializedData = async () => {
      setTabLoading(true);
      try {
        if (activeTab === "ads" && !adsData) {
          const res = await fetch(`/api/reports/ads?channel=${channel}`);
          const d = await res.json();
          if (d.ok) setAdsData(d.report);
        } else if (activeTab === "tax" && !taxData) {
          const { startDate, endDate } = getDateRange();
          const p = new URLSearchParams();
          if (channel !== "ALL") p.append("platform", channel);
          if (startDate) p.append("startDate", startDate);
          if (endDate) p.append("endDate", endDate);
          const res = await fetch(`/api/reports/tax?${p.toString()}`);
          const d = await res.json();
          if (d.ok) setTaxData(d.report);
        } else if (activeTab === "kpi" && !kpiData) {
          const res = await fetch("/api/reports/staff-kpi");
          const d = await res.json();
          if (d.ok) setKpiData(d.report);
        } else if (activeTab === "customers" && !customersData) {
          const res = await fetch("/api/reports/customer-retention");
          const d = await res.json();
          if (d.ok) setCustomersData(d.report);
        }
      } catch (e) {
        console.error("Lỗi nạp tab chuyên biệt:", e);
      } finally {
        setTabLoading(false);
      }
    };

    loadSpecializedData();
  }, [activeTab, channel, preset]);

  const metrics = report?.metricsOverview || {
    gmv: 0,
    realizedRevenue: 0,
    totalOrders: 0,
    successfulOrders: 0,
    successRatePct: 0,
    failedDeliveryOrders: 0,
    returnRatePct: 0,
  };

  const finance = report?.financialSummary || {
    cogs: 0,
    cogsRatioPct: 0,
    platformFees: 0,
    affiliateFees: 0,
    codFees: 0,
    shippingLoss: 0,
    netProfit: 0,
    netMarginPct: 0,
  };

  const channelStats = report?.channelStats || [];
  const orderDetails = report?.orderDetails || [];

  const filteredOrders = orderDetails.filter((o) => {
    const q = searchQuery.toLowerCase();
    return (
      !searchQuery ||
      (o.orderCode && o.orderCode.toLowerCase().includes(q)) ||
      (o.customerName && o.customerName.toLowerCase().includes(q)) ||
      (o.channel && o.channel.toLowerCase().includes(q))
    );
  });

  // Xuất file CSV Thống kê Thuế chuẩn (WBS-46)
  const handleExportTaxCsv = () => {
    const rows = taxData?.orders || [];
    if (rows.length === 0) {
      alert("Không có đơn hàng giao thành công để xuất thuế.");
      return;
    }

    const headers = [
      "Mã đơn hàng",
      "Kênh bán",
      "Tên khách hàng",
      "Số điện thoại",
      "Ngày hoàn tất",
      "Tổng thanh toán (VNĐ)",
      "Doanh thu tính thuế (VNĐ)",
      "Thuế GTGT 8% (VNĐ)",
    ];

    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" +
      [
        headers.join(","),
        ...rows.map((r) =>
          [
            `"${r.orderCode}"`,
            `"${r.channel}"`,
            `"${r.customerName}"`,
            `"${r.phone}"`,
            `"${(r.completedDate || "").slice(0, 10)}"`,
            r.totalAmount,
            r.taxableBase,
            r.vatAmount,
          ].join(",")
        ),
      ].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `Bang_Ke_Thue_ADDP_${channel}_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Tiêu đề & Bộ lọc điều khiển */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">📈</span>
            <h1 className="text-xl font-bold text-white tracking-wide">
              Báo Cáo Doanh Số, Lãi/Lỗ Thực Tế & Đối Soát BI
            </h1>
            <span className="rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold px-2 py-0.5 border border-emerald-500/30">
              WBS-43 → WBS-48
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Hệ thống đối soát toàn diện kế thừa từ <code>C:\AdsTiktok</code>, <code>C:\AH-Trabi\quan-ly-kho</code> và <code>C:\QuanlyKH</code>. Bóc tách COGS từ công thức Combo (WBS-41), Khung giờ vàng Ads, Thống kê Thuế và KPI nhân sự.
          </p>
        </div>

        {/* Nút tác vụ nhanh */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 transition border border-slate-700"
          >
            <span>🖨️</span>
            <span>In Báo Cáo</span>
          </button>
          <button
            onClick={handleExportTaxCsv}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3.5 py-2 transition shadow shadow-emerald-600/20"
          >
            <span>📊</span>
            <span>Xuất Bảng Kê Thuế (Excel/CSV)</span>
          </button>
        </div>
      </div>

      {/* Thanh Công Cụ Bộ Lọc (Presets Thời Gian & Kênh Bán Hàng) */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <span className="text-xs text-slate-400 font-medium mr-1">Kỳ:</span>
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                preset === p.key
                  ? "bg-blue-600 text-white shadow"
                  : "bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Kênh:</span>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white focus:outline-none focus:border-blue-500"
          >
            {CHANNELS.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 4 THẺ CHỈ SỐ TÀI CHÍNH CỐT LÕI (FINANCIAL KPI CARDS) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* THẺ 1: DOANH THU THỰC NHẬN */}
        <div className="rounded-2xl border border-blue-200 dark:border-blue-500/30 bg-blue-50/70 dark:bg-gradient-to-br dark:from-blue-950/20 dark:to-slate-950 p-5 shadow-sm dark:shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between text-blue-700 dark:text-blue-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Doanh Thu Thực Nhận</span>
            <span className="text-blue-500 dark:text-blue-400 text-base">💰</span>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {formatMoney(metrics.realizedRevenue)}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 border-t border-blue-200/60 dark:border-slate-800/80 pt-2.5">
            <span>Tổng GMV: {formatMoney(metrics.gmv)}</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
              {metrics.successfulOrders > 0
                ? `${metrics.successRatePct}% thành công`
                : `${metrics.totalOrders} đơn`}
            </span>
          </div>
        </div>

        {/* THẺ 2: LỢI NHUẬN RÒNG THỰC TẾ (NET PROFIT) */}
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/70 dark:bg-gradient-to-br dark:from-emerald-950/20 dark:to-slate-950 p-5 shadow-sm dark:shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Lợi Nhuận Ròng Thực Tế</span>
            <span className="text-emerald-500 dark:text-emerald-400 text-base">✨</span>
          </div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
            {finance.netProfit >= 0 ? "+" : ""}
            {formatMoney(finance.netProfit)}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs border-t border-emerald-200/60 dark:border-slate-800/80 pt-2.5">
            <span className="text-slate-600 dark:text-slate-400">Tỷ suất LN:</span>
            <span className="font-bold text-emerald-700 dark:text-emerald-300 font-mono">{finance.netMarginPct}%</span>
          </div>
        </div>

        {/* THẺ 3: TỔNG GIÁ VỐN HÀNG BÁN (COGS) */}
        <div className="rounded-2xl border border-purple-200 dark:border-purple-500/30 bg-purple-50/70 dark:bg-gradient-to-br dark:from-purple-950/20 dark:to-slate-950 p-5 shadow-sm dark:shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between text-purple-700 dark:text-purple-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Tổng Giá Vốn (COGS)</span>
            <span className="text-purple-500 dark:text-purple-400 text-base">🏷️</span>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {formatMoney(finance.cogs)}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 border-t border-purple-200/60 dark:border-slate-800/80 pt-2.5">
            <span>Tỷ trọng giá vốn:</span>
            <span className="text-purple-700 dark:text-purple-300 font-mono font-semibold">{finance.cogsRatioPct}%</span>
          </div>
        </div>

        {/* THẺ 4: TỔNG CHI PHÍ THẤT THOÁT & PHÍ SÀN */}
        <div className="rounded-2xl border border-rose-200 dark:border-rose-500/30 bg-rose-50/70 dark:bg-gradient-to-br dark:from-rose-950/20 dark:to-slate-950 p-5 shadow-sm dark:shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between text-rose-700 dark:text-rose-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Phí Sàn & Cước Hoàn</span>
            <span className="text-rose-500 dark:text-rose-400 text-base">📉</span>
          </div>
          <div className="text-2xl font-black text-rose-600 dark:text-rose-400 tracking-tight">
            {formatMoney((finance.platformFees || 0) + (finance.affiliateFees || 0) + (finance.shippingLoss || 0))}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 border-t border-rose-200/60 dark:border-slate-800/80 pt-2.5">
            <span>Phí sàn & thu hộ: {formatMoney((finance.platformFees || 0) + (finance.codFees || 0))}</span>
            <span className="text-rose-600 dark:text-rose-400 font-semibold">{metrics.returnRatePct}% hoàn</span>
          </div>
        </div>
      </div>

      {/* Tabs Chuyển Đổi 7 Chế Độ Xem Báo Cáo Chuyên Sâu */}
      <div className="flex border-b border-slate-800 gap-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab("channels")}
          className={`flex items-center gap-1.5 pb-3 px-3.5 text-xs font-semibold transition border-b-2 whitespace-nowrap ${
            activeTab === "channels"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          <span>🌐</span>
          <span>7 Nền Tảng (WBS-44)</span>
        </button>

        <button
          onClick={() => setActiveTab("orders")}
          className={`flex items-center gap-1.5 pb-3 px-3.5 text-xs font-semibold transition border-b-2 whitespace-nowrap ${
            activeTab === "orders"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          <span>📑</span>
          <span>Đối Soát Lãi/Lỗ Đơn (WBS-43)</span>
          <span className="rounded-full bg-slate-800 text-slate-300 text-[10px] font-bold px-1.5 py-0.2">
            {orderDetails.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("loss")}
          className={`flex items-center gap-1.5 pb-3 px-3.5 text-xs font-semibold transition border-b-2 whitespace-nowrap ${
            activeTab === "loss"
              ? "border-rose-500 text-rose-400"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          <span>📉</span>
          <span>Thất Thoát & Hoàn</span>
        </button>

        <button
          onClick={() => setActiveTab("ads")}
          className={`flex items-center gap-1.5 pb-3 px-3.5 text-xs font-semibold transition border-b-2 whitespace-nowrap ${
            activeTab === "ads"
              ? "border-amber-500 text-amber-400"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          <span>🎯</span>
          <span>TikTok Ads & Giờ Vàng (WBS-46)</span>
        </button>

        <button
          onClick={() => setActiveTab("tax")}
          className={`flex items-center gap-1.5 pb-3 px-3.5 text-xs font-semibold transition border-b-2 whitespace-nowrap ${
            activeTab === "tax"
              ? "border-cyan-500 text-cyan-400"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          <span>🧾</span>
          <span>Thống Kê Thuế (WBS-46)</span>
        </button>

        <button
          onClick={() => setActiveTab("kpi")}
          className={`flex items-center gap-1.5 pb-3 px-3.5 text-xs font-semibold transition border-b-2 whitespace-nowrap ${
            activeTab === "kpi"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          <span>🏆</span>
          <span>KPI Nhân Viên Sale (WBS-47)</span>
        </button>

        <button
          onClick={() => setActiveTab("customers")}
          className={`flex items-center gap-1.5 pb-3 px-3.5 text-xs font-semibold transition border-b-2 whitespace-nowrap ${
            activeTab === "customers"
              ? "border-teal-500 text-teal-400"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          <span>👥</span>
          <span>Phân Tích KH & Mua Lại (WBS-48)</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: MA TRẬN 7 NỀN TẢNG (CHANNELS MATRIX)                               */}
      {/* ========================================================================= */}
      {activeTab === "channels" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="p-3.5">Kênh Bán Hàng</th>
                    <th className="p-3.5 text-right">Tổng Đơn</th>
                    <th className="p-3.5 text-right">Thành Công</th>
                    <th className="p-3.5 text-right">Doanh Thu (GMV)</th>
                    <th className="p-3.5 text-right">Thực Nhận</th>
                    <th className="p-3.5 text-right">Giá Vốn (COGS)</th>
                    <th className="p-3.5 text-right">Phí Sàn & Thu Hộ</th>
                    <th className="p-3.5 text-right">Lợi Nhuận Ròng</th>
                    <th className="p-3.5 text-right">Biên Lợi Nhuận</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {channelStats.map((row) => {
                    const icon = row.icon || (row.channelKey === "WEBSITE_MAGENTO" ? "🌐" : row.channelKey === "TIKTOK_SHOP" ? "🎵" : row.channelKey === "SHOPEE" ? "🛍️" : row.channelKey === "KIOTVIET" ? "🏪" : row.channelKey === "ZALO_PERSONAL" ? "💬" : "📘");
                    const label = row.label || row.name || row.channelKey;
                    const totalOrders = row.totalOrders ?? row.orders ?? 0;
                    const successOrders = row.successfulOrders ?? row.successOrders ?? 0;
                    const realizedRev = row.realizedRevenue ?? row.realized ?? 0;
                    return (
                      <tr key={row.channelKey} className="hover:bg-slate-800/40 transition">
                        <td className="p-3.5 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <span>{icon}</span>
                          <span>{label}</span>
                        </td>
                        <td className="p-3.5 text-right font-mono text-slate-700 dark:text-slate-300">{totalOrders}</td>
                        <td className="p-3.5 text-right font-mono text-emerald-600 dark:text-emerald-400 font-semibold">{successOrders}</td>
                        <td className="p-3.5 text-right font-mono text-slate-900 dark:text-white font-medium">
                          {formatMoney(row.gmv)}
                        </td>
                        <td className="p-3.5 text-right font-mono text-cyan-700 dark:text-cyan-300 font-bold">
                          {formatMoney(realizedRev)}
                        </td>
                        <td className="p-3.5 text-right font-mono text-slate-600 dark:text-slate-400">
                          {formatMoney(row.cogs)}
                        </td>
                        <td className="p-3.5 text-right font-mono text-rose-600 dark:text-rose-400">
                          {formatMoney((row.platformFees || 0) + (row.codFees || 0) + (row.fees || 0))}
                        </td>
                        <td className="p-3.5 text-right font-mono font-bold">
                          <span className={row.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                            {row.netProfit >= 0 ? "+" : ""}
                            {formatMoney(row.netProfit)}
                          </span>
                        </td>
                        <td className="p-3.5 text-right font-mono font-semibold">
                          <span
                            className={`rounded px-2 py-0.5 text-[11px] ${
                              row.netMarginPct >= 20
                                ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                                : row.netMarginPct >= 0
                                ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                                : "bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30"
                            }`}
                          >
                            {row.netMarginPct}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ĐỐI SOÁT TỪNG ĐƠN HÀNG (ORDER LEDGER)                              */}
      {/* ========================================================================= */}
      {activeTab === "orders" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm theo mã đơn, tên khách hoặc kênh..."
              className="w-80 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            <span className="text-xs text-slate-400">
              Hiển thị <span className="font-bold text-white">{filteredOrders.length}</span> đơn hàng
            </span>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="p-3.5">Mã Đơn / Kênh</th>
                    <th className="p-3.5">Khách Hàng / SĐT</th>
                    <th className="p-3.5">Trạng Thái Vận Chuyển</th>
                    <th className="p-3.5 text-right">Tổng Tiền (GMV)</th>
                    <th className="p-3.5 text-right">Giá Vốn (COGS)</th>
                    <th className="p-3.5 text-right">Phí Sàn & Ship</th>
                    <th className="p-3.5 text-right">Lãi/Lỗ Thực Tế</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredOrders.map((o) => (
                    <tr key={o.orderCode} className="hover:bg-slate-800/40 transition">
                      <td className="p-3.5">
                        <div className="font-bold font-mono text-blue-400">{o.orderCode}</div>
                        <div className="text-[11px] text-slate-400">{o.channel}</div>
                      </td>
                      <td className="p-3.5">
                        <div className="font-semibold text-white">{o.customerName}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{o.phone}</div>
                      </td>
                      <td className="p-3.5">
                        <span className="rounded-full bg-slate-800 border border-slate-700 px-2 py-0.5 text-[10px] text-slate-300 font-medium">
                          {o.deliveryStatus || o.status}
                        </span>
                      </td>
                      <td className="p-3.5 text-right font-mono font-bold text-white">
                        {formatMoney(o.gmv)}
                      </td>
                      <td className="p-3.5 text-right font-mono text-slate-400">
                        {formatMoney(o.totalCogs)}
                      </td>
                      <td className="p-3.5 text-right font-mono text-rose-400">
                        {formatMoney((o.platformFee || 0) + (o.affiliateFee || 0) + (o.codFee || 0) + (o.shippingLoss || 0))}
                      </td>
                      <td className="p-3.5 text-right font-mono font-bold">
                        <span className={o.netProfit >= 0 ? "text-emerald-400" : "text-rose-400"}>
                          {o.netProfit >= 0 ? "+" : ""}
                          {formatMoney(o.netProfit)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: THẤT THOÁT & HOÀN HÀNG (LOSS ENGINE)                               */}
      {/* ========================================================================= */}
      {activeTab === "loss" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-amber-900/40 bg-amber-950/20 p-5 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <span className="text-amber-400 font-bold text-xs uppercase tracking-wider">Hủy Trước Xuất Kho</span>
                <span className="text-xl">📦</span>
              </div>
              <div className="text-2xl font-bold font-mono text-white">
                {report?.lossBreakdown?.cancelledPreFulfillment?.count || 0} <span className="text-sm font-normal text-slate-400">đơn</span>
              </div>
              <div className="mt-2 text-xs text-slate-400">
                GMV hủy: <span className="font-mono text-slate-200">{(report?.lossBreakdown?.cancelledPreFulfillment?.lostGmv || 0).toLocaleString("vi-VN")} đ</span>
              </div>
              <p className="mt-3 text-[11px] text-emerald-400/90 bg-emerald-950/30 p-2 rounded-lg border border-emerald-900/30">
                ✓ Bảo toàn 100% cước phí vận chuyển (Hủy trước khi xuất kho).
              </p>
            </div>

            <div className="rounded-2xl border border-rose-900/40 bg-rose-950/20 p-5 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <span className="text-rose-400 font-bold text-xs uppercase tracking-wider">Giao Thất Bại / Bom Hàng</span>
                <span className="text-xl">⚠️</span>
              </div>
              <div className="text-2xl font-bold font-mono text-rose-400">
                {report?.lossBreakdown?.failedDelivery?.count || 0} <span className="text-sm font-normal text-slate-400">đơn</span>
              </div>
              <div className="mt-2 text-xs text-slate-400">
                Cước hoàn thực chịu: <span className="font-mono text-rose-300 font-bold">{(report?.lossBreakdown?.failedDelivery?.directShippingLoss || 0).toLocaleString("vi-VN")} đ</span>
              </div>
              <p className="mt-3 text-[11px] text-rose-400/90 bg-rose-950/30 p-2 rounded-lg border border-rose-900/30">
                ⚠️ Chi phí thất thoát thực tế (Người bán chịu phí ship 2 chiều).
              </p>
            </div>

            <div className="rounded-2xl border border-blue-900/40 bg-blue-950/20 p-5 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <span className="text-blue-400 font-bold text-xs uppercase tracking-wider">Tỷ Lệ Hoàn Toàn Kênh</span>
                <span className="text-xl">📊</span>
              </div>
              <div className="text-2xl font-bold font-mono text-white">
                {report?.lossBreakdown?.failedDeliveryRatePct || 0}%
              </div>
              <div className="mt-2 text-xs text-slate-400">
                Ngưỡng an toàn ngành Dược: <span className="font-mono text-emerald-400 font-bold">&lt; 5.0%</span>
              </div>
              <p className="mt-3 text-[11px] text-blue-400/90 bg-blue-950/30 p-2 rounded-lg border border-blue-900/30">
                💡 Cảnh báo SĐT có tỷ lệ bom cao trên Hộp thư & Giao diện Lên đơn.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: TIKTOK ADS GMV MAX & KHUNG GIỜ VÀNG (WBS-45 & WBS-46)              */}
      {/* ========================================================================= */}
      {activeTab === "ads" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-5 shadow-xl">
              <span className="text-amber-400 text-xs font-bold uppercase tracking-wider block mb-1">Khung Giờ Vàng Đỉnh</span>
              <div className="text-2xl font-black text-amber-300 font-mono">
                {adsData?.peakHourLabel || "20:00 - 20:59"}
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Chốt nhiều đơn hàng nhất trong ngày.</p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wider block mb-1">Tổng Đơn Kênh Ads</span>
              <div className="text-2xl font-black text-white font-mono">{adsData?.totalOrders || 0} đơn</div>
              <p className="text-[11px] text-slate-400 mt-2">Doanh thu: {formatMoney(adsData?.totalGmv)}</p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wider block mb-1">CPA Mục Tiêu (Cost/Order)</span>
              <div className="text-2xl font-black text-emerald-400 font-mono">
                {formatMoney(adsData?.gmvMaxPlaybook?.targetCpa || 45000)}
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Chi phí tối đa cho 1 đơn Glucare Plus.</p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wider block mb-1">ROAS Mục Tiêu</span>
              <div className="text-2xl font-black text-blue-400 font-mono">
                {adsData?.gmvMaxPlaybook?.roasTarget || 4.5}x
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Doanh thu / Chi phí quảng cáo.</p>
            </div>
          </div>

          {/* Phân bố 24 khung giờ */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
            <h4 className="font-bold text-sm text-white mb-4 flex items-center gap-2">
              <span>⏰</span> Biểu Đồ Phân Bố Đơn Hàng & GMV Theo 24 Khung Giờ (0h $\rightarrow$ 23h)
            </h4>
            <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-12 gap-2 text-center">
              {(adsData?.hourlyDistribution || []).map((h) => {
                const isPeak = h.hour === adsData?.peakHour;
                return (
                  <div
                    key={h.hour}
                    className={`p-2.5 rounded-xl border text-xs transition ${
                      isPeak
                        ? "bg-amber-600/20 border-amber-500 text-amber-300 font-bold shadow-lg shadow-amber-950/40"
                        : h.ordersCount > 0
                        ? "bg-slate-800/80 border-slate-700 text-slate-200"
                        : "bg-slate-950/60 border-slate-800/80 text-slate-500"
                    }`}
                  >
                    <div className="text-[10px] text-slate-400">{h.hour}h</div>
                    <div className="text-sm font-bold font-mono my-0.5">{h.ordersCount}</div>
                    <div className="text-[9px] text-slate-400 truncate">
                      {h.gmv > 0 ? `${Math.round(h.gmv / 1000)}k` : "-"}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 p-4 rounded-xl bg-amber-950/20 border border-amber-900/30 text-xs text-amber-200/90 leading-relaxed">
              💡 <strong>Khuyến nghị GMV Max Playbook:</strong> {adsData?.gmvMaxPlaybook?.budgetRecommendation}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: THỐNG KÊ THUẾ & XUẤT HÓA ĐƠN (WBS-45 & WBS-46)                     */}
      {/* ========================================================================= */}
      {activeTab === "tax" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-cyan-500/30 bg-cyan-950/20 p-5 shadow-xl">
              <span className="text-cyan-400 text-xs font-bold uppercase tracking-wider block mb-1">Doanh Thu Giao Thành Công</span>
              <div className="text-2xl font-black text-white font-mono">
                {formatMoney(taxData?.totalRevenue)}
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Tổng tiền khách đã thanh toán.</p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wider block mb-1">Doanh Thu Tính Thuế</span>
              <div className="text-2xl font-black text-slate-200 font-mono">
                {formatMoney(taxData?.totalTaxable)}
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Giá trước thuế VAT.</p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wider block mb-1">Thuế GTGT Phải Nộp (VAT 8%)</span>
              <div className="text-2xl font-black text-emerald-400 font-mono">
                {formatMoney(taxData?.totalVat)}
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Thuế suất ưu đãi y tế dinh dưỡng.</p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wider block mb-1">Số Đơn Xuất Hóa Đơn</span>
              <div className="text-2xl font-black text-cyan-300 font-mono">
                {taxData?.totalOrders || 0} đơn
              </div>
              <button
                onClick={handleExportTaxCsv}
                className="mt-2 w-full py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition"
              >
                Tải Bảng Kê CSV
              </button>
            </div>
          </div>

          {/* Bảng kê chi tiết đơn xuất hóa đơn */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="p-3.5">Mã Đơn</th>
                    <th className="p-3.5">Kênh Bán</th>
                    <th className="p-3.5">Khách Hàng / SĐT</th>
                    <th className="p-3.5">Ngày Hoàn Tất</th>
                    <th className="p-3.5 text-right">Tổng Tiền Thanh Toán</th>
                    <th className="p-3.5 text-right">Doanh Thu Tính Thuế</th>
                    <th className="p-3.5 text-right">Tiền Thuế VAT (8%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {(taxData?.orders || []).map((r) => (
                    <tr key={r.orderCode} className="hover:bg-slate-800/40 transition">
                      <td className="p-3.5 font-bold font-mono text-cyan-400">{r.orderCode}</td>
                      <td className="p-3.5 text-slate-300">{r.channel}</td>
                      <td className="p-3.5">
                        <div className="font-semibold text-white">{r.customerName}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{r.phone}</div>
                      </td>
                      <td className="p-3.5 text-slate-400">{(r.completedDate || "").slice(0, 10)}</td>
                      <td className="p-3.5 text-right font-mono font-bold text-white">
                        {(r.totalAmount || 0).toLocaleString("vi-VN")} đ
                      </td>
                      <td className="p-3.5 text-right font-mono text-slate-300">
                        {(r.taxableBase || 0).toLocaleString("vi-VN")} đ
                      </td>
                      <td className="p-3.5 text-right font-mono text-emerald-400 font-bold">
                        {(r.vatAmount || 0).toLocaleString("vi-VN")} đ
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: BẢNG XẾP HẠNG KPI NHÂN VIÊN SALE (WBS-47)                          */}
      {/* ========================================================================= */}
      {activeTab === "kpi" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-indigo-500/30 bg-indigo-950/20 p-5 shadow-xl">
              <span className="text-indigo-400 text-xs font-bold uppercase tracking-wider block mb-1">Tổng Doanh Thu Sale</span>
              <div className="text-2xl font-black text-white font-mono">
                {formatMoney(kpiData?.teamSummary?.totalRevenue)}
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Tổng doanh số đội ngũ Sale đã chốt.</p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wider block mb-1">Tổng Đơn Hàng Đã Chốt</span>
              <div className="text-2xl font-black text-white font-mono">
                {kpiData?.teamSummary?.totalOrders || 0} đơn
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Phát sinh từ tư vấn qua tin nhắn.</p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wider block mb-1">Tỷ Lệ Chốt Trung Bình</span>
              <div className="text-2xl font-black text-emerald-400 font-mono">
                {kpiData?.teamSummary?.avgClosingRate || 0}%
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Tỷ lệ chuyển đổi Lead thành khách mua.</p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wider block mb-1">Tỷ Lệ Phản Hồi Tin Nhắn</span>
              <div className="text-2xl font-black text-blue-400 font-mono">
                {kpiData?.teamSummary?.avgResponseRate || 96.5}%
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Thời gian phản hồi TB: 42 giây.</p>
            </div>
          </div>

          {/* Bảng xếp hạng nhân viên */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h4 className="font-bold text-sm text-white flex items-center gap-2">
                <span>🏆</span> Bảng Xếp Hạng & Chỉ Số Hiệu Suất Từng Nhân Viên Sale
              </h4>
              <span className="text-xs text-slate-400">Chỉ tiêu tháng: 150.000.000 đ/nhân viên</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="p-3.5">Hạng / Nhân Viên</th>
                    <th className="p-3.5">Vai Trò</th>
                    <th className="p-3.5 text-right">Doanh Thu Chốt</th>
                    <th className="p-3.5 text-right">Số Đơn</th>
                    <th className="p-3.5 text-right">Khách Phụ Trách</th>
                    <th className="p-3.5 text-right">Tỷ Lệ Chốt</th>
                    <th className="p-3.5 text-right">Tiến Độ KPI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {(kpiData?.staffRankings || []).map((s, idx) => (
                    <tr key={s.staffId} className="hover:bg-slate-800/40 transition">
                      <td className="p-3.5 font-bold text-white flex items-center gap-3">
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${
                            idx === 0
                              ? "bg-amber-500 text-slate-950"
                              : idx === 1
                              ? "bg-slate-300 text-slate-950"
                              : idx === 2
                              ? "bg-amber-700 text-white"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <div>
                          <div>{s.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">@{s.username}</div>
                        </div>
                      </td>
                      <td className="p-3.5">
                        <span className="rounded bg-indigo-500/20 text-indigo-300 px-2 py-0.5 text-[10px] font-semibold border border-indigo-500/30">
                          {s.role}
                        </span>
                      </td>
                      <td className="p-3.5 text-right font-mono font-bold text-emerald-400">
                        {(s.revenue || 0).toLocaleString("vi-VN")} đ
                      </td>
                      <td className="p-3.5 text-right font-mono text-white">{s.totalOrders} đơn</td>
                      <td className="p-3.5 text-right font-mono text-slate-300">{s.assignedCustomersCount} khách</td>
                      <td className="p-3.5 text-right font-mono font-bold text-cyan-400">{s.closingRate}%</td>
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-20 bg-slate-800 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-emerald-500 h-2 rounded-full"
                              style={{ width: `${Math.min(100, s.kpiCompletionPct)}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs font-semibold text-slate-300">{s.kpiCompletionPct}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 7: PHÂN TÍCH KHÁCH HÀNG & TỶ LỆ MUA LẠI RETENTION (WBS-48)            */}
      {/* ========================================================================= */}
      {activeTab === "customers" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-teal-500/30 bg-teal-950/20 p-5 shadow-xl">
              <span className="text-teal-400 text-xs font-bold uppercase tracking-wider block mb-1">Tổng Số Khách Hàng 360</span>
              <div className="text-2xl font-black text-white font-mono">
                {customersData?.totalCustomers || 0} hồ sơ
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Hợp nhất từ 7 kênh theo SĐT chuẩn.</p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wider block mb-1">Tỷ Lệ Mua Lại (Retention)</span>
              <div className="text-2xl font-black text-emerald-400 font-mono">
                {customersData?.retentionRate || 0}%
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Khách mua từ 2 lần trở lên.</p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wider block mb-1">Khách Mua Lại (Lần 2, 3+)</span>
              <div className="text-2xl font-black text-teal-300 font-mono">
                {customersData?.repeatCustomers || 0} khách
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Đang duy trì uống liệu trình ADDP.</p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wider block mb-1">Tiềm Năng (Chưa Lên Đơn)</span>
              <div className="text-2xl font-black text-amber-400 font-mono">
                {customersData?.noOrderLeads || 0} leads
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Cần chăm sóc kịch bản Ngày 1 - 3.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Cơ cấu theo nguồn khách */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
              <h4 className="font-bold text-sm text-white mb-3 flex items-center gap-2">
                <span>🌐</span> Cơ Cấu Khách Hàng Theo Nền Tảng Tiếp Nhận
              </h4>
              <div className="space-y-2.5">
                {Object.entries(customersData?.sourcesBreakdown || {}).map(([src, count]) => {
                  const pct = customersData?.totalCustomers ? Math.round((count / customersData.totalCustomers) * 100) : 0;
                  return (
                    <div key={src} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-300 font-medium">{src}</span>
                        <span className="font-mono text-slate-400">{count} khách ({pct}%)</span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div className="bg-teal-500 h-2 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Cơ cấu theo nhóm bệnh lý */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
              <h4 className="font-bold text-sm text-white mb-3 flex items-center gap-2">
                <span>🩺</span> Cơ Cấu Khách Hàng Theo Nhóm Bệnh Lý
              </h4>
              <div className="space-y-2.5">
                {Object.entries(customersData?.pathologiesBreakdown || {}).map(([pathology, count]) => {
                  const pct = customersData?.totalCustomers ? Math.round((count / customersData.totalCustomers) * 100) : 0;
                  return (
                    <div key={pathology} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-300 font-medium">{pathology}</span>
                        <span className="font-mono text-slate-400">{count} hồ sơ ({pct}%)</span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
