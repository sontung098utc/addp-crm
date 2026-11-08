"use client";

import { useState, useEffect, useMemo } from "react";

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
  "Đã Hủy Đơn": "bg-red-500/20 text-red-300 border-red-500/40",
  "Khiếu Nại": "bg-red-600/20 text-red-300 border-red-500/40",
  "Dừng Chăm Sóc": "bg-slate-600/30 text-slate-300 border-slate-500/40",
};

const DEFAULT_INCLUDE_OPTIONS = [
  "Tiểu Đường Tuýp 2",
  "Tiền Tiểu Đường",
  "Men Gan Cao",
  "Gan Nhiễm Mỡ",
  "VIP",
  "Đã Mua Glucare Plus",
  "Đã Mua Dovital",
  "Zalo Cá Nhân",
  "Fanpage FB",
  "Zalo OA",
  "Khách Mới",
];

const DEFAULT_EXCLUDE_OPTIONS = [
  "Đã Hủy Đơn",
  "Khiếu Nại",
  "Dừng Chăm Sóc",
];

function renderSpinPreviewClient(template = "", sample = {}) {
  let text = String(template || "");
  const fullName = sample.fullName || "Nguyễn Thị Lan";
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts[parts.length - 1] || "Lan";
  const phone = sample.phone || "0912345678";
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
  const [campaigns, setCampaigns] = useState([]);
  const [sentToday, setSentToday] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);
  const [toast, setToast] = useState(null);

  // State cho Form Tạo Chiến Dịch 4 Bước
  const [campaignName, setCampaignName] = useState("");
  const [channel, setChannel] = useState("ZALO_PERSONAL");
  const [accountName, setAccountName] = useState("Zalo Cá Nhân Sơn Tùng");
  const [includeTags, setIncludeTags] = useState(["Tiểu Đường Tuýp 2"]);
  const [excludeTags, setExcludeTags] = useState([
    "Đã Hủy Đơn",
    "Khiếu Nại",
    "Dừng Chăm Sóc",
  ]);
  const [tagOperator, setTagOperator] = useState("OR");
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

  // State cho Bộ lọc & Đếm trước Tệp Khách Nhận (Module 1)
  const [audienceCount, setAudienceCount] = useState(0);
  const [audiencePreview, setAudiencePreview] = useState([]);
  const [channelBreakdown, setChannelBreakdown] = useState({
    zalo: 0,
    messenger: 0,
    zaloOa: 0,
  });
  const [showPreviewDrawer, setShowPreviewDrawer] = useState(false);
  const [loadingAudience, setLoadingAudience] = useState(false);

  const showNotice = (text, type = "success") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
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

  // Tự động đếm tệp khách nhận mỗi khi thay đổi Thẻ hoặc Kênh (Module 1)
  useEffect(() => {
    let cancelled = false;
    async function countAudience() {
      try {
        setLoadingAudience(true);
        const res = await fetch("/api/broadcast/audience", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            includeTags,
            excludeTags,
            channel,
            operator: tagOperator,
          }),
        });
        const data = await res.json();
        if (!cancelled && data.ok) {
          setAudienceCount(Number(data.totalCount) || 0);
          setAudiencePreview(Array.isArray(data.previewList) ? data.previewList : []);
          if (data.channelBreakdown) {
            setChannelBreakdown(data.channelBreakdown);
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
  }, [includeTags, excludeTags, channel, tagOperator]);

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
          sampleName: audiencePreview[0]?.fullName || "Nguyễn Thị Lan",
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
      const res = await fetch("/api/broadcast/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: campaignName.trim(),
          channel,
          channelId: channel,
          accountName,
          tags: includeTags,
          includeTags,
          excludeTags,
          operator: tagOperator,
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
        showNotice("🚀 Đã khởi tạo chiến dịch và đưa vào Hàng đợi Smart Broadcast!");
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
      fullName: "Nguyễn Thị Lan",
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
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Smart BroadcastTheo Thẻ Khách Hàng & Anti-Ban Queue
            </h1>
            <span className="rounded-full bg-blue-500/15 px-2.5 py-0.5 text-xs font-semibold text-blue-400 border border-blue-500/30">
              WBS-35 & WBS-36
            </span>
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 border border-emerald-500/30">
              🛡️ Giãn cách an toàn 45–120s/tin • Max 150 tin/ngày
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Lọc chính xác tệp khách theo Thẻ bệnh lý (Include / Exclude Tags), AI Spin Text biến hóa câu chữ chống lọc spam và tự động kiểm tra quy tắc Zalo / Meta 24h.
          </p>
        </div>

        {/* Thống kê nhanh hạn mức trong ngày */}
        <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-2.5">
          <div>
            <span className="text-[11px] text-slate-400 block">Hạn mức an toàn hôm nay</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-white">{sentToday}</span>
              <span className="text-xs text-slate-400">/ 150 tin/tài khoản</span>
            </div>
          </div>
          <div className="w-24 h-2 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${Math.min(100, Math.round((sentToday / 150) * 100))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Khối chính: Cột trái Form 4 Bước Tạo Chiến Dịch + Cột phải Màn hình Điện thoại Xem trước */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <form
          onSubmit={handleCreateCampaign}
          className="xl:col-span-8 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-6 shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-white">
                Thiết Lập Chiến Dịch Gửi Tin Hàng Loạt Mới
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Hoàn thành 4 bước dưới đây để đưa chiến dịch vào hàng đợi thông minh SmartBroadcastQueue
              </p>
            </div>
            <div className="w-64">
              <input
                type="text"
                required
                placeholder="Nhập tên chiến dịch... *"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* BƯỚC 1: Chọn Kênh Gửi */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                1
              </span>
              <h3 className="text-sm font-bold text-white">
                Bước 1: Chọn Kênh Gửi Tin Nhắn
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                {
                  id: "ZALO_PERSONAL",
                  label: "Zalo Cá Nhân Sơn Tùng",
                  sub: "Chỉ gửi khách đã có hội thoại (zca-js)",
                  icon: "💬",
                },
                {
                  id: "ZALO_OA",
                  label: "Zalo OA Dược Phẩm ADDP",
                  sub: "Tin Tư vấn 48h hoặc ZNS Template",
                  icon: "🏢",
                },
                {
                  id: "FACEBOOK",
                  label: "Fanpage FB Dược Phẩm ADDP",
                  sub: "Luật Meta 24h & Message Tag",
                  icon: "📘",
                },
              ].map((chItem) => {
                const active = channel === chItem.id;
                return (
                  <button
                    key={chItem.id}
                    type="button"
                    onClick={() => {
                      setChannel(chItem.id);
                      setAccountName(chItem.label);
                    }}
                    className={`rounded-xl border p-3.5 text-left transition cursor-pointer ${
                      active
                        ? "border-blue-500 bg-blue-600/15 shadow-md shadow-blue-500/10"
                        : "border-slate-800 bg-slate-950/60 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-lg">{chItem.icon}</span>
                      {active && (
                        <span className="rounded-full bg-blue-500 px-2 py-0.5 text-[10px] font-bold text-white">
                          Đang chọn
                        </span>
                      )}
                    </div>
                    <p className="font-bold text-xs text-white mt-2">{chItem.label}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{chItem.sub}</p>
                  </button>
                );
              })}
            </div>

            {/* Tùy chọn bảo vệ kênh nâng cao (Facebook 24h / Zalo OA ZNS) */}
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

            {channel === "ZALO_OA" && (
              <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-3 flex items-center justify-between text-xs">
                <label className="flex items-center gap-2 text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useZnsTemplate}
                    onChange={(e) => setUseZnsTemplate(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-sky-600"
                  />
                  <span>
                    Gửi qua mẫu <strong>ZNS Template đã duyệt</strong> nếu khách quá hạn tương tác 48h trên Zalo OA
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* BƯỚC 2: Bộ Lọc Thẻ Khách Hàng (Multi-select Tags) */}
          <div className="space-y-3 border-t border-slate-800/80 pt-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                  2
                </span>
                <h3 className="text-sm font-bold text-white">
                  Bước 2: Bộ Lọc Thẻ Khách Hàng (Include & Exclude Tags)
                </h3>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">Điều kiện khớp thẻ:</span>
                <button
                  type="button"
                  onClick={() => setTagOperator("OR")}
                  className={`px-2.5 py-1 rounded-lg font-semibold border cursor-pointer ${
                    tagOperator === "OR"
                      ? "bg-blue-600 text-white border-blue-500"
                      : "bg-slate-950 text-slate-400 border-slate-800"
                  }`}
                >
                  HOẶC (OR)
                </button>
                <button
                  type="button"
                  onClick={() => setTagOperator("AND")}
                  className={`px-2.5 py-1 rounded-lg font-semibold border cursor-pointer ${
                    tagOperator === "AND"
                      ? "bg-blue-600 text-white border-blue-500"
                      : "bg-slate-950 text-slate-400 border-slate-800"
                  }`}
                >
                  VÀ (AND)
                </button>
              </div>
            </div>

            {/* Danh sách thẻ cần gửi (Include Tags) */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">
                  ✅ Chọn danh sách Thẻ Khách Hàng cần gửi (Include Tags):
                </span>
                {includeTags.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIncludeTags([])}
                    className="text-[11px] text-blue-400 hover:underline cursor-pointer"
                  >
                    Chọn tất cả (Xóa lọc thẻ)
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_INCLUDE_OPTIONS.map((tag) => {
                  const selected = includeTags.includes(tag);
                  const badgeStyle =
                    TAG_BADGE_STYLES[tag] ||
                    "bg-slate-800 text-slate-300 border-slate-700";
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleIncludeTag(tag)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                        selected
                          ? `${badgeStyle} ring-2 ring-blue-500/60`
                          : "border-slate-800 bg-slate-900/80 text-slate-400 opacity-65 hover:opacity-100"
                      }`}
                    >
                      <span>{selected ? "✓" : "+"}</span>
                      <span>{tag}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Danh sách thẻ loại trừ (Exclude Tags) */}
            <div className="rounded-xl border border-rose-500/20 bg-rose-950/10 p-3.5 space-y-2">
              <span className="text-xs font-semibold text-rose-300 block">
                🚫 Loại trừ khách hàng có các thẻ sau (Exclude Tags):
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
                          ? "border-rose-500/50 bg-rose-500/20 text-rose-200"
                          : "border-slate-800 bg-slate-900/60 text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      <span>{selected ? "✕" : "+"}</span>
                      <span>{tag}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Hộp Thống kê tệp nhận & Nút Xem danh sách xem trước */}
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-emerald-300">
                    📊 Thống kê tệp nhận:
                  </span>
                  <span className="text-sm font-extrabold text-white">
                    Đã chọn: {loadingAudience ? "..." : audienceCount} khách hàng hợp lệ
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-slate-400">
                  <span>💬 Có Zalo: <strong className="text-cyan-300">{channelBreakdown.zalo}</strong></span>
                  <span>•</span>
                  <span>📘 Có Messenger: <strong className="text-blue-300">{channelBreakdown.messenger}</strong></span>
                  <span>•</span>
                  <span>🏢 Có Zalo OA: <strong className="text-sky-300">{channelBreakdown.zaloOa}</strong></span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowPreviewDrawer(!showPreviewDrawer)}
                className="rounded-xl border border-emerald-500/40 bg-emerald-600/20 hover:bg-emerald-600/30 px-3.5 py-2 text-xs font-bold text-emerald-200 transition cursor-pointer shrink-0"
              >
                {showPreviewDrawer ? "Ẩn danh sách xem trước" : "👁️ Xem danh sách xem trước (Top 10)"}
              </button>
            </div>

            {/* Bảng xem trước 10 khách đầu tiên */}
            {showPreviewDrawer && (
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 overflow-x-auto">
                {audiencePreview.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">
                    Chưa có khách hàng nào trong CSDL khớp với bộ lọc thẻ hiện tại.
                  </p>
                ) : (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                        <th className="py-2 px-3">Họ tên khách hàng</th>
                        <th className="py-2 px-3">SĐT (Che bảo mật)</th>
                        <th className="py-2 px-3">Thẻ Tags</th>
                        <th className="py-2 px-3">Nhân viên phụ trách</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-200">
                      {audiencePreview.map((cust) => (
                        <tr key={cust.id}>
                          <td className="py-2 px-3 font-semibold">{cust.fullName}</td>
                          <td className="py-2 px-3 font-mono text-emerald-400">
                            {cust.maskedPhone}
                          </td>
                          <td className="py-2 px-3">
                            <div className="flex flex-wrap gap-1">
                              {(cust.tags || []).map((t) => (
                                <span
                                  key={t}
                                  className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-slate-400">{cust.assignedStaff}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>

          {/* BƯỚC 3: Soạn Nội Dung Tin Nhắn & Xem Trước Spin Text */}
          <div className="space-y-3 border-t border-slate-800/80 pt-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                  3
                </span>
                <h3 className="text-sm font-bold text-white">
                  Bước 3: Soạn Nội Dung Tin Nhắn & AI Spin Text
                </h3>
              </div>

              <button
                type="button"
                onClick={handleAiGenerateSpin}
                disabled={spinningAi}
                className="rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-md transition cursor-pointer disabled:opacity-50"
              >
                {spinningAi ? "Đang biến hóa câu chữ..." : "✨ AI Sinh Biến Thể Spin Text"}
              </button>
            </div>

            {/* Gợi ý chèn biến cá nhân hóa */}
            <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
              <span className="text-slate-400 mr-1">Chèn nhanh:</span>
              {[
                { label: "Họ tên {fullName}", token: "{fullName}" },
                { label: "Tên gọi {firstName}", token: "{firstName}" },
                { label: "SĐT {phone}", token: "{phone}" },
                { label: "Dược sĩ {assignedStaff}", token: "{assignedStaff}" },
                {
                  label: "Spin chào hỏi {chào anh|em chào chị}",
                  token: "{Dạ em Thảo chào|Em chào|Dạ kính chào}",
                },
              ].map((btn) => (
                <button
                  key={btn.token}
                  type="button"
                  onClick={() => insertTokenToTemplate(btn.token)}
                  className="rounded-lg border border-slate-700 bg-slate-950 hover:border-blue-500 px-2.5 py-1 text-slate-300 hover:text-white transition cursor-pointer"
                >
                  + {btn.label}
                </button>
              ))}
            </div>

            <textarea
              rows={4}
              required
              value={templateText}
              onChange={(e) => setTemplateText(e.target.value)}
              placeholder="Nhập mẫu tin nhắn, hỗ trợ cú pháp {biến_thể_1|biến_thể_2} và {fullName}..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-white leading-relaxed focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* BƯỚC 4: Thiết Lập An Toàn (Anti-Ban Guard) */}
          <div className="space-y-3 border-t border-slate-800/80 pt-5">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                4
              </span>
              <h3 className="text-sm font-bold text-white">
                Bước 4: Thiết Lập An Toàn (Anti-Ban Guard)
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-slate-800 bg-slate-950/80 p-4 text-xs">
              <div>
                <span className="text-slate-400 block mb-1">
                  ⏱️ Giãn cách an toàn (45 - 120 giây/tin):
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={45}
                    max={300}
                    value={speedMin}
                    onChange={(e) => setSpeedMin(Math.max(45, Number(e.target.value) || 45))}
                    className="w-16 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-center font-mono text-white"
                  />
                  <span className="text-slate-500">đến</span>
                  <input
                    type="number"
                    min={45}
                    max={600}
                    value={speedMax}
                    onChange={(e) => setSpeedMax(Math.max(45, Number(e.target.value) || 120))}
                    className="w-16 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-center font-mono text-white"
                  />
                  <span className="text-slate-400">giây</span>
                </div>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">
                  🛡️ Giới hạn tối đa / tài khoản:
                </span>
                <div className="font-mono font-bold text-emerald-400 py-1">
                  150 tin / ngày (Hard Limit)
                </div>
              </div>

              <div className="flex items-center">
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mockMode}
                    onChange={(e) => setMockMode(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-blue-600"
                  />
                  <span>
                    Chạy chế độ <strong>Mock Send (Kiểm thử luồng)</strong>
                  </span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-blue-600 hover:bg-blue-500 px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-600/30 transition cursor-pointer disabled:opacity-50"
              >
                {submitting
                  ? "Đang khởi tạo hàng đợi..."
                  : `🚀 Khởi Chạy Chiến Dịch (${audienceCount} khách)`}
              </button>
            </div>
          </div>
        </form>

        {/* Cột phải: Hộp Preview Tin Nhắn Giả Lập Trên Màn Hình Điện Thoại */}
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
                    <p className="text-xs font-bold text-white">{accountName}</p>
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
            </div>
          </div>
        </div>
      </div>

      {/* BẢNG THEO DÕI TIẾN ĐỘ CHIẾN DỊCH ĐANG CHẠY (Realtime Campaign Monitor) */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-base font-bold text-white">
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
            {/* Thanh Progress Bar & Các nút điều khiển ⏸️ Tạm Dừng, ▶️ Tiếp Tục, ⏹️ Hủy Bỏ */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950/90 p-4 space-y-3">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-white">
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
                          : "bg-blue-500/20 text-blue-300"
                      }`}
                    >
                      {activeCampaign.status}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 mt-1 font-mono">
                    Đã gửi {activeCampaign.sentCount}/{activeCampaign.totalRecipients} tin ({activeCampaign.progressPercent || 0}%)
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
                  style={{ width: `${activeCampaign.progressPercent || 0}%` }}
                />
              </div>
            </div>

            {/* Bảng Log Chi Tiết Từng Tin */}
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950 text-slate-400 text-[11px] uppercase">
                    <th className="py-3 px-4">Thời gian gửi</th>
                    <th className="py-3 px-4">Tên khách hàng</th>
                    <th className="py-3 px-4">SĐT</th>
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
                        <td className="py-2.5 px-4 font-semibold text-white">
                          {log.customerName}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-emerald-400">
                          {log.maskedPhone || log.phone || "Chưa có"}
                        </td>
                        <td className="py-2.5 px-4">{log.channel}</td>
                        <td className="py-2.5 px-4 max-w-md truncate text-slate-300">
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
                            <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                              ✕ Lỗi
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
    </div>
  );
}
