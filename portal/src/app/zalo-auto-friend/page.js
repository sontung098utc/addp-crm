"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import {
  UserPlus,
  Upload,
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Play,
  Pause,
  Square,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  FileText,
  Search,
} from "lucide-react";

const STATUS_META = {
  PENDING: {
    label: "Đang chờ",
    badge: "bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30",
  },
  SENT: {
    label: "Đã gửi lời mời",
    badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  },
  ACCEPTED: {
    label: "Kết bạn thành công",
    badge: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30",
  },
  ALREADY_FRIEND: {
    label: "Đã là bạn bè",
    badge: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  },
  NOT_FOUND: {
    label: "Không tìm thấy Zalo",
    badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  },
  ERROR: {
    label: "Lỗi",
    badge: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
  },
};

const CAMPAIGN_STATUS_META = {
  RUNNING: {
    label: "Đang chạy",
    badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  },
  SCHEDULED: {
    label: "Đã hẹn giờ",
    badge: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30",
  },
  PAUSED: {
    label: "Tạm dừng",
    badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  },
  COMPLETED: {
    label: "Hoàn thành",
    badge: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  },
  CANCELLED: {
    label: "Đã hủy",
    badge: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30",
  },
};

function renderPreviewInvite(template = "", samplePhone = "0912345678") {
  let text = String(template || "");
  text = text.replace(/\{phone\}/gi, samplePhone);
  text = text.replace(/\{([^{}]*[|/][^{}]*)\}/g, (_, group) => {
    const delimiter = group.includes("|") ? "|" : "/";
    const opts = group
      .split(delimiter)
      .map((s) => s.trim())
      .filter(Boolean);
    return opts[0] || "";
  });
  return text.replace(/[ \t]{2,}/g, " ").trim();
}

