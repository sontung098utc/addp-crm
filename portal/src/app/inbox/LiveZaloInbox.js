"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import QuickOrderModal from "../components/QuickOrderModal";
import {
  RefreshCw,
  Settings,
  Search,
  Sparkles,
  Phone,
  Video,
  UserCheck,
  Zap,
  Send,
  Pin,
  BellOff,
  ShoppingCart,
  Clock,
  CheckCheck,
  MessageSquare,
  AlertTriangle,
  Plus,
  X,
  CircleDot,
} from "lucide-react";

/**
 * ADDP Omnichannel AI CRM — Hộp Thư Hội Thoại Hợp Nhất 3 Cột Chuẩn Zalo / Messenger (WBS-21 -> WBS-25)
 * Cột 1: Danh sách Hội thoại Đa kênh (Conversations List)
 * Cột 2: Khung Chat 2 Chiều Thời Gian Thực (Message Stream & Composer)
 * Cột 3: Hồ Sơ Khách Hàng 360 & Thông Tin Hội Thoại (Customer 360 Side Panel)
 */

function getChannelMeta(channel) {
  switch (channel) {
    case "FACEBOOK":
    case "MESSENGER":
      return {
        code: "FB",
        label: "Fanpage FB",
        avatarLetter: "f",
        badgeBg: "bg-blue-600",
        pillClass: "bg-blue-600/20 text-blue-400 border border-blue-500/30",
        dotColor: "bg-blue-500",
      };
    case "ZALO_OA":
      return {
        code: "OA",
        label: "Zalo OA",
        avatarLetter: "OA",
        badgeBg: "bg-sky-500",
        pillClass: "bg-sky-500/20 text-sky-400 border border-sky-500/30",
        dotColor: "bg-sky-400",
      };
    case "LIVECHAT":
    case "MAGENTO":
      return {
        code: "WEB",
        label: "Website ADDP.vn",
        avatarLetter: "W",
        badgeBg: "bg-amber-600",
        pillClass: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
        dotColor: "bg-amber-400",
      };
    default:
      return {
        code: "ZALO",
        label: "Zalo Cá Nhân",
        avatarLetter: "Z",
        badgeBg: "bg-blue-500",
        pillClass: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
        dotColor: "bg-blue-400",
      };
  }
}

