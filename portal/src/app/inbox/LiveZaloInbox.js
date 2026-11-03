"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import QuickOrderModal from "../components/QuickOrderModal";

/**
 * ADDP Omnichannel AI CRM — Hộp Thư Hội Thoại Hợp Nhất 3 Cột Chuẩn Zalo / Messenger (WBS-21 -> WBS-25)
 * Cột 1: Danh sách Hội thoại Đa kênh (Conversations List)
 * Cột 2: Khung Chat 2 Chiều Thời Gian Thực (Message Stream & Composer)
 * Cột 3: Hồ Sơ Khách Hàng 360 & Thông Tin Hội Thoại (Customer 360 Side Panel)
 */

export default function LiveZaloInbox() {
  const [conversations, setConversations] = useState([]);
  const [loadingConv, setLoadingConv] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeConv, setActiveConv] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all"); // 'all' | 'need_human' | 'ai_handling' | 'unread'
  const [channelFilter, setChannelFilter] = useState("ALL"); // 'ALL' | 'ZALO_PERSONAL' | 'ZALO_OA' | 'FACEBOOK'

  // Tin nhắn của cuộc trò chuyện đang chọn
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [inputMessage, setInputMessage] = useState("");
  const [sending, setSending] = useState(false);

  // Hiển thị panel thông tin khách hàng (Cột 3)
  const [showSidePanel, setShowSidePanel] = useState(true);

  // Thông báo nhanh
  const [toast, setToast] = useState(null);

  // WBS-32 & WBS-33: Chế độ AI & Trạng thái A.I. Soạn
  const [aiMode, setAiMode] = useState("HUMAN_ONLY"); // 'HUMAN_ONLY' | 'DRAFT_ONLY' | 'AUTO_REPLY'
  const [aiComposing, setAiComposing] = useState(false);

  // WBS-39: Lên đơn hàng nhanh trong chat
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);

  const messagesEndRef = useRef(null);

  // Cuộn xuống tin nhắn mới nhất
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 1. Tải danh sách cuộc hội thoại thực tế
  // Tối ưu hóa: Dùng sessionStorage để chuyển qua lại giữa các tab tức thì (0ms lag)
  const loadConversations = async (showLoading = true, forceRefresh = false) => {
    try {
      if (showLoading) setLoadingConv(true);
      else setIsRefreshing(true);

      const url = `/api/channels/zalo/conversations${forceRefresh ? "?refresh=1" : ""}`;
      const resConv = await fetch(url);
      const dataConv = await resConv.json();

      let list = [];
      if (dataConv.ok && Array.isArray(dataConv.conversations) && dataConv.conversations.length > 0) {
        list = dataConv.conversations;
      } else {
        const resContacts = await fetch("/api/channels/zalo/contacts");
        const dataContacts = await resContacts.json();
        if (dataContacts.ok && Array.isArray(dataContacts.contacts)) {
          list = dataContacts.contacts.map((c, idx) => ({
            id: c.userId,
            name: c.name,
            phone: c.phone,
            avatar: c.avatar,
            lastMessage: "Đã kết nối qua Zalo Cá Nhân",
            lastActive: "Gần đây",
            rawIndex: idx,
            channel: "ZALO_PERSONAL",
            channelLabel: "Zalo Cá Nhân",
          }));
        }
      }

      if (list.length > 0) {
        setConversations(list);
        try {
          sessionStorage.setItem("addp_inbox_conversations", JSON.stringify(list));
        } catch {}
        setActiveConv((prev) => {
          if (prev && list.some((c) => c.id === prev.id)) {
            return list.find((c) => c.id === prev.id) || prev;
          }
          return list[0];
        });
      }
    } catch (err) {
      console.error("Lỗi tải hội thoại:", err);
    } finally {
      setLoadingConv(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    let hasLocal = false;
    try {
      const cached = sessionStorage.getItem("addp_inbox_conversations");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setConversations(parsed);
          setActiveConv(parsed[0]);
          setLoadingConv(false);
          hasLocal = true;
        }
      }
    } catch {}

    loadConversations(!hasLocal);
  }, []);

  // 2. Tải lịch sử tin nhắn khi đổi người chat (Tuyệt đối không chèn tin nhắn giả)
  useEffect(() => {
    if (!activeConv?.id) return;

    async function loadHistory() {
      try {
        setLoadingMessages(true);
        const res = await fetch(`/api/channels/zalo/messages?threadId=${encodeURIComponent(activeConv.id)}`);
        const data = await res.json();
        if (data.ok && Array.isArray(data.messages) && data.messages.length > 0) {
          setMessages(data.messages);
        } else {
          // Xóa bỏ hoàn toàn nội dung nhắn tin gợi ý, chỉ để lại danh sách tin thật
          setMessages([]);
        }
      } catch {
        setMessages([]);
      } finally {
        setLoadingMessages(false);
      }
    }
    loadHistory();
  }, [activeConv]);

  // 3. Gửi tin nhắn 2 chiều
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!inputMessage.trim() || !activeConv || sending) return;

    const messageText = inputMessage.trim();
    const tempId = `temp_${Date.now()}`;
    const nowTime = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

    // Optimistic update: Hiện tin nhắn ngay lập tức bên phải
    const optimisticMsg = {
      id: tempId,
      text: messageText,
      isMe: true,
      senderName: "Sơn Tùng",
      time: nowTime,
      date: "Hôm nay",
      status: "sending",
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setInputMessage("");
    setSending(true);

    try {
      const res = await fetch("/api/channels/zalo/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: activeConv.id,
          message: messageText,
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: "sent" } : m))
        );
        // Cập nhật lastMessage của active conversation
        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeConv.id
              ? { ...c, lastMessage: messageText, lastActive: "Vừa xong" }
              : c
          )
        );
      } else {
        setToast({ type: "error", text: data.error || "Không thể gửi tin nhắn qua Zalo." });
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: "error" } : m))
        );
      }
    } catch {
      setToast({ type: "error", text: "Lỗi kết nối khi gửi tin nhắn." });
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // WBS-33: Gọi AI Assistant tư vấn dựa trên Second Brain
  const handleAiCompose = async () => {
    if (!activeConv) return;
    try {
      setAiComposing(true);
      const lastCustMsg = [...messages].reverse().find((m) => !m.isMe);
      const res = await fetch("/api/ai/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: aiMode === "AUTO_REPLY" ? "AUTO_REPLY" : "DRAFT_ONLY",
          customerMessage: lastCustMsg ? lastCustMsg.text : inputMessage,
          draftIdea: inputMessage,
          customerName: activeConv.name,
          channel: "ZALO_PERSONAL",
        }),
      });
      const data = await res.json();
      const replyContent = data.replyText || data.reply;
      if (data.ok && replyContent) {
        setInputMessage(replyContent);
        setToast({ type: "success", text: "✨ A.I. đã soạn xong lời tư vấn chuyên sâu!" });
        setTimeout(() => setToast(null), 3000);
      } else {
        setToast({ type: "error", text: data.error || "Không thể soạn tin tự động." });
        setTimeout(() => setToast(null), 3000);
      }
    } catch (err) {
      console.error("Lỗi AI Compose:", err);
      setToast({ type: "error", text: "Lỗi kết nối tới AI Assistant." });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setAiComposing(false);
    }
  };

  const filteredConversations = conversations.filter((c) => {
    const q = searchQuery.toLowerCase();
    const matchSearch =
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.lastMessage && c.lastMessage.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q)) ||
      (c.id && c.id.includes(q));

    if (!matchSearch) return false;

    // Lọc theo Kênh
    if (channelFilter !== "ALL") {
      if (channelFilter === "ZALO_PERSONAL" && c.channel !== "ZALO_PERSONAL") return false;
      if (channelFilter === "ZALO_OA" && c.channel !== "ZALO_OA") return false;
      if (channelFilter === "FACEBOOK" && c.channel !== "FACEBOOK") return false;
    }

    // Lọc theo Trạng thái (WBS-23)
    if (activeTab === "unread") return c.unread > 0;
    if (activeTab === "need_human") return c.handlerState === "NEED_HUMAN" || c.needsHuman;
    if (activeTab === "ai_handling") return c.handlerState === "AI_HANDLING" || c.isAiHandling;
    if (activeTab === "human_handling") return c.handlerState === "HUMAN_HANDLING";

    return true;
  });

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden shadow-2xl">
      {/* Toast thông báo nhanh */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-xl border border-rose-500/40 bg-rose-950/90 px-4 py-2.5 text-xs text-rose-200 backdrop-blur-md shadow-xl flex items-center gap-2">
          <span>⚠️ {toast.text}</span>
          <button onClick={() => setToast(null)} className="ml-2 font-bold hover:text-white">✕</button>
        </div>
      )}

      {/* GIAO DIỆN CHAT 3 CỘT (Cột 1: Danh sách hội thoại | Cột 2: Khung Chat | Cột 3: Hồ sơ khách 360) */}
      <div className="flex flex-1 overflow-hidden">
        {/* ========================================================================= */}
        {/* CỘT 1: DANH SÁCH HỘI THOẠI (CONVERSATIONS LIST)                           */}
        {/* ========================================================================= */}
        <div className="w-80 flex-shrink-0 border-r border-slate-800 bg-slate-900/90 flex flex-col">
          {/* Header & Tìm kiếm */}
          <div className="p-3.5 border-b border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-xs">
                  Z
                </span>
                <div>
                  <h2 className="text-sm font-bold text-white tracking-tight">Hộp Thư Đa Kênh</h2>
                  <p className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                    Sơn Tùng (Zalo Cá Nhân)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => loadConversations(false, true)}
                  title="Làm mới danh sách hội thoại từ Zalo"
                  className={`rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-xs text-slate-300 hover:text-white transition ${
                    isRefreshing ? "animate-spin text-blue-400" : ""
                  }`}
                >
                  🔄
                </button>
                <Link
                  href="/channels"
                  title="Quản lý kênh kết nối"
                  className="rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-300 hover:text-white transition"
                >
                  ⚙️
                </Link>
              </div>
            </div>

            {/* Ô tìm kiếm hội thoại */}
            <div className="relative">
              <input
                type="text"
                placeholder="Tìm kiếm cuộc trò chuyện, bạn bè..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
              <span className="absolute left-2.5 top-2 text-slate-500 text-xs">🔍</span>
            </div>

            {/* Tabs trạng thái hội thoại (WBS-23: Cần bạn, A.I. xử lý, Bạn xử lý, Chưa đọc) */}
            <div className="flex items-center gap-1 overflow-x-auto text-[11px] font-medium text-slate-400 border-b border-slate-800/80 pb-1 scrollbar-none">
              <button
                onClick={() => setActiveTab("all")}
                className={`px-2 py-0.5 rounded-lg whitespace-nowrap transition ${
                  activeTab === "all" ? "bg-slate-800 text-white font-bold" : "hover:text-slate-200"
                }`}
              >
                Tất cả
              </button>
              <button
                onClick={() => setActiveTab("need_human")}
                className={`px-2 py-0.5 rounded-lg whitespace-nowrap transition ${
                  activeTab === "need_human" ? "bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold" : "hover:text-slate-200"
                }`}
              >
                🔴 Cần bạn
              </button>
              <button
                onClick={() => setActiveTab("ai_handling")}
                className={`px-2 py-0.5 rounded-lg whitespace-nowrap transition ${
                  activeTab === "ai_handling" ? "bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold" : "hover:text-slate-200"
                }`}
              >
                ✨ A.I. xử lý
              </button>
              <button
                onClick={() => setActiveTab("unread")}
                className={`px-2 py-0.5 rounded-lg whitespace-nowrap transition ${
                  activeTab === "unread" ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold" : "hover:text-slate-200"
                }`}
              >
                Chưa đọc
              </button>
            </div>

            {/* Lọc theo Kênh tiếp nhận */}
            <div className="flex items-center gap-1 text-[10px] text-slate-400">
              <span className="text-slate-500 text-[10px]">Kênh:</span>
              <button
                onClick={() => setChannelFilter("ALL")}
                className={`px-1.5 py-0.5 rounded ${
                  channelFilter === "ALL" ? "bg-blue-600 text-white font-semibold" : "bg-slate-800 hover:text-white"
                }`}
              >
                Tất cả
              </button>
              <button
                onClick={() => setChannelFilter("ZALO_PERSONAL")}
                className={`px-1.5 py-0.5 rounded ${
                  channelFilter === "ZALO_PERSONAL" ? "bg-blue-600 text-white font-semibold" : "bg-slate-800 hover:text-white"
                }`}
              >
                Zalo QR
              </button>
              <button
                onClick={() => setChannelFilter("ZALO_OA")}
                className={`px-1.5 py-0.5 rounded ${
                  channelFilter === "ZALO_OA" ? "bg-blue-600 text-white font-semibold" : "bg-slate-800 hover:text-white"
                }`}
              >
                Zalo OA
              </button>
              <button
                onClick={() => setChannelFilter("FACEBOOK")}
                className={`px-1.5 py-0.5 rounded ${
                  channelFilter === "FACEBOOK" ? "bg-blue-600 text-white font-semibold" : "bg-slate-800 hover:text-white"
                }`}
              >
                Fanpage FB
              </button>
            </div>
          </div>

          {/* Danh sách các cuộc trò chuyện */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/50">
            {loadingConv ? (
              <div className="p-8 text-center text-xs text-slate-500 space-y-2">
                <div className="h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p>Đang tải danh sách cuộc trò chuyện...</p>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Không tìm thấy cuộc trò chuyện phù hợp.
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isSelected = activeConv?.id === conv.id;
                return (
                  <button
                    key={conv.id}
                    onClick={() => setActiveConv(conv)}
                    className={`w-full text-left p-3 transition flex items-center gap-3 ${
                      isSelected
                        ? "bg-slate-800/90 border-l-4 border-blue-500"
                        : "hover:bg-slate-800/40"
                    }`}
                  >
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      {conv.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={conv.avatar}
                          alt={conv.name}
                          className="h-11 w-11 rounded-full object-cover border border-slate-700"
                        />
                      ) : (
                        <div className="h-11 w-11 rounded-full bg-gradient-to-tr from-blue-700 to-indigo-600 border border-slate-700 flex items-center justify-center text-xs font-bold text-white">
                          {conv.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-blue-500 border-2 border-slate-900 flex items-center justify-center text-[7px] text-white font-bold">
                        Z
                      </span>
                    </div>

                    {/* Tên & Tin nhắn gần nhất */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-1 min-w-0">
                          {conv.type === "GROUP" && (
                            <span className="rounded bg-indigo-500/20 text-indigo-400 text-[9px] font-semibold px-1 py-0.2 flex-shrink-0">
                              Nhóm
                            </span>
                          )}
                          <span className="font-semibold text-xs text-white truncate">
                            {conv.name}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 flex-shrink-0 ml-1">
                          {conv.lastActive}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate">
                        {conv.lastMessage}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* CỘT 2: KHUNG CHAT 2 CHIỀU (MESSAGE STREAM & COMPOSER)                     */}
        {/* ========================================================================= */}
        <div className="flex-1 flex flex-col bg-slate-950">
          {activeConv ? (
            <>
              {/* Header khung chat */}
              <div className="h-16 px-5 border-b border-slate-800 bg-slate-900/60 backdrop-blur flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    {activeConv.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={activeConv.avatar}
                        alt={activeConv.name}
                        className="h-10 w-10 rounded-full object-cover border border-slate-700"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white">
                        {activeConv.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-slate-900" />
                  </div>

                  <div>
                    <h3 className="font-bold text-sm text-white flex items-center gap-2">
                      {activeConv.name}
                      <span className="rounded bg-blue-500/20 text-blue-400 text-[10px] font-semibold px-1.5 py-0.2">
                        Zalo Cá Nhân
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      {activeConv.phone ? `SĐT: ${activeConv.phone}` : `Zalo ID: ${activeConv.id}`} • Truy cập qua nick <strong>Sơn Tùng</strong>
                    </p>
                  </div>
                </div>

                {/* WBS-32 & WBS-33: Bộ chuyển 3 chế độ AI & Các nút công cụ */}
                <div className="flex items-center gap-2">
                  <div className="hidden sm:flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800">
                    <span className="text-[11px] text-slate-400 font-medium">Trực:</span>
                    <select
                      value={aiMode}
                      onChange={(e) => setAiMode(e.target.value)}
                      className="bg-transparent text-xs font-semibold text-slate-200 focus:outline-none cursor-pointer"
                    >
                      <option value="HUMAN_ONLY" className="bg-slate-900 text-slate-200">👤 Nhân viên trực</option>
                      <option value="DRAFT_ONLY" className="bg-slate-900 text-amber-300">📝 A.I. Soạn nháp</option>
                      <option value="AUTO_REPLY" className="bg-slate-900 text-emerald-400">🤖 A.I. Tự động 24/7</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    title="Gọi thoại Zalo"
                    className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
                  >
                    📞
                  </button>
                  <button
                    type="button"
                    title="Gọi video Zalo"
                    className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
                  >
                    📹
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSidePanel(!showSidePanel)}
                    title={showSidePanel ? "Ẩn hồ sơ 360" : "Hiện hồ sơ 360"}
                    className={`p-2 rounded-xl text-xs font-semibold transition ${
                      showSidePanel
                        ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                        : "text-slate-400 hover:text-white hover:bg-slate-800"
                    }`}
                  >
                    📋 Hồ Sơ 360
                  </button>
                </div>
              </div>

              {/* Message Thread Stream (Bong bóng chat 2 chiều) */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900/40">
                {/* Dấu mốc ngày tháng */}
                <div className="flex justify-center">
                  <span className="rounded-full bg-slate-800/80 px-3 py-1 text-[11px] text-slate-400 font-medium border border-slate-700/60">
                    {messages[0]?.date ? `Ngày ${messages[0].date}` : "Hôm nay"}
                  </span>
                </div>

                {loadingMessages ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    Đang nạp lịch sử tin nhắn...
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-500 text-xs space-y-2">
                    <div className="text-3xl">💬</div>
                    <p className="font-semibold text-slate-300">Cuộc trò chuyện với {activeConv.name}</p>
                    <p className="text-[11px] text-slate-500 max-w-sm">
                      Chưa có tin nhắn trong phiên này. Hãy soạn tin nhắn bên dưới để gửi tin trực tiếp từ tài khoản Zalo Sơn Tùng.
                    </p>
                  </div>
                ) : (
                  messages.map((m) => {
                    const isMe = m.isMe;
                    const isPhoto = m.type === "chat.photo" || (m.text && typeof m.text === "string" && m.text.startsWith("http") && (m.text.includes(".jpg") || m.text.includes(".png") || m.text.includes("zdn.vn")));

                    return (
                      <div
                        key={m.id}
                        className={`flex items-end gap-2.5 ${isMe ? "justify-end" : "justify-start"}`}
                      >
                        {!isMe && (
                          <div className="h-7 w-7 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-300 flex-shrink-0">
                            {m.senderName ? m.senderName.slice(0, 1).toUpperCase() : activeConv.name.slice(0, 1)}
                          </div>
                        )}

                        <div
                          className={`max-w-[70%] rounded-2xl px-4 py-2.5 shadow-md ${
                            isMe
                              ? "bg-blue-600 text-white rounded-br-none"
                              : "bg-slate-800/90 text-slate-100 rounded-bl-none border border-slate-700/60"
                          }`}
                        >
                          {!isMe && activeConv.type === "GROUP" && m.senderName && (
                            <p className="text-[10px] font-semibold text-blue-400 mb-1">
                              {m.senderName}
                            </p>
                          )}

                          {isPhoto ? (
                            <a href={m.text} target="_blank" rel="noreferrer" className="block my-1">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={m.text}
                                alt="Ảnh Zalo"
                                className="max-h-56 rounded-lg object-contain border border-slate-700 hover:opacity-90 transition"
                              />
                            </a>
                          ) : (
                            <p className="text-xs leading-relaxed whitespace-pre-wrap">{m.text}</p>
                          )}

                          <div
                            className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                              isMe ? "text-blue-200" : "text-slate-400"
                            }`}
                          >
                            <span>{m.time}</span>
                            {isMe && (
                              <span>
                                {m.status === "sending"
                                  ? "🕒"
                                  : m.status === "error"
                                  ? "⚠️"
                                  : "✓✓"}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Composer (Ô nhập tin nhắn & Gửi) */}
              <div className="border-t border-slate-800 bg-slate-900/80 p-3 space-y-2 flex-shrink-0">
                <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
                  <span>Nhắn tin trực tiếp qua <strong>Zalo Cá Nhân (Sơn Tùng)</strong></span>
                  <span>Enter để gửi • Shift+Enter xuống dòng</span>
                </div>

                {/* Khung nhập tin nhắn */}
                <form onSubmit={handleSendMessage} className="flex items-end gap-2">
                  <div className="flex-1 relative">
                    <textarea
                      rows={2}
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={`Nhập tin nhắn gửi tới ${activeConv.name}...`}
                      className="w-full rounded-xl border border-slate-700/80 bg-slate-950 p-2.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none resize-none"
                    />
                  </div>

                  {/* WBS-33: Nút ✨ A.I. Soạn */}
                  <button
                    type="button"
                    onClick={handleAiCompose}
                    disabled={aiComposing || sending}
                    title="Dựa vào Second Brain để viết thành lời tư vấn chuẩn Dược sĩ"
                    className="h-11 px-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition flex-shrink-0 shadow-md shadow-purple-950/40"
                  >
                    {aiComposing ? (
                      <>
                        <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span className="hidden sm:inline">Đang soạn...</span>
                      </>
                    ) : (
                      <>
                        <span>✨ A.I. Soạn</span>
                      </>
                    )}
                  </button>

                  <button
                    type="submit"
                    disabled={sending || !inputMessage.trim()}
                    className="h-11 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition flex-shrink-0"
                  >
                    {sending ? (
                      <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Gửi</span>
                        <span>✈️</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-8 text-center text-slate-500 text-xs">
              Vui lòng chọn một cuộc trò chuyện từ danh sách bên trái để bắt đầu nhắn tin.
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* CỘT 3: HỒ SƠ KHÁCH HÀNG 360 & THÔNG TIN HỘI THOẠI (CUSTOMER 360 PANEL)      */}
        {/* ========================================================================= */}
        {showSidePanel && activeConv && (
          <div className="w-72 flex-shrink-0 border-l border-slate-800 bg-slate-900/90 p-4 flex flex-col overflow-y-auto space-y-5">
            {/* Header thông tin */}
            <div className="text-center space-y-2 border-b border-slate-800 pb-4">
              {activeConv.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={activeConv.avatar}
                  alt={activeConv.name}
                  className="h-16 w-16 rounded-full object-cover border-2 border-blue-500 mx-auto"
                />
              ) : (
                <div className="h-16 w-16 rounded-full bg-blue-600 border-2 border-blue-400 flex items-center justify-center text-base font-bold text-white mx-auto">
                  {activeConv.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <h4 className="font-bold text-sm text-white">{activeConv.name}</h4>
                <p className="text-xs text-slate-400">{activeConv.phone || `Zalo ID: ${activeConv.id}`}</p>
              </div>

              {/* Action buttons */}
              <div className="flex justify-center gap-2 pt-1">
                <button
                  type="button"
                  className="p-2 rounded-xl bg-slate-800 text-xs text-slate-300 hover:text-white hover:bg-slate-700 transition"
                  title="Ghim hội thoại"
                >
                  📌 Ghim
                </button>
                <button
                  type="button"
                  className="p-2 rounded-xl bg-slate-800 text-xs text-slate-300 hover:text-white hover:bg-slate-700 transition"
                  title="Tắt thông báo"
                >
                  🔕 Tắt chuông
                </button>
                <Link
                  href="/customers"
                  className="p-2 rounded-xl bg-blue-600/20 border border-blue-500/30 text-xs text-blue-300 hover:bg-blue-600/30 transition"
                  title="Mở hồ sơ khách hàng 360"
                >
                  👤 Hồ Sơ 360
                </Link>
              </div>
            </div>

            {/* Thông tin hồ sơ thực tế (Tuân thủ Điều 11 AGENTS.md: không tạo dữ liệu giả) */}
            <div className="space-y-2.5">
              <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Định Danh Khách Hàng 360
              </h5>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400">Nguồn tiếp nhận:</span>
                  <span className="font-semibold text-blue-400">Zalo Cá Nhân</span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400">Tài khoản Zalo:</span>
                  <span className="font-semibold text-white">Sơn Tùng</span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400">Trạng thái CRM:</span>
                  <span className="rounded bg-slate-800 text-slate-300 px-1.5 py-0.5 text-[10px] font-medium border border-slate-700">
                    Khách Zalo trực tiếp
                  </span>
                </div>
              </div>

              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  onClick={() => setIsOrderModalOpen(true)}
                  className="w-full text-center rounded-xl bg-emerald-600 hover:bg-emerald-500 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-950/40 transition flex items-center justify-center gap-1.5"
                >
                  <span>🛒 Lên Đơn Hàng Nhanh</span>
                  <span className="text-[10px] bg-emerald-700 px-1.5 py-0.2 rounded font-mono">WBS-39</span>
                </button>
                <Link
                  href="/customers"
                  className="w-full block text-center rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 py-2 text-xs font-bold text-blue-300 transition"
                >
                  + Tạo Hồ Sơ Khách Hàng 360
                </Link>
              </div>
            </div>

            {/* Ghi chú tư vấn thực tế */}
            <div className="space-y-2 border-t border-slate-800 pt-3 text-xs">
              <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Ghi Chú Tư Vấn
              </h5>
              <textarea
                rows={4}
                placeholder="Nhập ghi chú tư vấn thực tế dành cho khách hàng này..."
                className="w-full rounded-xl border border-slate-800 bg-slate-950 p-2.5 text-xs text-slate-300 placeholder-slate-600 focus:border-blue-500 focus:outline-none resize-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Modal Lên đơn hàng nhanh (WBS-39) */}
      <QuickOrderModal
        isOpen={isOrderModalOpen}
        onClose={() => setIsOrderModalOpen(false)}
        customer={activeConv}
        onSuccess={(order) => {
          setToast({ type: "success", text: `Đã tạo đơn hàng ${order.orderCode} thành công!` });
          setTimeout(() => setToast(null), 3000);
        }}
      />
    </div>
  );
}
