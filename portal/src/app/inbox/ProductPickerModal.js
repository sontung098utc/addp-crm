"use client";

import { useState, useMemo, useEffect } from "react";
import { Search, Package, Send, Plus, Check, X, Tag } from "lucide-react";
import defaultProductList from "@/lib/productList.json";

/**
 * ADDP CRM — Bộ Chọn & Gửi Sản Phẩm Dược Phẩm ADDP / KiotViet (Vpage Style)
 * Cho phép nhân viên tư vấn chọn nhanh sản phẩm, chèn thông tin giá & công dụng
 * hoặc gửi trực tiếp cho khách hàng trong khung chat.
 */

export default function ProductPickerModal({
  isOpen,
  onClose,
  onSelectProduct,
  onSendProductDirect,
}) {
  const [products, setProducts] = useState(defaultProductList);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState(null);

  // Tải danh mục sản phẩm mới nhất kèm giá & tồn kho từ KiotViet
  useEffect(() => {
    if (isOpen) {
      fetch("/api/channels/kiotviet")
        .then((res) => res.json())
        .then((data) => {
          if (data.ok && Array.isArray(data.products) && data.products.length > 0) {
            setProducts(data.products);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q)
    );
  }, [products, searchQuery]);

  if (!isOpen) return null;

  const formatPrice = (val) => {
    return Number(val || 0).toLocaleString("vi-VN") + "đ";
  };

  const buildProductSnippet = (p) => {
    const priceStr = formatPrice(p.price);
    let desc = `[SẢN PHẨM] 🥛 ${p.name}\n• Mã SKU: ${p.sku}\n• Giá niêm yết: ${priceStr}`;
    if (p.unit) desc += ` / ${p.unit}`;
    if (p.onHand !== undefined) desc += ` (Sẵn kho: ${p.onHand})`;
    desc += `\n• Cam kết: Chính hãng 100% từ Dược Phẩm ADDP, tem niêm phong đầy đủ, kiểm tra trước khi thanh toán!`;
    return desc;
  };

  const handleInsert = (p) => {
    const snippet = buildProductSnippet(p);
    onSelectProduct(snippet);
    onClose();
  };

  const handleSend = (p) => {
    const snippet = buildProductSnippet(p);
    if (onSendProductDirect) {
      onSendProductDirect(snippet, p);
    } else {
      onSelectProduct(snippet);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Danh Mục Sản Phẩm Dược Phẩm ADDP & KiotViet
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Chọn sản phẩm để tư vấn hoặc gửi thông tin đơn giá cho khách hàng
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="p-3.5 border-b border-slate-200 dark:border-slate-800">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tên sản phẩm hoặc mã SKU (Glucare, Dovital, An Đường...)"
              className="w-full text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 pl-8 pr-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Product List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 min-h-[300px]">
          {filteredProducts.length === 0 ? (
            <div className="text-center py-12 text-xs text-slate-400">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
              Không tìm thấy sản phẩm nào phù hợp.
            </div>
          ) : (
            filteredProducts.map((p) => (
              <div
                key={p.id || p.sku}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 hover:border-emerald-500/60 dark:hover:border-emerald-500/60 transition-all shadow-2xs hover:shadow-sm flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0 font-bold text-xs">
                    🥛
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                      {p.name}
                    </h4>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded text-[10px]">
                        {p.sku}
                      </span>
                      <span>•</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                        {formatPrice(p.price)}
                      </span>
                      {p.onHand !== undefined && (
                        <>
                          <span>•</span>
                          <span className="text-slate-400">Kho: {p.onHand} {p.unit || ""}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleInsert(p)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    Chèn thông tin
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSend(p)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-colors inline-flex items-center gap-1 shadow-xs cursor-pointer badge-solid-white"
                  >
                    <span>Gửi</span>
                    <Send className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
