"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function BroadcastPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [toast, setToast] = useState(null);

  // Form tạo chiến dịch mới
  const [form, setForm] = useState({
    name: "",
    channelType: "ZALO_PERSONAL",
    accountName: "Sơn Tùng (Zalo Cá Nhân)",
    template: "Chào {fullName}, Dược sĩ ADDP nhắn gửi tới mình: Hôm nay anh/chị nhớ duy trì uống 2 ly sữa Glucare Plus đúng giờ để đường huyết luôn ổn định nhé!",
    targetTag: "Tiểu đường",
    totalRecipients: 20,
    minDelaySec: 45,
    maxDelaySec: 120,
    useAiParaphrase: true,
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/broadcast");
      const data = await res.json();
      if (data.ok) {
        setCampaigns(data.campaigns || []);
      }
    } catch (err) {
      console.error("Lỗi tải chiến dịch:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const handleCreateCampaign = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.template.trim()) {
      alert("Vui lòng nhập tên chiến dịch và nội dung tin nhắn mẫu.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.ok) {
        setShowAddModal(false);
        setToast({ type: "success", text: "Đã thêm chiến dịch vào Hàng đợi gửi tin thông minh!" });
        setTimeout(() => setToast(null), 3000);
        fetchCampaigns();
      } else {
        alert(data.error || "Không thể tạo chiến dịch.");
      }
    } catch {
      alert("Lỗi kết nối khi tạo chiến dịch.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (id, status) => {
    try {
      const res = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "UPDATE_STATUS", id, status }),
      });
      const data = await res.json();
      if (data.ok) {
        fetchCampaigns();
      }
    } catch (err) {
      console.error("Lỗi đổi trạng thái:", err);
    }
  };

  const totalSentToday = campaigns.reduce((acc, c) => acc + (c.sentToday || c.sentCount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Toast thông báo */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-xl border border-emerald-500/40 bg-emerald-950/90 px-4 py-2.5 text-xs text-emerald-200 backdrop-blur-md shadow-xl">
          ✓ {toast.text}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Chiến Dịch Gửi Tin Hàng Loạt & Smart Broadcast Queue
            </h1>
            <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-400 border border-blue-500/20">
              WBS-35 & WBS-36
            </span>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 border border-emerald-500/20">
              🛡️ Anti-Ban: Giãn cách 45-120s
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Tuân thủ Điều 4 AGENTS.md: Tự động giãn cách ngẫu nhiên 45 - 120s/tin, AI biến thiên câu chữ chống spam và giới hạn tối đa 70 tin/ngày/nick Zalo.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 transition shadow-lg shadow-blue-600/30"
          >
            <span>+</span>
            <span>Tạo Chiến Dịch Mới</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {/* Card 1: Tiến độ hôm nay */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Đã Gửi Hôm Nay</span>
            <span className="text-base">🚀</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{totalSentToday}</span>
            <span className="text-xs text-slate-500">/ Hạn mức 70 tin/nick</span>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full"
              style={{ width: `${Math.min(100, (totalSentToday / 70) * 100)}%` }}
            />
          </div>
        </div>

        {/* Card 2: Chiến dịch đang chạy */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Chiến Dịch Đang Chạy</span>
            <span className="text-base">⏳</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-400">
              {campaigns.filter((c) => c.status === "PROCESSING").length}
            </span>
            <span className="text-xs text-slate-500">đang trong hàng đợi</span>
          </div>
        </div>

        {/* Card 3: Độ trễ an toàn */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Độ Trễ Giãn Cách</span>
            <span className="text-base">⏱️</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-400">45s – 120s</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">Ngẫu nhiên chống khóa tài khoản</p>
        </div>

        {/* Card 4: AI Biến Thiên */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>AI Biến Thiên Nội Dung</span>
            <span className="text-base">✨</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-purple-400">100% Bật</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">Tránh trùng lặp văn bản spam</p>
        </div>
      </div>

      {/* Danh sách chiến dịch */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-white text-sm">Hàng Đợi Chiến Dịch Gửi Tin (SmartBroadcastQueue)</h3>
          <span className="text-xs text-slate-400">Tổng cộng: {campaigns.length} chiến dịch</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500 space-y-2">
            <div className="h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p>Đang tải hàng đợi gửi tin...</p>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            Chưa có chiến dịch gửi tin nào. Hãy bấm &quot;+ Tạo Chiến Dịch Mới&quot; để thiết lập.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Tên Chiến Dịch & Kênh</th>
                  <th className="py-3 px-4">Mẫu Tin Cá Nhân Hóa</th>
                  <th className="py-3 px-4">Đối Tượng Nhận</th>
                  <th className="py-3 px-4">Tiến Độ Gửi (Smart Queue)</th>
                  <th className="py-3 px-4">Trạng Thái</th>
                  <th className="py-3 px-4 text-right">Điều Khiển</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {campaigns.map((c) => {
                  const percent = c.totalRecipients > 0 ? Math.round((c.sentCount / c.totalRecipients) * 100) : 0;
                  return (
                    <tr key={c.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-white block">{c.name}</span>
                        <span className="text-[10px] text-blue-400 block mt-0.5">{c.accountName}</span>
                      </td>

                      <td className="py-3.5 px-4 max-w-xs">
                        <p className="line-clamp-2 text-slate-300 italic bg-slate-950 p-2 rounded-lg border border-slate-800/80">
                          &quot;{c.template}&quot;
                        </p>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="rounded bg-blue-500/10 border border-blue-500/30 text-blue-300 px-2 py-0.5 text-[10px] font-semibold">
                          Tag: {c.targetTag}
                        </span>
                        <span className="block text-[10px] text-slate-500 mt-1">
                          Tổng: {c.totalRecipients} khách
                        </span>
                      </td>

                      <td className="py-3.5 px-4 w-44">
                        <div className="flex items-center justify-between text-[11px] mb-1 font-mono">
                          <span>{c.sentCount}/{c.totalRecipients}</span>
                          <span className="font-bold text-blue-400">{percent}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${percent}%` }} />
                        </div>
                        <span className="text-[9px] text-slate-500 block mt-1">
                          Giãn cách: {c.minDelaySec}s - {c.maxDelaySec}s
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        {c.status === "PROCESSING" ? (
                          <span className="rounded bg-emerald-500/20 text-emerald-300 px-2 py-0.5 text-[10px] font-semibold flex items-center gap-1 w-fit">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Đang gửi
                          </span>
                        ) : c.status === "PAUSED" ? (
                          <span className="rounded bg-amber-500/20 text-amber-300 px-2 py-0.5 text-[10px] font-semibold w-fit">
                            Tạm dừng
                          </span>
                        ) : (
                          <span className="rounded bg-blue-500/20 text-blue-300 px-2 py-0.5 text-[10px] font-semibold w-fit">
                            Hoàn tất
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {c.status === "PROCESSING" ? (
                            <button
                              onClick={() => handleUpdateStatus(c.id, "PAUSED")}
                              className="rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 px-2.5 py-1 text-[11px] font-semibold transition"
                            >
                              ⏸️ Tạm dừng
                            </button>
                          ) : (
                            <button
                              onClick={() => handleUpdateStatus(c.id, "PROCESSING")}
                              className="rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 text-[11px] font-semibold transition"
                            >
                              ▶️ Tiếp tục
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Tạo Chiến Dịch Mới */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Tạo Chiến Dịch Gửi Tin Hàng Loạt Mới</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white text-base font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCampaign} className="space-y-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Tên chiến dịch *</label>
                <input
                  type="text"
                  required
                  placeholder="VD: Nhắc lịch uống sữa đều đặn tuần 2"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Tài khoản Zalo gửi</label>
                  <select
                    value={form.accountName}
                    onChange={(e) => setForm({ ...form, accountName: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="Sơn Tùng (Zalo Cá Nhân)">Sơn Tùng (Zalo Cá Nhân)</option>
                    <option value="Dược Sĩ Thu Hà (Zalo Cá Nhân)">Dược Sĩ Thu Hà</option>
                    <option value="Zalo OA Dược Phẩm ADDP">Zalo OA Dược Phẩm ADDP</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Tệp nhận theo Thẻ Tag</label>
                  <select
                    value={form.targetTag}
                    onChange={(e) => setForm({ ...form, targetTag: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="Tất cả">Tất cả khách hàng</option>
                    <option value="Tiểu đường">Khách Tiểu Đường Tuýp 2</option>
                    <option value="Mỡ máu & Gan">Khách Mỡ Máu & Men Gan</option>
                    <option value="Khách VIP">Khách VIP (≥5 đơn)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Mẫu tin nhắn cá nhân hóa ({`{fullName}`}, {`{productName}`}) *
                </label>
                <textarea
                  rows={4}
                  required
                  value={form.template}
                  onChange={(e) => setForm({ ...form, template: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white focus:border-blue-500 focus:outline-none resize-none"
                />
              </div>

              {/* Cài đặt Anti-Ban Điều 4 */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white text-[11px]">🛡️ Cơ chế Anti-Ban (Điều 4 AGENTS.md):</span>
                  <span className="text-emerald-400 text-[10px] font-bold">Bắt buộc tuân thủ</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <div>
                    <span className="text-slate-400 block mb-0.5">Giãn cách ngẫu nhiên:</span>
                    <span className="text-white font-mono font-bold">45 – 120 giây / tin</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-0.5">Giới hạn trong ngày:</span>
                    <span className="text-white font-mono font-bold">Tối đa 70 tin / nick</span>
                  </div>
                </div>
                <label className="flex items-center gap-2 pt-1 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.useAiParaphrase}
                    onChange={(e) => setForm({ ...form, useAiParaphrase: e.target.checked })}
                    className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0"
                  />
                  <span>AI tự động viết lại câu chào để không trùng lặp văn bản 100%</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 font-semibold text-slate-300 hover:text-white"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {submitting ? "Đang đẩy vào Queue..." : "Khởi Chạy Smart Broadcast 🚀"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
