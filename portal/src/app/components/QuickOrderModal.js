"use client";

import { useState } from "react";
import productList from "@/lib/productList.json";

export default function QuickOrderModal({ isOpen, onClose, customer, onSuccess }) {
  const [selectedItems, setSelectedItems] = useState({});
  const [address, setAddress] = useState("");
  const [discount, setDiscount] = useState(0);
  const [note, setNote] = useState("");
  const [targetPlatform, setTargetPlatform] = useState("KIOTVIET");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!isOpen) return null;

  const handleQtyChange = (productId, delta) => {
    setSelectedItems((prev) => {
      const current = prev[productId] || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      }
      return { ...prev, [productId]: next };
    });
  };

  const calculateSubtotal = () => {
    return Object.entries(selectedItems).reduce((sum, [pid, qty]) => {
      const p = productList.find((item) => item.id === pid);
      return sum + (p ? p.price * qty : 0);
    }, 0);
  };

  const subtotal = calculateSubtotal();
  const finalAmount = Math.max(0, subtotal - Number(discount || 0));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    const items = Object.entries(selectedItems)
      .map(([pid, qty]) => {
        const p = productList.find((item) => item.id === pid);
        return p
          ? {
              id: p.id,
              name: p.name,
              sku: p.sku,
              price: p.price,
              quantity: qty,
              subtotal: p.price * qty,
            }
          : null;
      })
      .filter(Boolean);

    if (items.length === 0) {
      setErrorMsg("Vui lòng chọn ít nhất 1 sản phẩm vào đơn hàng.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customer?.name || "Khách Zalo",
          phone: customer?.phone || customer?.id || "",
          address,
          channel: "ZALO_PERSONAL",
          items,
          totalAmount: subtotal,
          discount: Number(discount) || 0,
          finalAmount,
          note,
          targetPlatform,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Không thể tạo đơn hàng.");
      }

      if (onSuccess) onSuccess(data.order);
      onClose();
    } catch (err) {
      setErrorMsg(err.message || "Lỗi khi tạo đơn hàng.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-950">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>🛒 Lên Đơn Hàng Nhanh Trong Chat</span>
              <span className="rounded bg-blue-500/20 text-blue-400 text-[11px] font-semibold px-2 py-0.5">
                WBS-39
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Đẩy đơn trực tiếp sang KiotViet POS & Website Magento 2.4.8 (ADDP.vn)
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMsg && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-400">
              ⚠️ {errorMsg}
            </div>
          )}

          {/* Customer Info Card */}
          <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Khách hàng:</span>
              <span className="font-bold text-white">{customer?.name || "Khách Zalo"}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Số điện thoại định danh:</span>
              <span className="font-mono font-bold text-blue-400">
                {customer?.phone || customer?.id || "Chưa có SĐT"}
              </span>
            </div>
            <div className="space-y-1 pt-1">
              <label className="text-[11px] text-slate-400 font-medium">Địa chỉ giao hàng:</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Số nhà, ngõ/đường, Phường/Xã, Quận/Huyện, Tỉnh/TP..."
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Product Selector */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Chọn Sản Phẩm ADDP ({productList.length} sản phẩm thực tế):
            </label>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {productList.map((p) => {
                const qty = selectedItems[p.id] || 0;
                return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between p-2.5 rounded-xl border transition ${
                      qty > 0
                        ? "bg-blue-600/10 border-blue-500/40"
                        : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex-1 pr-3">
                      <div className="text-xs font-bold text-slate-200">{p.name}</div>
                      <div className="text-[11px] text-slate-400">
                        {p.sku} •{" "}
                        <strong className="text-emerald-400">
                          {p.price.toLocaleString("vi-VN")} đ
                        </strong>{" "}
                        /{p.unit}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleQtyChange(p.id, -1)}
                        disabled={qty === 0}
                        className="h-7 w-7 rounded-lg bg-slate-800 text-slate-300 disabled:opacity-30 hover:bg-slate-700 flex items-center justify-center font-bold text-xs"
                      >
                        -
                      </button>
                      <span className="w-6 text-center text-xs font-bold text-white">
                        {qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleQtyChange(p.id, 1)}
                        className="h-7 w-7 rounded-lg bg-blue-600 text-white hover:bg-blue-500 flex items-center justify-center font-bold text-xs"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pricing & Target */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <label className="text-[11px] text-slate-400 font-medium">Giảm giá / Chiết khấu (đ):</label>
              <input
                type="number"
                min="0"
                step="1000"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                placeholder="0"
                className="w-full mt-1 rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[11px] text-slate-400 font-medium">Đẩy đồng bộ sang:</label>
              <select
                value={targetPlatform}
                onChange={(e) => setTargetPlatform(e.target.value)}
                className="w-full mt-1 rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="KIOTVIET">KiotViet POS (Kho hàng)</option>
                <option value="MAGENTO">Website Magento 2.4.8 (ADDP.vn)</option>
                <option value="ALL">Cả 2 nền tảng (KiotViet + Magento)</option>
              </select>
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="text-[11px] text-slate-400 font-medium">Ghi chú đơn hàng:</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: Khách dặn giao buổi chiều, gọi trước khi giao..."
              className="w-full mt-1 rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Totals Summary */}
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-3.5 space-y-1.5">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Tạm tính ({Object.values(selectedItems).reduce((a, b) => a + b, 0)} sp):</span>
              <span className="font-medium text-slate-200">
                {subtotal.toLocaleString("vi-VN")} đ
              </span>
            </div>
            {Number(discount) > 0 && (
              <div className="flex justify-between text-xs text-rose-400">
                <span>Giảm giá / Ưu đãi:</span>
                <span>-{Number(discount).toLocaleString("vi-VN")} đ</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold text-white pt-1 border-t border-slate-800">
              <span>Tổng thanh toán (COD):</span>
              <span className="text-emerald-400 font-mono text-base">
                {finalAmount.toLocaleString("vi-VN")} đ
              </span>
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="border-t border-slate-800 px-6 py-3.5 bg-slate-950 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            Hủy Bỏ
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || subtotal <= 0}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-900/30 transition"
          >
            {submitting ? (
              <>
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Đang đẩy đơn...</span>
              </>
            ) : (
              <>
                <span>🚀 Xác Nhận & Đẩy Đơn Hàng</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
