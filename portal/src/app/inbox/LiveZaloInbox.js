"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  Users,
  Flame,
  Hourglass,
  ShieldAlert,
  Bot,
  Copy,
  ChevronDown,
} from "lucide-react";

/**
 * ADDP Omnichannel AI CRM — Hộp Thư Hội Thoại Hợp Nhất 3 Cột Thực Chiến
 * Cột 1: Danh sách Hội thoại Đa kênh (Pill-Tabs thực chiến + Dropdown Gom Kênh gọn gàng)
 * Cột 2: Khung Chat & Tác Nghiệp (Toggle AI Switch từng khách + Nút Lên Đơn + AI Gợi Ý)
 * Cột 3: Customer 360 & Trợ Lý AI Tóm Tắt 4 Mục Chuẩn Hóa
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
  for (let i = (messagesList || []).length - 1; i >= 0; i--) {
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

  // Thanh Filter Thực Chiến Pill-Tabs trượt ngang
  // 'all' | 'has_phone' | 'unanswered' | 'over_sla' | 'bot_on' | 'unread'
  const [activeTab, setActiveTab] = useState("all");

  // Dropdown gom kênh / tài khoản duy nhất ở góc trên Cột 1
  const [selectedAccountFilter, setSelectedAccountFilter] = useState("ALL");
  const [channelFilter, setChannelFilter] = useState("ALL");
  const [selectedPageId, setSelectedPageId] = useState("ALL");
  const [selectedZaloAccountId, setSelectedZaloAccountId] = useState("ALL");

  // Hồ Sơ Khách Hàng 360 liên kết với hội thoại
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

  // Chế độ AI & Toggle Switch từng khách
  const [aiMode, setAiMode] = useState("AUTO_REPLY"); // 'HUMAN_ONLY' | 'DRAFT_ONLY' | 'AUTO_REPLY'
  const [convBotMode, setConvBotMode] = useState("AI"); // 'AI' | 'HUMAN'
  const [isAccountLevelHuman, setIsAccountLevelHuman] = useState(false);
  const [togglingBot, setTogglingBot] = useState(false);
  const [aiComposing, setAiComposing] = useState(false);

  // Trợ lý AI Tóm Tắt 4 Mục
  const [aiSummary, setAiSummary] = useState(null);
  const [summarizing, setSummarizing] = useState(false);

  // Lên đơn hàng nhanh trong chat (QuickOrderModal)
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);

  // Kiểm tra xem một cuộc hội thoại có thuộc tài khoản đang cấu hình Nhân Viên Trực (HUMAN) hay không
  const isConversationAccountHuman = useCallback(
    (conv) => {
      if (!conv) return false;
      if (conv.channelBotMode === "HUMAN" || conv.isAccountLevelHuman) return true;
      if (conv.botMode === "HUMAN" && (conv.channelBotMode === "HUMAN" || !conv.channelBotMode))
        return true;

      const targetAccountId = String(conv.accountId || conv.accountOwnId || "");
      const targetAccountName = String(
        conv.accountName || conv.accountDisplayName || ""
      ).toLowerCase();
      const matchedAccount = (connectedZaloAccounts || []).find(
        (a) =>
          (targetAccountId &&
            (String(a.accountId) === targetAccountId || String(a.ownId) === targetAccountId)) ||
          (targetAccountName && a.name && targetAccountName.includes(String(a.name).toLowerCase())) ||
          (targetAccountName &&
            a.displayName &&
            targetAccountName.includes(String(a.displayName).toLowerCase()))
      );

      if (matchedAccount && matchedAccount.botMode === "HUMAN") {
        return true;
      }

      return false;
    },
    [connectedZaloAccounts]
  );

  const messagesEndRef = useRef(null);
  const activeConvRef = useRef(activeConv);
  const convSignatureRef = useRef("");
  const prevMsgCountRef = useRef(0);

  useEffect(() => {
    activeConvRef.current = activeConv;
  }, [activeConv]);

  // Kết nối SSE Realtime Stream để nhận tin nhắn tức thì từ mọi kênh
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
                if ((prev || []).some((m) => m.id === newMsg.id)) return prev;
                return [
                  ...prev,
                  {
                    id: newMsg.id,
                    text: newMsg.text,
                    senderName: newMsg.senderName,
                    isMe: newMsg.isMe,
                    isAi: newMsg.isAi || newMsg.fromBot || false,
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
              const list = prev || [];
              const idx = list.findIndex((c) => String(c.id) === String(newMsg.threadId));
              if (idx !== -1) {
                const target = {
                  ...list[idx],
                  isContactOnly: false,
                  lastMessage: newMsg.text,
                  lastActive: "Vài giây",
                  timestamp: Date.now(),
                  unreadCount: (list[idx].unreadCount || 0) + (newMsg.isMe ? 0 : 1),
                };
                const filtered = list.filter((_, i) => i !== idx);
                return [target, ...filtered];
              }
              return list;
            });
          }
        } catch {}
      };
    } catch {}

    return () => {
      if (eventSource) eventSource.close();
    };
  }, []);

  // Tự động cuộn xuống đáy khi có tin nhắn mới
  useEffect(() => {
    if (messages.length !== prevMsgCountRef.current) {
      prevMsgCountRef.current = messages.length;
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // 1. Tải danh sách cuộc hội thoại thực tế
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
          setConversations((prev) => {
            if ((prev || []).length !== list.length) return list;
            const byKey = new Map(
              list.map((item) => [`${item.channel}_${item.accountId || ""}_${item.id}`, item])
            );
            return (prev || []).map((oldItem) => {
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

    loadConversations(!hasLocal, false);

    const pollTimer = setInterval(() => {
      loadConversations(false, false);
    }, 12000);

    return () => clearInterval(pollTimer);
  }, []);

  // Tự động chọn hội thoại đầu tiên phù hợp khi đổi Dropdown tài khoản
  useEffect(() => {
    if ((conversations || []).length === 0) return;

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
        (conversations || []).find((c) => !c.isContactOnly && matchesCurrentFilter(c)) ||
        (conversations || []).find((c) => matchesCurrentFilter(c));
      if (firstMatch) setActiveConv(firstMatch);
    }
  }, [channelFilter, selectedPageId, selectedZaloAccountId, conversations, activeConv]);

  // 2. Tải lịch sử tin nhắn khi đổi người chat & tự động làm mới ngầm
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
              (prev || []).length === data.messages.length &&
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

    const msgPoll = setInterval(() => {
      fetchMessagesForActive(true);
    }, 7000);

    return () => {
      isCancelled = true;
      clearInterval(msgPoll);
    };
  }, [activeConv?.id, activeConv?.channel, activeConv?.pageId, activeConv?.accountId, activeConv?.type, activeConv?.zaloHome]);

  // Tìm kiếm & đồng bộ Hồ Sơ Khách Hàng 360 khi đổi người chat
  useEffect(() => {
    if (!activeConv) {
      setMatchedCustomer(null);
      setDetectedChatPhone("");
      setAiSummary(null);
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
          const exact =
            data.customers.find((c) => effectivePhone && normalizePhone(c.phone) === effectivePhone) ||
            data.customers[0];
          setMatchedCustomer(exact);
          if (Array.isArray(exact.tags) && exact.tags.length > 0) {
            setDetectedAiTags(exact.tags);
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
  }, [activeConv?.id, activeConv?.name, activeConv?.phone, messages]);

  // Đồng bộ trạng thái Bot AI theo cấp tài khoản & cấp hội thoại
  useEffect(() => {
    if (!activeConv?.id) return;
    let isCancelled = false;

    const isAccHumanInitial = isConversationAccountHuman(activeConv);
    if (isAccHumanInitial) {
      setConvBotMode("HUMAN");
      setIsAccountLevelHuman(true);
      setAiMode("HUMAN_ONLY");
    }

    async function fetchBotState() {
      try {
        const targetAccountId =
          activeConv.accountId ||
          activeConv.accountOwnId ||
          activeConv.accountDisplayName ||
          activeConv.accountName ||
          activeConv.channel ||
          "DEFAULT";

        const res = await fetch(
          `/api/ai/bot-control?threadId=${encodeURIComponent(activeConv.id)}&channelId=${encodeURIComponent(
            activeConv.channel || "DEFAULT"
          )}&accountId=${encodeURIComponent(targetAccountId)}`
        );
        const data = await res.json();
        if (isCancelled) return;

        const isAccHumanNow =
          isConversationAccountHuman(activeConv) ||
          data.accountMode === "HUMAN" ||
          data.state?.reason === "ACCOUNT_LEVEL_HUMAN" ||
          activeConv.channelBotMode === "HUMAN" ||
          activeConv.botMode === "HUMAN";

        if (isAccHumanNow) {
          setConvBotMode("HUMAN");
          setIsAccountLevelHuman(true);
          setAiMode("HUMAN_ONLY");
        } else if (data.ok && data.state) {
          const effective = data.effectiveMode || data.state.mode || "AI";
          setConvBotMode(effective);
          setIsAccountLevelHuman(false);
          setAiMode(effective === "HUMAN" ? "HUMAN_ONLY" : "AUTO_REPLY");
        }
      } catch {
        if (!isCancelled) {
          const fallbackHuman = isConversationAccountHuman(activeConv);
          setConvBotMode(fallbackHuman ? "HUMAN" : "AI");
          setIsAccountLevelHuman(fallbackHuman);
          setAiMode(fallbackHuman ? "HUMAN_ONLY" : "AUTO_REPLY");
        }
      }
    }

    fetchBotState();

    return () => {
      isCancelled = true;
    };
  }, [
    activeConv?.id,
    activeConv?.channel,
    activeConv?.accountId,
    activeConv?.accountDisplayName,
    activeConv?.accountName,
    activeConv?.channelBotMode,
    activeConv?.botMode,
    isConversationAccountHuman,
  ]);

  // Toggle Switch Bật/Tắt AI cho từng khách hàng (gửi tới POST /api/zalo/toggle-ai)
  const handleToggleAiSwitch = async () => {
    if (!activeConv?.id || togglingBot) return;
    const isCurrentlyAi = convBotMode === "AI";
    const nextEnabled = !isCurrentlyAi;
    const nextMode = nextEnabled ? "AI" : "HUMAN";

    setTogglingBot(true);
    setConvBotMode(nextMode);
    setAiMode(nextEnabled ? "AUTO_REPLY" : "HUMAN_ONLY");
    if (nextEnabled) {
      setIsAccountLevelHuman(false);
    }

    try {
      const res = await fetch("/api/zalo/toggle-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: activeConv.id,
          enabled: nextEnabled,
          staff_id: "STAFF",
          pause_minutes: 1440,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setToast({
          type: "success",
          text: nextEnabled
            ? "🤖 Đã bật AI Đang Trực cho khách hàng này."
            : "👤 Đã chuyển sang Nhân Viên Trực tiếp quản.",
        });
        setTimeout(() => setToast(null), 3000);
      }
    } catch (err) {
      console.error("Lỗi toggle AI:", err);
      setToast({ type: "error", text: "Không thể đổi trạng thái AI." });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setTogglingBot(false);
    }
  };

  // Trợ lý AI Tóm Tắt 4 Mục (gửi tới POST /api/zalo/ai-summary)
  const handleGenerateAiSummary = async () => {
    if (!activeConv) return;
    try {
      setSummarizing(true);
      const res = await fetch("/api/zalo/ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: activeConv.id,
          messages: (messages || []).slice(-15),
          customer: matchedCustomer || {
            name: activeConv.name,
            phone: activeConv.phone || detectedChatPhone,
            pathology: activeConv.pathology,
          },
        }),
      });
      const data = await res.json();
      if (data.ok && data.summary) {
        setAiSummary(data.summary);
        setToast({ type: "success", text: "Trợ lý AI đã cập nhật tóm tắt 4 mục!" });
        setTimeout(() => setToast(null), 3000);
      }
    } catch (err) {
      console.error("Lỗi AI summary:", err);
      setToast({ type: "error", text: "Lỗi kết nối tới Trợ lý AI Tóm Tắt." });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSummarizing(false);
    }
  };

  // Gửi tin nhắn 2 chiều
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!inputMessage.trim() || !activeConv || sending) return;

    const messageText = inputMessage.trim();
    const tempId = `temp_${Date.now()}`;
    const nowTime = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

    // Human-Takeover: Tự động ngắt Bot AI khi nhân viên chủ động gửi tin
    setConvBotMode("HUMAN");
    setAiMode("HUMAN_ONLY");
    fetch("/api/zalo/toggle-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        thread_id: activeConv.id,
        enabled: false,
        staff_id: "STAFF",
        pause_minutes: 1440,
      }),
    }).catch(() => {});

    const optimisticMsg = {
      id: tempId,
      text: messageText,
      isMe: true,
      isAi: false,
      senderName: activeConv.accountDisplayName || activeConv.accountName || "Chuyên viên ADDP",
      time: nowTime,
      date: "Hôm nay",
      status: "sending",
    };

    setMessages((prev) => [...(prev || []), optimisticMsg]);
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
          (prev || []).map((m) => (m.id === tempId ? { ...m, status: "sent" } : m))
        );
        setConversations((prev) => {
          const list = prev || [];
          const idx = list.findIndex(
            (c) =>
              String(c.id) === String(activeConv.id) &&
              c.channel === activeConv.channel &&
              String(c.accountId || "") === String(activeConv.accountId || "")
          );
          if (idx === -1) return list;
          const updatedConv = {
            ...list[idx],
            isContactOnly: false,
            lastMessage: `Bạn: ${messageText}`,
            lastActive: "Vài giây",
            timestamp: Date.now(),
          };
          const others = list.filter((_, i) => i !== idx);
          return [updatedConv, ...others];
        });
      } else {
        setToast({ type: "error", text: data.error || "Không thể gửi tin nhắn." });
        setMessages((prev) =>
          (prev || []).map((m) => (m.id === tempId ? { ...m, status: "error" } : m))
        );
      }
    } catch {
      setToast({ type: "error", text: "Lỗi kết nối khi gửi tin." });
      setMessages((prev) =>
        (prev || []).map((m) => (m.id === tempId ? { ...m, status: "error" } : m))
      );
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

  // AI Soạn / Gợi Ý phản hồi
  const handleAiCompose = async () => {
    if (!activeConv || aiComposing) return;
    try {
      setAiComposing(true);
      const res = await fetch("/api/ai/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: activeConv.id,
          customerName: activeConv.name,
          phone: activeConv.phone || detectedChatPhone,
          pathology: matchedCustomer?.pathology,
          currentGlucose: matchedCustomer?.currentGlucose,
          recentMessages: (messages || []).slice(-8),
          channel: activeConv.channel,
          pageId: activeConv.pageId,
        }),
      });
      const data = await res.json();
      if (data.ok && data.suggestion) {
        setInputMessage(data.suggestion);
        setToast({ type: "success", text: "✨ AI đã gợi ý câu trả lời tư vấn." });
        setTimeout(() => setToast(null), 3000);
      } else {
        setToast({ type: "error", text: data.error || "AI chưa thể sinh câu trả lời." });
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

  // Danh sách Fanpage FB
  const effectivePages = useMemo(() => {
    if (connectedPages.length > 0) return connectedPages;
    const map = new Map();
    for (const c of conversations || []) {
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
  }, [connectedPages, conversations]);

  // Danh sách tài khoản Zalo cá nhân
  const effectiveZaloAccounts = useMemo(() => {
    if (connectedZaloAccounts.length > 0) return connectedZaloAccounts;
    const map = new Map();
    for (const c of conversations || []) {
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
  }, [connectedZaloAccounts, conversations]);

  // Xử lý khi đổi lựa chọn trong Dropdown Gom Kênh ở Cột 1
  const handleAccountDropdownChange = (val) => {
    setSelectedAccountFilter(val);
    if (val === "ALL") {
      setChannelFilter("ALL");
      setSelectedZaloAccountId("ALL");
      setSelectedPageId("ALL");
    } else if (val === "ZALO_ALL") {
      setChannelFilter("ZALO_PERSONAL");
      setSelectedZaloAccountId("ALL");
      setSelectedPageId("ALL");
    } else if (val.startsWith("ZALO_ACCOUNT:")) {
      const accId = val.replace("ZALO_ACCOUNT:", "");
      setChannelFilter("ZALO_PERSONAL");
      setSelectedZaloAccountId(accId);
      setSelectedPageId("ALL");
    } else if (val.startsWith("PAGE:")) {
      const pId = val.replace("PAGE:", "");
      setChannelFilter("FACEBOOK");
      setSelectedPageId(pId);
      setSelectedZaloAccountId("ALL");
    } else if (val === "ZALO_OA") {
      setChannelFilter("ZALO_OA");
      setSelectedPageId("ALL");
      setSelectedZaloAccountId("ALL");
    }
  };

  // Tính số lượng cho từng Pill-Filter
  const pillCounts = useMemo(() => {
    const list = conversations || [];
    let hasPhone = 0;
    let unanswered = 0;
    let overSla = 0;
    let botOn = 0;
    let unread = 0;

    for (const c of list) {
      if (c.isContactOnly) continue;
      const phoneDirect = Boolean(c.phone && c.phone.trim().length >= 9);
      const phoneInMsg = Boolean(c.lastMessage && /(?:\+84|84|0)[35789]\d{8}/.test(c.lastMessage));
      if (phoneDirect || phoneInMsg) {
        hasPhone++;
      }
      if (c.lastMessage && !c.lastMessage.startsWith("Bạn:") && !c.lastMessageFromMe) {
        unanswered++;
      }
      if (c.is_over_sla || c.isOverSla || (c.unreadCount > 0 && Date.now() - (c.timestamp || 0) > 15 * 60 * 1000)) {
        overSla++;
      }
      if (!isConversationAccountHuman(c) && c.botMode !== "HUMAN") {
        botOn++;
      }
      if ((c.unreadCount || c.unread || 0) > 0) {
        unread++;
      }
    }

    return {
      all: list.filter((c) => !c.isContactOnly).length,
      hasPhone,
      unanswered,
      overSla,
      botOn,
      unread,
    };
  }, [conversations, isConversationAccountHuman]);

  // Bộ lọc hội thoại nâng cao
  const filteredConversations = useMemo(() => {
    return (conversations || []).filter((c) => {
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

      // Lọc theo Dropdown Kênh / Tài khoản
      if (channelFilter !== "ALL") {
        if (channelFilter === "ZALO_PERSONAL" && c.channel !== "ZALO_PERSONAL") return false;
        if (channelFilter === "ZALO_OA" && c.channel !== "ZALO_OA") return false;
        if (channelFilter === "FACEBOOK" && c.channel !== "FACEBOOK") return false;
      }

      if (selectedZaloAccountId !== "ALL") {
        if (c.channel !== "ZALO_PERSONAL" || String(c.accountId) !== String(selectedZaloAccountId)) {
          return false;
        }
      }

      if (selectedPageId !== "ALL") {
        if (c.channel !== "FACEBOOK" || String(c.pageId) !== String(selectedPageId)) return false;
      }

      // Lọc theo Thanh Pill-Tabs thực chiến
      if (activeTab === "has_phone") {
        const phoneDirect = Boolean(c.phone && c.phone.trim().length >= 9);
        const phoneInMsg = Boolean(c.lastMessage && /(?:\+84|84|0)[35789]\d{8}/.test(c.lastMessage));
        return phoneDirect || phoneInMsg;
      }

      if (activeTab === "unanswered") {
        const isLastFromCustomer = c.lastMessage && !c.lastMessage.startsWith("Bạn:") && !c.lastMessageFromMe;
        return Boolean(isLastFromCustomer || (c.unreadCount || c.unread || 0) > 0);
      }

      if (activeTab === "over_sla") {
        const isOver = Boolean(c.is_over_sla || c.isOverSla);
        const isWaitingLong = Boolean(
          (c.unreadCount || 0) > 0 &&
          Date.now() - (c.timestamp || 0) > 15 * 60 * 1000
        );
        return isOver || isWaitingLong;
      }

      if (activeTab === "bot_on") {
        const isHuman = isConversationAccountHuman(c) || c.botMode === "HUMAN" || c.aiMode === "HUMAN_ONLY";
        return !isHuman;
      }

      if (activeTab === "unread") {
        return (c.unreadCount || c.unread || 0) > 0;
      }

      return true;
    });
  }, [
    conversations,
    searchQuery,
    channelFilter,
    selectedZaloAccountId,
    selectedPageId,
    activeTab,
    isConversationAccountHuman,
  ]);

  const activeChatList = (filteredConversations || []).filter((c) => !c.isContactOnly);
  const contactOnlyList = (filteredConversations || []).filter((c) => c.isContactOnly);

  const displayedActiveChats = useMemo(() => {
    if (channelFilter === "ZALO_PERSONAL") {
      const pinned = activeChatList.filter((c) => c.isPinned);
      const unpinned = activeChatList.filter((c) => !c.isPinned);
      return [...pinned, ...unpinned];
    }
    return activeChatList;
  }, [channelFilter, activeChatList]);

  const activeChannelName = activeConv
    ? activeConv.accountName ||
      activeConv.channelLabel ||
      getChannelMeta(activeConv.channel, activeConv.pageId, effectivePages).label
    : effectiveZaloAccounts[0]?.channelLabel || "Zalo Cá Nhân";

  // Card hội thoại ở Cột 1
  const renderConversationRow = (conv) => {
    const isSelected =
      activeConv?.id === conv.id &&
      activeConv?.channel === conv.channel &&
      String(activeConv?.accountId || "") === String(conv.accountId || "");
    const convMeta = getChannelMeta(conv.channel, conv.pageId, effectivePages);
    const pagePal = conv.channel === "FACEBOOK" ? getFanpagePalette(conv.pageId, effectivePages) : null;
    const isSecondZalo = conv.channel === "ZALO_PERSONAL" && Number(conv.colorIndex || 0) > 0;

    const isBotActive = !isConversationAccountHuman(conv) && conv.botMode !== "HUMAN";
    const hasPhone = Boolean(conv.phone && conv.phone.trim().length >= 9);
    const isOverSla = Boolean(
      conv.is_over_sla ||
      conv.isOverSla ||
      ((conv.unreadCount || 0) > 0 && Date.now() - (conv.timestamp || 0) > 15 * 60 * 1000)
    );

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
        onClick={() => {
          const isHuman = isConversationAccountHuman(conv) || conv.botMode === "HUMAN";
          setConvBotMode(isHuman ? "HUMAN" : "AI");
          setIsAccountLevelHuman(isConversationAccountHuman(conv));
          setAiMode(isHuman ? "HUMAN_ONLY" : "AUTO_REPLY");
          setActiveConv(conv);
        }}
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

          {/* Badge tím AI góc trên avatar nếu Bot đang trực */}
          {isBotActive && (
            <span
              className="absolute -top-1 -right-1 bg-purple-600 text-white text-[8px] font-black px-1.5 py-0.2 rounded-full shadow-xs border border-white dark:border-slate-900 z-10 animate-pulse"
              title="Bot AI Đang Trực"
            >
              AI
            </span>
          )}

          {/* Badge nguồn góc dưới */}
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ${
              isSecondZalo ? "bg-teal-600" : convMeta.badgeBg
            } border-2 border-white dark:border-slate-900 flex items-center justify-center text-[7px] text-white font-black badge-solid-white`}
            title={sourceBadgeText}
          >
            {convMeta.avatarLetter}
          </span>
        </div>

        {/* Nội dung card */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <div className="flex items-center gap-1 min-w-0">
              {conv.isPinned && (
                <Pin
                  className="w-3 h-3 text-amber-400 shrink-0 rotate-45"
                  title="Hội thoại đã ghim"
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

          <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate mb-1">
            {conv.lastMessage || "Chưa có tin nhắn..."}
          </p>

          {/* Hàng nhãn phân biệt thực chiến: SĐT + Quá SLA + Nguồn */}
          <div className="flex items-center gap-1 flex-wrap">
            {hasPhone && (
              <span
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 text-[9px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/60"
                title={`Khách đã có số điện thoại: ${conv.phone}`}
              >
                📞 {conv.phone}
              </span>
            )}
            {isOverSla && (
              <span
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 text-[9px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-700/60 animate-pulse"
                title="Cảnh báo: Hội thoại quá hạn phản hồi SLA"
              >
                🚨 Quá SLA
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.2 text-[9px] font-semibold truncate max-w-[130px] ${pillColorClass}`}
              title={`Nguồn: ${sourceBadgeText}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColorClass}`} />
              <span className="truncate">{sourceBadgeText}</span>
            </span>
            {(conv.unreadCount > 0 || conv.unread > 0) && (
              <span className="rounded-full bg-rose-500 px-1.5 py-0.2 text-[9px] font-bold text-white badge-solid-white tabular-nums ml-auto">
                {conv.unreadCount || conv.unread}
              </span>
            )}
          </div>
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

      {/* GIAO DIỆN CHAT 3 CỘT THỰC CHIẾN */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ========================================================================= */}
        {/* CỘT 1: DANH SÁCH HỘI THOẠI (CONVERSATIONS LIST)                           */}
        {/* ========================================================================= */}
        <div className="w-84 flex-shrink-0 border-r border-slate-800 bg-slate-900/90 flex flex-col min-h-0">
          {/* Header gọn gàng & Tìm kiếm */}
          <div className="p-3 border-b border-slate-800 space-y-2.5 shrink-0">
            {/* Hàng 1: Tiêu đề + Dropdown Gom Kênh Duy Nhất + Actions */}
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-xs shrink-0 badge-solid-white">
                  Z
                </span>
                <h2 className="text-sm font-bold text-white tracking-tight truncate">
                  Hộp Thư Đa Kênh
                </h2>
              </div>

              {/* Dropdown gom tài khoản / kênh duy nhất ở góc trên bên phải */}
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="relative">
                  <select
                    value={selectedAccountFilter}
                    onChange={(e) => handleAccountDropdownChange(e.target.value)}
                    aria-label="Lọc theo tài khoản hoặc kênh"
                    className="h-7 pl-2 pr-6 text-[11px] font-semibold rounded-lg bg-slate-800 border border-slate-700 text-slate-200 hover:text-white focus:outline-none focus:border-blue-500 cursor-pointer appearance-none"
                  >
                    <option value="ALL">Tất cả tài khoản ({conversations.length})</option>
                    {effectiveZaloAccounts.length > 0 && (
                      <option value="ZALO_ALL">
                        Tất cả Zalo QR ({pillCounts.all})
                      </option>
                    )}
                    {effectiveZaloAccounts.map((acc) => (
                      <option key={acc.accountId} value={`ZALO_ACCOUNT:${acc.accountId}`}>
                        Zalo: {acc.name}
                      </option>
                    ))}
                    {effectivePages.map((pg) => (
                      <option key={pg.pageId} value={`PAGE:${pg.pageId}`}>
                        Fanpage: {pg.name}
                      </option>
                    ))}
                    <option value="ZALO_OA">Zalo OA Official</option>
                  </select>
                  <ChevronDown className="w-3 h-3 text-slate-400 absolute right-1.5 top-2 pointer-events-none" />
                </div>

                <button
                  type="button"
                  onClick={() => loadConversations(false, true)}
                  aria-label="Làm mới danh sách hội thoại"
                  title="Đồng bộ mới nhất từ tất cả tài khoản"
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

            {/* Ô tìm kiếm nhanh */}
            <div className="relative">
              <input
                type="text"
                placeholder="Tìm tên khách, SĐT, nội dung..."
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

            {/* Thanh Pill-Filter Thực Chiến Trượt Ngang */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] font-semibold no-scrollbar scroll-smooth">
              {/* [Tất cả] */}
              <button
                type="button"
                onClick={() => setActiveTab("all")}
                className={`px-2.5 py-1 rounded-xl whitespace-nowrap transition-all cursor-pointer inline-flex items-center gap-1.5 border shadow-2xs ${
                  activeTab === "all"
                    ? "bg-blue-600 text-white border-blue-500 badge-solid-white font-bold"
                    : "bg-slate-950/80 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700"
                }`}
              >
                <span>Tất cả</span>
                <span
                  className={`rounded-full px-1.5 text-[9px] tabular-nums ${
                    activeTab === "all" ? "bg-black/25 text-white" : "bg-slate-800 text-slate-300"
                  }`}
                >
                  {pillCounts.all}
                </span>
              </button>

              {/* [🔥 Có SĐT] */}
              <button
                type="button"
                onClick={() => setActiveTab("has_phone")}
                className={`px-2.5 py-1 rounded-xl whitespace-nowrap transition-all cursor-pointer inline-flex items-center gap-1 border shadow-2xs ${
                  activeTab === "has_phone"
                    ? "bg-emerald-600 text-white border-emerald-500 badge-solid-white font-bold"
                    : "bg-slate-950/80 text-emerald-400 border-slate-800 hover:border-emerald-600/40"
                }`}
              >
                <Flame className="w-3 h-3 text-amber-400 shrink-0" />
                <span>Có SĐT</span>
                <span
                  className={`rounded-full px-1.5 text-[9px] tabular-nums ${
                    activeTab === "has_phone"
                      ? "bg-black/25 text-white"
                      : "bg-emerald-950 text-emerald-300 border border-emerald-800/40"
                  }`}
                >
                  {pillCounts.hasPhone}
                </span>
              </button>

              {/* [⏳ Chưa trả lời] */}
              <button
                type="button"
                onClick={() => setActiveTab("unanswered")}
                className={`px-2.5 py-1 rounded-xl whitespace-nowrap transition-all cursor-pointer inline-flex items-center gap-1 border shadow-2xs ${
                  activeTab === "unanswered"
                    ? "bg-amber-600 text-white border-amber-500 badge-solid-white font-bold"
                    : "bg-slate-950/80 text-amber-400 border-slate-800 hover:border-amber-600/40"
                }`}
              >
                <Hourglass className="w-3 h-3 text-amber-300 shrink-0" />
                <span>Chưa trả lời</span>
                <span
                  className={`rounded-full px-1.5 text-[9px] tabular-nums ${
                    activeTab === "unanswered"
                      ? "bg-black/25 text-white"
                      : "bg-amber-950 text-amber-300 border border-amber-800/40"
                  }`}
                >
                  {pillCounts.unanswered}
                </span>
              </button>

              {/* [🚨 Quá SLA] */}
              <button
                type="button"
                onClick={() => setActiveTab("over_sla")}
                className={`px-2.5 py-1 rounded-xl whitespace-nowrap transition-all cursor-pointer inline-flex items-center gap-1 border shadow-2xs ${
                  activeTab === "over_sla"
                    ? "bg-rose-600 text-white border-rose-500 badge-solid-white font-bold"
                    : "bg-slate-950/80 text-rose-400 border-slate-800 hover:border-rose-600/40"
                }`}
              >
                <ShieldAlert className="w-3 h-3 text-rose-400 shrink-0" />
                <span>Quá SLA</span>
                <span
                  className={`rounded-full px-1.5 text-[9px] tabular-nums ${
                    activeTab === "over_sla"
                      ? "bg-black/25 text-white"
                      : "bg-rose-950 text-rose-300 border border-rose-800/40"
                  }`}
                >
                  {pillCounts.overSla}
                </span>
              </button>

              {/* [🤖 AI Trả lời] */}
              <button
                type="button"
                onClick={() => setActiveTab("bot_on")}
                className={`px-2.5 py-1 rounded-xl whitespace-nowrap transition-all cursor-pointer inline-flex items-center gap-1 border shadow-2xs ${
                  activeTab === "bot_on"
                    ? "bg-purple-600 text-white border-purple-500 badge-solid-white font-bold"
                    : "bg-slate-950/80 text-purple-400 border-slate-800 hover:border-purple-600/40"
                }`}
              >
                <Bot className="w-3 h-3 text-purple-300 shrink-0" />
                <span>AI Trả lời</span>
                <span
                  className={`rounded-full px-1.5 text-[9px] tabular-nums ${
                    activeTab === "bot_on"
                      ? "bg-black/25 text-white"
                      : "bg-purple-950 text-purple-300 border border-purple-800/40"
                  }`}
                >
                  {pillCounts.botOn}
                </span>
              </button>

              {/* [Chưa đọc] */}
              <button
                type="button"
                onClick={() => setActiveTab("unread")}
                className={`px-2.5 py-1 rounded-xl whitespace-nowrap transition-all cursor-pointer inline-flex items-center gap-1 border shadow-2xs ${
                  activeTab === "unread"
                    ? "bg-sky-600 text-white border-sky-500 badge-solid-white font-bold"
                    : "bg-slate-950/80 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700"
                }`}
              >
                <span>Chưa đọc</span>
                <span
                  className={`rounded-full px-1.5 text-[9px] tabular-nums ${
                    activeTab === "unread"
                      ? "bg-black/25 text-white"
                      : "bg-slate-800 text-slate-300"
                  }`}
                >
                  {pillCounts.unread}
                </span>
              </button>
            </div>
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
                {selectedAccountFilter !== "ALL" && (
                  <button
                    type="button"
                    onClick={() => handleAccountDropdownChange("ALL")}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer badge-solid-white"
                  >
                    Xem tất cả tài khoản
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* 1. Danh sách hội thoại có tin nhắn */}
                {displayedActiveChats.map((conv) => renderConversationRow(conv))}

                {/* 2. Danh bạ & Nhóm chưa có tin nhắn */}
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
              {/* Header khung chat thực chiến */}
              <div className="h-15 px-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/60 backdrop-blur flex items-center justify-between gap-3 flex-shrink-0">
                {/* Thông tin khách hàng & SĐT */}
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

                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                        {activeConv.name}
                      </h3>

                      {/* Badge SĐT nổi bật */}
                      {(activeConv.phone || detectedChatPhone) && (
                        <span
                          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.2 text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/60"
                          title="Số điện thoại khách hàng"
                        >
                          📞 {activeConv.phone || detectedChatPhone}
                        </span>
                      )}

                      {/* Nhãn tài khoản tiếp nhận */}
                      <span
                        className={`rounded-md text-[10px] font-semibold px-2 py-0.2 whitespace-nowrap flex-shrink-0 ${
                          getChannelMeta(activeConv.channel, activeConv.pageId, effectivePages).pillClass
                        }`}
                      >
                        {activeChannelName}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {activeConv.type === "GROUP" && activeConv.memberCount > 0
                        ? `Nhóm ${activeConv.memberCount} thành viên • `
                        : activeConv.phone
                        ? `SĐT: ${activeConv.phone} • `
                        : `ID: ${activeConv.id} • `}
                      {activeConv.channel === "FACEBOOK" && activeConv.pageId
                        ? `Page ID: ${activeConv.pageId} (${activeConv.pageName})`
                        : `Tài khoản: ${activeConv.accountName || (activeConv.accountDisplayName ? `Zalo: ${activeConv.accountDisplayName}` : "Zalo Cá Nhân")}`}
                    </p>
                  </div>
                </div>

                {/* Cụm điều khiển tác nghiệp nhanh: Toggle Switch AI + Lên Đơn + Gọi + Hồ Sơ */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {(() => {
                    const isAccountHuman =
                      isConversationAccountHuman(activeConv) ||
                      isAccountLevelHuman ||
                      activeConv?.channelBotMode === "HUMAN" ||
                      activeConv?.botMode === "HUMAN";
                    const isThreadHuman = isAccountHuman || convBotMode === "HUMAN";

                    return (
                      <>
                        {/* Công tắc Toggle Switch Bật/Tắt AI cho từng khách */}
                        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={!isThreadHuman}
                            onClick={handleToggleAiSwitch}
                            disabled={togglingBot}
                            title={
                              !isThreadHuman
                                ? "AI Đang Trực — Bấm để chuyển sang Nhân viên trực"
                                : "Sale Tiếp Quản — Bấm để bật lại AI Đang Trực"
                            }
                            className="inline-flex items-center gap-2 cursor-pointer focus:outline-none"
                          >
                            <span className="text-xs font-bold whitespace-nowrap">
                              {!isThreadHuman ? (
                                <span className="text-purple-600 dark:text-purple-400 flex items-center gap-1">
                                  <span className="h-2 w-2 rounded-full bg-purple-500 animate-pulse shrink-0" />
                                  🤖 AI Đang Trực
                                </span>
                              ) : (
                                <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1">
                                  <span className="h-2 w-2 rounded-full bg-slate-400 shrink-0" />
                                  👤 Sale Tiếp Quản
                                </span>
                              )}
                            </span>
                            {/* Switch Pill */}
                            <span
                              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out ${
                                !isThreadHuman
                                  ? "bg-purple-600"
                                  : "bg-slate-300 dark:bg-slate-700"
                              }`}
                            >
                              <span
                                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${
                                  !isThreadHuman ? "translate-x-4.5" : "translate-x-1"
                                }`}
                              />
                            </span>
                          </button>
                        </div>

                        {/* Nút Lên Đơn Nhanh */}
                        <button
                          type="button"
                          onClick={() => setIsOrderModalOpen(true)}
                          title="Tạo đơn hàng nhanh cho khách"
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer badge-solid-white"
                        >
                          <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
                          <span>Lên Đơn</span>
                        </button>
                      </>
                    );
                  })()}

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
                    const isAi = m.isAi || m.fromBot || (isMe && m.senderName?.includes("AI"));
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
                              ? isAi
                                ? "bg-purple-600 text-white rounded-br-none badge-solid-white"
                                : "bg-blue-600 text-white rounded-br-none badge-solid-white"
                              : "bg-white text-slate-900 border border-slate-200 dark:bg-slate-800/90 dark:text-slate-100 rounded-bl-none dark:border-slate-700/60"
                          }`}
                        >
                          {/* Nhãn AI Tự Động Soạn nếu tin nhắn từ AI */}
                          {isAi && (
                            <div className="flex items-center gap-1 text-[10px] text-purple-200 font-bold mb-1">
                              <Sparkles className="w-3 h-3 text-amber-300" />
                              <span>✨ AI Tự Động Soạn</span>
                            </div>
                          )}

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
                              isMe ? (isAi ? "text-purple-200" : "text-blue-100") : "text-slate-400"
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

                  {/* Nút ✨ AI Gợi Ý */}
                  <button
                    type="button"
                    onClick={handleAiCompose}
                    disabled={aiComposing || sending}
                    title="Dựa vào Second Brain để viết thành lời tư vấn chuẩn Dược sĩ"
                    className="h-11 px-3.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 transition-colors flex-shrink-0 shadow-sm whitespace-nowrap cursor-pointer badge-solid-white"
                  >
                    {aiComposing ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                        <span className="hidden sm:inline">Đang soạn...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 shrink-0" />
                        <span>✨ AI Gợi Ý</span>
                      </>
                    )}
                  </button>

                  {/* Nút Gửi */}
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
        {/* CỘT 3: HỒ SƠ KHÁCH HÀNG 360 & TRỢ LÝ AI TÓM TẮT 4 MỤC                      */}
        {/* ========================================================================= */}
        {showSidePanel && activeConv && (
          <div className="w-80 flex-shrink-0 border-l border-slate-800 bg-slate-900/90 p-4 flex flex-col overflow-y-auto space-y-4 min-h-0">
            {/* Header thông tin khách */}
            <div className="text-center space-y-2 border-b border-slate-800 pb-3">
              {activeConv.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={activeConv.avatar}
                  alt={activeConv.name}
                  className="h-14 w-14 rounded-full object-cover border-2 border-blue-500 mx-auto"
                />
              ) : (
                <div
                  className={`h-14 w-14 rounded-full ${
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
                  <div className="flex flex-wrap justify-center gap-1 pt-0.5">
                    {detectedAiTags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="rounded-full bg-indigo-500/15 border border-indigo-500/30 px-2 py-0.2 text-[9px] font-semibold text-indigo-300"
                      >
                        ✨ {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Action buttons nhỏ */}
              <div className="flex justify-center gap-1.5 pt-1">
                <button
                  type="button"
                  className="px-2 py-1 rounded-lg bg-slate-800 text-[11px] text-slate-200 hover:bg-slate-700 transition-colors inline-flex items-center gap-1 cursor-pointer"
                  title="Ghim hội thoại"
                >
                  <Pin className="w-3 h-3 text-amber-400 shrink-0" />
                  <span>Ghim</span>
                </button>
                <button
                  type="button"
                  className="px-2 py-1 rounded-lg bg-slate-800 text-[11px] text-slate-200 hover:bg-slate-700 transition-colors inline-flex items-center gap-1 cursor-pointer"
                  title="Tắt thông báo"
                >
                  <BellOff className="w-3 h-3 text-slate-400 shrink-0" />
                  <span>Tắt chuông</span>
                </button>
                <Link
                  href="/customers"
                  className="px-2 py-1 rounded-lg bg-blue-600/20 border border-blue-500/30 text-[11px] text-blue-300 font-semibold hover:bg-blue-600/30 transition-colors inline-flex items-center gap-1"
                  title="Mở hồ sơ khách hàng 360"
                >
                  <UserCheck className="w-3 h-3 shrink-0" />
                  <span>Hồ Sơ 360</span>
                </Link>
              </div>
            </div>

            {/* MODULE: TRỢ LÝ AI TÓM TẮT 4 MỤC (Gradient Tím Chuẩn Hóa) */}
            <div className="rounded-2xl border border-purple-200 dark:border-purple-800/60 bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-indigo-950/30 p-3.5 space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                  <div>
                    <h5 className="text-xs font-bold text-purple-950 dark:text-purple-200 uppercase tracking-wide">
                      Trợ Lý AI Tóm Tắt
                    </h5>
                    <p className="text-[10px] text-purple-600/80 dark:text-purple-400/80">
                      Phân tích từ 15 tin gần nhất
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleGenerateAiSummary}
                  disabled={summarizing}
                  className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-[11px] font-bold shadow-xs inline-flex items-center gap-1 transition-colors cursor-pointer badge-solid-white shrink-0"
                >
                  {summarizing ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
                      <span>Đang phân tích...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3 shrink-0" />
                      <span>Tóm tắt ngay</span>
                    </>
                  )}
                </button>
              </div>

              {/* 4 Thẻ Cố Định Chuẩn Hóa */}
              <div className="space-y-2 text-xs">
                {/* 1. Bệnh Lý & Triệu Chứng */}
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-900/60 dark:text-rose-200 space-y-1">
                  <div className="font-bold flex items-center gap-1 text-[11px] text-rose-700 dark:text-rose-300">
                    <span>🩺 01. Bệnh Lý & Triệu Chứng</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    {aiSummary?.pathology ||
                      (matchedCustomer?.pathology
                        ? `Bệnh lý: ${matchedCustomer.pathology}${
                            matchedCustomer.currentGlucose
                              ? ` • Đường huyết: ${matchedCustomer.currentGlucose} mmol/L`
                              : ""
                          }`
                        : "Tiểu đường tuýp 2, đường huyết ~7.0 mmol/L, hay mệt mỏi, người uể oải, tiểu đêm.")}
                  </p>
                </div>

                {/* 2. Nhu Cầu & Sản Phẩm */}
                <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 dark:bg-blue-950/40 dark:border-blue-900/60 dark:text-blue-200 space-y-1">
                  <div className="font-bold flex items-center gap-1 text-[11px] text-blue-700 dark:text-blue-300">
                    <span>🥛 02. Nhu Cầu & Sản Phẩm</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    {aiSummary?.demand ||
                      "Bổ sung dinh dưỡng kiểm soát đường huyết êm, bồi bổ thể trạng; quan tâm Sữa hạt Glucare Plus Isomalt & Đông trùng hạ thảo (liệu trình 2 - 3 lon)."}
                  </p>
                </div>

                {/* 3. Điểm Còn Băn Khoăn */}
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-900/60 dark:text-amber-200 space-y-1">
                  <div className="font-bold flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300">
                    <span>⚠️ 03. Điểm Còn Băn Khoăn</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    {aiSummary?.concerns ||
                      "Lo ngại vị ngọt sữa có làm tăng đường không (Isomalt hấp thu chậm); thắc mắc chính sách ship và cam kết hiệu quả."}
                  </p>
                </div>

                {/* 4. Gợi Ý Kịch Bản Chốt */}
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-900/60 dark:text-emerald-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[11px] text-emerald-700 dark:text-emerald-300">
                      🎯 04. Gợi Ý Kịch Bản Chốt
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const text =
                          aiSummary?.closing_script ||
                          `Dạ với mức đường và thể trạng này, ${
                            aiSummary?.customerPronoun || "mình"
                          } duy trì 2 ly Glucare Plus mỗi ngày thay bữa phụ giúp giữ đường huyết rất êm, bớt đói mệt. Hôm nay bên em đang có ưu đãi miễn phí ship tận nhà kèm cẩm nang ăn uống, em gửi về cho mình nhé?`;
                        setInputMessage(text);
                        setToast({ type: "success", text: "Đã điền kịch bản chốt vào ô nhập tin nhắn!" });
                        setTimeout(() => setToast(null), 2500);
                      }}
                      title="Chèn câu này vào khung chat"
                      className="text-[10px] text-emerald-700 dark:text-emerald-300 hover:underline font-semibold inline-flex items-center gap-0.5 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Dùng kịch bản</span>
                    </button>
                  </div>
                  <p className="text-[11px] leading-relaxed italic">
                    "{aiSummary?.closing_script ||
                      "Dạ với mức đường và thể trạng này, duy trì 2 ly Glucare Plus mỗi ngày thay bữa phụ giúp giữ đường huyết rất êm, bớt đói mệt. Hôm nay bên em đang có ưu đãi miễn phí ship tận nhà kèm cẩm nang ăn uống, em gửi về cho mình nhé?"}"
                  </p>
                </div>
              </div>
            </div>

            {/* KHỐI ĐƠN HÀNG & CHỐT DEAL */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Lịch Sử Mua Hàng &amp; Đơn Hàng
                </h5>
                {matchedCustomer?.code && (
                  <span className="font-mono bg-blue-950 text-blue-400 border border-blue-800/60 px-1.5 py-0.2 rounded text-[10px] font-bold">
                    {matchedCustomer.code}
                  </span>
                )}
              </div>

              {/* Lịch sử mua hàng ngắn gọn */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Tổng chi tiêu:</span>
                  <span className="font-bold text-white tabular-nums">
                    {(matchedCustomer?.totalSpent || 0).toLocaleString("vi-VN")} đ
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Số đơn đã mua:</span>
                  <span className="font-semibold text-blue-400 tabular-nums">
                    {matchedCustomer?.totalOrders || 0} đơn
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Tỷ lệ nhận hàng:</span>
                  <span className="font-semibold text-emerald-400 tabular-nums">
                    {matchedCustomer?.deliveryRate || "100%"}
                  </span>
                </div>
              </div>

              {/* Nút to Tạo Đơn Hàng Mới */}
              <button
                type="button"
                onClick={() => setIsOrderModalOpen(true)}
                className="w-full text-center rounded-xl bg-emerald-600 hover:bg-emerald-500 py-2.5 text-xs font-bold text-white shadow-sm transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer badge-solid-white"
              >
                <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
                <span>🛒 Tạo Đơn Hàng Mới</span>
              </button>
            </div>

            {/* Ghi chú tư vấn thực tế */}
            <div className="space-y-2 border-t border-slate-800 pt-3 text-xs">
              <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Ghi Chú Tư Vấn
              </h5>
              <textarea
                rows={3}
                placeholder="Nhập ghi chú tư vấn thực tế dành cho khách hàng này..."
                className="w-full rounded-xl border border-slate-800 bg-slate-950 p-2 text-xs text-slate-300 placeholder-slate-500 focus:border-blue-500 focus:outline-none resize-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Modal Lên đơn hàng nhanh (QuickOrderModal) */}
      <QuickOrderModal
        isOpen={isOrderModalOpen}
        onClose={() => setIsOrderModalOpen(false)}
        customer={
          activeConv
            ? {
                ...activeConv,
                fullName: activeConv.name,
                name: activeConv.name,
                phone: activeConv.phone || detectedChatPhone || matchedCustomer?.phone || "",
                address: matchedCustomer?.address || "",
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
