"use client";

import { useState, useEffect, useMemo } from "react";
import defaultProductList from "@/lib/productList.json";
import { normalizePhone, isValidVietnamPhone } from "@/lib/phone";

export default function QuickOrderModal({ isOpen, onClose, customer, onSuccess }) {
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedItems, setSelectedItems] = useState({});
  const [address, setAddress] = useState("");
  const [discount, setDiscount] = useState(0);
  const [note, setNote] = useState("");
  const [targetPlatform, setTargetPlatform] = useState("KIOTVIET");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [branchId, setBranchId] = useState(1);
  const [branches, setBranches] = useState([
    { id: 1, branchName: "Kho Tổng Dược Phẩm ADDP" },
  ]);
  const [products, setProducts] = useState(defaultProductList);
  const [searchProduct, setSearchProduct] = useState("");
  const [syncingProducts, setSyncingProducts] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (isOpen) {
      setCustomerName(customer?.fullName || customer?.name || "");
      const candidatePhone = customer?.phone ? normalizePhone(customer.phone) : "";
      setPhone(isValidVietnamPhone(candidatePhone) ? candidatePhone : "");
      setAddress(customer?.address || "");
      setErrorMsg("");

      // Tải danh sách sản phẩm kèm tồn kho thực tế & chi nhánh từ KiotViet Connector
      fetch("/api/channels/kiotviet")
        .then((r) => r.json())
        .then((data) => {
          if (data.ok) {
            if (Array.isArray(data.products) && data.products.length > 0) {
              setProducts(data.products);
            }
            if (Array.isArray(data.branches) && data.branches.length > 0) {
              setBranches(data.branches);
              setBranchId(data.config?.branchId || data.branches[0].id || 1);
            }
          }
        })
        .catch(() => {});
    }
  }, [isOpen, customer]);

  const filteredProducts = useMemo(() => {
    const q = searchProduct.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q)
    );
  }, [products, searchProduct]);

  if (!isOpen) return null;

  const handleSyncKiotVietCatalog = async () => {
    try {
      setSyncingProducts(true);
      const res = await fetch("/api/channels/kiotviet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SYNC_PRODUCTS" }),
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.products)) {
        setProducts(data.products);
      }
    } catch {} finally {
      setSyncingProducts(false);
    }
  };

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
      const p = products.find((item) => String(item.id) === String(pid));
      return sum + (p ? Number(p.price) * qty : 0);
    }, 0);
  };

  const subtotal = calculateSubtotal();
  const finalAmount = Math.max(0, subtotal - Number(discount || 0));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    const items = Object.entries(selectedItems)
      .map(([pid, qty]) => {
        const p = products.find((item) => String(item.id) === String(pid));
        return p
          ? {
              id: p.id,
              kiotProductId: p.kiotProductId || null,
              name: p.name,
              sku: p.sku,
              price: Number(p.price) || 0,
              quantity: qty,
              subtotal: (Number(p.price) || 0) * qty,
            }
          : null;
      })
      .filter(Boolean);

    const normalizedPhone = normalizePhone(phone);
    if (!isValidVietnamPhone(normalizedPhone)) {
      setErrorMsg(
        "Vui lòng nhập số điện thoại khách hàng chuẩn 10 số Việt Nam (VD: 0912345678)."
      );
      return;
    }

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
          customerName:
            customerName.trim() || customer?.name || "Khách hàng ADDP",
          phone: normalizedPhone,
          address,
          channel: customer?.channel || "ZALO_PERSONAL",
          items,
          totalAmount: subtotal,
          discount: Number(discount) || 0,
          finalAmount,
          note,
          targetPlatform,
          branchId: Number(branchId) || 1,
          paymentMethod,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Không thể tạo đơn hàng.");
      }

      setSelectedItems({});
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
      <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-950">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>🛒 Lên Đơn Hàng Nhanh & Đẩy KiotViet POS</span>
              <span className="rounded bg-blue-500/20 text-blue-400 text-[11px] font-semibold px-2 py-0.5">
                WBS-39
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Tự động đẩy đơn sang KiotViet Open API, trừ tồn kho Combo và sinh 7 mốc CarePlan sau bán
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {errorMsg && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-400">
              ⚠️ {errorMsg}
            </div>
          )}

          {/* Customer Info Card */}
          <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3.5 space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-[11px] text-slate-400 font-medium">
                  Họ tên khách hàng *:
                </label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Nhập họ tên khách hàng..."
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-slate-400 font-medium">
                  Số điện thoại định danh (10 số) *:
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="VD: 0912345678"
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs font-mono text-blue-400 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="space-y-1 pt-0.5">
              <label className="text-[11px] text-slate-400 font-medium">
                Địa chỉ giao hàng:
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Số nhà, ngõ/đường, Phường/Xã, Quận/Huyện, Tỉnh/TP..."
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Product Selector + Real-time Stock */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Chọn Sản Phẩm & Tồn Kho KiotViet ({products.length} SKU):
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={searchProduct}
                  onChange={(e) => setSearchProduct(e.target.value)}
                  placeholder="Tìm nhanh mã SKU, Glucare, Dovital..."
                  className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleSyncKiotVietCatalog}
                  disabled={syncingProducts}
                  className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 transition cursor-pointer"
                >
                  {syncingProducts ? "Đang đồng bộ..." : "🔄 Đồng bộ Tồn kho"}
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {filteredProducts.map((p) => {
                const qty = selectedItems[p.id] || 0;
                const onHand = typeof p.onHand === "number" ? p.onHand : 100;
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
                      <div className="text-xs font-bold text-slate-200 flex items-center gap-2">
                        <span>{p.name}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${
                            onHand > 10
                              ? "bg-emerald-500/15 text-emerald-300"
                              : "bg-amber-500/20 text-amber-300"
                          }`}
                        >
                          Tồn: {onHand} {p.unit || "sp"}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        SKU: <span className="font-mono text-slate-300">{p.sku}</span> •{" "}
                        <strong className="text-emerald-400">
                          {Number(p.price || 0).toLocaleString("vi-VN")} đ
                        </strong>{" "}
                        /{p.unit || "Hộp"}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleQtyChange(p.id, -1)}
                        disabled={qty === 0}
                        className="h-7 w-7 rounded-lg bg-slate-800 text-slate-300 disabled:opacity-30 hover:bg-slate-700 flex items-center justify-center font-bold text-xs cursor-pointer"
                      >
                        -
                      </button>
                      <span className="w-6 text-center text-xs font-bold text-white">
                        {qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleQtyChange(p.id, 1)}
                        className="h-7 w-7 rounded-lg bg-blue-600 text-white hover:bg-blue-500 flex items-center justify-center font-bold text-xs cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* KiotViet Branch, Payment Method & Target */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div>
              <label className="text-[11px] text-slate-400 font-medium">
                Chi nhánh xuất kho KiotViet:
              </label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(Number(e.target.value))}
                className="w-full mt-1 rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.branchName} (#{b.id})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] text-slate-400 font-medium">
                Phương thức thanh toán:
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full mt-1 rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="Cash">COD / Tiền mặt (Cash)</option>
                <option value="Transfer">Chuyển khoản (Transfer)</option>
                <option value="Card">Thẻ (Card)</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] text-slate-400 font-medium">
                Đẩy đồng bộ sang:
              </label>
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

          {/* Discount & Note */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] text-slate-400 font-medium">
                Giảm giá / Chiết khấu (đ):
              </label>
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

            <div className="sm:col-span-2">
              <label className="text-[11px] text-slate-400 font-medium">
                Ghi chú đơn hàng (Description gửi KiotViet):
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="VD: Đơn hàng tạo từ ADDP CRM qua Zalo/Fanpage, giao giờ hành chính..."
                className="w-full mt-1 rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Totals Summary */}
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-3.5 space-y-1.5">
            <div className="flex justify-between text-xs text-slate-400">
              <span>
                Tạm tính ({Object.values(selectedItems).reduce((a, b) => a + b, 0)} sp):
              </span>
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
              <span>Tổng thanh toán:</span>
              <span className="text-emerald-400 font-mono text-base">
                {finalAmount.toLocaleString("vi-VN")} đ
              </span>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-semibold transition cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-blue-900/40 transition flex items-center gap-1.5 cursor-pointer"
            >
              {submitting ? (
                <span>Đang đẩy đơn sang KiotViet...</span>
              ) : (
                <>
                  <span>✓ Chốt Đơn & Đẩy KiotViet + Sinh 7 Mốc CarePlan</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
