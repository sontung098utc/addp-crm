"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Clock,
  ExternalLink,
  Layers,
  MessageCircle,
  Phone,
  Radio,
  RefreshCw,
  Send,
  ShieldCheck,
  ShoppingBag,
  TrendingUp,
  Users,
  AlertTriangle,
} from "lucide-react";

const RANGE_OPTIONS = [
  { key: "7d", label: "7 ngày" },
  { key: "30d", label: "30 ngày" },
  { key: "month", label: "Tháng này" },
];

function formatVnd(amount) {
  const num = Number(amount) || 0;
  return `${new Intl.NumberFormat("vi-VN").format(Math.round(num))} đ`;
}

function formatCompactVnd(amount) {
  const num = Number(amount) || 0;
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)} tỷ`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)} tr`;
  if (num >= 1_000) return `${Math.round(num / 1_000)}k`;
  return `${num}`;
}

function formatDateTimeVi(iso) {
  if (!iso) return "Chưa đồng bộ";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "Chưa đồng bộ";
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ChannelDonutChart({ channels, totalRevenue }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;

  const segments = useMemo(() => {
    if (!totalRevenue || totalRevenue <= 0) return [];
    let accumulated = 0;
    return channels
      .filter((c) => c.revenue > 0)
      .map((c) => {
        const fraction = c.revenue / totalRevenue;
        const dashLength = fraction * circumference;
        const dashOffset = -accumulated;
        accumulated += dashLength;
        return {
          ...c,
          dashArray: `${dashLength} ${circumference - dashLength}`,
          dashOffset,
        };
      });
  }, [channels, totalRevenue, circumference]);

  return (
    <div className="relative w-36 h-36 mx-auto shrink-0">
      <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="transparent"
          stroke="rgba(51,65,85,0.55)"
          strokeWidth="16"
        />
        {segments.map((seg) => (
          <circle
            key={seg.key}
            cx="70"
            cy="70"
            r={radius}
            fill="transparent"
            stroke={seg.color}
            strokeWidth="16"
            strokeDasharray={seg.dashArray}
            strokeDashoffset={seg.dashOffset}
            strokeLinecap="butt"
            className="transition-all duration-300"
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
          Doanh số
        </span>
        <span className="text-sm font-extrabold text-white mt-0.5 leading-tight">
          {formatCompactVnd(totalRevenue)}
        </span>
      </div>
    </div>
  );
}

function DailyRevenueChart({ dailySeries }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  const maxRevenue = useMemo(() => {
    const maxVal = Math.max(...dailySeries.map((d) => Number(d.revenue) || 0), 0);
    return maxVal > 0 ? maxVal : 1;
  }, [dailySeries]);

  const hasAnyRevenue = useMemo(
    () => dailySeries.some((d) => (Number(d.revenue) || 0) > 0 || (Number(d.orders) || 0) > 0),
    [dailySeries]
  );

  const activeDay = hoveredIdx !== null ? dailySeries[hoveredIdx] : null;
  const showLabelStep = dailySeries.length > 16 ? Math.ceil(dailySeries.length / 8) : dailySeries.length > 10 ? 2 : 1;

  return (
    <div className="space-y-3">
      {/* Thanh thông tin khi hover hoặc tổng quan */}
      <div className="min-h-[44px] rounded-xl border border-slate-800 bg-slate-950/70 px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        {activeDay ? (
          <>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white">Ngày {activeDay.label}</span>
              <span className="text-slate-500">({activeDay.date})</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-bold text-emerald-400">
                Doanh thu: {formatVnd(activeDay.revenue)}
              </span>
              <span className="font-semibold text-blue-400">
                {activeDay.orders} đơn hàng
              </span>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between w-full text-slate-400">
            <span>Di chuột vào từng cột ngày để xem doanh thu & số đơn chi tiết</span>
            <span className="text-[11px] text-slate-500">
              {dailySeries.length} ngày gần nhất
            </span>
          </div>
        )}
      </div>

      {/* Biểu đồ cột SVG / HTML Responsive */}
      <div className="relative rounded-xl border border-slate-800/80 bg-slate-950/50 p-4">
        {!hasAnyRevenue && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/60 backdrop-blur-[1px] rounded-xl px-4 text-center">
            <BarChart3 className="w-7 h-7 text-slate-500 mb-1.5" />
            <p className="text-xs font-semibold text-slate-300">
              Chưa phát sinh đơn hàng trong khoảng thời gian này (0 đ)
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Dữ liệu sẽ tự động cập nhật khi có đơn từ KiotViet, TikTok Shop, Shopee, Magento hoặc Zalo/FB.
            </p>
          </div>
        )}

        <div className="flex">
          {/* Trục Y */}
          <div className="hidden sm:flex flex-col justify-between text-[10px] text-slate-500 pr-3 py-1 select-none h-52 w-14 text-right shrink-0">
            <span>{formatCompactVnd(maxRevenue)}</span>
            <span>{formatCompactVnd(Math.round(maxRevenue * 0.5))}</span>
            <span>0 đ</span>
          </div>

          {/* Vùng cột */}
          <div className="flex-1 flex flex-col">
            <div className="h-52 flex items-end gap-1 sm:gap-1.5 border-b border-slate-800 pb-1 relative">
              {/* Đường kẻ ngang tham chiếu */}
              <div className="absolute inset-x-0 top-0 border-t border-dashed border-slate-800/70 pointer-events-none" />
              <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-slate-800/70 pointer-events-none" />

              {dailySeries.map((day, idx) => {
                const val = Number(day.revenue) || 0;
                const heightPct = val > 0 ? Math.max(4, Math.round((val / maxRevenue) * 100)) : 0;
                const isHovered = hoveredIdx === idx;

                return (
                  <div
                    key={day.date}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    className="flex-1 h-full flex flex-col justify-end items-center group cursor-pointer relative"
                    title={`${day.date}: ${formatVnd(val)} (${day.orders} đơn)`}
                  >
                    <div
                      style={{ height: `${heightPct}%` }}
                      className={`w-full max-w-[26px] rounded-t-md transition-all duration-200 ${
                        isHovered
                          ? "bg-gradient-to-t from-blue-600 to-cyan-400 shadow-[0_0_12px_rgba(56,189,248,0.4)]"
                          : val > 0
                          ? "bg-gradient-to-t from-blue-600/80 to-blue-400/90"
                          : "bg-slate-800/40 min-h-[2px]"
                      }`}
                    />
                  </div>
                );
              })}
            </div>

            {/* Nhãn ngày trục X */}
            <div className="flex items-center gap-1 sm:gap-1.5 pt-2">
              {dailySeries.map((day, idx) => {
                const show = idx % showLabelStep === 0 || idx === dailySeries.length - 1;
                return (
                  <div
                    key={day.date}
                    className="flex-1 text-center text-[10px] text-slate-500 truncate select-none"
                  >
                    {show ? day.label : ""}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [range, setRange] = useState("30d");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // Tự động đón mã code OAuth khi TikTok Shop redirect về root URL (https://crm.addp.vn/?code=xxxx)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = (params.get("code") || params.get("auth_code") || "").trim();
    if (code) {
      router.replace(`/channels${window.location.search}`);
    }
  }, [router]);

  const fetchOverview = useCallback(async (selectedRange, isManualRefresh = false) => {
    try {
      if (isManualRefresh) setRefreshing(true);
      setError("");

      const res = await fetch(`/api/dashboard/overview?range=${encodeURIComponent(selectedRange)}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Không thể tải dữ liệu Trung Tâm Điều Hành.");
      }

      setData(json);
    } catch (err) {
      setError(err.message || "Lỗi kết nối máy chủ.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/dashboard/overview?range=${encodeURIComponent(range)}`, {
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (!active) return;

        if (res.status === 401) {
          router.push("/login");
          return;
        }
        if (!res.ok || !json.ok) {
          setError(json.error || "Không thể tải dữ liệu Trung Tâm Điều Hành.");
        } else {
          setError("");
          setData(json);
        }
      } catch (err) {
        if (active) setError(err.message || "Lỗi kết nối máy chủ.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [range, router]);

  const kpi = data?.kpi || {
    totalRevenue: 0,
    totalOrders: 0,
    validOrders: 0,
    cancelledOrFailedOrders: 0,
    aov: 0,
    totalCustomers: 0,
    careDueToday: 0,
    careOverdue: 0,
    careCompletedToday: 0,
    unreadConversations: 0,
    connectedChannelsCount: 0,
    connectedPlatformsCount: 0,
    totalPlatformsCount: 7,
  };

  const channelBreakdown = data?.channelBreakdown || [];
  const dailySeries = data?.dailySeries || [];
  const priorityCareList = data?.priorityCareList || [];
  const careProgress = data?.careProgress || {
    dueToday: 0,
    overdue: 0,
    dueAndOverdue: 0,
    completedToday: 0,
    totalPending: 0,
    completionRatePct: 0,
  };
  const systemStatus = data?.systemStatus || {
    platforms: [],
    antiBan: { minDelaySec: 45, maxDelaySec: 120, dailyMsgLimit: 70 },
    broadcast: { totalCampaigns: 0, runningCount: 0, activeCampaigns: [] },
    kiotvietSync: { connected: false, isSyncing: false, lastSyncTime: null },
  };

  return (
    <div suppressHydrationWarning className="space-y-6">
      {/* Thanh tiêu đề & Bộ lọc thời gian */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white flex flex-wrap items-center gap-2">
            <span>Trung Tâm Điều Hành ADDP CRM</span>
            <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold">
              <Radio className="w-3 h-3 animate-pulse" />
              Dữ liệu thời gian thực
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Tổng hợp doanh số đa sàn, tiến độ chăm sóc khách hàng 7 mốc vàng và trạng thái kết nối 7 nền tảng
            {data?.period ? ` • Kỳ: ${data.period.startDate} → ${data.period.endDate}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Bộ lọc khoảng thời gian */}
          <div className="inline-flex items-center rounded-xl border border-slate-800 bg-slate-900/90 p-1">
            {RANGE_OPTIONS.map((opt) => {
              const active = range === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setRange(opt.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    active
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => fetchOverview(range, true)}
            disabled={loading || refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-slate-200 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span>Làm mới</span>
          </button>

          <Link
            href="/inbox"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white shadow-xs transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>Vào Hộp Thư</span>
            {kpi.unreadConversations > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-bold">
                {kpi.unreadConversations}
              </span>
            )}
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-300 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchOverview(range, true)}
            className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-semibold cursor-pointer"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Hàng KPI 5 thẻ thực tế */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Doanh Số Toàn Hệ Thống</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-white mt-2 tracking-tight">
            {loading ? "..." : formatVnd(kpi.totalRevenue)}
          </div>
          <div className="text-[11px] text-slate-400 mt-2">
            Giá trị TB đơn (AOV):{" "}
            <span className="text-emerald-400 font-semibold">{formatVnd(kpi.aov)}</span>
          </div>
        </div>

        <Link
          href="/orders"
          className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 hover:border-slate-700 transition-colors block"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Tổng Đơn Đa Sàn</span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-white mt-2 tracking-tight">
            {loading ? "..." : `${kpi.totalOrders} đơn`}
          </div>
          <div className="text-[11px] text-slate-400 mt-2">
            Hợp lệ: <span className="text-blue-400 font-semibold">{kpi.validOrders}</span> • Hủy/Hoàn:{" "}
            <span className="text-rose-400 font-semibold">{kpi.cancelledOrFailedOrders}</span>
          </div>
        </Link>

        <Link
          href="/care"
          className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 hover:border-slate-700 transition-colors block"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Khách Cần CSKH Hôm Nay</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <CalendarClock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-white mt-2 tracking-tight">
            {loading ? "..." : `${kpi.careDueToday + kpi.careOverdue} khách`}
          </div>
          <div className="text-[11px] text-slate-400 mt-2">
            Hôm nay: <span className="text-amber-400 font-semibold">{kpi.careDueToday}</span> • Quá hạn:{" "}
            <span className="text-rose-400 font-semibold">{kpi.careOverdue}</span>
          </div>
        </Link>

        <Link
          href="/customers"
          className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 hover:border-slate-700 transition-colors block"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Tổng Khách Hàng 360</span>
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-white mt-2 tracking-tight">
            {loading ? "..." : `${kpi.totalCustomers} khách`}
          </div>
          <div className="text-[11px] text-slate-400 mt-2">
            Hội thoại chưa trả lời:{" "}
            <span className="text-cyan-400 font-semibold">{kpi.unreadConversations}</span>
          </div>
        </Link>

        <Link
          href="/channels"
          className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 hover:border-slate-700 transition-colors block"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Trạng Thái 7 Kênh</span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-white mt-2 tracking-tight">
            {loading ? "..." : `${kpi.connectedPlatformsCount}/${kpi.totalPlatformsCount} nền tảng`}
          </div>
          <div className="text-[11px] text-slate-400 mt-2">
            Tài khoản đang hoạt động:{" "}
            <span className="text-purple-400 font-semibold">{kpi.connectedChannelsCount}</span>
          </div>
        </Link>
      </div>

      {/* Khu vực Biểu đồ Doanh số Toàn Hệ thống */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Biểu đồ doanh số theo ngày */}
        <section className="xl:col-span-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-400" />
                <span>Biểu Đồ Doanh Số Toàn Hệ Thống Theo Ngày</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Thống kê doanh thu thực tế từ đơn hàng hợp lệ trên tất cả các kênh bán
              </p>
            </div>
            <Link
              href="/reports"
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300"
            >
              <span>Báo cáo BI chi tiết</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>

          <DailyRevenueChart dailySeries={dailySeries} />
        </section>

        {/* Biểu đồ phân bổ tỷ trọng theo kênh */}
        <section className="xl:col-span-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5 space-y-4">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white">
              Tỷ Trọng Doanh Số Theo Kênh
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              KiotViet, TikTok Shop, Shopee, Website Magento & Zalo/FB
            </p>
          </div>

          <ChannelDonutChart channels={channelBreakdown} totalRevenue={kpi.totalRevenue} />

          <div className="space-y-2.5 pt-1">
            {channelBreakdown.map((ch) => (
              <div key={ch.key} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: ch.color }}
                    />
                    <span className="font-medium text-slate-200 truncate">{ch.name}</span>
                    <span className="text-[11px] text-slate-500 shrink-0">({ch.orders} đơn)</span>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <span className="font-bold text-white">{formatVnd(ch.revenue)}</span>
                    <span className="text-[11px] text-slate-400 ml-1.5">{ch.percentage}%</span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, ch.percentage)}%`,
                      backgroundColor: ch.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Khu vực Khách hàng cần chăm sóc & Tổng quát hệ thống */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Cột trái: Khách hàng cần chăm sóc ưu tiên */}
        <section className="xl:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-amber-400" />
                <span>Khách Hàng Cần Chăm Sóc Ưu Tiên (7 Mốc Vàng)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Lịch đến hạn hôm nay & quá hạn (Ngày 1, 3, 7, 14, 21, Dùng 1/2, Dùng 2/3)
              </p>
            </div>
            <Link
              href="/care"
              className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 hover:text-amber-300"
            >
              <span>Mở bảng CSKH</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Tiến độ hoàn thành CSKH hôm nay */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-300">
                Tiến độ hoàn thành CSKH hôm nay
              </span>
              <span className="font-bold text-emerald-400">
                Đã chăm: {careProgress.completedToday} • Còn lại: {careProgress.dueAndOverdue} ({careProgress.completionRatePct}%)
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-300"
                style={{ width: `${Math.min(100, careProgress.completionRatePct)}%` }}
              />
            </div>
          </div>

          {/* Danh sách khách hàng ưu tiên */}
          {priorityCareList.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-6 text-center">
              <CheckCircle2 className="w-7 h-7 text-emerald-400 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-200">
                Không có lịch chăm sóc quá hạn hoặc đến hạn khẩn cấp
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Tổng lịch chăm sóc đang chờ: {careProgress.totalPending} khách hàng.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-950/40 overflow-hidden">
              {priorityCareList.map((item) => (
                <div
                  key={`${item.id}-${item.taskId || item.milestone}`}
                  className="p-3 hover:bg-slate-900/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-white truncate">
                        {item.fullName}
                      </span>
                      {item.phone && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-cyan-400 font-mono">
                          <Phone className="w-3 h-3" />
                          {item.phone}
                        </span>
                      )}
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30 font-semibold">
                        {item.milestoneLabel}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                          item.isOverdue
                            ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                            : item.isToday
                            ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                            : "bg-slate-800 text-slate-300 border-slate-700"
                        }`}
                      >
                        {item.daysText}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate">
                      {item.title}
                      {item.pathology ? ` • Bệnh lý: ${item.pathology}` : ""}
                      {item.staffName ? ` • Phụ trách: ${item.staffName}` : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {item.customerId && (
                      <Link
                        href={`/customers/${item.customerId}`}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-[11px] font-semibold text-slate-200 transition-colors"
                      >
                        Hồ sơ 360
                      </Link>
                    )}
                    <Link
                      href={item.phone ? `/inbox?phone=${encodeURIComponent(item.phone)}` : "/inbox"}
                      className="px-2.5 py-1.5 rounded-lg bg-blue-600/90 hover:bg-blue-500 text-[11px] font-semibold text-white transition-colors"
                    >
                      Nhắn tin
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Cột phải: Tình trạng tổng quát hệ thống */}
        <section className="xl:col-span-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Tình Trạng Tổng Quát Hệ Thống</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Kết nối 7 nền tảng, hàng đợi Anti-Ban Zalo & đồng bộ đơn hàng
              </p>
            </div>
            <Link
              href="/channels"
              className="text-xs font-semibold text-blue-400 hover:text-blue-300"
            >
              Cấu hình kênh
            </Link>
          </div>

          {/* Danh sách 7 nền tảng */}
          <div className="space-y-2">
            {systemStatus.platforms.map((plat) => {
              const isConnected = plat.status === "CONNECTED";
              return (
                <div
                  key={plat.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-800/90 bg-slate-950/50 px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        isConnected ? "bg-emerald-400" : "bg-slate-600"
                      }`}
                    />
                    <span className="font-medium text-slate-200 truncate">{plat.name}</span>
                  </div>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full font-semibold shrink-0 border ${
                      isConnected
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        : "bg-slate-800 text-slate-400 border-slate-700"
                    }`}
                  >
                    {isConnected
                      ? `Đã kết nối (${plat.connectedAccounts} TK)`
                      : "Chưa kết nối"}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Hàng đợi Anti-Ban Zalo & Chiến dịch */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5 text-purple-400" />
                Hàng Đợi Anti-Ban Zalo & Broadcast
              </span>
              <Link
                href="/broadcast"
                className="text-[11px] font-semibold text-purple-400 hover:text-purple-300"
              >
                Quản lý
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-lg bg-slate-900 border border-slate-800 p-2">
                <span className="text-slate-400 block">Giãn cách an toàn</span>
                <span className="font-bold text-slate-200">
                  {systemStatus.antiBan.minDelaySec}s – {systemStatus.antiBan.maxDelaySec}s / tin
                </span>
              </div>
              <div className="rounded-lg bg-slate-900 border border-slate-800 p-2">
                <span className="text-slate-400 block">Định mức tối đa</span>
                <span className="font-bold text-slate-200">
                  {systemStatus.antiBan.dailyMsgLimit} tin/nick/ngày
                </span>
              </div>
            </div>
            <div className="text-[11px] text-slate-400 flex items-center justify-between pt-0.5">
              <span>Chiến dịch đang chạy:</span>
              <span className="font-semibold text-slate-200">
                {systemStatus.broadcast.runningCount} / {systemStatus.broadcast.totalCampaigns} chiến dịch
              </span>
            </div>
            {systemStatus.broadcast.activeCampaigns?.map((camp) => (
              <div
                key={camp.id}
                className="rounded-lg bg-slate-900/90 border border-slate-800 px-2.5 py-2 text-[11px] space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200 truncate">{camp.name}</span>
                  <span className="text-purple-400 font-bold">{camp.progressPercent}%</span>
                </div>
                <div className="h-1 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full"
                    style={{ width: `${camp.progressPercent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Đồng bộ đơn hàng KiotViet */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                <span>Đồng Bộ Đơn Hàng KiotViet</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                Lần gần nhất: {formatDateTimeVi(systemStatus.kiotvietSync.lastSyncTime)}
              </p>
            </div>
            <span
              className={`text-[11px] px-2.5 py-1 rounded-full font-semibold shrink-0 border ${
                systemStatus.kiotvietSync.isSyncing
                  ? "bg-blue-500/15 text-blue-300 border-blue-500/30"
                  : systemStatus.kiotvietSync.connected
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : "bg-slate-800 text-slate-400 border-slate-700"
              }`}
            >
              {systemStatus.kiotvietSync.isSyncing
                ? "Đang đồng bộ"
                : systemStatus.kiotvietSync.connected
                ? "Sẵn sàng"
                : "Chưa cấu hình"}
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
