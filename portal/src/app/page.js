"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { resolveComboFormulaList } from "../lib/comboResolver";
import { buildCareSchedule } from "../lib/careAutomation";
import {
  Layers,
  Database,
  CalendarClock,
  ShieldAlert,
  Globe,
  MessageCircle,
  ShoppingBag,
  ShoppingCart,
  Store,
  Boxes,
  ArrowRight,
  Radio,
  CheckCircle2,
  Sparkles,
  Zap,
} from "lucide-react";

const CHANNELS = [
  {
    name: "Website Magento 2.4.8",
    desc: "ADDP.vn, CustomForm & Minigame",
    badge: "Webhook & REST API",
    icon: Globe,
    color: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  },
  {
    name: "Fanpage Facebook",
    desc: "Đa Fanpage Messenger & Bình luận",
    badge: "Graph API v19.0",
    icon: MessageCircle,
    color: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  },
  {
    name: "Zalo Cá Nhân (Multi-QR)",
    desc: "Đăng nhập nhiều tài khoản Zalo qua QR",
    badge: "Javis Multi-Account",
    icon: MessageCircle,
    color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  },
  {
    name: "Zalo Official Account",
    desc: "Zalo OA Open API v3 & Tin nhắn ZNS",
    badge: "Zalo OA v3",
    icon: Radio,
    color: "text-sky-400 bg-sky-500/10 border-sky-500/20",
  },
  {
    name: "TikTok Shop & Ads",
    desc: "Đa gian hàng TikTok & GMV Max",
    badge: "TikTok Partner API",
    icon: ShoppingBag,
    color: "text-pink-400 bg-pink-500/10 border-pink-500/20",
  },
  {
    name: "Shopee Open API v2",
    desc: "Đa gian hàng Shopee & Vận đơn SPX",
    badge: "Shopee Open v2",
    icon: ShoppingCart,
    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  },
  {
    name: "KiotViet POS & Kho",
    desc: "Đồng bộ Hóa đơn, Tồn kho & Lịch CSKH",
    badge: "KiotViet Webhook",
    icon: Store,
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  },
];

const SCHEMA_TABLES = [
  { group: "Phân Quyền & Đa Kênh (WBS-03)", tables: ["staff", "channel_accounts", "staff_channel_permissions"] },
  { group: "Khách Hàng 360 & Lịch CSKH (WBS-03)", tables: ["customers", "tags", "customer_tags", "care_plans", "interactions", "tasks"] },
  { group: "Đơn Hàng, Kho, Combo & Đối Soát (WBS-04)", tables: ["products", "sku_mappings", "orders", "order_items", "inventory_logs", "stock_takes"] },
  { group: "Hộp Thư Hợp Nhất & Chiến Dịch (WBS-04)", tables: ["conversations", "messages", "broadcast_campaigns"] },
];

