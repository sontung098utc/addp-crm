"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import QuickOrderModal from "../components/QuickOrderModal";
import { normalizePhone, isValidVietnamPhone } from "@/lib/phone";
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
  Users,
} from "lucide-react";

/**
 * ADDP Omnichannel AI CRM — Hộp Thư Hội Thoại Hợp Nhất 3 Cột Chuẩn Zalo / Messenger (WBS-21 -> WBS-25)
 * Cột 1: Danh sách Hội thoại Đa kênh (Conversations List) + Bộ lọc từng Fanpage & Nhãn phân biệt Page
 * Cột 2: Khung Chat 2 Chiều Thời Gian Thực (Message Stream & Composer)
 * Cột 3: Hồ Sơ Khách Hàng 360 & Thông Tin Hội Thoại (Customer 360 Side Panel)
 */

const FANPAGE_PALETTE = [
  {
    dot: "bg-blue-500",
    badge: "bg-blue-500/15 text-blue-600 dark:text-blue-300 border border-blue-500/30",
    activeFilter: "bg-blue-600 text-white border-blue-500 shadow-xs",
    avatarBadge: "bg-blue-600",
  },
  {
    dot: "bg-emerald-500",
    badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30",
    activeFilter: "bg-emerald-600 text-white border-emerald-500 shadow-xs",
    avatarBadge: "bg-emerald-600",
  },
  {
    dot: "bg-purple-500",
    badge: "bg-purple-500/15 text-purple-600 dark:text-purple-300 border border-purple-500/30",
    activeFilter: "bg-purple-600 text-white border-purple-500 shadow-xs",
    avatarBadge: "bg-purple-600",
  },
  {
    dot: "bg-amber-500",
    badge: "bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30",
    activeFilter: "bg-amber-600 text-white border-amber-500 shadow-xs",
    avatarBadge: "bg-amber-600",
  },
];

function getFanpagePalette(pageId, connectedPages = []) {
  if (!pageId) return FANPAGE_PALETTE[0];
  const idx = connectedPages.findIndex((p) => String(p.pageId) === String(pageId));
  if (idx >= 0) {
    return FANPAGE_PALETTE[idx % FANPAGE_PALETTE.length];
  }
  const s = String(pageId);
  if (s.endsWith("8537")) return FANPAGE_PALETTE[1];
  if (s.endsWith("2091")) return FANPAGE_PALETTE[2];
  return FANPAGE_PALETTE[0];
}

function getChannelMeta(channel, pageId = "", connectedPages = []) {
  switch (channel) {
    case "FACEBOOK":
    case "MESSENGER": {
      const pal = getFanpagePalette(pageId, connectedPages);
      return {
        code: "FB",
        label: "Fanpage FB",
        avatarLetter: "f",
        badgeBg: pal.avatarBadge,
        pillClass: pal.badge,
        dotColor: pal.dot,
      };
    }
    case "ZALO_OA":
      return {
        code: "OA",
        label: "Zalo OA",
        avatarLetter: "OA",
        badgeBg: "bg-sky-500",
        pillClass: "bg-sky-500/15 text-sky-600 dark:text-sky-300 border border-sky-500/30",
        dotColor: "bg-sky-400",
      };
    case "LIVECHAT":
    case "MAGENTO":
      return {
        code: "WEB",
        label: "Website ADDP.vn",
        avatarLetter: "W",
        badgeBg: "bg-amber-600",
        pillClass: "bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30",
        dotColor: "bg-amber-400",
      };
    default:
      return {
        code: "ZALO",
        label: "Zalo Cá Nhân",
        avatarLetter: "Z",
        badgeBg: "bg-cyan-600",
        pillClass: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 border border-cyan-500/30",
        dotColor: "bg-cyan-400",
      };
  }
}

function extractChatPhoneNumbers(messagesList = []) {
  const phoneRegex = /(?:\+84|84|0)[35789](?:[\s.-]?\d){8}\b/g;
  const found = [];
  for (let i = messagesList.length - 1; i >= 0; i--) {
    const txt = messagesList[i]?.text;
    if (!txt || typeof txt !== "string") continue;
    const matches = txt.match(phoneRegex) || [];
    for (const m of matches) {
      const norm = normalizePhone(m);
      if (isValidVietnamPhone(norm) && !found.includes(norm)) {
        found.push(norm);
      }
    }
  }
  return found;
}

