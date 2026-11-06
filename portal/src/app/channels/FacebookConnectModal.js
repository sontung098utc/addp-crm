"use client";

import { useState, useEffect } from "react";

/**
 * ADDP Omnichannel AI CRM — Modal Kết Nối Fanpage Chuẩn Meta OAuth & Page Token (WBS-16 & WBS-17)
 * Cung cấp 3 giải pháp kết nối tiện lợi, an toàn và trực quan:
 * 1. Meta OAuth 1-Click (Cửa sổ cấp quyền chính thức của Meta)
 * 2. Quét nhanh bằng Access Token (Hỗ trợ cả User Token & Page Token)
 * 3. Nhập trực tiếp Page ID & Page Token (100% thành công, không cần đợi duyệt App)
 */

export default function FacebookConnectModal({ isOpen, onClose, onConnected }) {
  const [mode, setMode] = useState("direct"); // 'direct' | 'token' | 'oauth'
  const [appId, setAppId] = useState("1818021756018026");
  const [appSecret, setAppSecret] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [directPageId, setDirectPageId] = useState("");
  const [directPageName, setDirectPageName] = useState("");
  const [directPageToken, setDirectPageToken] = useState("");
  const [scanning, setScanning] = useState(false);
  const [directConnecting, setDirectConnecting] = useState(false);
  const [pages, setPages] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [connecting, setConnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [copiedField, setCopiedField] = useState(null);
  const [showWebhookGuide, setShowWebhookGuide] = useState(true);

  // Lắng nghe sự kiện callback từ cửa sổ popup Facebook
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data?.type === "FB_OAUTH_SUCCESS") {
        if (event.data.error) {
          setErrorMsg(event.data.error);
        } else {
          onConnected?.([]);
          onClose();
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onConnected, onClose]);

  if (!isOpen) return null;

  const copyToClipboard = (text, fieldName) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // 1. Mở cửa sổ Meta OAuth Dialog chuẩn
  const handleOpenMetaOAuth = async () => {
    setErrorMsg("");
    try {
      const params = new URLSearchParams();
      if (appId.trim()) params.set("appId", appId.trim());
      if (appSecret.trim()) params.set("appSecret", appSecret.trim());
      if (typeof window !== "undefined") {
        params.set("origin", window.location.origin);
      }

      const res = await fetch(`/api/channels/facebook/oauth/start?${params.toString()}`);
      const data = await res.json();

      if (res.ok && data.authUrl) {
        const cleanAuthUrl = data.authUrl
          .replace(/0\.0\.0\.0(%3A|:)3005/g, "crm.addp.vn")
          .replace(/127\.0\.0\.1(%3A|:)3005/g, "crm.addp.vn")
          .replace(/localhost(%3A|:)3005/g, "crm.addp.vn");
        const w = 620;
        const h = 750;
        const left = window.screen.width / 2 - w / 2;
        const top = window.screen.height / 2 - h / 2;
        window.open(
          cleanAuthUrl,
          "MetaFacebookOAuth",
          `width=${w},height=${h},top=${top},left=${left},scrollbars=yes,status=yes`
        );
      } else {
        setErrorMsg(data.error || "Không thể khởi tạo đường dẫn đăng nhập Facebook.");
      }
    } catch {
      setErrorMsg("Lỗi khi mở cửa sổ đăng nhập Facebook.");
    }
  };

  // 2. Quét danh sách Fanpage từ Access Token
  const handleScanPages = async () => {
    const token = tokenInput.trim();
    if (!token) {
      setErrorMsg("Vui lòng dán mã Access Token của bạn để quét danh sách Fanpage.");
      return;
    }

    setScanning(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/channels/facebook/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "scan", userToken: token }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setPages(data.pages || []);
        setSelectedIds(new Set((data.pages || []).map((p) => p.id)));
      } else {
        setErrorMsg(data.error || "Không thể quét danh sách Fanpage từ mã token này.");
      }
    } catch {
      setErrorMsg("Lỗi kết nối máy chủ khi quét Fanpage.");
    } finally {
      setScanning(false);
    }
  };

  // 3. Kết nối trực tiếp bằng Page ID & Page Token
  const handleDirectConnect = async (e) => {
    e?.preventDefault();
    if (!directPageId.trim() || !directPageToken.trim()) {
      setErrorMsg("Vui lòng nhập đầy đủ Page ID và Page Access Token.");
      return;
    }

    setDirectConnecting(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/channels/facebook/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "direct",
          pageId: directPageId.trim(),
          pageName: directPageName.trim() || `Fanpage ${directPageId.trim()}`,
          pageAccessToken: directPageToken.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        onConnected?.([data.channel]);
        onClose();
      } else {
        setErrorMsg(data.error || "Không thể kết nối Fanpage.");
      }
    } catch {
      setErrorMsg("Lỗi kết nối máy chủ khi lưu Fanpage.");
    } finally {
      setDirectConnecting(false);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConnectSelected = async () => {
    const chosenPages = pages.filter((p) => selectedIds.has(p.id));
    if (chosenPages.length === 0) {
      setErrorMsg("Vui lòng tick chọn ít nhất 1 Fanpage để kết nối.");
      return;
    }

    setConnecting(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/channels/facebook/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect", pages: chosenPages }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        onConnected?.(data.connected);
        onClose();
      } else {
        setErrorMsg(data.error || "Không thể kết nối các Fanpage đã chọn.");
      }
    } catch {
      setErrorMsg("Lỗi khi kết nối Fanpage vào hệ thống.");
    } finally {
      setConnecting(false);
    }
  };

  const webhookUrl = typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/facebook` : "https://crm.addp.vn/api/webhooks/facebook";
  const webhookVerifyToken = "addp_crm_fb_webhook_secret_2026";
  const redirectUri = typeof window !== "undefined" ? `${window.location.origin}/api/channels/facebook/oauth/callback` : "https://crm.addp.vn/api/channels/facebook/oauth/callback";

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-blue-500/20">
              f
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Kết Nối Fanpage Chuẩn Meta Official</h3>
              <p className="text-xs text-slate-400">
                Nhận tin nhắn khách hàng & Tự động ẩn bình luận chứa SĐT chống cướp khách (WBS-16 & 17)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            data-modal-close="facebook"
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 text-sm font-semibold"
          >
            ✕
          </button>
        </div>

        {/* Thông báo lỗi nếu có */}
        {errorMsg && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300 whitespace-pre-line flex items-start gap-2 flex-shrink-0">
            <span className="text-rose-400 font-bold">⚠️</span>
            <div className="flex-1 leading-relaxed">{errorMsg}</div>
            <button
              onClick={() => setErrorMsg("")}
              className="text-slate-400 hover:text-white text-xs font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Tabs chọn phương thức */}
        <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs font-semibold flex-shrink-0">
          <button
            type="button"
            onClick={() => {
              setMode("direct");
              setErrorMsg("");
            }}
            className={`flex-1 py-2 rounded-lg transition flex items-center justify-center gap-1.5 ${
              mode === "direct"
                ? "bg-blue-600 text-white shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <span>⚡ Nhập Trực Tiếp Page Token</span>
            <span className="text-[10px] bg-emerald-500 text-black px-1.5 py-0.2 rounded font-bold">Khuyên Dùng</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("token");
              setErrorMsg("");
            }}
            className={`flex-1 py-2 rounded-lg transition flex items-center justify-center gap-1.5 ${
              mode === "token"
                ? "bg-blue-600 text-white shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <span>🔍 Quét Bằng Access Token</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("oauth");
              setErrorMsg("");
            }}
            className={`flex-1 py-2 rounded-lg transition flex items-center justify-center gap-1.5 ${
              mode === "oauth"
                ? "bg-blue-600 text-white shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <span>🔗 Đăng Nhập Meta OAuth</span>
          </button>
        </div>

        {/* Nội dung theo từng Tab */}
        <div className="overflow-y-auto flex-1 pr-1 space-y-4">
          {/* TAB 1: NHẬP TRỰC TIẾP PAGE TOKEN (Khuyên dùng, 100% thành công) */}
          {mode === "direct" && (
            <div className="space-y-4 py-1 text-xs">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 space-y-2 text-emerald-200">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <span>💡 Cách lấy Page Access Token trong 10 giây (Không cần duyệt App):</span>
                </div>
                <ol className="list-decimal pl-5 space-y-1 text-slate-300">
                  <li>
                    Mở{" "}
                    <a
                      href="https://developers.facebook.com/tools/explorer/"
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-400 underline font-semibold"
                    >
                      Facebook Graph API Explorer ↗
                    </a>
                  </li>
                  <li>
                    Tại mục <strong>User or Page</strong> (ở cột bên phải): Click chọn tên <strong>Fanpage</strong> của bạn (Ví dụ: <em>Dược Phẩm ADDP</em> hoặc <em>Glucare PLUS</em>).
                  </li>
                  <li>
                    Bấm <strong>Generate Access Token</strong> rồi copy mã token dán vào ô bên dưới.
                  </li>
                </ol>
              </div>

              <div className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Page ID (ID Fanpage của bạn) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    value={directPageId}
                    onChange={(e) => setDirectPageId(e.target.value)}
                    placeholder="VD: 104829104820194"
                    className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-white font-mono text-xs focus:border-blue-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Tìm Page ID tại: Giới thiệu Fanpage trên Facebook hoặc trên thanh URL của Trang.
                  </p>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Tên hiển thị Fanpage
                  </label>
                  <input
                    value={directPageName}
                    onChange={(e) => setDirectPageName(e.target.value)}
                    placeholder="VD: Dược Phẩm ADDP - Sức Khỏe & Cuộc Sống"
                    className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-white text-xs focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Mã Page Access Token <span className="text-rose-400">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={directPageToken}
                    onChange={(e) => setDirectPageToken(e.target.value)}
                    placeholder="Dán mã EAAPZB... lấy từ Graph API Explorer vào đây"
                    className="w-full rounded-xl bg-slate-900 border border-slate-700 p-2.5 text-white font-mono text-xs focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleDirectConnect}
                  disabled={directConnecting || !directPageId.trim() || !directPageToken.trim()}
                  className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs py-3 transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
                >
                  {directConnecting ? (
                    <>
                      <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Đang xác thực & kết nối Fanpage...
                    </>
                  ) : (
                    <>⚡ Kết Nối Fanpage Ngay Vào CRM</>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: QUÉT BẰNG ACCESS TOKEN */}
          {mode === "token" && (
            <div className="space-y-4 py-1 text-xs">
              {pages.length === 0 ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-2 text-amber-200">
                    <div className="font-bold text-white flex items-center gap-1.5">
                      <span>💡 Quét toàn bộ danh sách Trang bạn làm Admin:</span>
                    </div>
                    <ol className="list-decimal pl-5 space-y-1 text-slate-300">
                      <li>
                        Mở{" "}
                        <a
                          href="https://developers.facebook.com/tools/explorer/"
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-400 underline font-semibold"
                        >
                          Facebook Graph API Explorer ↗
                        </a>
                      </li>
                      <li>
                        Bấm nút <strong>Add a Permission</strong> ➔ Chọn <strong>Events Groups Pages</strong> ➔ Tick chọn <strong>pages_show_list</strong> và <strong>pages_read_engagement</strong>.
                      </li>
                      <li>
                        Bấm nút xanh <strong>Generate Access Token</strong> rồi copy mã dán vào ô dưới đây.
                      </li>
                    </ol>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Mã Access Token Facebook:
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Dán mã EAAPZB... vào đây để quét danh sách Trang"
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none font-mono"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleScanPages}
                    disabled={scanning || !tokenInput.trim()}
                    className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs py-3 transition flex items-center justify-center gap-2 shadow"
                  >
                    {scanning ? (
                      <>
                        <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Đang lấy danh sách Trang từ tài khoản của bạn...
                      </>
                    ) : (
                      <>🔍 Quét &amp; Hiển Thị Danh Sách Fanpage</>
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white">
                      Tìm thấy {pages.length} Fanpage bạn đang quản lý:
                    </span>
                    <button
                      type="button"
                      onClick={() => setPages([])}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      ↺ Quét lại mã khác
                    </button>
                  </div>

                  <div className="overflow-y-auto space-y-2 max-h-60 pr-1">
                    {pages.map((p) => {
                      const isSelected = selectedIds.has(p.id);
                      return (
                        <div
                          key={p.id}
                          onClick={() => toggleSelect(p.id)}
                          className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                            isSelected
                              ? "bg-blue-950/40 border-blue-500/50 text-white"
                              : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700"
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {p.avatar ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={p.avatar}
                                alt={p.name}
                                className="h-10 w-10 rounded-full object-cover border border-slate-700 flex-shrink-0"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                                {p.name.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="font-bold text-xs text-white truncate">{p.name}</div>
                              <div className="text-[11px] text-slate-400 truncate">
                                {p.category} • ID: {p.id}
                              </div>
                            </div>
                          </div>

                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                          />
                        </div>
                      );
                    })}
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-slate-400">
                      Đã chọn: <strong className="text-white">{selectedIds.size}</strong> Fanpage
                    </span>
                    <button
                      type="button"
                      onClick={handleConnectSelected}
                      disabled={connecting || selectedIds.size === 0}
                      className="rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-5 py-2 font-bold transition"
                    >
                      {connecting ? "Đang kết nối..." : "✓ Cấp Quyền & Kết Nối Vào CRM"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: META OFFICIAL OAUTH DIALOG */}
          {mode === "oauth" && (
            <div className="space-y-4 py-1 text-xs">
              <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3.5 space-y-2 text-blue-200">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <span>ℹ️ Hướng dẫn cấu hình Meta Developer App:</span>
                </div>
                <p className="text-slate-300">
                  Tại màn hình <strong>developers.facebook.com/apps</strong> ➔ Chọn ứng dụng của bạn ➔ Mục <strong>Đăng nhập bằng Facebook</strong> ➔ <strong>Cài đặt</strong> ➔ Điền URL sau vào <strong>URI chuyển hướng OAuth hợp lệ</strong>:
                </p>
                <div className="flex items-center gap-2 bg-slate-950 p-2 rounded-lg border border-slate-800">
                  <code className="text-cyan-300 font-mono text-[11px] flex-1 break-all select-all">
                    {redirectUri}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(redirectUri, "redirectUri")}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded text-[11px] font-semibold whitespace-nowrap"
                  >
                    {copiedField === "redirectUri" ? "✓ Đã chép" : "Sao chép"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                <div>
                  <label className="block text-[11px] text-slate-300 font-semibold mb-1">
                    Facebook App ID:
                  </label>
                  <input
                    placeholder="2588176118323692"
                    value={appId}
                    onChange={(e) => setAppId(e.target.value)}
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white font-mono text-xs focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-300 font-semibold mb-1">
                    Facebook App Secret:
                  </label>
                  <input
                    type="password"
                    placeholder="Nhập App Secret..."
                    value={appSecret}
                    onChange={(e) => setAppSecret(e.target.value)}
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white font-mono text-xs focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleOpenMetaOAuth}
                className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs py-3.5 transition flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
              >
                <span>🚀 Mở Cửa Sổ Cấp Quyền Meta Official OAuth</span>
              </button>
            </div>
          )}

          {/* KHUNG THÔNG SỐ CẤU HÌNH WEBHOOK (Rất quan trọng - giải quyết đúng bức ảnh số 4 của user) */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 space-y-2 text-xs">
            <div
              className="flex items-center justify-between cursor-pointer select-none"
              onClick={() => setShowWebhookGuide(!showWebhookGuide)}
            >
              <div className="font-bold text-white flex items-center gap-1.5">
                <span className="text-cyan-400">⚙️</span>
                <span>Thông Số Cấu Hình Webhook Meta (Để nhận tin nhắn &amp; Tự ẩn SĐT)</span>
              </div>
              <span className="text-slate-400 text-xs">{showWebhookGuide ? "▲ Thu gọn" : "▼ Chi tiết"}</span>
            </div>

            {showWebhookGuide && (
              <div className="space-y-2.5 pt-2 text-slate-300 text-[11px] border-t border-slate-800">
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 text-amber-200">
                  <strong>Lưu ý quan trọng:</strong> Tại trang Webhooks của Meta, ở cột danh sách sản phẩm bên trái, bạn hãy chọn đối tượng <strong>Page (Trang)</strong>, không chọn User!
                </div>

                <div className="space-y-1">
                  <div className="text-slate-400 font-semibold">1. URL Gọi Lại (Callback URL):</div>
                  <div className="flex items-center gap-2 bg-slate-900 p-2 rounded-lg border border-slate-800">
                    <code className="text-cyan-300 font-mono text-[11px] flex-1 break-all select-all">
                      {webhookUrl}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(webhookUrl, "webhookUrl")}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded text-[11px] font-semibold whitespace-nowrap"
                    >
                      {copiedField === "webhookUrl" ? "✓ Đã chép" : "Sao chép"}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-slate-400 font-semibold">2. Mã Xác Minh (Verify Token):</div>
                  <div className="flex items-center gap-2 bg-slate-900 p-2 rounded-lg border border-slate-800">
                    <code className="text-emerald-300 font-mono text-[11px] flex-1 break-all select-all">
                      {webhookVerifyToken}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(webhookVerifyToken, "verifyToken")}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded text-[11px] font-semibold whitespace-nowrap"
                    >
                      {copiedField === "verifyToken" ? "✓ Đã chép" : "Sao chép"}
                    </button>
                  </div>
                </div>

                <div className="text-slate-400">
                  3. Bấm <strong>Xác minh và lưu</strong>, sau đó tại bảng trường webhook bên dưới, bật đăng ký:{" "}
                  <span className="text-white font-semibold">messages</span>,{" "}
                  <span className="text-white font-semibold">messaging_postbacks</span>,{" "}
                  <span className="text-white font-semibold">feed</span>.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