export default function HomePage() {
  const router = useRouter();
  const [formulaInput, setFormulaInput] = useState("XANH03+2GOI_GLUCARE");
  const [orderQty, setOrderQty] = useState(1);

  // Tự động đón mã code OAuth khi TikTok Shop redirect về root URL (https://crm.addp.vn/?code=xxxx)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = (params.get("code") || params.get("auth_code") || "").trim();
    if (code) {
      router.replace(`/channels${window.location.search}`);
    }
  }, [router]);

  const resolvedItems = resolveComboFormulaList(formulaInput, Number(orderQty) || 1);
  const sampleCareTasks = buildCareSchedule({
    customerName: "Chú Hùng (0912345678)",
    productName: "Combo 3 Hộp Viên An Đường + 2 Gói Sữa Glucare",
    durationDays: 30,
  });

  return (
    <div suppressHydrationWarning className="space-y-6">
      {/* Tiêu đề trang & Thanh trạng thái Bento */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <span>Trung Tâm Điều Hành ADDP CRM</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 font-semibold">
              Phiên bản 2026
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Hợp nhất thời gian thực 7 kênh thương mại & chăm sóc khách hàng tại <code>crm.addp.vn</code>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-400">
            <Radio className="w-3.5 h-3.5 animate-pulse text-emerald-400" />
            <span>Đang trực tuyến 100%</span>
          </div>
          <Link
            href="/inbox"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white shadow-xs transition-colors"
          >
            <span>Vào Hộp Thư</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Top Bento KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="group rounded-2xl border border-slate-800 bg-slate-900/70 p-5 hover:border-slate-700 transition-all duration-200">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Tổng Kênh Tích Hợp</span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 group-hover:scale-110 transition-transform">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-white mt-2 tracking-tight">7 Nền Tảng</div>
          <div className="text-xs text-emerald-400 mt-2 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>Đa tài khoản đăng nhập đồng thời</span>
          </div>
        </div>

        <div className="group rounded-2xl border border-slate-800 bg-slate-900/70 p-5 hover:border-slate-700 transition-all duration-200">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">CSDL Trung Tâm (MySQL 8.0)</span>
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 group-hover:scale-110 transition-transform">
              <Database className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-white mt-2 tracking-tight">18 Bảng Chuẩn Hóa</div>
          <div className="text-xs text-blue-400 mt-2 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>Định danh SĐT 10 số (Điều 3)</span>
          </div>
        </div>

        <div className="group rounded-2xl border border-slate-800 bg-slate-900/70 p-5 hover:border-slate-700 transition-all duration-200">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Lộ Trình CSKH Tự Động</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 group-hover:scale-110 transition-transform">
              <CalendarClock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-white mt-2 tracking-tight">7 Mốc Vàng</div>
          <div className="text-xs text-amber-400 mt-2 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span>Ngày 1, 3, 7, 14, 21, Dùng 1/2 & 2/3</span>
          </div>
        </div>

        <div className="group rounded-2xl border border-slate-800 bg-slate-900/70 p-5 hover:border-slate-700 transition-all duration-200">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Chế Độ AI & Anti-Ban</span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 group-hover:scale-110 transition-transform">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-white mt-2 tracking-tight">45s – 120s</div>
          <div className="text-xs text-purple-400 mt-2 flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 shrink-0" />
            <span>Tối đa 70 tin/nick/ngày (Điều 4)</span>
          </div>
        </div>
      </div>

      {/* 7 Connected Platforms Bento Section */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Boxes className="w-4 h-4 text-blue-400" />
              <span>7 Nền Tảng Kết Nối Đa Tài Khoản (Omnichannel Hub)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Tự động gom đơn hàng, tin nhắn và thông tin bệnh lý về 1 hồ sơ khách hàng 360 duy nhất
            </p>
          </div>
          <Link
            href="/channels"
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors"
          >
            <span>Quản lý kết nối</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {CHANNELS.map((ch) => {
            const Icon = ch.icon;
            return (
              <div
                key={ch.name}
                className="group rounded-xl border border-slate-800 bg-slate-950/70 p-4 flex flex-col justify-between gap-3 hover:border-slate-700 transition-all duration-150"
              >
                <div>
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-slate-800 text-slate-300 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="font-semibold text-sm text-slate-100">{ch.name}</div>
                  </div>
                  <div className="text-xs text-slate-400 mt-2 leading-relaxed">{ch.desc}</div>
                </div>
                <div>
                  <span className={`inline-block rounded-lg border px-2.5 py-0.5 text-[11px] font-medium ${ch.color}`}>
                    {ch.badge}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Interactive Combo Resolver + Care Schedule Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Combo Formula Tester */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 space-y-4 shadow-sm">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Boxes className="w-4 h-4 text-emerald-400" />
              <span>Bộ Giải Mã Công Thức Combo Đệ Quy (Kế thừa từ quan-ly-kho)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Tự động bóc tách mã Combo phức tạp từ Shopee / TikTok Shop / KiotViet ra sản phẩm gốc để trừ tồn kho chính xác
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Mã SKU hoặc Công thức Combo
              </label>
              <input
                type="text"
                value={formulaInput}
                onChange={(e) => setFormulaInput(e.target.value)}
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                placeholder="VD: XANH03+2GOI_GLUCARE"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Số lượng đơn</label>
              <input
                type="number"
                min={1}
                max={100}
                value={orderQty}
                onChange={(e) => setOrderQty(e.target.value)}
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 text-xs">
            <span className="text-slate-400 py-1 font-medium">Thử nhanh:</span>
            {["XANH03+2GOI_GLUCARE", "COMBO_2LON_GLUCARE", "2VAD+1MAT_GAN+1CAM", "HOP_GLUCARE+CHANH_LEO"].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setFormulaInput(preset)}
                className="rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 transition-colors cursor-pointer"
              >
                {preset}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 space-y-2">
            <div className="text-xs font-semibold text-slate-400">
              Kết quả bóc tách xuất kho ({resolvedItems.length} mã sản phẩm gốc):
            </div>
            {resolvedItems.map((item) => (
              <div
                key={item.sku}
                className="flex items-center justify-between rounded-lg bg-slate-900 px-3 py-2 text-xs"
              >
                <div>
                  <span className="font-mono font-semibold text-blue-400">{item.sku}</span>
                  <span className="text-slate-300 ml-2">{item.name}</span>
                </div>
                <span className="font-bold text-emerald-400">
                  x {item.quantity} {item.unit}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Automated Care Schedule Preview */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 space-y-4 shadow-sm">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-amber-400" />
              <span>Lộ Trình Chăm Sóc Tự Động Sau Mua (Kế thừa từ QuanlyKH)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Tự động sinh Task nhắc Sale/CSKH và đẩy kịch bản cá nhân hóa qua Zalo / OA ở các mốc Ngày 1, 3, 7, 14, 21, Dùng 1/2 & 2/3
            </p>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {sampleCareTasks.map((task) => (
              <div
                key={task.type}
                className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-blue-400">{task.title}</span>
                  <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-300">
                    +{task.offsetDays} ngày ({task.dueDate})
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{task.suggestedMessage}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Unified MySQL Schema Overview */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-sm">
        <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
          <Database className="w-4 h-4 text-cyan-400" />
          <span>Kiến Trúc Cơ Sở Dữ Liệu Trung Tâm `addp_crm` (WBS-03 & WBS-04)</span>
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Đã khởi tạo tại <code className="text-blue-400">database/schema.prisma</code> và{" "}
          <code className="text-blue-400">database/migrations/001_init_addp_crm.sql</code>
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {SCHEMA_TABLES.map((group) => (
            <div key={group.group} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="text-xs font-semibold text-slate-300 mb-2.5">{group.group}</div>
              <div className="flex flex-wrap gap-1.5">
                {group.tables.map((tb) => (
                  <span
                    key={tb}
                    className="rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1 font-mono text-xs text-emerald-400"
                  >
                    {tb}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
