"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import ZaloQrModal from "./ZaloQrModal";
import FacebookConnectModal from "./FacebookConnectModal";
import {
  Globe,
  MessageCircle,
  Radio,
  ShoppingBag,
  ShoppingCart,
  Store,
  Zap,
  Settings,
  CheckCircle2,
  RefreshCw,
  Trash2,
  Plus,
  QrCode,
  Copy,
  Check,
  Plug,
  X,
  MessageSquare,
} from "lucide-react";

const PLATFORM_TABS = [
  { id: "ALL", label: "Tất Cả Kênh", Icon: Globe },
  { id: "ZALO_PERSONAL", label: "Zalo Cá Nhân (QR)", Icon: MessageCircle, badge: "Multi-QR" },
  { id: "FACEBOOK", label: "Fanpage Facebook", Icon: MessageSquare, badge: "Graph API" },
  { id: "ZALO_OA", label: "Zalo OA", Icon: Radio, badge: "ZNS" },
  { id: "TIKTOK_SHOP", label: "TikTok Shop", Icon: ShoppingBag, badge: "GMV Max" },
  { id: "SHOPEE", label: "Shopee", Icon: ShoppingCart, badge: "Open API v2" },
  { id: "KIOTVIET", label: "KiotViet", Icon: Store, badge: "POS" },
  { id: "MAGENTO", label: "Website ADDP", Icon: Zap, badge: "Magento 2.4.8" },
];

