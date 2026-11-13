"use client";

import { useState, useRef, useEffect } from "react";
import { Smile, X } from "lucide-react";

/**
 * ADDP CRM — Bộ Chọn Icon & Emoji Cảm Xúc Nhanh (Vpage Style)
 * Hỗ trợ các biểu tượng chat bán hàng, chăm sóc sức khỏe & y tế dược phẩm
 */

const EMOJI_GROUPS = [
  {
    name: "Phổ biến",
    emojis: ["👍", "❤️", "😊", "🥰", "🙏", "👏", "🎉", "🔥", "💯", "🤝", "⭐", "✨", "💬", "📞"],
  },
  {
    name: "Cảm xúc",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😇", "😉",
      "😍", "🥰", "😘", "😋", "😜", "😎", "🤩", "🥳", "🤗", "🤔",
      "🤫", "🤭", "😴", "😷", "🤒", "🤕", "💪", "🙌", "👋", "👌"
    ],
  },
  {
    name: "Y tế & Sức khỏe",
    emojis: [
      "💊", "🩺", "🌿", "🥛", "🍎", "🥦", "🍵", "💧", "🩹", "🌡️",
      "🏥", "🧬", "🧪", "🏃", "🧘", "🍏", "🥑", "🍋", "🥣", "🍯"
    ],
  },
  {
    name: "Bán hàng & Đơn hàng",
    emojis: [
      "📦", "🚚", "🛵", "⏰", "💰", "💳", "🛒", "🏷️", "🎁", "🎯",
      "🧾", "📋", "📍", "📌", "✅", "❌", "⚠️", "🔔", "📢", "🚀"
    ],
  },
];

export default function EmojiPickerPopover({ isOpen, onClose, onSelectEmoji, triggerRef }) {
  const popoverRef = useRef(null);
  const [activeTab, setActiveTab] = useState("Phổ biến");

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        isOpen &&
        popoverRef.current &&
        !popoverRef.current.contains(event.target) &&
        (!triggerRef?.current || !triggerRef.current.contains(event.target))
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  const currentGroup = EMOJI_GROUPS.find((g) => g.name === activeTab) || EMOJI_GROUPS[0];

  return (
    <div
      ref={popoverRef}
      className="absolute bottom-full left-0 mb-2 z-50 w-72 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-100"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
          <Smile className="w-4 h-4 text-amber-500" />
          <span>Biểu tượng & Icon</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-0.5 rounded cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850 overflow-x-auto no-scrollbar">
        {EMOJI_GROUPS.map((g) => (
          <button
            key={g.name}
            type="button"
            onClick={() => setActiveTab(g.name)}
            className={`px-2 py-1 rounded-md text-[10.5px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === g.name
                ? "bg-blue-600 text-white shadow-2xs"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800"
            }`}
          >
            {g.name}
          </button>
        ))}
      </div>

      {/* Emoji Grid */}
      <div className="p-2.5 max-h-48 overflow-y-auto grid grid-cols-7 gap-1 text-center">
        {currentGroup.emojis.map((emoji, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => {
              onSelectEmoji(emoji);
            }}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-lg hover:scale-125 transition-transform cursor-pointer"
            title={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
