"use client";

import { useState } from "react";
import { resolveComboFormulaList } from "../lib/comboResolver";
import { buildCareSchedule } from "../lib/careAutomation";

const CHANNELS = [
  { name: "Website Magento 2.4.8", desc: "ADDP.vn, CustomForm & Minigame", badge: "Webhook & REST API", color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
  { name: "Fanpage Facebook", desc: "Đa Fanpage Messenger & Bình luận", badge: "Graph API v19.0", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  { name: "Zalo Cá Nhân (Multi-QR)", desc: "Đăng nhập nhiều tài khoản Zalo qua QR", badge: "Javis Multi-Account", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20" },
  { name: "Zalo Official Account", desc: "Zalo OA Open API v3 & Tin nhắn ZNS", badge: "Zalo OA v3", color: "text-sky-400 bg-sky-500/10 border-sky-500/20" },
  { name: "TikTok Shop & Ads", desc: "Đa gian hàng TikTok & GMV Max", badge: "TikTok Partner API", color: "text-pink-400 bg-pink-500/10 border-pink-500/20" },
  { name: "Shopee Open API v2", desc: "Đa gian hàng Shopee & Vận đơn SPX", badge: "Shopee Open v2", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  { name: "KiotViet POS & Kho", desc: "Đồng bộ Hóa đơn, Tồn kho & Lịch CSKH", badge: "KiotViet Webhook", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
];

const SCHEMA_TABLES = [
  { group: "Phân Quyền & Đa Kênh (WBS-03)", tables: ["staff", "channel_accounts", "staff_channel_permissions"] },
  { group: "Khách Hàng 360 & Lịch CSKH (WBS-03)", tables: ["customers", "tags", "customer_tags", "care_plans", "interactions", "tasks"] },
  { group: "Đơn Hàng, Kho, Combo & Đối Soát (WBS-04)", tables: ["products", "sku_mappings", "orders", "order_items", "inventory_logs", "stock_takes"] },
  { group: "Hộp Thư Hợp Nhất & Chiến Dịch (WBS-04)", tables: ["conversations", "messages", "broadcast_campaigns"] },
];

export default function HomePage() {
  const [formulaInput, setFormulaInput] = useState("XANH03+2GOI_GLUCARE");
  const [orderQty, setOrderQty] = useState(1);

  const resolvedItems = resolveComboFormulaList(formulaInput, Number(orderQty) || 1);
  const sampleCareTasks = buildCareSchedule({
    customerName: "Chú Hùng (0912345678)",
    productName: "Combo 3 Hộp Viên An Đường + 2 Gói Sữa Glucare",
    durationDays: 30,
  });

  return (
    <div className="space-y-6">
      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="text-xs font-medium text-slate-400">Tổng Kênh Tích Hợp</div>
          <div className="text-2xl font-bold text-white mt-1">7 Nền Tảng</div>
          <div className="text-xs text-emerald-400 mt-2">Đa tài khoản đăng nhập đồng thời</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="text-xs font-medium text-slate-400">CSDL Trung Tâm (MySQL 8.0)</div>
          <div className="text-2xl font-bold text-white mt-1">18 Bảng Chuẩn Hóa</div>
          <div className="text-xs text-blue-400 mt-2">Khóa định danh SĐT 10 số (normalizePhone)</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="text-xs font-medium text-slate-400">Lộ Trình CSKH Tự Động</div>
          <div className="text-2xl font-bold text-white mt-1">7 Mốc Vàng</div>
          <div className="text-xs text-amber-400 mt-2">Ngày 1, 3, 7, 14, 21, Dùng 1/2 & 2/3</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="text-xs font-medium text-slate-400">Chế Độ AI & Anti-Ban</div>
          <div className="text-2xl font-bold text-white mt-1">45s – 120s</div>
          <div className="text-xs text-purple-400 mt-2">SmartBroadcastQueue tối đa 70 tin/nick/ngày</div>
        </div>
      </div>

      {/* 7 Connected Platforms */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-base font-bold text-white">7 Nền Tảng Kết Nối Đa Tài Khoản (Omnichannel Hub)</h2>
            <p className="text-xs text-slate-400">
              Tự động gom đơn hàng, tin nhắn và thông tin bệnh lý về 1 hồ sơ khách hàng 360 duy nhất
            </p>
          </div>
          <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-400">
            ● WBS-03, WBS-04 & WBS-05 Đã Hoàn Tất
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {CHANNELS.map((ch) => (
            <div
              key={ch.name}
              className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 flex flex-col justify-between gap-3 hover:border-slate-700 transition"
            >
              <div>
                <div className="font-semibold text-sm text-slate-100">{ch.name}</div>
                <div className="text-xs text-slate-400 mt-1">{ch.desc}</div>
              </div>
              <div>
                <span className={`inline-block rounded-lg border px-2.5 py-0.5 text-[11px] font-medium ${ch.color}`}>
                  {ch.badge}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Interactive Combo Resolver + Care Schedule Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Combo Formula Tester */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 space-y-4">
          <div>
            <h3 className="text-base font-bold text-white">
              Bộ Giải Mã Công Thức Combo Đệ Quy (Kế thừa từ quan-ly-kho)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Tự động bóc tách mã Combo phức tạp từ Shopee / TikTok Shop / KiotViet ra sản phẩm gốc để trừ tồn kho chính xác
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-400 mb-1">Mã SKU hoặc Công thức Combo</label>
              <input
                type="text"
                value={formulaInput}
                onChange={(e) => setFormulaInput(e.target.value)}
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                placeholder="VD: XANH03+2GOI_GLUCARE"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Số lượng đơn</label>
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
            <span className="text-slate-500 py-1">Thử nhanh:</span>
            {["XANH03+2GOI_GLUCARE", "COMBO_2LON_GLUCARE", "2VAD+1MAT_GAN+1CAM", "HOP_GLUCARE+CHANH_LEO"].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setFormulaInput(preset)}
                className="rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 transition"
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
        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 space-y-4">
          <div>
            <h3 className="text-base font-bold text-white">
              Lộ Trình Chăm Sóc Tự Động Sau Mua (Kế thừa từ QuanlyKH)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Tự động sinh Task nhắc Sale/CSKH và đẩy kịch bản cá nhân hóa qua Zalo / OA ở các mốc Ngày 1, 3, 7, 14, 21, Dùng 1/2 & 2/3
            </p>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {sampleCareTasks.map((task) => (
              <div
                key={task.type}
                className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-blue-400">{task.title}</span>
                  <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
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
      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
        <h3 className="text-base font-bold text-white mb-1">
          Kiến Trúc Cơ Sở Dữ Liệu Trung Tâm `addp_crm` (WBS-03 & WBS-04)
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
