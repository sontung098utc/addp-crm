"use client";

import { Tag, Plus, Check } from "lucide-react";

/**
 * ADDP CRM — Thanh Gắn Thẻ Nhanh Cấp Độ & Trạng Thái (Chuẩn Vpage)
 * Đặt ngay trên ô nhập tin nhắn: Cấp 1 | Cấp 2 | Cấp 3 | Đã chốt | Bám đuổi...
 */

const QUICK_TAG_OPTIONS = [
  { id: "cap_1", name: "Cấp 1", activeColor: "bg-blue-600 text-white border-blue-500 shadow-xs" },
  { id: "cap_2", name: "Cấp 2", activeColor: "bg-cyan-600 text-white border-cyan-500 shadow-xs" },
  { id: "cap_3", name: "Cấp 3", activeColor: "bg-sky-600 text-white border-sky-500 shadow-xs" },
  { id: "da_chot", name: "Đã chốt", activeColor: "bg-emerald-600 text-white border-emerald-500 shadow-xs font-bold" },
  { id: "bam_duoi", name: "Bám đuổi", activeColor: "bg-amber-600 text-white border-amber-500 shadow-xs" },
  { id: "khach_vip", name: "Khách VIP", activeColor: "bg-purple-600 text-white border-purple-500 shadow-xs font-bold" },
  { id: "can_tu_van", name: "Cần tư vấn", activeColor: "bg-rose-600 text-white border-rose-500 shadow-xs" },
];

export default function QuickTagBar({
  currentTags = [],
  availableTags = [],
  onToggleTag,
  onOpenTagManager,
}) {
  const activeTagsSet = new Set(
    (currentTags || []).map((t) => (typeof t === "string" ? t.toLowerCase().trim() : String(t?.id || t?.name || "").toLowerCase().trim()))
  );

  return (
    <div className="flex items-center gap-1.5 py-1 px-1 overflow-x-auto no-scrollbar border-b border-slate-800/60 bg-slate-900/60 text-xs">
      <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 shrink-0 mr-1">
        <Tag className="w-3 h-3 text-slate-400" />
        <span className="hidden sm:inline">Thẻ:</span>
      </div>

      {QUICK_TAG_OPTIONS.map((tag) => {
        // Kiểm tra xem thẻ có đang được gắn vào hội thoại này không
        const isSelected =
          activeTagsSet.has(tag.id.toLowerCase()) ||
          activeTagsSet.has(tag.name.toLowerCase()) ||
          availableTags.some(
            (at) =>
              (at.id === tag.id || at.name?.toLowerCase() === tag.name.toLowerCase()) &&
              (activeTagsSet.has(String(at.id).toLowerCase()) || activeTagsSet.has(String(at.name).toLowerCase()))
          );

        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => onToggleTag(tag.name)}
            className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-all whitespace-nowrap cursor-pointer border ${
              isSelected
                ? tag.activeColor
                : "bg-slate-800/80 hover:bg-slate-750 text-slate-400 hover:text-slate-200 border-slate-700/60"
            }`}
            title={`Bấm để ${isSelected ? "bỏ gắn" : "gắn"} thẻ ${tag.name}`}
          >
            <span className="inline-flex items-center gap-1">
              {isSelected && <Check className="w-2.5 h-2.5 shrink-0 stroke-[3]" />}
              <span>{tag.name}</span>
            </span>
          </button>
        );
      })}

      {onOpenTagManager && (
        <button
          type="button"
          onClick={onOpenTagManager}
          className="px-2 py-0.5 rounded-md text-[11px] text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition-colors inline-flex items-center gap-0.5 shrink-0 ml-auto cursor-pointer"
          title="Mở quản lý tất cả các thẻ tag"
        >
          <Plus className="w-3 h-3" />
          <span className="hidden sm:inline">Gắn thẻ khác</span>
        </button>
      )}
    </div>
  );
}
