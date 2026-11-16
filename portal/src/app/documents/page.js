"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileText,
  Image as ImageIcon,
  UploadCloud,
  Search,
  Trash2,
  Pencil,
  ExternalLink,
  Copy,
  Check,
  X,
  FolderOpen,
  ShieldCheck,
  Download,
} from "lucide-react";

const CATEGORY_META = {
  ALL: { label: "Tất cả tài liệu", badge: "bg-slate-700/60 text-slate-200 border-slate-600" },
  PRODUCT_PAPER: {
    label: "Giấy tờ sản phẩm",
    badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  PRODUCT_BROCHURE: {
    label: "Tài liệu / Ảnh SP",
    badge: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  },
  REGULATION: {
    label: "Quy định nội bộ",
    badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  OTHER: {
    label: "Khác",
    badge: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  },
};

function formatFileSize(bytes = 0) {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("ALL");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  // Modal upload / edit
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formState, setFormState] = useState({
    title: "",
    category: "PRODUCT_PAPER",
    productTag: "",
    description: "",
    file: null,
  });

  const showNotice = (type, text) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (category !== "ALL") params.set("category", category);
      if (search.trim()) params.set("q", search.trim());

      const res = await fetch(`/api/documents?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (data.ok) {
        setDocuments(data.documents || []);
        setCanManage(Boolean(data.canManage));
      } else {
        showNotice("error", data.error || "Không thể tải danh sách tài liệu.");
      }
    } catch (err) {
      showNotice("error", `Lỗi kết nối: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [category, search]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const openCreateModal = () => {
    setEditingDoc(null);
    setFormState({
      title: "",
      category: "PRODUCT_PAPER",
      productTag: "",
      description: "",
      file: null,
    });
    setShowUploadModal(true);
  };

  const openEditModal = (doc) => {
    setEditingDoc(doc);
    setFormState({
      title: doc.title || "",
      category: doc.category || "PRODUCT_PAPER",
      productTag: doc.productTag || "",
      description: doc.description || "",
      file: null,
    });
    setShowUploadModal(true);
  };

  const handleSubmitModal = async (e) => {
    e.preventDefault();
    if (submitting) return;

    try {
      setSubmitting(true);
      if (editingDoc) {
        const res = await fetch(`/api/documents/${editingDoc.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: formState.title,
            category: formState.category,
            productTag: formState.productTag,
            description: formState.description,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          showNotice("error", data.error || "Không thể cập nhật tài liệu.");
          return;
        }
        showNotice("success", "Đã cập nhật thông tin tài liệu.");
      } else {
        if (!formState.file) {
          showNotice("error", "Vui lòng chọn file cần tải lên.");
          return;
        }
        const fd = new FormData();
        fd.append("file", formState.file);
        fd.append("title", formState.title || formState.file.name);
        fd.append("category", formState.category);
        fd.append("productTag", formState.productTag);
        fd.append("description", formState.description);

        const res = await fetch("/api/documents", {
          method: "POST",
          body: fd,
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          showNotice("error", data.error || "Không thể đăng tải tài liệu.");
          return;
        }
        showNotice("success", `Đã đăng tải "${data.document.title}" thành công!`);
      }

      setShowUploadModal(false);
      await fetchDocuments();
    } catch (err) {
      showNotice("error", `Lỗi thao tác: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (doc) => {
    if (!window.confirm(`Xóa tài liệu "${doc.title}" khỏi kho lưu trữ?`)) return;
    try {
      const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showNotice("error", data.error || "Không thể xóa tài liệu.");
        return;
      }
      showNotice("success", `Đã xóa tài liệu "${doc.title}".`);
      await fetchDocuments();
    } catch (err) {
      showNotice("error", `Lỗi xóa: ${err.message}`);
    }
  };

  const handleCopyUrl = (doc) => {
    const fullUrl = `${window.location.origin}${doc.url}`;
    navigator.clipboard?.writeText(fullUrl);
    setCopiedId(doc.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="max-w-[1440px] mx-auto space-y-5">
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 rounded-xl px-4 py-3 text-sm font-medium shadow-xl border ${
            toast.type === "error"
              ? "bg-rose-950/95 border-rose-500/40 text-rose-200"
              : "bg-emerald-950/95 border-emerald-500/40 text-emerald-200"
          }`}
        >
          {toast.type === "error" ? "⚠️ " : "✅ "}
          {toast.text}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/70 p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="h-9 w-9 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-500">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                Kho Tài Liệu &amp; Giấy Tờ Sản Phẩm
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Lưu trữ tập trung giấy công bố, kiểm nghiệm sản phẩm, bảng giá &amp; quy định công ty để Sale chọn gửi nhanh ngay trong Hộp thư chat.
              </p>
            </div>
          </div>
        </div>

        {canManage ? (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-600/25 cursor-pointer transition shrink-0"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Đăng tài liệu / giấy tờ mới</span>
          </button>
        ) : (
          <div className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>Chế độ nhân viên: Xem, tải về &amp; gửi nhanh trong Chat</span>
          </div>
        )}
      </div>

      {/* Bộ lọc & Tìm kiếm */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4">
        <div className="flex items-center gap-2 flex-wrap">
          {Object.entries(CATEGORY_META).map(([key, meta]) => (
            <button
              key={key}
              type="button"
              onClick={() => setCategory(key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                category === key
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-500/40"
              }`}
            >
              {meta.label}
            </button>
          ))}
        </div>

        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm tên tài liệu, sản phẩm, tên file..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Danh sách tài liệu */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-xs text-slate-400 gap-2">
          <div className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span>Đang tải kho tài liệu...</span>
        </div>
      ) : documents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/50 dark:bg-slate-900/40 p-12 text-center space-y-2">
          <FolderOpen className="w-10 h-10 text-slate-400 mx-auto" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Chưa có tài liệu nào phù hợp
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {canManage
              ? "Bấm 'Đăng tài liệu / giấy tờ mới' ở góc trên phải để tải lên giấy tờ sản phẩm hoặc quy định công ty."
              : "Liên hệ Admin để đăng tải giấy tờ sản phẩm và tài liệu hướng dẫn vào kho."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {documents.map((doc) => {
            const cat = CATEGORY_META[doc.category] || CATEGORY_META.OTHER;
            return (
              <div
                key={doc.id}
                className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/75 p-4 flex flex-col justify-between gap-3 hover:border-blue-500/40 transition shadow-sm"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${cat.badge}`}>
                      {cat.label}
                    </span>
                    {doc.productTag && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {doc.productTag}
                      </span>
                    )}
                  </div>

                  <div className="flex items-start gap-3">
                    {doc.isImage ? (
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="w-14 h-14 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0 bg-slate-950 block"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={doc.url}
                          alt={doc.title}
                          className="w-full h-full object-cover"
                        />
                      </a>
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 shrink-0">
                        <FileText className="w-6 h-6" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-2">
                        {doc.title}
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {doc.fileName} • {formatFileSize(doc.size)}
                      </p>
                    </div>
                  </div>

                  {doc.description && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 bg-slate-50 dark:bg-slate-950/60 rounded-xl p-2.5 border border-slate-200/70 dark:border-slate-800/80">
                      {doc.description}
                    </p>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-slate-400">
                    Đăng bởi {doc.uploadedBy} •{" "}
                    {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString("vi-VN") : ""}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noreferrer"
                      title="Xem file"
                      className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-600 dark:text-slate-300 transition"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <a
                      href={doc.url}
                      download={doc.fileName}
                      title="Tải về máy"
                      className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-emerald-600 hover:text-white text-slate-600 dark:text-slate-300 transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <button
                      type="button"
                      onClick={() => handleCopyUrl(doc)}
                      title="Copy đường dẫn file"
                      className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white text-slate-600 dark:text-slate-300 transition cursor-pointer"
                    >
                      {copiedId === doc.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {canManage && (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditModal(doc)}
                          title="Chỉnh sửa thông tin"
                          className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-amber-600 hover:text-white text-slate-600 dark:text-slate-300 transition cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(doc)}
                          title="Xóa tài liệu"
                          className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-rose-600 hover:text-white text-slate-600 dark:text-slate-300 transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Đăng / Sửa Tài liệu (Chỉ Admin) */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl space-y-4 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base flex items-center gap-2">
                <UploadCloud className="w-5 h-5 text-blue-400" />
                <span>{editingDoc ? "Chỉnh sửa thông tin tài liệu" : "Đăng tài liệu / giấy tờ mới"}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitModal} className="space-y-3.5 text-xs">
              {!editingDoc && (
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Chọn file (PDF, Ảnh JPG/PNG, Word, Excel — tối đa 25MB) *
                  </label>
                  <input
                    type="file"
                    required
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.txt,.csv"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      setFormState((prev) => ({
                        ...prev,
                        file: f,
                        title: prev.title || (f ? f.name.replace(/\.[^.]+$/, "") : ""),
                      }));
                    }}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-slate-200 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-blue-500 cursor-pointer"
                  />
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Tên / Tiêu đề tài liệu *
                </label>
                <input
                  type="text"
                  required
                  value={formState.title}
                  onChange={(e) => setFormState((p) => ({ ...p, title: e.target.value }))}
                  placeholder="VD: Phiếu kiểm nghiệm Sữa hạt Glucare Plus 2026"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Phân loại</label>
                  <select
                    value={formState.category}
                    onChange={(e) => setFormState((p) => ({ ...p, category: e.target.value }))}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-500"
                  >
                    <option value="PRODUCT_PAPER">Giấy tờ sản phẩm (Công bố, Kiểm nghiệm)</option>
                    <option value="PRODUCT_BROCHURE">Tài liệu / Ảnh sản phẩm &amp; Bảng giá</option>
                    <option value="REGULATION">Quy định &amp; Quy trình nội bộ</option>
                    <option value="OTHER">Tài liệu khác</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Sản phẩm liên quan (nếu có)
                  </label>
                  <input
                    type="text"
                    value={formState.productTag}
                    onChange={(e) => setFormState((p) => ({ ...p, productTag: e.target.value }))}
                    placeholder="VD: Glucare Plus, Viên An Đường..."
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Mô tả / Ghi chú hướng dẫn Sale
                </label>
                <textarea
                  rows={3}
                  value={formState.description}
                  onChange={(e) => setFormState((p) => ({ ...p, description: e.target.value }))}
                  placeholder="VD: Gửi khách khi khách hỏi về nguồn gốc xuất xứ hoặc giấy phép Bộ Y tế..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 font-semibold cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold cursor-pointer disabled:opacity-50"
                >
                  {submitting ? "Đang lưu..." : editingDoc ? "Lưu thay đổi" : "Đăng tải ngay"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
