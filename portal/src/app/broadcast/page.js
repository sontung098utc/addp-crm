"use client";

import { useState, useEffect, useMemo } from "react";
import KeywordAutoReplyTab from "./KeywordAutoReplyTab";

const TAG_BADGE_STYLES = {
  "Tiểu Đường Tuýp 2": "bg-rose-500/15 text-rose-300 border-rose-500/30",
  "Tiểu Đường Tuýp 1": "bg-pink-500/15 text-pink-300 border-pink-500/30",
  "Tiền Tiểu Đường": "bg-orange-500/15 text-orange-300 border-orange-500/30",
  "Men Gan Cao": "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "Gan Nhiễm Mỡ": "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  VIP: "bg-purple-500/20 text-purple-300 border-purple-500/40",
  "Đã Mua Glucare Plus": "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  "Đã Mua Dovital": "bg-teal-500/15 text-teal-300 border-teal-500/30",
  "Zalo Cá Nhân": "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  "Fanpage FB": "bg-blue-500/15 text-blue-300 border-blue-500/30",
  "Zalo OA": "bg-sky-500/15 text-sky-300 border-sky-500/30",
  "Bạn Bè Zalo": "bg-blue-600/20 text-blue-300 border-blue-500/40",
  "Đã Từng Nhắn Tin Zalo": "bg-cyan-600/20 text-cyan-300 border-cyan-500/40",
  "Đã Hủy Đơn": "bg-red-500/20 text-red-300 border-red-500/40",
  "Khiếu Nại": "bg-red-600/20 text-red-300 border-red-500/40",
  "Dừng Chăm Sóc": "bg-slate-600/30 text-slate-300 border-slate-500/40",
};

const DEFAULT_EXCLUDE_OPTIONS = [
  "Đã Hủy Đơn",
  "Khiếu Nại",
  "Dừng Chăm Sóc",
];

function renderSpinPreviewClient(template = "", sample = {}) {
  let text = String(template || "");
  const fullName = sample.fullName || "Trần Minh Tuấn";
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts[parts.length - 1] || "Tuấn";
  const phone = sample.phone || sample.maskedPhone || "0912345678";
  const assignedStaff = sample.assignedStaff || "Dược sĩ Thảo";

  text = text
    .replace(/\{fullName\}/gi, fullName)
    .replace(/\{firstName\}/gi, firstName)
    .replace(/\{phone\}/gi, phone)
    .replace(/\{assignedStaff\}/gi, assignedStaff)
    .replace(/\{productName\}/gi, "Sữa hạt Glucare Plus");

  text = text.replace(/\{([^{}]*[|/][^{}]*)\}/g, (_, group) => {
    const delimiter = group.includes("|") ? "|" : "/";
    const opts = group
      .split(delimiter)
      .map((s) => s.trim())
      .filter(Boolean);
    if (opts.length === 0) return "";
    const idx = (sample.seed || 0) % opts.length;
    return opts[idx];
  });

  return text;
}

