"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

/**
 * ADDP Omnichannel AI CRM — Bàn Làm Việc Nhắn Tin Live Zalo Cá Nhân (/inbox)
 * Cho phép nhân viên gửi tin nhắn trực tiếp dưới danh tính Zalo vừa quét QR.
 * Tuân thủ Điều 3 (normalizePhone), Điều 4 (Anti-Ban) & Điều 11 (Dữ liệu xác thực).
 */

export default function LiveZaloInbox() {
  const [contacts, setContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContact, setSelectedContact] = useState(null);

  // Form gửi tin
  const [recipient, setRecipient] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [alert, setAlert] = useState(null);

  // Lịch sử gửi trong phiên làm việc
  const [sentHistory, setSentHistory] = useState([]);

  // Tải danh bạ thật từ Zalo session
  useEffect(() => {
    async function loadContacts() {
      try {
        setLoadingContacts(true);
        const res = await fetch("/api/channels/zalo/contacts");
        const data = await res.json();
        if (data.ok && Array.isArray(data.contacts)) {
          setContacts(data.contacts);
        }
      } catch (err) {
        console.error("Lỗi tải danh bạ:", err);
      } finally {
        setLoadingContacts(false);
      }
    }
    loadContacts();
  }, []);

  const filteredContacts = contacts.filter((c) => {
    const q = searchQuery.toLowerCase();
    return (
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q)) ||
      (c.userId && c.userId.includes(q))
    );
  });

  const handleSelectContact = (c) => {
    setSelectedContact(c);
    setRecipient(c.userId || c.phone);
    setRecipientName(c.name);
    setAlert(null);
  };

  const handleTemplateClick = (tpl) => {
    const name = recipientName || "anh/chị";
    setMessage(tpl.replace(/{fullName}/g, name));
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!recipient.trim()) {
      setAlert({ type: "error", text: "Vui lòng nhập số điện thoại hoặc ID người nhận trên Zalo." });
      return;
    }
    if (!message.trim()) {
      setAlert({ type: "error", text: "Vui lòng nhập nội dung tin nhắn." });
      return;
    }

    setSending(true);
    setAlert(null);

    try {
      const res = await fetch("/api/channels/zalo/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: recipient.trim(),
          message: message.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setAlert({
          type: "success",
          text: `Đã gửi tin nhắn Zalo thành công tới '${recipientName || recipient}'!`,
        });
        setSentHistory((prev) => [
          {
            id: Date.now(),
            recipient: recipientName || recipient,
            phone: recipient,
            message: message.trim(),
            time: new Date().toLocaleTimeString("vi-VN"),
            status: "Thành công",
          },
          ...prev,
        ]);
        setMessage("");
      } else {
        setAlert({
          type: "error",
          text: data.error || "Gửi tin nhắn thất bại. Vui lòng kiểm tra lại kết nối.",
        });
      }
    } catch {
      setAlert({ type: "error", text: "Lỗi kết nối tới máy chủ khi gửi tin." });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Thanh trạng thái Header */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
            <h1 className="text-xl font-bold text-white tracking-tight">
              Hộp Thư Nhắn Tin Trực Tiếp — Zalo Cá Nhân
            </h1>
            <span className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-xs font-semibold text-cyan-400">
              Live Session
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Tài khoản gửi: <strong className="text-white">Sơn Tùng (Zalo Cá Nhân)</strong> • Tin nhắn gửi trực tiếp dưới danh tính chủ tài khoản (không phải bot)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/channels"
            className="rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition"
          >
            ← Cấu Hình Kênh
          </Link>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            🛡️ Anti-Ban: Giãn cách 45-120s • Max 70 tin/ngày
          </div>
        </div>
      </div>

      {alert && (
        <div
          className={`p-4 rounded-xl text-sm font-medium border flex items-center justify-between ${
            alert.type === "success"
              ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
              : "bg-red-950/40 border-red-500/40 text-red-300"
          }`}
        >
          <span>{alert.text}</span>
          <button onClick={() => setAlert(null)} className="text-xs opacity-70 hover:opacity-100">
            ✕ Đóng
          </button>
        </div>
      )}

      {/* Bố cục 2 cột: Danh bạ Zalo thật & Khung soạn tin */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Cột 1: Danh bạ bạn bè/khách hàng thật từ Zalo (4 cột) */}
        <div className="lg:col-span-4 rounded-2xl border border-slate-800 bg-slate-900/90 flex flex-col h-[650px] overflow-hidden">
          <div className="p-4 border-b border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>👥 Danh Bạ Zalo Thật</span>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-400 font-normal">
                  {contacts.length} liên hệ
                </span>
              </h2>
            </div>
            <input
              type="text"
              placeholder="Tìm theo tên hoặc số điện thoại..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 p-2">
            {loadingContacts ? (
              <div className="p-8 text-center text-xs text-slate-400 space-y-2">
                <div className="h-5 w-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p>Đang đồng bộ danh bạ từ máy chủ Zalo...</p>
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Không tìm thấy liên hệ phù hợp trong danh bạ Zalo.
              </div>
            ) : (
              filteredContacts.slice(0, 60).map((c) => {
                const isSelected = selectedContact?.userId === c.userId;
                return (
                  <button
                    key={c.userId}
                    onClick={() => handleSelectContact(c)}
                    className={`w-full text-left p-2.5 rounded-xl transition flex items-center gap-3 ${
                      isSelected
                        ? "bg-cyan-950/60 border border-cyan-500/40 text-cyan-200"
                        : "hover:bg-slate-800/50 text-slate-300"
                    }`}
                  >
                    {c.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.avatar}
                        alt={c.name}
                        className="h-9 w-9 rounded-full object-cover border border-slate-700 flex-shrink-0"
                      />
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 flex-shrink-0">
                        {c.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-xs text-white truncate">{c.name}</div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {c.phone ? c.phone : `ID: ${c.userId}`}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Cột 2: Khung Soạn Tin Nhắn & Thao Tác Gửi (8 cột) */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <form
            onSubmit={handleSendMessage}
            className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-bold text-white">Soạn Tin Nhắn Trực Tiếp Tới Khách Hàng</h2>
                <p className="text-xs text-slate-400">
                  Nhập số điện thoại bất kỳ hoặc chọn nhanh từ danh bạ bên trái
                </p>
              </div>
              {selectedContact && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedContact(null);
                    setRecipient("");
                    setRecipientName("");
                  }}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  ✕ Bỏ chọn
                </button>
              )}
            </div>

            {/* Thông tin người nhận */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Số điện thoại hoặc User ID Zalo:
                </label>
                <input
                  type="text"
                  placeholder="VD: 0988000001 hoặc chọn từ danh bạ"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Tên khách hàng (để chèn biến xưng hô):
                </label>
                <input
                  type="text"
                  placeholder="VD: Anh Tuấn, Chị Hoa..."
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Kịch bản mẫu nhanh */}
            <div>
              <div className="text-xs font-medium text-slate-400 mb-1.5">
                Mẫu tin tư vấn nhanh (Click để điền):
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    handleTemplateClick(
                      "Dạ em chào {fullName}, em là Dược sĩ bên Dược Phẩm ADDP. Em liên hệ để gửi tài liệu hướng dẫn dinh dưỡng kiểm soát đường huyết cho mình ạ."
                    )
                  }
                  className="rounded-lg border border-slate-700 bg-slate-800/70 px-2.5 py-1 text-[11px] text-slate-300 hover:border-cyan-500 hover:text-white transition"
                >
                  👋 Lời chào tư vấn
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleTemplateClick(
                      "Dạ {fullName} ơi, hôm nay là ngày thứ 3 mình dùng sữa hạt Glucare Plus, mình uống thấy hương vị thế nào và đường huyết buổi sáng đo được bao nhiêu rồi ạ?"
                    )
                  }
                  className="rounded-lg border border-slate-700 bg-slate-800/70 px-2.5 py-1 text-[11px] text-slate-300 hover:border-cyan-500 hover:text-white transition"
                >
                  🥛 Chăm sóc Ngày 3
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleTemplateClick(
                      "Dạ {fullName} ơi, liệu trình của mình còn khoảng 5-7 ngày nữa là hết rồi ạ. Em kiểm tra xem mình có cần gửi tiếp đợt mới để duy trì ổn định đường huyết không ạ?"
                    )
                  }
                  className="rounded-lg border border-slate-700 bg-slate-800/70 px-2.5 py-1 text-[11px] text-slate-300 hover:border-cyan-500 hover:text-white transition"
                >
                  📦 Nhắc tái mua liệu trình
                </button>
              </div>
            </div>

            {/* Khung nhập nội dung */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Nội dung tin nhắn:
              </label>
              <textarea
                rows={5}
                placeholder="Nhập nội dung tin nhắn gửi từ tài khoản Zalo của bạn..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
                required
              />
            </div>

            {/* Footer hành động */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
              <div className="text-[11px] text-slate-400">
                ✅ Tin nhắn sẽ được gửi ngay lập tức qua phiên đăng nhập của <strong>Sơn Tùng</strong>.
              </div>

              <button
                type="submit"
                disabled={sending}
                className="rounded-xl bg-cyan-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-cyan-500 disabled:opacity-50 transition flex items-center justify-center gap-2"
              >
                {sending ? (
                  <>
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Đang gửi qua Zalo...
                  </>
                ) : (
                  <>✈️ Gửi Tin Nhắn Zalo Ngay</>
                )}
              </button>
            </div>
          </form>

          {/* Nhật ký gửi tin trong phiên */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Nhật Ký Tin Đã Gửi Trong Phiên ({sentHistory.length})
            </h3>

            {sentHistory.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                Chưa có tin nhắn nào được gửi trong phiên này. Hãy chọn 1 người nhận ở danh bạ hoặc nhập SĐT để gửi thử nghiệm.
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {sentHistory.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl border border-slate-800 bg-slate-950 flex flex-col gap-1 text-xs"
                  >
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="font-semibold text-white">
                        Tới: {item.recipient} ({item.phone})
                      </span>
                      <span className="text-[11px] text-emerald-400">
                        ✓ {item.status} lúc {item.time}
                      </span>
                    </div>
                    <p className="text-slate-300 text-xs italic bg-slate-900/60 p-2 rounded-lg border border-slate-800/80">
                      &quot;{item.message}&quot;
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