export default function LiveZaloInbox() {
  const [conversations, setConversations] = useState([]);
  const [connectedPages, setConnectedPages] = useState([]);
  const [connectedZaloAccounts, setConnectedZaloAccounts] = useState([]);
  const [loadingConv, setLoadingConv] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeConv, setActiveConv] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all"); // 'all' | 'need_human' | 'ai_handling' | 'unread'
  const [channelFilter, setChannelFilter] = useState("ALL"); // 'ALL' | 'ZALO_PERSONAL' | 'ZALO_OA' | 'FACEBOOK'
  const [selectedPageId, setSelectedPageId] = useState("ALL"); // 'ALL' | pageId cụ thể của từng Fanpage
  const [selectedZaloAccountId, setSelectedZaloAccountId] = useState("ALL"); // 'ALL' | accountId cụ thể của từng nick Zalo QR

  // WBS-25: Hồ Sơ Khách Hàng 360 liên kết với hội thoại
  const [matchedCustomer, setMatchedCustomer] = useState(null);
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  const [detectedChatPhone, setDetectedChatPhone] = useState("");
  const [detectedAiTags, setDetectedAiTags] = useState([]);

  // Tin nhắn của cuộc trò chuyện đang chọn
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [inputMessage, setInputMessage] = useState("");
  const [sending, setSending] = useState(false);

  // Hiển thị panel thông tin khách hàng (Cột 3)
  const [showSidePanel, setShowSidePanel] = useState(true);
  // Mở rộng danh bạ chưa có tin nhắn
  const [showContactsSection, setShowContactsSection] = useState(false);

  // Thông báo nhanh
  const [toast, setToast] = useState(null);

  // WBS-32 & WBS-33: Chế độ AI & Trạng thái A.I. Soạn + Human-Takeover Bot State
  const [aiMode, setAiMode] = useState("AUTO_REPLY"); // 'HUMAN_ONLY' | 'DRAFT_ONLY' | 'AUTO_REPLY'
  const [convBotMode, setConvBotMode] = useState("AI"); // 'AI' | 'HUMAN'
  const [convBotPausedUntil, setConvBotPausedUntil] = useState(null);
  const [togglingBot, setTogglingBot] = useState(false);
  const [aiComposing, setAiComposing] = useState(false);

  // WBS-39: Lên đơn hàng nhanh trong chat
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);

  const messagesEndRef = useRef(null);
  const activeConvRef = useRef(activeConv);
  const convSignatureRef = useRef("");
  const prevMsgCountRef = useRef(0);

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
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("addp:realtime-event", { detail: data }));
          }
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
                  isContactOnly: false,
                  lastMessage: newMsg.text,
                  lastActive: "Vài giây",
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

  // Chỉ tự động cuộn xuống đáy khi có tin nhắn mới thêm vào hoặc đổi cuộc trò chuyện
  useEffect(() => {
    if (messages.length !== prevMsgCountRef.current) {
      prevMsgCountRef.current = messages.length;
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // 1. Tải danh sách cuộc hội thoại thực tế (chống nhảy danh sách khi poll ngầm)
  const loadConversations = async (showLoading = true, forceRefresh = false) => {
    try {
      if (showLoading) setLoadingConv(true);
      else if (forceRefresh) setIsRefreshing(true);

      const url = `/api/channels/zalo/conversations${forceRefresh ? "?refresh=1" : ""}`;
      const resConv = await fetch(url);
      const dataConv = await resConv.json();

      if (Array.isArray(dataConv.connectedPages) && dataConv.connectedPages.length > 0) {
        setConnectedPages(dataConv.connectedPages);
      }
      if (Array.isArray(dataConv.connectedZaloAccounts) && dataConv.connectedZaloAccounts.length > 0) {
        setConnectedZaloAccounts(dataConv.connectedZaloAccounts);
      }

      let list = [];
      if (dataConv.ok && Array.isArray(dataConv.conversations) && dataConv.conversations.length > 0) {
        list = dataConv.conversations;
      }

      if (list.length > 0) {
        // Tạo chữ ký kiểm tra thay đổi để tránh render thừa gây giật/nhảy danh sách khi poll ngầm
        const activeTopSignature = list
          .filter((c) => !c.isContactOnly)
          .slice(0, 80)
          .map(
            (c) =>
              `${c.channel}:${c.accountId || ""}:${c.id}:${c.timestamp}:${c.lastMessage}:${c.unreadCount || 0}`
          )
          .join("|");

        const hasChanged = forceRefresh || showLoading || activeTopSignature !== convSignatureRef.current;
        if (hasChanged) {
          convSignatureRef.current = activeTopSignature;
          setConversations(list);
          try {
            sessionStorage.setItem("addp_inbox_conversations", JSON.stringify(list));
          } catch {}
        } else {
          // Chỉ cập nhật nhẹ nhãn thời gian (lastActive) mà không đổi thứ tự mảng
          setConversations((prev) => {
            if (prev.length !== list.length) return list;
            const byKey = new Map(
              list.map((item) => [`${item.channel}_${item.accountId || ""}_${item.id}`, item])
            );
            return prev.map((oldItem) => {
              const updated = byKey.get(
                `${oldItem.channel}_${oldItem.accountId || ""}_${oldItem.id}`
              );
              return updated ? { ...oldItem, lastActive: updated.lastActive } : oldItem;
            });
          });
        }

        setActiveConv((prev) => {
          if (prev) {
            const matched = list.find(
              (c) =>
                String(c.id) === String(prev.id) &&
                c.channel === prev.channel &&
                String(c.accountId || "") === String(prev.accountId || "")
            );
            if (matched) return matched;
          }
          return list.find((c) => !c.isContactOnly) || list[0];
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
          setActiveConv(parsed.find((c) => !c.isContactOnly) || parsed[0]);
          setLoadingConv(false);
          hasLocal = true;
        }
      }
    } catch {}

    // Tải ngay danh sách hội thoại từ bộ nhớ/cache để hiển thị tức thì (<50ms), đồng bộ ngầm ở phía server
    loadConversations(!hasLocal, false);

    // Tự động đồng bộ danh sách hội thoại mới mỗi 12 giây (chạy ngầm, không gây giật UI)
    const pollTimer = setInterval(() => {
      loadConversations(false, false);
    }, 12000);

    return () => clearInterval(pollTimer);
  }, []);

  // Tự động chọn hội thoại đầu tiên phù hợp khi người dùng bấm lọc Kênh, lọc Zalo QR hoặc lọc Fanpage
  useEffect(() => {
    if (conversations.length === 0) return;

    const matchesCurrentFilter = (c) => {
      if (channelFilter !== "ALL" && c.channel !== channelFilter) return false;
      if (selectedZaloAccountId !== "ALL") {
        if (c.channel !== "ZALO_PERSONAL" || String(c.accountId) !== String(selectedZaloAccountId)) {
          return false;
        }
      }
      if (selectedPageId !== "ALL") {
        if (c.channel !== "FACEBOOK" || String(c.pageId) !== String(selectedPageId)) return false;
      }
      return true;
    };

    if (!activeConv || !matchesCurrentFilter(activeConv)) {
      const firstMatch =
        conversations.find((c) => !c.isContactOnly && matchesCurrentFilter(c)) ||
        conversations.find((c) => matchesCurrentFilter(c));
      if (firstMatch) setActiveConv(firstMatch);
    }
  }, [channelFilter, selectedPageId, selectedZaloAccountId, conversations]);

  // 2. Tải lịch sử tin nhắn khi đổi người chat & tự động làm mới ngầm cho hội thoại đang mở
  useEffect(() => {
    if (!activeConv?.id) return;
    let isCancelled = false;

    async function fetchMessagesForActive(silent = false) {
      try {
        if (!silent) {
          setLoadingMessages(true);
          prevMsgCountRef.current = 0;
        }
        const res = await fetch(
          `/api/channels/zalo/messages?threadId=${encodeURIComponent(activeConv.id)}&type=${encodeURIComponent(
            activeConv.type || "DIRECT"
          )}&channel=${encodeURIComponent(activeConv.channel || "ZALO_PERSONAL")}&pageId=${encodeURIComponent(
            activeConv.pageId || ""
          )}&accountId=${encodeURIComponent(activeConv.accountId || "")}&homeDir=${encodeURIComponent(
            activeConv.zaloHome || ""
          )}`
        );
        const data = await res.json();
        if (isCancelled) return;

        if (data.ok && Array.isArray(data.messages)) {
          setMessages((prev) => {
            if (
              silent &&
              prev.length === data.messages.length &&
              prev[prev.length - 1]?.id === data.messages[data.messages.length - 1]?.id
            ) {
              return prev;
            }
            return data.messages;
          });
        } else if (!silent) {
          setMessages([]);
        }
      } catch {
        if (!silent && !isCancelled) setMessages([]);
      } finally {
        if (!silent && !isCancelled) setLoadingMessages(false);
      }
    }

    fetchMessagesForActive(false);

    // Tự động làm mới ngầm tin nhắn của cuộc trò chuyện đang mở mỗi 7 giây
    const msgPoll = setInterval(() => {
      fetchMessagesForActive(true);
    }, 7000);

    return () => {
      isCancelled = true;
      clearInterval(msgPoll);
    };
  }, [activeConv?.id, activeConv?.channel, activeConv?.pageId, activeConv?.accountId]);

  // WBS-25: Tìm kiếm & đồng bộ Hồ Sơ Khách Hàng 360 khi đổi người chat hoặc khi bắt được SĐT trong tin nhắn
  useEffect(() => {
    if (!activeConv) {
      setMatchedCustomer(null);
      setDetectedChatPhone("");
      return;
    }
    let isCancelled = false;

    const scannedPhones = extractChatPhoneNumbers(messages);
    const effectivePhone =
      (activeConv.phone && normalizePhone(activeConv.phone)) ||
      scannedPhones[0] ||
      "";
    setDetectedChatPhone(effectivePhone);

    async function loadCustomerProfile() {
      try {
        setLoadingCustomer(true);
        const searchParam = effectivePhone || activeConv.id || activeConv.name || "";
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
                (effectivePhone && c.phone === effectivePhone) ||
                String(c.zaloUid || "") === String(activeConv.id) ||
                String(c.zaloThreadId || "") === String(activeConv.id) ||
                c.fullName.toLowerCase() === activeConv.name.toLowerCase()
            ) || data.customers[0];
          setMatchedCustomer(matched);
        } else if (!isCancelled && activeConv.name && searchParam !== activeConv.name) {
          const resByName = await fetch(`/api/customers?search=${encodeURIComponent(activeConv.name)}`);
          const dataByName = await resByName.json();
          if (!isCancelled && dataByName.ok && Array.isArray(dataByName.customers) && dataByName.customers.length > 0) {
            setMatchedCustomer(dataByName.customers[0]);
          } else if (!isCancelled) {
            setMatchedCustomer(null);
          }
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
  }, [activeConv?.id, activeConv?.phone, activeConv?.name, messages]);

  // 2.5 Đồng bộ trạng thái AI Bot / Human-Takeover cho hội thoại đang mở
  useEffect(() => {
    let cancelled = false;
    async function fetchBotState() {
      if (!activeConv?.id) return;
      try {
        const res = await fetch(
          `/api/ai/bot-control?threadId=${encodeURIComponent(activeConv.id)}&channelId=${encodeURIComponent(activeConv.channel || "DEFAULT")}`
        );
        const data = await res.json();
        if (!cancelled && data.ok && data.state) {
          const mode = data.state.mode === "HUMAN" ? "HUMAN" : "AI";
          setConvBotMode(mode);
          setConvBotPausedUntil(data.state.pausedUntil || null);
          setAiMode(mode === "HUMAN" ? "HUMAN_ONLY" : "AUTO_REPLY");
        }
      } catch {}
    }
    fetchBotState();
    return () => {
      cancelled = true;
    };
  }, [activeConv?.id, activeConv?.channel]);

  // Hàm bật/tắt nhanh AI Bot trực tiếp trên Header Cột 2
  const handleToggleConvBot = async (targetAction) => {
    if (!activeConv?.id || togglingBot) return;
    const action =
      targetAction || (convBotMode === "AI" ? "pause" : "resume");
    const nextMode = action === "resume" ? "AI" : "HUMAN";

    setTogglingBot(true);
    setConvBotMode(nextMode);
    setAiMode(nextMode === "AI" ? "AUTO_REPLY" : "HUMAN_ONLY");

    try {
      const res = await fetch("/api/ai/bot-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: activeConv.id,
          channelId: activeConv.channel || "DEFAULT",
          action,
          pauseMinutes: 45,
        }),
      });
      const data = await res.json();
      if (data.ok && data.state) {
        setConvBotMode(data.state.mode);
        setConvBotPausedUntil(data.state.pausedUntil || null);
        setToast({
          type: "success",
          text:
            data.state.mode === "AI"
              ? "🤖 Đã bật lại Bot AI Dược sĩ Thảo tự động trực hội thoại."
              : "👤 Đã dừng Bot AI (45 phút) — Nhân viên trực tiếp tiếp quản.",
        });
      }
    } catch {
      setToast({
        type: "error",
        text: "Không thể cập nhật trạng thái AI Bot.",
      });
    } finally {
      setTogglingBot(false);
    }
  };

  // 3. Gửi tin nhắn 2 chiều (Hỗ trợ cả DM, Group Zalo & từng Fanpage FB)
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!inputMessage.trim() || !activeConv || sending) return;

    const messageText = inputMessage.trim();
    const tempId = `temp_${Date.now()}`;
    const nowTime = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

    // Human-Takeover khẩn cấp: Tự động ngắt Bot AI ngay khi nhân viên gõ tin nhắn trả lời
    setConvBotMode("HUMAN");
    setAiMode("HUMAN_ONLY");
    fetch("/api/ai/bot-control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId: activeConv.id,
        channelId: activeConv.channel || "DEFAULT",
        action: "pause",
        pauseMinutes: 45,
      }),
    }).catch(() => {});

    // Optimistic update: Hiện tin nhắn ngay lập tức bên phải
    const optimisticMsg = {
      id: tempId,
      text: messageText,
      isMe: true,
      senderName: activeConv.accountDisplayName || activeConv.accountName || "Chuyên viên ADDP",
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
          accountId: activeConv.accountId || "",
          homeDir: activeConv.zaloHome || "",
          type: activeConv.type || "DIRECT",
          message: messageText,
          channel: activeConv.channel || "ZALO_PERSONAL",
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: "sent" } : m))
        );
        // Cập nhật lastMessage và đưa hội thoại đang chat lên đầu danh sách
        setConversations((prev) => {
          const idx = prev.findIndex(
            (c) =>
              String(c.id) === String(activeConv.id) &&
              c.channel === activeConv.channel &&
              String(c.accountId || "") === String(activeConv.accountId || "")
          );
          if (idx === -1) return prev;
          const updatedConv = {
            ...prev[idx],
            isContactOnly: false,
            lastMessage: `Bạn: ${messageText}`,
            lastActive: "Vài giây",
            timestamp: Date.now(),
          };
          const others = prev.filter((_, i) => i !== idx);
          return [updatedConv, ...others];
        });
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
          accountName: activeConv.channelLabel || activeConv.accountName || "",
          conversationHistory: messages.slice(-8),
          channel: activeConv.channel || "ZALO_PERSONAL",
        }),
      });
      const data = await res.json();
      const replyContent = data.replyText || data.reply;
      if (data.ok && replyContent) {
        setInputMessage(replyContent);
        if (data.detectedPhone) {
          setDetectedChatPhone(data.detectedPhone);
        }
        if (Array.isArray(data.tags) && data.tags.length > 0) {
          setDetectedAiTags(data.tags);
        }
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

  // Danh sách các Fanpage phục vụ thanh lọc Page (tự động lấy từ API hoặc gom từ conversations)
  const effectivePages = (() => {
    if (connectedPages.length > 0) return connectedPages;
    const map = new Map();
    for (const c of conversations) {
      if (c.channel === "FACEBOOK" && c.pageId && !map.has(String(c.pageId))) {
        const shortId = String(c.pageId).slice(-4);
        map.set(String(c.pageId), {
          pageId: String(c.pageId),
          shortId,
          name: c.pageName || "Fanpage FB",
          displayName: c.pageDisplay || `${c.pageName || "Fanpage"} (#${shortId})`,
        });
      }
    }
    return Array.from(map.values());
  })();

  // Danh sách các tài khoản Zalo Cá Nhân đang kết nối (ví dụ: Sơn Tùng, Lê Quyên...)
  const effectiveZaloAccounts = (() => {
    if (connectedZaloAccounts.length > 0) return connectedZaloAccounts;
    const map = new Map();
    for (const c of conversations) {
      if (c.channel === "ZALO_PERSONAL") {
        const accId = String(c.accountId || c.accountDisplayName || "default");
        const disp =
          c.accountDisplayName ||
          (c.accountName ? c.accountName.replace(/^Zalo:\s*/i, "") : "Sơn Tùng");
        if (!map.has(accId)) {
          map.set(accId, {
            accountId: accId,
            name: disp,
            displayName: `Zalo ${disp}`,
            label: `Zalo: ${disp}`,
            activeCount: 0,
            totalCount: 0,
            colorIndex: map.size,
          });
        }
        const entry = map.get(accId);
        entry.totalCount += 1;
        if (!c.isContactOnly) entry.activeCount += 1;
      }
    }
    return Array.from(map.values());
  })();

  const fbTotalCount = conversations.filter((c) => c.channel === "FACEBOOK").length;
  const zaloActiveCount = conversations.filter(
    (c) => c.channel === "ZALO_PERSONAL" && !c.isContactOnly
  ).length;

  const filteredConversations = conversations.filter((c) => {
    const q = searchQuery.trim().toLowerCase();
    const matchSearch =
      !q ||
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.lastMessage && c.lastMessage.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q)) ||
      (c.accountName && c.accountName.toLowerCase().includes(q)) ||
      (c.accountDisplayName && c.accountDisplayName.toLowerCase().includes(q)) ||
      (c.id && String(c.id).includes(q));

    if (!matchSearch) return false;

    // Lọc theo Kênh
    if (channelFilter !== "ALL") {
      if (channelFilter === "ZALO_PERSONAL" && c.channel !== "ZALO_PERSONAL") return false;
      if (channelFilter === "ZALO_OA" && c.channel !== "ZALO_OA") return false;
      if (channelFilter === "FACEBOOK" && c.channel !== "FACEBOOK") return false;
    }

    // Lọc theo từng tài khoản Zalo QR cụ thể (Sơn Tùng / Lê Quyên...)
    if (selectedZaloAccountId !== "ALL") {
      if (
        c.channel !== "ZALO_PERSONAL" ||
        String(c.accountId) !== String(selectedZaloAccountId)
      ) {
        return false;
      }
    }

    // Lọc theo từng Fanpage cụ thể
    if (selectedPageId !== "ALL") {
      if (c.channel !== "FACEBOOK" || String(c.pageId) !== String(selectedPageId)) return false;
    }

    // Lọc theo Trạng thái (WBS-23)
    if (activeTab === "unread") return (c.unread || c.unreadCount || 0) > 0;
    if (activeTab === "need_human")
      return c.handlerState === "NEED_HUMAN" || c.needsHuman || c.status === "need_human";
    if (activeTab === "ai_handling") return c.handlerState === "AI_HANDLING" || c.isAiHandling;

    return true;
  });

  // Tách bạch: Hội thoại có tin nhắn thật (sắp xếp chuẩn theo thời gian thực) vs Danh bạ chưa có tin nhắn
  const activeChatList = filteredConversations.filter((c) => !c.isContactOnly);
  const contactOnlyList = filteredConversations.filter((c) => c.isContactOnly);

  // Khi lọc riêng Zalo QR, ưu tiên đưa các hội thoại Ghim (Pinned: Nhóm Học Tập, My Documents) lên đầu giống hệt Zalo PC
  const displayedActiveChats = (() => {
    if (channelFilter === "ZALO_PERSONAL") {
      const pinned = activeChatList.filter((c) => c.isPinned);
      const unpinned = activeChatList.filter((c) => !c.isPinned);
      return [...pinned, ...unpinned];
    }
    return activeChatList;
  })();

  const activeChannelName = activeConv
    ? activeConv.accountName || activeConv.channelLabel || getChannelMeta(activeConv.channel, activeConv.pageId, effectivePages).label
    : effectiveZaloAccounts[0]?.channelLabel || "Zalo Cá Nhân";

  const renderConversationRow = (conv) => {
    const isSelected =
      activeConv?.id === conv.id &&
      activeConv?.channel === conv.channel &&
      String(activeConv?.accountId || "") === String(conv.accountId || "");
    const convMeta = getChannelMeta(conv.channel, conv.pageId, effectivePages);
    const pagePal = conv.channel === "FACEBOOK" ? getFanpagePalette(conv.pageId, effectivePages) : null;
    const isSecondZalo = conv.channel === "ZALO_PERSONAL" && Number(conv.colorIndex || 0) > 0;

    // Nhãn nguồn (Fanpage cụ thể hoặc từng tài khoản Zalo cá nhân: Zalo • Sơn Tùng / Zalo • Lê Quyên)
    const sourceBadgeText =
      conv.channel === "FACEBOOK"
        ? conv.pageDisplay ||
          (conv.pageName && conv.pageShortId
            ? `${conv.pageName} (#${conv.pageShortId})`
            : conv.pageName || "Fanpage FB")
        : conv.channel === "ZALO_OA"
        ? "Zalo OA Official"
        : conv.accountDisplayName
        ? `Zalo • ${conv.accountDisplayName}`
        : conv.accountName
        ? conv.accountName.replace(/^Zalo:\s*/i, "Zalo • ")
        : "Zalo Cá Nhân";

    const pillColorClass = isSecondZalo
      ? "bg-teal-500/15 text-teal-600 dark:text-teal-300 border border-teal-500/30"
      : convMeta.pillClass;
    const dotColorClass = isSecondZalo ? "bg-teal-400" : convMeta.dotColor;

    return (
      <button
        key={`${conv.channel}_${conv.accountId || ""}_${conv.id}`}
        type="button"
        onClick={() => setActiveConv(conv)}
        className={`w-full text-left px-3 py-2.5 transition-colors flex items-start gap-2.5 cursor-pointer ${
          isSelected
            ? "bg-blue-50/90 dark:bg-slate-800/95 border-l-4 border-blue-500"
            : "hover:bg-slate-100 dark:hover:bg-slate-800/40"
        }`}
      >
        {/* Avatar */}
        <div className="relative flex-shrink-0 mt-0.5">
          {conv.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={conv.avatar}
              alt={conv.name}
              className="h-10 w-10 rounded-full object-cover border border-slate-300 dark:border-slate-700"
            />
          ) : (
            <div
              className={`h-10 w-10 rounded-full ${
                conv.channel === "FACEBOOK"
                  ? pagePal?.avatarBadge || "bg-blue-600"
                  : conv.type === "GROUP"
                  ? "bg-indigo-600"
                  : isSecondZalo
                  ? "bg-teal-600"
                  : "bg-cyan-600"
              } border border-slate-300 dark:border-slate-700 flex items-center justify-center text-xs font-bold text-white badge-solid-white`}
            >
              {conv.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ${
              isSecondZalo ? "bg-teal-600" : convMeta.badgeBg
            } border-2 border-white dark:border-slate-900 flex items-center justify-center text-[7px] text-white font-black badge-solid-white`}
            title={sourceBadgeText}
          >
            {convMeta.avatarLetter}
          </span>
        </div>

        {/* Tên, Nhãn Fanpage/Zalo & Tin nhắn gần nhất */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <div className="flex items-center gap-1 min-w-0">
              {conv.isPinned && (
                <Pin
                  className="w-3 h-3 text-amber-400 shrink-0 rotate-45"
                  title="Hội thoại đã ghim trên Zalo"
                />
              )}
              {conv.type === "GROUP" && (
                <span className="rounded bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 text-[9px] font-bold px-1 py-0.2 flex-shrink-0 inline-flex items-center gap-0.5">
                  <Users className="w-2.5 h-2.5" />
                  <span>{conv.memberCount > 0 ? conv.memberCount : "Nhóm"}</span>
                </span>
              )}
              <span className="font-semibold text-xs text-slate-900 dark:text-white truncate">
                {conv.name}
              </span>
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 flex-shrink-0 tabular-nums">
              {conv.lastActive || "Gần đây"}
            </span>
          </div>

          {/* Nhãn phân biệt Fanpage / Tài khoản Zalo rõ ràng trên từng hội thoại */}
          <div className="flex items-center gap-1.5 mb-1">
            <span
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.2 text-[9px] font-semibold truncate max-w-full ${pillColorClass}`}
              title={`Nguồn hội thoại: ${sourceBadgeText}${conv.pageId ? ` (ID: ${conv.pageId})` : ""}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColorClass}`} />
              <span className="truncate">{sourceBadgeText}</span>
            </span>
            {(conv.unreadCount > 0 || conv.unread > 0) && (
              <span className="rounded-full bg-rose-500 px-1.5 py-0.2 text-[9px] font-bold text-white badge-solid-white tabular-nums">
                {conv.unreadCount || conv.unread}
              </span>
            )}
          </div>

          <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
            {conv.lastMessage}
          </p>
        </div>
      </button>
    );
  };

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
        <div className="w-84 flex-shrink-0 border-r border-slate-800 bg-slate-900/90 flex flex-col min-h-0">
          {/* Header & Tìm kiếm */}
          <div className="p-3 border-b border-slate-800 space-y-2 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-xs shrink-0 badge-solid-white">
                  Z
                </span>
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-white tracking-tight truncate">Hộp Thư Đa Kênh</h2>
                  <p className="text-[10px] text-emerald-400 font-medium flex items-center gap-1 truncate">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block animate-pulse shrink-0" />
                    <span className="truncate">
                      {effectiveZaloAccounts.length > 0
                        ? effectiveZaloAccounts
                            .map((acc) => `Zalo ${acc.name} (${acc.activeCount ?? 0})`)
                            .join(" • ")
                        : `Zalo QR (${zaloActiveCount})`}
                      {effectivePages.length > 0 ? ` & ${effectivePages.length} Fanpage (${fbTotalCount})` : ""}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => loadConversations(false, true)}
                  aria-label="Làm mới danh sách hội thoại"
                  title="Đồng bộ mới nhất từ tất cả tài khoản Zalo QR & Fanpage FB"
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
                placeholder="Tìm tên khách, nhóm Zalo, SĐT, tên Page..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 pl-8 pr-7 py-1.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400 pointer-events-none" />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label="Xóa tìm kiếm"
                  className="absolute right-2 top-2 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
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
                onClick={() => {
                  setChannelFilter("ALL");
                  setSelectedPageId("ALL");
                  setSelectedZaloAccountId("ALL");
                }}
                className={`px-2 py-0.5 rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                  channelFilter === "ALL" && selectedPageId === "ALL" && selectedZaloAccountId === "ALL"
                    ? "bg-blue-600 text-white font-semibold badge-solid-white"
                    : "bg-slate-800 hover:text-white"
                }`}
              >
                Tất cả
              </button>
              <button
                type="button"
                onClick={() => {
                  setChannelFilter("ZALO_PERSONAL");
                  setSelectedPageId("ALL");
                  setSelectedZaloAccountId("ALL");
                }}
                className={`px-2 py-0.5 rounded-md inline-flex items-center gap-1 whitespace-nowrap transition-colors cursor-pointer ${
                  channelFilter === "ZALO_PERSONAL"
                    ? "bg-cyan-600 text-white font-semibold badge-solid-white"
                    : "bg-slate-800 hover:text-white"
                }`}
              >
                <span>Zalo QR</span>
                {zaloActiveCount > 0 && (
                  <span className="rounded-full bg-black/25 px-1.5 text-[9px] font-bold tabular-nums">
                    {zaloActiveCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setChannelFilter("ZALO_OA");
                  setSelectedPageId("ALL");
                  setSelectedZaloAccountId("ALL");
                }}
                className={`px-2 py-0.5 rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                  channelFilter === "ZALO_OA"
                    ? "bg-blue-600 text-white font-semibold badge-solid-white"
                    : "bg-slate-800 hover:text-white"
                }`}
              >
                Zalo OA
              </button>
              <button
                type="button"
                onClick={() => {
                  setChannelFilter("FACEBOOK");
                  setSelectedPageId("ALL");
                  setSelectedZaloAccountId("ALL");
                }}
                className={`px-2 py-0.5 rounded-md inline-flex items-center gap-1 whitespace-nowrap transition-colors cursor-pointer ${
                  channelFilter === "FACEBOOK"
                    ? "bg-blue-600 text-white font-semibold badge-solid-white"
                    : "bg-slate-800 hover:text-white"
                }`}
              >
                <span>Fanpage FB</span>
                {fbTotalCount > 0 && (
                  <span className="rounded-full bg-black/25 px-1.5 text-[9px] font-bold tabular-nums">
                    {fbTotalCount}
                  </span>
                )}
              </button>
            </div>

            {/* Bộ chọn phân biệt từng tài khoản Zalo QR (Hiện khi có >= 1 tài khoản Zalo QR ở tab Tất cả hoặc Zalo QR) */}
            {(channelFilter === "ZALO_PERSONAL" || channelFilter === "ALL") &&
              effectiveZaloAccounts.length > 0 && (
                <div className="pt-1 border-t border-slate-800/70 space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span className="font-semibold text-slate-400">
                      Tài khoản Zalo ({effectiveZaloAccounts.length} nick):
                    </span>
                    {selectedZaloAccountId !== "ALL" && (
                      <button
                        type="button"
                        onClick={() => setSelectedZaloAccountId("ALL")}
                        className="text-[10px] text-cyan-400 hover:underline cursor-pointer"
                      >
                        Xem tất cả Zalo
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {effectiveZaloAccounts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          setChannelFilter("ZALO_PERSONAL");
                          setSelectedZaloAccountId("ALL");
                          setSelectedPageId("ALL");
                        }}
                        className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer border ${
                          channelFilter === "ZALO_PERSONAL" && selectedZaloAccountId === "ALL"
                            ? "bg-cyan-600 text-white border-cyan-500 badge-solid-white"
                            : "bg-slate-950/80 text-slate-300 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        Tất cả Zalo ({zaloActiveCount})
                      </button>
                    )}
                    {effectiveZaloAccounts.map((acc, idx) => {
                      const count = conversations.filter(
                        (c) =>
                          c.channel === "ZALO_PERSONAL" &&
                          !c.isContactOnly &&
                          String(c.accountId) === String(acc.accountId)
                      ).length;
                      const isAccActive = String(selectedZaloAccountId) === String(acc.accountId);
                      const isSecond = idx > 0;
                      return (
                        <button
                          key={acc.accountId}
                          type="button"
                          onClick={() => {
                            setChannelFilter("ZALO_PERSONAL");
                            setSelectedZaloAccountId(String(acc.accountId));
                            setSelectedPageId("ALL");
                          }}
                          title={`Zalo Cá Nhân: ${acc.name} (ID: ${acc.accountId})`}
                          className={`px-2 py-1 rounded-lg text-[10px] font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer border ${
                            isAccActive
                              ? isSecond
                                ? "bg-teal-600 text-white border-teal-500 badge-solid-white"
                                : "bg-cyan-600 text-white border-cyan-500 badge-solid-white"
                              : "bg-slate-950/80 text-slate-300 border-slate-800 hover:border-slate-700"
                          }`}
                        >
                          <span
                            className={`h-2 w-2 rounded-full shrink-0 ${
                              isAccActive
                                ? "bg-white"
                                : isSecond
                                ? "bg-teal-400"
                                : "bg-cyan-400"
                            }`}
                          />
                          <span className="truncate max-w-[130px]">Zalo {acc.name}</span>
                          <span
                            className={`rounded-full px-1.5 text-[9px] font-bold tabular-nums ${
                              isAccActive ? "bg-black/25 text-white" : "bg-slate-800 text-slate-300"
                            }`}
                          >
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

            {/* Bộ chọn phân biệt từng Fanpage (Hiện khi ở tab Tất cả hoặc Fanpage FB) */}
            {(channelFilter === "FACEBOOK" || channelFilter === "ALL") && effectivePages.length > 0 && (
              <div className="pt-1 border-t border-slate-800/70 space-y-1">
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span className="font-semibold text-slate-400">Chọn Fanpage ({effectivePages.length} Page):</span>
                  {selectedPageId !== "ALL" && (
                    <button
                      type="button"
                      onClick={() => setSelectedPageId("ALL")}
                      className="text-[10px] text-blue-400 hover:underline cursor-pointer"
                    >
                      Xem tất cả Page
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setChannelFilter("FACEBOOK");
                      setSelectedPageId("ALL");
                    }}
                    className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer border ${
                      channelFilter === "FACEBOOK" && selectedPageId === "ALL"
                        ? "bg-blue-600 text-white border-blue-500 badge-solid-white"
                        : "bg-slate-950/80 text-slate-300 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    Tất cả Page ({fbTotalCount})
                  </button>
                  {effectivePages.map((pg) => {
                    const count = conversations.filter(
                      (c) => c.channel === "FACEBOOK" && String(c.pageId) === String(pg.pageId)
                    ).length;
                    const isPageActive = String(selectedPageId) === String(pg.pageId);
                    const pal = getFanpagePalette(pg.pageId, effectivePages);
                    const shortCode = pg.shortId || String(pg.pageId).slice(-4);
                    return (
                      <button
                        key={pg.pageId}
                        type="button"
                        onClick={() => {
                          setChannelFilter("FACEBOOK");
                          setSelectedPageId(String(pg.pageId));
                        }}
                        title={`${pg.name} (Page ID: ${pg.pageId})${pg.category ? ` • ${pg.category}` : ""}`}
                        className={`px-2 py-1 rounded-lg text-[10px] font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer border ${
                          isPageActive
                            ? `${pal.activeFilter} badge-solid-white`
                            : "bg-slate-950/80 text-slate-300 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full shrink-0 ${
                            isPageActive ? "bg-white" : pal.dot
                          }`}
                        />
                        <span className="truncate max-w-[135px]">
                          {pg.name} <span className="opacity-75">#{shortCode}</span>
                        </span>
                        <span
                          className={`rounded-full px-1.5 text-[9px] font-bold tabular-nums ${
                            isPageActive ? "bg-black/25 text-white" : "bg-slate-800 text-slate-300"
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Danh sách các cuộc trò chuyện */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/50 min-h-0">
            {loadingConv ? (
              <div className="p-8 text-center text-xs text-slate-500 space-y-2">
                <div className="h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p>Đang đồng bộ hội thoại thực tế...</p>
              </div>
            ) : displayedActiveChats.length === 0 && contactOnlyList.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 space-y-2">
                <p>Không tìm thấy cuộc trò chuyện nào trong mục này.</p>
                {selectedPageId !== "ALL" && (
                  <button
                    type="button"
                    onClick={() => setSelectedPageId("ALL")}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer badge-solid-white"
                  >
                    Xem tất cả Fanpage ({fbTotalCount})
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* 1. Danh sách hội thoại có tin nhắn thực tế (chuẩn thứ tự thời gian thực) */}
                {displayedActiveChats.map((conv) => renderConversationRow(conv))}

                {/* 2. Danh bạ & Nhóm chưa có tin nhắn (Thu gọn ở dưới đáy để không làm nhảy danh sách chính) */}
                {contactOnlyList.length > 0 && (
                  <div className="bg-slate-950/40">
                    <button
                      type="button"
                      onClick={() => setShowContactsSection(!showContactsSection)}
                      className="w-full px-3 py-2 text-left text-[11px] font-semibold text-slate-400 hover:text-white flex items-center justify-between bg-slate-900/80 cursor-pointer"
                    >
                      <span>Danh bạ Zalo &amp; Nhóm khác ({contactOnlyList.length})</span>
                      <span className="text-[10px] text-blue-400">
                        {showContactsSection || searchQuery.trim() ? "Thu gọn ▲" : "Mở xem ▼"}
                      </span>
                    </button>
                    {(showContactsSection || Boolean(searchQuery.trim())) && (
                      <div className="divide-y divide-slate-800/40">
                        {contactOnlyList.map((conv) => renderConversationRow(conv))}
                      </div>
                    )}
                  </div>
                )}
              </>
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
                      <div
                        className={`h-10 w-10 rounded-full ${
                          getChannelMeta(activeConv.channel, activeConv.pageId, effectivePages).badgeBg
                        } flex items-center justify-center text-xs font-bold text-white badge-solid-white`}
                      >
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
                          getChannelMeta(activeConv.channel, activeConv.pageId, effectivePages).pillClass
                        }`}
                      >
                        {activeConv.channel === "FACEBOOK"
                          ? `Fanpage: ${
                              activeConv.pageDisplay ||
                              (activeConv.pageName && activeConv.pageShortId
                                ? `${activeConv.pageName} (#${activeConv.pageShortId})`
                                : activeConv.pageName || "Facebook")
                            }`
                          : activeConv.channelLabel || "Zalo Cá Nhân (Sơn Tùng)"}
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {activeConv.type === "GROUP" && activeConv.memberCount > 0
                        ? `Nhóm ${activeConv.memberCount} thành viên • `
                        : activeConv.phone
                        ? `SĐT: ${activeConv.phone} • `
                        : `ID: ${activeConv.id} • `}
                      {activeConv.channel === "FACEBOOK" && activeConv.pageId
                        ? `Page ID: ${activeConv.pageId} (${activeConv.pageName})`
                        : `Tài khoản: ${activeConv.accountName || "Zalo Cá Nhân (Sơn Tùng)"}`}
                    </p>
                  </div>
                </div>

                {/* WBS-32 & WBS-33: Bộ chuyển 3 chế độ AI & Nút Toggle Human-Takeover */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleConvBot()}
                    disabled={togglingBot}
                    title={
                      convBotMode === "AI"
                        ? "Bấm để dừng Bot AI và chuyển sang Nhân viên trực (45 phút)"
                        : "Bấm để bật lại Bot AI Dược sĩ Thảo tự động trực"
                    }
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer shadow-xs ${
                      convBotMode === "AI"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30"
                        : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30"
                    }`}
                  >
                    {convBotMode === "AI" ? (
                      <>
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        <span>🤖 Bot AI Đang Trực</span>
                      </>
                    ) : (
                      <>
                        <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                        <span>👤 Nhân Viên Trực (Đã Dừng Bot)</span>
                      </>
                    )}
                  </button>

                  <div className="hidden lg:flex items-center gap-1.5 bg-white dark:bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">
                      Trực:
                    </span>
                    <select
                      value={aiMode}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAiMode(val);
                        if (val === "HUMAN_ONLY") {
                          handleToggleConvBot("pause");
                        } else if (val === "AUTO_REPLY") {
                          handleToggleConvBot("resume");
                        }
                      }}
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
                    {messages[messages.length - 1]?.date
                      ? `Ngày ${messages[messages.length - 1].date}`
                      : "Hôm nay"}
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
                          <div
                            className="h-7 w-7 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-200 flex-shrink-0 badge-solid-white"
                            title={m.senderName || activeConv.name}
                          >
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
                            <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 mb-1">
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
                    className="h-11 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 transition-colors flex-shrink-0 shadow-sm whitespace-nowrap cursor-pointer badge-solid-white"
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
                    className="h-11 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 transition-colors flex-shrink-0 whitespace-nowrap cursor-pointer badge-solid-white"
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
                <div
                  className={`h-16 w-16 rounded-full ${
                    getChannelMeta(activeConv.channel, activeConv.pageId, effectivePages).badgeBg
                  } border-2 border-blue-400 flex items-center justify-center text-base font-bold text-white mx-auto badge-solid-white`}
                >
                  {activeConv.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="space-y-1">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white">{activeConv.name}</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {activeConv.phone || detectedChatPhone
                    ? `SĐT: ${activeConv.phone || detectedChatPhone}`
                    : `ID: ${activeConv.id}`}
                </p>
                {detectedAiTags.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-1 pt-1">
                    {detectedAiTags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="rounded-full bg-indigo-500/15 border border-indigo-500/30 px-2 py-0.5 text-[10px] font-semibold text-indigo-300"
                      >
                        ✨ {tag}
                      </span>
                    ))}
                  </div>
                )}
                <div className="pt-0.5">
                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                      getChannelMeta(activeConv.channel, activeConv.pageId, effectivePages).pillClass
                    }`}
                  >
                    {activeChannelName}
                  </span>
                </div>
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
                      className="w-full text-center rounded-xl bg-emerald-600 hover:bg-emerald-500 py-2.5 text-xs font-bold text-white shadow-sm transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer badge-solid-white"
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
                      className="w-full text-center rounded-xl bg-emerald-600 hover:bg-emerald-500 py-2.5 text-xs font-bold text-white shadow-sm transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer badge-solid-white"
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
        customer={
          activeConv
            ? {
                ...activeConv,
                phone: activeConv.phone || detectedChatPhone || matchedCustomer?.phone || "",
              }
            : null
        }
        onSuccess={(order) => {
          setToast({ type: "success", text: `Đã tạo đơn hàng ${order.orderCode} thành công!` });
          setTimeout(() => setToast(null), 3000);
        }}
      />
    </div>
  );
}
