"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

/**
 * ADDP Omnichannel AI CRM — Dashboard Báo Cáo Doanh Số, Lãi/Lỗ Thực Tế & Đối Soát BI (WBS-43 & WBS-44)
 * Kế thừa nghiệp vụ từ C:\AdsTiktok (CommerceDashboardView.jsx, commerce_loss_engine.php, commerce_finance_service.php)
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
  const [activeTab, setActiveTab] = useState(initialTab); // 'channels' | 'orders' | 'loss'

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

  const metrics = report?.metricsOverview || {
    gmv: 0,
    realizedRevenue: 0,
    totalOrders: 0,
    successfulOrders: 0,
    failedDeliveryOrders: 0,
    successRatePct: 0,
    returnRatePct: 0,
    aov: 0,
  };

  const finance = report?.financeBreakdown || {
    cogs: 0,
    cogsRatioPct: 0,
    platformFees: 0,
    affiliateCommissions: 0,
    codFees: 0,
    shippingLoss: 0,
    totalDeductions: 0,
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
            <span className="rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-semibold px-2 py-0.5 border border-emerald-500/30">
              WBS-43 & WBS-44
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Kế thừa từ <code>C:\AdsTiktok</code> (Loss Engine, Finance Statements, Break-even Unit Economics). Bóc tách giá vốn COGS tự động từ công thức Combo (WBS-41).
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
            onClick={() => {
              alert("Tính năng xuất Excel theo định dạng Thuế chuẩn (WBS-46) đang kết nối.");
            }}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3.5 py-2 transition shadow shadow-emerald-600/20"
          >
            <span>📊</span>
            <span>Xuất Excel BI</span>
          </button>
        </div>
      </div>

      {/* Thanh Công Cụ Bộ Lọc (Presets Thời Gian & Kênh Bán Hàng) */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400 font-medium mr-1">Kỳ báo cáo:</span>
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition ${
                preset === p.key
                  ? "bg-blue-600 text-white shadow"
                  : "bg-slate-950 text-slate-400 hover:text-white border border-slate-800"
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
        <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900/90 to-slate-950 p-5 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">
            <span>Doanh Thu Thực Nhận</span>
            <span className="text-blue-400 text-base">💰</span>
          </div>
          <div className="text-2xl font-black text-white tracking-tight">
            {metrics.realizedRevenue.toLocaleString("vi-VN")} đ
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/80 pt-2.5">
            <span>Tổng GMV: {metrics.gmv.toLocaleString("vi-VN")} đ</span>
            <span className="text-emerald-400 font-semibold">
              {metrics.successfulOrders > 0
                ? `${metrics.successRatePct}% thành công`
                : `${metrics.totalOrders} đơn đang xử lý`}
            </span>
          </div>
        </div>

        {/* THẺ 2: LỢI NHUẬN RÒNG THỰC TẾ (NET PROFIT) */}
        <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/20 to-slate-950 p-5 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between text-emerald-400 text-xs font-medium uppercase tracking-wider mb-2">
            <span>Lợi Nhuận Ròng Thực Tế</span>
            <span className="text-emerald-400 text-base">✨</span>
          </div>
          <div className="text-2xl font-black text-emerald-400 tracking-tight">
            {finance.netProfit >= 0 ? "+" : ""}
            {finance.netProfit.toLocaleString("vi-VN")} đ
          </div>
          <div className="mt-3 flex items-center justify-between text-xs border-t border-slate-800/80 pt-2.5">
            <span className="text-slate-400">Tỷ suất Net Margin:</span>
            <span className="text-emerald-400 font-bold">{finance.netMarginPct}%</span>
          </div>
        </div>

        {/* THẺ 3: GIÁ VỐN HÀNG BÁN (COGS) */}
        <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900/90 to-slate-950 p-5 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">
            <span>Tổng Giá Vốn (COGS)</span>
            <span className="text-amber-400 text-base">📦</span>
          </div>
          <div className="text-2xl font-black text-amber-400 tracking-tight">
            {finance.cogs.toLocaleString("vi-VN")} đ
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/80 pt-2.5">
            <span>Tỷ lệ vốn / Doanh thu:</span>
            <span className="text-amber-400 font-semibold">{finance.cogsRatioPct}%</span>
          </div>
        </div>

        {/* THẺ 4: PHÍ SÀN & CHI PHÍ THẤT THOÁT */}
        <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900/90 to-slate-950 p-5 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">
            <span>Khấu Trừ Phí & Thất Thoát</span>
            <span className="text-rose-400 text-base">📉</span>
          </div>
          <div className="text-2xl font-black text-rose-400 tracking-tight">
            {(finance.platformFees + finance.affiliateCommissions + finance.codFees + finance.shippingLoss).toLocaleString("vi-VN")} đ
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/80 pt-2.5">
            <span>Phí sàn & thu hộ: {(finance.platformFees + finance.codFees).toLocaleString("vi-VN")} đ</span>
            <span className="text-rose-400 font-semibold">{metrics.returnRatePct}% hoàn</span>
          </div>
        </div>
      </div>

      {/* Tabs Chuyển Đổi Chế Độ Xem Báo Cáo */}
      <div className="flex border-b border-slate-800 gap-2">
        <button
          onClick={() => setActiveTab("channels")}
          className={`flex items-center gap-2 pb-3 px-4 text-xs font-semibold transition border-b-2 ${
            activeTab === "channels"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          <span>🌐</span>
          <span>Báo Cáo Hiệu Quả Theo 7 Nền Tảng (Channels Matrix)</span>
        </button>

        <button
          onClick={() => setActiveTab("orders")}
          className={`flex items-center gap-2 pb-3 px-4 text-xs font-semibold transition border-b-2 ${
            activeTab === "orders"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          <span>📑</span>
          <span>Đối Soát Lãi/Lỗ Từng Đơn Hàng (Order Ledger)</span>
          <span className="rounded-full bg-slate-800 text-slate-300 text-[10px] font-bold px-2 py-0.2">
            {orderDetails.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("loss")}
          className={`flex items-center gap-2 pb-3 px-4 text-xs font-semibold transition border-b-2 ${
            activeTab === "loss"
              ? "border-rose-500 text-rose-400"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          <span>📉</span>
          <span>Phân Tích Thất Thoát & Hoàn Hàng (Loss Engine)</span>
          {report?.lossBreakdown?.failedDelivery.count > 0 && (
            <span className="rounded-full bg-rose-950/80 text-rose-400 border border-rose-800 text-[10px] font-bold px-2 py-0.2">
              {report.lossBreakdown.failedDelivery.count} bom
            </span>
          )}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: BẢNG CƠ CẤU DOANH THU & LÃI/LỖ THEO 7 KÊNH BÁN HÀNG                */}
      {/* ========================================================================= */}
      {activeTab === "channels" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-xs text-white uppercase tracking-wider">
                Bảng Đối Soát Hiệu Quả Kinh Doanh Toàn Kênh (7 Kênh Hợp Nhất)
              </h3>
              <span className="text-xs text-slate-500">
                Tự động khấu trừ phí sàn, phí vận chuyển hoàn, giá vốn COGS và hoa hồng
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800 bg-slate-950 text-slate-400 uppercase text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Kênh Bán Hàng</th>
                    <th className="py-3 px-4 text-center">Tổng Đơn</th>
                    <th className="py-3 px-4 text-right">Doanh Số (GMV)</th>
                    <th className="py-3 px-4 text-right">Thực Nhận</th>
                    <th className="py-3 px-4 text-right">Giá Vốn (COGS)</th>
                    <th className="py-3 px-4 text-right">Phí Sàn & Thu Hộ</th>
                    <th className="py-3 px-4 text-right">Lợi Nhuận Ròng</th>
                    <th className="py-3 px-4 text-center">Tỷ Suất Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-200">
                  {channelStats.map((c) => {
                    const isProfit = c.netProfit >= 0;
                    return (
                      <tr key={c.channelKey} className="hover:bg-slate-800/40 transition">
                        <td className="py-3 px-4 font-semibold text-white">
                          <div className="flex items-center gap-2">
                            <span>
                              {c.channelKey === "WEBSITE_MAGENTO"
                                ? "🌐"
                                : c.channelKey === "TIKTOK_SHOP"
                                ? "🎵"
                                : c.channelKey === "SHOPEE"
                                ? "🧡"
                                : c.channelKey === "KIOTVIET"
                                ? "🛒"
                                : c.channelKey === "ZALO_PERSONAL"
                                ? "💬"
                                : "📘"}
                            </span>
                            <span>{c.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-medium">
                          {c.orders}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-medium text-slate-300">
                          {c.gmv.toLocaleString("vi-VN")} đ
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-white">
                          {c.realized.toLocaleString("vi-VN")} đ
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-amber-400">
                          {c.cogs.toLocaleString("vi-VN")} đ
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-rose-400">
                          {c.fees.toLocaleString("vi-VN")} đ
                        </td>
                        <td className={`py-3 px-4 text-right font-mono font-bold ${isProfit ? "text-emerald-400" : "text-rose-400"}`}>
                          {isProfit ? "+" : ""}
                          {c.netProfit.toLocaleString("vi-VN")} đ
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                              c.netMarginPct >= 20
                                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                : c.netMarginPct > 0
                                ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                                : "bg-slate-800 text-slate-400 border-slate-700"
                            }`}
                          >
                            {c.netMarginPct}%
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
      {/* TAB 2: ĐỐI SOÁT LÃI/LỖ TỪNG ĐƠN HÀNG (AUDITABLE ORDER LEDGER)               */}
      {/* ========================================================================= */}
      {activeTab === "orders" && (
        <div className="space-y-4">
          {/* Thanh tìm kiếm đơn hàng */}
          <div className="flex items-center justify-between gap-4">
            <div className="w-full max-w-sm">
              <input
                type="text"
                placeholder="Tìm theo mã đơn (DH-...), tên khách, kênh..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <span className="text-xs text-slate-400">
              Hiển thị {filteredOrders.length} / {orderDetails.length} đơn hàng
            </span>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800 bg-slate-950 text-slate-400 uppercase text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Mã Đơn Hàng</th>
                    <th className="py-3 px-4">Khách Hàng</th>
                    <th className="py-3 px-4">Kênh Bán</th>
                    <th className="py-3 px-4">Phân Loại Kinh Tế</th>
                    <th className="py-3 px-4 text-right">Doanh Số (GMV)</th>
                    <th className="py-3 px-4 text-right">Thực Nhận</th>
                    <th className="py-3 px-4 text-right">Giá Vốn (COGS)</th>
                    <th className="py-3 px-4 text-right">Phí Khấu Trừ</th>
                    <th className="py-3 px-4 text-right">Lãi/Lỗ Ròng</th>
                    <th className="py-3 px-4 text-center">Tỷ Suất</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-200">
                  {filteredOrders.map((o) => {
                    const isProfit = o.netProfit >= 0;
                    return (
                      <tr key={o.orderId} className="hover:bg-slate-800/40 transition">
                        <td className="py-3 px-4 font-mono font-bold text-blue-400">
                          {o.orderCode}
                        </td>
                        <td className="py-3 px-4 font-medium text-white">
                          {o.customerName}
                        </td>
                        <td className="py-3 px-4 text-slate-400">
                          <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                            {o.channel}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                              o.outcome === "SUCCESSFUL_ORDER"
                                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                : o.outcome === "FAILED_DELIVERY"
                                ? "bg-rose-500/20 text-rose-400 border-rose-500/30"
                                : "bg-blue-500/20 text-blue-400 border-blue-500/30"
                            }`}
                          >
                            {o.outcome === "SUCCESSFUL_ORDER"
                              ? "Giao Thành Công"
                              : o.outcome === "FAILED_DELIVERY"
                              ? "Giao Thất Bại / Hoàn"
                              : "Đang Giao Hàng"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-medium text-slate-300">
                          {o.gmv.toLocaleString("vi-VN")} đ
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-white">
                          {o.realizedRevenue.toLocaleString("vi-VN")} đ
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-amber-400">
                          {o.cogs.toLocaleString("vi-VN")} đ
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-rose-400">
                          {(o.platformFee + o.affiliateFee + o.codFee + o.shippingLoss).toLocaleString("vi-VN")} đ
                        </td>
                        <td className={`py-3 px-4 text-right font-mono font-bold ${isProfit ? "text-emerald-400" : "text-rose-400"}`}>
                          {isProfit ? "+" : ""}
                          {o.netProfit.toLocaleString("vi-VN")} đ
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`font-mono text-[11px] font-bold ${
                              o.marginPct >= 20 ? "text-emerald-400" : o.marginPct > 0 ? "text-blue-400" : "text-slate-500"
                            }`}
                          >
                            {o.marginPct}%
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
      {/* TAB 3: PHÂN TÍCH THẤT THOÁT & TỶ LỆ HOÀN HÀNG (LOSS ENGINE ANALYSIS)       */}
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

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
            <h4 className="font-bold text-sm text-white mb-2 flex items-center gap-2">
              <span>🛡️</span> Cơ Chế Chặn Thất Thoát Tự Động (Kế Thừa từ C:\AdsTiktok commerce_loss_engine.php)
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Theo quy chuẩn Điều 2 và Điều 11 AGENTS.md, hệ thống áp dụng nguyên tắc bất biến:{" "}
              <code className="text-amber-300 bg-slate-950 px-1.5 py-0.5 rounded font-mono">SUM(loss_amount) &le; order_gross_amount</code>. 
              Các đơn hàng giao thất bại được tính cước vận chuyển chiều hoàn theo biểu phí thực tế từng sàn: 
              TikTok Shop (32.000 đ), Shopee (30.000 đ), Website Magento & KiotViet (25.000 – 28.000 đ). Khi phát hiện khách hàng có từ 2 đơn bom trở lên, 
              hệ thống tự động kích hoạt cờ đỏ cảnh báo trên Hộp Thư Đa Kênh và Giao diện Lên Đơn Nhanh.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
