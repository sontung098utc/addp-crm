"use client";

import { useState, useEffect } from "react";

/**
 * ADDP Omnichannel AI CRM — Modal Kết Nối Fanpage Chuẩn Meta OAuth (WBS-16 & WBS-17)
 * Đáp ứng chính xác yêu cầu của người dùng:
 * Bấm kết nối -> Mở popup Meta Official OAuth Dialog -> Chọn Trang & Doanh nghiệp -> Cấp quyền & Tự động lưu
 */

export default function FacebookConnectModal({ isOpen, onClose, onConnected }) {
  const [mode, setMode] = useState("oauth"); // 'oauth' | 'token'
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [scanning, setScanning] = useState(false);
  const [pages, setPages] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [connecting, setConnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Lắng nghe sự kiện callback từ cửa sổ popup Facebook
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data?.type === "FB_OAUTH_SUCCESS") {
        onConnected?.([]);
        onClose();
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onConnected, onClose]);

  if (!isOpen) return null;

  // 1. Mở cửa sổ Meta OAuth Dialog chuẩn (y hệt ảnh người dùng gửi)
  const handleOpenMetaOAuth = async () => {
    setErrorMsg("");
    try {
      const queryAppId = appId.trim() ? `?appId=${encodeURIComponent(appId.trim())}` : "";
      const res = await fetch(`/api/channels/facebook/oauth/start${queryAppId}`);
      const data = await res.json();

      if (res.ok && data.authUrl) {
        // Mở popup Facebook OAuth giữa màn hình
        const w = 620;
        const h = 750;
        const left = window.screen.width / 2 - w / 2;
        const top = window.screen.height / 2 - h / 2;
        window.open(
          data.authUrl,
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

  // 2. Quét danh sách Fanpage từ Access Token (Cách dự phòng không cần tạo App)
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

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-5 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white font-bold text-base shadow">
              f
            </span>
            <div>
              <h3 className="text-base font-bold text-white">Kết Nối Fanpage Chuẩn Meta Official</h3>
              <p className="text-xs text-slate-400">
                Hiển thị danh sách Fanpage của bạn trên Facebook để tick chọn &amp; cấp quyền
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-base">
            ✕
          </button>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs whitespace-pre-line leading-relaxed">
            {errorMsg}
          </div>
        )}

        {/* Tab chuyển đổi 2 chế độ */}
        <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setMode("oauth")}
            className={`flex-1 py-2 rounded-lg transition flex items-center justify-center gap-1.5 ${
              mode === "oauth"
                ? "bg-blue-600 text-white shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <span>🔗</span> Đăng Nhập Facebook (Chuẩn Meta)
          </button>
          <button
            type="button"
            onClick={() => setMode("token")}
            className={`flex-1 py-2 rounded-lg transition flex items-center justify-center gap-1.5 ${
              mode === "token"
                ? "bg-blue-600 text-white shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <span>🔍</span> Quét Nhanh Bằng Access Token
          </button>
        </div>

        {/* CHẾ ĐỘ 1: META OFFICIAL OAUTH DIALOG (Y HỆT ẢNH NGƯỜI DÙNG GỬI) */}
        {mode === "oauth" && (
          <div className="space-y-4 py-2 text-xs">
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 space-y-2 text-blue-200">
              <div className="font-bold text-white flex items-center gap-1.5">
                <span>📘 Cơ chế hoạt động (Giống hệt Nhanh.vn / Pancake):</span>
              </div>
              <p>• Khi bấm nút bên dưới, Facebook sẽ mở cửa sổ cấp quyền chính thức.</p>
              <p>• Bạn sẽ thấy danh sách toàn bộ Trang của bạn (<strong>Glucare PLUS, Dược Phẩm ADDP...</strong>) để tick chọn.</p>
              <p>• Bấm <strong>&quot;Tiếp tục&quot;</strong> và <strong>&quot;Lưu&quot;</strong>, Facebook sẽ tự động cấp quyền và đồng bộ vào CRM.</p>
            </div>

            <div className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <div className="text-slate-300 font-semibold">
                Thông tin App Facebook của công ty (Tùy chọn):
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Facebook App ID:</label>
                  <input
                    placeholder="Mặc định: ADDP Meta App"
                    value={appId}
                    onChange={(e) => setAppId(e.target.value)}
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-white font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">App Secret:</label>
                  <input
                    type="password"
                    placeholder="Nhập nếu có..."
                    value={appSecret}
                    onChange={(e) => setAppSecret(e.target.value)}
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-white font-mono text-xs"
                  />
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleOpenMetaOAuth}
              className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm py-3.5 transition flex items-center justify-center gap-2 shadow-lg"
            >
              <span>🌐</span> Mở Cửa Sổ Facebook Để Chọn Trang Ngay
            </button>
          </div>
        )}

        {/* CHẾ ĐỘ 2: QUÉT TRANG NHANH BẰNG GRAPH EXPLORER TOKEN */}
        {mode === "token" && (
          <div className="space-y-4 py-2">
            {pages.length === 0 ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 space-y-2 text-xs text-blue-200">
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <span>💡 2 Cách lấy Access Token trên Graph Explorer:</span>
                  </div>
                  <div className="space-y-1.5 text-[11px] leading-relaxed">
                    <p>
                      • <strong className="text-cyan-300">Cách 1 (Nhanh nhất - Lấy trực tiếp Token Trang):</strong> Mở{" "}
                      <a
                        href="https://developers.facebook.com/tools/explorer/"
                        target="_blank"
                        rel="noreferrer"
                        className="text-cyan-300 underline font-semibold"
                      >
                        Facebook Graph Explorer ↗
                      </a>
                      , tại mục <strong>&quot;User or Page&quot;</strong> (ở cột bên phải), chọn trực tiếp tên Fanpage của bạn (VD: <em>Glucare PLUS</em> hoặc <em>Dược Phẩm ADDP</em>) → Bấm <strong>&quot;Generate Access Token&quot;</strong> → Copy dán vào đây là hệ thống tự nhận Trang ngay!
                    </p>
                    <p>
                      • <strong className="text-cyan-300">Cách 2 (Quét toàn bộ danh sách Trang):</strong> Nếu chọn &quot;User Token&quot;, tại khung <strong>Permissions</strong> bên phải, bấm <strong>Add a Permission</strong> → chọn <strong>Events Groups Pages</strong> → tick chọn: <code className="bg-blue-900/60 px-1 py-0.5 rounded text-white font-mono">pages_show_list</code> và <code className="bg-blue-900/60 px-1 py-0.5 rounded text-white font-mono">pages_read_engagement</code> → rồi bấm <strong>&quot;Generate Access Token&quot;</strong>.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Mã User Access Token Facebook:
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Dán mã Token (bắt đầu bằng EAA...) vào đây để hệ thống hiển thị danh sách Trang..."
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
              /* Hiển thị danh sách Fanpage để người dùng tick chọn */
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
                    ← Quét lại mã khác
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
                    {connecting ? "Đang kết nối..." : "⚡ Cấp Quyền & Kết Nối Vào CRM"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
