"use client";

import { useState, useEffect, useMemo } from "react";
import { FileText, Search, X, Send, Paperclip, ExternalLink, FolderOpen } from "lucide-react";

const CATEGORIES = [
  { key: "ALL", label: "Tất cả" },
  { key: "PRODUCT_PAPER", label: "Giấy tờ SP" },
  { key: "PRODUCT_BROCHURE", label: "Tài liệu / Ảnh SP" },
  { key: "REGULATION", label: "Quy định" },
];

export default function DocumentPickerModal({
  isOpen,
  onClose,
  onAttachDocument,
  onSendDocumentDirect,
}) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    fetch("/api/documents", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.ok) {
          setDocuments(data.documents || []);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return documents.filter((d) => {
      if (category !== "ALL" && d.category !== category) return false;
      if (q) {
        const hay = `${d.title || ""} ${d.description || ""} ${d.productTag || ""} ${d.fileName || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [documents, category, search]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-slate-100">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <FolderOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">
                Chọn Nhanh Tài Liệu &amp; Giấy Tờ Sản Phẩm
              </h3>
              <p className="text-[11px] text-slate-400">
                Đính kèm vào khung chat hoặc gửi ngay cho khách hàng xem
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Bộ lọc & Tìm kiếm */}
        <div className="p-3 border-b border-slate-800 space-y-2.5 bg-slate-900/80">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm nhanh giấy công bố, kiểm nghiệm, bảng giá, tên sản phẩm..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-700 bg-slate-950 text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                type="button"
                onClick={() => setCategory(cat.key)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                  category === cat.key
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Danh sách */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400">Đang tải danh sách tài liệu...</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400 space-y-1">
              <p className="font-semibold text-slate-300">Không có tài liệu phù hợp.</p>
              <p>Admin có thể vào mục &quot;Tài liệu &amp; Giấy tờ&quot; ở menu bên trái để đăng tải thêm.</p>
            </div>
          ) : (
            filtered.map((doc) => (
              <div
                key={doc.id}
                className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-blue-500/40 transition"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {doc.isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={doc.url}
                      alt={doc.title}
                      className="w-11 h-11 rounded-lg object-cover border border-slate-700 shrink-0"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-xs text-white truncate">{doc.title}</h4>
                      {doc.productTag && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] border border-slate-700">
                          {doc.productTag}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">{doc.fileName}</p>
                    {doc.description && (
                      <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{doc.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                    title="Xem trước"
                    className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      onAttachDocument(doc);
                      onClose();
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer transition border border-slate-700"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    <span>Đính kèm</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSendDocumentDirect(doc);
                      onClose();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Gửi ngay</span>
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