export default function ZaloAutoFriendPage() {
  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [antiBanRules, setAntiBanRules] = useState({
    minDelaySec: 45,
    maxDelaySec: 120,
    defaultDailyLimit: 50,
    maxDailyLimit: 70,
    maxMessageLength: 150,
  });

  // Bước 1: Danh sách SĐT
  const [rawPhonesText, setRawPhonesText] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsedResult, setParsedResult] = useState(null);
  const [showInvalidList, setShowInvalidList] = useState(false);

  // Bước 2: Chọn nick Zalo cá nhân
  const [selectedAccountIds, setSelectedAccountIds] = useState([]);

  // Bước 3: Cài đặt kết bạn & Anti-Ban
  const [campaignName, setCampaignName] = useState("");
  const [messageTemplate, setMessageTemplate] = useState(
    "{Chào bạn|Xin chào}, mình bên Dược phẩm ADDP xin phép kết bạn để hỗ trợ tư vấn và chăm sóc sức khỏe nhé ạ!"
  );
  const [minDelaySec, setMinDelaySec] = useState(45);
  const [maxDelaySec, setMaxDelaySec] = useState(120);
  const [dailyLimitPerAccount, setDailyLimitPerAccount] = useState(50);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Bước 4: Theo dõi tiến độ & log
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);
  const [logStatusFilter, setLogStatusFilter] = useState("ALL");
  const [logSearch, setLogSearch] = useState("");
  const [checkingAccepted, setCheckingAccepted] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (type, text) => {
    setToast({ type, text });
    setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  };

  const fetchOverview = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/zalo/auto-friend", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.ok) {
        setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
        const list = Array.isArray(data.campaigns) ? data.campaigns : [];
        setCampaigns(list);
        if (data.antiBanRules) {
          setAntiBanRules(data.antiBanRules);
        }
        setSelectedAccountIds((prev) => {
          if (prev.length > 0) return prev;
          return (data.accounts || []).length > 0 ? [data.accounts[0].id] : [];
        });
        setSelectedCampaignId((prev) => prev || (list[0]?.id ?? null));
      } else if (!silent) {
        showToast("error", data?.error || "Không tải được dữ liệu kết bạn Zalo.");
      }
    } catch {
      if (!silent) showToast("error", "Lỗi kết nối máy chủ.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview(false);
  }, []);

  const hasActiveCampaign = useMemo(
    () => campaigns.some((c) => c.status === "RUNNING" || c.status === "SCHEDULED"),
    [campaigns]
  );

  useEffect(() => {
    if (!hasActiveCampaign) return;
    const timer = setInterval(() => {
      fetchOverview(true);
    }, 4000);
    return () => clearInterval(timer);
  }, [hasActiveCampaign]);

  const handleDownloadSample = (format) => {
    const content =
      format === "csv"
        ? "phone,ghi_chu\n0912345678,Khach hang A\n+84987654321,Khach hang B\n84901234567,Khach hang C\n0356.789.012,Khach hang D\n"
        : "0912345678\n+84 987 654 321\n84901234567\n0356-789-012\n";
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = format === "csv" ? "mau-danh-sach-sdt.csv" : "mau-danh-sach-sdt.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFileName(file.name);
    const text = await file.text();
    setRawPhonesText(text);
    await handleParsePhones(text);
    e.target.value = "";
  };

  const handleParsePhones = async (textOverride) => {
    const text = typeof textOverride === "string" ? textOverride : rawPhonesText;
    if (!text.trim()) {
      showToast("error", "Vui lòng tải file hoặc dán danh sách SĐT trước.");
      return;
    }
    setParsing(true);
    try {
      const res = await fetch("/api/zalo/auto-friend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "parse-phones", rawText: text }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setParsedResult(data);
        showToast(
          "success",
          `Đã chuẩn hóa ${data.validCount} SĐT hợp lệ (loại ${data.duplicateCount} trùng, ${data.invalidCount} không hợp lệ).`
        );
      } else {
        showToast("error", data?.error || "Không thể phân tích danh sách SĐT.");
      }
    } catch {
      showToast("error", "Lỗi kết nối khi chuẩn hóa SĐT.");
    } finally {
      setParsing(false);
    }
  };

  const toggleAccount = (id) => {
    setSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const previewInviteText = useMemo(
    () =>
      renderPreviewInvite(
        messageTemplate,
        parsedResult?.validPhones?.[0] || "0912345678"
      ),
    [messageTemplate, parsedResult]
  );

  const previewLength = previewInviteText.length;
  const maxMsgLen = antiBanRules.maxMessageLength || 150;

  const handleStartCampaign = async () => {
    if (!parsedResult || parsedResult.validCount === 0) {
      showToast("error", "Vui lòng chuẩn hóa ít nhất 1 SĐT hợp lệ ở Bước 1.");
      return;
    }
    if (selectedAccountIds.length === 0) {
      showToast("error", "Vui lòng chọn ít nhất 1 nick Zalo cá nhân ở Bước 2.");
      return;
    }
    if (!messageTemplate.trim()) {
      showToast("error", "Vui lòng nhập nội dung lời mời kết bạn.");
      return;
    }
    if (previewLength > maxMsgLen) {
      showToast("error", `Lời mời kết bạn vượt quá giới hạn ${maxMsgLen} ký tự của Zalo.`);
      return;
    }
    if (scheduleEnabled && !scheduledAt) {
      showToast("error", "Vui lòng chọn thời gian hẹn giờ chạy.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/zalo/auto-friend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: scheduleEnabled ? "schedule" : "start",
          name: campaignName,
          phones: parsedResult.validPhones,
          accountIds: selectedAccountIds,
          messageTemplate,
          minDelaySec: Math.max(45, Number(minDelaySec) || 45),
          maxDelaySec: Math.max(45, Number(maxDelaySec) || 120),
          dailyLimitPerAccount: Number(dailyLimitPerAccount) || 50,
          scheduledAt: scheduleEnabled ? scheduledAt : null,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        showToast("success", data.message || "Đã tạo chiến dịch kết bạn tự động.");
        setSelectedCampaignId(data.campaign.id);
        await fetchOverview(true);
      } else {
        showToast("error", data?.error || "Không thể khởi chạy chiến dịch.");
      }
    } catch {
      showToast("error", "Lỗi kết nối máy chủ khi tạo chiến dịch.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleControlCampaign = async (id, action) => {
    try {
      const res = await fetch("/api/zalo/auto-friend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        await fetchOverview(true);
        showToast(
          "success",
          action === "pause"
            ? "Đã tạm dừng chiến dịch."
            : action === "resume"
            ? "Đã tiếp tục chạy chiến dịch."
            : "Đã hủy chiến dịch."
        );
      } else {
        showToast("error", data?.error || "Thao tác thất bại.");
      }
    } catch {
      showToast("error", "Lỗi kết nối máy chủ.");
    }
  };

  const handleCheckAccepted = async (campaignId = null) => {
    setCheckingAccepted(true);
    try {
      const res = await fetch("/api/zalo/auto-friend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check-accepted", id: campaignId }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        if (Array.isArray(data.campaigns)) {
          setCampaigns(data.campaigns);
        } else {
          await fetchOverview(true);
        }
        showToast("success", data.message || "Đã đối soát danh sách bạn bè Zalo.");
      } else {
        showToast("error", data?.error || "Không thể đối soát danh sách bạn bè.");
      }
    } catch {
      showToast("error", "Lỗi kết nối máy chủ khi kiểm tra kết bạn thành công.");
    } finally {
      setCheckingAccepted(false);
    }
  };

  const overallReport = useMemo(() => {
    let totalSentPending = 0;
    let totalAccepted = 0;
    let totalAlreadyFriend = 0;
    for (const c of campaigns) {
      totalSentPending += Number(c.stats?.sent || 0);
      totalAccepted += Number(c.stats?.accepted || 0);
      totalAlreadyFriend += Number(c.stats?.alreadyFriend || 0);
    }
    const totalInvited = totalSentPending + totalAccepted;
    const acceptRate = totalInvited > 0 ? Math.round((totalAccepted / totalInvited) * 100) : 0;
    return {
      totalCampaigns: campaigns.length,
      totalSentPending,
      totalAccepted,
      totalInvited,
      totalAlreadyFriend,
      acceptRate,
    };
  }, [campaigns]);

  const activeCampaign = useMemo(
    () => campaigns.find((c) => c.id === selectedCampaignId) || campaigns[0] || null,
    [campaigns, selectedCampaignId]
  );

  const filteredItems = useMemo(() => {
    const items = activeCampaign?.items || [];
    return items.filter((it) => {
      if (logStatusFilter !== "ALL" && it.status !== logStatusFilter) return false;
      if (logSearch.trim()) {
        const q = logSearch.trim().toLowerCase();
        const hitPhone = String(it.phone || "").toLowerCase().includes(q);
        const hitName = String(it.displayName || "").toLowerCase().includes(q);
        const hitAcc = String(it.accountName || "").toLowerCase().includes(q);
        if (!hitPhone && !hitName && !hitAcc) return false;
      }
      return true;
    });
  }, [activeCampaign, logStatusFilter, logSearch]);

  const progressPct = useMemo(() => {
    const total = activeCampaign?.stats?.total || 0;
    const processed = activeCampaign?.stats?.processed || 0;
    if (total === 0) return 0;
    return Math.round((processed / total) * 100);
  }, [activeCampaign]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#007aff]/15 text-[#007aff] flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              Kết bạn Zalo tự động từ danh sách SĐT
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Tải lên file CSV/TXT hoặc dán danh sách SĐT, tự động tìm Zalo và gửi lời mời kết bạn an toàn theo cơ chế Anti-Ban.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchOverview(false)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Làm mới
          </button>
          <Link
            href="/channels"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-900 text-white dark:bg-slate-800 hover:opacity-90 transition"
          >
            <Smartphone className="w-3.5 h-3.5" />
            Quản lý Nick Zalo
          </Link>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`p-3.5 rounded-2xl border text-sm font-medium flex items-center justify-between gap-3 ${
            toast.type === "error"
              ? "bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300"
              : "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === "error" ? (
              <XCircle className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>{toast.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-xs opacity-70 hover:opacity-100"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Banner Anti-Ban */}
      <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-800 dark:text-amber-300">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            <strong>Bảo vệ tài khoản Zalo (Anti-Ban):</strong> Giãn cách ngẫu nhiên tối thiểu{" "}
            <strong>45–120 giây/lượt</strong>, xoay vòng nhiều nick nếu chọn nhiều tài khoản, giới hạn tối đa{" "}
            <strong>{antiBanRules.maxDailyLimit} lượt/ngày/nick</strong>.
          </span>
        </div>
      </div>

      {/* Grid 3 bước thiết lập */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* BƯỚC 1: Tải lên / Dán SĐT */}
        <section className="lg:col-span-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[#007aff] text-white text-xs font-bold flex items-center justify-center">
                1
              </span>
              <h2 className="font-semibold text-base">Danh sách SĐT khách hàng</h2>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleDownloadSample("csv")}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Download className="w-3 h-3" />
                Mẫu CSV
              </button>
              <button
                type="button"
                onClick={() => handleDownloadSample("txt")}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Download className="w-3 h-3" />
                Mẫu TXT
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#007aff]/10 text-[#007aff] border border-[#007aff]/25 hover:bg-[#007aff]/15 transition"
            >
              <Upload className="w-4 h-4" />
              Tải lên file .CSV / .TXT
            </button>
            {uploadedFileName && (
              <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                <FileText className="w-3.5 h-3.5" />
                {uploadedFileName}
              </span>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Hoặc dán trực tiếp danh sách SĐT (mỗi dòng 1 số hoặc cách nhau bằng dấu phẩy):
            </label>
            <textarea
              rows={5}
              value={rawPhonesText}
              onChange={(e) => setRawPhonesText(e.target.value)}
              placeholder={"0912345678\n+84 987 654 321\n84901234567"}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/70 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#007aff]"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => handleParsePhones()}
              disabled={parsing || !rawPhonesText.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[#007aff] text-white hover:bg-[#0066d6] disabled:opacity-50 transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {parsing ? "Đang chuẩn hóa..." : "Chuẩn hóa & Kiểm tra SĐT"}
            </button>
            {parsedResult && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold">
                  Hợp lệ: {parsedResult.validCount}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold">
                  Trùng: {parsedResult.duplicateCount}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-700 dark:text-rose-300 font-semibold">
                  Lỗi: {parsedResult.invalidCount}
                </span>
              </div>
            )}
          </div>

          {/* Bảng xem trước SĐT đã chuẩn hóa */}
          {parsedResult && (
            <div className="space-y-2 pt-1">
              {parsedResult.invalidCount > 0 && (
                <div className="text-xs">
                  <button
                    type="button"
                    onClick={() => setShowInvalidList((v) => !v)}
                    className="text-rose-600 dark:text-rose-400 underline font-medium"
                  >
                    {showInvalidList ? "Ẩn" : "Xem"} {parsedResult.invalidCount} dòng SĐT không hợp lệ
                  </button>
                  {showInvalidList && (
                    <div className="mt-1.5 max-h-28 overflow-y-auto rounded-xl border border-rose-500/20 bg-rose-500/5 p-2 space-y-1">
                      {parsedResult.invalidEntries.slice(0, 50).map((inv, idx) => (
                        <div key={idx} className="flex justify-between text-[11px] text-rose-700 dark:text-rose-300">
                          <span className="font-mono">{inv.raw}</span>
                          <span>{inv.reason}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 dark:bg-slate-900/70 text-[11px] font-semibold text-slate-500 flex justify-between">
                  <span>Xem trước SĐT đã chuẩn hóa (10 số VN)</span>
                  <span>{parsedResult.validCount} số</span>
                </div>
                <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
                  {parsedResult.validPhones.slice(0, 100).map((p, i) => (
                    <div key={p} className="px-3 py-1.5 text-xs flex items-center justify-between">
                      <span className="text-slate-400 w-8">#{i + 1}</span>
                      <span className="font-mono font-semibold flex-1">{p}</span>
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400">Hợp lệ</span>
                    </div>
                  ))}
                  {parsedResult.validPhones.length > 100 && (
                    <div className="px-3 py-1.5 text-[11px] text-slate-400 text-center">
                      ... và {parsedResult.validPhones.length - 100} số khác
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* BƯỚC 2 & BƯỚC 3 */}
        <div className="lg:col-span-6 space-y-5">
          {/* BƯỚC 2: Chọn nick Zalo cá nhân */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 space-y-3 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#007aff] text-white text-xs font-bold flex items-center justify-center">
                  2
                </span>
                <h2 className="font-semibold text-base">Chọn nick Zalo cá nhân đi kết bạn</h2>
              </div>
              <span className="text-xs text-slate-500">
                Đã chọn {selectedAccountIds.length}/{accounts.length} nick
              </span>
            </div>

            {accounts.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Chưa có nick Zalo cá nhân nào đang trực tuyến được phân quyền cho bạn.
                </p>
                <Link
                  href="/channels"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#007aff] text-white"
                >
                  Quét QR kết nối Zalo ngay
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {accounts.map((acc) => {
                  const selected = selectedAccountIds.includes(acc.id);
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => toggleAccount(acc.id)}
                      className={`text-left p-3 rounded-xl border transition flex items-start gap-2.5 ${
                        selected
                          ? "border-[#007aff] bg-[#007aff]/10 ring-1 ring-[#007aff]/40"
                          : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          selected
                            ? "bg-[#007aff] text-white"
                            : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        {(acc.name || "Z").slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold truncate">{acc.name}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <span>Trực tuyến</span>
                          <span>•</span>
                          <span>Hôm nay: {acc.sentToday || 0}/{dailyLimitPerAccount}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {selectedAccountIds.length > 1 && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                * Hệ thống sẽ tự động xoay vòng lần lượt giữa {selectedAccountIds.length} nick Zalo đã chọn để giảm tải cho từng tài khoản.
              </p>
            )}
          </section>

          {/* BƯỚC 3: Thiết lập cài đặt kết bạn tự động */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 space-y-4 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[#007aff] text-white text-xs font-bold flex items-center justify-center">
                3
              </span>
              <h2 className="font-semibold text-base">Cài đặt lời mời & Anti-Ban</h2>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Tên chiến dịch (tùy chọn)
              </label>
              <input
                type="text"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="VD: Kết bạn khách hàng mới tháng 11"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/70 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#007aff]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Nội dung lời mời kết bạn (hỗ trợ <code className="px-1 rounded bg-slate-200 dark:bg-slate-800">{"{a|b}"}</code> và <code className="px-1 rounded bg-slate-200 dark:bg-slate-800">{"{phone}"}</code>)
                </label>
                <span
                  className={`text-[11px] font-semibold ${
                    previewLength > maxMsgLen ? "text-rose-500" : "text-slate-500"
                  }`}
                >
                  {previewLength}/{maxMsgLen} ký tự
                </span>
              </div>
              <textarea
                rows={3}
                value={messageTemplate}
                onChange={(e) => setMessageTemplate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/70 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#007aff]"
              />
              <div className="mt-1.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300">
                <strong>Xem trước:</strong> {previewInviteText || "(Trống)"}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Giãn cách tối thiểu (giây)
                </label>
                <input
                  type="number"
                  min={45}
                  max={600}
                  value={minDelaySec}
                  onChange={(e) => setMinDelaySec(Math.max(45, Number(e.target.value) || 45))}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/70 px-3 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Giãn cách tối đa (giây)
                </label>
                <input
                  type="number"
                  min={45}
                  max={900}
                  value={maxDelaySec}
                  onChange={(e) => setMaxDelaySec(Math.max(minDelaySec, Number(e.target.value) || 120))}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/70 px-3 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Giới hạn/ngày/nick
                </label>
                <input
                  type="number"
                  min={1}
                  max={antiBanRules.maxDailyLimit || 70}
                  value={dailyLimitPerAccount}
                  onChange={(e) =>
                    setDailyLimitPerAccount(
                      Math.min(antiBanRules.maxDailyLimit || 70, Math.max(1, Number(e.target.value) || 50))
                    )
                  }
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/70 px-3 py-1.5 text-xs"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                  <input
                    type="radio"
                    checked={!scheduleEnabled}
                    onChange={() => setScheduleEnabled(false)}
                  />
                  Chạy ngay
                </label>
                <label className="inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                  <input
                    type="radio"
                    checked={scheduleEnabled}
                    onChange={() => setScheduleEnabled(true)}
                  />
                  Hẹn giờ chạy
                </label>
                {scheduleEnabled && (
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2 py-1 text-xs"
                  />
                )}
              </div>

              <button
                type="button"
                onClick={handleStartCampaign}
                disabled={submitting}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-[#007aff] text-white hover:bg-[#0066d6] disabled:opacity-50 shadow-sm transition"
              >
                {scheduleEnabled ? <Clock className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {submitting
                  ? "Đang khởi tạo..."
                  : scheduleEnabled
                  ? "Đặt lịch kết bạn"
                  : "Bắt đầu kết bạn tự động"}
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* BƯỚC 4: Theo dõi tiến độ & nhật ký từng SĐT */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#007aff] text-white text-xs font-bold flex items-center justify-center">
              4
            </span>
            <h2 className="font-semibold text-base">Theo dõi tiến độ & Nhật ký từng SĐT</h2>
          </div>

          {campaigns.length > 0 && (
            <select
              value={activeCampaign?.id || ""}
              onChange={(e) => setSelectedCampaignId(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-1.5 text-xs font-medium"
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.stats?.processed || 0}/{c.stats?.total || 0}) —{" "}
                  {CAMPAIGN_STATUS_META[c.status]?.label || c.status}
                </option>
              ))}
            </select>
          )}
        </div>

        {!activeCampaign ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            Chưa có chiến dịch kết bạn Zalo nào. Hãy thiết lập ở Bước 1–3 để bắt đầu.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Báo cáo tổng hợp kết bạn thành công (tất cả chiến dịch) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/25">
                <div className="text-[11px] font-medium text-teal-700 dark:text-teal-300">
                  Tổng kết bạn thành công (Khách đồng ý)
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-lg font-bold text-teal-700 dark:text-teal-200">
                    {overallReport.totalAccepted}
                  </span>
                  <span className="text-[11px] font-semibold text-teal-600 dark:text-teal-400">
                    ({overallReport.acceptRate}% trên {overallReport.totalInvited} lời mời)
                  </span>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                  Tổng đã gửi lời mời (Chờ đồng ý)
                </div>
                <div className="text-lg font-bold mt-1">{overallReport.totalSentPending}</div>
              </div>
              <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
                <div className="text-[11px] font-medium text-blue-700 dark:text-blue-300">
                  Đã là bạn bè từ trước
                </div>
                <div className="text-lg font-bold mt-1">{overallReport.totalAlreadyFriend}</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                <div className="text-[11px] font-medium text-slate-500">
                  Tổng số chiến dịch
                </div>
                <div className="text-lg font-bold mt-1">{overallReport.totalCampaigns}</div>
              </div>
            </div>

            {/* Thanh trạng thái & nút điều khiển */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{activeCampaign.name}</span>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${
                        CAMPAIGN_STATUS_META[activeCampaign.status]?.badge || ""
                      }`}
                    >
                      {CAMPAIGN_STATUS_META[activeCampaign.status]?.label || activeCampaign.status}
                    </span>
                  </div>
                  {activeCampaign.statusNote && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {activeCampaign.statusNote}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCheckAccepted(activeCampaign.id)}
                    disabled={checkingAccepted}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30 hover:bg-teal-500/25 disabled:opacity-50"
                    title="Đối soát danh sách bạn bè Zalo hiện tại để cập nhật số khách đã đồng ý kết bạn"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${checkingAccepted ? "animate-spin" : ""}`} />
                    {checkingAccepted ? "Đang đối soát..." : "Kiểm tra khách đồng ý"}
                  </button>
                  {activeCampaign.status === "RUNNING" && (
                    <button
                      type="button"
                      onClick={() => handleControlCampaign(activeCampaign.id, "pause")}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500/25"
                    >
                      <Pause className="w-3.5 h-3.5" />
                      Tạm dừng
                    </button>
                  )}
                  {(activeCampaign.status === "PAUSED" || activeCampaign.status === "SCHEDULED") && (
                    <button
                      type="button"
                      onClick={() => handleControlCampaign(activeCampaign.id, "resume")}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Tiếp tục chạy
                    </button>
                  )}
                  {activeCampaign.status !== "COMPLETED" && activeCampaign.status !== "CANCELLED" && (
                    <button
                      type="button"
                      onClick={() => handleControlCampaign(activeCampaign.id, "cancel")}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 hover:bg-rose-500/25"
                    >
                      <Square className="w-3.5 h-3.5" />
                      Hủy
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>
                    Tiến độ: {activeCampaign.stats?.processed || 0}/{activeCampaign.stats?.total || 0} SĐT
                  </span>
                  <span className="font-semibold">{progressPct}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-[#007aff] transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>

              {/* KPI thống kê trạng thái */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1">
                <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
                  <div className="text-slate-500">Đang chờ</div>
                  <div className="font-bold text-sm mt-0.5">{activeCampaign.stats?.pending || 0}</div>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-emerald-500/20 text-xs">
                  <div className="text-emerald-600 dark:text-emerald-400">Đã gửi lời mời</div>
                  <div className="font-bold text-sm mt-0.5">{activeCampaign.stats?.sent || 0}</div>
                </div>
                <div className="p-2 rounded-lg bg-teal-500/10 border border-teal-500/30 text-xs">
                  <div className="text-teal-700 dark:text-teal-300 font-medium">Kết bạn thành công</div>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="font-bold text-sm text-teal-700 dark:text-teal-200">
                      {activeCampaign.stats?.accepted || 0}
                    </span>
                    <span className="text-[11px] text-teal-600 dark:text-teal-400 font-semibold">
                      ({activeCampaign.stats?.acceptRate || 0}%)
                    </span>
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-blue-500/20 text-xs">
                  <div className="text-blue-600 dark:text-blue-400">Đã là bạn bè</div>
                  <div className="font-bold text-sm mt-0.5">{activeCampaign.stats?.alreadyFriend || 0}</div>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-amber-500/20 text-xs">
                  <div className="text-amber-600 dark:text-amber-400">Không tìm thấy</div>
                  <div className="font-bold text-sm mt-0.5">{activeCampaign.stats?.notFound || 0}</div>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-rose-500/20 text-xs">
                  <div className="text-rose-600 dark:text-rose-400">Lỗi</div>
                  <div className="font-bold text-sm mt-0.5">{activeCampaign.stats?.error || 0}</div>
                </div>
              </div>
            </div>

            {/* Bộ lọc nhật ký */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { key: "ALL", label: "Tất cả" },
                  { key: "PENDING", label: "Đang chờ" },
                  { key: "SENT", label: "Đã gửi lời mời" },
                  { key: "ACCEPTED", label: "Kết bạn thành công" },
                  { key: "ALREADY_FRIEND", label: "Đã là bạn bè" },
                  { key: "NOT_FOUND", label: "Không tìm thấy Zalo" },
                  { key: "ERROR", label: "Lỗi" },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setLogStatusFilter(tab.key)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                      logStatusFilter === tab.key
                        ? "bg-[#007aff] text-white border-[#007aff]"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  placeholder="Tìm SĐT, tên Zalo..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
                />
              </div>
            </div>

            {/* Bảng chi tiết từng SĐT */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900/80 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">#</th>
                    <th className="py-2.5 px-3 font-semibold">SĐT</th>
                    <th className="py-2.5 px-3 font-semibold">Nick Zalo gửi</th>
                    <th className="py-2.5 px-3 font-semibold">Tên Zalo tìm thấy</th>
                    <th className="py-2.5 px-3 font-semibold">Trạng thái</th>
                    <th className="py-2.5 px-3 font-semibold">Chi tiết</th>
                    <th className="py-2.5 px-3 font-semibold">Cập nhật</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-400">
                        Không có bản ghi nào khớp bộ lọc.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.slice(0, 200).map((item, idx) => {
                      const meta = STATUS_META[item.status] || STATUS_META.PENDING;
                      return (
                        <tr key={`${item.phone}_${idx}`} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                          <td className="py-2 px-3 text-slate-400">{idx + 1}</td>
                          <td className="py-2 px-3 font-mono font-semibold">{item.phone}</td>
                          <td className="py-2 px-3">{item.accountName || "—"}</td>
                          <td className="py-2 px-3">{item.displayName || "—"}</td>
                          <td className="py-2 px-3">
                            <span className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-semibold ${meta.badge}`}>
                              {meta.label}
                            </span>
                          </td>
                          <td className="py-2 px-3 max-w-xs truncate" title={item.detail || ""}>
                            {item.detail || "—"}
                          </td>
                          <td className="py-2 px-3 text-slate-400 whitespace-nowrap">
                            {item.updatedAt ? new Date(item.updatedAt).toLocaleTimeString("vi-VN") : "—"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