export default function ChannelsPage() {
  const [activeTab, setActiveTab] = useState("ALL");
  const [channels, setChannels] = useState([]);
  const [platforms, setPlatforms] = useState({});
  const [loading, setLoading] = useState(true);
  const [isZaloQrOpen, setIsZaloQrOpen] = useState(false);
  const [isFbModalOpen, setIsFbModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [banner, setBanner] = useState(null);
  const [copiedText, setCopiedText] = useState(null);

  // Form thêm tài khoản mới
  const [newForm, setNewForm] = useState({
    platform: "TIKTOK_SHOP",
    name: "",
    externalId: "",
    config: {},
  });

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const loadChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/channels");
      const data = await res.json();
      if (data.ok) {
        setChannels(data.channels || []);
        setPlatforms(data.platforms || {});
      }
    } catch {
      setBanner({ type: "error", text: "Lỗi kết nối khi tải danh sách kênh." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  const handleTestHealth = async (id) => {
    setTestingId(id);
    try {
      const res = await fetch(`/api/channels/${id}/test`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setBanner({ type: "success", text: `[${data.platform}] ${data.message}` });
        loadChannels();
      } else {
        setBanner({ type: "error", text: data.error || "Kiểm tra kết nối thất bại." });
      }
    } catch {
      setBanner({ type: "error", text: "Lỗi máy chủ khi kiểm tra kết nối." });
    } finally {
      setTestingId(null);
    }
  };

  const handleDeleteChannel = async (id, name) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa kênh '${name}'?`)) return;
    try {
      const res = await fetch(`/api/channels?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok) {
        setBanner({ type: "success", text: data.message });
        loadChannels();
      } else {
        setBanner({ type: "error", text: data.error });
      }
    } catch {
      setBanner({ type: "error", text: "Lỗi kết nối khi xóa kênh." });
    }
  };

  const handleCreateChannel = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newForm),
      });
      const data = await res.json();
      if (res.ok) {
        setBanner({ type: "success", text: data.message });
        setIsAddModalOpen(false);
        setNewForm({ platform: "TIKTOK_SHOP", name: "", externalId: "", config: {} });
        loadChannels();
      } else {
        setBanner({ type: "error", text: data.error || "Không thể thêm kênh." });
      }
    } catch {
      setBanner({ type: "error", text: "Lỗi máy chủ khi thêm kênh mới." });
    }
  };

  const filteredChannels =
    activeTab === "ALL"
      ? channels
      : channels.filter((c) => c.platform === activeTab);

  const getWebhookInfo = (platform) => {
    switch (platform) {
      case "FACEBOOK":
        return {
          url: "https://crm.addp.vn/api/webhooks/facebook",
          verifyToken: "addp_crm_fb_webhook_secret_2026",
          note: "Nhận tin nhắn & Tự ẩn SĐT",
        };
      case "TIKTOK_SHOP":
        return {
          url: "https://crm.addp.vn/api/webhooks/tiktok",
          note: "Đồng bộ đơn hàng & tách Combo",
        };
      case "SHOPEE":
        return {
          url: "https://crm.addp.vn/api/webhooks/shopee",
          note: "Đồng bộ đơn hàng Open API v2",
        };
      case "KIOTVIET":
        return {
          url: "https://crm.addp.vn/api/webhooks/kiotviet",
          note: "Webhook tạo hóa đơn POS",
        };
      case "MAGENTO":
        return {
          url: "https://crm.addp.vn/api/webhooks/magento",
          note: "Webhook Lead Form & Giỏ hàng",
        };
      case "ZALO_OA":
        return {
          url: "https://crm.addp.vn/api/webhooks/zalo-oa",
          note: "Webhook tương tác người dùng ZNS",
        };
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="rounded-lg bg-cyan-500/15 border border-cyan-500/30 px-2.5 py-0.5 text-xs font-bold text-cyan-400 whitespace-nowrap">
              Giai Đoạn 2: WBS-11 → WBS-20
            </span>
            <h1 className="text-lg font-bold text-white">
              Trung Tâm Kết Nối Đa Kênh &amp; Quản Lý Đa Tài Khoản (ConnectionHub)
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Hợp nhất 7 nền tảng: Website Magento 2.4.8, Fanpage Facebook, Zalo Cá Nhân (Multi-QR), Zalo OA, TikTok Shop, Shopee và KiotViet
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsFbModalOpen(true)}
            className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2.5 shadow-sm transition-all duration-150 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <MessageSquare className="w-3.5 h-3.5 shrink-0" />
            <span>Kết Nối Fanpage 1-Click</span>
          </button>
          <button
            type="button"
            onClick={() => setIsZaloQrOpen(true)}
            className="rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold px-4 py-2.5 shadow-sm transition-all duration-150 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <QrCode className="w-3.5 h-3.5 shrink-0" />
            <span>Quét Mã QR Zalo Cá Nhân</span>
          </button>
          <button
            type="button"
            data-open-add-channel="true"
            onClick={() => setIsAddModalOpen(true)}
            className="rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-bold px-4 py-2.5 shadow-xs transition-all duration-150 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span>Thêm Gian Hàng / Kênh</span>
          </button>
          <Link
            href="/settings"
            className="rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold px-3.5 py-2.5 transition-all duration-150 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Settings className="w-3.5 h-3.5 shrink-0 text-blue-400" />
            <span>Phân Quyền Kênh</span>
          </Link>
        </div>
      </div>

      {banner && (
        <div
          role="alert"
          className={`rounded-xl border px-4 py-3 text-xs font-medium flex items-center justify-between gap-3 ${
            banner.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/10 border-rose-500/30 text-rose-300"
          }`}
        >
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{banner.text}</span>
          </span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            aria-label="Đóng thông báo"
            className="p-1 rounded-lg hover:bg-slate-800/50 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xs">
          <div className="text-xs font-medium text-slate-400">Tổng Số Kênh Hoạt Động</div>
          <div className="text-2xl font-bold text-white mt-1 tabular-nums">{channels.length} Kênh</div>
          <div className="text-xs text-blue-400 mt-2">Bao gồm 7 nền tảng bán hàng &amp; CSKH</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xs">
          <div className="text-xs font-medium text-slate-400">Zalo Cá Nhân (Multi-Account)</div>
          <div className="text-2xl font-bold text-cyan-400 mt-1 tabular-nums">
            {channels.filter((c) => c.platform === "ZALO_PERSONAL").length} Nick QR
          </div>
          <div className="text-xs text-slate-400 mt-2">Bảo vệ nick (Anti-Ban 45–120s)</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xs">
          <div className="text-xs font-medium text-slate-400">Fanpage Facebook &amp; Zalo OA</div>
          <div className="text-2xl font-bold text-blue-400 mt-1 tabular-nums">
            {channels.filter((c) => c.platform === "FACEBOOK" || c.platform === "ZALO_OA").length} Trang
          </div>
          <div className="text-xs text-slate-400 mt-2">Tự động ẩn bình luận chứa SĐT</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xs">
          <div className="text-xs font-medium text-slate-400">Gian Hàng Sàn &amp; KiotViet</div>
          <div className="text-2xl font-bold text-amber-400 mt-1 tabular-nums">
            {channels.filter((c) => ["TIKTOK_SHOP", "SHOPEE", "KIOTVIET", "MAGENTO"].includes(c.platform)).length} Điểm Bán
          </div>
          <div className="text-xs text-slate-400 mt-2">Tách công thức Combo tự động</div>
        </div>
      </div>

      {/* Tabs Phân Loại Kênh */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        {PLATFORM_TABS.map((t) => {
          const TabIcon = t.Icon;
          const count =
            t.id === "ALL"
              ? channels.length
              : channels.filter((c) => c.platform === t.id).length;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-150 whitespace-nowrap cursor-pointer ${
                isActive
                  ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                  : "bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700"
              }`}
            >
              <TabIcon className="w-3.5 h-3.5 shrink-0" />
              <span>{t.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold tabular-nums ${
                  isActive
                    ? "bg-white/25 text-white badge-solid-white"
                    : "bg-slate-900/70 text-slate-300"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Danh sách Channel Cards */}
      {loading ? (
        <div className="py-20 text-center text-slate-500 text-sm flex flex-col items-center gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
          <span>Đang tải danh sách kết nối kênh...</span>
        </div>
      ) : filteredChannels.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 p-12 text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-slate-800/80 flex items-center justify-center text-slate-400">
            <Plug className="w-6 h-6" />
          </div>
          <div className="text-white font-bold text-sm">Chưa có kênh nào thuộc danh mục này</div>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Bấm nút &ldquo;Thêm Gian Hàng / Kênh&rdquo; ở góc trên để cấu hình tài khoản hoặc tích hợp Webhook.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredChannels.map((ch) => {
            const meta = platforms[ch.platform] || {};
            const isTesting = testingId === ch.id;
            const webhook = getWebhookInfo(ch.platform);
            const isConnected = ch.status === "CONNECTED";

            return (
              <div
                key={ch.id}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 flex flex-col justify-between space-y-4 hover:border-slate-700 transition-all duration-150 shadow-xs"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-block rounded-lg border px-2.5 py-0.5 text-[11px] font-semibold ${
                        meta.color || "text-slate-300 bg-slate-800 border-slate-700"
                      }`}
                    >
                      {meta.label || ch.platform}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap shrink-0 border ${
                        isConnected
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                          : "bg-amber-500/10 text-amber-400 border-amber-500/25"
                      }`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${
                          isConnected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                        }`}
                      />
                      {isConnected ? "CONNECTED" : ch.status}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-white">{ch.name}</h3>
                    <div className="text-xs text-slate-400 font-mono mt-0.5 truncate">
                      ID: {ch.externalId}
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{meta.desc}</p>

                  <div className="rounded-xl bg-slate-950 p-3 space-y-1.5 text-[11px] border border-slate-800/80">
                    <div className="flex justify-between gap-2 text-slate-400">
                      <span>Trạng thái:</span>
                      <span
                        className={`font-semibold text-right ${
                          isConnected ? "text-emerald-400" : "text-slate-200"
                        }`}
                      >
                        {ch.statusLabel}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2 text-slate-400">
                      <span>Nhân sự phụ trách:</span>
                      <span className="text-blue-400 font-semibold font-mono">
                        {ch.assignedStaffCodes?.join(", ") || "ADMIN"}
                      </span>
                    </div>
                    {webhook && (
                      <div className="pt-1.5 border-t border-slate-800 flex items-center justify-between gap-2">
                        <span className="text-slate-400 truncate text-[10px]">
                          Webhook: {webhook.note}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(webhook.url, ch.id)}
                          className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-cyan-300 font-mono font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                        >
                          {copiedText === ch.id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span>Đã chép URL</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Sao chép Webhook</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                  <button
                    type="button"
                    disabled={isTesting}
                    onClick={() => handleTestHealth(ch.id)}
                    className="flex-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-2 px-3 transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    {isTesting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                        <span>Đang kiểm tra...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Kiểm Tra Kết Nối</span>
                      </>
                    )}
                  </button>

                  {ch.platform === "FACEBOOK" && (
                    <>
                      {isConnected && (
                        <Link
                          href="/inbox"
                          className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-2 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                          <span>Vào Hộp Thư</span>
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsFbModalOpen(true)}
                        className="rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-300 text-xs font-semibold px-3 py-2 hover:bg-blue-600/30 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        {isConnected ? "Đổi Fanpage" : "Chọn Fanpage"}
                      </button>
                    </>
                  )}

                  {ch.platform === "ZALO_PERSONAL" && (
                    <>
                      {isConnected && (
                        <Link
                          href="/inbox"
                          className="rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold px-3 py-2 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>Vào Hộp Thư</span>
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsZaloQrOpen(true)}
                        className="rounded-xl bg-cyan-600/20 border border-cyan-500/30 text-cyan-300 text-xs font-semibold px-3 py-2 hover:bg-cyan-600/30 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        {isConnected ? "Đổi Nick QR" : "Quét Lại QR"}
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDeleteChannel(ch.id, ch.name)}
                    aria-label={`Xóa kênh ${ch.name}`}
                    title={`Xóa kênh ${ch.name}`}
                    className="rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-semibold p-2 transition-colors inline-flex items-center justify-center cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Thêm Kênh Mới */}
      {isAddModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Thêm Gian Hàng / Kênh Mới (WBS-11 &amp; 18 &amp; 20)</h3>
                <p className="text-xs text-slate-400">
                  Lưu trữ mã hóa Token an toàn bằng AES-256-GCM
                </p>
              </div>
              <button
                type="button"
                data-modal-close="add"
                aria-label="Đóng"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateChannel} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Chọn Nền Tảng</label>
                <select
                  value={newForm.platform}
                  onChange={(e) => setNewForm({ ...newForm, platform: e.target.value })}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-white"
                >
                  {Object.entries(platforms).map(([k, p]) => (
                    <option key={k} value={k}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Tên Nhận Diện Tài Khoản / Gian Hàng *
                </label>
                <input
                  required
                  value={newForm.name}
                  onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                  placeholder="VD: TikTok Shop Dược Phẩm ADDP, Shopee Glucare PLUS..."
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Mã ID Định Danh (Shop ID / Page ID / POS ID) *
                </label>
                <input
                  required
                  value={newForm.externalId}
                  onChange={(e) => setNewForm({ ...newForm, externalId: e.target.value })}
                  placeholder="VD: vn_shop_8899 hoặc shop_shopee_10293"
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-white font-mono"
                />
              </div>

              {/* DYNAMIC FORM FIELDS THEO TỪNG NỀN TẢNG */}
              {newForm.platform === "TIKTOK_SHOP" && (
                <div className="space-y-3 p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="font-bold text-amber-300 flex items-center gap-1.5 text-xs">
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>Cấu hình TikTok Shop Open API (WBS-18)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-400 text-[11px] mb-1">App Key</label>
                      <input
                        placeholder="6b8a..."
                        onChange={(e) =>
                          setNewForm({
                            ...newForm,
                            config: { ...newForm.config, appKey: e.target.value },
                          })
                        }
                        className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-white font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 text-[11px] mb-1">App Secret</label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        onChange={(e) =>
                          setNewForm({
                            ...newForm,
                            config: { ...newForm.config, appSecret: e.target.value },
                          })
                        }
                        className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-white font-mono text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Refresh Token (Làm mới định kỳ)</label>
                    <input
                      placeholder="Nhập Refresh Token gian hàng..."
                      onChange={(e) =>
                        setNewForm({
                          ...newForm,
                          config: { ...newForm.config, refreshToken: e.target.value },
                        })
                      }
                      className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-white font-mono text-xs"
                    />
                  </div>
                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2 text-[11px] text-amber-200">
                    Webhook URL: <code className="text-cyan-300 font-mono">https://crm.addp.vn/api/webhooks/tiktok</code>
                  </div>
                </div>
              )}

              {newForm.platform === "SHOPEE" && (
                <div className="space-y-3 p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="font-bold text-orange-400 flex items-center gap-1.5 text-xs">
                    <ShoppingCart className="w-3.5 h-3.5" />
                    <span>Cấu hình Shopee Open API v2 (WBS-18)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-400 text-[11px] mb-1">Partner ID</label>
                      <input
                        placeholder="2004812"
                        onChange={(e) =>
                          setNewForm({
                            ...newForm,
                            config: { ...newForm.config, partnerId: e.target.value },
                          })
                        }
                        className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-white font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 text-[11px] mb-1">Partner Key</label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        onChange={(e) =>
                          setNewForm({
                            ...newForm,
                            config: { ...newForm.config, partnerKey: e.target.value },
                          })
                        }
                        className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-white font-mono text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Refresh Token Shopee</label>
                    <input
                      placeholder="Nhập Refresh Token..."
                      onChange={(e) =>
                        setNewForm({
                          ...newForm,
                          config: { ...newForm.config, refreshToken: e.target.value },
                        })
                      }
                      className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-white font-mono text-xs"
                    />
                  </div>
                  <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 p-2 text-[11px] text-orange-200">
                    Webhook URL: <code className="text-cyan-300 font-mono">https://crm.addp.vn/api/webhooks/shopee</code>
                  </div>
                </div>
              )}

              {newForm.platform === "KIOTVIET" && (
                <div className="space-y-3 p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="font-bold text-blue-400 flex items-center gap-1.5 text-xs">
                    <Store className="w-3.5 h-3.5" />
                    <span>Cấu hình KiotViet POS &amp; Kho Hàng (WBS-20)</span>
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Tên Gian Hàng KiotViet (Retailer)</label>
                    <input
                      placeholder="addpvn"
                      onChange={(e) =>
                        setNewForm({
                          ...newForm,
                          config: { ...newForm.config, retailer: e.target.value },
                        })
                      }
                      className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-white text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-400 text-[11px] mb-1">Client ID</label>
                      <input
                        placeholder="4829..."
                        onChange={(e) =>
                          setNewForm({
                            ...newForm,
                            config: { ...newForm.config, clientId: e.target.value },
                          })
                        }
                        className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-white font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 text-[11px] mb-1">Secret Key</label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        onChange={(e) =>
                          setNewForm({
                            ...newForm,
                            config: { ...newForm.config, clientSecret: e.target.value },
                          })
                        }
                        className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-white font-mono text-xs"
                      />
                    </div>
                  </div>
                  <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-2 text-[11px] text-blue-200">
                    Webhook URL: <code className="text-cyan-300 font-mono">https://crm.addp.vn/api/webhooks/kiotviet</code>
                  </div>
                </div>
              )}

              {newForm.platform === "MAGENTO" && (
                <div className="space-y-3 p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="font-bold text-orange-400 flex items-center gap-1.5 text-xs">
                    <Zap className="w-3.5 h-3.5" />
                    <span>Cấu hình Website Magento 2.4.8 (WBS-20)</span>
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Domain Website Magento</label>
                    <input
                      defaultValue="https://addp.vn"
                      onChange={(e) =>
                        setNewForm({
                          ...newForm,
                          config: { ...newForm.config, domain: e.target.value },
                        })
                      }
                      className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-white font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">REST API Bearer Token</label>
                    <input
                      type="password"
                      placeholder="Nhập Token Magento..."
                      onChange={(e) =>
                        setNewForm({
                          ...newForm,
                          config: { ...newForm.config, apiToken: e.target.value },
                        })
                      }
                      className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-white font-mono text-xs"
                    />
                  </div>
                  <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 p-2 text-[11px] text-orange-200">
                    Webhook URL: <code className="text-cyan-300 font-mono">https://crm.addp.vn/api/webhooks/magento</code>
                  </div>
                </div>
              )}

              {newForm.platform === "FACEBOOK" && (
                <div className="space-y-3 p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="font-bold text-blue-400 flex items-center gap-1.5 text-xs">
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Kết Nối Fanpage Facebook (WBS-16 &amp; 17)</span>
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Page Access Token</label>
                    <input
                      type="password"
                      placeholder="Dán mã EAAPZB..."
                      onChange={(e) =>
                        setNewForm({
                          ...newForm,
                          config: { ...newForm.config, pageAccessToken: e.target.value },
                        })
                      }
                      className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-white font-mono text-xs"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Hoặc sử dụng nút <strong className="text-blue-400">&ldquo;Kết Nối Fanpage 1-Click&rdquo;</strong> ở ngoài để chọn trực quan.
                  </p>
                </div>
              )}

              {newForm.platform === "ZALO_OA" && (
                <div className="space-y-3 p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="font-bold text-sky-400 flex items-center gap-1.5 text-xs">
                    <Radio className="w-3.5 h-3.5" />
                    <span>Cấu hình Zalo Official Account Open API v3 (WBS-15 &amp; 17)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-400 text-[11px] mb-1">OA ID</label>
                      <input
                        placeholder="1829..."
                        onChange={(e) =>
                          setNewForm({
                            ...newForm,
                            config: { ...newForm.config, oaId: e.target.value },
                          })
                        }
                        className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-white font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 text-[11px] mb-1">App ID</label>
                      <input
                        placeholder="2938..."
                        onChange={(e) =>
                          setNewForm({
                            ...newForm,
                            config: { ...newForm.config, appId: e.target.value },
                          })
                        }
                        className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-white font-mono text-xs"
                      />
                    </div>
                  </div>
                  <div className="rounded-lg bg-sky-500/10 border border-sky-500/20 p-2 text-[11px] text-sky-200">
                    Webhook URL: <code className="text-cyan-300 font-mono">https://crm.addp.vn/api/webhooks/zalo-oa</code>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 font-semibold cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 font-semibold cursor-pointer"
                >
                  Lưu Kênh Kết Nối
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Quét Mã QR Zalo Cá Nhân (WBS-14) */}
      <ZaloQrModal
        isOpen={isZaloQrOpen}
        onClose={() => setIsZaloQrOpen(false)}
        onLoggedIn={(accountInfo) => {
          setBanner({
            type: "success",
            text: `Đăng nhập Zalo cá nhân thành công (${accountInfo.label || "Nick mới"})!`,
          });
          loadChannels();
        }}
      />

      {/* Modal Kết Nối Fanpage 1-Click (WBS-16 & 17) */}
      <FacebookConnectModal
        isOpen={isFbModalOpen}
        onClose={() => setIsFbModalOpen(false)}
        onConnected={(newPages) => {
          setBanner({
            type: "success",
            text: `Đã kết nối thành công ${newPages.length || 3} Fanpage vào CRM!`,
          });
          loadChannels();
        }}
      />
    </div>
  );
}
