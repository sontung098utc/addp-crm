"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import QuickOrderModal from "../components/QuickOrderModal";
import BulkMessageModal from "../components/BulkMessageModal";
import QuickRepliesModal from "./QuickRepliesModal";
import ProductPickerModal from "./ProductPickerModal";
import AudioRecorderBar from "./AudioRecorderBar";
import QuickTagBar from "./QuickTagBar";
import ChatToolbar from "./ChatToolbar";
import { normalizePhone, isValidVietnamPhone } from "@/lib/phone";
import {
  playNotificationSound,
  setupAudioUnlockListener,
  requestNotificationPermission,
  showBrowserNotification,
} from "@/lib/soundNotification.js";
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
  Bell,
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
  Globe,
  Check,
  DownloadCloud,
  Tag,
  Undo2,
  Smile,
  FileText,
  Volume2,
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
    case "TIKTOK_SHOP":
    case "TIKTOK":
    case "tiktok_shop":
      return {
        code: "TT",
        label: "TikTok Shop",
        avatarLetter: "♪",
        badgeBg: "bg-slate-900",
        pillClass: "bg-pink-500/15 text-pink-600 dark:text-pink-300 border border-pink-500/30",
        dotColor: "bg-pink-500",
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

function formatMessageForDisplay(rawText, msgType) {
  const str = String(rawText || "").trim();
  if (!str) {
    if (msgType === "chat.photo" || msgType === "image") {
      return { text: "[Hình ảnh]", isPhoto: false, isRecalled: false, isSticker: false };
    }
    if (msgType === "chat.sticker" || msgType === "sticker") {
      return { text: "[Nhãn dán Zalo]", isPhoto: false, isRecalled: false, isSticker: true };
    }
    return { text: "[Tin nhắn]", isPhoto: false, isRecalled: false, isSticker: false };
  }

  // Thu hồi tin nhắn
  if (
    str.startsWith("[chat.undo") ||
    str.includes("chat.undo") ||
    str.includes('"deleteMsg":') ||
    str.includes('"globalMsgId":')
  ) {
    return { text: "Tin nhắn đã được thu hồi", isPhoto: false, isRecalled: true, isSticker: false };
  }

  // Tin nhắn đã bị xóa
  if (str.startsWith("[chat.delete") || str.includes("chat.delete")) {
    return { text: "Tin nhắn đã bị xóa", isPhoto: false, isRecalled: true, isSticker: false };
  }

  // Nhãn dán Zalo base64 hash token: #FxdSgDir4HJLBcZnNBE6a7xMu5RM4TIoAPdq1dwrGyfhNmGzwx5kkzYvsjBjR4E=10,873
  if (
    /^#[A-Za-z0-9+/=]+=\d+,\d+$/.test(str) ||
    (str.startsWith("#") && str.includes("=") && str.length > 20) ||
    msgType === "chat.sticker" ||
    msgType === "sticker"
  ) {
    return { text: "[Nhãn dán Zalo]", isPhoto: false, isRecalled: false, isSticker: true };
  }

  // Danh thiếp Zalo
  if (str.startsWith("{") && str.includes('"phone"') && str.includes('"qrCodeUrl"')) {
    return { text: "[Danh thiếp Zalo]", isPhoto: false, isRecalled: false, isSticker: false };
  }

  // Web content link
  if (str === "[chat.webcontent]" || str.startsWith("[chat.webcontent:")) {
    return { text: "[Liên kết đính kèm]", isPhoto: false, isRecalled: false, isSticker: false };
  }

  // JSON payload
  if (str.startsWith("{") && str.endsWith("}")) {
    try {
      const p = JSON.parse(str);
      if (p.actionType || p.deleteMsg !== undefined || p.globalMsgId) {
        return { text: "Tin nhắn đã được thu hồi", isPhoto: false, isRecalled: true, isSticker: false };
      }
      if (p.title) return { text: p.title, isPhoto: false, isRecalled: false, isSticker: false };
      if (p.text) return { text: p.text, isPhoto: false, isRecalled: false, isSticker: false };
    } catch {}
  }

  return { text: str, isPhoto: false, isRecalled: false, isSticker: false };
}

function formatSnippetForDisplay(rawSnippet) {
  if (!rawSnippet) return "Chưa có tin nhắn...";
  let prefix = "";
  let body = String(rawSnippet).trim();
  const colonIdx = body.indexOf(":");
  if (colonIdx > 0 && colonIdx < 30) {
    prefix = body.substring(0, colonIdx + 1) + " ";
    body = body.substring(colonIdx + 1).trim();
  }

  const info = formatMessageForDisplay(body);
  return `${prefix}${info.text}`;
}

export default function LiveZaloInbox() {
  const [conversations, setConversations] = useState([]);
  const [connectedPages, setConnectedPages] = useState([]);
  const [connectedZaloAccounts, setConnectedZaloAccounts] = useState([]);
  const [connectedTikTokShops, setConnectedTikTokShops] = useState([]);
  const [loadingConv, setLoadingConv] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeConv, setActiveConv] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Thanh Filter Thực Chiến Pill-Tabs trượt ngang
  // 'all' | 'has_phone' | 'unanswered' | 'over_sla' | 'bot_on' | 'unread'
  const [activeTab, setActiveTab] = useState("all");

  // Dropdown Popover gom kênh / tài khoản duy nhất ở góc trên Cột 1
  const [selectedAccountFilter, setSelectedAccountFilter] = useState("ALL");
  const [channelFilter, setChannelFilter] = useState("ALL");
  const [selectedPageId, setSelectedPageId] = useState("ALL");
  const [selectedZaloAccountId, setSelectedZaloAccountId] = useState("ALL");
  const [selectedTikTokShopId, setSelectedTikTokShopId] = useState("ALL");
  const [channelPopoverOpen, setChannelPopoverOpen] = useState(false);
  const [isSyncingHistory, setIsSyncingHistory] = useState(false);
  const [isSyncingTikTok, setIsSyncingTikTok] = useState(false);
  const [zaloSyncStatus, setZaloSyncStatus] = useState(null);
  const [refreshMsgCount, setRefreshMsgCount] = useState(0);
  const channelPopoverRef = useRef(null);
  const [currentUserRole, setCurrentUserRole] = useState("ADMIN");
  const [currentStaffName, setCurrentStaffName] = useState("Chuyên viên ADDP");
  const deepLinkLookupInFlightRef = useRef(false);

  // Hồ Sơ Khách Hàng 360 liên kết với hội thoại
  const [matchedCustomer, setMatchedCustomer] = useState(null);
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  const [detectedChatPhone, setDetectedChatPhone] = useState("");

  // Tin nhắn của cuộc trò chuyện đang chọn
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messagesError, setMessagesError] = useState(null);
  const [messagesMeta, setMessagesMeta] = useState({
    hasMore: false,
    oldestTimestamp: 0,
    latestTimestamp: 0,
    historyLimited: false,
    limitationReason: "",
  });
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [inputMessage, setInputMessage] = useState("");
  const [sending, setSending] = useState(false);

  // Hiển thị panel thông tin khách hàng (Cột 3)
  const [showSidePanel, setShowSidePanel] = useState(true);
  // Mở rộng danh bạ chưa có tin nhắn
  const [showContactsSection, setShowContactsSection] = useState(false);

  // Thông báo nhanh
  const [toast, setToast] = useState(null);

  // Virtualization / Infinite Scroll chống lag Main Thread (WBS-21 Performance)
  const [visibleCount, setVisibleCount] = useState(40);
  const messageCacheRef = useRef(new Map());

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

  // Vpage Enhanced Chat States (Trả lời nhanh, Sản phẩm, Ghi âm, File đính kèm)
  const [isQuickRepliesOpen, setIsQuickRepliesOpen] = useState(false);
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [isAudioRecordingOpen, setIsAudioRecordingOpen] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState([]);

  // Quản lý Thẻ Tag Khách Hàng (Customer Tags Management)
  const [availableTags, setAvailableTags] = useState([]);
  const [isTagPopoverOpen, setIsTagPopoverOpen] = useState(false);
  const [isRightTagPopoverOpen, setIsRightTagPopoverOpen] = useState(false);
  const tagPopoverRef = useRef(null);
  const rightTagPopoverRef = useRef(null);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("blue");
  const [selectedTagFilter, setSelectedTagFilter] = useState("ALL");

  // Modal Gửi Tin Nhắn Hàng Loạt (BulkMessageModal)
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

  // Kiểm tra xem một cuộc hội thoại có thuộc tài khoản đang cấu hình Nhân Viên Trực (HUMAN) hay không
  const isConversationAccountHuman = useCallback(
    (conv) => {
      if (!conv) return false;
      // Quyết định cụ thể trên hội thoại: nếu đã được BẬT AI -> Không bị khóa bởi cấp tài khoản
      if (conv.botMode === "AI") return false;
      if (conv.channelBotMode === "HUMAN" || conv.isAccountLevelHuman) return true;
      if (conv.botMode === "HUMAN") return true;

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
  const msgStreamRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const forceScrollNextRef = useRef(true);
  const convInFlightRef = useRef(false);
  const msgInFlightRef = useRef(false);
  const latestTimestampRef = useRef(0);
  const activeConvRef = useRef(activeConv);
  const convSignatureRef = useRef("");
  const prevMsgCountRef = useRef(0);
  const deepLinkAppliedRef = useRef(false);
  const deepLinkStaffAppliedRef = useRef(false);

  useEffect(() => {
    activeConvRef.current = activeConv;
  }, [activeConv]);

  // Click outside hook để tự động đóng Dropdown Popover kênh
  useEffect(() => {
    function handleClickOutside(event) {
      if (channelPopoverRef.current && !channelPopoverRef.current.contains(event.target)) {
        setChannelPopoverOpen(false);
      }
    }
    if (channelPopoverOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [channelPopoverOpen]);

  // Tải danh sách thẻ tags từ backend
  const loadTags = useCallback(async () => {
    try {
      const res = await fetch("/api/tags");
      const data = await res.json();
      if (data.ok && Array.isArray(data.tags)) {
        setAvailableTags(data.tags);
      }
    } catch (err) {
      console.error("Lỗi tải tags:", err);
    }
  }, []);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  // Click outside hook để tự động đóng Dropdown Popover thẻ tag (cả 2 vị trí top bar và cột phải)
  useEffect(() => {
    function handleClickOutsideTag(event) {
      if (tagPopoverRef.current && !tagPopoverRef.current.contains(event.target)) {
        setIsTagPopoverOpen(false);
      }
      if (rightTagPopoverRef.current && !rightTagPopoverRef.current.contains(event.target)) {
        setIsRightTagPopoverOpen(false);
      }
    }
    if (isTagPopoverOpen || isRightTagPopoverOpen) {
      document.addEventListener("mousedown", handleClickOutsideTag);
      document.addEventListener("touchstart", handleClickOutsideTag);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutsideTag);
      document.removeEventListener("touchstart", handleClickOutsideTag);
    };
  }, [isTagPopoverOpen, isRightTagPopoverOpen]);

  // Bật/tắt thẻ tag cho active conversation
  const handleToggleTagOnActiveConv = async (tagNameOrId) => {
    if (!activeConv?.id) return;
    const foundTag = availableTags.find((t) => t.id === tagNameOrId || t.name === tagNameOrId);
    const targetName = foundTag ? foundTag.name : tagNameOrId;

    const currentTags = Array.isArray(activeConv.tags) ? [...activeConv.tags] : [];
    const exists = currentTags.includes(targetName) || currentTags.includes(tagNameOrId);
    const updatedTags = exists
      ? currentTags.filter((t) => t !== targetName && t !== tagNameOrId)
      : [...currentTags, targetName];

    // Cập nhật giao diện tức thì
    setActiveConv((prev) => (prev ? { ...prev, tags: updatedTags } : prev));
    setConversations((prev) =>
      (prev || []).map((c) =>
        String(c.id) === String(activeConv.id)
          ? { ...c, tags: updatedTags }
          : c
      )
    );

    try {
      await fetch("/api/conversations/update-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: activeConv.id,
          phone: activeConv.phone || detectedChatPhone || "",
          tags: updatedTags,
        }),
      });
    } catch (err) {
      console.error("Lỗi cập nhật tag:", err);
    }
  };

  // Tạo tag mới và gắn ngay vào active conversation
  const handleCreateAndAttachTag = async () => {
    if (!newTagName.trim() || !activeConv?.id) return;
    const clean = newTagName.trim();
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clean, color: newTagColor }),
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.tags)) {
        setAvailableTags(data.tags);
      }
      setNewTagName("");
      await handleToggleTagOnActiveConv(clean);
    } catch (err) {
      console.error("Lỗi tạo tag mới:", err);
    }
  };

  // Quản lý âm thanh thông báo & Mở khóa audio
  const [isSoundMuted, setIsSoundMuted] = useState(false);
  const prevTotalUnreadRef = useRef(-1);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsSoundMuted(localStorage.getItem("addp_inbox_sound_muted") === "true");
    }
    const cleanupAudio = setupAudioUnlockListener();
    requestNotificationPermission();
    return () => {
      cleanupAudio();
    };
  }, []);

  const toggleSoundMute = () => {
    const next = !isSoundMuted;
    setIsSoundMuted(next);
    try {
      localStorage.setItem("addp_inbox_sound_muted", String(next));
    } catch {}
    if (!next) {
      playNotificationSound();
      setToast({ type: "success", text: "🔔 Đã BẬT chuông thông báo tin nhắn mới!" });
    } else {
      setToast({ type: "info", text: "🔕 Đã TẮT chuông thông báo tin nhắn." });
    }
  };

  const markAsRead = useCallback(async (threadId) => {
    if (!threadId) return;
    const now = Date.now();
    try {
      localStorage.setItem(`addp_read_${threadId}`, String(now));
    } catch {}
    try {
      await fetch("/api/conversations/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, timestamp: now }),
      });
    } catch (err) {
      console.warn("[markAsRead error]", err);
    }
  }, []);

  // Đồng bộ tiêu đề tab trình duyệt và badge sidebar theo tổng số tin chưa đọc
  useEffect(() => {
    const totalUnread = (conversations || []).reduce(
      (sum, c) => sum + (c.isContactOnly ? 0 : Number(c.unreadCount || c.unread || 0)),
      0
    );
    if (typeof document !== "undefined") {
      document.title = totalUnread > 0
        ? `(${totalUnread}) 💬 ADDP CRM — Hộp thư Đa kênh`
        : "ADDP CRM — Hộp thư Đa kênh";
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("addp:unread-count", { detail: { count: totalUnread } }));
    }
  }, [conversations]);

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
            const isIncoming = !newMsg.isMe;

            // Phát âm thanh chuông ting-ting & Thông báo Desktop nếu là tin nhắn đến từ khách hàng
            if (isIncoming) {
              playNotificationSound();
              if (typeof document !== "undefined" && document.hidden) {
                showBrowserNotification(newMsg.senderName || "ADDP CRM — Tin nhắn mới", newMsg.text);
              }
            }
            if (activeConvRef.current && String(activeConvRef.current.id) === String(newMsg.threadId)) {
              const msgTs = Number(newMsg.timestamp) || Date.now();
              if (msgTs > latestTimestampRef.current) latestTimestampRef.current = msgTs;
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
              markAsRead(newMsg.threadId);
            }

            // Cập nhật dòng hội thoại ở cột 1 lên đầu
            const isCurrentActive =
              activeConvRef.current && String(activeConvRef.current.id) === String(newMsg.threadId);
            const addedUnread = (!isCurrentActive && isIncoming) ? 1 : 0;

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
                  unreadCount: isCurrentActive ? 0 : (list[idx].unreadCount || 0) + addedUnread,
                  unread: isCurrentActive ? 0 : (list[idx].unreadCount || 0) + addedUnread,
                };
                const filtered = list.filter((_, i) => i !== idx);
                return [target, ...filtered];
              } else {
                const newConv = {
                  id: newMsg.threadId,
                  name: newMsg.senderName || "Khách mới",
                  type: "DIRECT",
                  avatar: "",
                  phone: "",
                  memberCount: 0,
                  isPinned: false,
                  lastMessage: newMsg.text,
                  lastActive: "Vài giây",
                  timestamp: Date.now(),
                  channel: newMsg.channel || "ZALO_PERSONAL",
                  unreadCount: isCurrentActive ? 0 : addedUnread,
                  unread: isCurrentActive ? 0 : addedUnread,
                };
                return [newConv, ...list];
              }
            });
          }
        } catch {}
      };
    } catch {}

    return () => {
      if (eventSource) eventSource.close();
    };
  }, []);

  // Tự động cuộn xuống đáy khi đổi hội thoại hoặc có tin nhắn mới (chỉ khi đang ở gần đáy)
  useEffect(() => {
    if (messages.length !== prevMsgCountRef.current) {
      prevMsgCountRef.current = messages.length;
      if (forceScrollNextRef.current || isNearBottomRef.current) {
        forceScrollNextRef.current = false;
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [messages]);

  // 1. Tải danh sách cuộc hội thoại thực tế (chống chồng lặp request)
  const loadConversations = async (showLoading = true, forceRefresh = false) => {
    if (convInFlightRef.current && !forceRefresh) return;
    convInFlightRef.current = true;
    try {
      if (showLoading) setLoadingConv(true);
      else if (forceRefresh) setIsRefreshing(true);

      const url = `/api/channels/zalo/conversations${forceRefresh ? "?refresh=1" : ""}`;
      const resConv = await fetch(url);
      const dataConv = await resConv.json();

      if (Array.isArray(dataConv.connectedPages)) {
        setConnectedPages(dataConv.connectedPages);
      }
      if (Array.isArray(dataConv.connectedTikTokShops)) {
        setConnectedTikTokShops(dataConv.connectedTikTokShops);
      }
      if (dataConv.currentUserRole) {
        setCurrentUserRole(dataConv.currentUserRole);
      }
      if (dataConv.currentStaffName) {
        setCurrentStaffName(dataConv.currentStaffName);
      }
      if (dataConv.syncStatus !== undefined) {
        setZaloSyncStatus(dataConv.syncStatus || null);
      }
      if (Array.isArray(dataConv.connectedZaloAccounts)) {
        setConnectedZaloAccounts(dataConv.connectedZaloAccounts);
        if (dataConv.connectedZaloAccounts.length === 0) {
          setSelectedAccountFilter((prev) =>
            prev === "ZALO_ALL" || String(prev).startsWith("ZALO_ACCOUNT:") ? "ALL" : prev
          );
          setChannelFilter((prev) => (prev === "ZALO_PERSONAL" ? "ALL" : prev));
          setSelectedZaloAccountId("ALL");
        }
      }

      if (dataConv.ok && Array.isArray(dataConv.conversations)) {
        const list = dataConv.conversations;

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

            // Phát chuông thông báo nếu có tin nhắn chưa đọc mới xuất hiện
            const currentTotalUnread = list.reduce(
              (sum, c) => sum + (c.isContactOnly ? 0 : Number(c.unreadCount || c.unread || 0)),
              0
            );
            if (prevTotalUnreadRef.current !== -1 && currentTotalUnread > prevTotalUnreadRef.current) {
              playNotificationSound();
            }
            prevTotalUnreadRef.current = currentTotalUnread;
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
              if (prev.isDirectCareTemp || prev.isTemp) {
                const prevPhone = normalizePhone(prev.phone || prev.id);
                if (prevPhone) {
                  const phoneMatch = list.find(
                    (c) => normalizePhone(c.phone || c.zaloPhone || c.customerPhone || "") === prevPhone
                  );
                  if (phoneMatch) return { ...phoneMatch, phone: prevPhone };
                }
                return prev;
              }
            }
            return list.find((c) => !c.isContactOnly) || list[0];
          });
        } else {
          convSignatureRef.current = "";
          setConversations([]);
          setActiveConv(null);
          setMessages([]);
          try {
            sessionStorage.setItem("addp_inbox_conversations", "[]");
          } catch {}
        }
      }
    } catch (err) {
      console.error("Lỗi tải hội thoại:", err);
    } finally {
      convInFlightRef.current = false;
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
          const hasDeepLink =
            typeof window !== "undefined" &&
            (window.location.search.includes("phone=") ||
              window.location.search.includes("zaloUid=") ||
              window.location.search.includes("name="));
          if (!hasDeepLink) {
            setActiveConv(parsed.find((c) => !c.isContactOnly) || parsed[0]);
          }
          setLoadingConv(false);
          hasLocal = true;
        }
      }
    } catch {}

    loadConversations(!hasLocal, false);

    // Chu kỳ làm mới danh sách hội thoại ngầm ổn định (30 giây), chỉ cập nhật khi tab đang hiển thị
    const pollTimer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      loadConversations(false, false);
    }, 30000);

    let lastVisibilityCheck = Date.now();
    const handleVisibility = () => {
      if (!document.hidden && Date.now() - lastVisibilityCheck > 25000) {
        lastVisibilityCheck = Date.now();
        loadConversations(false, false);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  // Tự động chọn hội thoại đầu tiên phù hợp khi đổi Dropdown tài khoản
  useEffect(() => {
    if ((conversations || []).length === 0) return;

    const matchesCurrentFilter = (c) => {
      if (!c) return false;
      if (channelFilter !== "ALL" && c.channel !== channelFilter) return false;
      if (selectedZaloAccountId !== "ALL") {
        if (c.channel !== "ZALO_PERSONAL") return false;
        const cAcc = String(c.accountId || c.accountOwnId || "").trim();
        const selAcc = String(selectedZaloAccountId || "").trim();
        if (cAcc && selAcc && cAcc !== selAcc && !cAcc.includes(selAcc) && !selAcc.includes(cAcc)) {
          return false;
        }
      }
      if (selectedPageId !== "ALL") {
        if (c.channel !== "FACEBOOK" || String(c.pageId) !== String(selectedPageId)) return false;
      }
      return true;
    };

    if (!activeConv || !matchesCurrentFilter(activeConv)) {
      if (activeConv?.isDirectCareTemp || activeConv?.isTemp) return;
      const firstMatch =
        (conversations || []).find((c) => !c.isContactOnly && matchesCurrentFilter(c)) ||
        (conversations || []).find((c) => matchesCurrentFilter(c));
      if (firstMatch) setActiveConv(firstMatch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelFilter, selectedPageId, selectedZaloAccountId]);

  // 2. Tải lịch sử tin nhắn khi đổi người chat & đồng bộ tăng dần (cursor since + chống chồng lặp + pause khi ẩn tab)
  useEffect(() => {
    if (!activeConv?.id) return;
    let isCancelled = false;
    const convCacheKey = `${activeConv.channel}_${activeConv.accountId || ""}_${activeConv.id}`;
    latestTimestampRef.current = 0;
    forceScrollNextRef.current = true;
    isNearBottomRef.current = true;
    setMessagesError(null);
    setMessagesMeta({
      hasMore: false,
      oldestTimestamp: 0,
      latestTimestamp: 0,
      historyLimited: false,
      limitationReason: "",
    });

    async function fetchMessagesForActive(silent = false) {
      if (activeConv?.isDirectCareTemp) {
        setLoadingMessages(false);
        setMessages([]);
        setMessagesError(null);
        return;
      }
      if (msgInFlightRef.current && silent) return;
      msgInFlightRef.current = true;
      try {
        if (!silent) {
          setLoadingMessages(true);
          setMessagesError(null);
          prevMsgCountRef.current = 0;
        }
        const sinceQuery =
          silent && latestTimestampRef.current > 0
            ? `&since=${encodeURIComponent(latestTimestampRef.current)}`
            : "&limit=100";

        const res = await fetch(
          `/api/channels/zalo/messages?threadId=${encodeURIComponent(activeConv.id)}&type=${encodeURIComponent(
            activeConv.type || "DIRECT"
          )}&channel=${encodeURIComponent(activeConv.channel || "ZALO_PERSONAL")}&pageId=${encodeURIComponent(
            activeConv.pageId || ""
          )}&accountId=${encodeURIComponent(activeConv.accountId || "")}&homeDir=${encodeURIComponent(
            activeConv.zaloHome || ""
          )}&name=${encodeURIComponent(activeConv.name || activeConv.customerName || "")}${sinceQuery}`
        );
        const data = await res.json().catch(() => null);
        if (isCancelled) return;

        if (res.ok && data?.ok && Array.isArray(data.messages)) {
          setMessagesError(null);
          const nextLatest = Number(data.latestTimestamp) || 0;
          if (nextLatest > latestTimestampRef.current) {
            latestTimestampRef.current = nextLatest;
          }

          if (data.incremental) {
            if (data.messages.length > 0) {
              setMessages((prev) => {
                const existing = prev || [];
                const seen = new Set(existing.map((m) => String(m.id)));
                const additions = data.messages.filter((m) => !seen.has(String(m.id)));
                if (additions.length === 0) return existing;
                const merged = [...existing, ...additions].sort(
                  (a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0)
                );
                messageCacheRef.current.set(convCacheKey, merged);
                return merged;
              });
            }
          } else {
            const maxTs = data.messages.reduce((mx, m) => Math.max(mx, Number(m.timestamp) || 0), 0);
            if (maxTs > latestTimestampRef.current) latestTimestampRef.current = maxTs;

            setMessagesMeta({
              hasMore: Boolean(data.hasMore),
              oldestTimestamp: Number(data.oldestTimestamp) || 0,
              latestTimestamp: nextLatest || maxTs,
              historyLimited: Boolean(data.historyLimited),
              limitationReason: data.limitationReason || "",
            });

            // Nếu API trả về 0 tin nhưng hội thoại có snippet xem trước (lastMessage) -> giữ tin nhắn preview để không bị trắng màn hình
            let incoming = data.messages;
            if (incoming.length === 0 && activeConv?.lastMessage) {
              const rawSnippet = String(activeConv.lastMessage || "").trim();
              if (rawSnippet && rawSnippet !== "[Tin nhắn]") {
                const isSystem = rawSnippet.startsWith("[Hệ thống]");
                const isMe = !isSystem && (rawSnippet.startsWith("Bạn:") || Boolean(activeConv.isSelf));
                const cleanText = rawSnippet.replace(/^Bạn:\s*|^\[Hệ thống\]\s*|^[^:]+:\s*/, "");
                incoming = [
                  {
                    id: `preview_${activeConv.id}_${activeConv.timestamp || Date.now()}`,
                    text: cleanText || rawSnippet,
                    isMe,
                    isSystem,
                    senderId: isMe ? String(activeConv.accountOwnId || "") : String(activeConv.id || ""),
                    senderName: isMe
                      ? (activeConv.accountDisplayName || "Bạn")
                      : isSystem
                      ? "Hệ thống"
                      : (activeConv.name || "Khách"),
                    timestamp: activeConv.timestamp || Date.now(),
                    time: activeConv.lastActive || "Gần đây",
                    date: "Gần đây",
                    type: "text",
                    status: "sent",
                    isFallbackPreview: true,
                  },
                ];
              }
            }

            messageCacheRef.current.set(convCacheKey, incoming);
            setMessages((prev) => {
              if (
                silent &&
                (prev || []).length === incoming.length &&
                prev[prev.length - 1]?.id === incoming[incoming.length - 1]?.id
              ) {
                return prev;
              }
              return incoming;
            });
          }
        } else if (!silent) {
          setMessagesError(data?.error || `Lỗi tải tin nhắn (HTTP ${res.status}).`);
        }
      } catch (err) {
        if (!silent && !isCancelled) {
          setMessagesError(err?.message || "Mất kết nối khi tải lịch sử tin nhắn.");
        }
      } finally {
        msgInFlightRef.current = false;
        if (!silent && !isCancelled) setLoadingMessages(false);
      }
    }

    // Hiển thị ngay lập tức từ client cache nếu đã mở trước đó (0ms delay)
    const cachedMsgs = messageCacheRef.current.get(convCacheKey);
    if (cachedMsgs && Array.isArray(cachedMsgs) && cachedMsgs.length > 0) {
      setMessages(cachedMsgs);
      const maxCachedTs = cachedMsgs.reduce((mx, m) => Math.max(mx, Number(m.timestamp) || 0), 0);
      latestTimestampRef.current = maxCachedTs;
      fetchMessagesForActive(true);
    } else if (
      activeConv?.lastMessage &&
      String(activeConv.lastMessage).trim() &&
      String(activeConv.lastMessage).trim() !== "[Tin nhắn]"
    ) {
      // Nạp ngay tin nhắn preview trong lúc fetch API để người dùng không thấy màn hình trống
      const rawSnippet = String(activeConv.lastMessage).trim();
      const isSystem = rawSnippet.startsWith("[Hệ thống]");
      const isMe = !isSystem && (rawSnippet.startsWith("Bạn:") || Boolean(activeConv.isSelf));
      const cleanText = rawSnippet.replace(/^Bạn:\s*|^\[Hệ thống\]\s*|^[^:]+:\s*/, "");
      const previewMsg = [
        {
          id: `preview_${activeConv.id}_${activeConv.timestamp || Date.now()}`,
          text: cleanText || rawSnippet,
          isMe,
          isSystem,
          senderId: isMe ? String(activeConv.accountOwnId || "") : String(activeConv.id || ""),
          senderName: isMe ? (activeConv.accountDisplayName || "Bạn") : isSystem ? "Hệ thống" : (activeConv.name || "Khách"),
          timestamp: activeConv.timestamp || Date.now(),
          time: activeConv.lastActive || "Gần đây",
          date: "Gần đây",
          type: "text",
          status: "sent",
          isFallbackPreview: true,
        },
      ];
      setMessages(previewMsg);
      fetchMessagesForActive(false);
    } else {
      fetchMessagesForActive(false);
    }

    const msgPoll = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      fetchMessagesForActive(true);
    }, 7000);

    const handleVisibility = () => {
      if (!document.hidden) fetchMessagesForActive(true);
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      isCancelled = true;
      clearInterval(msgPoll);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [activeConv?.id, activeConv?.channel, activeConv?.pageId, activeConv?.accountId, activeConv?.type, activeConv?.zaloHome, refreshMsgCount]);

  // Tải thêm tin nhắn cũ (phân trang ngược theo cursor before, giữ nguyên vị trí cuộn)
  const handleLoadOlderMessages = async () => {
    if (!activeConv?.id || loadingOlder || !messagesMeta.hasMore || !messagesMeta.oldestTimestamp) return;
    const container = msgStreamRef.current;
    const prevScrollHeight = container?.scrollHeight || 0;
    const prevScrollTop = container?.scrollTop || 0;

    try {
      setLoadingOlder(true);
      const res = await fetch(
        `/api/channels/zalo/messages?threadId=${encodeURIComponent(activeConv.id)}&type=${encodeURIComponent(
          activeConv.type || "DIRECT"
        )}&channel=${encodeURIComponent(activeConv.channel || "ZALO_PERSONAL")}&pageId=${encodeURIComponent(
          activeConv.pageId || ""
        )}&accountId=${encodeURIComponent(activeConv.accountId || "")}&homeDir=${encodeURIComponent(
          activeConv.zaloHome || ""
        )}&before=${encodeURIComponent(messagesMeta.oldestTimestamp)}&limit=100`
      );
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok && Array.isArray(data.messages) && data.messages.length > 0) {
        setMessages((prev) => {
          const existing = prev || [];
          const seen = new Set(existing.map((m) => String(m.id)));
          const older = data.messages.filter((m) => !seen.has(String(m.id)));
          const merged = [...older, ...existing].sort(
            (a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0)
          );
          const convCacheKey = `${activeConv.channel}_${activeConv.accountId || ""}_${activeConv.id}`;
          messageCacheRef.current.set(convCacheKey, merged);
          return merged;
        });
        setMessagesMeta((prev) => ({
          ...prev,
          hasMore: Boolean(data.hasMore),
          oldestTimestamp: Number(data.oldestTimestamp) || prev.oldestTimestamp,
          historyLimited: Boolean(data.historyLimited),
        }));
        requestAnimationFrame(() => {
          if (msgStreamRef.current) {
            const newScrollHeight = msgStreamRef.current.scrollHeight;
            msgStreamRef.current.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
          }
        });
      }
    } catch {
    } finally {
      setLoadingOlder(false);
    }
  };

  // Tìm kiếm & đồng bộ Hồ Sơ Khách Hàng 360 khi đổi người chat
  useEffect(() => {
    if (!activeConv) {
      setMatchedCustomer(null);
      setDetectedChatPhone("");
      setAiSummary(null);
      return;
    }
    let isCancelled = false;

    // CHỈ sử dụng SĐT xác thực của khách hàng / Zalo profile (tuyệt đối KHÔNG quét bừa SĐT từ nội dung tin nhắn)
    const verifiedConvPhone =
      (activeConv.phone && normalizePhone(activeConv.phone)) ||
      (activeConv.zaloPhone && normalizePhone(activeConv.zaloPhone)) ||
      "";
    setDetectedChatPhone(verifiedConvPhone);

    async function loadCustomerProfile() {
      try {
        setLoadingCustomer(true);
        const targetUid = String(activeConv.zaloUid || activeConv.id || "").trim();
        let searchParam = verifiedConvPhone || targetUid || "";
        if (!searchParam && activeConv.customerId) {
          searchParam = String(activeConv.customerId);
        }
        if (!searchParam) {
          setMatchedCustomer(null);
          return;
        }
        const res = await fetch(`/api/customers?search=${encodeURIComponent(searchParam)}`);
        const data = await res.json();
        if (!isCancelled && data.ok && Array.isArray(data.customers) && data.customers.length > 0) {
          const exact =
            data.customers.find(
              (c) =>
                (verifiedConvPhone && normalizePhone(c.phone) === verifiedConvPhone) ||
                (activeConv.customerId && String(c.id) === String(activeConv.customerId)) ||
                (targetUid &&
                  (String(c.zaloUid || "") === targetUid ||
                    String(c.zaloThreadId || "") === targetUid))
            ) || data.customers[0];
          setMatchedCustomer(exact);
          if (exact?.phone && !verifiedConvPhone) {
            const normCrmPhone = normalizePhone(exact.phone);
            if (normCrmPhone) setDetectedChatPhone(normCrmPhone);
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
  }, [activeConv?.id, activeConv?.zaloUid, activeConv?.phone, activeConv?.zaloPhone]);

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

        if (data.ok && data.state) {
          const effective = data.effectiveMode || data.state.mode || (data.accountMode === "HUMAN" ? "HUMAN" : "AI");
          setConvBotMode(effective);
          setIsAccountLevelHuman(effective === "HUMAN" && data.accountMode === "HUMAN");
          setAiMode(effective === "HUMAN" ? "HUMAN_ONLY" : "AUTO_REPLY");
        } else {
          const fallbackHuman = isConversationAccountHuman(activeConv);
          setConvBotMode(fallbackHuman ? "HUMAN" : "AI");
          setIsAccountLevelHuman(fallbackHuman);
          setAiMode(fallbackHuman ? "HUMAN_ONLY" : "AUTO_REPLY");
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

  // Toggle Switch Bật/Tắt AI cho từng khách hàng (gửi tới POST /api/ai/bot-control & /api/zalo/toggle-ai)
  const handleToggleAiSwitch = async () => {
    if (!activeConv?.id || togglingBot) return;
    const isCurrentlyAi = convBotMode === "AI";
    const nextEnabled = !isCurrentlyAi;
    const nextMode = nextEnabled ? "AI" : "HUMAN";

    setTogglingBot(true);
    setConvBotMode(nextMode);
    setAiMode(nextEnabled ? "AUTO_REPLY" : "HUMAN_ONLY");
    setIsAccountLevelHuman(false);

    // Cập nhật ngay trong activeConv để UI re-render lập tức
    setActiveConv((prev) =>
      prev
        ? {
            ...prev,
            botMode: nextMode,
            channelBotMode: nextEnabled ? "AI" : prev.channelBotMode,
            isAccountLevelHuman: false,
          }
        : prev
    );

    // Cập nhật trong danh sách conversations bên cột trái
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConv.id
          ? {
              ...c,
              botMode: nextMode,
              channelBotMode: nextEnabled ? "AI" : c.channelBotMode,
              isAccountLevelHuman: false,
              aiMode: nextEnabled ? "AUTO_REPLY" : "HUMAN_ONLY",
            }
          : c
      )
    );

    try {
      const targetAccountId =
        activeConv.accountId ||
        activeConv.accountOwnId ||
        activeConv.accountDisplayName ||
        activeConv.accountName ||
        activeConv.channel ||
        "DEFAULT";

      // 1. Gọi bot-control đồng bộ toàn hệ thống
      const res = await fetch("/api/ai/bot-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: activeConv.id,
          channelId: activeConv.channel || "DEFAULT",
          accountId: targetAccountId,
          action: nextEnabled ? "resume" : "pause",
          enabled: nextEnabled,
          staffId: "STAFF",
          pauseMinutes: 1440,
        }),
      });
      const data = await res.json();

      // 2. Đồng thời gọi zalo/toggle-ai đảm bảo tương thích mọi worker
      fetch("/api/zalo/toggle-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: activeConv.id,
          enabled: nextEnabled,
          account_id: targetAccountId,
          staff_id: "STAFF",
          pause_minutes: 1440,
        }),
      }).catch(() => {});

      if (data.ok) {
        const finalMode = data.effectiveMode || data.state?.mode || nextMode;
        setConvBotMode(finalMode);
        setAiMode(finalMode === "AI" ? "AUTO_REPLY" : "HUMAN_ONLY");
        setToast({
          type: "success",
          text: finalMode === "AI"
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

  // Gửi tin nhắn 2 chiều (Hỗ trợ text, ảnh, file đính kèm, hoặc gửi trực tiếp)
  const handleSendMessage = async (e, customText = null) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!activeConv || sending) return;

    const primaryAtt = attachedFiles.length > 0 ? attachedFiles[0] : null;
    const messageText = typeof customText === "string" ? customText.trim() : inputMessage.trim();

    if (!messageText && !primaryAtt) return;

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
      text: messageText || (primaryAtt?.isImage ? "[Hình ảnh]" : primaryAtt?.isAudio ? "[Ghi âm]" : `[Tập tin: ${primaryAtt?.name || ""}]`),
      url: primaryAtt?.previewUrl || primaryAtt?.url || "",
      isPhoto: Boolean(primaryAtt?.isImage),
      isAudio: Boolean(primaryAtt?.isAudio),
      fileName: primaryAtt?.name || "",
      type: primaryAtt?.isImage ? "chat.photo" : primaryAtt?.isAudio ? "chat.voice" : "text",
      isMe: true,
      isAi: false,
      senderName: activeConv.accountDisplayName || activeConv.accountName || "Chuyên viên ADDP",
      time: nowTime,
      date: "Hôm nay",
      status: "sending",
    };

    forceScrollNextRef.current = true;
    setMessages((prev) => {
      const next = [...(prev || []), optimisticMsg];
      const convCacheKey = `${activeConv.channel}_${activeConv.accountId || ""}_${activeConv.id}`;
      messageCacheRef.current.set(convCacheKey, next);
      return next;
    });

    if (!customText) {
      setInputMessage("");
    }
    setAttachedFiles([]);
    setSending(true);

    try {
      const res = await fetch("/api/channels/zalo/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: activeConv.phone || activeConv.id,
          recipientId: activeConv.recipientId || activeConv.phone || activeConv.id,
          recipientPhone: activeConv.phone || detectedChatPhone || "",
          pageId: activeConv.pageId || "",
          accountId: activeConv.accountId || "",
          homeDir: activeConv.zaloHome || "",
          type: activeConv.type || "DIRECT",
          message: messageText,
          mediaUrl: primaryAtt?.url || "",
          filePath: primaryAtt?.filePath || "",
          isImage: Boolean(primaryAtt?.isImage),
          isAudio: Boolean(primaryAtt?.isAudio),
          fileName: primaryAtt?.name || "",
          channel: activeConv.channel || "ZALO_PERSONAL",
          staffId: "STAFF",
          staffName: currentStaffName || "Chuyên viên ADDP",
          staffConfirmed: true,
        }),
      });

      const resText = await res.text();
      let data = null;
      try {
        data = JSON.parse(resText);
      } catch {}

      if (res.ok && data?.ok) {
        const isMocked = Boolean(data.mocked);
        setMessages((prev) => {
          const next = (prev || []).map((m) =>
            m.id === tempId ? { ...m, status: isMocked ? "mocked" : "sent" } : m
          );
          const convCacheKey = `${activeConv.channel}_${activeConv.accountId || ""}_${activeConv.id}`;
          messageCacheRef.current.set(convCacheKey, next);
          return next;
        });
        if (isMocked) {
          setToast({
            type: "info",
            text: data.message || "Chế độ An toàn (Mock): Tin nhắn chỉ được mô phỏng, chưa gửi thật ra ngoài.",
          });
        }
        setConversations((prev) => {
          const list = prev || [];
          const idx = list.findIndex(
            (c) =>
              String(c.id) === String(activeConv.id) &&
              c.channel === activeConv.channel &&
              String(c.accountId || "") === String(activeConv.accountId || "")
          );
          if (idx === -1) {
            const updatedConv = {
              ...activeConv,
              isContactOnly: false,
              lastMessage: `Bạn: ${messageText || (primaryAtt?.isImage ? "[Hình ảnh]" : "[Tập tin]")}`,
              lastActive: "Vài giây",
              timestamp: Date.now(),
            };
            return [updatedConv, ...list];
          }
          const updatedConv = {
            ...list[idx],
            isContactOnly: false,
            lastMessage: `Bạn: ${messageText || (primaryAtt?.isImage ? "[Hình ảnh]" : "[Tập tin]")}`,
            lastActive: "Vài giây",
            timestamp: Date.now(),
          };
          const others = list.filter((_, i) => i !== idx);
          return [updatedConv, ...others];
        });
      } else {
        const errorMsg =
          data?.error ||
          data?.message ||
          (resText && resText.length < 160
            ? resText
            : `Lỗi gửi tin (${res.status}: ${res.statusText || "Máy chủ không phản hồi"})`);
        setToast({ type: "error", text: errorMsg });
        setMessages((prev) =>
          (prev || []).map((m) => (m.id === tempId ? { ...m, status: "error" } : m))
        );
      }
    } catch (netErr) {
      setToast({
        type: "error",
        text: `Lỗi kết nối khi gửi tin: ${netErr?.message || "Không thể kết nối máy chủ"}`,
      });
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
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "q") {
      e.preventDefault();
      setIsQuickRepliesOpen(true);
    }
  };

  // Vpage Handlers: Icon, Trả lời nhanh, Sản phẩm, Audio, File upload
  const handleSelectEmoji = (emoji) => {
    setInputMessage((prev) => (prev ? `${prev} ${emoji}` : emoji));
  };

  const handleSelectQuickReply = (text) => {
    setInputMessage((prev) => (prev ? `${prev}\n${text}` : text));
  };

  const handleSendQuickReplyDirect = (text) => {
    handleSendMessage(null, text);
  };

  const handleSelectProduct = (snippet) => {
    setInputMessage((prev) => (prev ? `${prev}\n\n${snippet}` : snippet));
  };

  const handleSendProductDirect = (snippet) => {
    handleSendMessage(null, snippet);
  };

  const handleFileSelected = async (files, isImage = true) => {
    for (const file of files) {
      const localPreview = isImage ? URL.createObjectURL(file) : null;
      const attId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const pendingAtt = {
        id: attId,
        file,
        name: file.name,
        size: file.size,
        isImage,
        previewUrl: localPreview,
        uploading: true,
      };

      setAttachedFiles((prev) => [...prev, pendingAtt]);

      // Upload file lên máy chủ
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch("/api/media/upload", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (data.ok) {
          setAttachedFiles((prev) =>
            prev.map((a) =>
              a.id === attId
                ? {
                    ...a,
                    uploading: false,
                    url: data.url,
                    filePath: data.filePath,
                  }
                : a
            )
          );
        } else {
          setToast({ type: "error", text: data.error || "Không thể tải file lên." });
          setAttachedFiles((prev) => prev.filter((a) => a.id !== attId));
        }
      } catch (err) {
        setToast({ type: "error", text: `Lỗi upload: ${err.message}` });
        setAttachedFiles((prev) => prev.filter((a) => a.id !== attId));
      }
    }
  };

  const handleRemoveAttachment = (index) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSendAudio = async (audioBlob, duration, localAudioUrl) => {
    if (!activeConv) return;
    const audioFile = new File([audioBlob], `voice_${Date.now()}.webm`, {
      type: audioBlob.type || "audio/webm",
    });

    const formData = new FormData();
    formData.append("file", audioFile);

    let uploadedData = null;
    try {
      const res = await fetch("/api/media/upload", {
        method: "POST",
        body: formData,
      });
      uploadedData = await res.json();
    } catch (upErr) {
      setToast({ type: "error", text: `Lỗi tải file ghi âm lên máy chủ: ${upErr?.message || "Mất kết nối"}` });
      return;
    }

    if (!uploadedData?.ok || !uploadedData?.filePath) {
      setToast({ type: "error", text: uploadedData?.error || "Không thể lưu file ghi âm trên máy chủ." });
      return;
    }

    const tempId = `temp_audio_${Date.now()}`;
    const nowTime = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

    const optimisticMsg = {
      id: tempId,
      text: "[Ghi âm giọng nói]",
      url: uploadedData?.url || localAudioUrl,
      type: "chat.voice",
      isMe: true,
      isAudio: true,
      senderName: activeConv.accountDisplayName || activeConv.accountName || "Chuyên viên ADDP",
      time: nowTime,
      date: "Hôm nay",
      status: "sending",
    };

    setMessages((prev) => [...(prev || []), optimisticMsg]);

    try {
      const res = await fetch("/api/channels/zalo/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: activeConv.id,
          recipientId: activeConv.recipientId || activeConv.id,
          recipientPhone: activeConv.phone || detectedChatPhone || "",
          pageId: activeConv.pageId || "",
          accountId: activeConv.accountId || "",
          homeDir: activeConv.zaloHome || "",
          type: activeConv.type || "DIRECT",
          message: "[Ghi âm giọng nói]",
          mediaUrl: uploadedData?.url || "",
          filePath: uploadedData?.filePath || "",
          isAudio: true,
          channel: activeConv.channel || "ZALO_PERSONAL",
          staffId: "STAFF",
          staffName: currentStaffName || "Chuyên viên ADDP",
          staffConfirmed: true,
        }),
      });

      const data = await res.json();
      if (res.ok && data?.ok) {
        setMessages((prev) =>
          (prev || []).map((m) => (m.id === tempId ? { ...m, status: "sent" } : m))
        );
      } else {
        setMessages((prev) =>
          (prev || []).map((m) => (m.id === tempId ? { ...m, status: "error" } : m))
        );
        setToast({ type: "error", text: data?.error || "Lỗi gửi ghi âm." });
      }
    } catch (err) {
      setMessages((prev) =>
        (prev || []).map((m) => (m.id === tempId ? { ...m, status: "error" } : m))
      );
      setToast({ type: "error", text: `Lỗi kết nối: ${err.message}` });
    }
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          handleFileSelected([file], true);
          e.preventDefault();
          break;
        }
      }
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

  // Danh sách tài khoản Zalo cá nhân (đồng bộ 100% theo trạng thái cấu hình từ /channels)
  const effectiveZaloAccounts = useMemo(() => {
    if (!Array.isArray(connectedZaloAccounts) || connectedZaloAccounts.length === 0) {
      return [];
    }
    return connectedZaloAccounts.filter(
      (a) => (a.totalCount || 0) > 0 || (a.activeCount || 0) > 0
    );
  }, [connectedZaloAccounts]);

  // Danh sách gian hàng TikTok Shop đang hoạt động (đọc từ channels.json qua API)
  const effectiveTikTokShops = useMemo(() => {
    const map = new Map();
    for (const s of connectedTikTokShops || []) {
      const key = String(s.shopId || s.id || "").trim();
      if (key && !map.has(key)) {
        map.set(key, s);
      }
    }
    for (const c of conversations || []) {
      if (c.channel === "TIKTOK_SHOP" || c.channel === "TIKTOK") {
        const key = String(c.shopId || c.accountId || "").trim();
        if (key && !map.has(key)) {
          map.set(key, {
            id: `tiktok_shop_${key}`,
            shopId: key,
            shortId: key.slice(-4),
            name: c.accountName || "TikTok Shop",
            displayName: c.accountName || "TikTok Shop",
          });
        }
      }
    }
    return Array.from(map.values());
  }, [connectedTikTokShops, conversations]);

  // Xử lý khi đổi lựa chọn trong Dropdown Gom Kênh ở Cột 1
  const handleAccountDropdownChange = (val) => {
    setSelectedAccountFilter(val);
    if (val === "ALL") {
      setChannelFilter("ALL");
      setSelectedZaloAccountId("ALL");
      setSelectedPageId("ALL");
      setSelectedTikTokShopId("ALL");
    } else if (val === "ZALO_ALL") {
      setChannelFilter("ZALO_PERSONAL");
      setSelectedZaloAccountId("ALL");
      setSelectedPageId("ALL");
      setSelectedTikTokShopId("ALL");
    } else if (val === "FB_ALL") {
      setChannelFilter("FACEBOOK");
      setSelectedPageId("ALL");
      setSelectedZaloAccountId("ALL");
      setSelectedTikTokShopId("ALL");
    } else if (val.startsWith("ZALO_ACCOUNT:")) {
      const accId = val.replace("ZALO_ACCOUNT:", "");
      setChannelFilter("ZALO_PERSONAL");
      setSelectedZaloAccountId(accId);
      setSelectedPageId("ALL");
      setSelectedTikTokShopId("ALL");
    } else if (val.startsWith("PAGE:")) {
      const pId = val.replace("PAGE:", "");
      setChannelFilter("FACEBOOK");
      setSelectedPageId(pId);
      setSelectedZaloAccountId("ALL");
      setSelectedTikTokShopId("ALL");
    } else if (val === "ZALO_OA") {
      setChannelFilter("ZALO_OA");
      setSelectedPageId("ALL");
      setSelectedZaloAccountId("ALL");
      setSelectedTikTokShopId("ALL");
    } else if (val === "TIKTOK_ALL") {
      setChannelFilter("TIKTOK_SHOP");
      setSelectedTikTokShopId("ALL");
      setSelectedPageId("ALL");
      setSelectedZaloAccountId("ALL");
    } else if (val.startsWith("TIKTOK_SHOP:")) {
      const shopId = val.replace("TIKTOK_SHOP:", "");
      setChannelFilter("TIKTOK_SHOP");
      setSelectedTikTokShopId(shopId);
      setSelectedPageId("ALL");
      setSelectedZaloAccountId("ALL");
    }
  };

  // Tự động nhận diện query params (?phone=...&zaloUid=...&name=...&customerId=...&staff=...&autoOpen=true) khi điều hướng từ trang Chăm sóc / Khách hàng
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const rawPhone = (params.get("phone") || "").trim();
    const rawZaloUid = (params.get("zaloUid") || "").trim();
    const rawName = (params.get("name") || "").trim();
    const rawCustomerId = (params.get("customerId") || "").trim();
    const rawStaff = (params.get("staff") || "").trim();
    const autoOpen = params.get("autoOpen") === "true";

    if (!rawPhone && !rawZaloUid && !rawStaff && !rawName) return;

    const stripVietnamese = (str) =>
      String(str || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .toLowerCase()
        .trim();

    const isAdminUser = currentUserRole === "ADMIN";
    const pool =
      (effectiveZaloAccounts && effectiveZaloAccounts.length > 0
        ? effectiveZaloAccounts
        : connectedZaloAccounts) || [];

    // Tìm tài khoản ưu tiên theo NV phụ trách (nếu có)
    let preferredAccId = null;
    let preferredAccName = "";
    if (rawStaff) {
      const targetStaffNorm = stripVietnamese(rawStaff);
      const matchedAcc = pool.find((acc) => {
        const candidates = [
          acc.name,
          acc.displayName,
          acc.accountName,
          acc.assignedStaff?.name,
          acc.accountId,
        ];
        return candidates.some((cand) => {
          const cNorm = stripVietnamese(cand);
          return cNorm && targetStaffNorm && (cNorm.includes(targetStaffNorm) || targetStaffNorm.includes(cNorm));
        });
      });
      if (matchedAcc?.accountId) {
        preferredAccId = String(matchedAcc.accountId);
        preferredAccName = matchedAcc.displayName || matchedAcc.name || matchedAcc.accountName || "";
        // Với nhân viên (non-Admin): khóa bộ lọc về đúng nick Zalo phụ trách; Admin giữ ALL để quét toàn bộ tài khoản
        if (!isAdminUser && !deepLinkStaffAppliedRef.current) {
          deepLinkStaffAppliedRef.current = true;
          handleAccountDropdownChange(`ZALO_ACCOUNT:${matchedAcc.accountId}`);
        }
      }
    }

    if (deepLinkAppliedRef.current) return;
    if (!rawPhone && !rawZaloUid && !rawName) return;

    const cleanPhone = normalizePhone(rawPhone);
    const targetNameNorm = rawName ? stripVietnamese(rawName) : "";

    const matchesLocalCustomer = (c) => {
      if (!c) return false;
      // 1. Nếu có số điện thoại từ URL/khách hàng: BẮT BUỘC CHỈ KHỚP THEO SỐ ĐIỆN THOẠI (10 số chuẩn VN).
      // TUYỆT ĐỐI không tìm theo tên khi có số điện thoại để tránh nhảy nhầm sang khách hàng khác!
      if (cleanPhone) {
        const phones = [
          c.phone,
          c.zaloPhone,
          c.customerPhone,
          c.recipientPhone,
          c.id,
          c.threadId,
        ];
        return phones.some((p) => p && normalizePhone(p) === cleanPhone);
      }
      // 2. Nếu không có số điện thoại nhưng có Zalo UID cụ thể
      if (rawZaloUid) {
        const cid = String(c.id || "").trim();
        const tid = String(c.threadId || "").trim();
        const cuid = String(c.zaloUid || "").trim();
        if (cid === rawZaloUid || tid === rawZaloUid || cuid === rawZaloUid) return true;
      }
      // 3. CHỈ KHI hoàn toàn KHÔNG CÓ SĐT và KHÔNG CÓ UID thì mới so sánh tên,
      // và BẮT BUỘC so sánh CHÍNH XÁC 100% (cName === targetNameNorm),
      // TUYỆT ĐỐI không dùng .includes() để không nhầm "Hoàng Hải Luyến" sang "Hoàng Hải"!
      if (targetNameNorm) {
        const cName = stripVietnamese(c.name || c.displayName || c.customerName || "");
        if (cName && cName === targetNameNorm) {
          return true;
        }
      }
      return false;
    };

    // Lấy pool hội thoại từ state HOẶC từ sessionStorage cache để so khớp ngay lập tức 0ms
    let currentConvPool = conversations || [];
    if (currentConvPool.length === 0 && typeof window !== "undefined") {
      try {
        const cached = sessionStorage.getItem("addp_inbox_conversations");
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) currentConvPool = parsed;
        }
      } catch {}
    }

    const targetAccCheck =
      preferredAccId || (selectedZaloAccountId !== "ALL" ? String(selectedZaloAccountId) : null);

    // Nếu là Admin: tìm trong nick ưu tiên trước, không thấy thì tìm trên TẤT CẢ các nick Zalo + kênh khác
    const scopedPool = isAdminUser
      ? currentConvPool
      : targetAccCheck
      ? currentConvPool.filter(
          (c) => c.channel !== "ZALO_PERSONAL" || String(c.accountId || "") === targetAccCheck
        )
      : currentConvPool;

    // Nếu có activeConv từ trước hoặc tìm thấy trên tài khoản khác, ưu tiên nick thực tế đang có lịch sử
    const matchedConv =
      (preferredAccId &&
        scopedPool.find(
          (c) => String(c.accountId || "") === preferredAccId && matchesLocalCustomer(c)
        )) ||
      (targetAccCheck &&
        scopedPool.find(
          (c) => String(c.accountId || "") === targetAccCheck && matchesLocalCustomer(c)
        )) ||
      scopedPool.find((c) => matchesLocalCustomer(c));

    // 1. NẾU ĐÃ CÓ TRONG CONVERSATIONS (0ms Instant Navigation):
    // Mở ngay lập tức mà KHÔNG gọi API find-customer từ xa!
    if (matchedConv) {
      deepLinkAppliedRef.current = true;
      if (matchedConv.isContactOnly) {
        setShowContactsSection(true);
      }
      if (
        matchedConv.channel === "ZALO_PERSONAL" &&
        matchedConv.accountId &&
        selectedAccountFilter !== "ALL" &&
        String(selectedZaloAccountId) !== String(matchedConv.accountId)
      ) {
        handleAccountDropdownChange(`ZALO_ACCOUNT:${matchedConv.accountId}`);
      } else if (matchedConv.channel !== "ZALO_PERSONAL" && channelFilter === "ZALO_PERSONAL") {
        handleAccountDropdownChange("ALL");
      }

      setActiveConv(matchedConv);
      setToast({
        type: "success",
        text: `💬 Đã mở hội thoại Zalo: ${matchedConv.name || rawName || cleanPhone}${matchedConv.accountName ? ` (${matchedConv.accountName})` : ""}`,
      });
      setTimeout(() => setToast(null), 4000);
      return;
    }

    // 2. NẾU CHƯA CÓ TRONG CONVERSATIONS:
    // Thay vì chờ API quét mạng Zalo làm đơ màn hình, MỞ NGAY HỘP THOẠI CHĂM SÓC TẠM (Temporary Direct Chat Header) 0ms!
    const targetAccount =
      (preferredAccId && pool.find((acc) => String(acc.accountId) === String(preferredAccId))) ||
      (targetAccCheck && pool.find((acc) => String(acc.accountId) === String(targetAccCheck))) ||
      pool[0] ||
      null;

    const fallbackAccId = targetAccount?.accountId ? String(targetAccount.accountId) : (preferredAccId || "");
    const fallbackAccName =
      targetAccount?.displayName ||
      targetAccount?.name ||
      targetAccount?.accountName ||
      preferredAccName ||
      "Zalo Cá Nhân";

    const tempConv = {
      id: cleanPhone || rawZaloUid || `temp_${Date.now()}`,
      threadId: cleanPhone || rawZaloUid || `temp_${Date.now()}`,
      name: rawName || (cleanPhone ? `Khách hàng ${cleanPhone}` : "Khách hàng"),
      phone: cleanPhone || "",
      zaloPhone: cleanPhone || "",
      customerPhone: cleanPhone || "",
      recipientPhone: cleanPhone || "",
      channel: "ZALO_PERSONAL",
      accountId: fallbackAccId,
      accountName: fallbackAccName,
      accountDisplayName: fallbackAccName,
      type: "DIRECT",
      isDirectCareTemp: true,
      isTemp: true,
      isContactOnly: false,
      lastMessage: `Chăm sóc trực tiếp (SĐT: ${cleanPhone || "N/A"})`,
      lastActive: "Vừa xong",
      timestamp: Date.now(),
      customerId: rawCustomerId || "",
      staffName: rawStaff || targetAccount?.assignedStaff?.name || "",
      tags: [],
    };

    deepLinkAppliedRef.current = true;
    setActiveConv(tempConv);
    setConversations((prev) => {
      const list = prev || [];
      const exists = list.some((c) => matchesLocalCustomer(c) || String(c.id) === String(tempConv.id));
      if (exists) return list;
      return [tempConv, ...list];
    });

    setToast({
      type: "success",
      text: `⚡ Đã mở hộp thoại chăm sóc tức thì cho ${rawName || cleanPhone}`,
    });
    setTimeout(() => setToast(null), 4000);

    // Chạy ngầm (Non-blocking background search) tìm thông tin UID thực tế trên Zalo:
    // Nhân viên không bị chặn, có thể gõ và gửi tin nhắn hoặc gọi điện ngay lập tức!
    if (!deepLinkLookupInFlightRef.current && (cleanPhone || rawPhone || rawZaloUid)) {
      deepLinkLookupInFlightRef.current = true;
      (async () => {
        try {
          const qs = new URLSearchParams();
          if (cleanPhone || rawPhone) qs.set("phone", cleanPhone || rawPhone);
          if (rawZaloUid) qs.set("zaloUid", rawZaloUid);
          if (rawName) qs.set("name", rawName);
          if (rawCustomerId) qs.set("customerId", rawCustomerId);
          if (rawStaff) qs.set("staff", rawStaff);
          if (fallbackAccId) qs.set("accountId", fallbackAccId);

          const res = await fetch(`/api/channels/zalo/find-customer?${qs.toString()}`);
          const data = await res.json().catch(() => null);

          if (data?.ok && data?.found && data?.conversation) {
            const foundConv = data.conversation;
            setActiveConv((curr) => {
              if (curr && (curr.id === tempConv.id || curr.phone === tempConv.phone)) {
                return {
                  ...curr,
                  ...foundConv,
                  isDirectCareTemp: false,
                  phone: cleanPhone || foundConv.phone || curr.phone,
                };
              }
              return curr;
            });
            setConversations((prev) => {
              const list = (prev || []).filter((c) => c.id !== tempConv.id);
              const exists = list.some(
                (c) =>
                  String(c.id) === String(foundConv.id) &&
                  c.channel === foundConv.channel &&
                  String(c.accountId || "") === String(foundConv.accountId || "")
              );
              if (exists) return list;
              return [foundConv, ...list];
            });
          }
        } catch {
          // Bắt ngoại lệ trong nền, không làm phiền nhân viên
        } finally {
          deepLinkLookupInFlightRef.current = false;
        }
      })();
    }
  }, [
    conversations,
    effectiveZaloAccounts,
    connectedZaloAccounts,
    loadingConv,
    selectedZaloAccountId,
    selectedAccountFilter,
    channelFilter,
    currentUserRole,
  ]);

  // Helper lấy thông tin hiển thị cho nút Popover Gom Kênh
  const getSelectedFilterInfo = () => {
    if (selectedAccountFilter === "ALL") {
      return {
        icon: "🌐",
        label: "Tất cả kênh",
        count: (conversations || []).length,
      };
    }
    if (selectedAccountFilter === "ZALO_ALL") {
      const zaloCount = (conversations || []).filter((c) => c.channel === "ZALO_PERSONAL").length;
      return {
        icon: "💬",
        label: "Tất cả Zalo QR",
        count: zaloCount,
      };
    }
    if (selectedAccountFilter === "FB_ALL") {
      const fbCount = (conversations || []).filter((c) => c.channel === "FACEBOOK").length;
      return {
        icon: "📘",
        label: "Tất cả Fanpage",
        count: fbCount,
      };
    }
    if (selectedAccountFilter.startsWith("ZALO_ACCOUNT:")) {
      const accId = selectedAccountFilter.replace("ZALO_ACCOUNT:", "");
      const matched = effectiveZaloAccounts.find((a) => String(a.accountId) === String(accId));
      return {
        icon: "💬",
        label: matched ? `Zalo: ${matched.name}` : "Zalo Cá Nhân",
        count: matched?.totalCount || 0,
      };
    }
    if (selectedAccountFilter.startsWith("PAGE:")) {
      const pId = selectedAccountFilter.replace("PAGE:", "");
      const matched = effectivePages.find((p) => String(p.pageId) === String(pId));
      const fbCount = (conversations || []).filter(
        (c) => c.channel === "FACEBOOK" && String(c.pageId) === String(pId)
      ).length;
      return {
        icon: "📘",
        label: matched ? (matched.shortId ? `${matched.name} (#${matched.shortId})` : matched.name) : "Fanpage FB",
        count: fbCount,
      };
    }
    if (selectedAccountFilter === "ZALO_OA") {
      const oaCount = (conversations || []).filter((c) => c.channel === "ZALO_OA").length;
      return {
        icon: "📱",
        label: "Zalo OA Official",
        count: oaCount,
      };
    }
    if (selectedAccountFilter === "TIKTOK_ALL") {
      const ttCount = (conversations || []).filter(
        (c) => c.channel === "TIKTOK_SHOP" || c.channel === "TIKTOK"
      ).length;
      return {
        icon: "🎵",
        label: "Tất cả TikTok Shop",
        count: ttCount,
      };
    }
    if (selectedAccountFilter.startsWith("TIKTOK_SHOP:")) {
      const shopId = selectedAccountFilter.replace("TIKTOK_SHOP:", "");
      const matched = effectiveTikTokShops.find(
        (s) => String(s.shopId || s.id) === String(shopId)
      );
      const ttCount = (conversations || []).filter(
        (c) =>
          (c.channel === "TIKTOK_SHOP" || c.channel === "TIKTOK") &&
          String(c.shopId || c.accountId || c.pageId || "") === String(shopId)
      ).length;
      return {
        icon: "🎵",
        label: matched ? matched.displayName || matched.name : "TikTok Shop",
        count: ttCount,
      };
    }
    return {
      icon: "🌐",
      label: "Tất cả kênh",
      count: (conversations || []).length,
    };
  };

  // Đồng bộ toàn bộ lịch sử tin nhắn cũ từ Zalo Cá Nhân & Fanpage Facebook
  const handleSyncFullHistory = async () => {
    try {
      setIsSyncingHistory(true);
      setToast({
        type: "info",
        text: "Đang đồng bộ lịch sử tin nhắn Zalo & Facebook...",
      });
      const [fbRes, zaloRes] = await Promise.all([
        fetch("/api/facebook/sync-history", { method: "POST" }).catch(() => null),
        fetch("/api/zalo/sync-history", { method: "POST" }).catch(() => null),
        loadConversations(false, true),
      ]);
      const fbData = fbRes ? await fbRes.json().catch(() => null) : null;
      const zaloData = zaloRes ? await zaloRes.json().catch(() => null) : null;
      const fbCount = fbData?.syncedMessages || 0;
      const zaloCount = zaloData?.totalMessagesSynced || 0;
      const totalNew = fbCount + zaloCount;

      setToast({
        type: "success",
        text:
          totalNew > 0
            ? `Đồng bộ thành công! Đã nạp ${totalNew} tin nhắn (Zalo: ${zaloCount}, FB: ${fbCount}).`
            : "Đã hoàn tất đồng bộ toàn bộ lịch sử tin nhắn Zalo & Facebook!",
      });

      // Tự động làm mới khung chat hội thoại đang chọn
      setRefreshMsgCount((c) => c + 1);
      setTimeout(() => setToast(null), 4000);
    } catch (err) {
      console.error("Lỗi sync history:", err);
      setToast({ type: "error", text: "Đồng bộ thất bại, vui lòng thử lại sau." });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setIsSyncingHistory(false);
    }
  };

  // Đồng bộ hội thoại & lịch sử tin nhắn từ TikTok Shop Open API
  const handleSyncTikTokMessages = async () => {
    if (isSyncingTikTok) return;
    try {
      setIsSyncingTikTok(true);
      setToast({
        type: "info",
        text: "Đang đồng bộ tin nhắn TikTok Shop...",
      });

      const res = await fetch("/api/channels/tiktok/sync-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId: selectedTikTokShopId !== "ALL" ? selectedTikTokShopId : "",
        }),
      });
      const data = await res.json().catch(() => ({}));

      await loadConversations(false, true);
      setRefreshMsgCount((c) => c + 1);

      if (res.ok && data?.ok) {
        const convCount = data.syncedConversations ?? data.syncedCount ?? 0;
        const msgCount = data.syncedMessages ?? 0;
        setToast({
          type: "success",
          text:
            convCount > 0 || msgCount > 0
              ? `Đồng bộ TikTok Shop thành công! Đã nạp ${convCount} hội thoại (${msgCount} tin nhắn).`
              : "Đã đồng bộ TikTok Shop. Hiện chưa có hội thoại mới từ người mua.",
        });
        setTimeout(() => setToast(null), 6500);
      } else {
        const rawCode =
          data?.rawCode ??
          data?.errorCode ??
          data?.shopResults?.[0]?.rawCode ??
          data?.shopResults?.[0]?.code ??
          (res.ok ? "UNKNOWN" : `HTTP_${res.status}`);
        const rawMessage =
          data?.rawMessage ||
          data?.shopResults?.[0]?.rawMessage ||
          data?.message ||
          "Chưa thể đồng bộ tin nhắn từ TikTok Shop Open API.";
        const endpoint = data?.endpoint || data?.shopResults?.[0]?.endpoint || "";

        let errorText = `Lỗi TikTok [Code: ${rawCode}]: ${rawMessage}`;
        if (Number(rawCode) === 105005) {
          errorText +=
            " — Quyền Customer Service (Chat) chưa được duyệt trên Partner Center hoặc Shop chưa bấm ủy quyền lại.";
        }
        if (endpoint) {
          errorText += ` (${endpoint})`;
        }

        const canRefresh = Boolean(data?.needsTokenRefresh || Number(rawCode) === 105005);
        setToast({
          type: canRefresh ? "warning" : "error",
          text: errorText,
          ...(canRefresh
            ? { actionHref: "/channels", actionLabel: "Làm mới Token" }
            : {}),
        });
        setTimeout(() => setToast(null), 12000);
      }
    } catch (err) {
      console.error("Lỗi sync TikTok messages:", err);
      setToast({
        type: "error",
        text: "Lỗi kết nối khi đồng bộ tin nhắn TikTok Shop.",
      });
      setTimeout(() => setToast(null), 4000);
    } finally {
      setIsSyncingTikTok(false);
    }
  };

  // Kích hoạt cuộc gọi thoại (tel: protocol & copy SĐT)
  const handleVoiceCall = () => {
    const rawPhone = activeConv?.phone || matchedCustomer?.phone || detectedChatPhone || "";
    const cleanPhone = normalizePhone(rawPhone);
    if (cleanPhone && isValidVietnamPhone(cleanPhone)) {
      try {
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          navigator.clipboard.writeText(cleanPhone);
        }
      } catch {}
      setToast({
        type: "success",
        text: `Đang kết nối cuộc gọi tới ${cleanPhone} (Đã sao chép SĐT)...`,
      });
      setTimeout(() => setToast(null), 4000);
      window.location.href = `tel:${cleanPhone}`;
    } else {
      setToast({
        type: "error",
        text: "Khách hàng chưa để lại SĐT. Hãy xin số điện thoại trước khi gọi!",
      });
      setTimeout(() => setToast(null), 3500);
    }
  };

  // Kích hoạt cuộc gọi Video (Tạo link phòng họp tư vấn trực tuyến Jitsi)
  const handleVideoCall = () => {
    const roomName = `ADDP_TuVan_${String(activeConv?.id || "khach").replace(/[^a-zA-Z0-9]/g, "")}`;
    const meetUrl = `https://meet.jit.si/${roomName}`;

    if (typeof window !== "undefined") {
      window.open(meetUrl, "_blank", "width=900,height=600");
    }

    setInputMessage((prev) => {
      const inviteText = `Dạ em gửi đường link phòng gọi video tư vấn trực tiếp cùng Dược sĩ ADDP: ${meetUrl} . Anh/Chị bấm vào link để tham gia nhé ạ!`;
      return prev ? `${prev}\n${inviteText}` : inviteText;
    });

    setToast({
      type: "success",
      text: "Đã mở phòng gọi Video & gửi lời mời tư vấn vào ô soạn tin!",
    });
    setTimeout(() => setToast(null), 4000);
  };

  // Helper đảm bảo Avatar luôn đi qua proxy trung gian (không bao giờ vỡ ảnh)
  const getSafeAvatarUrl = (conv) => {
    if (!conv) return "/api/media/avatar-proxy?name=KhachHang";
    if (conv.avatar && typeof conv.avatar === "string" && conv.avatar.startsWith("/api/media/avatar-proxy")) {
      return conv.avatar;
    }
    const type =
      conv.channel === "FACEBOOK"
        ? "fb"
        : conv.type === "GROUP"
        ? "group"
        : "zalo";
    const safeName = encodeURIComponent(String(conv.name || "").trim() || "Khách Hàng");
    const safeId = encodeURIComponent(String(conv.id || ""));
    const pageId = conv.pageId ? encodeURIComponent(String(conv.pageId)) : "";
    if (conv.avatar && typeof conv.avatar === "string" && conv.avatar.trim()) {
      return `/api/media/avatar-proxy?url=${encodeURIComponent(conv.avatar.trim())}&type=${type}&id=${safeId}&pageId=${pageId}&name=${safeName}`;
    }
    return `/api/media/avatar-proxy?type=${type}&id=${safeId}&pageId=${pageId}&name=${safeName}`;
  };

  const handleAvatarImgError = (e, name = "Khách Hàng") => {
    e.currentTarget.onerror = null;
    e.currentTarget.src = `/api/media/avatar-proxy?name=${encodeURIComponent(name || "Khách")}&type=fallback`;
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
        if (
          channelFilter === "TIKTOK_SHOP" &&
          c.channel !== "TIKTOK_SHOP" &&
          c.channel !== "TIKTOK"
        ) {
          return false;
        }
      }

      if (selectedZaloAccountId !== "ALL") {
        if (c.channel !== "ZALO_PERSONAL" || String(c.accountId) !== String(selectedZaloAccountId)) {
          return false;
        }
      }

      if (selectedPageId !== "ALL") {
        if (c.channel !== "FACEBOOK" || String(c.pageId) !== String(selectedPageId)) return false;
      }

      if (selectedTikTokShopId !== "ALL") {
        const convShopId = String(c.shopId || c.accountId || c.pageId || "");
        if (
          (c.channel !== "TIKTOK_SHOP" && c.channel !== "TIKTOK") ||
          convShopId !== String(selectedTikTokShopId)
        ) {
          return false;
        }
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

      // Lọc theo Thẻ Tag Khách Hàng
      if (selectedTagFilter !== "ALL") {
        const convTags = Array.isArray(c.tags) ? c.tags : [];
        if (!convTags.includes(selectedTagFilter)) return false;
      }

      return true;
    });
  }, [
    conversations,
    searchQuery,
    channelFilter,
    selectedZaloAccountId,
    selectedPageId,
    selectedTikTokShopId,
    activeTab,
    selectedTagFilter,
    isConversationAccountHuman,
  ]);

  const activeChatList = (filteredConversations || []).filter((c) => !c.isContactOnly);
  const contactOnlyList = (filteredConversations || []).filter((c) => c.isContactOnly);

  const displayedActiveChats = useMemo(() => {
    const list = [...activeChatList];
    list.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      const tsA = Number(a.updatedAt || a.timestamp || 0);
      const tsB = Number(b.updatedAt || b.timestamp || 0);
      return tsB - tsA;
    });
    return list;
  }, [channelFilter, activeChatList]);

  // Reset số lượng hiển thị khi đổi bộ lọc
  useEffect(() => {
    setVisibleCount(40);
  }, [
    channelFilter,
    searchQuery,
    activeTab,
    selectedAccountFilter,
    selectedTagFilter,
    selectedZaloAccountId,
    selectedPageId,
    selectedTikTokShopId,
  ]);

  // Virtualization / Chunk rendering: Chỉ render visibleCount items đầu tiên để Main Thread luôn mượt mà 60fps
  const visibleActiveChats = useMemo(() => {
    return displayedActiveChats.slice(0, visibleCount);
  }, [displayedActiveChats, visibleCount]);

  const handleScrollConversationList = useCallback(
    (e) => {
      const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
      if (scrollHeight - scrollTop - clientHeight < 320) {
        setVisibleCount((prev) => Math.min(prev + 40, displayedActiveChats.length));
      }
    },
    [displayedActiveChats.length]
  );

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
    const unreadCount = Number(conv.unreadCount || conv.unread || 0);
    const isUnread = unreadCount > 0 && !isSelected;
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
        : conv.channel === "TIKTOK_SHOP" || conv.channel === "TIKTOK"
        ? conv.accountName || conv.channelLabel || "TikTok Shop"
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
          const isAi = conv.botMode === "AI" || (!isConversationAccountHuman(conv) && conv.botMode !== "HUMAN");
          setConvBotMode(isAi ? "AI" : "HUMAN");
          setIsAccountLevelHuman(!isAi && isConversationAccountHuman(conv));
          setAiMode(isAi ? "AUTO_REPLY" : "HUMAN_ONLY");
          setActiveConv(conv);

          // Đánh dấu đã đọc ngay lập tức trên UI (xóa badge đỏ)
          setConversations((prev) =>
            (prev || []).map((c) =>
              String(c.id) === String(conv.id) && c.channel === conv.channel
                ? { ...c, unreadCount: 0, unread: 0 }
                : c
            )
          );
          // Ghi nhận trạng thái đã đọc vào backend & local
          markAsRead(conv.id);
        }}
        className={`w-full text-left px-3 py-2.5 transition-colors flex items-start gap-2.5 cursor-pointer ${
          isSelected
            ? "bg-blue-50/90 dark:bg-slate-800/95 border-l-4 border-blue-500"
            : isUnread
            ? "bg-sky-50/60 dark:bg-slate-800/70 hover:bg-sky-100/70 dark:hover:bg-slate-800/90 border-l-3 border-rose-500"
            : "hover:bg-slate-100 dark:hover:bg-slate-800/40"
        }`}
      >
        {/* Avatar thật 100% qua Proxy trung gian vượt CORS / chống chặn hotlink */}
        <div className="relative flex-shrink-0 mt-0.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={getSafeAvatarUrl(conv)}
            alt={conv.name}
            onError={(e) => handleAvatarImgError(e, conv.name)}
            className={`h-10 w-10 rounded-full object-cover border ${
              isUnread ? "border-blue-500 ring-2 ring-blue-500/20" : "border-slate-300 dark:border-slate-700"
            } bg-slate-800`}
          />

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
          {/* Dòng 1: Tên + Ghim + Nhóm + Thời gian */}
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <div className="flex items-center gap-1 min-w-0">
              {conv.isPinned && (
                <Pin
                  className="w-3.5 h-3.5 text-amber-400 shrink-0 rotate-45"
                  title="Hội thoại đã ghim"
                />
              )}
              {conv.type === "GROUP" && (
                <span className="rounded bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 text-[9px] font-bold px-1 py-0.2 flex-shrink-0 inline-flex items-center gap-0.5">
                  <Users className="w-2.5 h-2.5" />
                  <span>{conv.memberCount > 0 ? conv.memberCount : "Nhóm"}</span>
                </span>
              )}
              <span
                className={`truncate ${
                  isUnread
                    ? "font-bold text-[13px] text-slate-900 dark:text-white"
                    : "font-semibold text-xs text-slate-800 dark:text-slate-200"
                }`}
              >
                {conv.name}
              </span>
            </div>
            <span
              className={`text-[10px] flex-shrink-0 tabular-nums ${
                isUnread
                  ? "font-bold text-blue-600 dark:text-blue-400"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              {conv.lastActive || "Gần đây"}
            </span>
          </div>

          {/* Dòng 2: Nội dung tin nhắn xem trước + HUY HIỆU ĐỎ CHƯA ĐỌC CHUẨN ZALO THẬT */}
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <p
              className={`truncate flex-1 min-w-0 ${
                isUnread
                  ? "font-semibold text-[11.5px] text-slate-900 dark:text-slate-100"
                  : "text-[11px] text-slate-500 dark:text-slate-400"
              }`}
            >
              {formatSnippetForDisplay(conv.lastMessage)}
            </p>

            {isUnread && (
              <span
                className={`shrink-0 flex items-center justify-center font-bold text-white shadow-sm ${
                  unreadCount > 5 && conv.type === "GROUP"
                    ? "h-4 min-w-[18px] px-1 rounded-full bg-slate-500 text-[10px]"
                    : "h-5 min-w-[20px] px-1.5 rounded-full bg-[#E11D48] text-[11px] badge-solid-white animate-pulse"
                }`}
                title={`${unreadCount} tin nhắn chưa đọc`}
              >
                {unreadCount > 99 ? "99+" : unreadCount > 5 && conv.type === "GROUP" ? "5+" : unreadCount}
              </span>
            )}
          </div>

          {/* Dòng 3: Hàng nhãn phân biệt thực chiến: SĐT + Quá SLA + Nguồn + Tags */}
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
            {/* Hiển thị gọn tối đa 1 thẻ tag + đếm nếu nhiều */}
            {Array.isArray(conv.tags) && conv.tags.length > 0 && (
              <>
                <span
                  key={conv.tags[0]}
                  className="inline-flex items-center rounded px-1.5 py-0.2 text-[9px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 truncate max-w-[74px]"
                  title={`Thẻ tag: ${conv.tags.join(", ")}`}
                >
                  {conv.tags[0]}
                </span>
                {conv.tags.length > 1 && (
                  <span
                    className="inline-flex items-center rounded px-1 py-0.2 text-[9px] font-bold bg-slate-800 text-slate-300 border border-slate-700 shrink-0"
                    title={conv.tags.slice(1).join(", ")}
                  >
                    +{conv.tags.length - 1}
                  </span>
                )}
              </>
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
          className={`fixed top-4 right-4 z-50 rounded-xl border px-4 py-2.5 text-xs backdrop-blur-md shadow-xl flex items-center gap-2.5 max-w-md ${
            toast.type === "success"
              ? "border-emerald-500/40 bg-emerald-950/90 text-emerald-200"
              : toast.type === "warning"
              ? "border-amber-500/50 bg-amber-950/95 text-amber-100"
              : "border-rose-500/40 bg-rose-950/90 text-rose-200"
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span className="leading-relaxed">{toast.text}</span>
          {toast.actionHref && toast.actionLabel && (
            <Link
              href={toast.actionHref}
              onClick={() => setToast(null)}
              className="shrink-0 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 px-2.5 py-1 text-[11px] font-bold transition-colors"
            >
              {toast.actionLabel}
            </Link>
          )}
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Đóng thông báo"
            className="ml-1 p-0.5 rounded hover:bg-white/10 cursor-pointer shrink-0"
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
            {/* Hàng 1: Tiêu đề Hộp Thư Đa Kênh + Cụm nút công cụ */}
            <div className="flex items-center justify-between gap-2 pb-0.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-xs shrink-0 badge-solid-white shadow-xs">
                  Z
                </span>
                <h2 className="text-sm font-bold text-white tracking-tight truncate">
                  Hộp Thư Đa Kênh
                </h2>
              </div>

              {/* Cụm nút công cụ tác nghiệp */}
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Nút Gửi Tin Nhắn Hàng Loạt */}
                <button
                  type="button"
                  onClick={() => setIsBulkModalOpen(true)}
                  title="Gửi tin nhắn hàng loạt (Broadcast) có Anti-Ban"
                  className="rounded-lg border border-blue-500/40 bg-blue-600/20 px-2 py-1 text-blue-300 hover:text-white hover:bg-blue-600 transition-colors cursor-pointer inline-flex items-center gap-1 text-[11px] font-bold"
                >
                  <Send className="w-3 h-3" />
                  <span className="hidden sm:inline">Gửi Loạt</span>
                </button>

                {(effectiveTikTokShops.length > 0 || channelFilter === "TIKTOK_SHOP") && (
                  <button
                    type="button"
                    onClick={handleSyncTikTokMessages}
                    disabled={isSyncingTikTok}
                    aria-label="Đồng bộ tin nhắn TikTok Shop"
                    title="Kéo hội thoại và tin nhắn từ TikTok Shop Open API về CRM"
                    className="rounded-lg border border-pink-500/40 bg-pink-600/15 px-2 py-1 text-pink-600 dark:text-pink-300 hover:bg-pink-600 hover:text-white transition-colors cursor-pointer inline-flex items-center gap-1 text-[11px] font-bold disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isSyncingTikTok ? "animate-spin" : ""}`} />
                    <span className="hidden sm:inline">
                      {isSyncingTikTok ? "Đang kéo..." : "Đồng bộ TikTok"}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSyncFullHistory}
                  disabled={isSyncingHistory}
                  aria-label="Đồng bộ lịch sử tin nhắn"
                  title="Đồng bộ toàn bộ lịch sử tin nhắn cũ từ Zalo & Facebook"
                  className="rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                >
                  <DownloadCloud
                    className={`w-3.5 h-3.5 ${isSyncingHistory ? "animate-bounce text-blue-400" : ""}`}
                  />
                </button>

                <button
                  type="button"
                  onClick={() => loadConversations(false, true)}
                  aria-label="Làm mới danh sách hội thoại"
                  title="Làm mới danh sách hội thoại"
                  className="rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-blue-400" : ""}`} />
                </button>

                <button
                  type="button"
                  onClick={toggleSoundMute}
                  aria-label={isSoundMuted ? "Bật chuông thông báo" : "Tắt chuông thông báo"}
                  title={isSoundMuted ? "Chuông thông báo: ĐÃ TẮT (Bấm để BẬT)" : "Chuông thông báo: ĐANG BẬT (Bấm để thử chuông / tắt)"}
                  className={`rounded-lg border p-1.5 transition-colors cursor-pointer ${
                    isSoundMuted
                      ? "border-rose-700/60 bg-rose-950/40 text-rose-400 hover:text-rose-300"
                      : "border-slate-700 bg-slate-800 text-amber-400 hover:text-amber-300 hover:bg-slate-700"
                  }`}
                >
                  {isSoundMuted ? (
                    <BellOff className="w-3.5 h-3.5" />
                  ) : (
                    <Bell className="w-3.5 h-3.5" />
                  )}
                </button>

                <Link
                  href="/settings/tags"
                  aria-label="Quản lý thẻ tag"
                  title="Quản lý danh mục thẻ tag"
                  className="rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-300 hover:text-white transition-colors"
                >
                  <Tag className="w-3.5 h-3.5 text-amber-400" />
                </Link>

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

            {/* Hàng 2: Nút chọn kênh chuẩn chỉnh Full-Width độ tương phản cao (Sáng & Tối) */}
            <div className="relative w-full" ref={channelPopoverRef}>
              <button
                type="button"
                onClick={() => setChannelPopoverOpen(!channelPopoverOpen)}
                aria-label="Lọc theo kênh hoặc tài khoản"
                title="Nhấn để chọn kênh và tài khoản lọc tin nhắn"
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13px] font-semibold shadow-sm border transition-all cursor-pointer ${
                  selectedAccountFilter === "ALL"
                    ? "bg-blue-600 hover:bg-blue-700 text-white border-blue-500 badge-solid-white shadow-blue-600/20"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white dark:border-slate-600"
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <span className="text-base leading-none shrink-0">{getSelectedFilterInfo().icon}</span>
                  <span className="truncate">{getSelectedFilterInfo().label}</span>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full font-bold tabular-nums shrink-0 ${
                      selectedAccountFilter === "ALL"
                        ? "bg-white/25 text-white badge-solid-white"
                        : "bg-blue-600 text-white badge-solid-white"
                    }`}
                  >
                    {getSelectedFilterInfo().count}
                  </span>
                </span>
                <ChevronDown
                  className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
                    selectedAccountFilter === "ALL"
                      ? "text-white/90"
                      : "text-slate-600 dark:text-slate-300"
                  } ${channelPopoverOpen ? "rotate-180" : ""}`}
                />
              </button>

              {/* Popover Menu Thả Xuống Full-Width Tự Đóng Khi Chọn */}
              {channelPopoverOpen && (
                <div className="absolute left-0 right-0 top-full mt-2 w-full rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 z-50 max-h-[28rem] overflow-y-auto space-y-2 text-xs animate-in fade-in zoom-in-95 duration-100">
                  {/* Nhóm 1: Tất cả kênh hợp nhất */}
                  <div>
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Kênh Hợp Nhất
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        handleAccountDropdownChange("ALL");
                        setChannelPopoverOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left cursor-pointer border transition-colors text-[13px] ${
                        selectedAccountFilter === "ALL"
                          ? "bg-blue-600 text-white font-semibold border-blue-500 shadow-sm badge-solid-white"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-300 font-medium dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:border-slate-700"
                      }`}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <Globe
                          className={`w-4 h-4 shrink-0 ${
                            selectedAccountFilter === "ALL" ? "text-white" : "text-blue-600 dark:text-blue-400"
                          }`}
                        />
                        <span className="truncate">Tất cả kênh (Hợp nhất)</span>
                      </span>
                      <span
                        className={`text-[11px] tabular-nums font-bold px-2 py-0.5 rounded-full ${
                          selectedAccountFilter === "ALL"
                            ? "bg-white/25 text-white badge-solid-white"
                            : "bg-white text-slate-700 border border-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600"
                        }`}
                      >
                        {conversations.length}
                      </span>
                    </button>
                  </div>

                  {/* Nhóm 2: Zalo Cá Nhân Multi-QR — CHỈ HIỂN THỊ KHI CÒN ÍT NHẤT 1 NICK ACTIVE TRONG /channels */}
                  {effectiveZaloAccounts && effectiveZaloAccounts.length > 0 && (
                    <div className="border-t border-slate-800 pt-1.5">
                      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-400 flex items-center justify-between">
                        <span>Zalo Cá Nhân (Multi-QR)</span>
                        <span className="text-[10px] text-slate-500 font-normal">
                          {effectiveZaloAccounts.length} nick
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            handleAccountDropdownChange("ZALO_ALL");
                            setChannelPopoverOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left cursor-pointer transition-colors ${
                            selectedAccountFilter === "ZALO_ALL"
                              ? "bg-cyan-600 text-white font-bold"
                              : "text-slate-200 hover:bg-slate-800"
                          }`}
                        >
                          <span className="flex items-center gap-2 truncate">
                            <MessageSquare className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                            <span className="truncate">Tất cả Zalo ({pillCounts.all})</span>
                          </span>
                          {selectedAccountFilter === "ZALO_ALL" && <Check className="w-3.5 h-3.5 shrink-0" />}
                        </button>

                        {effectiveZaloAccounts.map((acc) => (
                          <button
                            key={acc.accountId}
                            type="button"
                            onClick={() => {
                              handleAccountDropdownChange(`ZALO_ACCOUNT:${acc.accountId}`);
                              setChannelPopoverOpen(false);
                            }}
                            className={`w-full flex items-center justify-between pl-6 pr-2.5 py-1.5 rounded-lg text-left cursor-pointer transition-colors text-[11px] ${
                              selectedAccountFilter === `ZALO_ACCOUNT:${acc.accountId}`
                                ? "bg-teal-600 text-white font-bold"
                                : "text-slate-300 hover:bg-slate-800"
                            }`}
                          >
                            <span className="flex items-center gap-2 truncate">
                              <span className="h-2 w-2 rounded-full bg-cyan-400 shrink-0" />
                              <span className="truncate">Zalo: {acc.name}</span>
                            </span>
                            <span className="text-[10px] tabular-nums font-semibold px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                              {acc.totalCount || 0}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Nhóm 3: Fanpage Facebook */}
                  <div className="border-t border-slate-800 pt-1.5">
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-400 flex items-center justify-between">
                      <span>Fanpage Facebook</span>
                      <span className="text-[10px] text-slate-500 font-normal">
                        {effectivePages.length} trang
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          handleAccountDropdownChange("FB_ALL");
                          setChannelPopoverOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left cursor-pointer transition-colors ${
                          selectedAccountFilter === "FB_ALL"
                            ? "bg-blue-600 text-white font-bold"
                            : "text-slate-200 hover:bg-slate-800"
                        }`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <span className="flex h-3.5 w-3.5 items-center justify-center rounded bg-blue-600 text-[9px] font-bold text-white shrink-0">
                            f
                          </span>
                          <span className="truncate">Tất cả Fanpage</span>
                        </span>
                        {selectedAccountFilter === "FB_ALL" && <Check className="w-3.5 h-3.5 shrink-0" />}
                      </button>

                      {effectivePages.map((pg) => {
                        const pageConvCount = (conversations || []).filter(
                          (c) => c.channel === "FACEBOOK" && String(c.pageId) === String(pg.pageId)
                        ).length;
                        return (
                          <button
                            key={pg.pageId}
                            type="button"
                            onClick={() => {
                              handleAccountDropdownChange(`PAGE:${pg.pageId}`);
                              setChannelPopoverOpen(false);
                            }}
                            className={`w-full flex items-center justify-between pl-6 pr-2.5 py-1.5 rounded-lg text-left cursor-pointer transition-colors text-[11px] ${
                              selectedAccountFilter === `PAGE:${pg.pageId}`
                                ? "bg-blue-600 text-white font-bold"
                                : "text-slate-300 hover:bg-slate-800"
                            }`}
                          >
                            <span className="flex items-center gap-2 truncate">
                              <span className="h-2 w-2 rounded-full bg-blue-400 shrink-0" />
                              <span className="truncate">{pg.displayName || pg.name}</span>
                            </span>
                            <span className="text-[10px] tabular-nums font-semibold px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                              {pageConvCount}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Nhóm 4: Zalo OA */}
                  <div className="border-t border-slate-200 dark:border-slate-800 pt-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        handleAccountDropdownChange("ZALO_OA");
                        setChannelPopoverOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left cursor-pointer transition-colors ${
                        selectedAccountFilter === "ZALO_OA"
                          ? "bg-sky-600 text-white font-bold badge-solid-white"
                          : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <ShieldAlert className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                        <span className="truncate">Zalo OA Official</span>
                      </span>
                      <span className="text-[10px] tabular-nums font-semibold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {(conversations || []).filter((c) => c.channel === "ZALO_OA").length}
                      </span>
                    </button>
                  </div>

                  {/* Nhóm 5: TikTok Shop */}
                  <div className="border-t border-slate-200 dark:border-slate-800 pt-1.5">
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-pink-600 dark:text-pink-400 flex items-center justify-between">
                      <span>🎵 TIKTOK SHOP</span>
                      <span className="text-[10px] text-slate-500 font-normal">
                        {effectiveTikTokShops.length} gian hàng
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      {(() => {
                        const ttAllConvs = (conversations || []).filter(
                          (c) => c.channel === "TIKTOK_SHOP" || c.channel === "TIKTOK"
                        );
                        const ttUnread = ttAllConvs.reduce(
                          (sum, c) => sum + Number(c.unreadCount || c.unread || 0),
                          0
                        );
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              handleAccountDropdownChange("TIKTOK_ALL");
                              setChannelPopoverOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left cursor-pointer transition-colors ${
                              selectedAccountFilter === "TIKTOK_ALL"
                                ? "bg-blue-600 text-white font-bold border border-blue-500 shadow-sm badge-solid-white"
                                : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                            }`}
                          >
                            <span className="flex items-center gap-2 truncate">
                              <span className="flex h-4 w-4 items-center justify-center rounded bg-slate-900 text-[10px] font-black text-white shrink-0 border border-pink-500/40">
                                ♪
                              </span>
                              <span className="truncate">Tất cả TikTok Shop</span>
                            </span>
                            <span className="flex items-center gap-1 shrink-0">
                              {ttUnread > 0 && (
                                <span className="text-[10px] tabular-nums font-bold px-1.5 py-0.2 rounded-full bg-rose-500 text-white badge-solid-white">
                                  {ttUnread}
                                </span>
                              )}
                              <span
                                className={`text-[10px] tabular-nums font-semibold px-1.5 py-0.2 rounded ${
                                  selectedAccountFilter === "TIKTOK_ALL"
                                    ? "bg-white/25 text-white badge-solid-white"
                                    : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                }`}
                              >
                                {ttAllConvs.length}
                              </span>
                            </span>
                          </button>
                        );
                      })()}

                      {effectiveTikTokShops.length === 0 ? (
                        <div className="pl-6 pr-2.5 py-1.5 text-[11px] text-slate-500 italic">
                          Chưa có gian hàng TikTok Shop đang kết nối
                        </div>
                      ) : (
                        effectiveTikTokShops.map((shop) => {
                          const shopKey = String(shop.shopId || shop.id || "");
                          const shopConvs = (conversations || []).filter(
                            (c) =>
                              (c.channel === "TIKTOK_SHOP" || c.channel === "TIKTOK") &&
                              String(c.shopId || c.accountId || c.pageId || "") === shopKey
                          );
                          const shopUnread = shopConvs.reduce(
                            (sum, c) => sum + Number(c.unreadCount || c.unread || 0),
                            0
                          );
                          const isShopActive = selectedAccountFilter === `TIKTOK_SHOP:${shopKey}`;
                          return (
                            <button
                              key={shop.id || shopKey}
                              type="button"
                              onClick={() => {
                                handleAccountDropdownChange(`TIKTOK_SHOP:${shopKey}`);
                                setChannelPopoverOpen(false);
                              }}
                              className={`w-full flex items-center justify-between pl-6 pr-2.5 py-1.5 rounded-lg text-left cursor-pointer transition-colors text-[11px] ${
                                isShopActive
                                  ? "bg-blue-600 text-white font-bold badge-solid-white"
                                  : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                              }`}
                            >
                              <span className="flex items-center gap-2 truncate">
                                <span className="h-2 w-2 rounded-full bg-pink-500 shrink-0" />
                                <span className="truncate">{shop.displayName || shop.name}</span>
                              </span>
                              <span className="flex items-center gap-1 shrink-0">
                                {shopUnread > 0 && (
                                  <span className="text-[10px] tabular-nums font-bold px-1.5 py-0.2 rounded-full bg-rose-500 text-white badge-solid-white">
                                    {shopUnread}
                                  </span>
                                )}
                                <span
                                  className={`text-[10px] tabular-nums font-semibold px-1.5 py-0.2 rounded ${
                                    isShopActive
                                      ? "bg-white/25 text-white badge-solid-white"
                                      : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                  }`}
                                >
                                  {shopConvs.length}
                                </span>
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}
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

              {/* [🏷️ Lọc theo Thẻ Tag] */}
              <div className="relative inline-flex items-center">
                <select
                  value={selectedTagFilter}
                  onChange={(e) => setSelectedTagFilter(e.target.value)}
                  className={`px-2 py-1 rounded-xl text-[11px] font-semibold border transition-all cursor-pointer focus:outline-none ${
                    selectedTagFilter !== "ALL"
                      ? "bg-amber-600 text-white border-amber-500 font-bold shadow-2xs"
                      : "bg-slate-950/80 text-slate-400 border-slate-800 hover:text-slate-200"
                  }`}
                >
                  <option value="ALL">🏷️ Thẻ (Tất cả)</option>
                  {availableTags.map((t) => (
                    <option key={t.id || t.name} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Banner tiến trình kéo lịch sử Zalo khi tài khoản mới đăng nhập hoặc đang đồng bộ sâu */}
          {zaloSyncStatus?.isSyncing && (
            <div className="px-3 py-2 bg-blue-950/70 border-b border-blue-800/60 flex items-center gap-2 text-[11px] text-blue-200 shrink-0">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">
                  Đang đồng bộ lịch sử hội thoại Zalo...
                </div>
                <div className="text-[10px] text-blue-300/80 truncate">
                  {(() => {
                    const activeAcc = (zaloSyncStatus.accounts || []).find((a) => a.isSyncing);
                    if (!activeAcc) return "Đang nạp tin nhắn DM & Nhóm từ máy chủ Zalo";
                    const totalFetched =
                      (activeAcc.dmBackfilled || 0) +
                      (activeAcc.groupBackfilled || 0) +
                      (activeAcc.groupRestFetched || 0);
                    return totalFetched > 0
                      ? `${activeAcc.name}: đã nạp ${totalFetched} tin nhắn (DM + Nhóm)`
                      : `${activeAcc.name}: đang kết nối & tải lịch sử (DM + Nhóm)...`;
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Danh sách các cuộc trò chuyện (Virtualization / Chunk rendering onScroll) */}
          <div
            onScroll={handleScrollConversationList}
            className="flex-1 overflow-y-auto divide-y divide-slate-800/50 min-h-0 scroll-smooth"
          >
            {loadingConv ? (
              <div className="p-8 text-center text-xs text-slate-500 space-y-2">
                <div className="h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p>Đang đồng bộ hội thoại thực tế...</p>
              </div>
            ) : displayedActiveChats.length === 0 && contactOnlyList.length === 0 ? (
              channelFilter === "TIKTOK_SHOP" ? (
                <div className="p-6 text-center space-y-3 flex flex-col items-center justify-center">
                  <div className="h-11 w-11 rounded-2xl bg-slate-900 border border-pink-500/40 flex items-center justify-center text-lg font-black text-white shadow-sm">
                    ♪
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-[240px]">
                    Chưa có dữ liệu tin nhắn từ TikTok Shop. Bấm{" "}
                    <span className="font-bold text-pink-600 dark:text-pink-400">[ Đồng Bộ Ngay ]</span>{" "}
                    để kéo toàn bộ tin nhắn từ sàn về.
                  </p>
                  <button
                    type="button"
                    onClick={handleSyncTikTokMessages}
                    disabled={isSyncingTikTok}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm cursor-pointer inline-flex items-center gap-2 transition-all disabled:opacity-60 badge-solid-white"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingTikTok ? "animate-spin" : ""}`} />
                    <span>{isSyncingTikTok ? "Đang đồng bộ TikTok Shop..." : "Đồng Bộ Ngay"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAccountDropdownChange("ALL")}
                    className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-medium cursor-pointer border border-slate-300 dark:border-slate-700"
                  >
                    Xem tất cả kênh
                  </button>
                </div>
              ) : (
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
              )
            ) : (
              <>
                {/* 1. Danh sách hội thoại có tin nhắn (Chunk rendering 40 items đầu, cuộn để nạp tiếp) */}
                {visibleActiveChats.map((conv) => renderConversationRow(conv))}

                {displayedActiveChats.length > visibleCount && (
                  <div className="p-3 text-center bg-slate-950/60 border-t border-slate-800/40">
                    <button
                      type="button"
                      onClick={() =>
                        setVisibleCount((prev) => Math.min(prev + 40, displayedActiveChats.length))
                      }
                      className="w-full py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-[11px] font-medium transition cursor-pointer border border-slate-800"
                    >
                      Xem thêm ({visibleCount} / {displayedActiveChats.length} hội thoại)
                    </button>
                  </div>
                )}

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
              {/* Header khung chat 2 dòng gọn gàng: Dòng 1 Tên + SĐT + Nút tác nghiệp; Dòng 2 Kênh + Dải thẻ gọn */}
              <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur flex flex-col gap-1.5 flex-shrink-0">
                <div className="flex items-center justify-between gap-3">
                  {/* Cụm Trái: Avatar + Tên khách đầy đủ + Badge SĐT */}
                  <div className="flex-1 min-w-0 flex items-center gap-2.5">
                    <div className="relative flex-shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={getSafeAvatarUrl(activeConv)}
                        alt={activeConv.name}
                        onError={(e) => handleAvatarImgError(e, activeConv.name)}
                        className="h-9 w-9 rounded-full object-cover border border-slate-300 dark:border-slate-700 bg-slate-800 shadow-xs"
                      />
                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900" />
                    </div>

                    <div className="min-w-0 flex items-center gap-2 flex-wrap">
                      <h3
                        className="font-bold text-sm text-slate-900 dark:text-white truncate max-w-[220px] sm:max-w-[280px]"
                        title={activeConv.name}
                      >
                        {activeConv.name}
                      </h3>

                      {(activeConv.phone || detectedChatPhone) && (
                        <span
                          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/60 shrink-0 tabular-nums"
                          title="Số điện thoại xác thực của khách hàng"
                        >
                          📞 {activeConv.phone || detectedChatPhone}
                        </span>
                      )}

                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap shrink-0 ${
                          getChannelMeta(activeConv.channel, activeConv.pageId, effectivePages).pillClass
                        }`}
                      >
                        {activeChannelName}
                      </span>
                    </div>
                  </div>

                  {/* Cụm Phải: Điều khiển tác nghiệp nhanh: Toggle Switch AI + Lên Đơn + Hồ Sơ */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {(() => {
                      const isThreadHuman = convBotMode === "HUMAN";

                      return (
                        <>
                          {/* Công tắc Toggle Switch Bật/Tắt AI cho từng khách */}
                          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/90 px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700 shadow-2xs">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={!isThreadHuman}
                              onClick={handleToggleAiSwitch}
                              disabled={togglingBot}
                              title={
                                !isThreadHuman
                                  ? "AI Đang Trực — Bấm để chuyển sang Sale trực"
                                  : "Sale Trực — Bấm để bật lại AI Trực"
                              }
                              className="inline-flex items-center gap-1.5 cursor-pointer focus:outline-none"
                            >
                              <span className="text-[11px] font-bold whitespace-nowrap">
                                {!isThreadHuman ? (
                                  <span className="text-purple-600 dark:text-purple-400 flex items-center gap-1">
                                    <span className="h-2 w-2 rounded-full bg-purple-500 animate-pulse shrink-0" />
                                    🤖 AI Trực
                                  </span>
                                ) : (
                                  <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1">
                                    <span className="h-2 w-2 rounded-full bg-slate-400 shrink-0" />
                                    👤 Sale Trực
                                  </span>
                                )}
                              </span>
                              <span
                                className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out ${
                                  !isThreadHuman
                                    ? "bg-purple-600"
                                    : "bg-slate-300 dark:bg-slate-700"
                                }`}
                              >
                                <span
                                  className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${
                                    !isThreadHuman ? "translate-x-3.5" : "translate-x-0.5"
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
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold shadow-xs inline-flex items-center gap-1 transition-colors cursor-pointer badge-solid-white shrink-0"
                          >
                            <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
                            <span>Lên Đơn</span>
                          </button>
                        </>
                      );
                    })()}

                    {/* Nút Hồ Sơ 360 */}
                    <button
                      type="button"
                      onClick={() => setShowSidePanel(!showSidePanel)}
                      title={showSidePanel ? "Ẩn hồ sơ 360" : "Hiện hồ sơ 360"}
                      className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors border inline-flex items-center gap-1 whitespace-nowrap cursor-pointer shrink-0 ${
                        showSidePanel
                          ? "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-600/20 dark:text-blue-400 dark:border-blue-500/30"
                          : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-800"
                      }`}
                    >
                      <UserCheck className="w-3.5 h-3.5 shrink-0" />
                      <span className="hidden sm:inline">Hồ Sơ 360</span>
                    </button>
                  </div>
                </div>

                {/* Dòng 2: Tài khoản tiếp nhận + Thẻ Tag gọn trên 1 hàng */}
                <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800/70">
                  <span className="truncate max-w-[180px] shrink-0 text-[10px]">
                    {activeConv.type === "GROUP" && activeConv.memberCount > 0
                      ? `Nhóm ${activeConv.memberCount} thành viên`
                      : activeConv.channel === "FACEBOOK" && activeConv.pageName
                      ? `Page: ${activeConv.pageName}`
                      : activeConv.accountDisplayName || activeConv.accountName
                      ? `TK: ${activeConv.accountDisplayName || activeConv.accountName}`
                      : `ID: ${activeConv.id}`}
                  </span>

                  <span className="text-slate-300 dark:text-slate-700 shrink-0">|</span>

                  {/* Dải thẻ gọn (tối đa 3 thẻ trực tiếp + nút +N nếu nhiều hơn) */}
                  <div className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto no-scrollbar">
                    {(activeConv.tags || []).slice(0, 3).map((tagStr) => {
                      const tagMeta = availableTags.find((t) => t.name === tagStr || t.id === tagStr) || {
                        name: tagStr,
                        bg: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
                      };
                      return (
                        <span
                          key={tagStr}
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium border whitespace-nowrap shrink-0 max-w-[130px] ${tagMeta.bg}`}
                          title={tagMeta.name}
                        >
                          <span className="truncate">{tagMeta.name}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleTagOnActiveConv(tagStr);
                            }}
                            className="hover:text-red-500 font-bold text-[11px] leading-none cursor-pointer shrink-0"
                            title="Gỡ thẻ tag"
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                    {(activeConv.tags || []).length > 3 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsTagPopoverOpen(true);
                        }}
                        className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0 cursor-pointer"
                        title={(activeConv.tags || []).slice(3).join(", ")}
                      >
                        +{(activeConv.tags || []).length - 3}
                      </button>
                    )}
                  </div>

                  {/* Nút + Gắn Thẻ Popover - đặt NGOÀI container overflow-x-auto để không bị clip */}
                  <div className="relative inline-block shrink-0" ref={tagPopoverRef}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsTagPopoverOpen(!isTagPopoverOpen);
                      }}
                      className="text-[10px] font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-300 px-2 py-0.5 rounded-md inline-flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap"
                    >
                      + Gắn Thẻ
                    </button>

                    {isTagPopoverOpen && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute left-0 top-full mt-2 w-72 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-3 z-[9999] text-xs text-slate-800 dark:text-slate-200"
                      >
                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800 font-bold text-slate-800 dark:text-slate-200">
                          <span>Gắn Thẻ Khách Hàng</span>
                          <Link
                            className="text-[10px] text-blue-600 hover:underline font-normal inline-flex items-center gap-0.5"
                            href="/settings/tags"
                            target="_blank"
                          >
                            ⚙️ Quản lý thẻ
                          </Link>
                        </div>

                        {/* Danh sách thẻ thực tế trong hệ thống */}
                        <div className="max-h-44 overflow-y-auto space-y-1 mb-2 pr-0.5">
                          {availableTags.length === 0 ? (
                            <p className="text-[11px] text-slate-400 italic text-center py-2">
                              Chưa có thẻ nào trong hệ thống
                            </p>
                          ) : (
                            availableTags.map((tag) => {
                              const isChecked =
                                (activeConv?.tags || []).includes(tag.name) ||
                                (activeConv?.tags || []).includes(tag.id);
                              return (
                                <label
                                  key={tag.id || tag.name}
                                  className="flex items-center justify-between p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/80 rounded-lg cursor-pointer transition-colors"
                                >
                                  <span
                                    className={`px-2 py-0.5 rounded-md text-[11px] font-medium border ${
                                      tag.bg || "bg-slate-100 text-slate-700 border-slate-200"
                                    }`}
                                  >
                                    {tag.name}
                                  </span>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => handleToggleTagOnActiveConv(tag.name || tag.id)}
                                    className="rounded text-blue-600 focus:ring-0 cursor-pointer h-3.5 w-3.5"
                                  />
                                </label>
                              );
                            })
                          )}
                        </div>

                        {/* Form thêm nhanh thẻ mới tại chỗ */}
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              placeholder="Tên thẻ mới..."
                              value={newTagName}
                              onChange={(e) => setNewTagName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleCreateAndAttachTag();
                                }
                              }}
                              className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs outline-none focus:border-blue-500 text-slate-900 dark:text-white"
                            />
                            <button
                              type="button"
                              onClick={handleCreateAndAttachTag}
                              disabled={!newTagName.trim()}
                              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-3 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors"
                            >
                              Thêm
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* HỘP THOẠI CHĂM SÓC TẠM (Temporary Direct Chat Header) */}
              {activeConv?.isDirectCareTemp && (
                <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-sky-50 dark:from-emerald-950/40 dark:via-slate-900 dark:to-sky-950/40 border-b border-emerald-200 dark:border-emerald-800/60 px-4 py-2.5 text-xs shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="h-8 w-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs animate-pulse">
                        ⚡
                      </span>
                      <div className="min-w-0">
                        <div className="font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-2 flex-wrap">
                          <span>HỘP THOẠI CHĂM SÓC TỰ ĐỘNG TỨC THÌ (INSTANT CARE)</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700">
                            Sẵn sàng gửi 0ms
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 truncate">
                          Khách: <strong className="text-slate-900 dark:text-slate-100">{activeConv.name}</strong> • SĐT: <strong className="text-emerald-700 dark:text-emerald-400 font-mono">{activeConv.phone || "Chưa có"}</strong> • Kênh Zalo phụ trách: <strong className="text-slate-900 dark:text-slate-100">{activeConv.accountDisplayName || activeConv.accountName || "Zalo Cá Nhân"}</strong>{activeConv.staffName ? ` • NV: ${activeConv.staffName}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      {activeConv.phone && (
                        <>
                          <a
                            href={`https://zalo.me/${normalizePhone(activeConv.phone)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold shadow-xs inline-flex items-center gap-1.5 transition"
                            title="Mở ứng dụng hoặc web Zalo trực tiếp"
                          >
                            💬 Nhắn Zalo (zalo.me/{normalizePhone(activeConv.phone)})
                          </a>
                          <a
                            href={`tel:${normalizePhone(activeConv.phone)}`}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-xs inline-flex items-center gap-1.5 transition"
                          >
                            📞 Gọi điện
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Message Thread Stream (Bong bóng chat 2 chiều - triệt tiêu cuộn ngang, giữ vị trí cuộn) */}
              <div
                ref={msgStreamRef}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
                }}
                className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-5 space-y-4 chat-stream-bg min-h-0"
              >
                {/* Nút tải thêm lịch sử cũ nếu connector hỗ trợ */}
                {messagesMeta.hasMore && !loadingMessages && (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={handleLoadOlderMessages}
                      disabled={loadingOlder}
                      className="rounded-full bg-white dark:bg-slate-800 px-3 py-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                    >
                      {loadingOlder ? "Đang tải tin cũ..." : "Tải thêm tin nhắn cũ"}
                    </button>
                  </div>
                )}
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
                ) : messagesError && messages.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-xs space-y-3">
                    <div className="h-12 w-12 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-center justify-center text-rose-500">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div className="space-y-1 max-w-sm">
                      <p className="font-bold text-sm text-rose-600 dark:text-rose-400">
                        Không thể tải lịch sử tin nhắn
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {messagesError}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRefreshMsgCount((c) => c + 1)}
                      className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium cursor-pointer"
                    >
                      Thử tải lại
                    </button>
                  </div>
                ) : messages.length === 0 ? (
                  activeConv?.isDirectCareTemp ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-xs space-y-3">
                      <div className="h-14 w-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-xs">
                        <Zap className="w-7 h-7" />
                      </div>
                      <div className="space-y-1">
                        <p className="font-bold text-sm text-slate-900 dark:text-white">
                          Bắt đầu chăm sóc khách hàng: {activeConv.name}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {activeConv.phone ? `Số điện thoại: ${activeConv.phone}` : ""} • Kênh Zalo: {activeConv.accountDisplayName || activeConv.accountName}
                        </p>
                      </div>
                      <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 max-w-sm space-y-1.5 shadow-xs">
                        <div className="flex items-center justify-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold text-xs">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Sẵn sàng gửi tin nhắn tức thì (0ms)</span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                          Nhập tin nhắn ở khung soạn thảo bên dưới và bấm <strong className="text-slate-700 dark:text-slate-200">Gửi (Enter)</strong>. Hệ thống tự động đẩy tin nhắn qua Zalo trong nền. Bạn cũng có thể bấm <strong className="text-blue-600">Nhắn Zalo</strong> ở trên để mở trực tiếp trên app/web.
                        </p>
                      </div>
                    </div>
                  ) : (
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
                          {zaloSyncStatus?.isSyncing ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Zap className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {zaloSyncStatus?.isSyncing
                              ? "Đang đồng bộ lịch sử tin nhắn từ Zalo..."
                              : "Sẵn sàng kết nối 2 chiều"}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                          {zaloSyncStatus?.isSyncing ? (
                            <>
                              Hệ thống đang kéo lịch sử tin nhắn cũ của{" "}
                              <strong>{activeChannelName}</strong>. Hội thoại sẽ tự động hiển thị ngay khi tải xong.
                            </>
                          ) : activeConv?.channel === "ZALO_PERSONAL" && activeConv?.type === "DIRECT" ? (
                            <>
                              Chưa có tin nhắn nào trong bộ nhớ gần đây. Zalo Web chỉ hỗ trợ tải lại các tin nhắn DM phát sinh gần đây trên cloud (tin nhắn quá cũ được mã hóa cục bộ trên điện thoại). Hãy gõ tin nhắn bên dưới để nhắn qua{" "}
                              <strong>{activeChannelName}</strong>.
                            </>
                          ) : (
                            <>
                              Hãy gõ tin nhắn ở khung bên dưới để bắt đầu gửi trực tiếp qua{" "}
                              <strong>{activeChannelName}</strong>.
                            </>
                          )}
                        </p>
                        <div className="pt-2 flex justify-center">
                          <button
                            type="button"
                            onClick={() => {
                              setLoadingMessages(true);
                              setRefreshMsgCount((c) => c + 1);
                            }}
                            className="px-3 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900 border border-blue-200 dark:border-blue-800 text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>Làm mới & Nạp tin nhắn</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                ) : (
                  <>
                    {messages.some((m) => m.isFallbackPreview) && (
                      <div className="mx-auto max-w-md px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-[11px] text-amber-800 dark:text-amber-300 text-center flex items-center justify-center gap-1.5 shadow-2xs">
                        <span>Đang đồng bộ thêm lịch sử từ Zalo. Đã nạp tin nhắn mới nhất từ bộ nhớ đệm.</span>
                      </div>
                    )}
                    {messages.map((m) => {
                      const isMe = Boolean(m.isMe || m.sender === "STAFF" || m.senderRole === "SHOP");
                      const isAi = m.isAi || m.fromBot || (isMe && m.senderName?.includes("AI"));
                      const rawUrl = m.url || m.thumb || m.mediaUrl || "";
                      const hasValidUrl =
                        typeof rawUrl === "string" &&
                        (rawUrl.startsWith("http://") ||
                          rawUrl.startsWith("https://") ||
                          rawUrl.startsWith("/") ||
                          rawUrl.startsWith("blob:") ||
                          rawUrl.startsWith("data:"));

                      const isAudioMsg = Boolean(
                        m.type === "chat.voice" ||
                        m.type === "voice" ||
                        m.isAudio ||
                        (rawUrl && (rawUrl.endsWith(".mp3") || rawUrl.endsWith(".wav") || rawUrl.endsWith(".ogg") || rawUrl.endsWith(".webm") || rawUrl.endsWith(".m4a")))
                      );
                      const audioMsgUrl = rawUrl || "";

                      const isFileMsg = Boolean(
                        m.type === "chat.file" ||
                        m.isFile ||
                        (rawUrl && !isAudioMsg && /\.(pdf|docx?|xlsx?|zip|rar|txt|csv)$/i.test(rawUrl))
                      );
                      const fileMsgUrl = rawUrl || "";

                      const textIsUrl =
                        typeof m.text === "string" &&
                        (m.text.startsWith("http://") || m.text.startsWith("https://")) &&
                        (m.text.includes(".jpg") ||
                          m.text.includes(".png") ||
                          m.text.includes(".webp") ||
                          m.text.includes("zdn.vn"));
                      const photoUrl = !isAudioMsg && !isFileMsg ? (hasValidUrl ? rawUrl : textIsUrl ? m.text : null) : null;
                      const isPhoto = Boolean(photoUrl);

                      const msgInfo = formatMessageForDisplay(m.text, m.type);
                      const isRecalled = Boolean(m.isRecalled || msgInfo.isRecalled);
                      const isSticker = Boolean(msgInfo.isSticker);
                      const displayText = msgInfo.text;

                      if (m.isSystem || m.sender === "SYSTEM") {
                        return (
                          <div key={m.id} className="flex justify-center my-2">
                            <div className="max-w-[85%] rounded-full px-3.5 py-1 bg-slate-100/90 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 text-[11px] text-center shadow-2xs border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-center gap-1.5">
                              <span>{displayText}</span>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={m.id}
                        className={`flex items-end gap-2.5 ${isMe ? "justify-end" : "justify-start"}`}
                      >
                        {!isMe && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={getSafeAvatarUrl(activeConv)}
                            alt=""
                            onError={(e) => handleAvatarImgError(e, m.senderName || activeConv.name)}
                            className="h-7 w-7 rounded-full object-cover flex-shrink-0 border border-slate-700 bg-slate-800"
                            title={m.senderName || activeConv.name}
                          />
                        )}

                        <div
                          className={`max-w-[70%] rounded-2xl px-4 py-2.5 shadow-sm ${
                            isRecalled
                              ? "bg-slate-100/90 text-slate-500 border border-dashed border-slate-300 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700 italic"
                              : isMe
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

                          {isRecalled ? (
                            <div className="flex items-center gap-1.5 py-0.5">
                              <Undo2 className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
                              <span className="text-xs">{displayText}</span>
                            </div>
                          ) : isSticker ? (
                            <div className="flex items-center gap-1.5 py-0.5">
                              <Smile className="w-4 h-4 flex-shrink-0 text-amber-400" />
                              <span className="text-xs font-medium">{displayText}</span>
                            </div>
                          ) : isPhoto ? (
                            <div className="my-1">
                              <a href={photoUrl} target="_blank" rel="noreferrer" className="block">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={photoUrl}
                                  alt="Ảnh tin nhắn"
                                  className="max-h-56 rounded-lg object-contain border border-slate-700 hover:opacity-90 transition"
                                />
                              </a>
                              {displayText && displayText !== photoUrl && (
                                <p className="text-xs leading-relaxed mt-1.5 whitespace-pre-wrap">{displayText}</p>
                              )}
                            </div>
                          ) : isAudioMsg ? (
                            <div className="my-1.5 p-2 rounded-xl bg-black/25 flex flex-col gap-1.5 min-w-[220px]">
                              <div className="flex items-center gap-2">
                                <Volume2 className="w-4 h-4 text-rose-400 shrink-0" />
                                <span className="text-[11px] font-semibold text-rose-300">Tin nhắn thoại</span>
                              </div>
                              <audio controls src={audioMsgUrl} className="h-7 w-full max-w-[240px]" />
                            </div>
                          ) : isFileMsg ? (
                            <div className="my-1.5 flex items-center gap-2.5 p-2 rounded-xl bg-black/20 border border-white/10 max-w-xs">
                              <FileText className="w-6 h-6 text-blue-400 shrink-0" />
                              <div className="min-w-0 flex-1">
                                <a
                                  href={fileMsgUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs font-semibold hover:underline truncate block"
                                >
                                  {m.fileName || displayText || "Tài liệu đính kèm"}
                                </a>
                                <span className="text-[10px] opacity-70">Bấm để tải về</span>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs leading-relaxed whitespace-pre-wrap">{displayText}</p>
                          )}

                          <div
                            className={`mt-1 flex items-center justify-end gap-1 text-[10px] tabular-nums ${
                              isMe ? (isAi ? "text-purple-200" : "text-blue-100") : "text-slate-400"
                            }`}
                          >
                            <span>{m.time || (m.timestamp ? new Date(m.timestamp).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "")}</span>
                            {isMe && (
                              <span className="inline-flex items-center">
                                {m.status === "sending" ? (
                                  <Clock className="w-3 h-3" />
                                ) : m.status === "error" ? (
                                  <AlertTriangle className="w-3 h-3 text-rose-300" />
                                ) : m.status === "mocked" ? (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 text-[9px] font-semibold">
                                    Mô phỏng (Safe Mode)
                                  </span>
                                ) : (
                                  <CheckCheck className="w-3 h-3" />
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  </>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Composer (Ô nhập tin nhắn & Gửi chuẩn Vpage) */}
              <div className="border-t border-slate-800 bg-slate-900/90 p-2.5 space-y-1.5 flex-shrink-0">
                {/* 1. Thanh gắn thẻ nhanh chuẩn Vpage (Cấp 1 | Cấp 2 | Cấp 3 | Đã chốt | Bám đuổi...) */}
                <QuickTagBar
                  currentTags={activeConv.tags || []}
                  availableTags={availableTags}
                  onToggleTag={handleToggleTagOnActiveConv}
                  onOpenTagManager={() => setIsTagPopoverOpen(true)}
                />

                {/* 2. Thanh Ghi Âm Giọng Nói (khi bấm Ghi âm) */}
                <AudioRecorderBar
                  isOpen={isAudioRecordingOpen}
                  onClose={() => setIsAudioRecordingOpen(false)}
                  onSendAudio={handleSendAudio}
                />

                <div className="flex items-center justify-between text-[11px] text-slate-500 px-1 gap-2">
                  <span className="truncate">
                    Nhắn tin trực tiếp qua <strong className="text-slate-300">{activeChannelName}</strong>
                  </span>
                  <span className="whitespace-nowrap hidden sm:inline">Enter để gửi • Shift+Enter xuống dòng • Ctrl+Q mở Trả lời nhanh</span>
                </div>

                {/* 3. Khung soạn thảo tin nhắn */}
                <form onSubmit={handleSendMessage} className="flex items-end gap-2">
                  <div className="flex-1 relative">
                    <textarea
                      rows={2}
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onPaste={handlePaste}
                      placeholder={`Nhập tin nhắn gửi tới ${activeConv.name}... (Nhấn Ctrl+Q hoặc / để mở Trả lời nhanh)`}
                      className="w-full rounded-xl border border-slate-700/80 bg-slate-950 p-2.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none resize-none leading-relaxed"
                    />
                  </div>

                  {/* Nút ✨ AI Gợi Ý */}
                  <button
                    type="button"
                    onClick={handleAiCompose}
                    disabled={aiComposing || sending}
                    title="Dựa vào Second Brain để viết thành lời tư vấn chuẩn Dược sĩ"
                    className="h-10 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 transition-colors flex-shrink-0 shadow-sm whitespace-nowrap cursor-pointer badge-solid-white"
                  >
                    {aiComposing ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                        <span className="hidden sm:inline">Đang soạn...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 shrink-0" />
                        <span className="hidden sm:inline">✨ AI Gợi Ý</span>
                      </>
                    )}
                  </button>

                  {/* Nút Gửi */}
                  <button
                    type="submit"
                    disabled={sending || (!inputMessage.trim() && attachedFiles.length === 0)}
                    className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 transition-colors flex-shrink-0 whitespace-nowrap cursor-pointer badge-solid-white"
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

                {/* 4. Thanh Công Cụ Nhắn Tin Đa Kênh Chuẩn Vpage (6 Mục theo yêu cầu) */}
                <ChatToolbar
                  onOpenQuickReplies={() => setIsQuickRepliesOpen(true)}
                  onOpenProductPicker={() => setIsProductPickerOpen(true)}
                  onOpenKiotVietOrder={() => setIsOrderModalOpen(true)}
                  onToggleVoiceRecorder={() => setIsAudioRecordingOpen(!isAudioRecordingOpen)}
                  isRecordingVoice={isAudioRecordingOpen}
                  onSelectEmoji={handleSelectEmoji}
                  onFileSelected={handleFileSelected}
                  attachedFiles={attachedFiles}
                  onRemoveAttachment={handleRemoveAttachment}
                />
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getSafeAvatarUrl(activeConv)}
                alt={activeConv.name}
                onError={(e) => handleAvatarImgError(e, activeConv.name)}
                className="h-14 w-14 rounded-full object-cover border-2 border-blue-500 mx-auto bg-slate-800 shadow-md"
              />
              <div className="space-y-1">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white">{activeConv.name}</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {activeConv.phone || detectedChatPhone
                    ? `SĐT: ${activeConv.phone || detectedChatPhone}`
                    : `ID: ${activeConv.id}`}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-1 mt-1.5">
                  {activeConv?.tags && activeConv.tags.length > 0 ? (
                    activeConv.tags.map((tagId) => {
                      const tag = availableTags.find((t) => t.id === tagId || t.name === tagId);
                      const tagName = tag ? tag.name : tagId;
                      const tagBg =
                        tag?.bg ||
                        "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
                      return (
                        <span
                          key={tagId}
                          className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium border inline-flex items-center gap-1 max-w-[150px] ${tagBg}`}
                          title={tagName}
                        >
                          <span className="truncate">{tagName}</span>
                          <button
                            type="button"
                            onClick={() => handleToggleTagOnActiveConv(tagId)}
                            className="hover:text-red-500 font-bold text-[11px] leading-none cursor-pointer shrink-0"
                            title="Gỡ thẻ tag"
                          >
                            ×
                          </button>
                        </span>
                      );
                    })
                  ) : (
                    <span className="text-[11px] text-slate-400 italic">Chưa gắn thẻ tag nào</span>
                  )}

                  {/* Nút + Gắn Thẻ ngay trên Hồ sơ Khách hàng */}
                  <div className="relative inline-block" ref={rightTagPopoverRef}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsRightTagPopoverOpen(!isRightTagPopoverOpen);
                      }}
                      className="text-[10px] font-semibold text-blue-400 hover:text-blue-300 bg-blue-950/60 hover:bg-blue-900/80 border border-blue-700/60 px-2 py-0.5 rounded-md inline-flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap ml-1"
                      title="Gắn thẻ cho khách hàng này"
                    >
                      + Gắn thẻ
                    </button>

                    {isRightTagPopoverOpen && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-3 z-[9999] text-xs text-slate-800 dark:text-slate-200 text-left"
                      >
                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800 font-bold text-slate-800 dark:text-slate-200">
                          <span>Gắn Thẻ Khách Hàng</span>
                          <Link
                            className="text-[10px] text-blue-600 hover:underline font-normal inline-flex items-center gap-0.5"
                            href="/settings/tags"
                            target="_blank"
                          >
                            ⚙️ Quản lý thẻ
                          </Link>
                        </div>

                        {/* Danh sách thẻ */}
                        <div className="max-h-48 overflow-y-auto space-y-1 mb-2 pr-0.5">
                          {availableTags.length === 0 ? (
                            <p className="text-[11px] text-slate-400 italic text-center py-2">
                              Chưa có thẻ nào trong hệ thống
                            </p>
                          ) : (
                            availableTags.map((tag) => {
                              const isChecked =
                                (activeConv?.tags || []).includes(tag.name) ||
                                (activeConv?.tags || []).includes(tag.id);
                              return (
                                <label
                                  key={tag.id || tag.name}
                                  className="flex items-center justify-between p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/80 rounded-lg cursor-pointer transition-colors"
                                >
                                  <span
                                    className={`px-2 py-0.5 rounded-md text-[11px] font-medium border ${
                                      tag.bg || "bg-slate-100 text-slate-700 border-slate-200"
                                    }`}
                                  >
                                    {tag.name}
                                  </span>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => handleToggleTagOnActiveConv(tag.name || tag.id)}
                                    className="rounded text-blue-600 focus:ring-0 cursor-pointer h-3.5 w-3.5"
                                  />
                                </label>
                              );
                            })
                          )}
                        </div>

                        {/* Form thêm nhanh thẻ mới tại chỗ */}
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              placeholder="Tên thẻ mới..."
                              value={newTagName}
                              onChange={(e) => setNewTagName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleCreateAndAttachTag();
                                }
                              }}
                              className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs outline-none focus:border-blue-500 text-slate-900 dark:text-white"
                            />
                            <button
                              type="button"
                              onClick={handleCreateAndAttachTag}
                              disabled={!newTagName.trim()}
                              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-3 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors"
                            >
                              Thêm
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
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
                        : "Chưa có thông tin bệnh lý.")}
                  </p>
                </div>

                {/* 2. Nhu Cầu & Sản Phẩm */}
                <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 dark:bg-blue-950/40 dark:border-blue-900/60 dark:text-blue-200 space-y-1">
                  <div className="font-bold flex items-center gap-1 text-[11px] text-blue-700 dark:text-blue-300">
                    <span>🥛 02. Nhu Cầu & Sản Phẩm</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    {aiSummary?.demand ||
                      (matchedCustomer?.demand
                        ? matchedCustomer.demand
                        : "Chưa có ghi nhận nhu cầu cụ thể.")}
                  </p>
                </div>

                {/* 3. Điểm Còn Băn Khoăn */}
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-900/60 dark:text-amber-200 space-y-1">
                  <div className="font-bold flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300">
                    <span>⚠️ 03. Điểm Còn Băn Khoăn</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    {aiSummary?.concerns ||
                      (matchedCustomer?.notes
                        ? matchedCustomer.notes
                        : "Chưa ghi nhận băn khoăn nào.")}
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
                        if (!aiSummary?.closing_script) {
                          setToast({ type: "error", text: "Vui lòng bấm 'Tóm tắt ngay' trước để AI phân tích kịch bản chốt." });
                          setTimeout(() => setToast(null), 2500);
                          return;
                        }
                        setInputMessage(aiSummary.closing_script);
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
                    {aiSummary?.closing_script
                      ? `"${aiSummary.closing_script}"`
                      : "Bấm nút 'Tóm tắt ngay' bên trên để AI phân tích kịch bản chốt đơn phù hợp nhất cho khách hàng này."}
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
          setToast({ type: "success", text: `Đã tạo đơn hàng ${order.orderCode} lên KiotViet thành công!` });
          setTimeout(() => setToast(null), 3500);
          const orderMsg = `Dạ em đã tạo đơn hàng #${order.orderCode || "KiotViet"} thành công cho mình trên hệ thống Dược Phẩm ADDP rồi ạ! Tổng tiền: ${Number(order.finalAmount || 0).toLocaleString("vi-VN")}đ. Kho đang chuẩn bị đóng gói để gửi sớm nhất cho anh/chị nhé ạ!`;
          setInputMessage(orderMsg);
        }}
      />

      {/* Modal Trả lời nhanh (QuickRepliesModal) */}
      <QuickRepliesModal
        isOpen={isQuickRepliesOpen}
        onClose={() => setIsQuickRepliesOpen(false)}
        onSelect={handleSelectQuickReply}
        onSendDirect={handleSendQuickReplyDirect}
        customerName={activeConv?.name || "Khách hàng"}
      />

      {/* Modal Chọn Sản Phẩm ADDP / KiotViet (ProductPickerModal) */}
      <ProductPickerModal
        isOpen={isProductPickerOpen}
        onClose={() => setIsProductPickerOpen(false)}
        onSelectProduct={handleSelectProduct}
        onSendProductDirect={handleSendProductDirect}
      />

      {/* Modal Gửi tin nhắn hàng loạt (BulkMessageModal) */}
      <BulkMessageModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        zaloAccounts={effectiveZaloAccounts}
        facebookPages={effectivePages}
        availableTags={availableTags}
        conversations={conversations}
        onCampaignCreated={(camp) => {
          setToast({
            type: "success",
            text: `Đã khởi tạo chiến dịch "${camp.name}" thành công!`,
          });
          setTimeout(() => setToast(null), 4000);
        }}
      />
    </div>
  );
}
