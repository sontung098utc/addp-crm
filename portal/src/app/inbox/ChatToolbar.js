"use client";

import { useState, useRef } from "react";
import {
  Zap,
  Image as ImageIcon,
  Paperclip,
  Smile,
  Package,
  Mic,
  ShoppingCart,
  X,
  FileText,
} from "lucide-react";
import EmojiPickerPopover from "./EmojiPickerPopover";

/**
 * ADDP CRM — Thanh Công Cụ Nhắn Tin Đa Kênh Chuẩn Vpage (WBS-21 & WBS-22)
 * Tích hợp 6 mục tác nghiệp theo yêu cầu:
 * 1. Trả lời nhanh
 * 2. Gửi ảnh / Gửi file
 * 3. Gửi icon
 * 4. Gửi sản phẩm
 * 5. Gửi ghi âm
 * 6. Tạo đơn hàng lên KiotViet
 */

export default function ChatToolbar({
  onOpenQuickReplies,
  onOpenProductPicker,
  onOpenKiotVietOrder,
  onToggleVoiceRecorder,
  isRecordingVoice,
  onSelectEmoji,
  onFileSelected,
  attachedFiles = [],
  onRemoveAttachment,
}) {
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const emojiTriggerRef = useRef(null);
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleImageChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onFileSelected(files, true);
    }
    e.target.value = "";
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onFileSelected(files, false);
    }
    e.target.value = "";
  };

  return (
    <div className="relative border-t border-slate-800/80 bg-slate-900/90 pt-1.5 pb-1">
      {/* File đính kèm xem trước (nếu có) */}
      {attachedFiles.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 overflow-x-auto no-scrollbar mb-1.5 border-b border-slate-800 bg-slate-950/60">
          {attachedFiles.map((att, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 p-1.5 rounded-lg bg-slate-800 border border-slate-700 max-w-xs text-xs text-slate-200 shrink-0"
            >
              {att.isImage && att.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={att.previewUrl}
                  alt={att.name}
                  className="w-8 h-8 rounded object-cover border border-slate-600 shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded bg-slate-700 flex items-center justify-center text-slate-300 shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
              )}

              <div className="min-w-0 flex-1 truncate">
                <p className="truncate font-semibold text-[11px]">{att.name}</p>
                <p className="text-[10px] text-slate-400">
                  {att.size ? `${(att.size / 1024).toFixed(0)} KB` : "Đính kèm"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => onRemoveAttachment(idx)}
                className="w-5 h-5 rounded-full hover:bg-slate-700 text-slate-400 hover:text-rose-400 flex items-center justify-center cursor-pointer shrink-0"
                title="Gỡ file đính kèm"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Dãy nút bấm chức năng chuẩn Vpage */}
      <div className="flex items-center justify-between px-2 gap-1 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          {/* 1. Trả lời nhanh */}
          <button
            type="button"
            onClick={onOpenQuickReplies}
            className="px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer border border-transparent hover:border-slate-700"
            title="Mẫu trả lời nhanh (Phím tắt: / hoặc Ctrl+Q)"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="hidden sm:inline">Trả lời nhanh</span>
          </button>

          {/* 2. Gửi ảnh */}
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            className="px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer border border-transparent hover:border-slate-700"
            title="Gửi hình ảnh (.jpg, .png, .webp)"
          >
            <ImageIcon className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="hidden sm:inline">Gửi ảnh</span>
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageChange}
            className="hidden"
          />

          {/* Gửi file tài liệu */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-2 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer border border-transparent hover:border-slate-700"
            title="Gửi tài liệu đính kèm (PDF, Word, Excel...)"
          >
            <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="hidden md:inline">Gửi file</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* 3. Gửi icon / Emoji */}
          <div className="relative">
            <button
              ref={emojiTriggerRef}
              type="button"
              onClick={() => setIsEmojiOpen(!isEmojiOpen)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer border ${
                isEmojiOpen
                  ? "bg-slate-800 text-amber-400 border-amber-500/40"
                  : "text-slate-300 hover:text-white hover:bg-slate-800 border-transparent hover:border-slate-700"
              }`}
              title="Chọn biểu tượng cảm xúc (Emoji & Icon y tế)"
            >
              <Smile className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="hidden sm:inline">Icon</span>
            </button>

            <EmojiPickerPopover
              isOpen={isEmojiOpen}
              onClose={() => setIsEmojiOpen(false)}
              onSelectEmoji={(emoji) => {
                onSelectEmoji(emoji);
                setIsEmojiOpen(false);
              }}
              triggerRef={emojiTriggerRef}
            />
          </div>

          {/* 4. Gửi sản phẩm */}
          <button
            type="button"
            onClick={onOpenProductPicker}
            className="px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer border border-transparent hover:border-slate-700"
            title="Danh mục sản phẩm Dược phẩm ADDP & KiotViet"
          >
            <Package className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="hidden sm:inline">Sản phẩm</span>
          </button>

          {/* 5. Gửi ghi âm */}
          <button
            type="button"
            onClick={onToggleVoiceRecorder}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer border ${
              isRecordingVoice
                ? "bg-rose-950/60 text-rose-400 border-rose-500/50"
                : "text-slate-300 hover:text-white hover:bg-slate-800 border-transparent hover:border-slate-700"
            }`}
            title="Ghi âm giọng nói gửi cho khách (Voice message)"
          >
            <Mic className={`w-3.5 h-3.5 text-rose-400 shrink-0 ${isRecordingVoice ? "animate-pulse" : ""}`} />
            <span className="hidden sm:inline">Ghi âm</span>
          </button>
        </div>

        {/* 6. Tạo đơn hàng lên KiotViet */}
        <button
          type="button"
          onClick={onOpenKiotVietOrder}
          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs badge-solid-white shrink-0 ml-auto"
          title="Tạo đơn hàng trực tiếp lên KiotViet cho khách hàng này"
        >
          <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
          <span>Tạo đơn KiotViet</span>
        </button>
      </div>
    </div>
  );
}
