"use client";

import { useState, useEffect, useMemo } from "react";

const MATCH_TYPE_LABELS = {
  CONTAINS: { label: "Chứa từ khóa (Mềm dẻo)", color: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  EXACT: { label: "Khớp chính xác 100%", color: "bg-purple-500/15 text-purple-300 border-purple-500/30" },
  STARTS_WITH: { label: "Bắt đầu bằng từ khóa", color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
};

const CHANNEL_OPTIONS = [
  { value: "ALL", label: "Tất cả kênh (7 Nền tảng)" },
  { value: "ZALO_PERSONAL", label: "Zalo Cá Nhân (Multi-QR)" },
  { value: "ZALO_OA", label: "Zalo OA Doanh Nghiệp" },
  { value: "FACEBOOK_FANPAGE", label: "Fanpage Facebook" },
  { value: "TIKTOK_SHOP", label: "TikTok Shop" },
  { value: "SHOPEE", label: "Shopee" },
];

export default function KeywordAutoReplyTab() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form State
  const [formName, setFormName] = useState("");
  const [formKeywords, setFormKeywords] = useState("");
  const [formMatchType, setFormMatchType] = useState("CONTAINS");
  const [formChannels, setFormChannels] = useState(["ALL"]);
  const [formReplyText, setFormReplyText] = useState("");
  const [formDelay, setFormDelay] = useState(5);
  const [formEnabled, setFormEnabled] = useState(true);

  // Simulator State
  const [testMessage, setTestMessage] = useState("Sữa hạt này giá bao nhiêu tiền một hộp hả em?");
  const [testCustomerName, setTestCustomerName] = useState("Nguyễn Thị Mai");
  const [testChannel, setTestChannel] = useState("ALL");

  useEffect(() => {
    fetchRules();
  }, []);

  async function fetchRules() {
    setLoading(true);
    try {
      const res = await fetch("/api/broadcast/auto-reply-rules");
      const data = await res.json();
      if (data.ok && Array.isArray(data.rules)) {
        setRules(data.rules);
      }
    } catch {
      showToast("Không thể tải danh sách quy tắc từ khóa", "error");
    } finally {
      setLoading(false);
    }
  }

  function showToast(text, type = "success") {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  }

  function openCreateModal() {
    setEditingRule(null);
    setFormName("");
    setFormKeywords("");
    setFormMatchType("CONTAINS");
    setFormChannels(["ALL"]);
    setFormReplyText("Dạ chào {fullName}! Em là {assignedStaff} bên Dược phẩm ADDP đây ạ. Em gửi thông tin chi tiết về {productName} cho mình nhé ạ!");
    setFormDelay(5);
    setFormEnabled(true);
    setModalOpen(true);
  }

  function openEditModal(rule) {
    setEditingRule(rule);
    setFormName(rule.name || "");
    setFormKeywords(Array.isArray(rule.keywords) ? rule.keywords.join(", ") : "");
    setFormMatchType(rule.matchType || "CONTAINS");
    setFormChannels(rule.channels || ["ALL"]);
    setFormReplyText(rule.replyText || "");
    setFormDelay(rule.delaySeconds || 5);
    setFormEnabled(rule.enabled !== false);
    setModalOpen(true);
  }

  async function handleToggleRule(rule) {
    const updated = { ...rule, enabled: !rule.enabled };
    try {
      const res = await fetch("/api/broadcast/auto-reply-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      const data = await res.json();
      if (data.ok) {
        setRules((prev) => prev.map((r) => (r.id === rule.id ? data.rule : r)));
        showToast(
          `Đã ${!rule.enabled ? "BẬT" : "TẮT"} quy tắc "${rule.name}"`,
          !rule.enabled ? "success" : "info"
        );
      }
    } catch {
      showToast("Lỗi khi cập nhật trạng thái quy tắc", "error");
    }
  }

  async function handleDeleteRule(id, name) {
    if (!confirm(`Bạn có chắc chắn muốn xóa quy tắc "${name}"?`)) return;
    try {
      const res = await fetch(`/api/broadcast/auto-reply-rules?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.ok) {
        setRules((prev) => prev.filter((r) => r.id !== id));
        showToast(`Đã xóa quy tắc "${name}"`);
      }
    } catch {
      showToast("Lỗi khi xóa quy tắc", "error");
    }
  }

  async function handleSaveForm(e) {
    e.preventDefault();
    const kwList = formKeywords
      .split(/[,;\n]+/)
      .map((k) => k.trim())
      .filter(Boolean);

    if (kwList.length === 0) {
      alert("Vui lòng nhập ít nhất 01 từ khóa nhận diện!");
      return;
    }

    setSaving(true);
    const payload = {
      id: editingRule?.id,
      name: formName.trim() || "Quy tắc tự động trả lời",
      keywords: kwList,
      matchType: formMatchType,
      channels: formChannels,
      replyText: formReplyText.trim(),
      delaySeconds: Number(formDelay) || 5,
      enabled: formEnabled,
    };

    try {
      const res = await fetch("/api/broadcast/auto-reply-rules", {
        method: editingRule ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) {
        if (editingRule) {
          setRules((prev) => prev.map((r) => (r.id === editingRule.id ? data.rule : r)));
          showToast(`Đã cập nhật quy tắc "${data.rule.name}"`);
        } else {
          setRules((prev) => [data.rule, ...prev]);
          showToast(`Đã thêm mới quy tắc "${data.rule.name}"`);
        }
        setModalOpen(false);
      } else {
        alert(data.error || "Không thể lưu quy tắc.");
      }
    } catch (err) {
      alert("Lỗi kết nối khi lưu: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  function insertVariable(varTag) {
    setFormReplyText((prev) => prev + varTag);
  }

  // Kết quả mô phỏng Simulator
  const simulatedMatch = useMemo(() => {
    if (!testMessage.trim()) return null;
    const cleanMsg = testMessage.toLowerCase().trim();

    for (const rule of rules) {
      if (!rule.enabled) continue;
      // Kiểm tra kênh
      if (
        testChannel !== "ALL" &&
        !rule.channels?.includes("ALL") &&
        !rule.channels?.includes(testChannel)
      ) {
        continue;
      }

      const matchFound = (rule.keywords || []).some((kw) => {
        const cleanKw = String(kw || "").toLowerCase().trim();
        if (!cleanKw) return false;
        if (rule.matchType === "EXACT") return cleanMsg === cleanKw;
        if (rule.matchType === "STARTS_WITH") return cleanMsg.startsWith(cleanKw);
        return cleanMsg.includes(cleanKw); // default CONTAINS
      });

      if (matchFound) {
        const parts = testCustomerName.trim().split(/\s+/);
        const firstName = parts[parts.length - 1] || "Bạn";
        let interpolated = rule.replyText
          .replace(/\{fullName\}/gi, testCustomerName)
          .replace(/\{firstName\}/gi, firstName)
          .replace(/\{productName\}/gi, "Sữa hạt Glucare Plus")
          .replace(/\{assignedStaff\}/gi, "Dược sĩ Thảo");

        return {
          matched: true,
          rule,
          replyText: interpolated,
          delaySeconds: rule.delaySeconds || 5,
        };
      }
    }

    return { matched: false };
  }, [testMessage, testCustomerName, testChannel, rules]);

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 rounded-2xl border px-4 py-3 text-xs font-semibold backdrop-blur-xl shadow-2xl transition-all ${
            toast.type === "error"
              ? "border-rose-500/40 bg-rose-950/90 text-rose-200"
              : toast.type === "info"
              ? "border-blue-500/40 bg-blue-950/90 text-blue-200"
              : "border-emerald-500/40 bg-emerald-950/90 text-emerald-200"
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Top Banner & Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-sm">
          <span className="text-[11px] font-medium text-slate-400 block">Tổng số quy tắc</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{rules.length}</span>
            <span className="text-xs text-emerald-400 font-semibold">
              ({rules.filter((r) => r.enabled).length} Đang chạy)
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-sm">
          <span className="text-[11px] font-medium text-slate-400 block">Lượt tự động kích hoạt</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-blue-400">
              {rules.reduce((acc, r) => acc + (r.triggerCount || 0), 0)}
            </span>
            <span className="text-xs text-slate-400">lần phản hồi</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-sm">
          <span className="text-[11px] font-medium text-slate-400 block">Cơ chế bảo vệ Anti-Ban</span>
          <div className="mt-1 flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-sm font-semibold text-emerald-300">Giả lập người thật 5-15s</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-slate-400 block">Hành động</span>
            <span className="text-xs text-slate-300 font-medium">Tạo quy tắc trả lời mới</span>
          </div>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-2 text-xs font-semibold shadow-lg shadow-blue-600/20 transition-all active:scale-95"
          >
            <span>+</span>
            <span>Thêm Quy Tắc</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Danh Sách Quy Tắc (Trái) & Simulator Kiểm Thử (Phải) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Danh Sách Quy Tắc */}
        <div className="xl:col-span-8 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>📋 Danh Sách Quy Tắc Từ Khóa Tự Động</span>
              <span className="text-xs font-normal text-slate-400">
                (Áp dụng khi khách nhắn tin chứa từ khóa khớp)
              </span>
            </h3>
            <button
              onClick={fetchRules}
              className="text-xs text-slate-400 hover:text-white transition-colors"
            >
              🔄 Tải lại
            </button>
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs text-slate-400">Đang tải quy tắc...</div>
          ) : rules.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 p-12 text-center">
              <p className="text-sm text-slate-400">Chưa có quy tắc từ khóa nào.</p>
              <button
                onClick={openCreateModal}
                className="mt-3 text-xs text-blue-400 hover:underline font-semibold"
              >
                Tạo quy tắc đầu tiên ngay &rarr;
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => {
                const matchBadge = MATCH_TYPE_LABELS[rule.matchType] || MATCH_TYPE_LABELS.CONTAINS;
                return (
                  <div
                    key={rule.id}
                    className={`rounded-2xl border p-4.5 transition-all backdrop-blur-sm ${
                      rule.enabled
                        ? "border-slate-800 bg-slate-900/70 hover:border-slate-700"
                        : "border-slate-800/40 bg-slate-950/40 opacity-60"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-white">{rule.name}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${matchBadge.color}`}
                          >
                            {matchBadge.label}
                          </span>
                          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
                            ⏱️ Trễ: {rule.delaySeconds || 5}s
                          </span>
                          <span className="rounded-full bg-slate-800/80 px-2 py-0.5 text-[10px] text-slate-400">
                            🎯 Đã kích hoạt: {rule.triggerCount || 0} lần
                          </span>
                        </div>

                        {/* Badges Từ khóa */}
                        <div className="flex items-center gap-1.5 flex-wrap pt-1">
                          <span className="text-[11px] text-slate-400">Từ khóa:</span>
                          {(rule.keywords || []).map((kw, i) => (
                            <span
                              key={i}
                              className="rounded-lg bg-slate-800/90 border border-slate-700/60 px-2 py-0.5 text-[11px] font-mono text-cyan-300"
                            >
                              "{kw}"
                            </span>
                          ))}
                        </div>

                        {/* Nội dung câu trả lời */}
                        <div className="rounded-xl bg-slate-950/70 border border-slate-800/80 p-3 mt-2">
                          <p className="text-xs text-slate-300 leading-relaxed font-sans line-clamp-3">
                            {rule.replyText}
                          </p>
                        </div>
                      </div>

                      {/* Nút hành động */}
                      <div className="flex items-center sm:flex-col gap-2 pt-1 sm:pt-0 shrink-0">
                        <button
                          onClick={() => handleToggleRule(rule)}
                          className={`w-24 py-1.5 rounded-xl text-[11px] font-semibold border transition-all ${
                            rule.enabled
                              ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25"
                              : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
                          }`}
                        >
                          {rule.enabled ? "🟢 Đang Chạy" : "⚪ Đã Tắt"}
                        </button>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEditModal(rule)}
                            className="rounded-lg p-1.5 text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                            title="Chỉnh sửa"
                          >
                            ✏️ Sửa
                          </button>
                          <button
                            onClick={() => handleDeleteRule(rule.id, rule.name)}
                            className="rounded-lg p-1.5 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 transition-colors"
                            title="Xóa"
                          >
                            🗑️ Xóa
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Cột Phải: Simulator Thử Nghiệm Từ Khóa */}
        <div className="xl:col-span-4 space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 backdrop-blur-md shadow-xl space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>🧪 Trình Thử Nghiệm Từ Khóa (Playground)</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-1">
                Nhập tin nhắn khách hàng bất kỳ để kiểm tra xem hệ thống sẽ kích hoạt câu trả lời nào
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Tên khách hàng thử nghiệm</label>
                <input
                  type="text"
                  value={testCustomerName}
                  onChange={(e) => setTestCustomerName(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
                  placeholder="Nhập tên khách..."
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Nội dung tin nhắn khách gửi đến</label>
                <textarea
                  rows={3}
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                  placeholder="Nhập câu khách hỏi..."
                />
              </div>

              {/* Kết quả mô phỏng */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3 space-y-2">
                <span className="text-[11px] font-semibold text-slate-400 block">Kết Quả Phân Tích:</span>
                {simulatedMatch?.matched ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold">
                        ✅ Khớp Quy Tắc
                      </span>
                      <span className="text-xs font-bold text-white">
                        {simulatedMatch.rule.name}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Độ trễ giả lập: <span className="text-white font-mono">{simulatedMatch.delaySeconds}s</span> (Người dùng thấy trạng thái "Đang gõ...")
                    </div>
                    <div className="rounded-lg bg-blue-950/40 border border-blue-800/40 p-2.5 text-xs text-blue-100 leading-relaxed font-sans">
                      {simulatedMatch.replyText}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 italic py-1">
                    ❌ Không khớp từ khóa nào. Tin nhắn sẽ được chuyển cho Sale trực hoặc Bot AI tổng hợp trả lời theo tài liệu sản phẩm.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Tạo / Sửa Quy Tắc */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">
                  {editingRule ? "✏️ Chỉnh Sửa Quy Tắc Từ Khóa" : "⚡ Thêm Quy Tắc Từ Khóa Mới"}
                </h3>
                <p className="text-xs text-slate-400">
                  Cấu hình từ khóa nhận diện và nội dung câu trả lời tự động cho khách
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Tên quy tắc gợi nhớ *
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ví dụ: Tư vấn giá Sữa Glucare Plus..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Các từ khóa nhận diện (Phân cách bằng dấu phẩy) *
                </label>
                <input
                  type="text"
                  required
                  value={formKeywords}
                  onChange={(e) => setFormKeywords(e.target.value)}
                  placeholder="giá, bao nhiêu, bao tiền, giá bao nhiêu, nhiêu tiền"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Chỉ cần khách gửi tin nhắn chứa một trong các từ khóa này, hệ thống sẽ tự động gửi câu trả lời.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Kiểu khớp từ khóa</label>
                  <select
                    value={formMatchType}
                    onChange={(e) => setFormMatchType(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="CONTAINS">Chứa từ khóa (Khuyên dùng)</option>
                    <option value="EXACT">Khớp chính xác 100%</option>
                    <option value="STARTS_WITH">Bắt đầu bằng từ khóa</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Độ trễ giả lập gõ phím: <span className="text-blue-400 font-bold">{formDelay}s</span>
                  </label>
                  <input
                    type="range"
                    min={2}
                    max={60}
                    value={formDelay}
                    onChange={(e) => setFormDelay(Number(e.target.value))}
                    className="w-full accent-blue-500 mt-2"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>2s (Nhanh)</span>
                    <span>15s (Khuyên dùng)</span>
                    <span>60s (Chậm)</span>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-300">
                    Nội dung câu trả lời tự động *
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-400">Chèn nhanh biến:</span>
                    <button
                      type="button"
                      onClick={() => insertVariable(" {fullName}")}
                      className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-blue-300 hover:bg-slate-700"
                    >
                      + Tên KH
                    </button>
                    <button
                      type="button"
                      onClick={() => insertVariable(" {productName}")}
                      className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-emerald-300 hover:bg-slate-700"
                    >
                      + Tên SP
                    </button>
                    <button
                      type="button"
                      onClick={() => insertVariable(" {assignedStaff}")}
                      className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-purple-300 hover:bg-slate-700"
                    >
                      + Dược sĩ
                    </button>
                  </div>
                </div>
                <textarea
                  rows={4}
                  required
                  value={formReplyText}
                  onChange={(e) => setFormReplyText(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-xs text-white leading-relaxed focus:border-blue-500 focus:outline-none"
                  placeholder="Soạn nội dung tin nhắn tự động gửi cho khách..."
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formEnabled}
                    onChange={(e) => setFormEnabled(e.target.checked)}
                    className="rounded accent-blue-500"
                  />
                  <span className="text-xs text-slate-300 font-medium">Kích hoạt quy tắc ngay sau khi lưu</span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-xl bg-blue-600 hover:bg-blue-500 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-600/20 disabled:opacity-50"
                  >
                    {saving ? "Đang lưu..." : editingRule ? "Cập Nhật" : "Tạo Quy Tắc"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
