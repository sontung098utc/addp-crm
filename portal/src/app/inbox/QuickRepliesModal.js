"use client";

import { useState, useMemo, useEffect } from "react";
import { Search, Zap, Send, Plus, Trash2, Copy, Check, MessageSquare, X } from "lucide-react";

/**
 * ADDP CRM — Bộ Mẫu Trả Lời Nhanh Chuyên Nghiệp (Theo Chuẩn Vpage & Dược Phẩm ADDP)
 * Hỗ trợ phân loại, tìm kiếm theo từ khóa / phím tắt, thay thế biến {customerName},
 * và cho phép nhân viên tự tạo thêm kịch bản phản hồi riêng.
 */

const DEFAULT_TEMPLATES = [
  // 1. Chào hỏi & Mở đầu
  {
    id: "greet_1",
    category: "Chào hỏi",
    shortcut: "/chao",
    title: "Chào khách mới - Dược sĩ tư vấn",
    content: "Dạ em chào anh/chị {customerName} ạ! Em là Dược sĩ chuyên môn bên Dược Phẩm ADDP. Em có thể hỗ trợ tư vấn sức khỏe cho anh/chị như thế nào ạ?",
  },
  {
    id: "greet_2",
    category: "Chào hỏi",
    shortcut: "/chaocu",
    title: "Chào khách hàng cũ quay lại",
    content: "Dạ em chào anh/chị {customerName} ạ! Đợt này tình hình sức khỏe và chỉ số đường huyết của mình đang ổn định không ạ?",
  },

  // 2. Tư vấn sản phẩm Glucare PLUS & Bệnh lý tiểu đường
  {
    id: "prod_glucare_intro",
    category: "Tư vấn Glucare PLUS",
    shortcut: "/glucare",
    title: "Giới thiệu Sữa hạt Glucare PLUS",
    content: "Dạ dòng Sữa hạt chuyên biệt cho người tiểu đường Glucare PLUS bên em được chiết xuất từ 12 loại hạt cao cấp (óc chó, macca, hạnh nhân, yến mạch...), bổ sung đường Isomalt hấp thu chậm, hệ chất béo MUFA & PUFA tốt cho tim mạch, giúp kiểm soát đường huyết ổn định và tăng cường thể lực rất tốt ạ.",
  },
  {
    id: "prod_glucare_usage",
    category: "Tư vấn Glucare PLUS",
    shortcut: "/hd-glucare",
    title: "Hướng dẫn pha và sử dụng Glucare PLUS",
    content: "Dạ anh/chị {customerName} dùng mỗi ngày 2 ly vào bữa sáng và bữa phụ (khoảng 15h chiều) nhé ạ. Cách pha: 4 muỗng gạt ngang hòa tan cùng 200ml nước ấm 50 độ C, khuấy đều là dùng được ngay. Uống đều đặn giúp hạn chế hạ đường huyết lúc đói và bổ sung dinh dưỡng toàn diện ạ.",
  },
  {
    id: "prod_vad_intro",
    category: "Tư vấn Glucare PLUS",
    shortcut: "/andương",
    title: "Tư vấn Viên An Đường ADDP",
    content: "Dạ Viên An Đường ADDP có thành phần thảo dược tự nhiên: Dây thìa canh, Giảo cổ lam, Cao mướp đắng... hỗ trợ hạ đường huyết, giảm HbA1c và ngăn ngừa biến chứng tê bì chân tay, mờ mắt do tiểu đường ạ.",
  },

  // 3. Báo giá & Combo Ưu Đãi
  {
    id: "price_1hop",
    category: "Báo giá & Ưu đãi",
    shortcut: "/gia1",
    title: "Báo giá 1 hộp lẻ",
    content: "Dạ giá niêm yết của Sữa hạt Glucare PLUS lon lớn 900g là 450.000đ/lon ạ. Phí giao hàng toàn quốc là 30.000đ, nhận hàng sau 2-3 ngày ạ.",
  },
  {
    id: "price_combo2",
    category: "Báo giá & Ưu đãi",
    shortcut: "/combo2",
    title: "Combo 2 lon - Miễn phí vận chuyển",
    content: "Dạ đợt này bên em có chương trình trợ giá: Khi anh/chị lấy combo 2 lon Glucare PLUS 900g giá ưu đãi chỉ còn 850.000đ (tiết kiệm 50.000đ) và được MIỄN PHÍ VẬN CHUYỂN toàn quốc tận nhà ạ!",
  },
  {
    id: "price_combo3",
    category: "Báo giá & Ưu đãi",
    shortcut: "/combo3",
    title: "Combo 3 lon - Tặng quà tri ân",
    content: "Dạ em khuyên thật lòng anh/chị {customerName} nên lấy Combo 3 lon đủ liệu trình 1 tháng: Giá ưu đãi chỉ 1.250.000đ + TẶNG KÈM 1 hộp viên uống bổ trợ sức khỏe + Freeship tận tay. Vừa tiết kiệm lại đảm bảo hiệu quả dinh dưỡng liên tục ạ!",
  },

  // 4. Thanh toán & Thông tin Chuyển Khoản
  {
    id: "pay_stk",
    category: "Thanh toán & STK",
    shortcut: "/stk",
    title: "Thông tin STK MB Bank Công ty ADDP",
    content: "Dạ anh/chị có thể chuyển khoản thanh toán qua tài khoản chính thức của công ty:\n🏦 Ngân hàng: MB Bank (Quân Đội)\n🔢 Số tài khoản: 1900123456\n👤 Tên chủ TK: CONG TY CP DUOC PHAM ADDP\n📝 Nội dung CK: [Họ tên] + [Số điện thoại]\nSau khi chuyển anh/chị chụp màn hình gửi em để em ưu tiên gửi hàng đi sớm nhé ạ!",
  },
  {
    id: "pay_cod",
    category: "Thanh toán & STK",
    shortcut: "/cod",
    title: "Thanh toán khi nhận hàng (COD)",
    content: "Dạ bên em hỗ trợ thanh toán khi nhận hàng (COD). Khi bưu tá giao đến, anh/chị được mở hộp kiểm tra đúng sản phẩm chính hãng Dược Phẩm ADDP, tem niêm phong nguyên vẹn rồi mới thanh toán tiền ạ!",
  },

  // 5. Xác nhận đơn & Vận chuyển
  {
    id: "order_confirm",
    category: "Vận chuyển & Chăm sóc",
    shortcut: "/xacnhan",
    title: "Xác nhận đã lên đơn hàng",
    content: "Dạ em đã hoàn tất tạo đơn hàng cho anh/chị {customerName} rồi ạ. Đơn sẽ được xuất từ Kho Tổng Dược Phẩm ADDP và giao đến mình sau 2-3 ngày. Nhân viên giao hàng sẽ gọi trước khi giao, anh/chị để ý điện thoại giúp em nhé!",
  },
  {
    id: "care_day3",
    category: "Vận chuyển & Chăm sóc",
    shortcut: "/cs3",
    title: "Chăm sóc khách sau 3 ngày nhận hàng",
    content: "Dạ em chào anh/chị {customerName}! Em Dược sĩ bên ADDP nhắn tin hỏi thăm mình đã nhận được sữa Glucare PLUS chưa ạ? Anh/chị pha uống có thấy thơm ngon và hợp khẩu vị không ạ?",
  },
];

