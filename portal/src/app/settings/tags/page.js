"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Tag,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  AlertCircle,
  CheckCircle2,
  Users,
  ArrowLeft,
  RefreshCw,
  Search,
} from "lucide-react";
import { COLOR_OPTIONS, COLOR_VARIANTS } from "@/lib/tagConstants";

export default function TagsManagementPage() {
  const [tags, setTags] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [toast, setToast] = useState(null);

  // Form Thêm thẻ mới
  const [newTagName, setNewTagName] = useState("");
  const [selectedColor, setSelectedColor] = useState("blue");
  const [saving, setSaving] = useState(false);

  // Modal / Trạng thái Chỉnh sửa
  const [editingTag, setEditingTag] = useState(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("blue");
  const [updating, setUpdating] = useState(false);

  // Modal Xác nhận xóa
  const [deletingTag, setDeletingTag] = useState(null);

  const showToast = (type, text) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3500);
  };

  const loadTags = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/tags");
      const data = await res.json();
      if (data.ok) {
        setTags(data.tags || []);
        setCounts(data.counts || {});
      } else {
        showToast("error", data.error || "Không thể tải danh sách thẻ");
      }
    } catch (err) {
      console.error(err);
      showToast("error", "Lỗi kết nối khi tải danh mục thẻ tag");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  const handleCreateTag = async (e) => {
    e.preventDefault();
    const cleanName = newTagName.trim();
    if (!cleanName) {
      showToast("error", "Vui lòng nhập tên thẻ tag");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cleanName,
          color: selectedColor,
          bg: COLOR_VARIANTS[selectedColor],
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Không thể tạo thẻ");
      }

      setTags(data.tags || []);
      setCounts(data.counts || {});
      setNewTagName("");
      showToast("success", `Đã tạo thành công thẻ "${cleanName}"!`);
    } catch (err) {
      showToast("error", err.message || "Lỗi tạo thẻ mới");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateTag = async (e) => {
    e.preventDefault();
    if (!editingTag || !editName.trim()) return;

    setUpdating(true);
    try {
      const res = await fetch("/api/tags", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingTag.id,
          name: editName.trim(),
          color: editColor,
          bg: COLOR_VARIANTS[editColor],
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Không thể cập nhật thẻ");
      }

      setTags(data.tags || []);
      setCounts(data.counts || {});
      setEditingTag(null);
      showToast("success", "Đã cập nhật thông tin thẻ thành công!");
    } catch (err) {
      showToast("error", err.message || "Lỗi cập nhật thẻ");
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteTag = async () => {
    if (!deletingTag) return;
    try {
      const res = await fetch(`/api/tags?id=${encodeURIComponent(deletingTag.id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Không thể xóa thẻ");
      }

      setTags(data.tags || []);
      setCounts(data.counts || {});
      showToast("success", `Đã xóa thẻ "${deletingTag.name}" khỏi hệ thống.`);
      setDeletingTag(null);
    } catch (err) {
      showToast("error", err.message || "Lỗi xóa thẻ");
    }
  };

  const filteredTags = tags.filter((t) =>
    (t.name || "").toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  const totalUsedCount = Object.values(counts).reduce((acc, curr) => acc + curr, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Toast thông báo */}
      {toast && (
        <div
          role="alert"
          className={`fixed top-5 right-5 z-50 rounded-xl border px-4 py-3 text-xs backdrop-blur-md shadow-2xl flex items-center gap-2.5 transition-all ${
            toast.type === "success"
              ? "border-emerald-500/40 bg-emerald-950/90 text-emerald-200"
              : "border-rose-500/40 bg-rose-950/90 text-rose-200"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{toast.text}</span>
        </div>
      )}

      {/* Header Điều hướng & Tiêu đề */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/inbox"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              title="Quay lại Hộp thư đa kênh"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
              <Tag className="w-6 h-6 text-blue-500" />
              <span>Quản Lý Danh Mục Thẻ Khách Hàng</span>
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-400">
            Cấu hình danh mục thẻ phân loại khách hàng phục vụ Telesales, lọc hội thoại và chiến dịch gửi tin nhắn hàng loạt.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/inbox"
            className="px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
          >
            💬 Vào Hộp Thư
          </Link>
          <button
            type="button"
            onClick={loadTags}
            disabled={loading}
            className="p-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Làm mới danh sách"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-blue-400" : ""}`} />
          </button>
        </div>
      </div>

      {/* Grid: Form Thêm Thẻ & Thống kê */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cột 1: Form Thêm Thẻ Mới */}
        <div className="lg:col-span-1 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <h2 className="font-bold text-sm text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-400" />
              <span>Thêm Thẻ Tag Mới</span>
            </h2>
            <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
              Khởi tạo thẻ
            </span>
          </div>

          <form onSubmit={handleCreateTag} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold mb-1.5 text-slate-300">
                Tên Thẻ Tag <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="VD: Khách VIP, Đã Chốt Đơn, Tiểu Đường..."
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-950 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            {/* Bảng chọn màu sắc tròn */}
            <div>
              <label className="block font-semibold mb-2 text-slate-300">
                Chọn Màu Sắc Nhận Diện
              </label>
              <div className="grid grid-cols-5 gap-2.5">
                {COLOR_OPTIONS.map((c) => {
                  const isSelected = selectedColor === c.key;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setSelectedColor(c.key)}
                      title={c.label}
                      className={`h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer border ${
                        isSelected
                          ? "ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-105 border-white"
                          : "border-slate-800 hover:scale-105 opacity-80 hover:opacity-100"
                      }`}
                      style={{ backgroundColor: `${c.hex}25` }}
                    >
                      <span
                        className="w-4 h-4 rounded-full flex items-center justify-center shadow-xs"
                        style={{ backgroundColor: c.hex }}
                      >
                        {isSelected && <Check className="w-2.5 h-2.5 text-white stroke-[3]" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Preview Thẻ */}
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
              <span className="text-[10px] text-slate-400 block mb-1.5 font-medium uppercase tracking-wider">
                Xem trước giao diện:
              </span>
              <div className="flex items-center gap-2">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                    COLOR_VARIANTS[selectedColor]
                  }`}
                >
                  🏷️ {newTagName.trim() || "Tên thẻ tag"}
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving || !newTagName.trim()}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang lưu...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>+ Lưu Thẻ Tag</span>
                </>
              )}
            </button>
          </form>

          {/* Hộp chỉ số nhanh */}
          <div className="pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-3">
            <div className="p-3 bg-slate-950/50 rounded-xl border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 block mb-0.5">Tổng Thẻ Tag</span>
              <span className="text-lg font-black text-white tabular-nums">{tags.length}</span>
            </div>
            <div className="p-3 bg-slate-950/50 rounded-xl border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 block mb-0.5">Số Lượt Gắn</span>
              <span className="text-lg font-black text-blue-400 tabular-nums">
                {totalUsedCount}
              </span>
            </div>
          </div>
        </div>

        {/* Cột 2 & 3: Bảng Danh Sách Thẻ Hiện Có */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800">
            <div>
              <h2 className="font-bold text-sm text-white flex items-center gap-2">
                <Tag className="w-4 h-4 text-emerald-400" />
                <span>Danh Mục Thẻ Hiện Có ({filteredTags.length})</span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Danh sách thẻ thực tế trong hệ thống do Quản Trị Viên khởi tạo.
              </p>
            </div>

            {/* Ô tìm kiếm thẻ */}
            <div className="relative w-full sm:w-64">
              <input
                type="text"
                placeholder="Tìm kiếm thẻ..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-1.5 pl-8 rounded-xl border border-slate-700 bg-slate-950 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-blue-500"
              />
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Bảng danh sách */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="py-12 text-center text-xs text-slate-500 space-y-2">
                <div className="h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p>Đang tải danh mục thẻ...</p>
              </div>
            ) : filteredTags.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400 space-y-2 border border-dashed border-slate-800 rounded-xl">
                <p className="italic">
                  {searchQuery.trim()
                    ? `Không tìm thấy thẻ tag nào khớp với "${searchQuery}"`
                    : "Chưa có thẻ tag nào trong hệ thống. Hãy tạo thẻ đầu tiên ở cột bên trái!"}
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-[11px] uppercase tracking-wider">
                    <th className="py-2.5 px-3">Tên Thẻ (Badge)</th>
                    <th className="py-2.5 px-3">Màu Sắc</th>
                    <th className="py-2.5 px-3 text-center">Khách Đang Dùng</th>
                    <th className="py-2.5 px-3 text-right">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredTags.map((tag) => {
                    const usage = counts[tag.name] || counts[tag.id] || 0;
                    const colorMeta =
                      COLOR_OPTIONS.find((c) => c.key === tag.color) || COLOR_OPTIONS[0];

                    return (
                      <tr key={tag.id || tag.name} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${
                              tag.bg || COLOR_VARIANTS[tag.color] || COLOR_VARIANTS.blue
                            }`}
                          >
                            <span>🏷️</span>
                            <span>{tag.name}</span>
                          </span>
                        </td>

                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-3.5 h-3.5 rounded-full inline-block shrink-0 shadow-xs"
                              style={{ backgroundColor: colorMeta.hex }}
                            />
                            <span className="text-slate-300 text-xs">{colorMeta.label}</span>
                          </div>
                        </td>

                        <td className="py-3 px-3 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums ${
                              usage > 0
                                ? "bg-blue-950 text-blue-300 border border-blue-800/50"
                                : "bg-slate-800/60 text-slate-400"
                            }`}
                          >
                            <Users className="w-3 h-3 shrink-0" />
                            <span>{usage} khách</span>
                          </span>
                        </td>

                        <td className="py-3 px-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTag(tag);
                                setEditName(tag.name);
                                setEditColor(tag.color || "blue");
                              }}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                              title="Sửa tên / màu thẻ"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => setDeletingTag(tag)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 hover:text-rose-400 text-slate-400 transition-colors cursor-pointer"
                              title="Xóa thẻ tag"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* MODAL CHỈNH SỬA THẺ TAG */}
      {editingTag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-blue-400" />
                <span>Chỉnh Sửa Thẻ Tag</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingTag(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateTag} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold mb-1.5 text-slate-300">
                  Tên Thẻ Tag
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-950 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold mb-2 text-slate-300">
                  Chọn Màu Mới
                </label>
                <div className="grid grid-cols-5 gap-2.5">
                  {COLOR_OPTIONS.map((c) => {
                    const isSelected = editColor === c.key;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => setEditColor(c.key)}
                        title={c.label}
                        className={`h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer border ${
                          isSelected
                            ? "ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-105 border-white"
                            : "border-slate-800 opacity-80 hover:opacity-100"
                        }`}
                        style={{ backgroundColor: `${c.hex}25` }}
                      >
                        <span
                          className="w-4 h-4 rounded-full flex items-center justify-center shadow-xs"
                          style={{ backgroundColor: c.hex }}
                        >
                          {isSelected && <Check className="w-2.5 h-2.5 text-white stroke-[3]" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Preview */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-400 block mb-1">Xem trước:</span>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold border inline-block ${
                    COLOR_VARIANTS[editColor]
                  }`}
                >
                  🏷️ {editName.trim() || "Tên thẻ tag"}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingTag(null)}
                  className="px-3 py-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={updating || !editName.trim()}
                  className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold"
                >
                  {updating ? "Đang lưu..." : "Cập Nhật"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL XÁC NHẬN XÓA THẺ */}
      {deletingTag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-5 space-y-3 text-xs">
            <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>Xác nhận xóa thẻ tag?</span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              Bạn có chắc chắn muốn xóa thẻ{" "}
              <strong className="text-white">"{deletingTag.name}"</strong>? Thao tác này sẽ gỡ thẻ
              khỏi tất cả khách hàng đang sử dụng.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setDeletingTag(null)}
                className="px-3 py-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 font-semibold cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleDeleteTag}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer transition-colors"
              >
                Xóa Vĩnh Viễn
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
