"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ShoppingCart,
  ExternalLink,
  Copy,
  Check,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Key,
  Globe,
  RefreshCw,
  X,
  HelpCircle,
} from "lucide-react";

export default function ShopeeConnectModal({ isOpen, onClose, onConnected }) {
  const [partnerId, setPartnerId] = useState("1253327");
  const [partnerKey, setPartnerKey] = useState("");
  const [isSandbox, setIsSandbox] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authUrl, setAuthUrl] = useState("");
  const [copiedKey, setCopiedKey] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const copyToClipboard = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleGenerateAuthUrl = async (autoRedirect = false) => {
    if (!partnerId.trim() || !partnerKey.trim()) {
      setErrorMsg("Vui lòng nhập đầy đủ Partner ID và Partner Key từ Shopee Console.");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      const qs = new URLSearchParams({
        partner_id: partnerId.trim(),
        partner_key: partnerKey.trim(),
        sandbox: isSandbox ? "true" : "false",
        format: "json",
      });

      const res = await fetch(`/api/channels/shopee/oauth/start?${qs.toString()}`);
      const data = await res.json();

      if (data?.ok && data?.authUrl) {
        setAuthUrl(data.authUrl);
        if (autoRedirect) {
          window.location.href = data.authUrl;
        }
      } else {
        setErrorMsg(data?.message || data?.error || "Không thể tạo liên kết ủy quyền Shopee.");
      }
    } catch (err) {
      setErrorMsg(err?.message || "Lỗi kết nối tới hệ thống máy chủ.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="relative w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 text-white overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-orange-500/20 text-orange-400">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">Kết Nối Shopee Open API v2 (1-Click)</h2>
              <p className="text-xs text-slate-400">
                Tự động lấy Refresh Token & đồng bộ đơn hàng từ Shopee sang CRM
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="py-4 space-y-4 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs leading-relaxed space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
              <span>Làm sao để có mã Refresh Token Shopee?</span>
            </div>
            <p>
              Shopee <strong>không cấp sẵn chuỗi Refresh Token tĩnh</strong> trên Console. Thay vào đó, sau khi nhập Partner ID & Key bên dưới và bấm nút <strong>"Ủy Quyền 1-Click"</strong>, hệ thống sẽ mở trang đăng nhập Shopee của bạn. Khi bạn bấm <em>"Xác nhận ủy quyền"</em>, Shopee sẽ <strong>tự động cấp Refresh Token và kết nối ngay vào CRM</strong>.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Partner ID (Shopee Open Platform)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={partnerId}
                  onChange={(e) => setPartnerId(e.target.value)}
                  placeholder="Ví dụ: 1253327"
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3.5 py-2.5 text-sm text-white font-mono focus:border-orange-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Partner Key (Mã bí mật từ Shopee Console)
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={partnerKey}
                  onChange={(e) => setPartnerKey(e.target.value)}
                  placeholder="Nhập hoặc dán Partner Key..."
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3.5 py-2.5 text-sm text-white font-mono focus:border-orange-500 focus:outline-hidden"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Lấy tại mục <strong>APP Key &gt; API Partner Key</strong> trên trang Shopee Console của bạn.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="shopee_sandbox"
                checked={isSandbox}
                onChange={(e) => setIsSandbox(e.target.checked)}
                className="rounded border-slate-700 bg-slate-950 text-orange-500 focus:ring-orange-500"
              />
              <label htmlFor="shopee_sandbox" className="text-xs text-slate-300 cursor-pointer">
                Sử dụng môi trường Test (Sandbox)
              </label>
            </div>
          </div>

          {/* Webhook & Callback info */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
            <div className="font-semibold text-slate-300">Đường dẫn cấu hình trên Shopee Console:</div>
            
            <div className="flex items-center justify-between gap-2 bg-slate-900 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-400 font-medium">Redirect URL:</span>
              <code className="text-cyan-300 text-[11px] truncate flex-1 text-right">
                https://crm.addp.vn/api/channels/shopee/callback
              </code>
              <button
                type="button"
                onClick={() => copyToClipboard("https://crm.addp.vn/api/channels/shopee/callback", "redirect")}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                title="Sao chép"
              >
                {copiedKey === "redirect" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 bg-slate-900 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-400 font-medium">Webhook URL:</span>
              <code className="text-cyan-300 text-[11px] truncate flex-1 text-right">
                https://crm.addp.vn/api/webhooks/shopee
              </code>
              <button
                type="button"
                onClick={() => copyToClipboard("https://crm.addp.vn/api/webhooks/shopee", "webhook")}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                title="Sao chép"
              >
                {copiedKey === "webhook" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
          >
            Đóng
          </button>

          <button
            type="button"
            onClick={() => handleGenerateAuthUrl(true)}
            disabled={loading || !partnerId.trim() || !partnerKey.trim()}
            className="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-lg shadow-orange-600/25"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <ExternalLink className="w-4 h-4" />
            )}
            <span>Mở Cửa Sổ Ủy Quyền Shopee 1-Click</span>
          </button>
        </div>
      </div>
    </div>
  );
}
