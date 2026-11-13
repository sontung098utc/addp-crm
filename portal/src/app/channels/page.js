"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import ZaloQrModal from "./ZaloQrModal";
import FacebookConnectModal from "./FacebookConnectModal";
import TikTokConnectModal from "./TikTokConnectModal";
import ShopeeConnectModal from "./ShopeeConnectModal";
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
  BookOpen,
  ExternalLink,
} from "lucide-react";

const TIKTOK_AUTH_URL =
  "https://services.tiktokshop.com/open/authorize?service_id=7706525357121636097";
const processedTikTokOAuthCodes = new Set();

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

const STAFF_LIST = [
  { id: "ADMIN", name: "Quản Trị Viên ADDP" },
  { id: "CS01", name: "Dược Sĩ Thảo (ADDP)" },
  { id: "S001", name: "Nhân Viên CSKH 1" },
  { id: "S002", name: "Nhân Viên CSKH 2" },
];

export default function ChannelsPage() {
  const [activeTab, setActiveTab] = useState("ALL");
  const [channels, setChannels] = useState([]);
  const [platforms, setPlatforms] = useState({});
  const [loading, setLoading] = useState(true);
  const [isZaloQrOpen, setIsZaloQrOpen] = useState(false);
  const [isFbModalOpen, setIsFbModalOpen] = useState(false);
  const [isTikTokModalOpen, setIsTikTokModalOpen] = useState(false);
  const [tikTokInitialTab, setTikTokInitialTab] = useState("oauth");
  const [isShopeeModalOpen, setIsShopeeModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [guidePlatform, setGuidePlatform] = useState(null);
  const [testingId, setTestingId] = useState(null);
  const [refreshingTokenId, setRefreshingTokenId] = useState(null);
  const [syncingChannelId, setSyncingChannelId] = useState(null);
  const [updatingBotModeId, setUpdatingBotModeId] = useState(null);
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const oauthCode = (params.get("code") || params.get("auth_code") || "").trim();
    const success = params.get("success");
    const shop = params.get("shop");
    const error = params.get("error");

    // 1. Tự động bắt ?code=... khi TikTok Shop redirect về /channels?code=xxxx hoặc /?code=xxxx
    if (oauthCode) {
      window.history.replaceState({}, "", window.location.pathname);
      if (processedTikTokOAuthCodes.has(oauthCode)) return;
      processedTikTokOAuthCodes.add(oauthCode);

      setActiveTab("TIKTOK_SHOP");
      setBanner({
        type: "success",
        text: "⏳ Đang kích hoạt kết nối TikTok Shop...",
      });

      (async () => {
        try {
          const res = await fetch("/api/channels/tiktok/callback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: oauthCode }),
          });
          const data = await res.json();
          if (res.ok && data?.ok) {
            setBanner({
              type: "success",
              text: `Kết nối thành công TikTok Shop: ${data.shopName || "Gian hàng mới"}! Sẵn sàng đồng bộ đơn hàng & GMV Max.`,
            });
            await loadChannels();
          } else {
            setBanner({
              type: "error",
              text: `Ủy quyền TikTok Shop thất bại: ${data?.error || "Không thể đổi mã code lấy Token."}`,
            });
            if (data?.needsConfig) {
              setTikTokInitialTab("config");
              setIsTikTokModalOpen(true);
            }
          }
        } catch {
          setBanner({
            type: "error",
            text: "Lỗi kết nối máy chủ khi kích hoạt TikTok Shop.",
          });
        }
      })();
      return;
    }

    if (success === "tiktok_connected") {
      setActiveTab("TIKTOK_SHOP");
      setBanner({
        type: "success",
        text: `Kết nối thành công TikTok Shop: ${shop || "Gian hàng mới"}! Sẵn sàng đồng bộ đơn hàng & GMV Max.`,
      });
      loadChannels();
      window.history.replaceState({}, "", window.location.pathname);
    } else if (error) {
      const errorTextMap = {
        missing_code: "TikTok Shop không trả về mã ủy quyền (code). Vui lòng thử ủy quyền lại.",
        token_exchange_failed: "Không thể đổi mã ủy quyền lấy Token TikTok Shop.",
        internal_error: "Lỗi hệ thống khi xử lý ủy quyền TikTok Shop.",
      };
      setBanner({
        type: "error",
        text: errorTextMap[error] || `Ủy quyền TikTok Shop thất bại: ${error}`,
      });
      if (
        params.get("needs_config") === "1" ||
        error.includes("invalid params") ||
        error.includes("App Key")
      ) {
        setTikTokInitialTab("config");
        setIsTikTokModalOpen(true);
      }
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [loadChannels]);

  const handleOpenTikTokOAuth = (initialTab = "oauth") => {
    setTikTokInitialTab(initialTab);
    setIsTikTokModalOpen(true);
  };

  const handleRefreshTikTokToken = async (ch) => {
    setRefreshingTokenId(ch.id);
    try {
      const res = await fetch("/api/channels/tiktok/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: ch.id }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setBanner({ type: "success", text: data.message || `Đã làm mới Token cho ${ch.name}.` });
        loadChannels();
      } else {
        setBanner({ type: "error", text: data.error || "Không thể làm mới Token TikTok Shop." });
      }
    } catch {
      setBanner({ type: "error", text: "Lỗi kết nối khi làm mới Token TikTok Shop." });
    } finally {
      setRefreshingTokenId(null);
    }
  };

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

  const handleToggleBotMode = async (channel) => {
    const nextMode = channel.botMode === "HUMAN" ? "AI" : "HUMAN";
    setUpdatingBotModeId(channel.id);
    try {
      const res = await fetch("/api/channels", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: channel.id,
          botMode: nextMode,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setBanner({
          type: "success",
          text: `Đã chuyển '${channel.name}' sang chế độ ${
            nextMode === "AI" ? "A.I. Tự động 24/7" : "Nhân viên trực"
          }!`,
        });
        loadChannels();
      } else {
        setBanner({ type: "error", text: data.error || "Không thể đổi chế độ trực." });
      }
    } catch {
      setBanner({ type: "error", text: "Lỗi máy chủ khi đổi chế độ trực." });
    } finally {
      setUpdatingBotModeId(null);
    }
  };

  const handleChangeStaff = async (channel, staff) => {
    try {
      const res = await fetch("/api/channels", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: channel.id,
          assignedStaff: staff,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setBanner({
          type: "success",
          text: `Đã phân công ${staff.name} phụ trách '${channel.name}'!`,
        });
        loadChannels();
      } else {
        setBanner({ type: "error", text: data.error || "Không thể phân công nhân sự." });
      }
    } catch {
      setBanner({ type: "error", text: "Lỗi máy chủ khi phân công nhân sự." });
    }
  };

  const handleSyncChannelHistory = async (channel) => {
    setSyncingChannelId(channel.id);
    try {
      const res = await fetch("/api/channels/zalo/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeDir: channel.config?.homeDir,
          accountId: channel.externalId,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setBanner({
          type: "success",
          text: `Đã đồng bộ lịch sử '${channel.name}' thành công! (${data.state?.totalSynced || 0} tin nhắn)`,
        });
      } else {
        setBanner({ type: "error", text: data.error || data.message || "Không thể đồng bộ." });
      }
    } catch {
      setBanner({ type: "error", text: "Lỗi máy chủ khi đồng bộ lịch sử hội thoại." });
    } finally {
      setSyncingChannelId(null);
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
          verifyToken: "[Được cấu hình trong FB_VERIFY_TOKEN]",
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
            className="rounded-xl bg-[#007aff] hover:bg-[#0066d6] text-white text-xs font-semibold px-4 py-2 shadow-xs transition-all duration-150 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <MessageSquare className="w-3.5 h-3.5 shrink-0" />
            <span>Kết Nối Fanpage 1-Click</span>
          </button>
          <button
            type="button"
            onClick={handleOpenTikTokOAuth}
            className="rounded-xl bg-slate-900 hover:bg-black border border-slate-700/80 text-white text-xs font-semibold px-4 py-2 shadow-xs transition-all duration-150 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <span>🎵</span>
            <span>Kết Nối TikTok Shop 1-Click</span>
          </button>
          <button
            type="button"
            onClick={() => setIsShopeeModalOpen(true)}
            className="rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold px-4 py-2 shadow-xs transition-all duration-150 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
            <span>Kết Nối Shopee 1-Click</span>
          </button>
          <button
            type="button"
            onClick={() => setIsZaloQrOpen(true)}
            className="rounded-xl bg-cyan-600/15 hover:bg-cyan-600/25 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30 text-xs font-semibold px-4 py-2 transition-all duration-150 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <QrCode className="w-3.5 h-3.5 shrink-0" />
            <span>Quét QR Zalo Cá Nhân</span>
          </button>
          <button
            type="button"
            data-open-add-channel="true"
            onClick={() => setIsAddModalOpen(true)}
            className="rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold px-3.5 py-2 shadow-2xs transition-all duration-150 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span>Thêm Gian Hàng / Kênh</span>
          </button>
          <Link
            href="/settings"
            className="rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold px-3.5 py-2 transition-all duration-150 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Settings className="w-3.5 h-3.5 shrink-0 text-[#007aff]" />
            <span>Phân Quyền Kênh</span>
          </Link>
        </div>
      </div>

      {banner && (
        <div
          role="alert"
          className={`rounded-2xl border px-4 py-3 text-xs font-medium flex items-center justify-between gap-3 shadow-2xs ${
            banner.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-300"
              : "bg-rose-500/10 border-rose-500/25 text-rose-700 dark:text-rose-300"
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
            className="p-1 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* KPI Cards — Apple macOS Widget Aesthetic */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/60 p-4.5 shadow-xs hover:shadow-apple transition-all duration-200">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Tổng Số Kênh Hoạt Động</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">{channels.length} Kênh</div>
          <div className="text-[11px] text-[#007aff] font-medium mt-1.5">7 nền tảng bán hàng &amp; CSKH</div>
        </div>
        <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/60 p-4.5 shadow-xs hover:shadow-apple transition-all duration-200">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Zalo Cá Nhân (Multi-QR)</div>
          <div className="text-2xl font-bold text-cyan-600 dark:text-cyan-400 mt-1 tabular-nums">
            {channels.filter((c) => c.platform === "ZALO_PERSONAL").length} Nick QR
          </div>
          <div className="text-[11px] text-slate-400 mt-1.5">Bảo vệ nick (Anti-Ban 45–120s)</div>
        </div>
        <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/60 p-4.5 shadow-xs hover:shadow-apple transition-all duration-200">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Fanpage Facebook &amp; Zalo OA</div>
          <div className="text-2xl font-bold text-[#007aff] mt-1 tabular-nums">
            {channels.filter((c) => c.platform === "FACEBOOK" || c.platform === "ZALO_OA").length} Trang
          </div>
          <div className="text-[11px] text-slate-400 mt-1.5">Tự động ẩn bình luận chứa SĐT</div>
        </div>
        <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/60 p-4.5 shadow-xs hover:shadow-apple transition-all duration-200">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Gian Hàng Sàn &amp; KiotViet</div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1 tabular-nums">
            {channels.filter((c) => ["TIKTOK_SHOP", "SHOPEE", "KIOTVIET", "MAGENTO"].includes(c.platform)).length} Điểm Bán
          </div>
          <div className="text-[11px] text-slate-400 mt-1.5">Tách công thức Combo tự động</div>
        </div>
      </div>

      {/* Tabs Phân Loại Kênh — Apple Segmented Control */}
      <div className="p-1 rounded-2xl bg-slate-200/60 dark:bg-slate-800/60 border border-slate-300/40 dark:border-slate-700/50 flex flex-wrap items-center gap-1">
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
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150 whitespace-nowrap cursor-pointer ${
                isActive
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <TabIcon className="w-3.5 h-3.5 shrink-0" />
              <span>{t.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold tabular-nums ${
                  isActive
                    ? "bg-[#007aff] text-white"
                    : "bg-slate-300/60 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400"
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
                className="rounded-2xl border border-slate-200/70 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 p-5 flex flex-col justify-between space-y-4 hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200 shadow-xs hover:shadow-apple"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-block rounded-lg border px-2.5 py-0.5 text-[10px] font-semibold ${
                        meta.color || "text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      {meta.label || ch.platform}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold whitespace-nowrap shrink-0 border ${
                        isConnected
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                        }`}
                      />
                      {isConnected ? "CONNECTED" : ch.status}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">{ch.name}</h3>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5 truncate">
                      ID: {ch.externalId}
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">{meta.desc}</p>

                  <div className="rounded-xl bg-slate-50 dark:bg-slate-950/60 p-3 space-y-2 text-[11px] border border-slate-200/60 dark:border-slate-800/70">
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

                    {/* Chế độ trực: AI vs HUMAN */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/60">
                      <span className="text-slate-400">Chế độ trực:</span>
                      <button
                        type="button"
                        onClick={() => handleToggleBotMode(ch)}
                        disabled={updatingBotModeId === ch.id}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all cursor-pointer border ${
                          ch.botMode === "HUMAN"
                            ? "bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20"
                            : "bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            ch.botMode === "HUMAN"
                              ? "bg-amber-400"
                              : "bg-emerald-400 animate-pulse"
                          }`}
                        />
                        <span>
                          {ch.botMode === "HUMAN" ? "👤 Nhân Viên Trực" : "🤖 A.I. Tự Động 24/7"}
                        </span>
                      </button>
                    </div>

                    {/* Phân công nhân sự */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/60">
                      <span className="text-slate-400">Nhân sự trực:</span>
                      <select
                        value={ch.assignedStaff?.id || "ADMIN"}
                        onChange={(e) => {
                          const staff =
                            STAFF_LIST.find((s) => s.id === e.target.value) || STAFF_LIST[0];
                          handleChangeStaff(ch, staff);
                        }}
                        className="bg-slate-900 border border-slate-700 text-slate-200 text-[10px] rounded-lg px-2 py-0.5 outline-hidden focus:border-blue-500 cursor-pointer"
                      >
                        {STAFF_LIST.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Thông tin chi tiết gian hàng TikTok Shop OAuth & nút Làm mới Token */}
                    {ch.platform === "TIKTOK_SHOP" && (
                      <div className="pt-1.5 border-t border-slate-800/60 space-y-1.5 text-[10px]">
                        {(ch.sellerName || ch.shopId || ch.openId) && (
                          <div className="flex items-center justify-between gap-2 text-slate-400">
                            <span>Gian hàng:</span>
                            <span className="text-slate-200 font-semibold truncate">
                              {ch.sellerName || ch.name} {ch.region ? `(${ch.region})` : ""}
                            </span>
                          </div>
                        )}
                        {(ch.refreshToken || ch.config?.refreshToken) && (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-400">OAuth Token:</span>
                            <button
                              type="button"
                              disabled={refreshingTokenId === ch.id}
                              onClick={() => handleRefreshTikTokToken(ch)}
                              className="px-2 py-0.5 rounded-md bg-pink-500/15 hover:bg-pink-500/25 text-pink-300 border border-pink-500/30 font-semibold inline-flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors disabled:opacity-50"
                            >
                              <RefreshCw
                                className={`w-3 h-3 ${refreshingTokenId === ch.id ? "animate-spin" : ""}`}
                              />
                              <span>
                                {refreshingTokenId === ch.id ? "Đang làm mới..." : "🔄 Làm mới Token"}
                              </span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Đồng bộ lịch sử tin nhắn cho nick Zalo */}
                    {ch.platform === "ZALO_PERSONAL" && isConnected && (
                      <div className="pt-1.5 border-t border-slate-800/60 flex items-center justify-between gap-2">
                        <span className="text-slate-400 text-[10px]">Lịch sử chat:</span>
                        <button
                          type="button"
                          disabled={syncingChannelId === ch.id}
                          onClick={() => handleSyncChannelHistory(ch)}
                          className="text-[10px] px-2 py-0.5 rounded-md bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/20 font-semibold inline-flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors"
                        >
                          <RefreshCw
                            className={`w-3 h-3 ${syncingChannelId === ch.id ? "animate-spin" : ""}`}
                          />
                          <span>
                            {syncingChannelId === ch.id ? "Đang đồng bộ..." : "Đồng Bộ Tin Nhắn"}
                          </span>
                        </button>
                      </div>
                    )}

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
                    onClick={() => setGuidePlatform(ch.platform)}
                    className="rounded-xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 text-xs font-semibold py-2 px-3 transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                    title="Hướng dẫn lấy API Key và cấu hình Webhook"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span>Hướng Dẫn Cấu Hình</span>
                  </button>

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

                  {ch.platform === "TIKTOK_SHOP" && (
                    <>
                      {isConnected && (
                        <button
                          type="button"
                          disabled={refreshingTokenId === ch.id}
                          onClick={() => handleRefreshTikTokToken(ch)}
                          className="rounded-xl bg-pink-600/20 border border-pink-500/30 text-pink-300 text-xs font-semibold px-3 py-2 hover:bg-pink-600/30 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                        >
                          <RefreshCw
                            className={`w-3.5 h-3.5 shrink-0 ${
                              refreshingTokenId === ch.id ? "animate-spin" : ""
                            }`}
                          />
                          <span>Làm Mới Token</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleOpenTikTokOAuth("oauth")}
                        className="rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 hover:bg-slate-700 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        {isConnected ? "Cấu Hình / Thêm Shop" : "Ủy Quyền Shop"}
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
                <div className="space-y-3 p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="rounded-xl bg-gradient-to-r from-slate-900 to-zinc-900 border border-pink-500/30 p-3 space-y-2.5">
                    <div className="font-bold text-pink-300 flex items-center gap-1.5 text-xs">
                      <span>🎵</span>
                      <span>Ủy Quyền Tự Động TikTok Shop (OAuth 1-Click)</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Bạn chỉ cần bấm nút <strong className="text-white">[Ủy Quyền 1-Click]</strong>,
                      hệ thống sẽ tự động liên kết nhiều gian hàng song song mà không cần nhập Refresh Token thủ công.
                    </p>
                    <button
                      type="button"
                      onClick={handleOpenTikTokOAuth}
                      className="w-full rounded-xl bg-slate-900 hover:bg-black border border-pink-500/40 text-white text-xs font-bold px-4 py-2.5 shadow-md transition-all inline-flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>🎵</span>
                      <span>Ủy Quyền 1-Click Ngay (Mở TikTok Shop)</span>
                      <ExternalLink className="w-3.5 h-3.5 text-pink-400" />
                    </button>
                  </div>

                  <div className="font-bold text-amber-300 flex items-center gap-1.5 text-[11px] pt-1">
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>Hoặc cấu hình thủ công (Tùy chọn nâng cao)</span>
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

      {/* Modal Kết Nối TikTok Shop Chuẩn Partner (WBS-18 & 20) */}
      <TikTokConnectModal
        isOpen={isTikTokModalOpen}
        onClose={() => setIsTikTokModalOpen(false)}
        initialTab={tikTokInitialTab}
        onConnected={() => {
          setBanner({
            type: "success",
            text: "Đã kết nối thành công gian hàng TikTok Shop vào CRM!",
          });
          loadChannels();
        }}
      />

      {/* Modal Kết Nối Shopee Open API v2 (1-Click) */}
      <ShopeeConnectModal
        isOpen={isShopeeModalOpen}
        onClose={() => setIsShopeeModalOpen(false)}
        onConnected={() => {
          setBanner({
            type: "success",
            text: "Đã kết nối thành công gian hàng Shopee vào CRM!",
          });
          loadChannels();
        }}
      />

      {/* Modal Hướng Dẫn Cấu Hình Liên Kết Từng Kênh */}
      {guidePlatform && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-6 text-xs space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-blue-500/15 text-blue-400">
                  <BookOpen className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Hướng Dẫn Cấu Hình &amp; Lấy API Key — {PLATFORM_INFO[guidePlatform]?.label || guidePlatform}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Tài liệu hướng dẫn từng bước tích hợp Webhook và khóa bảo mật vào ADDP CRM
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setGuidePlatform(null)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Nội dung hướng dẫn theo từng nền tảng */}
            {guidePlatform === "MAGENTO" && (
              <div className="space-y-3 text-slate-300">
                <div className="rounded-xl bg-orange-500/10 border border-orange-500/20 p-3 text-orange-200">
                  <strong>Website Magento 2.4.8 (https://addp.vn):</strong> Tự động nhận Lead từ Addp_CustomForm, Minigame và đơn hàng đặt trên website chính.
                </div>
                <div className="space-y-1.5">
                  <div className="font-bold text-white">Bước 1: Cấu hình Webhook trên Magento 2.4.8</div>
                  <p className="text-slate-400">Dán URL Webhook sau vào module CustomForm hoặc Webhook Observer của Magento:</p>
                  <div className="flex items-center justify-between gap-2 bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono text-cyan-300">
                    <span>https://crm.addp.vn/api/webhooks/magento</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard("https://crm.addp.vn/api/webhooks/magento", "mgn_webhook")}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-white"
                    >
                      {copiedText === "mgn_webhook" ? "Đã chép" : "Sao chép"}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="font-bold text-white">Bước 2: Lấy Magento REST API Integration Token</div>
                  <ol className="list-decimal list-inside space-y-1 text-slate-400">
                    <li>Đăng nhập Trang Quản Trị Magento Admin: <code className="text-white">https://addp.vn/admin</code></li>
                    <li>Vào menu <strong className="text-white">System &rarr; Extensions &rarr; Integrations &rarr; Add New Integration</strong>.</li>
                    <li>Đặt tên: <code className="text-white">ADDP_CRM_INTEGRATION</code>.</li>
                    <li>Tại tab <strong className="text-white">API</strong>, chọn tài nguyên cấp quyền: <code className="text-emerald-400">Sales, Customers, Products, CustomForm</code>.</li>
                    <li>Bấm <strong className="text-white">Save &amp; Activate</strong>. Sao chép chuỗi <code className="text-amber-400 font-mono">Access Token</code> dán vào ô API Token trên CRM.</li>
                  </ol>
                </div>
              </div>
            )}

            {guidePlatform === "FACEBOOK" && (
              <div className="space-y-3 text-slate-300">
                <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-3 text-blue-200">
                  <strong>Fanpage Facebook (Meta Messenger &amp; Comment):</strong> Tự động đồng bộ tin nhắn khách, thu thập Lead và tự động ẩn bình luận chứa SĐT.
                </div>
                <div className="space-y-1.5">
                  <div className="font-bold text-white">Cách 1: Kết nối tự động 1-Click (Khuyên dùng)</div>
                  <p className="text-slate-400">Bấm nút <strong className="text-blue-400">&quot;Kết Nối Fanpage 1-Click&quot;</strong> ở trên, đăng nhập tài khoản Facebook Admin để hệ thống tự động nhận diện danh sách Fanpage và lưu Token vĩnh viễn.</p>
                </div>
                <div className="space-y-1.5">
                  <div className="font-bold text-white">Cách 2: Nhập Page ID &amp; Token thủ công từ Meta for Developers</div>
                  <ol className="list-decimal list-inside space-y-1 text-slate-400">
                    <li>Truy cập <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className="text-blue-400 underline inline-flex items-center gap-1">Meta for Developers <ExternalLink className="w-3 h-3" /></a>.</li>
                    <li>Vào mục <strong className="text-white">Messenger &rarr; Settings &rarr; Access Tokens</strong> &rarr; Chọn Fanpage cần kết nối &rarr; Bấm <strong>Generate Token</strong>.</li>
                    <li>Cấu hình Webhook Callback URL: <code className="text-cyan-300 font-mono">https://crm.addp.vn/api/webhooks/facebook</code></li>
                    <li>Verify Token nhập vào Meta: <code className="text-amber-400 font-mono">(Cấu hình trong biến môi trường FB_VERIFY_TOKEN)</code></li>
                    <li>Đăng ký các trường sự kiện: <code className="text-emerald-400">messages, messaging_postbacks, feed (comments)</code>.</li>
                  </ol>
                </div>
              </div>
            )}

            {guidePlatform === "ZALO_PERSONAL" && (
              <div className="space-y-3 text-slate-300">
                <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/20 p-3 text-cyan-200">
                  <strong>Zalo Cá Nhân (Multi-QR Isolation):</strong> Đăng nhập nhiều nick Zalo tư vấn độc lập trên server. Tuân thủ Điều 4 AGENTS.md: cơ chế giãn cách gửi tin 45–120s chống khóa nick.
                </div>
                <div className="space-y-1.5">
                  <div className="font-bold text-white">Cách thức kết nối:</div>
                  <ol className="list-decimal list-inside space-y-1 text-slate-400">
                    <li>Bấm nút <strong className="text-cyan-400">&quot;Quét Mã QR Zalo Cá Nhân&quot;</strong> ở góc trên bên phải.</li>
                    <li>Mở ứng dụng Zalo trên điện thoại của nhân viên Sale &rarr; Chọn biểu tượng quét QR.</li>
                    <li>Quét mã hiển thị trên màn hình và bấm <strong className="text-white">Xác nhận Đăng nhập trên máy tính</strong>.</li>
                    <li>Hệ thống máy chủ sẽ tự động lưu phiên làm việc cô lập trong thư mục connector-home và duy trì kết nối 24/7.</li>
                  </ol>
                </div>
              </div>
            )}

            {guidePlatform === "ZALO_OA" && (
              <div className="space-y-3 text-slate-300">
                <div className="rounded-xl bg-sky-500/10 border border-sky-500/20 p-3 text-sky-200">
                  <strong>Zalo Official Account (Open API v3):</strong> Kênh OA Doanh nghiệp chính thức, gửi tin ZNS và chăm sóc khách hàng.
                </div>
                <div className="space-y-1.5">
                  <div className="font-bold text-white">Bước 1: Lấy App ID &amp; Secret Key trên Zalo for Developers</div>
                  <ol className="list-decimal list-inside space-y-1 text-slate-400">
                    <li>Truy cập <a href="https://developers.zalo.me" target="_blank" rel="noreferrer" className="text-blue-400 underline inline-flex items-center gap-1">Zalo for Developers <ExternalLink className="w-3 h-3" /></a> &rarr; Ứng dụng của tôi.</li>
                    <li>Sao chép <strong className="text-white">App ID</strong> và <strong className="text-white">Khóa bí mật (Secret Key)</strong>.</li>
                    <li>Lấy <strong className="text-white">OA ID</strong> trong trang quản trị Zalo OA (<code className="text-cyan-300">https://oa.zalo.me</code>).</li>
                  </ol>
                </div>
                <div className="space-y-1.5">
                  <div className="font-bold text-white">Bước 2: Cài đặt Webhook URL</div>
                  <p className="text-slate-400">Dán URL Webhook sau vào mục Cài đặt Webhook của ứng dụng Zalo:</p>
                  <div className="flex items-center justify-between gap-2 bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono text-cyan-300">
                    <span>https://crm.addp.vn/api/webhooks/zalo-oa</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard("https://crm.addp.vn/api/webhooks/zalo-oa", "zns_webhook")}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-white"
                    >
                      {copiedText === "zns_webhook" ? "Đã chép" : "Sao chép"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {guidePlatform === "TIKTOK_SHOP" && (
              <div className="space-y-3 text-slate-300">
                <div className="rounded-xl bg-pink-500/10 border border-pink-500/20 p-3 text-pink-200">
                  <strong>TikTok Shop &amp; TikTok Ads (TikTok Partner API):</strong> Tự động đồng bộ đơn hàng TikTok Shop, tự giải mã Combo và đối soát lãi/lỗ chi phí Ads GMV Max.
                </div>
                <div className="space-y-1.5">
                  <div className="font-bold text-white">Bước 1: Đăng ký ứng dụng trên TikTok Shop Partner Center</div>
                  <ol className="list-decimal list-inside space-y-1 text-slate-400">
                    <li>Truy cập <a href="https://partner.tiktokshop.com" target="_blank" rel="noreferrer" className="text-blue-400 underline inline-flex items-center gap-1">TikTok Shop Partner Center <ExternalLink className="w-3 h-3" /></a>.</li>
                    <li>Tạo ứng dụng Custom App &rarr; Chọn Category: <strong className="text-white">ERP / CRM / Order Management</strong>.</li>
                    <li>Lấy <strong className="text-white">App Key</strong> và <strong className="text-white">App Secret</strong>.</li>
                    <li>Lấy <strong className="text-white">Shop ID (Cipher)</strong> trong mục Seller Center &rarr; Hồ sơ nhà bán hàng.</li>
                  </ol>
                </div>
                <div className="space-y-1.5">
                  <div className="font-bold text-white">Bước 2: Dán Webhook đồng bộ đơn hàng</div>
                  <div className="flex items-center justify-between gap-2 bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono text-cyan-300">
                    <span>https://crm.addp.vn/api/webhooks/tiktok</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard("https://crm.addp.vn/api/webhooks/tiktok", "tts_webhook")}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-white"
                    >
                      {copiedText === "tts_webhook" ? "Đã chép" : "Sao chép"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {guidePlatform === "SHOPEE" && (
              <div className="space-y-3 text-slate-300">
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-amber-200">
                  <strong>Shopee Open API v2:</strong> Tự động đồng bộ đơn hàng Shopee Mall và Shopee thường, theo dõi vận đơn và đối soát phí sàn.
                </div>
                <div className="space-y-1.5">
                  <div className="font-bold text-white">Bước 1: Lấy Partner ID &amp; Partner Key</div>
                  <ol className="list-decimal list-inside space-y-1 text-slate-400">
                    <li>Truy cập <a href="https://open.shopee.com" target="_blank" rel="noreferrer" className="text-blue-400 underline inline-flex items-center gap-1">Shopee Open Platform <ExternalLink className="w-3 h-3" /></a>.</li>
                    <li>Đăng nhập Console &rarr; Tạo App &rarr; Lấy <strong className="text-white">Partner ID</strong> và <strong className="text-white">Partner Key</strong>.</li>
                    <li>Lấy <strong className="text-white">Shop ID</strong> trong Kênh Người Bán Shopee (<code className="text-cyan-300">banhang.shopee.vn</code> &rarr; Thiết lập Shop).</li>
                  </ol>
                </div>
                <div className="space-y-1.5">
                  <div className="font-bold text-white">Bước 2: Cấu hình Webhook Shopee (Push Mechanism)</div>
                  <div className="flex items-center justify-between gap-2 bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono text-cyan-300">
                    <span>https://crm.addp.vn/api/webhooks/shopee</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard("https://crm.addp.vn/api/webhooks/shopee", "shopee_webhook")}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-white"
                    >
                      {copiedText === "shopee_webhook" ? "Đã chép" : "Sao chép"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {guidePlatform === "KIOTVIET" && (
              <div className="space-y-3 text-slate-300">
                <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-emerald-200">
                  <strong>KiotViet POS &amp; Quản Lý Kho:</strong> Đồng bộ đơn hàng tại quầy thuốc, trừ tồn kho thực tế và tự động kích hoạt lộ trình CSKH.
                </div>
                <div className="space-y-1.5">
                  <div className="font-bold text-white">Bước 1: Lấy Client ID &amp; Client Secret trên KiotViet</div>
                  <ol className="list-decimal list-inside space-y-1 text-slate-400">
                    <li>Đăng nhập trang quản lý KiotViet: <code className="text-white">https://manapp.kiotviet.vn</code></li>
                    <li>Vào mục <strong className="text-white">Thiết lập cửa hàng &rarr; Thiết lập kết nối API</strong>.</li>
                    <li>Bấm <strong className="text-white">Tạo mã kết nối</strong> &rarr; Lấy <strong className="text-white">Client ID</strong>, <strong className="text-white">Client Secret</strong> và tên gian hàng (<strong className="text-white">Retailer</strong>).</li>
                  </ol>
                </div>
                <div className="space-y-1.5">
                  <div className="font-bold text-white">Bước 2: Đăng ký Webhook KiotViet</div>
                  <div className="flex items-center justify-between gap-2 bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono text-cyan-300">
                    <span>https://crm.addp.vn/api/webhooks/kiotviet</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard("https://crm.addp.vn/api/webhooks/kiotviet", "kv_webhook")}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-white"
                    >
                      {copiedText === "kv_webhook" ? "Đã chép" : "Sao chép"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setGuidePlatform(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer transition"
              >
                Đã Hiểu &amp; Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
