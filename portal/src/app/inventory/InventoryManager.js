"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

/**
 * ADDP Omnichannel AI CRM — Giao Diện Kho Combo, Hàng Đóng Sẵn & Ánh Xạ SKU (WBS-41 & WBS-42)
 * Kế thừa nghiệp vụ cốt lõi từ C:\AH-Trabi\quan-ly-kho (index.php, dong_san_view.php, channels_view.php)
 */

export default function InventoryManager() {
  const [activeTab, setActiveTab] = useState("combos"); // 'combos' | 'prepack' | 'mapping'
  const [products, setProducts] = useState([]);
  const [skuMappings, setSkuMappings] = useState([]);
  const [unmappedSkus, setUnmappedSkus] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Bộ kiểm thử giải mã Combo trực tiếp (Interactive Combo Tester)
  const [testSku, setTestSku] = useState("COMBO-2GLU-1DOV");
  const [testQty, setTestQty] = useState(2);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  // Modal tạo / sửa Combo
  const [isComboModalOpen, setIsComboModalOpen] = useState(false);
  const [comboForm, setComboForm] = useState({
    code: "",
    name: "",
    unit: "Combo",
    retailPrice: "",
    costPrice: "",
    comboFormula: "",
    stockQuantity: 0,
    prepackedQuantity: 0,
  });

  // Modal liên kết SKU
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [mapForm, setMapForm] = useState({
    platform: "TIKTOK_SHOP",
    platformSkuId: "",
    sellerSku: "",
    platformProductName: "",
    shopName: "Dược Phẩm ADDP Official",
    localItemCode: "",
  });

  // Bộ lọc nền tảng SKU
  const [platformFilter, setPlatformFilter] = useState("ALL");

  // Nạp toàn bộ dữ liệu ban đầu
  const loadAllData = async () => {
    try {
      setLoading(true);
      const [resCombos, resMaps, resPrepack] = await Promise.all([
        fetch("/api/inventory/combos"),
        fetch("/api/inventory/sku-mappings"),
        fetch("/api/inventory/prepack"),
      ]);

      const dataCombos = await resCombos.json();
      const dataMaps = await resMaps.json();
      const dataPrepack = await resPrepack.json();

      if (dataCombos.ok) setProducts(dataCombos.products || []);
      if (dataMaps.ok) {
        setSkuMappings(dataMaps.mappings || []);
        setUnmappedSkus(dataMaps.unmapped || []);
      }
      if (dataPrepack.ok) setLogs(dataPrepack.logs || []);
    } catch (err) {
      console.error("Lỗi nạp dữ liệu kho:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Chạy kiểm thử giải mã Combo
  const handleTestCombo = async (e) => {
    if (e) e.preventDefault();
    if (!testSku.trim()) return;
    try {
      setTesting(true);
      const res = await fetch("/api/inventory/resolve-combo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: testSku.trim(), quantity: Number(testQty) || 1 }),
      });
      const data = await res.json();
      if (data.ok) {
        setTestResult(data);
      } else {
        setToast({ type: "error", text: data.error || "Không thể phân rã mã này." });
      }
    } catch {
      setToast({ type: "error", text: "Lỗi kết nối khi thử nghiệm phân rã." });
    } finally {
      setTesting(false);
    }
  };

  // Cập nhật số lượng đóng sẵn (+/-)
  const handleAdjustPrepack = async (itemCode, prepackDelta) => {
    try {
      const res = await fetch("/api/inventory/prepack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemCode, prepackDelta, note: "Điều chỉnh nhanh qua nút bấm" }),
      });
      const data = await res.json();
      if (data.ok) {
        setProducts((prev) =>
          prev.map((p) => (p.code === itemCode ? { ...p, prepackedQuantity: data.product.prepackedQuantity } : p))
        );
        setToast({ type: "success", text: `Đã cập nhật đóng sẵn cho ${itemCode} (${prepackDelta > 0 ? "+" : ""}${prepackDelta}).` });
      }
    } catch {
      setToast({ type: "error", text: "Lỗi cập nhật hàng đóng sẵn." });
    }
  };

  // Lưu combo mới / sửa
  const handleSaveCombo = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/inventory/combos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(comboForm),
      });
      const data = await res.json();
      if (data.ok) {
        setToast({ type: "success", text: "Đã lưu sản phẩm/combo thành công!" });
        setIsComboModalOpen(false);
        loadAllData();
      } else {
        setToast({ type: "error", text: data.error || "Không thể lưu combo." });
      }
    } catch {
      setToast({ type: "error", text: "Lỗi kết nối." });
    }
  };

  // Lưu liên kết SKU
  const handleSaveMapping = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/inventory/sku-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mapForm),
      });
      const data = await res.json();
      if (data.ok) {
        setToast({ type: "success", text: "Đã liên kết mã SKU thành công!" });
        setIsMapModalOpen(false);
        loadAllData();
      } else {
        setToast({ type: "error", text: data.error || "Không thể liên kết SKU." });
      }
    } catch {
      setToast({ type: "error", text: "Lỗi kết nối." });
    }
  };

  // Mở modal liên kết nhanh từ hàng unmapped
  const openQuickLinkModal = (item) => {
    setMapForm({
      platform: item.platform,
      platformSkuId: item.platformSkuId,
      sellerSku: item.sellerSku || item.platformSkuId,
      platformProductName: item.platformProductName,
      shopName: item.shopName,
      localItemCode: products[0]?.code || "GLUCARE-LON-800",
    });
    setIsMapModalOpen(true);
  };

  // Xóa mapping
  const handleDeleteMapping = async (id) => {
    if (!confirm("Bạn có chắc chắn muốn hủy liên kết mã SKU này?")) return;
    try {
      const res = await fetch(`/api/inventory/sku-mappings?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) {
        setSkuMappings((prev) => prev.filter((m) => m.id !== id));
        setToast({ type: "success", text: "Đã xóa liên kết SKU." });
      }
    } catch {
      setToast({ type: "error", text: "Lỗi khi xóa liên kết." });
    }
  };

  // Lọc mappings theo nền tảng
  const filteredMappings = skuMappings.filter(
    (m) => platformFilter === "ALL" || m.platform === platformFilter
  );

  const filteredUnmapped = unmappedSkus.filter(
    (u) => platformFilter === "ALL" || u.platform === platformFilter
  );

  return (
    <div className="space-y-6">
      {/* Toast thông báo */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 rounded-xl px-4 py-3 text-xs font-semibold shadow-2xl transition flex items-center gap-2 ${
            toast.type === "success"
              ? "bg-emerald-500/90 text-white border border-emerald-400"
              : "bg-rose-500/90 text-white border border-rose-400"
          }`}
        >
          <span>{toast.type === "success" ? "✅" : "⚠️"}</span>
          <span>{toast.text}</span>
          <button onClick={() => setToast(null)} className="ml-2 hover:opacity-75">
            ✕
          </button>
        </div>
      )}

      {/* Header & Thẻ Chỉ Số Cốt Lõi */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">📦</span>
            <h1 className="text-xl font-bold text-white tracking-wide">
              Kho Combo, Hàng Đóng Sẵn & Ánh Xạ SKU
            </h1>
            <span className="rounded bg-blue-500/20 text-blue-400 text-[10px] font-semibold px-2 py-0.5 border border-blue-500/30">
              WBS-41 & WBS-42
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Kế thừa từ <code>C:\AH-Trabi\quan-ly-kho</code>: Thuật toán tách mã Combo đệ quy (<code>resolve_all_formulas</code>), quản lý hàng đóng sẵn và cảnh báo mã SKU chưa liên kết đa sàn.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setComboForm({
                code: "",
                name: "",
                unit: "Combo",
                retailPrice: "",
                costPrice: "",
                comboFormula: "",
                stockQuantity: 0,
                prepackedQuantity: 0,
              });
              setIsComboModalOpen(true);
            }}
            className="flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3.5 py-2 transition shadow-lg shadow-blue-600/20"
          >
            <span>+</span>
            <span>Thêm Combo / Sản Phẩm</span>
          </button>
          <button
            onClick={() => {
              setMapForm({
                platform: "TIKTOK_SHOP",
                platformSkuId: "",
                sellerSku: "",
                platformProductName: "",
                shopName: "Dược Phẩm ADDP Official",
                localItemCode: products[0]?.code || "GLUCARE-LON-800",
              });
              setIsMapModalOpen(true);
            }}
            className="flex items-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3.5 py-2 transition border border-slate-700"
          >
            <span>🔗</span>
            <span>Liên Kết SKU Sàn</span>
          </button>
        </div>
      </div>

      {/* 4 Thẻ KPI Kho & SKU */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
            Sản Phẩm Trong Kho
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">
              {products.filter((p) => !p.isCombo).length}
            </span>
            <span className="text-xs text-slate-500">mã sản phẩm lẻ</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
            Công Thức Combo
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-blue-400">
              {products.filter((p) => p.isCombo).length}
            </span>
            <span className="text-xs text-slate-500">combo đã thiết lập</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
            Hàng Đóng Sẵn (Prepack)
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-400">
              {products.reduce((acc, p) => acc + (p.prepackedQuantity || 0), 0)}
            </span>
            <span className="text-xs text-slate-500">hộp/combo sẵn sàng</span>
          </div>
        </div>

        <div className={`rounded-2xl border p-4 transition ${
          unmappedSkus.length > 0
            ? "border-rose-500/40 bg-rose-950/20 shadow-lg shadow-rose-950/30"
            : "border-slate-800 bg-slate-900/60"
        }`}>
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
            Cảnh Báo SKU Chưa Gán
          </span>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${unmappedSkus.length > 0 ? "text-rose-400 animate-pulse" : "text-emerald-400"}`}>
              {unmappedSkus.length}
            </span>
            <span className="text-xs text-slate-500">mã sàn cần liên kết</span>
          </div>
        </div>
      </div>

      {/* Tabs Chuyển Đổi */}
      <div className="flex border-b border-slate-800 gap-2">
        <button
          onClick={() => setActiveTab("combos")}
          className={`flex items-center gap-2 pb-3 px-4 text-xs font-semibold transition border-b-2 ${
            activeTab === "combos"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          <span>🧪</span>
          <span>Kho Sản Phẩm & Giải Mã Combo (WBS-41)</span>
        </button>

        <button
          onClick={() => setActiveTab("prepack")}
          className={`flex items-center gap-2 pb-3 px-4 text-xs font-semibold transition border-b-2 ${
            activeTab === "prepack"
              ? "border-amber-500 text-amber-400"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          <span>📦</span>
          <span>Hàng Đóng Sẵn & Xuất Kho (WBS-42)</span>
        </button>

        <button
          onClick={() => setActiveTab("mapping")}
          className={`flex items-center gap-2 pb-3 px-4 text-xs font-semibold transition border-b-2 ${
            activeTab === "mapping"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          <span>🔗</span>
          <span>Ánh Xạ SKU 4 Sàn & Cảnh Báo (WBS-42)</span>
          {unmappedSkus.length > 0 && (
            <span className="rounded-full bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.2">
              {unmappedSkus.length}
            </span>
          )}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: KHO SẢN PHẨM & GIẢI MÃ COMBO (WBS-41)                              */}
      {/* ========================================================================= */}
      {activeTab === "combos" && (
        <div className="space-y-6">
          {/* Hộp Thử Nghiệm Giải Mã Combo Đệ Quy Trực Tiếp */}
          <div className="rounded-2xl border border-blue-500/30 bg-blue-950/20 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">⚡</span>
                <h3 className="font-bold text-sm text-white">
                  Bộ Kiểm Thử Giải Mã Combo Đệ Quy (Interactive Combo Resolver)
                </h3>
              </div>
              <span className="text-[11px] text-blue-400 font-medium">
                Hỗ trợ cú pháp dấu cộng (+), nhân số lượng, viết tắt (XANH02, CAM01) và đệ quy 5 cấp
              </span>
            </div>

            <form onSubmit={handleTestCombo} className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[240px]">
                <input
                  type="text"
                  value={testSku}
                  onChange={(e) => setTestSku(e.target.value)}
                  placeholder="Nhập mã combo (VD: COMBO-2GLU-1DOV hoặc XANH03+2HOP_GLUCARE)"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="w-24">
                <input
                  type="number"
                  min="1"
                  value={testQty}
                  onChange={(e) => setTestQty(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white text-center focus:outline-none focus:border-blue-500"
                  placeholder="Số lượng"
                />
              </div>

              <button
                type="submit"
                disabled={testing}
                className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 transition shadow"
              >
                {testing ? "Đang giải mã..." : "🔍 Phân Rã Ngay"}
              </button>
            </form>

            {/* Kết quả phân rã combo */}
            {testResult && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 space-y-3">
                <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                  <span className="text-slate-400">
                    Mã gốc: <strong className="text-white">{testResult.originalSku}</strong> (Số lượng: {testResult.orderQty})
                  </span>
                  <span className="text-emerald-400 font-semibold">
                    Tổng giá vốn (COGS): {testResult.totalCost.toLocaleString("vi-VN")} đ
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {testResult.resolvedItems.map((item, idx) => (
                    <div key={idx} className="rounded-lg border border-slate-800 bg-slate-950 p-3 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-xs text-white mb-0.5">{item.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">Mã: {item.sku}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-blue-400">
                          {item.totalQuantity} <span className="text-[10px] text-slate-400 font-normal">{item.unit}</span>
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {item.totalCost.toLocaleString("vi-VN")} đ
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Bảng Danh Sách Sản Phẩm & Combo */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-xs text-white uppercase tracking-wider">
                Danh Mục Sản Phẩm & Công Thức Combo Nội Bộ
              </h3>
              <span className="text-xs text-slate-500">
                {products.length} sản phẩm và combo
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800 bg-slate-950 text-slate-400 uppercase text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Mã SKU</th>
                    <th className="py-3 px-4">Tên Sản Phẩm / Combo</th>
                    <th className="py-3 px-4">Đơn Vị</th>
                    <th className="py-3 px-4">Giá Bán Lẻ</th>
                    <th className="py-3 px-4">Giá Vốn</th>
                    <th className="py-3 px-4">Công Thức Combo (Nếu Có)</th>
                    <th className="py-3 px-4">Tồn Kho Gốc</th>
                    <th className="py-3 px-4">Đóng Sẵn</th>
                    <th className="py-3 px-4 text-right">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-200">
                  {products.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 font-mono font-semibold text-blue-400">
                        {p.code}
                      </td>
                      <td className="py-3 px-4 font-medium text-white">
                        <div className="flex items-center gap-1.5">
                          {p.isCombo && (
                            <span className="rounded bg-indigo-500/20 text-indigo-400 text-[9px] font-bold px-1.5 py-0.2">
                              Combo
                            </span>
                          )}
                          <span>{p.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-400">{p.unit}</td>
                      <td className="py-3 px-4 font-semibold text-white">
                        {p.retailPrice ? `${Number(p.retailPrice).toLocaleString("vi-VN")} đ` : "—"}
                      </td>
                      <td className="py-3 px-4 text-slate-400">
                        {p.costPrice ? `${Number(p.costPrice).toLocaleString("vi-VN")} đ` : "—"}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-amber-300">
                        {p.comboFormula ? (
                          <span className="bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40">
                            {p.comboFormula}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`font-bold ${p.stockQuantity > 50 ? "text-emerald-400" : "text-amber-400"}`}>
                          {p.stockQuantity}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-bold text-amber-400">
                          {p.prepackedQuantity}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => {
                            setComboForm(p);
                            setIsComboModalOpen(true);
                          }}
                          className="rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold px-2.5 py-1 border border-slate-700 transition"
                        >
                          Sửa
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: HÀNG ĐÓNG SẴN & XUẤT KHO THỰC TẾ (WBS-42 - Kế thừa dong_san_view.php) */}
      {/* ========================================================================= */}
      {activeTab === "prepack" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-amber-500/30 bg-amber-950/10 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📦</span>
              <div>
                <h3 className="font-bold text-xs text-white uppercase tracking-wider">
                  Quy Trình Quản Lý Hàng Đóng Sẵn Theo Ca (Pre-packed Inventory)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Thủ kho đóng sẵn các combo hoặc sản phẩm bán chạy trước giờ xuất đơn để bàn giao ngay cho đơn vị vận chuyển (GHN, Shopee Xpress, J&T).
                </p>
              </div>
            </div>
          </div>

          {/* Danh Sách Các Mặt Hàng Đóng Sẵn */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {products
              .filter((p) => p.isCombo || p.prepackedQuantity > 0)
              .map((p) => (
                <div key={p.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-mono text-xs font-bold text-blue-400">{p.code}</div>
                      <div className="text-xs font-semibold text-white mt-0.5 line-clamp-1">{p.name}</div>
                      <div className="text-[10px] text-slate-500">{p.unit}</div>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-bold text-amber-400">{p.prepackedQuantity}</span>
                      <span className="text-[10px] text-slate-400 block">đã đóng sẵn</span>
                    </div>
                  </div>

                  {p.comboFormula && (
                    <div className="rounded-lg bg-slate-950 p-2 text-[10px] font-mono text-amber-300 border border-slate-800">
                      CT: {p.comboFormula}
                    </div>
                  )}

                  {/* Nhóm Nút Điều Chỉnh Nhanh Số Lượng Đóng Sẵn */}
                  <div className="border-t border-slate-800 pt-2 flex items-center justify-between gap-1">
                    <span className="text-[10px] text-slate-500 font-medium">Ca đóng:</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleAdjustPrepack(p.code, -1)}
                        className="rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold px-2 py-1"
                      >
                        -1
                      </button>
                      <button
                        onClick={() => handleAdjustPrepack(p.code, -5)}
                        className="rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold px-2 py-1"
                      >
                        -5
                      </button>
                      <button
                        onClick={() => handleAdjustPrepack(p.code, 5)}
                        className="rounded bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 text-[10px] font-bold px-2 py-1 border border-amber-500/30"
                      >
                        +5
                      </button>
                      <button
                        onClick={() => handleAdjustPrepack(p.code, 10)}
                        className="rounded bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 text-[10px] font-bold px-2 py-1 border border-amber-500/30"
                      >
                        +10
                      </button>
                      <button
                        onClick={() => handleAdjustPrepack(p.code, 20)}
                        className="rounded bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold px-2 py-1 shadow"
                      >
                        +20
                      </button>
                    </div>
                  </div>
                </div>
              ))}
          </div>

          {/* Nhật Ký Đóng Sẵn & Xuất Kho */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
            <h4 className="font-bold text-xs text-white uppercase tracking-wider">
              Nhật Ký Xuất Nhập Đóng Sẵn Gần Đây
            </h4>
            <div className="space-y-2">
              {logs.slice(0, 8).map((log) => (
                <div key={log.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      log.type === "PREPACK" ? "bg-amber-500/20 text-amber-400" : "bg-blue-500/20 text-blue-400"
                    }`}>
                      {log.type === "PREPACK" ? "ĐÓNG SẴN" : "XUẤT KHO"}
                    </span>
                    <span className="font-mono font-semibold text-white">{log.itemCode}</span>
                    <span className="text-slate-400">{log.note}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-white mr-2">
                      {log.type === "PREPACK" ? "+" : "-"}{log.quantity}
                    </span>
                    <span className="text-slate-500 text-[10px]">{log.date}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: ÁNH XẠ SKU 4 SÀN & CẢNH BÁO CHƯA LIÊN KẾT (WBS-42 - channels_view)  */}
      {/* ========================================================================= */}
      {activeTab === "mapping" && (
        <div className="space-y-6">
          {/* Bộ lọc Nền tảng */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">Lọc theo sàn:</span>
              <div className="flex rounded-xl bg-slate-900 p-1 border border-slate-800">
                {["ALL", "TIKTOK_SHOP", "SHOPEE", "WEBSITE_MAGENTO", "KIOTVIET"].map((plat) => (
                  <button
                    key={plat}
                    onClick={() => setPlatformFilter(plat)}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                      platformFilter === plat
                        ? "bg-blue-600 text-white"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {plat === "ALL"
                      ? "Tất cả"
                      : plat === "TIKTOK_SHOP"
                      ? "TikTok Shop"
                      : plat === "SHOPEE"
                      ? "Shopee"
                      : plat === "WEBSITE_MAGENTO"
                      ? "Magento 2.4.8"
                      : "KiotViet"}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => {
                setMapForm({
                  platform: "TIKTOK_SHOP",
                  platformSkuId: "",
                  sellerSku: "",
                  platformProductName: "",
                  shopName: "Dược Phẩm ADDP Official",
                  localItemCode: products[0]?.code || "GLUCARE-LON-800",
                });
                setIsMapModalOpen(true);
              }}
              className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3.5 py-1.5 transition shadow"
            >
              + Tạo Liên Kết SKU Mới
            </button>
          </div>

          {/* Khối Cảnh Báo Mã Chưa Liên Kết (Kế thừa từ channels_view.php) */}
          {filteredUnmapped.length > 0 && (
            <div className="rounded-2xl border border-rose-500/40 bg-rose-950/20 p-5 space-y-3 shadow-lg shadow-rose-950/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">⚠️</span>
                  <h3 className="font-bold text-sm text-rose-300">
                    Cảnh Báo: Có {filteredUnmapped.length} Mã SKU Trên Sàn Chưa Liên Kết Với Kho
                  </h3>
                </div>
                <span className="text-[11px] text-rose-400 font-medium">
                  Cần liên kết để trừ kho và tính lãi/lỗ đơn hàng tự động
                </span>
              </div>

              <div className="space-y-2">
                {filteredUnmapped.map((u) => (
                  <div
                    key={u.id}
                    className="rounded-xl border border-rose-900/60 bg-slate-950/90 p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="rounded bg-rose-500/20 text-rose-300 text-[10px] font-bold px-2 py-0.5 border border-rose-500/30">
                          {u.platform === "TIKTOK_SHOP" ? "TikTok Shop" : u.platform === "SHOPEE" ? "Shopee" : "Magento 2.4.8"}
                        </span>
                        <span className="font-mono font-bold text-xs text-white">
                          Seller SKU: {u.sellerSku || u.platformSkuId}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          ({u.shopName})
                        </span>
                      </div>
                      <div className="text-xs text-slate-300">
                        {u.platformProductName}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        Đã phát sinh trong <strong>{u.orderCount}</strong> đơn hàng • Lần cuối: {u.lastSeenAt}
                      </div>
                    </div>

                    <button
                      onClick={() => openQuickLinkModal(u)}
                      className="rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold px-4 py-2 transition shadow flex-shrink-0"
                    >
                      🔗 Liên Kết Với Kho Ngay
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bảng Các Mã SKU Đã Liên Kết Thành Công */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-xs text-white uppercase tracking-wider">
                Danh Sách Mã SKU Đã Ánh Xạ Với Kho Nội Bộ ({filteredMappings.length})
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800 bg-slate-950 text-slate-400 uppercase text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Nền Tảng Sàn</th>
                    <th className="py-3 px-4">Gian Hàng</th>
                    <th className="py-3 px-4">Mã SKU Trên Sàn (Seller SKU)</th>
                    <th className="py-3 px-4">Tên Sản Phẩm Trên Sàn</th>
                    <th className="py-3 px-4">Mã Sản Phẩm / Combo Kho</th>
                    <th className="py-3 px-4">Trạng Thái</th>
                    <th className="py-3 px-4 text-right">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-200">
                  {filteredMappings.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4">
                        <span className="font-semibold text-white">
                          {m.platform === "TIKTOK_SHOP"
                            ? "🎵 TikTok Shop"
                            : m.platform === "SHOPEE"
                            ? "🧡 Shopee"
                            : m.platform === "WEBSITE_MAGENTO"
                            ? "🌐 Magento 2.4.8"
                            : "🛒 KiotViet"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400">{m.shopName}</td>
                      <td className="py-3 px-4 font-mono font-bold text-amber-300">
                        {m.sellerSku}
                      </td>
                      <td className="py-3 px-4 text-slate-300 max-w-xs truncate">
                        {m.platformProductName}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-blue-400">
                        {m.localItemCode}
                      </td>
                      <td className="py-3 px-4">
                        <span className="rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-0.5 border border-emerald-500/30">
                          ✅ Đã Liên Kết
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleDeleteMapping(m.id)}
                          className="text-slate-500 hover:text-rose-400 transition text-[11px] font-semibold"
                        >
                          Hủy liên kết
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: TẠO / SỬA COMBO & SẢN PHẨM */}
      {isComboModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-white">
                {comboForm.id ? "Cập Nhật Sản Phẩm / Combo" : "Thêm Sản Phẩm / Combo Mới"}
              </h3>
              <button onClick={() => setIsComboModalOpen(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCombo} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Mã Sản Phẩm / Mã Combo (In hoa, không dấu)</label>
                <input
                  type="text"
                  required
                  value={comboForm.code}
                  onChange={(e) => setComboForm({ ...comboForm, code: e.target.value.toUpperCase() })}
                  placeholder="VD: COMBO-2GLU-1DOV"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Tên Sản Phẩm / Combo Hiển Thị</label>
                <input
                  type="text"
                  required
                  value={comboForm.name}
                  onChange={(e) => setComboForm({ ...comboForm, name: e.target.value })}
                  placeholder="VD: Combo 2 Lon Glucare Plus Tặng Sủi"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Đơn vị</label>
                  <input
                    type="text"
                    value={comboForm.unit}
                    onChange={(e) => setComboForm({ ...comboForm, unit: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Giá bán lẻ (đ)</label>
                  <input
                    type="number"
                    value={comboForm.retailPrice}
                    onChange={(e) => setComboForm({ ...comboForm, retailPrice: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Giá vốn COGS (đ)</label>
                  <input
                    type="number"
                    value={comboForm.costPrice}
                    onChange={(e) => setComboForm({ ...comboForm, costPrice: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">
                  Công thức Combo (Nếu là combo: định dạng <code>SKU:qty,SKU:qty</code>)
                </label>
                <input
                  type="text"
                  value={comboForm.comboFormula || ""}
                  onChange={(e) => setComboForm({ ...comboForm, comboFormula: e.target.value })}
                  placeholder="VD: GLUCARE-LON-800:2,DOVITAL-SUI:1"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-amber-300 font-mono"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Để trống nếu đây là sản phẩm lẻ gốc.
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsComboModalOpen(false)}
                  className="rounded-xl px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="rounded-xl px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow"
                >
                  Lưu Sản Phẩm
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: LIÊN KẾT MÃ SKU SÀN VỚI KHO */}
      {isMapModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-white">
                Liên Kết Mã SKU Sàn Với Kho ADDP
              </h3>
              <button onClick={() => setIsMapModalOpen(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveMapping} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Nền Tảng Sàn</label>
                <select
                  value={mapForm.platform}
                  onChange={(e) => setMapForm({ ...mapForm, platform: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-white"
                >
                  <option value="TIKTOK_SHOP">TikTok Shop</option>
                  <option value="SHOPEE">Shopee</option>
                  <option value="WEBSITE_MAGENTO">Website Magento 2.4.8</option>
                  <option value="KIOTVIET">KiotViet POS</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Mã Seller SKU trên Sàn</label>
                <input
                  type="text"
                  required
                  value={mapForm.sellerSku}
                  onChange={(e) => setMapForm({ ...mapForm, sellerSku: e.target.value, platformSkuId: e.target.value })}
                  placeholder="VD: TTS-SET5-TRIAL"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-amber-300 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Tên Sản Phẩm Trên Sàn</label>
                <input
                  type="text"
                  value={mapForm.platformProductName}
                  onChange={(e) => setMapForm({ ...mapForm, platformProductName: e.target.value })}
                  placeholder="VD: Set Dùng Thử 5 Gói Sữa Glucare"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Chọn Mã Sản Phẩm / Combo Trong Kho Tương Ứng</label>
                <select
                  value={mapForm.localItemCode}
                  onChange={(e) => setMapForm({ ...mapForm, localItemCode: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-blue-400 font-mono font-semibold"
                >
                  {products.map((p) => (
                    <option key={p.code} value={p.code}>
                      [{p.code}] {p.name} {p.isCombo ? `(Combo: ${p.comboFormula})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsMapModalOpen(false)}
                  className="rounded-xl px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="rounded-xl px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow"
                >
                  Xác Nhận Liên Kết
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
