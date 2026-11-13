"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ShoppingBag,
  ExternalLink,
  Copy,
  Check,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Key,
  Globe,
  RefreshCw,
  Sliders,
  HelpCircle,
} from "lucide-react";

/**
 * ADDP Omnichannel AI CRM — Modal Kết Nối TikTok Shop Chuẩn Partner API (WBS-18 & 20)
 * Cung cấp 3 phương thức kết nối chuẩn xác & bảo mật:
 * 1. OAuth 1-Click Multi-Shop (Cửa sổ cấp quyền chính thức TikTok Shop)
 * 2. Cấu hình Partner App Key & App Secret (Tự động lưu vào hệ thống)
 * 3. Kết nối thủ công bằng Shop ID, Cipher & Token đã có
 */

export default function TikTokConnectModal({ isOpen, onClose, onConnected, initialTab = "oauth" }) {
  const [activeTab, setActiveTab] = useState(initialTab); // 'oauth' | 'config' | 'direct'
  const [config, setConfig] = useState({
    serviceId: "7706525357121636097",
    appKey: "",
    appSecret: "",
    defaultShopCipher: "ROW_ZYiTiAAAAAAKQIKT19iz-hy3D_kGFVJk",
    region: "VN",
    isConfigured: false,
    authUrl: "",
    redirectUri: "",
    callbackUri: "",
    webhookUri: "",
  });

  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [directConnecting, setDirectConnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [copiedKey, setCopiedKey] = useState(null);
  const [showWebhookGuide, setShowWebhookGuide] = useState(true);

  // Form thủ công (Tab 3)
  const [directForm, setDirectForm] = useState({
    shopId: "",
    shopName: "TikTok Shop - Gian Hàng ADDP",
    shopCipher: "ROW_ZYiTiAAAAAAKQIKT19iz-hy3D_kGFVJk",
    accessToken: "",
    refreshToken: "",
  });

  const loadConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const res = await fetch("/api/channels/tiktok/oauth/start");
      const data = await res.json();
      if (res.ok && data.ok) {
        setConfig((prev) => ({
          ...prev,
          serviceId: data.serviceId || prev.serviceId,
          appKey: data.appKey || "",
          appSecret: data.hasAppSecret ? "••••••••" : "",
          isConfigured: data.isConfigured || false,
          defaultShopCipher: data.defaultShopCipher || prev.defaultShopCipher,
          region: data.region || "VN",
          authUrl: data.authUrl || "",
          redirectUri: data.redirectUri || "",
          callbackUri: data.callbackUri || "",
          webhookUri: data.webhookUri || "",
        }));

        if (!data.isConfigured && initialTab === "oauth") {
          setActiveTab("config");
        }
      }
    } catch {
      console.warn("Không thể tải cấu hình TikTok Shop.");
    } finally {
      setLoadingConfig(false);
    }
  }, [initialTab]);

  useEffect(() => {
    if (isOpen) {
      loadConfig();
      setErrorMsg("");
      setSuccessMsg("");
    }
  }, [isOpen, loadConfig]);

  if (!isOpen) return null;

  const copyToClipboard = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // 1. Mở cửa sổ TikTok OAuth 1-Click
  const handleOpenOAuth = () => {
    setErrorMsg("");
    if (!config.isConfigured && !config.appKey) {
      setErrorMsg(
        "Chưa cấu hình App Key và App Secret. Vui lòng chuyển sang tab [Cấu Hình Partner] để lưu thông tin từ TikTok Shop Partner Center trước khi mở ủy quyền."
      );
      setActiveTab("config");
      return;
    }

    const authUrl =
      config.authUrl ||
      `https://services.tiktokshop.com/open/authorize?service_id=${config.serviceId || "7706525357121636097"}`;

    const w = 700;
    const h = 800;
    const left = window.screen.width / 2 - w / 2;
    const top = window.screen.height / 2 - h / 2;
    window.open(
      authUrl,
      "TikTokShopOAuth",
      `width=${w},height=${h},top=${top},left=${left},scrollbars=yes,status=yes`
    );
  };

  // 2. Lưu cấu hình Partner App Key & Secret
  const handleSaveConfig = async (e) => {
    e?.preventDefault();
    if (!config.appKey.trim()) {
      setErrorMsg("Vui lòng nhập App Key từ TikTok Shop Partner Center.");
      return;
    }
    if (!config.appSecret.trim() || config.appSecret.includes("••••")) {
      if (!config.isConfigured) {
        setErrorMsg("Vui lòng nhập App Secret từ TikTok Shop Partner Center.");
        return;
      }
    }

    setSavingConfig(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const payload = {
        serviceId: config.serviceId.trim(),
        appKey: config.appKey.trim(),
        defaultShopCipher: config.defaultShopCipher.trim(),
        region: config.region.trim(),
      };
      if (config.appSecret && !config.appSecret.includes("••••")) {
        payload.appSecret = config.appSecret.trim();
      }

      const res = await fetch("/api/channels/tiktok/oauth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setSuccessMsg(data.message || "Đã lưu cấu hình TikTok Shop Partner thành công!");
        setConfig((prev) => ({
          ...prev,
          isConfigured: true,
          authUrl: data.authUrl || prev.authUrl,
          appSecret: "••••••••",
        }));
      } else {
        setErrorMsg(data.error || "Không thể lưu cấu hình TikTok Shop.");
      }
    } catch {
      setErrorMsg("Lỗi kết nối máy chủ khi lưu cấu hình.");
    } finally {
      setSavingConfig(false);
    }
  };

  // 3. Kết nối trực tiếp bằng Shop ID & Token
  const handleDirectConnect = async (e) => {
    e?.preventDefault();
    if (!directForm.shopId.trim() && !directForm.shopCipher.trim()) {
      setErrorMsg("Vui lòng nhập ít nhất Shop ID hoặc Shop Cipher.");
      return;
    }

    setDirectConnecting(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const shopId = directForm.shopId.trim() || `tts_${Date.now()}`;
      const channelId = `tiktok_shop_${shopId}`;

      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: channelId,
          platform: "TIKTOK_SHOP",
          name: directForm.shopName.trim() || `TikTok Shop - ${shopId}`,
          externalId: shopId,
          status: directForm.refreshToken ? "CONNECTED" : "READY_TO_CONNECT",
          statusLabel: directForm.refreshToken
            ? "Đã kết nối Token thủ công"
            : "Chờ cấp quyền / Chưa có Token",
          config: {
            serviceId: config.serviceId,
            appKey: config.appKey,
            shopId,
            shopCipher: directForm.shopCipher.trim(),
            accessToken: directForm.accessToken.trim(),
            refreshToken: directForm.refreshToken.trim(),
            sellerName: directForm.shopName.trim(),
          },
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        onConnected?.([data.channel]);
        onClose();
      } else {
        setErrorMsg(data.error || "Không thể kết nối gian hàng.");
      }
    } catch {
      setErrorMsg("Lỗi khi kết nối gian hàng TikTok Shop.");
    } finally {
      setDirectConnecting(false);
    }
  };

  const redirectUri = config.redirectUri || "https://crm.addp.vn/channels";
  const callbackUri = config.callbackUri || "https://crm.addp.vn/api/channels/tiktok/callback";
  const webhookUri = config.webhookUri || "https://crm.addp.vn/api/webhooks/tiktok";

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-pink-600 to-rose-500 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-pink-500/20">
              🎵
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base">Kết Nối TikTok Shop Chuẩn Partner</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-pink-500/10 border border-pink-500/30 text-pink-300">
                  Open API v2
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Ủy quyền 1-Click Multi-Shop, Đồng bộ Đơn hàng & Đối soát GMV Max (WBS-18 & 20)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 text-sm font-semibold transition"
          >
            ✕
          </button>
        </div>

        {/* Thông báo lỗi / thành công */}
        {errorMsg && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300 flex items-start gap-2 flex-shrink-0">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed whitespace-pre-line">{errorMsg}</div>
            <button
              onClick={() => setErrorMsg("")}
              className="text-slate-400 hover:text-white text-xs font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {successMsg && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-300 flex items-start gap-2 flex-shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">{successMsg}</div>
            <button
              onClick={() => setSuccessMsg("")}
              className="text-slate-400 hover:text-white text-xs font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs font-semibold flex-shrink-0">
          <button
            type="button"
            onClick={() => {
              setActiveTab("oauth");
              setErrorMsg("");
            }}
            className={`flex-1 py-2 rounded-lg transition flex items-center justify-center gap-1.5 ${
              activeTab === "oauth"
                ? "bg-pink-600 text-white shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <span>⚡ Ủy Quyền 1-Click (OAuth)</span>
            {config.isConfigured && (
              <span className="text-[10px] bg-emerald-400 text-slate-950 px-1.5 py-0.2 rounded font-bold">
                Sẵn Sàng
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("config");
              setErrorMsg("");
            }}
            className={`flex-1 py-2 rounded-lg transition flex items-center justify-center gap-1.5 ${
              activeTab === "config"
                ? "bg-pink-600 text-white shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Cấu Hình Partner (App Key)</span>
            {!config.isConfigured && (
              <span className="text-[10px] bg-amber-400 text-slate-950 px-1.5 py-0.2 rounded font-bold">
                Cần Thiết
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("direct");
              setErrorMsg("");
            }}
            className={`flex-1 py-2 rounded-lg transition flex items-center justify-center gap-1.5 ${
              activeTab === "direct"
                ? "bg-pink-600 text-white shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>Kết Nối Bằng Token</span>
          </button>
        </div>

        {/* Nội dung Tabs */}
        <div className="overflow-y-auto flex-1 pr-1 space-y-4 text-xs">
          {/* TAB 1: OAUTH 1-CLICK */}
          {activeTab === "oauth" && (
            <div className="space-y-4 py-1">
              {!config.isConfigured ? (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-2.5 text-amber-200">
                  <div className="font-bold text-white flex items-center gap-2 text-sm">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span>Chưa Cấu Hình TikTok Partner App Key &amp; App Secret</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    Để tránh lỗi <code className="text-rose-400 font-mono font-bold bg-slate-950 px-1.5 py-0.5 rounded">&quot;invalid params&quot;</code> khi ủy quyền, hệ thống yêu cầu cấu hình App Key &amp; App Secret từ tài khoản Partner Center của bạn trước khi mở cửa sổ ủy quyền.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab("config")}
                    className="rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3.5 py-2 text-xs transition inline-flex items-center gap-1.5"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Đi tới Tab Cấu Hình App Key Ngay</span>
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-pink-500/30 bg-gradient-to-r from-slate-900 to-pink-950/20 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-pink-300 flex items-center gap-1.5">
                      <span>🎵</span>
                      <span>Trạng thái Ứng Dụng: Đã sẵn sàng kết nối</span>
                    </span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      App Key: {config.appKey ? `${config.appKey.slice(0, 4)}••••${config.appKey.slice(-4)}` : "Đã nạp"}
                    </span>
                  </div>

                  <p className="text-slate-300 leading-relaxed text-[11px]">
                    Bấm nút bên dưới để mở trang đăng nhập TikTok Seller Center. Bạn có thể chọn và ủy quyền nhiều gian hàng cùng lúc. Token sẽ được tự động đổi ngầm và lưu mã hóa an toàn vào CRM.
                  </p>

                  <button
                    type="button"
                    onClick={handleOpenOAuth}
                    className="w-full rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-bold py-3.5 text-xs transition shadow-lg shadow-pink-600/30 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>🎵</span>
                    <span>Mở Cửa Sổ Cấp Quyền TikTok Shop (OAuth 1-Click)</span>
                    <ExternalLink className="w-3.5 h-3.5 text-pink-200" />
                  </button>
                </div>
              )}

              {/* Thông số Redirect URI đã đăng ký */}
              <div className="space-y-2 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
                <div className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-blue-400" />
                  <span>Redirect URI cần đăng ký trên TikTok Partner Center:</span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 bg-slate-900 p-2 rounded-lg border border-slate-800">
                    <code className="text-cyan-300 font-mono text-[11px] flex-1 break-all select-all">
                      {redirectUri}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(redirectUri, "redir1")}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded text-[11px] font-semibold whitespace-nowrap inline-flex items-center gap-1"
                    >
                      {copiedKey === "redir1" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === "redir1" ? "Đã chép" : "Sao chép"}</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-2 bg-slate-900 p-2 rounded-lg border border-slate-800">
                    <code className="text-cyan-300 font-mono text-[11px] flex-1 break-all select-all">
                      {callbackUri}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(callbackUri, "redir2")}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded text-[11px] font-semibold whitespace-nowrap inline-flex items-center gap-1"
                    >
                      {copiedKey === "redir2" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === "redir2" ? "Đã chép" : "Sao chép"}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CẤU HÌNH PARTNER APP KEY & APP SECRET */}
          {activeTab === "config" && (
            <form onSubmit={handleSaveConfig} className="space-y-4 py-1">
              <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3.5 space-y-2 text-blue-200">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4 text-blue-400" />
                  <span>Cách lấy thông số trên TikTok Shop Partner Center:</span>
                </div>
                <ol className="list-decimal pl-5 space-y-1 text-slate-300 text-[11px]">
                  <li>
                    Đăng nhập{" "}
                    <a
                      href="https://partner.tiktokshop.com"
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-400 underline font-semibold inline-flex items-center gap-1"
                    >
                      partner.tiktokshop.com <ExternalLink className="w-3 h-3" />
                    </a>
                  </li>
                  <li>
                    Vào menu <strong>App &amp; Service</strong> &rarr; <strong>App Management</strong> &rarr; Chọn Custom App của công ty (hoặc tạo mới với danh mục <em>ERP / CRM</em>).
                  </li>
                  <li>
                    Tại phần <strong>Basic Information</strong>: Copy <strong>Service ID</strong>, <strong>App Key</strong> và <strong>App Secret</strong> dán vào ô bên dưới.
                  </li>
                  <li>
                    Tại mục <strong>Redirect URL</strong>: Thêm cả 2 địa chỉ: <code className="text-cyan-300 font-mono">https://crm.addp.vn/channels</code> và <code className="text-cyan-300 font-mono">https://crm.addp.vn/api/channels/tiktok/callback</code>.
                  </li>
                </ol>
              </div>

              <div className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Service ID (Mã Dịch Vụ Partner) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    value={config.serviceId}
                    onChange={(e) => setConfig({ ...config, serviceId: e.target.value })}
                    placeholder="VD: 7706525357121636097"
                    className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-white font-mono text-xs focus:border-pink-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Service ID dùng để tạo link ủy quyền Seller: <code className="text-slate-300 font-mono">https://services.tiktokshop.com/open/authorize?service_id=...</code>
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      App Key <span className="text-rose-400">*</span>
                    </label>
                    <input
                      value={config.appKey}
                      onChange={(e) => setConfig({ ...config, appKey: e.target.value })}
                      placeholder="VD: 6b8a2e1..."
                      className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-white font-mono text-xs focus:border-pink-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      App Secret <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="password"
                      value={config.appSecret}
                      onChange={(e) => setConfig({ ...config, appSecret: e.target.value })}
                      placeholder={config.isConfigured ? "Đã lưu (nhập để đổi)" : "Nhập App Secret..."}
                      className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-white font-mono text-xs focus:border-pink-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Shop Cipher Mặc Định
                    </label>
                    <input
                      value={config.defaultShopCipher}
                      onChange={(e) => setConfig({ ...config, defaultShopCipher: e.target.value })}
                      placeholder="ROW_ZYiTi..."
                      className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-white font-mono text-xs focus:border-pink-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Khu Vực (Region)
                    </label>
                    <select
                      value={config.region}
                      onChange={(e) => setConfig({ ...config, region: e.target.value })}
                      className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-white text-xs focus:border-pink-500 focus:outline-none"
                    >
                      <option value="VN">Việt Nam (VN)</option>
                      <option value="TH">Thái Lan (TH)</option>
                      <option value="MY">Malaysia (MY)</option>
                      <option value="PH">Philippines (PH)</option>
                      <option value="ID">Indonesia (ID)</option>
                      <option value="SG">Singapore (SG)</option>
                      <option value="US">Hoa Kỳ (US Crossborder)</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingConfig || !config.appKey.trim()}
                  className="w-full rounded-xl bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white font-bold py-3 transition flex items-center justify-center gap-2 shadow-lg shadow-pink-600/20 cursor-pointer"
                >
                  {savingConfig ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Đang lưu cấu hình...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Lưu Cấu Hình TikTok Partner App</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: KẾT NỐI THỦ CÔNG */}
          {activeTab === "direct" && (
            <form onSubmit={handleDirectConnect} className="space-y-4 py-1">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                <div className="font-semibold text-slate-200">
                  Nhập trực tiếp Shop ID &amp; Token nếu bạn đã có sẵn thông tin:
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Shop ID</label>
                    <input
                      value={directForm.shopId}
                      onChange={(e) => setDirectForm({ ...directForm, shopId: e.target.value })}
                      placeholder="VD: 7494582..."
                      className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white font-mono text-xs focus:border-pink-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Shop Cipher (Bắt đầu bằng ROW_)</label>
                    <input
                      value={directForm.shopCipher}
                      onChange={(e) => setDirectForm({ ...directForm, shopCipher: e.target.value })}
                      placeholder="ROW_ZYiTi..."
                      className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white font-mono text-xs focus:border-pink-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Tên Hiển Thị Gian Hàng</label>
                  <input
                    value={directForm.shopName}
                    onChange={(e) => setDirectForm({ ...directForm, shopName: e.target.value })}
                    placeholder="VD: Dược Phẩm ADDP - Official Store"
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white text-xs focus:border-pink-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Refresh Token (Làm mới định kỳ)</label>
                  <input
                    value={directForm.refreshToken}
                    onChange={(e) => setDirectForm({ ...directForm, refreshToken: e.target.value })}
                    placeholder="Dán Refresh Token từ Partner Center..."
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white font-mono text-xs focus:border-pink-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Access Token (Tùy chọn)</label>
                  <textarea
                    rows={2}
                    value={directForm.accessToken}
                    onChange={(e) => setDirectForm({ ...directForm, accessToken: e.target.value })}
                    placeholder="Dán Access Token (nếu có)..."
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 p-2 text-white font-mono text-xs focus:border-pink-500 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={directConnecting || (!directForm.shopId && !directForm.shopCipher)}
                  className="w-full rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-bold py-3 transition flex items-center justify-center gap-2 border border-slate-700 cursor-pointer"
                >
                  {directConnecting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Đang lưu gian hàng...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Lưu Gian Hàng TikTok Shop Vào CRM</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Khung Thông Số Webhook Đồng Bộ Đơn Hàng (WBS-18) */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 space-y-2">
            <div
              className="flex items-center justify-between cursor-pointer select-none"
              onClick={() => setShowWebhookGuide(!showWebhookGuide)}
            >
              <div className="font-bold text-white flex items-center gap-1.5">
                <span className="text-cyan-400">📦</span>
                <span>Thông Số Webhook Đồng Bộ Đơn Hàng &amp; GMV Max (WBS-18)</span>
              </div>
              <span className="text-slate-400 text-xs">{showWebhookGuide ? "▲ Thu gọn" : "▼ Chi tiết"}</span>
            </div>

            {showWebhookGuide && (
              <div className="space-y-2 pt-2 text-slate-300 text-[11px] border-t border-slate-800">
                <div>
                  <span className="text-slate-400 font-semibold">Webhook Callback URL:</span>
                  <div className="flex items-center gap-2 bg-slate-900 p-2 rounded-lg border border-slate-800 mt-1">
                    <code className="text-cyan-300 font-mono text-[11px] flex-1 break-all select-all">
                      {webhookUri}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(webhookUri, "webhook")}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded text-[11px] font-semibold whitespace-nowrap inline-flex items-center gap-1"
                    >
                      {copiedKey === "webhook" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === "webhook" ? "Đã chép" : "Sao chép"}</span>
                    </button>
                  </div>
                </div>
                <p className="text-slate-400 text-[10.5px]">
                  Tại TikTok Partner Center &rarr; Webhooks: Dán URL trên và đăng ký sự kiện: <strong className="text-emerald-300">ORDER_STATUS_CHANGE</strong>, <strong className="text-emerald-300">PACKAGE_UPDATE</strong> để tự động tách Combo và tính lãi lỗ tức thì khi có đơn mới.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
