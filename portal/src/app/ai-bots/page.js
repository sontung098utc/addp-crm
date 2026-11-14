"use client";

import { useState, useEffect } from "react";

const CHANNEL_LABEL = {
  ZALO_PERSONAL: "Zalo Cá Nhân",
  ZALO_OA: "Zalo OA",
  FACEBOOK_FANPAGE: "Fanpage FB",
  TIKTOK_SHOP: "TikTok Shop",
  SHOPEE: "Shopee",
};

const MODE_OPTIONS = [
  { value: "HUMAN", label: "🔴 Tắt Bot (Sale trực)" },
  { value: "COPILOT", label: "🟡 Gợi ý cho Sale (Copilot)" },
  { value: "AUTO", label: "🟢 Tự động trả lời (Auto)" },
];

export default function AiBotsPage() {
  const [activeTab, setActiveTab] = useState("bots"); // 'bots' | 'knowledge' | 'settings'
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Bot Profiles
  const [profiles, setProfiles] = useState([]);
  const [savingBotKey, setSavingBotKey] = useState(null);
  const [showAddBot, setShowAddBot] = useState(false);
  const [newBot, setNewBot] = useState({
    channel: "ZALO_PERSONAL",
    accountId: "",
    accountName: "",
    botName: "",
    mode: "COPILOT",
  });
  const [addingBot, setAddingBot] = useState(false);

  // Knowledge Docs & Vector Search
  const [docs, setDocs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [docForm, setDocForm] = useState({
    title: "",
    category: "PRODUCT",
    accountKeys: "ALL",
    content: "",
    file: null,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [learningBotKey, setLearningBotKey] = useState(null);

  // AI Settings & MariaDB
  const [aiSettings, setAiSettings] = useState({
    primaryProvider: "openai",
    openaiApiKey: "",
    openaiModel: "gpt-4o-mini",
    geminiApiKey: "",
    geminiModel: "gemini-2.5-flash",
    hasOpenaiKey: false,
    hasGeminiKey: false,
  });
  const [dbStatus, setDbStatus] = useState({ configured: false, connected: false });
  const [vectorStats, setVectorStats] = useState({ knowledgeChunks: 0, conversationVectors: 0 });
  const [savingSettings, setSavingSettings] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [initingDb, setInitingDb] = useState(false);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  };

  const loadAll = async () => {
    try {
      setLoading(true);
      const [pRes, kRes, sRes] = await Promise.all([
        fetch("/api/ai/bot-profiles").then((r) => r.json()),
        fetch("/api/ai/knowledge").then((r) => r.json()),
        fetch("/api/ai/settings").then((r) => r.json()),
      ]);
      if (pRes.ok) setProfiles(pRes.profiles || []);
      else showToast("error", pRes.error || "Không tải được danh sách Bot.");
      if (kRes.ok) setDocs(kRes.docs || []);
      if (sRes.ok) {
        if (sRes.settings) setAiSettings(sRes.settings);
        if (sRes.dbStatus) setDbStatus(sRes.dbStatus);
        if (sRes.vectorStats) setVectorStats(sRes.vectorStats);
      }
    } catch (err) {
      showToast("error", `Lỗi tải dữ liệu AI: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleProfileChange = (accountKey, field, value) => {
    setProfiles((prev) =>
      prev.map((p) => (p.accountKey === accountKey ? { ...p, [field]: value } : p))
    );
  };

  const handleSaveProfile = async (profile) => {
    try {
      setSavingBotKey(profile.accountKey);
      const res = await fetch("/api/ai/bot-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error);
      showToast("success", data.message);
    } catch (err) {
      showToast("error", err.message);
    } finally {
      setSavingBotKey(null);
    }
  };

  const handleLearnHistory = async (profile) => {
    try {
      setLearningBotKey(profile.accountKey);
      const res = await fetch("/api/ai/bot-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "LEARN_HISTORY",
          accountKey: profile.accountKey,
          homeDir: profile.homeDir || "",
          accountName: profile.accountName || "",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error);
      setProfiles((prev) =>
        prev.map((p) =>
          p.accountKey === profile.accountKey ? { ...p, learnedStats: data.learnedStats } : p
        )
      );
      showToast("success", data.message);
    } catch (err) {
      showToast("error", err.message);
    } finally {
      setLearningBotKey(null);
    }
  };

  const handleAddBot = async (e) => {
    e.preventDefault();
    if (!newBot.accountName.trim()) {
      showToast("error", "Vui lòng nhập tên tài khoản kênh.");
      return;
    }
    try {
      setAddingBot(true);
      const res = await fetch("/api/ai/bot-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newBot,
          botName: newBot.botName || `Bot ${newBot.accountName}`,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error);
      showToast("success", data.message);
      setNewBot({ channel: "ZALO_PERSONAL", accountId: "", accountName: "", botName: "", mode: "COPILOT" });
      setShowAddBot(false);
      await loadAll();
    } catch (err) {
      showToast("error", err.message);
    } finally {
      setAddingBot(false);
    }
  };

  const handleDeleteBot = async (accountKey) => {
    if (!confirm("Xóa cấu hình Bot này?")) return;
    try {
      const res = await fetch(`/api/ai/bot-profiles?accountKey=${encodeURIComponent(accountKey)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error);
      showToast("success", data.message);
      await loadAll();
    } catch (err) {
      showToast("error", err.message);
    }
  };

  const handleUploadDoc = async (e) => {
    e.preventDefault();
    try {
      setUploading(true);
      const fd = new FormData();
      fd.append("title", docForm.title);
      fd.append("category", docForm.category);
      fd.append("accountKeys", docForm.accountKeys || "ALL");
      if (docForm.file) {
        fd.append("file", docForm.file);
      } else {
        fd.append("content", docForm.content);
      }
      const res = await fetch("/api/ai/knowledge", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error);
      showToast("success", data.message);
      setDocForm({ title: "", category: "PRODUCT", accountKeys: "ALL", content: "", file: null });
      await loadAll();
    } catch (err) {
      showToast("error", err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDoc = async (id) => {
    try {
      const res = await fetch(`/api/ai/knowledge?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error);
      showToast("success", data.message);
      await loadAll();
    } catch (err) {
      showToast("error", err.message);
    }
  };

  const handleVectorSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    try {
      setSearching(true);
      const res = await fetch(`/api/ai/knowledge?q=${encodeURIComponent(searchQuery.trim())}`);
      const data = await res.json();
      if (data.ok) setSearchResults(data.vectorMatches || []);
    } finally {
      setSearching(false);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      setSavingSettings(true);
      const res = await fetch("/api/ai/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SAVE_SETTINGS", ...aiSettings }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error);
      if (data.settings) setAiSettings(data.settings);
      showToast("success", data.message);
    } catch (err) {
      showToast("error", err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleTestAi = async () => {
    try {
      setTestingAi(true);
      const res = await fetch("/api/ai/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "TEST_AI" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error);
      showToast("success", data.message);
    } catch (err) {
      showToast("error", err.message);
    } finally {
      setTestingAi(false);
    }
  };

  const handleInitMariaDb = async () => {
    try {
      setInitingDb(true);
      const res = await fetch("/api/ai/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "INIT_MARIADB" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error);
      showToast("success", data.message);
      await loadAll();
    } catch (err) {
      showToast("error", err.message);
    } finally {
      setInitingDb(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-5">
        {toast && (
          <div
            className={`fixed top-5 right-5 z-50 max-w-md rounded-xl px-4 py-3 text-sm font-medium shadow-xl border ${
              toast.type === "error"
                ? "bg-rose-50 border-rose-300 text-rose-700"
                : "bg-emerald-50 border-emerald-300 text-emerald-700"
            }`}
          >
            {toast.type === "error" ? "⚠️ " : "✅ "}
            {toast.message}
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              AI Bot Theo Kênh & Kho Tri Thức Vector
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Mỗi tài khoản (Zalo cá nhân, Zalo OA, Fanpage, TikTok, Shopee) có 1 Bot phụ trách riêng — ưu tiên OpenAI GPT, tự động chuyển Gemini khi hết hạn mức.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`px-3 py-1.5 rounded-full font-semibold border ${
                dbStatus.connected
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              }`}
            >
              {dbStatus.connected
                ? `🟢 MariaDB 10.6 (${dbStatus.database})`
                : "🟡 MariaDB: Chờ kết nối server"}
            </span>
            <span className="px-3 py-1.5 rounded-full font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              Vector: {vectorStats.knowledgeChunks} đoạn tri thức
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
          <button
            onClick={() => setActiveTab("bots")}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${
              activeTab === "bots"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            🤖 Bot Theo Từng Tài Khoản ({profiles.length})
          </button>
          <button
            onClick={() => setActiveTab("knowledge")}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${
              activeTab === "knowledge"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            📚 Kho Tri Thức & Tài Liệu ({docs.length})
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${
              activeTab === "settings"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            ⚙️ Cấu Hình OpenAI / Gemini & MariaDB
          </button>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-500 text-sm">
            Đang tải cấu hình AI Bot & Kho Tri Thức...
          </div>
        ) : activeTab === "bots" ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <div className="text-sm text-slate-600">
                Hệ thống tự nhận diện các nick <strong>Zalo Cá Nhân</strong> đang đăng nhập. Bạn có thể thêm Bot thủ công cho bất kỳ tài khoản nào.
              </div>
              <button
                onClick={() => setShowAddBot((v) => !v)}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer"
              >
                {showAddBot ? "✕ Đóng" : "➕ Thêm Bot Mới"}
              </button>
            </div>

            {showAddBot && (
              <form
                onSubmit={handleAddBot}
                className="bg-white rounded-2xl border border-blue-200 p-5 shadow-sm grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
              >
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">Kênh</label>
                  <select
                    value={newBot.channel}
                    onChange={(e) => setNewBot((b) => ({ ...b, channel: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs"
                  >
                    {Object.entries(CHANNEL_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">Tên tài khoản kênh *</label>
                  <input
                    type="text"
                    placeholder="VD: Zalo Ngọc Linh - Addp"
                    value={newBot.accountName}
                    onChange={(e) => setNewBot((b) => ({ ...b, accountName: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">ID tài khoản (UID/Page ID)</label>
                  <input
                    type="text"
                    placeholder="Để trống sẽ tự sinh"
                    value={newBot.accountId}
                    onChange={(e) => setNewBot((b) => ({ ...b, accountId: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">Chế độ</label>
                  <select
                    value={newBot.mode}
                    onChange={(e) => setNewBot((b) => ({ ...b, mode: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs"
                  >
                    {MODE_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={addingBot}
                  className="py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                >
                  {addingBot ? "Đang tạo..." : "✓ Tạo Bot"}
                </button>
              </form>
            )}

            {profiles.length === 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-sm text-slate-500">
                Chưa có Bot nào. Bấm <strong>➕ Thêm Bot Mới</strong> để tạo.
              </div>
            )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {profiles.map((p) => (
              <div
                key={p.accountKey}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-bold mb-1">
                      {CHANNEL_LABEL[p.channel] || p.channel}
                    </span>
                    <h3 className="text-base font-bold text-slate-900">{p.accountName}</h3>
                    <div className="text-xs text-slate-500 font-mono">{p.accountKey}</div>
                  </div>
                  <select
                    value={p.mode}
                    onChange={(e) => handleProfileChange(p.accountKey, "mode", e.target.value)}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800"
                  >
                    {MODE_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                      Tên xưng hô Bot
                    </label>
                    <input
                      type="text"
                      value={p.botName || ""}
                      onChange={(e) => handleProfileChange(p.accountKey, "botName", e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                      Trễ tự nhiên (giây)
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={2}
                        value={p.replyDelayMin ?? 5}
                        onChange={(e) =>
                          handleProfileChange(p.accountKey, "replyDelayMin", Number(e.target.value))
                        }
                        className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                      />
                      <span className="text-slate-400">-</span>
                      <input
                        type="number"
                        min={5}
                        value={p.replyDelayMax ?? 15}
                        onChange={(e) =>
                          handleProfileChange(p.accountKey, "replyDelayMax", Number(e.target.value))
                        }
                        className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                      Tạm dừng khi Sale nhắn (phút)
                    </label>
                    <input
                      type="number"
                      min={5}
                      value={p.takeoverMinutes ?? 45}
                      onChange={(e) =>
                        handleProfileChange(p.accountKey, "takeoverMinutes", Number(e.target.value))
                      }
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                    Giọng điệu & Quy tắc trả lời riêng cho Bot này
                  </label>
                  <textarea
                    rows={3}
                    value={p.personaPrompt || ""}
                    onChange={(e) =>
                      handleProfileChange(p.accountKey, "personaPrompt", e.target.value)
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-800"
                  />
                </div>

                {p.learnedStats && (
                  <div className="rounded-xl bg-purple-50/70 border border-purple-200 px-3 py-2 text-[11px] text-purple-900 space-y-1">
                    <div className="font-semibold flex items-center justify-between gap-2">
                      <span>🧠 Trí nhớ tự học từ lịch sử nick này:</span>
                      <span className="text-purple-700 font-bold">
                        {p.learnedStats.totalConversations} hội thoại • {p.learnedStats.qaCount} mẫu Q&amp;A
                      </span>
                    </div>
                    <p className="text-purple-800/90 leading-relaxed">
                      {p.learnedStats.styleSummary}
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    onClick={() => handleLearnHistory(p)}
                    disabled={learningBotKey === p.accountKey}
                    className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                  >
                    {learningBotKey === p.accountKey
                      ? "Đang học lịch sử..."
                      : "🧠 Học lịch sử chat nick này"}
                  </button>
                  <button
                    onClick={() => handleDeleteBot(p.accountKey)}
                    className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold cursor-pointer"
                  >
                    Xóa
                  </button>
                  <button
                    onClick={() => handleSaveProfile(p)}
                    disabled={savingBotKey === p.accountKey}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                  >
                    {savingBotKey === p.accountKey ? "Đang lưu..." : "💾 Lưu cấu hình Bot"}
                  </button>
                </div>
              </div>
            ))}
          </div>
          </div>
        ) : activeTab === "knowledge" ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Upload form */}
            <form
              onSubmit={handleUploadDoc}
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3.5"
            >
              <h3 className="text-base font-bold text-slate-900">
                ➕ Nạp Tài Liệu Sản Phẩm / Quy Trình
              </h3>
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 space-y-1.5">
                <div className="text-xs font-bold text-amber-800">📥 Tải file mẫu để điền thông tin:</div>
                <a href="/templates/mau_tai_lieu_san_pham.txt" download className="block text-xs text-blue-700 hover:underline">
                  • Mẫu tài liệu sản phẩm (.txt)
                </a>
                <a href="/templates/mau_quy_trinh_cskh.txt" download className="block text-xs text-blue-700 hover:underline">
                  • Mẫu quy trình chăm sóc khách hàng (.txt)
                </a>
                <a href="/templates/mau_hoi_thoai_sale.csv" download className="block text-xs text-blue-700 hover:underline">
                  • Mẫu hội thoại Sale để Bot học văn phong (.csv)
                </a>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">
                  Tên tài liệu *
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: Thông tin Sữa hạt Glucare Plus"
                  value={docForm.title}
                  onChange={(e) => setDocForm((d) => ({ ...d, title: e.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">
                    Phân loại
                  </label>
                  <select
                    value={docForm.category}
                    onChange={(e) => setDocForm((d) => ({ ...d, category: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-2.5 py-2 text-xs bg-white"
                  >
                    <option value="PRODUCT">Sản phẩm & Giá</option>
                    <option value="CARE_PROCESS">Quy trình CSKH</option>
                    <option value="FAQ">Câu hỏi thường gặp</option>
                    <option value="SALE_STYLE">Kịch bản Sale</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">
                    Áp dụng cho Bot
                  </label>
                  <select
                    value={docForm.accountKeys}
                    onChange={(e) => setDocForm((d) => ({ ...d, accountKeys: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-2.5 py-2 text-xs bg-white"
                  >
                    <option value="ALL">Tất cả các Bot</option>
                    {profiles.map((p) => (
                      <option key={p.accountKey} value={p.accountKey}>
                        {p.accountName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">
                  Tải file (.txt, .md, .csv, .docx, .pdf)
                </label>
                <input
                  type="file"
                  accept=".txt,.md,.csv,.docx,.pdf"
                  onChange={(e) =>
                    setDocForm((d) => ({ ...d, file: e.target.files?.[0] || null }))
                  }
                  className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:font-semibold"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">
                  Hoặc dán nội dung trực tiếp
                </label>
                <textarea
                  rows={5}
                  placeholder="Dán thông tin thành phần, công dụng, bảng giá, quy trình chăm sóc..."
                  value={docForm.content}
                  onChange={(e) => setDocForm((d) => ({ ...d, content: e.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              <button
                type="submit"
                disabled={uploading}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
              >
                {uploading ? "⏳ Đang băm & tạo Vector..." : "🚀 Nạp vào Kho Vector AI"}
              </button>
            </form>

            {/* Docs list + Vector search tester */}
            <div className="lg:col-span-2 space-y-4">
              <form
                onSubmit={handleVectorSearch}
                className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex gap-2"
              >
                <input
                  type="text"
                  placeholder="🔍 Thử truy vấn Vector RAG (VD: Tiểu đường 12 chấm uống sữa gì, giá bao nhiêu?)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={searching}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold cursor-pointer"
                >
                  {searching ? "Đang tìm..." : "Test Vector"}
                </button>
              </form>

              {searchResults.length > 0 && (
                <div className="bg-blue-50/70 rounded-2xl border border-blue-200 p-4 space-y-2">
                  <div className="text-xs font-bold text-blue-800 uppercase">
                    Kết quả truy xuất ngữ nghĩa (Top {searchResults.length})
                  </div>
                  {searchResults.map((r) => (
                    <div
                      key={r.id}
                      className="bg-white rounded-xl border border-blue-100 p-3 text-xs space-y-1"
                    >
                      <div className="flex justify-between font-semibold text-slate-800">
                        <span>{r.title}</span>
                        <span className="text-blue-600">Độ khớp: {r.score}</span>
                      </div>
                      <p className="text-slate-600">{r.text}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
                <h3 className="text-base font-bold text-slate-900">
                  Danh sách tài liệu đã nạp ({docs.length})
                </h3>
                {docs.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Chưa có tài liệu nào. Hãy tải file sản phẩm hoặc quy trình CSKH ở khung bên trái.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {docs.map((doc) => (
                      <div
                        key={doc.id}
                        className="py-3 flex items-start justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-slate-900">
                              {doc.title}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px] font-semibold">
                              {doc.category}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[11px] font-semibold">
                              {doc.chunkCount} chunks
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 line-clamp-2">{doc.preview}</p>
                        </div>
                        <button
                          onClick={() => handleDeleteDoc(doc.id)}
                          className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold cursor-pointer"
                        >
                          Xóa
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <form
              onSubmit={handleSaveSettings}
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4"
            >
              <h3 className="text-base font-bold text-slate-900">
                🧠 Cấu Hình AI Router (OpenAI GPT ưu tiên → Gemini dự phòng)
              </h3>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">
                  Model ưu tiên chạy chính
                </label>
                <select
                  value={aiSettings.primaryProvider}
                  onChange={(e) =>
                    setAiSettings((s) => ({ ...s, primaryProvider: e.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  <option value="openai">OpenAI GPT (Ưu tiên 1 → Hết quota tự sang Gemini)</option>
                  <option value="gemini">Google Gemini (Ưu tiên 1 → Lỗi tự sang OpenAI)</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">
                    OpenAI API Key {aiSettings.hasOpenaiKey ? "✅" : ""}
                  </label>
                  <input
                    type="password"
                    placeholder="sk-proj-..."
                    value={aiSettings.openaiApiKey || ""}
                    onChange={(e) =>
                      setAiSettings((s) => ({ ...s, openaiApiKey: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">
                    OpenAI Model
                  </label>
                  <input
                    type="text"
                    value={aiSettings.openaiModel || "gpt-4o-mini"}
                    onChange={(e) =>
                      setAiSettings((s) => ({ ...s, openaiModel: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">
                    Gemini API Key {aiSettings.hasGeminiKey ? "✅" : ""}
                  </label>
                  <input
                    type="password"
                    placeholder="AIzaSy..."
                    value={aiSettings.geminiApiKey || ""}
                    onChange={(e) =>
                      setAiSettings((s) => ({ ...s, geminiApiKey: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">
                    Gemini Model
                  </label>
                  <input
                    type="text"
                    value={aiSettings.geminiModel || "gemini-2.5-flash"}
                    onChange={(e) =>
                      setAiSettings((s) => ({ ...s, geminiModel: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2.5 pt-2">
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer"
                >
                  {savingSettings ? "Đang lưu..." : "💾 Lưu API Key"}
                </button>
                <button
                  type="button"
                  onClick={handleTestAi}
                  disabled={testingAi}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold cursor-pointer"
                >
                  {testingAi ? "Đang thử..." : "⚡ Test Kết Nối OpenAI / Gemini"}
                </button>
              </div>
            </form>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-slate-900">
                🗄️ Hạ Tầng Lưu Trữ MariaDB 10.6 & Vector Store
              </h3>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-xs space-y-2">
                <div>
                  <strong>MariaDB Host:</strong> {dbStatus.host || "Chưa cấu hình"} —{" "}
                  <strong>DB:</strong> {dbStatus.database || "Chưa cấu hình"}
                </div>
                <div>
                  <strong>Trạng thái kết nối:</strong>{" "}
                  {dbStatus.connected ? (
                    <span className="text-emerald-700 font-semibold">Đã kết nối thành công</span>
                  ) : (
                    <span className="text-amber-700 font-semibold">
                      {dbStatus.error || "Chưa kết nối (sẽ tự động kết nối khi chạy trên server)"}
                    </span>
                  )}
                </div>
                <div>
                  <strong>Vector Store:</strong> {vectorStats.knowledgeChunks} đoạn tri thức sản phẩm/quy trình •{" "}
                  {vectorStats.conversationVectors} vector hội thoại
                </div>
              </div>

              <button
                type="button"
                onClick={handleInitMariaDb}
                disabled={initingDb}
                className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold cursor-pointer"
              >
                {initingDb
                  ? "⏳ Đang khởi tạo bảng..."
                  : "🛠️ Khởi Tạo Bảng AI & Hội Thoại Trên MariaDB 10.6"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
