"use client";

import { useState } from "react";

/**
 * ADDP Omnichannel AI CRM — Modal Kết Nối Fanpage 1-Click (WBS-16 & WBS-17)
 * Tự động quét và hiển thị danh sách toàn bộ Fanpage mà người dùng quản lý
 * để chọn và cấp quyền truy cập vào CRM chỉ bằng 1 cú click.
 */

export default function FacebookConnectModal({ isOpen, onClose, onConnected }) {
  const [tokenInput, setTokenInput] = useState("");
  const [scanning, setScanning] = useState(false);
  const [pages, setPages] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [connecting, setConnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!isOpen) return null;

  // 1. Quét danh sách Fanpage
  const handleScanPages = async (tokenToUse) => {
    const token = tokenToUse || tokenInput.trim();
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
        // Mặc định chọn tất cả Page tìm thấy
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

  // 2. Kết nối các Fanpage đã chọn
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
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white font-bold text-sm shadow">
              f
            </span>
            <div>
              <h3 className="text-base font-bold text-white">Kết Nối Fanpage Facebook 1-Click</h3>
              <p className="text-xs text-slate-400">
                Tự động quét danh sách Fanpage và cấp quyền vào CRM
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-base">
            ✕
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs">
            {errorMsg}
          </div>
        )}

        {/* Bước 1: Nhập Token để Quét Page (hoặc mở Graph Explorer 1-click) */}
        {pages.length === 0 ? (
          <div className="space-y-4 py-2">
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 space-y-2 text-xs text-blue-200">
              <div className="font-bold text-white flex items-center gap-1.5">
                <span>💡 Cách lấy danh sách Fanpage nhanh nhất (15 giây):</span>
              </div>
              <p>1. Bấm vào liên kết: <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer" className="text-cyan-300 underline font-semibold">Mở Facebook Graph Explorer ↗</a></p>
              <p>2. Bấm nút <strong>&quot;Generate Access Token&quot;</strong> (cho phép quyền <em>pages_show_list, pages_messaging</em>).</p>
              <p>3. Dán mã Token vào ô bên dưới và bấm <strong>&quot;Quét Danh Sách Fanpage&quot;</strong>.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Mã Access Token Facebook của bạn:
              </label>
              <textarea
                rows={3}
                placeholder="Dán mã Token (bắt đầu bằng EAA...) vào đây để quét tự động..."
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none font-mono"
              />
            </div>

            <button
              type="button"
              onClick={() => handleScanPages()}
              disabled={scanning || !tokenInput.trim()}
              className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs py-3 transition flex items-center justify-center gap-2 shadow"
            >
              {scanning ? (
                <>
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Đang quét danh sách Fanpage từ Meta Graph API...
                </>
              ) : (
                <>🔍 Quét Danh Sách Fanpage Của Tôi</>
              )}
            </button>
          </div>
        ) : (
          /* Bước 2: Hiển thị danh sách Fanpage quét được để người dùng click chọn */
          <div className="flex-1 flex flex-col space-y-4 overflow-hidden">
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

            <div className="flex-1 overflow-y-auto space-y-2.5 max-h-72 pr-1">
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

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400">
                Đã chọn: <strong className="text-white">{selectedIds.size}</strong> Fanpage
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleConnectSelected}
                  disabled={connecting || selectedIds.size === 0}
                  className="rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-5 py-2 font-bold transition flex items-center gap-1.5"
                >
                  {connecting ? (
                    <>
                      <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Đang cấp quyền...
                    </>
                  ) : (
                    <>⚡ Cấp Quyền & Kết Nối Vào CRM</>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
