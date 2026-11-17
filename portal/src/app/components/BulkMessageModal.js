"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  Send,
  Users,
  ShieldCheck,
  Clock,
  Sparkles,
  Tag,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
} from "lucide-react";

function hasValidContactInfo(c) {
  if (!c) return false;
  const phoneDigits = String(c.phone || "").replace(/\D/g, "");
  const hasPhone = phoneDigits.length >= 9;
  const hasZalo = Boolean(c.zaloUid || c.zaloThreadId || c.zaloId || c.threadId);
  const hasFb = Boolean(c.facebookId || c.psid);
  return hasPhone || hasZalo || hasFb;
}

export default function BulkMessageModal({
  isOpen,
  onClose,
  zaloAccounts = [],
  facebookPages = [],
  availableTags = [],
  conversations = [],
  initialSelectedCustomers = null,
  onCampaignCreated,
}) {
  const isCustomerMode = Array.isArray(initialSelectedCustomers);
  const [selectedChannel, setSelectedChannel] = useState("ZALO_PERSONAL");
  const [selectedAccount, setSelectedAccount] = useState("ALL");
  const [selectedTag, setSelectedTag] = useState("ALL");
  const [onlyValidContact, setOnlyValidContact] = useState(true);
  const [messageTemplate, setMessageTemplate] = useState(
    "Dạ em chào {name}, Dược phẩm ADDP xin gửi tặng anh/chị ưu đãi tư vấn sức khỏe đặc biệt trong tuần này ạ!"
  );
  const [delaySeconds, setDelaySeconds] = useState(isCustomerMode ? 45 : 15);
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const customerModeStats = useMemo(() => {
    if (!isCustomerMode) {
      return { tagFiltered: [], validCount: 0, invalidCount: 0 };
    }
    const tagFiltered = initialSelectedCustomers.filter((c) => {
      if (selectedTag !== "ALL") {
        const custTags = Array.isArray(c.tags) ? c.tags : [];
        if (!custTags.includes(selectedTag)) return false;
      }
      return true;
    });
    const validCount = tagFiltered.filter(hasValidContactInfo).length;
    return {
      tagFiltered,
      validCount,
      invalidCount: tagFiltered.length - validCount,
    };
  }, [isCustomerMode, initialSelectedCustomers, selectedTag]);

  // Tính toán tệp khách hàng nhận tin
  const audienceCount = useMemo(() => {
    if (!isOpen) return 0;

    if (isCustomerMode) {
      const targetList = onlyValidContact
        ? customerModeStats.tagFiltered.filter(hasValidContactInfo)
        : customerModeStats.tagFiltered;
      return targetList.length;
    }

    if (!conversations || conversations.length === 0) return 0;

    return conversations.filter((c) => {
      if (selectedChannel !== "ALL") {
        if (selectedChannel === "ZALO_PERSONAL" && c.channel !== "ZALO_PERSONAL") return false;
        if (selectedChannel === "FACEBOOK" && c.channel !== "FACEBOOK") return false;
        if (selectedChannel === "ZALO_OA" && c.channel !== "ZALO_OA") return false;
      }

      if (selectedAccount !== "ALL") {
        const accMatch =
          c.accountId === selectedAccount ||
          c.accountOwnId === selectedAccount ||
          c.accountName === selectedAccount;
        if (!accMatch) return false;
      }

      if (selectedTag !== "ALL") {
        const convTags = Array.isArray(c.tags) ? c.tags : [];
        if (!convTags.includes(selectedTag)) return false;
      }

      return true;
    }).length;
  }, [
    isOpen,
    isCustomerMode,
    onlyValidContact,
    customerModeStats,
    selectedChannel,
    selectedAccount,
    selectedTag,
    conversations,
  ]);

  if (!isOpen) return null;

  const insertVariable = (varName) => {
    setMessageTemplate((prev) => prev + varName);
  };

  const handleStartBroadcast = async (e) => {
    e.preventDefault();
    if (!messageTemplate.trim()) {
      setErrorMsg("Vui lòng nhập nội dung tin nhắn mẫu.");
      return;
    }

    setErrorMsg("");
    setSuccessMsg("");
    setSending(true);

    try {
      let recipients = [];

      if (isCustomerMode) {
        const targetCustomers = onlyValidContact
          ? customerModeStats.tagFiltered.filter(hasValidContactInfo)
          : customerModeStats.tagFiltered;

        recipients = targetCustomers.map((c) => ({
          id: c.id,
          fullName: c.fullName || c.name || "Khách Hàng",
          name: c.name || c.fullName || "Khách Hàng",
          phone: c.phone || "",
          zaloUid: c.zaloUid || c.zaloThreadId || c.zaloId || c.threadId || null,
          zaloThreadId: c.zaloThreadId || c.zaloUid || c.threadId || null,
          facebookId: c.facebookId || c.psid || (c.channel === "FACEBOOK" ? c.id : null),
          zaloOaUserId: c.zaloOaUserId || c.oaUserId || null,
          channel: c.channel || selectedChannel,
          gender: c.gender ?? null,
          pathology: c.pathology || "",
          assignedStaff: c.assignedStaff || c.staffName || "",
          productName:
            c.productName ||
            (Array.isArray(c.purchasedProducts) && c.purchasedProducts[0]) ||
            "",
          tags: Array.isArray(c.tags) ? c.tags : [],
        }));
      } else {
        // Chuẩn bị danh sách người nhận lọc từ conversations
        const targetConversations = (conversations || []).filter((c) => {
          if (selectedChannel !== "ALL") {
            if (selectedChannel === "ZALO_PERSONAL" && c.channel !== "ZALO_PERSONAL") return false;
            if (selectedChannel === "FACEBOOK" && c.channel !== "FACEBOOK") return false;
            if (selectedChannel === "ZALO_OA" && c.channel !== "ZALO_OA") return false;
          }

          if (selectedAccount !== "ALL") {
            const accMatch =
              c.accountId === selectedAccount ||
              c.accountOwnId === selectedAccount ||
              c.accountName === selectedAccount;
            if (!accMatch) return false;
          }

          if (selectedTag !== "ALL") {
            const convTags = Array.isArray(c.tags) ? c.tags : [];
            if (!convTags.includes(selectedTag)) return false;
          }

          return true;
        });

        recipients = targetConversations.map((c) => ({
          id: c.id,
          fullName: c.name || "Khách Hàng",
          name: c.name || "Khách Hàng",
          phone: c.phone || "",
          zaloUid: c.id,
          zaloThreadId: c.id,
          facebookId: c.channel === "FACEBOOK" ? c.id : null,
        }));
      }

      const res = await fetch("/api/broadcast/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: selectedChannel,
          target_account: selectedAccount,
          filter_tag: selectedTag,
          message_template: messageTemplate,
          delay_seconds: Number(delaySeconds) || 15,
          recipients: recipients.length > 0 ? recipients : null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Không thể khởi tạo chiến dịch gửi hàng loạt.");
      }

      setSuccessMsg(
        `Đã tạo chiến dịch thành công! Đang gửi tới ${data.total || recipients.length} người nhận theo hàng đợi an toàn.`
      );

      if (onCampaignCreated) {
        onCampaignCreated(data.campaign);
      }

      setTimeout(() => {
        setSending(false);
        onClose();
      }, 2500);
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Lỗi gửi tin nhắn hàng loạt");
      setSending(false);
    }
  };

  // Preview mẫu hiển thị
  const previewText = messageTemplate
    .replace(/\{name\}/gi, "Nguyễn Văn A")
    .replace(/\{fullName\}/gi, "Nguyễn Văn A")
    .replace(/\{firstName\}/gi, "A")
    .replace(/\{gender\}/gi, "Anh/Chị")
    .replace(/\{xungHo\}/gi, "Anh/Chị")
    .replace(/\{phone\}/gi, "0912***678")
    .replace(/\{assignedStaff\}/gi, "Dược sĩ ADDP");

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]">
        {/* Header Modal */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Send className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-base text-slate-900 dark:text-white truncate">
                Gửi Tin Nhắn Hàng Loạt (Broadcast)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Gửi tin nhắn chăm sóc tự động qua Zalo cá nhân & Fanpage Facebook (Có Anti-Ban)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] sm:min-h-0 sm:min-w-0 p-2 sm:p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 min-h-0 space-y-4 sm:space-y-5 text-xs text-slate-700 dark:text-slate-300">
          {errorMsg && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Hàng 1: Chọn Nền Tảng & Tài Khoản Gửi */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1.5 text-slate-800 dark:text-slate-200">
                Kênh Gửi Tin
              </label>
              <select
                value={selectedChannel}
                onChange={(e) => setSelectedChannel(e.target.value)}
                className="w-full px-3 py-2 text-base sm:text-xs min-h-[44px] sm:min-h-0 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
              >
                <option value="ZALO_PERSONAL">💬 Zalo Cá Nhân (QR)</option>
                <option value="FACEBOOK">🌐 Facebook Messenger</option>
                <option value="ZALO_OA">🛡️ Zalo OA Official</option>
                <option value="ALL">🌟 Tất Cả Kênh Hợp Nhất</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold mb-1.5 text-slate-800 dark:text-slate-200">
                Tài Khoản Gửi
              </label>
              <select
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
                className="w-full px-3 py-2 text-base sm:text-xs min-h-[44px] sm:min-h-0 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">Tất cả tài khoản active</option>
                {zaloAccounts.map((acc) => (
                  <option key={acc.accountId || acc.ownId} value={acc.accountId || acc.ownId}>
                    {acc.displayName || acc.label || acc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Hàng 2: Lọc Tệp Nhận Theo Thẻ Tag & Live Counter */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1.5 text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-blue-500" />
                <span>Lọc Theo Thẻ Nhãn (Tag)</span>
              </label>
              <select
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                className="w-full px-3 py-2 text-base sm:text-xs min-h-[44px] sm:min-h-0 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">Toàn bộ tệp khách hàng / bạn bè</option>
                {availableTags.map((t) => (
                  <option key={t.id || t.name} value={t.name}>
                    🏷️ {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold mb-1.5 text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                <span>Giãn Cách Gửi (Anti-Ban)</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="5"
                  max="120"
                  value={delaySeconds}
                  onChange={(e) => setDelaySeconds(e.target.value)}
                  className="w-24 px-3 py-2 text-base sm:text-xs min-h-[44px] sm:min-h-0 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 tabular-nums font-bold"
                />
                <span className="text-slate-500 dark:text-slate-400">giây / tin nhắn</span>
              </div>
            </div>
          </div>

          {/* Banner Ước Lượng Tệp Khách & Anti-Ban */}
          <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-xl space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  Số người nhận dự kiến:
                </span>
                <span className="font-bold text-sm text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/60 px-2 py-0.5 rounded-lg tabular-nums">
                  {audienceCount} người
                </span>
              </div>

              <div className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                <ShieldCheck className="w-4 h-4" />
                <span>Chống quét spam Anti-Ban: Bật</span>
              </div>
            </div>

            {isCustomerMode && (
              <div className="pt-2 border-t border-blue-200/70 dark:border-blue-800/40 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    ✓ Hợp lệ (có SĐT / Zalo ID): {customerModeStats.validCount}/{customerModeStats.tagFiltered.length}
                  </span>
                  {customerModeStats.invalidCount > 0 && (
                    <span className="text-amber-600 dark:text-amber-400">
                      ({customerModeStats.invalidCount} thiếu SĐT/Zalo ID)
                    </span>
                  )}
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300 select-none min-h-[36px] sm:min-h-0">
                  <input
                    type="checkbox"
                    checked={onlyValidContact}
                    onChange={(e) => setOnlyValidContact(e.target.checked)}
                    className="h-5 w-5 sm:h-4 sm:w-4 rounded border-slate-400 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Chỉ gửi khách có SĐT/Zalo hợp lệ</span>
                </label>
              </div>
            )}
          </div>

          {/* Soạn Tin Nhắn Mẫu */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <label className="font-semibold text-slate-800 dark:text-slate-200">
                Nội Dung Tin Nhắn Mẫu
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-slate-400 text-[11px] mr-0.5">Chèn biến:</span>
                <button
                  type="button"
                  onClick={() => insertVariable("{name}")}
                  className="px-2.5 py-1.5 sm:px-2 sm:py-0.5 min-h-[36px] sm:min-h-0 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-blue-600 dark:text-blue-400 font-mono text-[11px] transition-colors"
                >
                  {"{name}"}
                </button>
                <button
                  type="button"
                  onClick={() => insertVariable("{gender}")}
                  title="Xưng hô theo giới tính (Anh / Chị / Anh/Chị)"
                  className="px-2.5 py-1.5 sm:px-2 sm:py-0.5 min-h-[36px] sm:min-h-0 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-cyan-700 dark:text-cyan-400 font-mono text-[11px] transition-colors"
                >
                  {"{gender}"}
                </button>
                <button
                  type="button"
                  onClick={() => insertVariable("{phone}")}
                  className="px-2.5 py-1.5 sm:px-2 sm:py-0.5 min-h-[36px] sm:min-h-0 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-emerald-600 dark:text-emerald-400 font-mono text-[11px] transition-colors"
                >
                  {"{phone}"}
                </button>
                <button
                  type="button"
                  onClick={() => insertVariable("{assignedStaff}")}
                  className="px-2.5 py-1.5 sm:px-2 sm:py-0.5 min-h-[36px] sm:min-h-0 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-purple-600 dark:text-purple-400 font-mono text-[11px] transition-colors"
                >
                  {"{assignedStaff}"}
                </button>
              </div>
            </div>

            <textarea
              rows={4}
              value={messageTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)}
              placeholder="Nhập nội dung tin nhắn gửi khách..."
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 leading-relaxed font-sans text-base sm:text-xs resize-none"
            />
          </div>

          {/* Xem Trước (Preview) */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Xem trước hiển thị (Ví dụ gửi tới Nguyễn Văn A):
            </span>
            <p className="text-xs text-slate-800 dark:text-slate-200 italic whitespace-pre-wrap bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
              {previewText || "Nội dung xem trước sẽ hiển thị ở đây..."}
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="shrink-0 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2 px-4 sm:px-6 py-3.5 sm:py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="px-4 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold transition-colors text-xs flex items-center justify-center"
          >
            Đóng
          </button>

          <button
            type="button"
            onClick={handleStartBroadcast}
            disabled={sending || audienceCount === 0}
            className={`px-5 py-2.5 min-h-[44px] sm:min-h-0 rounded-xl text-white font-bold text-xs inline-flex items-center justify-center gap-2 shadow-sm transition-all ${
              sending || audienceCount === 0
                ? "bg-slate-400 dark:bg-slate-700 cursor-not-allowed opacity-60"
                : "bg-blue-600 hover:bg-blue-500 active:scale-95"
            }`}
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang Khởi Tạo...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Bắt Đầu Gửi ({audienceCount} người)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