export default function BroadcastPage() {
  const [activeMainTab, setActiveMainTab] = useState("broadcast"); // 'broadcast' | 'keyword_auto_reply'
  const [campaigns, setCampaigns] = useState([]);
  const [sentToday, setSentToday] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);
  const [toast, setToast] = useState(null);

  // State Nguồn Tệp Người Nhận (3 Chế Độ Thực Chiến)
  const [audienceSource, setAudienceSource] = useState("ZALO_FRIENDS"); // "ZALO_FRIENDS" | "ALL_INBOX" | "BY_TAG"
  const [availableTags, setAvailableTags] = useState([]);

  // State cho Form Tạo Chiến Dịch 4 Bước
  const [campaignName, setCampaignName] = useState("");
  const [channel, setChannel] = useState("ZALO_PERSONAL");
  const [selectedAccountId, setSelectedAccountId] = useState("ALL");
  const [accountName, setAccountName] = useState("Zalo Cá Nhân");
  const [zaloAccounts, setZaloAccounts] = useState([]);
  const [zaloOaAccounts, setZaloOaAccounts] = useState([]);
  const [facebookPages, setFacebookPages] = useState([]);
  const [tiktokShops, setTiktokShops] = useState([]);
  const [shopeeShops, setShopeeShops] = useState([]);
  const [includeTags, setIncludeTags] = useState([]);
  const [excludeTags, setExcludeTags] = useState([
    "Đã Hủy Đơn",
    "Khiếu Nại",
    "Dừng Chăm Sóc",
  ]);
  const [tagOperator, setTagOperator] = useState("OR");
  const [productFilter, setProductFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [audienceSearch, setAudienceSearch] = useState("");
  const [availableProducts, setAvailableProducts] = useState([]);
  const [availableCategories, setAvailableCategories] = useState([]);
  const [selectedRecipientIds, setSelectedRecipientIds] = useState([]);
  const [manualSelectionActive, setManualSelectionActive] = useState(false);
  const [previewPage, setPreviewPage] = useState(1);
  const previewPageSize = 30;
  const [templateText, setTemplateText] = useState(
    "{Dạ em Thảo chào|Em chào|Dạ kính chào} {fullName} ạ! {Dược sĩ ADDP|Chuyên viên {assignedStaff}} nhắn nhắc mình nhớ duy trì uống đều đặn 2 ly Sữa hạt Glucare Plus với nước ấm 45-50°C mỗi ngày để đường huyết lúc đói luôn bình ổn nhé ạ!"
  );
  const [speedMin, setSpeedMin] = useState(45);
  const [speedMax, setSpeedMax] = useState(120);
  const [useMessageTag, setUseMessageTag] = useState(false);
  const [messageTag, setMessageTag] = useState("POST_PURCHASE_UPDATE");
  const [useZnsTemplate, setUseZnsTemplate] = useState(false);
  const [mockMode, setMockMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [spinningAi, setSpinningAi] = useState(false);
  const [previewSeed, setPreviewSeed] = useState(0);

  // State cho Bộ lọc & Đếm trước Tệp Khách Nhận Thực Tế
  const [audienceCount, setAudienceCount] = useState(0);
  const [audiencePreview, setAudiencePreview] = useState([]);
  const [channelBreakdown, setChannelBreakdown] = useState({
    zalo: 0,
    messenger: 0,
    zaloOa: 0,
    tiktok: 0,
    shopee: 0,
  });
  const [showPreviewDrawer, setShowPreviewDrawer] = useState(true);
  const [loadingAudience, setLoadingAudience] = useState(false);

  // State Modal Gửi Thử 1 Tin
  const [showTestModal, setShowTestModal] = useState(false);
  const [testTarget, setTestTarget] = useState("");
  const [testName, setTestName] = useState("Sơn Tùng (Admin)");
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const showNotice = (text, type = "success") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Tải danh sách chiến dịch & tiến độ realtime
  const fetchCampaigns = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await fetch("/api/broadcast/campaigns");
      const data = await res.json();
      if (data.ok) {
        const list = data.campaigns || [];
        setCampaigns(list);
        setSentToday(Number(data.sentToday) || 0);
        if (!selectedCampaignId && list.length > 0) {
          setSelectedCampaignId(list[0].id);
        }
      }
    } catch (err) {
      console.error("Lỗi tải chiến dịch Broadcast:", err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns(false);
    fetch("/api/channels")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d?.channels) ? d.channels : [];
        const active = list.filter((c) => {
          const st = String(c?.status || "").toUpperCase();
          return st !== "DISCONNECTED" && st !== "DELETED" && st !== "INACTIVE";
        });
        setZaloAccounts(
          active.filter((c) => c.platform === "ZALO_PERSONAL" || c.type === "zalo_personal")
        );
        setZaloOaAccounts(
          active.filter((c) => c.platform === "ZALO_OA" || c.type === "zalo_oa")
        );
        setFacebookPages(
          active.filter((c) => c.platform === "FACEBOOK" || c.type === "facebook")
        );
        setTiktokShops(
          active.filter(
            (c) =>
              c.platform === "TIKTOK_SHOP" ||
              c.platform === "TIKTOK" ||
              c.type === "tiktok_shop"
          )
        );
        setShopeeShops(
          active.filter((c) => c.platform === "SHOPEE" || c.type === "shopee")
        );
      })
      .catch(() => {});
  }, []);

  // Poll realtime mỗi 2s khi có chiến dịch đang chạy (RUNNING)
  useEffect(() => {
    const hasRunning = campaigns.some(
      (c) => c.status === "RUNNING" || c.status === "PROCESSING"
    );
    const interval = setInterval(
      () => {
        fetchCampaigns(true);
      },
      hasRunning ? 2000 : 8000
    );
    return () => clearInterval(interval);
  }, [campaigns]);

  // Tự động đếm & lọc tệp khách nhận mỗi khi thay đổi Nguồn tệp, Tài khoản, Thẻ, Sản phẩm, Phân loại hoặc Kênh
  useEffect(() => {
    let cancelled = false;
    async function countAudience() {
      try {
        setLoadingAudience(true);
        const res = await fetch("/api/broadcast/audience", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audienceSource,
            includeTags,
            excludeTags,
            channel,
            operator: tagOperator,
            targetAccount: selectedAccountId,
            productFilter,
            categoryFilter,
            searchQuery: audienceSearch,
          }),
        });
        const data = await res.json();
        if (!cancelled && data.ok) {
          const preview = Array.isArray(data.previewList) ? data.previewList : [];
          setAudienceCount(Number(data.totalCount) || 0);
          setAudiencePreview(preview);
          setSelectedRecipientIds(preview.map((c) => String(c.id)));
          setManualSelectionActive(false);
          setPreviewPage(1);
          if (data.channelBreakdown) {
            setChannelBreakdown(data.channelBreakdown);
          }
          if (Array.isArray(data.availableTags)) {
            setAvailableTags(data.availableTags);
          }
          if (Array.isArray(data.availableProducts)) {
            setAvailableProducts(data.availableProducts);
          }
          if (Array.isArray(data.availableCategories)) {
            setAvailableCategories(data.availableCategories);
          }
        }
      } catch (err) {
        console.error("Lỗi đếm tệp khách nhận:", err);
      } finally {
        if (!cancelled) setLoadingAudience(false);
      }
    }
    countAudience();
    return () => {
      cancelled = true;
    };
  }, [
    audienceSource,
    includeTags,
    excludeTags,
    channel,
    tagOperator,
    selectedAccountId,
    productFilter,
    categoryFilter,
    audienceSearch,
  ]);

  const effectiveSendCount = manualSelectionActive
    ? selectedRecipientIds.length
    : audienceCount;

  const toggleSelectRecipient = (id) => {
    const strId = String(id);
    setManualSelectionActive(true);
    setSelectedRecipientIds((prev) =>
      prev.includes(strId) ? prev.filter((x) => x !== strId) : [...prev, strId]
    );
  };

  const handleSelectAllPreview = () => {
    setManualSelectionActive(false);
    setSelectedRecipientIds(audiencePreview.map((c) => String(c.id)));
  };

  const handleClearAllPreview = () => {
    setManualSelectionActive(true);
    setSelectedRecipientIds([]);
  };

  const toggleIncludeTag = (tag) => {
    setIncludeTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const toggleExcludeTag = (tag) => {
    setExcludeTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const insertTokenToTemplate = (token) => {
    setTemplateText((prev) => `${prev}${prev.endsWith(" ") ? "" : " "}${token}`);
  };

  const handleAiGenerateSpin = async () => {
    try {
      setSpinningAi(true);
      const res = await fetch("/api/broadcast/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "GENERATE_SPIN_TEXT",
          templateText,
          sampleName: audiencePreview[0]?.fullName || "Trần Minh Tuấn",
        }),
      });
      const data = await res.json();
      if (data.ok && data.spunTemplate) {
        setTemplateText(data.spunTemplate);
        setPreviewSeed((s) => s + 1);
        showNotice("✨ AI đã tự động sinh biến thể Spin Text chống trùng lặp!");
      }
    } catch {
      showNotice("Không thể sinh Spin Text lúc này.", "error");
    } finally {
      setSpinningAi(false);
    }
  };

  const handleCreateCampaign = async (e) => {
    e.preventDefault();

    if (effectiveSendCount === 0) {
      showNotice("⚠️ Chưa có khách hàng nào được chọn để gửi tin (0 người)! Vui lòng tích chọn ít nhất 1 khách hàng.", "error");
      return;
    }

    if (!campaignName.trim()) {
      showNotice("Vui lòng nhập tên chiến dịch Broadcast.", "error");
      return;
    }
    if (!templateText.trim()) {
      showNotice("Vui lòng nhập nội dung tin nhắn mẫu.", "error");
      return;
    }

    try {
      setSubmitting(true);
      const customRecipientsPayload = manualSelectionActive
        ? audiencePreview.filter((c) => selectedRecipientIds.includes(String(c.id)))
        : null;
      const res = await fetch("/api/broadcast/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: campaignName.trim(),
          audienceSource,
          channel,
          channelId: selectedAccountId !== "ALL" ? selectedAccountId : channel,
          targetAccount: selectedAccountId,
          accountName,
          tags: includeTags,
          includeTags,
          excludeTags,
          operator: tagOperator,
          productFilter,
          categoryFilter,
          searchQuery: audienceSearch,
          ...(customRecipientsPayload ? { customRecipients: customRecipientsPayload } : {}),
          templateText: templateText.trim(),
          speedRange: [Math.max(45, Number(speedMin) || 45), Math.max(45, Number(speedMax) || 120)],
          useMessageTag,
          messageTag,
          useZnsTemplate,
          mockMode,
        }),
      });
      const data = await res.json();
      if (data.ok && data.campaign) {
        setSelectedCampaignId(data.campaign.id);
        setCampaignName("");
        showNotice("🚀 Đã khởi tạo chiến dịch thành công và đưa vào Hàng đợi Smart Broadcast!");
        fetchCampaigns(false);
      } else {
        showNotice(data.error || "Không thể tạo chiến dịch.", "error");
      }
    } catch {
      showNotice("Lỗi kết nối máy chủ khi tạo chiến dịch.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Hàm Gửi Thử 1 Tin Nhắn
  const handleSendTestMessage = async (e) => {
    e.preventDefault();
    if (!testTarget.trim()) {
      showNotice("Vui lòng nhập SĐT hoặc Zalo ID / FB PSID người nhận thử.", "error");
      return;
    }

    try {
      setTestLoading(true);
      setTestResult(null);
      const res = await fetch("/api/broadcast/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          target: testTarget.trim(),
          testName: testName.trim(),
          message: templateText.trim(),
          accountName,
        }),
      });
      const data = await res.json();
      setTestResult(data);
      if (data.ok) {
        if (data.mocked) {
          showNotice(
            data.message || "Chế độ An toàn (Mock): Chỉ mô phỏng gửi thử, chưa gửi thật ra ngoài.",
            "info"
          );
        } else {
          showNotice(data.message || "✓ Đã gửi thử 1 tin thành công!", "success");
        }
      } else {
        showNotice(data.error || "Không thể gửi thử tin nhắn.", "error");
      }
    } catch (err) {
      setTestResult({ ok: false, error: err.message });
      showNotice("Lỗi kết nối máy chủ khi gửi thử.", "error");
    } finally {
      setTestLoading(false);
    }
  };

  const handleCampaignAction = async (id, action) => {
    try {
      const res = await fetch(`/api/broadcast/campaigns/${encodeURIComponent(id)}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.ok) {
        const labelMap = {
          pause: "⏸️ Đã tạm dừng chiến dịch ngay lập tức.",
          resume: "▶️ Đã tiếp tục chạy hàng đợi chiến dịch.",
          start: "▶️ Đã bắt đầu chạy chiến dịch.",
          cancel: "⏹️ Đã hủy bỏ chiến dịch.",
        };
        showNotice(labelMap[action] || "Đã cập nhật trạng thái chiến dịch.");
        fetchCampaigns(true);
      }
    } catch {
      showNotice("Lỗi khi điều khiển chiến dịch.", "error");
    }
  };

  const activeCampaign = useMemo(() => {
    if (!campaigns.length) return null;
    return (
      campaigns.find((c) => String(c.id) === String(selectedCampaignId)) ||
      campaigns[0]
    );
  }, [campaigns, selectedCampaignId]);

  const phonePreviewText = useMemo(() => {
    const sampleCustomer = audiencePreview[0] || {
      fullName: "Trần Minh Tuấn",
      phone: "0912345678",
      assignedStaff: "Dược sĩ Thảo",
    };
    return renderSpinPreviewClient(templateText, {
      ...sampleCustomer,
      seed: previewSeed,
    });
  }, [templateText, audiencePreview, previewSeed]);

  return (
    <div className="space-y-6 pb-10">
      {/* Toast thông báo */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 rounded-xl border px-4 py-3 text-xs font-semibold backdrop-blur-md shadow-xl ${
            toast.type === "error"
              ? "border-rose-500/40 bg-rose-950/90 text-rose-200"
              : "border-emerald-500/40 bg-emerald-950/90 text-emerald-200"
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Gửi Tin Nhắn Hàng Loạt (Smart Broadcast) & Anti-Ban Queue
            </h1>
            <span className="rounded-full bg-blue-500/15 px-2.5 py-0.5 text-xs font-semibold text-blue-400 border border-blue-500/30">
              WBS-35 & WBS-36
            </span>
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 border border-emerald-500/30">
              🛡️ Giãn cách an toàn 45–120s/tin • Max 70 tin/ngày
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Gửi tin nhắn hàng loạt theo Danh bạ bạn bè Zalo, Khách inbox đa kênh hoặc Thẻ tag thực tế. AI Spin Text tự động đổi câu chữ chống trùng lặp và tuân thủ tuyệt đối luật Zalo & Meta 24h.
          </p>
        </div>

        {/* Thống kê nhanh hạn mức trong ngày */}
        <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-2.5">
          <div>
            <span className="text-[11px] text-slate-400 block">Hạn mức an toàn hôm nay</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-slate-900 dark:text-white">{sentToday}</span>
              <span className="text-xs text-slate-400">/ 70 tin/tài khoản</span>
            </div>
          </div>
          <div className="w-24 h-2 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${Math.min(100, Math.round((sentToday / 70) * 100))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Điều Hướng 2 Phân Hệ: Gửi Hàng Loạt vs Tự Động Trả Lời Theo Từ Khóa */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          type="button"
          onClick={() => setActiveMainTab("broadcast")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeMainTab === "broadcast"
              ? "bg-blue-600 text-white shadow-lg shadow-blue-600/25 ring-1 ring-blue-400/40"
              : "bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          }`}
        >
          <span>📢 Chiến Dịch Gửi Hàng Loạt</span>
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold">
            {campaigns.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMainTab("keyword_auto_reply")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeMainTab === "keyword_auto_reply"
              ? "bg-blue-600 text-white shadow-lg shadow-blue-600/25 ring-1 ring-blue-400/40"
              : "bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          }`}
        >
          <span>⚡ Tự Động Trả Lời Theo Từ Khóa (Auto-Reply)</span>
          <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 px-2 py-0.5 text-[10px] font-bold animate-pulse">
            Mới
          </span>
        </button>
      </div>

      {activeMainTab === "keyword_auto_reply" ? (
        <KeywordAutoReplyTab />
      ) : (
        <>
          {/* Khối chính: Cột trái Form Tạo Chiến Dịch + Cột phải Màn hình Điện thoại Xem trước */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <form
          onSubmit={handleCreateCampaign}
          className="xl:col-span-8 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-6 shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Thiết Lập Chiến Dịch Gửi Tin Nhắn Mới
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Chọn nguồn tệp khách thực tế, kênh gửi và soạn mẫu tin kèm biến thể Spin Text
              </p>
            </div>
            <div className="w-56">
              <input
                type="text"
                required
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="Nhập tên chiến dịch..."
                className="w-full rounded-xl border border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* BƯỚC 1: Chọn Kênh Gửi */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white badge-solid-white">
                1
              </span>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Bước 1: Chọn Kênh &amp; Tài Khoản Gửi Tin Nhắn
              </h3>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {[
                {
                  id: "ZALO_PERSONAL",
                  label: "Zalo Cá Nhân (QR)",
                  sub: "Danh bạ & lịch sử nick",
                  icon: "💬",
                },
                {
                  id: "ZALO_OA",
                  label: "Zalo OA Official",
                  sub: "Tin Tư vấn 48h / ZNS",
                  icon: "🏢",
                },
                {
                  id: "FACEBOOK",
                  label: "Fanpage Facebook",
                  sub: "Luật Meta 24h & Tag",
                  icon: "📘",
                },
                {
                  id: "TIKTOK_SHOP",
                  label: "TikTok Shop",
                  sub: "Khách chat & đơn hàng",
                  icon: "🎵",
                },
                {
                  id: "SHOPEE",
                  label: "Shopee",
                  sub: "Khách chat & đơn hàng",
                  icon: "🟧",
                },
              ].map((chItem) => {
                const active = channel === chItem.id;
                return (
                  <button
                    key={chItem.id}
                    type="button"
                    onClick={() => {
                      setChannel(chItem.id);
                      setSelectedAccountId("ALL");
                      setAccountName(chItem.label);
                      if (chItem.id !== "ZALO_PERSONAL" && audienceSource === "ZALO_FRIENDS") {
                        setAudienceSource("ALL_INBOX");
                      }
                    }}
                    className={`rounded-xl border p-3 text-left transition cursor-pointer ${
                      active
                        ? "border-blue-500 bg-blue-600/15 shadow-md shadow-blue-500/10"
                        : "border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 hover:border-slate-400 dark:hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-lg">{chItem.icon}</span>
                      {active && (
                        <span className="rounded-full bg-blue-500 px-2 py-0.5 text-[10px] font-bold text-white badge-solid-white">
                          Đang chọn
                        </span>
                      )}
                    </div>
                    <p className="font-bold text-xs text-slate-900 dark:text-white mt-1.5">{chItem.label}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{chItem.sub}</p>
                  </button>
                );
              })}
            </div>

            {/* Chọn Tài Khoản / Fanpage / Gian hàng cụ thể để gửi */}
            {channel === "ZALO_PERSONAL" && (
              <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                <label className="font-semibold text-slate-700 dark:text-slate-200 shrink-0">
                  👤 Chọn Nick Zalo Cá Nhân gửi tin (Sẽ lọc đúng bạn bè &amp; khách của nick này):
                </label>
                <select
                  value={selectedAccountId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedAccountId(val);
                    if (val === "ALL") {
                      setAccountName("Zalo Cá Nhân (Tất cả active)");
                    } else {
                      const found = zaloAccounts.find(
                        (a) => String(a.config?.ownId || a.externalId || a.id) === String(val)
                      );
                      setAccountName(found?.name || `Zalo #${val}`);
                    }
                  }}
                  className="w-full sm:w-80 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="ALL">Tất cả tài khoản Zalo active ({zaloAccounts.length} nick)</option>
                  {zaloAccounts.map((acc) => {
                    const accKey = String(acc.config?.ownId || acc.externalId || acc.id);
                    return (
                      <option key={acc.id || accKey} value={accKey}>
                        {acc.name || acc.displayName || accKey}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {channel === "ZALO_OA" && (
              <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                <label className="font-semibold text-slate-700 dark:text-slate-200 shrink-0">
                  🏢 Tài khoản Zalo OA gửi tin:
                </label>
                <select
                  value={selectedAccountId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedAccountId(val);
                    if (val === "ALL") {
                      setAccountName("Zalo OA Official");
                    } else {
                      const found = zaloOaAccounts.find(
                        (a) => String(a.config?.oaId || a.externalId || a.id) === String(val)
                      );
                      setAccountName(found?.name || `Zalo OA #${val}`);
                    }
                  }}
                  className="w-full sm:w-80 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="ALL">Tất cả Zalo OA đã kết nối ({zaloOaAccounts.length || 1} OA)</option>
                  {zaloOaAccounts.map((oa) => {
                    const oaKey = String(oa.config?.oaId || oa.externalId || oa.id);
                    return (
                      <option key={oa.id || oaKey} value={oaKey}>
                        {oa.name || oaKey}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {channel === "FACEBOOK" && (
              <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                <label className="font-semibold text-slate-700 dark:text-slate-200 shrink-0">
                  📘 Fanpage Facebook gửi tin:
                </label>
                <select
                  value={selectedAccountId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedAccountId(val);
                    if (val === "ALL") {
                      setAccountName("Fanpage Facebook (Tất cả)");
                    } else {
                      const found = facebookPages.find(
                        (p) => String(p.config?.pageId || p.externalId || p.id) === String(val)
                      );
                      setAccountName(found?.name || `Fanpage #${val}`);
                    }
                  }}
                  className="w-full sm:w-80 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="ALL">Tất cả Fanpage đã kết nối ({facebookPages.length} trang)</option>
                  {facebookPages.map((pg) => {
                    const pgKey = String(pg.config?.pageId || pg.externalId || pg.id);
                    return (
                      <option key={pg.id || pgKey} value={pgKey}>
                        {pg.name || pgKey}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {channel === "TIKTOK_SHOP" && (
              <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                <label className="font-semibold text-slate-700 dark:text-slate-200 shrink-0">
                  🎵 Gian hàng TikTok Shop gửi tin:
                </label>
                <select
                  value={selectedAccountId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedAccountId(val);
                    if (val === "ALL") {
                      setAccountName("TikTok Shop (Tất cả)");
                    } else {
                      const found = tiktokShops.find(
                        (s) => String(s.config?.shopId || s.externalId || s.id) === String(val)
                      );
                      setAccountName(found?.name || `TikTok Shop #${val}`);
                    }
                  }}
                  className="w-full sm:w-80 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="ALL">Tất cả gian hàng TikTok Shop ({tiktokShops.length || 1} shop)</option>
                  {tiktokShops.map((sh) => {
                    const shKey = String(sh.config?.shopId || sh.externalId || sh.id);
                    return (
                      <option key={sh.id || shKey} value={shKey}>
                        {sh.name || shKey}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {channel === "SHOPEE" && (
              <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                <label className="font-semibold text-slate-700 dark:text-slate-200 shrink-0">
                  🟧 Gian hàng Shopee gửi tin:
                </label>
                <select
                  value={selectedAccountId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedAccountId(val);
                    if (val === "ALL") {
                      setAccountName("Shopee (Tất cả)");
                    } else {
                      const found = shopeeShops.find(
                        (s) => String(s.config?.shopId || s.externalId || s.id) === String(val)
                      );
                      setAccountName(found?.name || `Shopee #${val}`);
                    }
                  }}
                  className="w-full sm:w-80 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="ALL">Tất cả gian hàng Shopee ({shopeeShops.length || 1} shop)</option>
                  {shopeeShops.map((sh) => {
                    const shKey = String(sh.config?.shopId || sh.externalId || sh.id);
                    return (
                      <option key={sh.id || shKey} value={shKey}>
                        {sh.name || shKey}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {/* Tùy chọn bảo vệ kênh Facebook 24h */}
            {channel === "FACEBOOK" && (
              <div className="rounded-xl border border-blue-500/30 bg-blue-950/20 p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                <label className="flex items-center gap-2 text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useMessageTag}
                    onChange={(e) => setUseMessageTag(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-blue-600"
                  />
                  <span>
                    Sử dụng <strong>Meta Message Tag</strong> cho khách tương tác quá 24 giờ (Nếu tắt sẽ tự động bỏ qua khách quá 24h)
                  </span>
                </label>
                {useMessageTag && (
                  <select
                    value={messageTag}
                    onChange={(e) => setMessageTag(e.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-white"
                  >
                    <option value="POST_PURCHASE_UPDATE">POST_PURCHASE_UPDATE (Cập nhật sau mua)</option>
                    <option value="CONFIRMED_EVENT_UPDATE">CONFIRMED_EVENT_UPDATE (Lịch hẹn chăm sóc)</option>
                  </select>
                )}
              </div>
            )}
          </div>

          {/* BƯỚC 2: Chọn Nguồn Tệp Khách Nhận Thực Tế (3 Chế Độ) */}
          <div className="space-y-4 border-t border-slate-800/80 pt-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white badge-solid-white">
                  2
                </span>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Bước 2: Chọn Nguồn Tệp Khách Hàng Nhận Tin (Audience Source)
                </h3>
              </div>
            </div>

            {/* 3 Tab Nguồn Tệp Thực Tế */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                {
                  id: "ZALO_FRIENDS",
                  title: "👥 Tất cả Bạn Bè Nick Zalo",
                  desc: "Quét từ Danh bạ & Lịch sử tin nhắn thật của tài khoản Zalo đã chọn",
                  badge: "Khuyên dùng cho Zalo",
                },
                {
                  id: "ALL_INBOX",
                  title: "💬 Toàn Bộ Khách Đã Từng Inbox",
                  desc: "Tất cả khách hàng đã từng nhắn tin tới Zalo, FB Fanpage, Zalo OA",
                  badge: "Toàn bộ đa kênh",
                },
                {
                  id: "BY_TAG",
                  title: "🏷️ Lọc Theo Thẻ Tag Khách Hàng",
                  desc: "Chỉ gửi cho những khách hàng đã được gắn thẻ tương ứng",
                  badge: "Theo bệnh lý / VIP",
                },
              ].map((src) => {
                const active = audienceSource === src.id;
                return (
                  <button
                    key={src.id}
                    type="button"
                    onClick={() => setAudienceSource(src.id)}
                    className={`rounded-xl border p-3.5 text-left transition cursor-pointer ${
                      active
                        ? "border-emerald-500 bg-emerald-600/15 shadow-md shadow-emerald-500/10"
                        : "border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 hover:border-slate-400 dark:hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-xs text-slate-900 dark:text-white">{src.title}</span>
                      {active && (
                        <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[9px] font-bold text-white badge-solid-white shrink-0">
                          ✓ Đang lọc
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">{src.desc}</p>
                    <span className="inline-block mt-2 text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                      {src.badge}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Bộ lọc đa tiêu chí: Sản phẩm mua, Phân loại KH, Tìm kiếm & Thẻ Tag */}
            <div className="rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 p-4 space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    📦 Lọc theo Sản phẩm đã mua:
                  </label>
                  <select
                    value={productFilter}
                    onChange={(e) => setProductFilter(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="ALL">Tất cả sản phẩm ({availableProducts.length} SP)</option>
                    {availableProducts.map((prod) => (
                      <option key={prod} value={prod}>
                        {prod}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    💎 Lọc theo Phân loại khách hàng:
                  </label>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="ALL">Tất cả phân loại ({availableCategories.length})</option>
                    {availableCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    🔍 Tìm nhanh khách hàng (Tên / SĐT / UID):
                  </label>
                  <input
                    type="text"
                    value={audienceSearch}
                    onChange={(e) => setAudienceSearch(e.target.value)}
                    placeholder="Gõ tên, SĐT hoặc mã UID..."
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Chọn Thẻ Khách Hàng Cần Gửi (Include Tags - Luôn mở cho mọi chế độ) */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    🏷️ Lọc theo Thẻ Khách Hàng (Include Tags):
                  </span>
                  <div className="flex items-center gap-2 text-xs">
                    {includeTags.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setIncludeTags([])}
                        className="text-[11px] text-rose-500 hover:underline cursor-pointer mr-2"
                      >
                        Xóa lọc thẻ ({includeTags.length})
                      </button>
                    )}
                    <span className="text-slate-500 dark:text-slate-400 text-[11px]">Toán tử khớp thẻ:</span>
                    <button
                      type="button"
                      onClick={() => setTagOperator("OR")}
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold border cursor-pointer ${
                        tagOperator === "OR"
                          ? "bg-blue-600 text-white border-blue-500"
                          : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-800"
                      }`}
                    >
                      HOẶC (OR)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTagOperator("AND")}
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold border cursor-pointer ${
                        tagOperator === "AND"
                          ? "bg-blue-600 text-white border-blue-500"
                          : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-800"
                      }`}
                    >
                      VÀ (AND)
                    </button>
                  </div>
                </div>

                {availableTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {availableTags.map((tag) => {
                      const selected = includeTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleIncludeTag(tag)}
                          className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition flex items-center gap-1 cursor-pointer ${
                            selected
                              ? "border-blue-600 bg-blue-600 text-white shadow-xs"
                              : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-blue-400"
                          }`}
                        >
                          <span>{selected ? "✓" : "+"}</span>
                          <span>{tag}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Danh sách thẻ loại trừ (Exclude Tags) */}
            <div className="rounded-xl border border-rose-500/30 bg-rose-50 dark:bg-rose-950/15 p-3.5 space-y-2">
              <span className="text-xs font-semibold text-rose-700 dark:text-rose-300 block">
                🚫 Tự động loại trừ khách mang các thẻ sau (Exclude Tags):
              </span>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_EXCLUDE_OPTIONS.map((tag) => {
                  const selected = excludeTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleExcludeTag(tag)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                        selected
                          ? "border-rose-500 bg-rose-600 text-white shadow-xs"
                          : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900"
                      }`}
                    >
                      <span>{selected ? "✕" : "+"}</span>
                      <span>{tag}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Hộp Thống kê tệp nhận & Cảnh báo tệp rỗng */}
            {audienceCount === 0 && !loadingAudience ? (
              <div className="rounded-xl border border-rose-500/40 bg-rose-50 dark:bg-rose-950/30 p-4 space-y-2">
                <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 font-bold text-xs">
                  <span>⚠️ CẢNH BÁO: Tệp người nhận hiện tại có 0 khách hàng!</span>
                </div>
                <p className="text-[12px] text-rose-600 dark:text-rose-200 leading-relaxed">
                  Không tìm thấy khách hàng nào của tài khoản đang chọn thỏa mãn điều kiện lọc. Vui lòng đổi nguồn tệp hoặc xóa bớt bộ lọc thẻ / sản phẩm.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-50/70 dark:bg-emerald-950/20 p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                      📊 Thống kê tệp khách của tài khoản đang chọn:
                    </span>
                    <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                      {loadingAudience
                        ? "Đang quét..."
                        : manualSelectionActive
                        ? `Đã tích chọn ${selectedRecipientIds.length} / ${audienceCount} khách hàng`
                        : `${audienceCount} khách hàng hợp lệ`}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 dark:text-slate-400">
                    <span>💬 Zalo: <strong className="text-cyan-700 dark:text-cyan-300">{channelBreakdown.zalo}</strong></span>
                    <span>•</span>
                    <span>📘 Messenger: <strong className="text-blue-700 dark:text-blue-300">{channelBreakdown.messenger}</strong></span>
                    <span>•</span>
                    <span>🏢 Zalo OA: <strong className="text-sky-700 dark:text-sky-300">{channelBreakdown.zaloOa}</strong></span>
                    {(channelBreakdown.tiktok > 0 || channelBreakdown.shopee > 0) && (
                      <>
                        <span>•</span>
                        <span>🎵 TikTok: <strong>{channelBreakdown.tiktok || 0}</strong></span>
                        <span>•</span>
                        <span>🟧 Shopee: <strong>{channelBreakdown.shopee || 0}</strong></span>
                      </>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowPreviewDrawer(!showPreviewDrawer)}
                  className="rounded-xl border border-emerald-600 bg-emerald-600 hover:bg-emerald-500 px-3.5 py-2 text-xs font-bold text-white transition cursor-pointer shrink-0 shadow-xs"
                >
                  {showPreviewDrawer
                    ? "Thu gọn bảng chọn khách hàng"
                    : `☑️ Mở bảng chọn thủ công (${audiencePreview.length} khách)`}
                </button>
              </div>
            )}

            {/* Bảng danh sách khách hàng & tích chọn thủ công bằng tay */}
            {showPreviewDrawer && (
              <div className="rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 p-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800 text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllPreview}
                      className="rounded-lg border border-blue-500 bg-blue-50 dark:bg-blue-950/50 px-2.5 py-1 text-[11px] font-bold text-blue-700 dark:text-blue-300 hover:bg-blue-100 cursor-pointer"
                    >
                      ✓ Chọn tất cả ({audienceCount})
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAllPreview}
                      className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 cursor-pointer"
                    >
                      ✕ Bỏ chọn tất cả (Tích tay từng người)
                    </button>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    Đang chọn gửi:{" "}
                    <strong className="text-blue-600 dark:text-blue-400">{effectiveSendCount}</strong> khách hàng
                  </span>
                </div>

                {audiencePreview.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-4">
                    Không có khách hàng nào trong tệp này.
                  </p>
                ) : (
                  <>
                    <div className="overflow-x-auto max-h-80 overflow-y-auto">
                      <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                        <thead className="sticky top-0 bg-slate-100 dark:bg-slate-900 z-10">
                          <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-[11px]">
                            <th className="py-2 px-2 w-8">Chọn</th>
                            <th className="py-2 px-2">Họ và tên</th>
                            <th className="py-2 px-2">SĐT / UID</th>
                            <th className="py-2 px-2">Tài khoản / Kênh</th>
                            <th className="py-2 px-2">Sản phẩm / Phân loại</th>
                            <th className="py-2 px-2">Thẻ tag</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                          {audiencePreview
                            .slice((previewPage - 1) * previewPageSize, previewPage * previewPageSize)
                            .map((cust) => {
                              const isChecked =
                                !manualSelectionActive ||
                                selectedRecipientIds.includes(String(cust.id));
                              return (
                                <tr
                                  key={cust.id}
                                  onClick={() => toggleSelectRecipient(cust.id)}
                                  className={`hover:bg-slate-50 dark:hover:bg-slate-900/50 cursor-pointer ${
                                    isChecked ? "bg-blue-50/40 dark:bg-blue-950/15" : ""
                                  }`}
                                >
                                  <td className="py-2 px-2" onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => toggleSelectRecipient(cust.id)}
                                      className="rounded border-slate-400 text-blue-600 cursor-pointer"
                                    />
                                  </td>
                                  <td className="py-2 px-2 font-semibold text-slate-900 dark:text-white">
                                    {cust.fullName}
                                  </td>
                                  <td className="py-2 px-2 font-mono text-emerald-700 dark:text-emerald-400">
                                    {cust.maskedPhone}
                                  </td>
                                  <td className="py-2 px-2 text-[11px] text-slate-600 dark:text-slate-400">
                                    {cust.channel}
                                  </td>
                                  <td className="py-2 px-2 text-[11px]">
                                    <span className="rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 text-[10px] font-semibold mr-1">
                                      {cust.category || "Khách hàng"}
                                    </span>
                                    {(cust.purchasedProducts || []).slice(0, 2).map((p) => (
                                      <span
                                        key={p}
                                        className="rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 px-1.5 py-0.5 text-[10px] mr-1"
                                      >
                                        {p}
                                      </span>
                                    ))}
                                  </td>
                                  <td className="py-2 px-2">
                                    <div className="flex flex-wrap gap-1">
                                      {(cust.tags || []).map((t) => (
                                        <span
                                          key={t}
                                          className="rounded px-1.5 py-0.5 text-[9px] bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                                        >
                                          {t}
                                        </span>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>

                    {audiencePreview.length > previewPageSize && (
                      <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                        <span className="text-slate-500">
                          Trang {previewPage} / {Math.ceil(audiencePreview.length / previewPageSize)} (Hiển thị {audiencePreview.length} khách)
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={previewPage <= 1}
                            onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                            className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
                          >
                            ← Trước
                          </button>
                          <button
                            type="button"
                            disabled={previewPage >= Math.ceil(audiencePreview.length / previewPageSize)}
                            onClick={() =>
                              setPreviewPage((p) =>
                                Math.min(Math.ceil(audiencePreview.length / previewPageSize), p + 1)
                              )
                            }
                            className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
                          >
                            Sau →
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* BƯỚC 3: Mẫu Tin Nhắn & AI Spin Text */}
          <div className="space-y-3 border-t border-slate-800/80 pt-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                  3
                </span>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Bước 3: Mẫu Tin Nhắn Cá Nhân Hóa & AI Spin Text
                </h3>
              </div>

              <button
                type="button"
                disabled={spinningAi}
                onClick={handleAiGenerateSpin}
                className="rounded-xl border border-purple-500/40 bg-purple-600/20 hover:bg-purple-600/30 px-3 py-1.5 text-xs font-bold text-purple-200 transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <span>✨</span>
                <span>{spinningAi ? "AI Đang sinh Spin Text..." : "AI Tự Động Sinh Biến Thể Spin"}</span>
              </button>
            </div>

            {/* Các biến chèn nhanh */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[11px] text-slate-400 mr-1">Chèn biến nhanh:</span>
              {[
                { label: "{fullName}", desc: "Họ và tên khách" },
                { label: "{firstName}", desc: "Tên gọi" },
                { label: "{phone}", desc: "SĐT" },
                { label: "{assignedStaff}", desc: "Dược sĩ phụ trách" },
                { label: "{productName}", desc: "Tên sản phẩm" },
              ].map((b) => (
                <button
                  key={b.label}
                  type="button"
                  onClick={() => insertTokenToTemplate(b.label)}
                  className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-0.5 text-[11px] font-mono text-blue-400 hover:border-blue-500 hover:text-white cursor-pointer"
                  title={b.desc}
                >
                  {b.label}
                </button>
              ))}
            </div>

            <textarea
              rows={4}
              required
              value={templateText}
              onChange={(e) => setTemplateText(e.target.value)}
              placeholder="Nhập nội dung tin nhắn có biến thể Spin dạng {a|b|c} và {fullName}..."
              className="w-full rounded-xl border border-slate-700 bg-white dark:bg-slate-950 p-3 text-xs text-slate-900 dark:text-white leading-relaxed focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* BƯỚC 4: Tốc Độ Giãn Cách & Khởi Chạy */}
          <div className="space-y-4 border-t border-slate-800/80 pt-5">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                4
              </span>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Bước 4: Cấu Hình Hàng Đợi An Toàn & Khởi Chạy
              </h3>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
                <div>
                  <span className="font-semibold text-slate-200">
                    ⏱️ Giãn cách ngẫu nhiên giữa 2 tin liên tiếp (Anti-Ban):
                  </span>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Hệ thống sẽ random độ trễ trong khoảng này để mô phỏng hoàn toàn hành vi người thật
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={30}
                    max={300}
                    value={speedMin}
                    onChange={(e) => setSpeedMin(e.target.value)}
                    className="w-16 rounded-lg border border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-center font-mono text-xs text-slate-900 dark:text-white"
                  />
                  <span className="text-slate-400">đến</span>
                  <input
                    type="number"
                    min={45}
                    max={600}
                    value={speedMax}
                    onChange={(e) => setSpeedMax(e.target.value)}
                    className="w-16 rounded-lg border border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-center font-mono text-xs text-slate-900 dark:text-white"
                  />
                  <span className="text-slate-400">giây / tin</span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs pt-2 border-t border-slate-800">
                <label className="flex items-center gap-2 text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mockMode}
                    onChange={(e) => setMockMode(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-blue-600"
                  />
                  <span>
                    Chạy chế độ <strong>Mock Send (Kiểm thử mô phỏng không gửi tin thật ra ngoài)</strong>
                  </span>
                </label>
              </div>
            </div>

            {/* Các nút hành động chính */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              {/* Nút Gửi Thử 1 Tin */}
              <button
                type="button"
                onClick={() => {
                  setTestResult(null);
                  setShowTestModal(true);
                }}
                className="rounded-xl border border-purple-300 bg-purple-50 hover:bg-purple-100 px-4 py-2.5 text-xs font-bold text-purple-800 transition cursor-pointer flex items-center gap-2 shadow-sm"
              >
                <span>🧪</span>
                <span>Gửi Thử 1 Tin Đến Tôi / SĐT Chỉ Định</span>
              </button>

              {/* Nút Khởi Chạy Toàn Bộ Chiến Dịch */}
              <button
                type="submit"
                disabled={submitting || effectiveSendCount === 0}
                title={effectiveSendCount === 0 ? "Chưa chọn khách nhận nào, không thể gửi" : ""}
                className={`rounded-xl px-6 py-2.5 text-xs font-bold text-white shadow-lg transition cursor-pointer flex items-center gap-2 ${
                  effectiveSendCount === 0
                    ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
                    : "bg-blue-600 hover:bg-blue-500 shadow-blue-600/30"
                }`}
              >
                <span>🚀</span>
                <span>
                  {submitting
                    ? "Đang khởi tạo hàng đợi..."
                    : effectiveSendCount === 0
                    ? "Chưa Chọn Khách (0 người) - Không Thể Gửi"
                    : `Khởi Chạy Chiến Dịch (${effectiveSendCount} khách)`}
                </span>
              </button>
            </div>
          </div>
        </form>

        {/* Cột phải: Hộp Preview Tin Nhắn Trên Màn Hình Điện Thoại */}
        <div className="xl:col-span-4 flex flex-col">
          <div className="rounded-3xl border-4 border-slate-800 bg-slate-950 p-4 shadow-2xl flex-1 flex flex-col justify-between max-w-sm w-full mx-auto">
            {/* Tai thỏ điện thoại */}
            <div>
              <div className="mx-auto mb-3 h-1.5 w-20 rounded-full bg-slate-800" />
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 px-2">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white">
                    AD
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-[150px]">{accountName}</p>
                    <p className="text-[10px] text-emerald-400">● Đang hoạt động</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewSeed((s) => s + 1)}
                  className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-[10px] font-semibold text-blue-400 hover:text-white cursor-pointer"
                >
                  🔄 Đổi biến thể Spin
                </button>
              </div>

              {/* Bong bóng tin nhắn xem trước */}
              <div className="p-3 space-y-3 mt-2">
                <div className="text-center">
                  <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-[10px] text-slate-500">
                    Xem trước tin nhắn thực tế gửi khách
                  </span>
                </div>

                <div className="ml-auto max-w-[92%] rounded-2xl rounded-tr-xs bg-blue-600 p-3.5 text-xs text-white leading-relaxed shadow-md">
                  <p>{phonePreviewText}</p>
                  <span className="block text-right text-[10px] text-blue-200 mt-1.5">
                    Vừa xong ✓✓
                  </span>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-3 px-2 text-[11px] text-slate-400 space-y-1">
              <div className="flex justify-between">
                <span>Biến thể Spin hiện tại:</span>
                <span className="text-purple-400 font-semibold">Phiên bản #{previewSeed + 1}</span>
              </div>
              <div className="flex justify-between">
                <span>Giãn cách Anti-Ban:</span>
                <span className="text-emerald-400 font-mono">
                  {speedMin}s – {speedMax}s / tin
                </span>
              </div>
              <div className="flex justify-between">
                <span>Tệp người nhận:</span>
                <span className="text-white font-semibold">
                  {audienceCount} người ({audienceSource === "ZALO_FRIENDS" ? "Bạn bè Zalo" : audienceSource === "ALL_INBOX" ? "Đa kênh" : "Theo thẻ"})
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BẢNG THEO DÕI TIẾN ĐỘ CHIẾN DỊCH ĐANG CHẠY (Realtime Campaign Monitor) */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Bảng Theo Dõi Tiến Độ Chiến Dịch Đang Chạy (Realtime Campaign Monitor)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Giám sát tiến trình gửi từng tin nhắn, thời gian đếm ngược giãn cách và nhật ký chi tiết
            </p>
          </div>

          {campaigns.length > 0 && (
            <select
              value={activeCampaign?.id || ""}
              onChange={(e) => setSelectedCampaignId(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-white"
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.sentCount}/{c.totalRecipients} tin - {c.status})
                </option>
              ))}
            </select>
          )}
        </div>

        {loading ? (
          <div className="py-10 text-center text-xs text-slate-400">
            Đang tải dữ liệu giám sát chiến dịch...
          </div>
        ) : !activeCampaign ? (
          <div className="py-10 text-center text-xs text-slate-500">
            Chưa có chiến dịch nào trong hàng đợi. Hãy khởi tạo chiến dịch ở khung phía trên.
          </div>
        ) : (
          <div className="space-y-5">
            {/* Thanh Progress Bar & Các nút điều khiển */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950/90 p-4 space-y-3">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                      {activeCampaign.name}
                    </span>
                    <span className="rounded-md bg-blue-500/15 border border-blue-500/30 px-2 py-0.5 text-[10px] font-semibold text-blue-300">
                      {activeCampaign.accountName || activeCampaign.channel}
                    </span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                        activeCampaign.status === "RUNNING"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : activeCampaign.status === "PAUSED"
                          ? "bg-amber-500/20 text-amber-300"
                          : activeCampaign.status === "CANCELLED"
                          ? "bg-rose-500/20 text-rose-300"
                          : activeCampaign.status === "COMPLETED"
                          ? "bg-blue-500/20 text-blue-300"
                          : "bg-slate-500/20 text-slate-300"
                      }`}
                    >
                      {activeCampaign.status}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 mt-1 font-mono">
                    Đã gửi {activeCampaign.sentCount}/{activeCampaign.totalRecipients} tin (
                    {activeCampaign.totalRecipients > 0
                      ? Math.round((activeCampaign.sentCount / activeCampaign.totalRecipients) * 100)
                      : 0}
                    %)
                    {activeCampaign.status === "RUNNING" && activeCampaign.nextSendInSec
                      ? ` — ⏳ Đang chờ ${activeCampaign.nextSendInSec}s gửi tin tiếp theo`
                      : activeCampaign.pauseReason
                      ? ` — ⚠️ ${activeCampaign.pauseReason}`
                      : ""}
                  </p>
                </div>

                {/* Các nút thao tác điều khiển */}
                <div className="flex items-center gap-2">
                  {activeCampaign.status === "RUNNING" && (
                    <button
                      type="button"
                      onClick={() => handleCampaignAction(activeCampaign.id, "pause")}
                      className="rounded-xl border border-amber-500/40 bg-amber-500/20 hover:bg-amber-500/30 px-3.5 py-2 text-xs font-bold text-amber-200 transition cursor-pointer"
                    >
                      ⏸️ Tạm Dừng
                    </button>
                  )}

                  {(activeCampaign.status === "PAUSED" || activeCampaign.status === "DRAFT") && (
                    <button
                      type="button"
                      onClick={() => handleCampaignAction(activeCampaign.id, "resume")}
                      className="rounded-xl border border-emerald-500/40 bg-emerald-500/20 hover:bg-emerald-500/30 px-3.5 py-2 text-xs font-bold text-emerald-200 transition cursor-pointer"
                    >
                      ▶️ Tiếp Tục
                    </button>
                  )}

                  {activeCampaign.status !== "CANCELLED" &&
                    activeCampaign.status !== "COMPLETED" && (
                      <button
                        type="button"
                        onClick={() => handleCampaignAction(activeCampaign.id, "cancel")}
                        className="rounded-xl border border-rose-500/40 bg-rose-500/20 hover:bg-rose-500/30 px-3.5 py-2 text-xs font-bold text-rose-200 transition cursor-pointer"
                      >
                        ⏹️ Hủy Bỏ
                      </button>
                    )}
                </div>
              </div>

              {/* Thanh Progress Bar */}
              <div className="h-2.5 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${
                      activeCampaign.totalRecipients > 0
                        ? Math.round((activeCampaign.sentCount / activeCampaign.totalRecipients) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            {/* Bảng Log Chi Tiết Từng Tin Nhắn Thực Tế */}
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950 text-slate-400 text-[11px] uppercase">
                    <th className="py-3 px-4">Thời gian</th>
                    <th className="py-3 px-4">Tên khách hàng</th>
                    <th className="py-3 px-4">SĐT / UID</th>
                    <th className="py-3 px-4">Kênh</th>
                    <th className="py-3 px-4">Nội dung Spin đã gửi</th>
                    <th className="py-3 px-4">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {(activeCampaign.logs || []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        Chưa có nhật ký gửi tin cho chiến dịch này.
                      </td>
                    </tr>
                  ) : (
                    (activeCampaign.logs || []).map((log) => (
                      <tr key={log.id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-4 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                          {log.timestamp
                            ? new Date(log.timestamp).toLocaleTimeString("vi-VN")
                            : "--:--"}
                        </td>
                        <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-white">
                          {log.customerName}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-emerald-400">
                          {log.maskedPhone || log.phone || (log.recipientId ? `UID: ${log.recipientId.slice(-4)}` : "Chưa có")}
                        </td>
                        <td className="py-2.5 px-4 text-slate-300">{log.channel}</td>
                        <td className="py-2.5 px-4 max-w-md truncate text-slate-300" title={log.renderedText}>
                          {log.renderedText || log.note}
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          {log.status === "SUCCESS" ? (
                            <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                              ✓ Thành công
                            </span>
                          ) : log.status === "SKIPPED" ? (
                            <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                              ⚠️ {log.note || "Bỏ qua"}
                            </span>
                          ) : (
                            <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300" title={log.error}>
                              ✕ Lỗi: {log.error || "Gửi thất bại"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      </>
      )}

      {/* MODAL POPUP: GỬI THỬ 1 TIN NHẮN (TEST SEND MODAL) */}
      {showTestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">🧪</span>
                <h3 className="font-bold text-sm text-white">Gửi Thử 1 Tin Nhắn Broadcast</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTestModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSendTestMessage} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Kênh gửi thử:
                </label>
                <div className="rounded-lg border border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white">
                  {accountName} ({channel})
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Số điện thoại hoặc Zalo ID / FB PSID người nhận thử:
                </label>
                <input
                  type="text"
                  required
                  value={testTarget}
                  onChange={(e) => setTestTarget(e.target.value)}
                  placeholder="VD: 0912345678 hoặc Zalo UID 720430069894969208..."
                  className="w-full rounded-xl border border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Tên xưng hô của người nhận (để thay biến {"{fullName}"}):
                </label>
                <input
                  type="text"
                  value={testName}
                  onChange={(e) => setTestName(e.target.value)}
                  placeholder="VD: Sơn Tùng, Anh Tuấn..."
                  className="w-full rounded-xl border border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white focus:border-purple-500 focus:outline-none"
                />
              </div>

              {/* Hộp xem trước tin gửi thử */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-1">
                <span className="text-[11px] font-semibold text-slate-400 block">
                  Nội dung sẽ gửi thử (đã Spin):
                </span>
                <p className="text-xs text-slate-200 leading-relaxed italic">
                  "{renderSpinPreviewClient(templateText, { fullName: testName, phone: testTarget })}"
                </p>
              </div>

              {/* Hiển thị kết quả test */}
              {testResult && (
                <div
                  className={`rounded-xl border p-3 text-xs leading-relaxed ${
                    testResult.ok
                      ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-300"
                      : "border-rose-500/40 bg-rose-950/30 text-rose-300"
                  }`}
                >
                  <p className="font-bold">{testResult.ok ? "✓ GỬI THÀNH CÔNG!" : "✕ GỬI THẤT BÀI:"}</p>
                  <p className="mt-1">{testResult.message || testResult.error}</p>
                  {testResult.renderedText && (
                    <p className="mt-2 text-[11px] opacity-80 font-mono">
                      Nội dung: "{testResult.renderedText}"
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowTestModal(false)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={testLoading}
                  className="rounded-xl bg-purple-600 hover:bg-purple-500 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-purple-600/30 transition cursor-pointer disabled:opacity-50"
                >
                  {testLoading ? "Đang gửi thử..." : "🚀 Bắn Tin Thử Ngay"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