const CATEGORIES = [
  "Tất cả",
  "Chào hỏi",
  "Tư vấn Glucare PLUS",
  "Báo giá & Ưu đãi",
  "Thanh toán & STK",
  "Vận chuyển & Chăm sóc",
  "Tự tạo",
];

export default function QuickRepliesModal({
  isOpen,
  onClose,
  onSelect,
  onSendDirect,
  customerName = "Khách hàng",
}) {
  const [selectedCategory, setSelectedCategory] = useState("Tất cả");
  const [searchQuery, setSearchQuery] = useState("");
  const [customTemplates, setCustomTemplates] = useState([]);
  const [copiedId, setCopiedId] = useState(null);

  // Form tạo mẫu mới
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newShortcut, setNewShortcut] = useState("/");
  const [newCategory, setNewCategory] = useState("Chào hỏi");
  const [newContent, setNewContent] = useState("");

  // Nạp kịch bản tự tạo từ localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("addp_custom_quick_templates");
        if (saved) {
          setCustomTemplates(JSON.parse(saved));
        }
      } catch {}
    }
  }, []);

  const allTemplates = useMemo(() => {
    return [...DEFAULT_TEMPLATES, ...customTemplates];
  }, [customTemplates]);

  const filteredTemplates = useMemo(() => {
    let list = allTemplates;
    if (selectedCategory === "Tự tạo") {
      list = customTemplates;
    } else if (selectedCategory !== "Tất cả") {
      list = list.filter((t) => t.category === selectedCategory);
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.shortcut.toLowerCase().includes(q) ||
          t.content.toLowerCase().includes(q)
      );
    }
    return list;
  }, [allTemplates, customTemplates, selectedCategory, searchQuery]);

  if (!isOpen) return null;

  const replacePlaceholders = (text) => {
    return text
      .replace(/{customerName}/g, customerName || "anh/chị")
      .replace(/{name}/g, customerName || "anh/chị");
  };

  const handleCopy = (t) => {
    const finalTxt = replacePlaceholders(t.content);
    navigator.clipboard?.writeText(finalTxt);
    setCopiedId(t.id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleInsert = (t) => {
    const finalTxt = replacePlaceholders(t.content);
    onSelect(finalTxt);
    onClose();
  };

  const handleSend = (t) => {
    const finalTxt = replacePlaceholders(t.content);
    if (onSendDirect) {
      onSendDirect(finalTxt);
    } else {
      onSelect(finalTxt);
    }
    onClose();
  };

  const handleSaveNewTemplate = (e) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;

    const created = {
      id: `custom_${Date.now()}`,
      category: newCategory,
      shortcut: newShortcut.startsWith("/") ? newShortcut : `/${newShortcut}`,
      title: newTitle.trim(),
      content: newContent.trim(),
      isCustom: true,
    };

    const nextList = [created, ...customTemplates];
    setCustomTemplates(nextList);
    try {
      localStorage.setItem("addp_custom_quick_templates", JSON.stringify(nextList));
    } catch {}

    setNewTitle("");
    setNewShortcut("/");
    setNewContent("");
    setIsCreating(false);
    setSelectedCategory("Tự tạo");
  };

  const handleDeleteCustom = (id) => {
    const nextList = customTemplates.filter((t) => t.id !== id);
    setCustomTemplates(nextList);
    try {
      localStorage.setItem("addp_custom_quick_templates", JSON.stringify(nextList));
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Mẫu Trả Lời Nhanh (Vpage Style)
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Tự động thay thế tên khách: <span className="text-blue-600 dark:text-blue-400 font-semibold">{customerName || "Khách"}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsCreating(!isCreating)}
              className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isCreating ? "Danh sách" : "+ Thêm mẫu"}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {isCreating ? (
          /* Form tạo mẫu mới */
          <form onSubmit={handleSaveNewTemplate} className="p-5 space-y-3.5 overflow-y-auto">
            <h4 className="font-bold text-xs uppercase tracking-wide text-slate-500">Thêm Mẫu Kịch Bản Phản Hồi Mới</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Tiêu đề mẫu *
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="VD: Chào mừng khách mới"
                  className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Phím tắt gọi nhanh
                </label>
                <input
                  type="text"
                  value={newShortcut}
                  onChange={(e) => setNewShortcut(e.target.value)}
                  placeholder="VD: /chao"
                  className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nhóm kịch bản
              </label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
              >
                {CATEGORIES.filter((c) => c !== "Tất cả" && c !== "Tự tạo").map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nội dung tin nhắn * (sử dụng <code className="text-blue-500 font-mono">{"{customerName}"}</code> để tự chèn tên khách)
              </label>
              <textarea
                rows={4}
                required
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Dạ em chào anh/chị {customerName}..."
                className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 resize-none leading-relaxed"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                Lưu mẫu kịch bản
              </button>
            </div>
          </form>
        ) : (
          /* Danh sách mẫu */
          <>
            {/* Search & Tabs */}
            <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo từ khóa hoặc phím tắt (/chao, /glucare, /combo...)"
                  className="w-full text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 pl-8 pr-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Category Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                      selectedCategory === cat
                        ? "bg-blue-600 text-white shadow-xs"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Template List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5 min-h-[280px]">
              {filteredTemplates.length === 0 ? (
                <div className="text-center py-12 text-xs text-slate-400">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Không tìm thấy mẫu tin nhắn nào phù hợp.
                </div>
              ) : (
                filteredTemplates.map((t) => {
                  const previewText = replacePlaceholders(t.content);
                  return (
                    <div
                      key={t.id}
                      className="group p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 hover:border-blue-500/60 dark:hover:border-blue-500/60 transition-all shadow-2xs hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
                            {t.title}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-mono text-[10px] font-bold">
                            {t.shortcut}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            • {t.category}
                          </span>
                        </div>

                        {t.isCustom && (
                          <button
                            type="button"
                            onClick={() => handleDeleteCustom(t.id)}
                            className="text-slate-400 hover:text-rose-500 transition-colors p-1"
                            title="Xóa mẫu tự tạo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap mb-2.5 bg-slate-50 dark:bg-slate-900/60 p-2 rounded-lg border border-slate-100 dark:border-slate-800/80">
                        {previewText}
                      </p>

                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleCopy(t)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          {copiedId === t.id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-500" />
                              <span className="text-emerald-500">Đã copy</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Sao chép</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleInsert(t)}
                          className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white text-[11px] font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                        >
                          Chèn vào chat
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSend(t)}
                          className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold transition-colors inline-flex items-center gap-1 shadow-xs cursor-pointer badge-solid-white"
                        >
                          <span>Gửi ngay</span>
                          <Send className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
