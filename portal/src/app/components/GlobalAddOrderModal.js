"use client";

import { useState, useEffect, useMemo } from "react";
import defaultProductList from "@/lib/productList.json";
import { normalizePhone, isValidVietnamPhone } from "@/lib/phone";

export default function GlobalAddOrderModal({ isOpen, onClose, onSuccess }) {
  const [phone, setPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [address, setAddress] = useState("");
  const [matchedCustomer, setMatchedCustomer] = useState(null);
  const [lookingUp, setLookingUp] = useState(false);

  const [products, setProducts] = useState(defaultProductList);
  const [selectedProductId, setSelectedProductId] = useState(
    defaultProductList[0]?.id ? String(defaultProductList[0].id) : ""
  );
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(
    defaultProductList[0]?.price ? Number(defaultProductList[0].price) : 0
  );
  const [orderItems, setOrderItems] = useState([]);

  const [discount, setDiscount] = useState(0);
  const [note, setNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [targetPlatform, setTargetPlatform] = useState("KIOTVIET");
  const [branchId, setBranchId] = useState(1);
  const [branches, setBranches] = useState([
    { id: 1, branchName: "Kho Tổng Dược Phẩm ADDP" },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Nạp danh sách sản phẩm / chi nhánh khi mở modal
  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg("");
    setSuccessMsg("");

    fetch("/api/channels/kiotviet")
      .then((r) => r.json())
      .then((data) => {
        if (data?.ok) {
          if (Array.isArray(data.products) && data.products.length > 0) {
            setProducts(data.products);
            setSelectedProductId(String(data.products[0].id));
            setUnitPrice(Number(data.products[0].price) || 0);
          }
          if (Array.isArray(data.branches) && data.branches.length > 0) {
            setBranches(data.branches);
            const matchedBranch = data.branches.find(
              (b) => Number(b.id) === Number(data.config?.branchId)
            );
            setBranchId(matchedBranch ? matchedBranch.id : data.branches[0].id);
          }
        }
      })
      .catch(() => {});
  }, [isOpen]);

  // Tự động tra cứu khách hàng theo SĐT chuẩn hóa
  useEffect(() => {
    if (!isOpen) return;
    const norm = normalizePhone(phone);
    if (!isValidVietnamPhone(norm)) {
      setMatchedCustomer(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        setLookingUp(true);
        const res = await fetch(`/api/customers?search=${encodeURIComponent(norm)}`);
        const data = await res.json();
        if (cancelled) return;
        const list = Array.isArray(data?.customers) ? data.customers : [];
        const exact = list.find((c) => normalizePhone(c.phone) === norm) || list[0] || null;
        setMatchedCustomer(exact);
        if (exact) {
          setCustomerName(exact.fullName || exact.name || "");
          if (exact.address) setAddress(exact.address);
        }
      } catch {
        if (!cancelled) setMatchedCustomer(null);
      } finally {
        if (!cancelled) setLookingUp(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [phone, isOpen]);

  const selectedProduct = useMemo(
    () => products.find((p) => String(p.id) === String(selectedProductId)) || products[0] || null,
    [products, selectedProductId]
  );

  const handleProductChange = (pid) => {
    setSelectedProductId(pid);
    const found = products.find((p) => String(p.id) === String(pid));
    if (found) {
      setUnitPrice(Number(found.price) || 0);
    }
  };

  const handleAddItem = () => {
    if (!selectedProduct) return;
    const qty = Math.max(1, Number(quantity) || 1);
    const price = Math.max(0, Number(unitPrice) || 0);

    setOrderItems((prev) => {
      const idx = prev.findIndex((it) => String(it.id) === String(selectedProduct.id) && it.price === price);
      if (idx >= 0) {
        const next = [...prev];
        const newQty = next[idx].quantity + qty;
        next[idx] = { ...next[idx], quantity: newQty, subtotal: newQty * price };
        return next;
      }
      return [
        ...prev,
        {
          id: selectedProduct.id,
          kiotProductId: selectedProduct.kiotProductId || null,
          name: selectedProduct.name,
          sku: selectedProduct.sku,
          price,
          quantity: qty,
          subtotal: qty * price,
        },
      ];
    });
  };

  const handleRemoveItem = (idx) => {
    setOrderItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // Nếu chưa bấm "Thêm vào đơn", tự lấy sản phẩm đang chọn làm item mặc định
  const effectiveItems = useMemo(() => {
    if (orderItems.length > 0) return orderItems;
    if (!selectedProduct) return [];
    const qty = Math.max(1, Number(quantity) || 1);
    const price = Math.max(0, Number(unitPrice) || 0);
    return [
      {
        id: selectedProduct.id,
        kiotProductId: selectedProduct.kiotProductId || null,
        name: selectedProduct.name,
        sku: selectedProduct.sku,
        price,
        quantity: qty,
        subtotal: qty * price,
      },
    ];
  }, [orderItems, selectedProduct, quantity, unitPrice]);

  const subtotal = useMemo(
    () => effectiveItems.reduce((sum, it) => sum + Number(it.subtotal || it.price * it.quantity || 0), 0),
    [effectiveItems]
  );
  const finalAmount = Math.max(0, subtotal - (Number(discount) || 0));

  if (!isOpen) return null;

  const resetForm = () => {
    setPhone("");
    setCustomerName("");
    setAddress("");
    setMatchedCustomer(null);
    setOrderItems([]);
    setQuantity(1);
    setDiscount(0);
    setNote("");
    setErrorMsg("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    const normPhone = normalizePhone(phone);
    if (!isValidVietnamPhone(normPhone)) {
      setErrorMsg("Vui lòng nhập số điện thoại chuẩn 10 số Việt Nam (VD: 0912345678).");
      return;
    }

    if (!customerName.trim()) {
      setErrorMsg("Vui lòng nhập họ tên khách hàng.");
      return;
    }

    if (effectiveItems.length === 0) {
      setErrorMsg("Vui lòng chọn ít nhất 1 sản phẩm hoặc combo.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customerName.trim(),
          phone: normPhone,
          address: address.trim(),
          channel: matchedCustomer?.source || "ZALO_PERSONAL",
          items: effectiveItems,
          totalAmount: subtotal,
          discount: Number(discount) || 0,
          finalAmount,
          note: note.trim(),
          targetPlatform,
          branchId: Number(branchId) || 1,
          paymentMethod,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Không thể tạo đơn hàng.");
      }

      setSuccessMsg(data.message || `Đã tạo đơn ${data.order?.orderCode || ""} thành công!`);
      if (onSuccess) onSuccess(data.order);
      setTimeout(() => {
        resetForm();
        setSuccessMsg("");
        onClose();
      }, 900);
    } catch (err) {
      setErrorMsg(err.message || "Lỗi kết nối khi tạo đơn hàng.");
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
              <span>🛒 Lên Đơn Hàng Nhanh Toàn Cục</span>
              <span className="rounded bg-emerald-500/20 text-emerald-400 text-[11px] font-semibold px-2 py-0.5">
                ADDP CRM
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Nhập SĐT để tự động tra cứu khách hàng, chọn sản phẩm/combo và đẩy đơn ngay
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {errorMsg && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-400">
              ⚠️ {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="rounded-xl bg-emerald-500/15 border border-emerald-500/30 p-3 text-xs text-emerald-300 font-semibold">
              ✓ {successMsg}
            </div>
          )}

          {/* Thông tin khách hàng + Tra cứu SĐT */}
          <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] text-slate-300 font-semibold block">
                  Số điện thoại khách hàng (10 số) *
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="VD: 0912345678"
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs font-mono text-emerald-400 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
                <div className="text-[11px] min-h-4">
                  {lookingUp && <span className="text-blue-400">Đang tra cứu hồ sơ khách hàng...</span>}
                  {!lookingUp && matchedCustomer && (
                    <span className="text-emerald-400 font-semibold">
                      ✓ Đã tìm thấy: {matchedCustomer.fullName} ({matchedCustomer.code || "CRM"})
                    </span>
                  )}
                  {!lookingUp && !matchedCustomer && isValidVietnamPhone(normalizePhone(phone)) && (
                    <span className="text-amber-400">
                      Khách mới — hệ thống sẽ tự tạo hồ sơ 360 khi lên đơn
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-300 font-semibold block">
                  Họ tên khách hàng *
                </label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Nhập họ tên khách hàng..."
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-slate-300 font-semibold block">
                Địa chỉ giao hàng
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/TP..."
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Chọn sản phẩm / combo, số lượng, giá */}
          <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white">📦 Chọn Sản Phẩm / Combo</span>
              <button
                type="button"
                onClick={handleAddItem}
                className="rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 px-2.5 py-1 text-[11px] font-semibold text-blue-300 transition cursor-pointer"
              >
                + Thêm vào danh sách
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
              <div className="sm:col-span-6 space-y-1">
                <label className="text-[11px] text-slate-400 block">Sản phẩm / Combo</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => handleProductChange(e.target.value)}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                >
                  {products.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.name} ({p.sku}) - {Number(p.price || 0).toLocaleString("vi-VN")}đ
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="text-[11px] text-slate-400 block">Số lượng</label>
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-4 space-y-1">
                <label className="text-[11px] text-slate-400 block">Đơn giá (VNĐ)</label>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-emerald-400 font-semibold focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {orderItems.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-slate-800">
                <span className="text-[11px] text-slate-400 font-semibold">Danh sách sản phẩm trong đơn:</span>
                {orderItems.map((it, idx) => (
                  <div
                    key={`${it.id}_${idx}`}
                    className="flex items-center justify-between rounded-lg bg-slate-900 border border-slate-800 px-3 py-1.5 text-xs"
                  >
                    <div className="truncate pr-2">
                      <span className="text-white font-medium">{it.name}</span>
                      <span className="text-slate-400 ml-2">x{it.quantity}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-emerald-400 font-semibold">
                        {Number(it.subtotal).toLocaleString("vi-VN")} đ
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="text-rose-400 hover:text-rose-300 cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Thanh toán, Chiết khấu & Ghi chú */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] text-slate-300 font-semibold block">Giảm giá (VNĐ)</label>
              <input
                type="number"
                min={0}
                step={1000}
                value={discount}
                onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-slate-300 font-semibold block">Thanh toán</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="Cash">COD / Tiền mặt</option>
                <option value="Transfer">Chuyển khoản</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-slate-300 font-semibold block">Đẩy đơn sang</label>
              <select
                value={targetPlatform}
                onChange={(e) => setTargetPlatform(e.target.value)}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="KIOTVIET">KiotViet POS ({branches[0]?.branchName || "Kho tổng"})</option>
                <option value="CRM_ONLY">Chỉ lưu trên CRM</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-slate-300 font-semibold block">Ghi chú đơn hàng</label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: Giao giờ hành chính, tặng kèm cốc chia vạch..."
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Tổng kết & Nút Submit */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-800">
            <div className="text-xs">
              <span className="text-slate-400">Tổng thanh toán: </span>
              <span className="text-base font-bold text-emerald-400">
                {finalAmount.toLocaleString("vi-VN")} đ
              </span>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
              >
                Đóng
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-500 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-600/25 disabled:opacity-50 cursor-pointer"
              >
                {submitting ? "Đang tạo đơn..." : "✓ Xác Nhận Lên Đơn"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