export default function LiveZaloInbox() {
  const [conversations, setConversations] = useState([]);
  const [loadingConv, setLoadingConv] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeConv, setActiveConv] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all"); // 'all' | 'need_human' | 'ai_handling' | 'unread'
  const [channelFilter, setChannelFilter] = useState("ALL"); // 'ALL' | 'ZALO_PERSONAL' | 'ZALO_OA' | 'FACEBOOK'

  // WBS-25: Hồ Sơ Khách Hàng 360 liên kết với hội thoại
  const [matchedCustomer, setMatchedCustomer] = useState(null);
  const [loadingCustomer, setLoadingCustomer] = useState(false);

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
  const activeConvRef = useRef(activeConv);

  useEffect(() => {
    activeConvRef.current = activeConv;
  }, [activeConv]);

  // WBS-21: Kết nối SSE Realtime Stream để nhận tin nhắn tức thì từ mọi kênh
  useEffect(() => {
    let eventSource = null;
    try {
      eventSource = new EventSource("/api/inbox/stream");
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "NEW_MESSAGE" && data.message) {
            const newMsg = data.message;
            if (activeConvRef.current && String(activeConvRef.current.id) === String(newMsg.threadId)) {
              setMessages((prev) => {
                if (prev.some((m) => m.id === newMsg.id)) return prev;
                return [
                  ...prev,
                  {
                    id: newMsg.id,
                    text: newMsg.text,
                    senderName: newMsg.senderName,
                    isMe: newMsg.isMe,
                    time: "Vừa xong",
                    date: "Hôm nay",
                    status: "sent",
                    type: newMsg.type,
                    mediaUrl: newMsg.mediaUrl,
                  },
                ];
              });
            }

            // Cập nhật dòng hội thoại ở cột 1 lên đầu
            setConversations((prev) => {
              const idx = prev.findIndex((c) => String(c.id) === String(newMsg.threadId));
              if (idx !== -1) {
                const target = {
                  ...prev[idx],
                  lastMessage: newMsg.text,
                  lastActive: "Vừa xong",
                  timestamp: Date.now(),
                };
                const filtered = prev.filter((_, i) => i !== idx);
                return [target, ...filtered];
              }
              return prev;
            });
          }
        } catch {}
      };
    } catch {}

    return () => {
      if (eventSource) eventSource.close();
    };
  }, []);

  // Cuộn xuống tin nhắn mới nhất
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 1. Tải danh sách cuộc hội thoại thực tế
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

    // Luôn gọi refresh=1 khi mở trang để đồng bộ mới nhất từ Zalo & Fanpage FB
    loadConversations(!hasLocal, true);

    // Tự động đồng bộ danh sách hội thoại mới mỗi 12 giây
    const pollTimer = setInterval(() => {
      loadConversations(false, false);
    }, 12000);

    return () => clearInterval(pollTimer);
  }, []);

  // Tự động chọn hội thoại đầu tiên của kênh khi người dùng bấm lọc Kênh (Zalo QR / Fanpage FB)
  useEffect(() => {
    if (channelFilter !== "ALL" && conversations.length > 0) {
      if (!activeConv || activeConv.channel !== channelFilter) {
        const firstMatch = conversations.find((c) => c.channel === channelFilter);
        if (firstMatch) setActiveConv(firstMatch);
      }
    }
  }, [channelFilter, conversations]);

  // 2. Tải lịch sử tin nhắn khi đổi người chat (Tuyệt đối không chèn tin nhắn giả)
  useEffect(() => {
    if (!activeConv?.id) return;

    async function loadHistory() {
      try {
        setLoadingMessages(true);
        const res = await fetch(
          `/api/channels/zalo/messages?threadId=${encodeURIComponent(activeConv.id)}&type=${encodeURIComponent(
            activeConv.type || "DIRECT"
          )}&channel=${encodeURIComponent(activeConv.channel || "ZALO_PERSONAL")}&pageId=${encodeURIComponent(
            activeConv.pageId || ""
          )}`
        );
        const data = await res.json();
        if (data.ok && Array.isArray(data.messages) && data.messages.length > 0) {
          setMessages(data.messages);
        } else {
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

  // WBS-25: Tìm kiếm & đồng bộ Hồ Sơ Khách Hàng 360 khi đổi người chat
  useEffect(() => {
    if (!activeConv) {
      setMatchedCustomer(null);
      return;
    }
    let isCancelled = false;
    async function loadCustomerProfile() {
      try {
        setLoadingCustomer(true);
        const searchParam = activeConv.phone || activeConv.name || "";
        if (!searchParam) {
          setMatchedCustomer(null);
          return;
        }
        const res = await fetch(`/api/customers?search=${encodeURIComponent(searchParam)}`);
        const data = await res.json();
        if (!isCancelled && data.ok && Array.isArray(data.customers) && data.customers.length > 0) {
          const matched =
            data.customers.find(
              (c) =>
                (activeConv.phone && c.phone === activeConv.phone) ||
                c.fullName.toLowerCase() === activeConv.name.toLowerCase()
            ) || data.customers[0];
          setMatchedCustomer(matched);
        } else if (!isCancelled) {
          setMatchedCustomer(null);
        }
      } catch {
        if (!isCancelled) setMatchedCustomer(null);
      } finally {
        if (!isCancelled) setLoadingCustomer(false);
      }
    }
    loadCustomerProfile();
    return () => {
      isCancelled = true;
    };
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
      senderName: activeConv.accountName || "ADDP CRM",
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
          recipientId: activeConv.recipientId || activeConv.id,
          pageId: activeConv.pageId || "",
          message: messageText,
          channel: activeConv.channel || "ZALO_PERSONAL",
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
        setToast({ type: "error", text: data.error || "Không thể gửi tin nhắn." });
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
          channel: activeConv.channel || "ZALO_PERSONAL",
        }),
      });
      const data = await res.json();
      const replyContent = data.replyText || data.reply;
      if (data.ok && replyContent) {
        setInputMessage(replyContent);
        setToast({ type: "success", text: "A.I. đã soạn xong lời tư vấn chuyên sâu!" });
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

  const activeChannelName = activeConv
    ? activeConv.accountName || activeConv.channelLabel || getChannelMeta(activeConv.channel).label
    : "Zalo Cá Nhân (Sơn Tùng)";

  return (
    <div className="flex flex-col h-full rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden shadow-xl">
      {/* Toast thông báo nhanh */}
      {toast && (
        <div
          role="alert"
          className={`fixed top-4 right-4 z-50 rounded-xl border px-4 py-2.5 text-xs backdrop-blur-md shadow-xl flex items-center gap-2 ${
            toast.type === "success"
              ? "border-emerald-500/40 bg-emerald-950/90 text-emerald-200"
              : "border-rose-500/40 bg-rose-950/90 text-rose-200"
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{toast.text}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Đóng thông báo"
            className="ml-2 p-0.5 rounded hover:bg-white/10 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* GIAO DIỆN CHAT 3 CỘT (Cột 1: Danh sách hội thoại | Cột 2: Khung Chat | Cột 3: Hồ sơ khách 360) */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ========================================================================= */}
        {/* CỘT 1: DANH SÁCH HỘI THOẠI (CONVERSATIONS LIST)                           */}
        {/* ========================================================================= */}
        <div className="w-80 flex-shrink-0 border-r border-slate-800 bg-slate-900/90 flex flex-col min-h-0">
          {/* Header & Tìm kiếm */}
          <div className="p-3.5 border-b border-slate-800 space-y-2.5 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-xs shrink-0 badge-solid-white">
                  Z
                </span>
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-white tracking-tight truncate">Hộp Thư Đa Kênh</h2>
                  <p className="text-[10px] text-emerald-400 font-medium flex items-center gap-1 truncate">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block animate-pulse shrink-0" />
                    <span className="truncate">Zalo Sơn Tùng &amp; 3 Fanpage FB</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => loadConversations(false, true)}
                  aria-label="Làm mới danh sách hội thoại"
                  title="Làm mới danh sách hội thoại từ Zalo & Fanpage FB"
                  className="rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-blue-400" : ""}`} />
                </button>
                <Link
                  href="/channels"
                  aria-label="Quản lý kênh kết nối"
                  title="Quản lý kênh kết nối"
                  className="rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-300 hover:text-white transition-colors"
                >
                  <Settings className="w-3.5 h-3.5" />
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
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400 pointer-events-none" />
            </div>

            {/* Tabs trạng thái hội thoại (WBS-23: Cần bạn, A.I. xử lý, Chưa đọc) */}
            <div className="flex items-center gap-1 overflow-x-auto text-[11px] font-medium text-slate-400 border-b border-slate-800/80 pb-1.5">
              <button
                type="button"
                onClick={() => setActiveTab("all")}
                className={`px-2 py-0.5 rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                  activeTab === "all" ? "bg-slate-800 text-white font-bold" : "hover:text-slate-200"
                }`}
              >
                Tất cả
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("need_human")}
                className={`px-2 py-0.5 rounded-lg whitespace-nowrap inline-flex items-center gap-1 transition-colors cursor-pointer ${
                  activeTab === "need_human"
                    ? "bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold"
                    : "hover:text-slate-200"
                }`}
              >
                <CircleDot className="w-3 h-3 text-rose-400 shrink-0" />
                <span>Cần bạn</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("ai_handling")}
                className={`px-2 py-0.5 rounded-lg whitespace-nowrap inline-flex items-center gap-1 transition-colors cursor-pointer ${
                  activeTab === "ai_handling"
                    ? "bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold"
                    : "hover:text-slate-200"
                }`}
              >
                <Sparkles className="w-3 h-3 text-purple-400 shrink-0" />
                <span>A.I. xử lý</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("unread")}
                className={`px-2 py-0.5 rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                  activeTab === "unread"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold"
                    : "hover:text-slate-200"
                }`}
              >
                Chưa đọc
              </button>
            </div>

            {/* Lọc theo Kênh tiếp nhận */}
            <div className="flex items-center gap-1 text-[10px] text-slate-400 flex-wrap">
              <span className="text-slate-500 text-[10px] font-medium">Kênh:</span>
              <button
                type="button"
                onClick={() => setChannelFilter("ALL")}
                className={`px-2 py-0.5 rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                  channelFilter === "ALL" ? "bg-blue-600 text-white font-semibold" : "bg-slate-800 hover:text-white"
                }`}
              >
                Tất cả
              </button>
              <button
                type="button"
                onClick={() => setChannelFilter("ZALO_PERSONAL")}
                className={`px-2 py-0.5 rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                  channelFilter === "ZALO_PERSONAL"
                    ? "bg-blue-600 text-white font-semibold"
                    : "bg-slate-800 hover:text-white"
                }`}
              >
                Zalo QR
              </button>
              <button
                type="button"
                onClick={() => setChannelFilter("ZALO_OA")}
                className={`px-2 py-0.5 rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                  channelFilter === "ZALO_OA" ? "bg-blue-600 text-white font-semibold" : "bg-slate-800 hover:text-white"
                }`}
              >
                Zalo OA
              </button>
              <button
                type="button"
                onClick={() => setChannelFilter("FACEBOOK")}
                className={`px-2 py-0.5 rounded-md inline-flex items-center gap-1 whitespace-nowrap transition-colors cursor-pointer ${
                  channelFilter === "FACEBOOK"
                    ? "bg-blue-600 text-white font-semibold"
                    : "bg-slate-800 hover:text-white"
                }`}
              >
                <span>Fanpage FB</span>
                {conversations.filter((c) => c.channel === "FACEBOOK").length > 0 && (
                  <span className="rounded-full bg-blue-500/30 px-1.5 text-[9px] text-blue-200 font-bold tabular-nums">
                    {conversations.filter((c) => c.channel === "FACEBOOK").length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Danh sách các cuộc trò chuyện */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/50 min-h-0">
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
                const convMeta = getChannelMeta(conv.channel);
                const displayTime = (() => {
                  const s = String(conv.lastActive || "").trim();
                  if (/\b\d{5}\b/.test(s) || /588\d{2}/.test(s) || s.includes("5881") || s.includes("588")) {
                    const timeMatch = s.match(/\d{1,2}:\d{2}/);
                    return timeMatch ? timeMatch[0] : "Hôm nay";
                  }
                  return s || "Gần đây";
                })();
                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => setActiveConv(conv)}
                    className={`w-full text-left p-3 transition-colors flex items-center gap-3 cursor-pointer ${
                      isSelected
                        ? "bg-blue-50/90 dark:bg-slate-800/90 border-l-4 border-blue-500"
                        : "hover:bg-slate-100 dark:hover:bg-slate-800/40"
                    }`}
                  >
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      {conv.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={conv.avatar}
                          alt={conv.name}
                          className="h-11 w-11 rounded-full object-cover border border-slate-300 dark:border-slate-700"
                        />
                      ) : (
                        <div className="h-11 w-11 rounded-full bg-gradient-to-tr from-blue-700 to-indigo-600 border border-slate-300 dark:border-slate-700 flex items-center justify-center text-xs font-bold text-white badge-solid-white">
                          {conv.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ${convMeta.badgeBg} border-2 border-white dark:border-slate-900 flex items-center justify-center text-[7px] text-white font-black badge-solid-white`}
                        title={convMeta.label}
                      >
                        {convMeta.avatarLetter}
                      </span>
                    </div>

                    {/* Tên & Tin nhắn gần nhất */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-1 min-w-0">
                          {conv.type === "GROUP" && (
                            <span className="rounded bg-indigo-500/20 text-indigo-500 dark:text-indigo-400 text-[9px] font-semibold px-1 py-0.2 flex-shrink-0">
                              Nhóm
                            </span>
                          )}
                          <span className="font-semibold text-xs text-slate-900 dark:text-white truncate">
                            {conv.name}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 flex-shrink-0 ml-1 tabular-nums">
                          {displayTime}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
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
        <div className="flex-1 flex flex-col bg-white dark:bg-slate-950 min-w-0 min-h-0">
          {activeConv ? (
            <>
              {/* Header khung chat */}
              <div className="h-15 px-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/60 backdrop-blur flex items-center justify-between gap-3 flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative flex-shrink-0">
                    {activeConv.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={activeConv.avatar}
                        alt={activeConv.name}
                        className="h-10 w-10 rounded-full object-cover border border-slate-300 dark:border-slate-700"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white badge-solid-white">
                        {activeConv.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900" />
                  </div>

                  <div className="min-w-0">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2 truncate">
                      <span className="truncate">{activeConv.name}</span>
                      <span
                        className={`rounded-md text-[10px] font-semibold px-2 py-0.5 whitespace-nowrap flex-shrink-0 ${
                          getChannelMeta(activeConv.channel).pillClass
                        }`}
                      >
                        {activeConv.channelLabel || getChannelMeta(activeConv.channel).label}
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {activeConv.phone ? `SĐT: ${activeConv.phone}` : `ID: ${activeConv.id}`} •{" "}
                      {activeConv.accountName
                        ? `Tài khoản: ${activeConv.accountName}`
                        : `Kênh: ${getChannelMeta(activeConv.channel).label}`}
                    </p>
                  </div>
                </div>

                {/* WBS-32 & WBS-33: Bộ chuyển 3 chế độ AI & Các nút công cụ */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="hidden sm:flex items-center gap-1.5 bg-white dark:bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">
                      Trực:
                    </span>
                    <select
                      value={aiMode}
                      onChange={(e) => setAiMode(e.target.value)}
                      aria-label="Chế độ trực hội thoại"
                      className="bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer border-0 p-0"
                    >
                      <option value="HUMAN_ONLY" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                        Nhân viên trực
                      </option>
                      <option value="DRAFT_ONLY" className="bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-300">
                        A.I. Soạn nháp
                      </option>
                      <option value="AUTO_REPLY" className="bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400">
                        A.I. Tự động 24/7
                      </option>
                    </select>
                  </div>

                  <button
                    type="button"
                    aria-label="Gọi thoại"
                    title="Gọi thoại"
                    className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-colors cursor-pointer"
                  >
                    <Phone className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Gọi video"
                    title="Gọi video"
                    className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-colors cursor-pointer"
                  >
                    <Video className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSidePanel(!showSidePanel)}
                    title={showSidePanel ? "Ẩn hồ sơ 360" : "Hiện hồ sơ 360"}
                    className={`px-2.5 py-2 rounded-xl text-xs font-semibold transition-colors border inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                      showSidePanel
                        ? "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-600/20 dark:text-blue-400 dark:border-blue-500/30"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-800"
                    }`}
                  >
                    <UserCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>Hồ Sơ 360</span>
                  </button>
                </div>
              </div>

              {/* Message Thread Stream (Bong bóng chat 2 chiều) */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 chat-stream-bg min-h-0">
                {/* Dấu mốc ngày tháng */}
                <div className="flex justify-center">
                  <span className="rounded-full bg-slate-200/90 dark:bg-slate-800/80 px-3 py-1 text-[11px] text-slate-600 dark:text-slate-400 font-medium border border-slate-300 dark:border-slate-700/60 shadow-xs">
                    {messages[0]?.date ? `Ngày ${messages[0].date}` : "Hôm nay"}
                  </span>
                </div>

                {loadingMessages ? (
                  <div className="p-8 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                    <span>Đang nạp lịch sử tin nhắn...</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-xs space-y-3">
                    <div className="h-14 w-14 rounded-2xl bg-blue-50 dark:bg-blue-600/20 border border-blue-200 dark:border-blue-500/30 flex items-center justify-center text-blue-500 shadow-xs">
                      <MessageSquare className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-bold text-sm text-slate-900 dark:text-white">
                        Cuộc trò chuyện với {activeConv.name}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {activeConv.phone ? `Số điện thoại: ${activeConv.phone}` : `ID Hội thoại: ${activeConv.id}`}
                      </p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 max-w-sm space-y-1 shadow-xs">
                      <div className="flex items-center justify-center gap-1.5 text-blue-600 dark:text-blue-400 font-semibold text-xs">
                        <Zap className="w-3.5 h-3.5" />
                        <span>Sẵn sàng kết nối 2 chiều</span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        Hãy gõ tin nhắn ở khung bên dưới để bắt đầu gửi trực tiếp qua{" "}
                        <strong>{activeChannelName}</strong>.
                      </p>
                    </div>
                  </div>
                ) : (
                  messages.map((m) => {
                    const isMe = m.isMe;
                    const rawUrl = m.url || m.thumb || m.mediaUrl || "";
                    const hasValidUrl =
                      typeof rawUrl === "string" &&
                      (rawUrl.startsWith("http://") ||
                        rawUrl.startsWith("https://") ||
                        rawUrl.startsWith("data:"));
                    const textIsUrl =
                      typeof m.text === "string" &&
                      (m.text.startsWith("http://") || m.text.startsWith("https://")) &&
                      (m.text.includes(".jpg") ||
                        m.text.includes(".png") ||
                        m.text.includes(".webp") ||
                        m.text.includes("zdn.vn"));
                    const photoUrl = hasValidUrl ? rawUrl : textIsUrl ? m.text : null;
                    const isPhoto = Boolean(photoUrl);

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
                          className={`max-w-[70%] rounded-2xl px-4 py-2.5 shadow-sm ${
                            isMe
                              ? "bg-blue-600 text-white rounded-br-none badge-solid-white"
                              : "bg-white text-slate-900 border border-slate-200 dark:bg-slate-800/90 dark:text-slate-100 rounded-bl-none dark:border-slate-700/60"
                          }`}
                        >
                          {!isMe && activeConv.type === "GROUP" && m.senderName && (
                            <p className="text-[10px] font-semibold text-blue-400 mb-1">
                              {m.senderName}
                            </p>
                          )}

                          {isPhoto ? (
                            <div className="my-1">
                              <a href={photoUrl} target="_blank" rel="noreferrer" className="block">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={photoUrl}
                                  alt="Ảnh tin nhắn"
                                  className="max-h-56 rounded-lg object-contain border border-slate-700 hover:opacity-90 transition"
                                />
                              </a>
                              {m.text && m.text !== photoUrl && (
                                <p className="text-xs leading-relaxed mt-1.5 whitespace-pre-wrap">{m.text}</p>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs leading-relaxed whitespace-pre-wrap">{m.text}</p>
                          )}

                          <div
                            className={`mt-1 flex items-center justify-end gap-1 text-[10px] tabular-nums ${
                              isMe ? "text-blue-100" : "text-slate-400"
                            }`}
                          >
                            <span>{m.time}</span>
                            {isMe && (
                              <span className="inline-flex items-center">
                                {m.status === "sending" ? (
                                  <Clock className="w-3 h-3" />
                                ) : m.status === "error" ? (
                                  <AlertTriangle className="w-3 h-3 text-rose-300" />
                                ) : (
                                  <CheckCheck className="w-3 h-3" />
                                )}
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
                <div className="flex items-center justify-between text-[11px] text-slate-500 px-1 gap-2">
                  <span className="truncate">
                    Nhắn tin trực tiếp qua <strong className="text-slate-300">{activeChannelName}</strong>
                  </span>
                  <span className="whitespace-nowrap hidden sm:inline">Enter để gửi • Shift+Enter xuống dòng</span>
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

                  {/* WBS-33: Nút A.I. Soạn */}
                  <button
                    type="button"
                    onClick={handleAiCompose}
                    disabled={aiComposing || sending}
                    title="Dựa vào Second Brain để viết thành lời tư vấn chuẩn Dược sĩ"
                    className="h-11 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 transition-colors flex-shrink-0 shadow-sm whitespace-nowrap cursor-pointer"
                  >
                    {aiComposing ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                        <span className="hidden sm:inline">Đang soạn...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 shrink-0" />
                        <span>A.I. Soạn</span>
                      </>
                    )}
                  </button>

                  <button
                    type="submit"
                    disabled={sending || !inputMessage.trim()}
                    className="h-11 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 transition-colors flex-shrink-0 whitespace-nowrap cursor-pointer"
                  >
                    {sending ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <span>Gửi</span>
                        <Send className="w-3.5 h-3.5 shrink-0" />
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
          <div className="w-72 flex-shrink-0 border-l border-slate-800 bg-slate-900/90 p-4 flex flex-col overflow-y-auto space-y-5 min-h-0">
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
                <div className="h-16 w-16 rounded-full bg-blue-600 border-2 border-blue-400 flex items-center justify-center text-base font-bold text-white mx-auto badge-solid-white">
                  {activeConv.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <h4 className="font-bold text-sm text-slate-900 dark:text-white">{activeConv.name}</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {activeConv.phone || `ID: ${activeConv.id}`}
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex justify-center gap-1.5 pt-1 flex-wrap">
                <button
                  type="button"
                  className="px-2.5 py-1.5 rounded-xl bg-slate-800 text-xs text-slate-200 hover:bg-slate-700 transition-colors inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                  title="Ghim hội thoại"
                >
                  <Pin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span>Ghim</span>
                </button>
                <button
                  type="button"
                  className="px-2.5 py-1.5 rounded-xl bg-slate-800 text-xs text-slate-200 hover:bg-slate-700 transition-colors inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                  title="Tắt thông báo"
                >
                  <BellOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Tắt chuông</span>
                </button>
                <Link
                  href="/customers"
                  className="px-2.5 py-1.5 rounded-xl bg-blue-600/20 border border-blue-500/30 text-xs text-blue-300 font-semibold hover:bg-blue-600/30 transition-colors inline-flex items-center gap-1 whitespace-nowrap"
                  title="Mở hồ sơ khách hàng 360"
                >
                  <UserCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>Hồ Sơ 360</span>
                </Link>
              </div>
            </div>

            {/* Thông tin hồ sơ thực tế (Tuân thủ Điều 11 AGENTS.md: không tạo dữ liệu giả) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Định Danh Khách Hàng 360
                </h5>
                {matchedCustomer && (
                  <span className="font-mono bg-blue-950 text-blue-400 border border-blue-800/60 px-1.5 py-0.5 rounded text-[10px] font-bold">
                    {matchedCustomer.code}
                  </span>
                )}
              </div>

              {loadingCustomer ? (
                <div className="py-4 text-center text-xs text-slate-500 space-y-1">
                  <div className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-[11px]">Đang tra cứu hồ sơ 360...</p>
                </div>
              ) : matchedCustomer ? (
                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400">Hạng khách hàng:</span>
                    <span className="font-bold text-amber-400">{matchedCustomer.vipLabel || "Hạng Mới"}</span>
                  </div>

                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400">Nhân viên phụ trách:</span>
                    <span className="font-semibold text-emerald-400">{matchedCustomer.staffName || "Chưa phân bổ"}</span>
                  </div>

                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400">Đơn hàng / Doanh thu:</span>
                    <span className="font-semibold text-white tabular-nums">
                      {matchedCustomer.totalOrders || 0} đơn • {(matchedCustomer.totalSpent || 0).toLocaleString("vi-VN")} đ
                    </span>
                  </div>

                  {matchedCustomer.pathology && (
                    <div className="space-y-1">
                      <span className="text-slate-400 text-[11px]">Bệnh lý ghi nhận:</span>
                      <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-200">
                        {matchedCustomer.pathology}
                      </div>
                    </div>
                  )}

                  {(matchedCustomer.initialGlucose || matchedCustomer.currentGlucose) && (
                    <div className="grid grid-cols-2 gap-2 text-center pt-1">
                      <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                        <div className="text-[10px] text-slate-400">Đường huyết ban đầu</div>
                        <div className="font-bold text-rose-400 text-xs tabular-nums">
                          {matchedCustomer.initialGlucose ? `${matchedCustomer.initialGlucose} mmol/L` : "Chưa đo"}
                        </div>
                      </div>
                      <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                        <div className="text-[10px] text-slate-400">Đường huyết hiện tại</div>
                        <div className="font-bold text-emerald-400 text-xs tabular-nums">
                          {matchedCustomer.currentGlucose ? `${matchedCustomer.currentGlucose} mmol/L` : "Đang theo dõi"}
                        </div>
                      </div>
                    </div>
                  )}

                  {Array.isArray(matchedCustomer.tags) && matchedCustomer.tags.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-slate-400 text-[11px]">Thẻ nhãn (Tags):</span>
                      <div className="flex flex-wrap gap-1">
                        {matchedCustomer.tags.map((t, idx) => (
                          <span
                            key={idx}
                            className="rounded-full bg-slate-800 border border-slate-700 px-2 py-0.5 text-[10px] text-slate-300 font-medium"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-2 space-y-2">
                    <button
                      type="button"
                      onClick={() => setIsOrderModalOpen(true)}
                      className="w-full text-center rounded-xl bg-emerald-600 hover:bg-emerald-500 py-2.5 text-xs font-bold text-white shadow-sm transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
                      <span>Lên Đơn Hàng Nhanh</span>
                    </button>
                    <Link
                      href={`/customers/${matchedCustomer.id}`}
                      className="w-full rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 py-2 text-xs font-bold text-blue-300 transition-colors inline-flex items-center justify-center gap-1.5"
                    >
                      <UserCheck className="w-3.5 h-3.5 shrink-0" />
                      <span>Mở Chi Tiết Hồ Sơ 360 ({matchedCustomer.code})</span>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 text-xs">
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-center space-y-1">
                    <p className="text-slate-400 text-[11px]">
                      Chưa tìm thấy hồ sơ khách hàng khớp với số điện thoại hoặc tên này.
                    </p>
                  </div>

                  <div className="pt-1 space-y-2">
                    <button
                      type="button"
                      onClick={() => setIsOrderModalOpen(true)}
                      className="w-full text-center rounded-xl bg-emerald-600 hover:bg-emerald-500 py-2.5 text-xs font-bold text-white shadow-sm transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
                      <span>Lên Đơn Hàng Nhanh</span>
                    </button>
                    <Link
                      href="/customers"
                      className="w-full rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 py-2 text-xs font-bold text-blue-300 transition-colors inline-flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5 shrink-0" />
                      <span>Tạo Hồ Sơ Khách Hàng 360 Mới</span>
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Ghi chú tư vấn thực tế */}
            <div className="space-y-2 border-t border-slate-800 pt-3 text-xs">
              <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Ghi Chú Tư Vấn
              </h5>
              <textarea
                rows={4}
                placeholder="Nhập ghi chú tư vấn thực tế dành cho khách hàng này..."
                className="w-full rounded-xl border border-slate-800 bg-slate-950 p-2.5 text-xs text-slate-300 placeholder-slate-500 focus:border-blue-500 focus:outline-none resize-none"
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
