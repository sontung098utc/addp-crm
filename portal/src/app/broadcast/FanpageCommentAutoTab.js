"use client";

import { useState, useEffect, useCallback } from "react";

const MATCH_TYPE_LABELS = {
  CONTAINS: "Chứa từ khóa (Mềm dẻo)",
  EXACT: "Khớp chính xác 100%",
  STARTS_WITH: "Bắt đầu bằng từ khóa",
};

export default function FanpageCommentAutoTab() {
  const [pages, setPages] = useState([]);
  const [rules, setRules] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Modal Tạo/Sửa kịch bản
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formEnabled, setFormEnabled] = useState(true);
  const [formPriority, setFormPriority] = useState(10);
  const [formPageScope, setFormPageScope] = useState("ALL");
  const [formTargetPageIds, setFormTargetPageIds] = useState([]);
  const [formPostScope, setFormPostScope] = useState("ALL_POSTS");
  const [formTargetPostsInput, setFormTargetPostsInput] = useState("");
  const [formTargetPostTitles, setFormTargetPostTitles] = useState({});
  const [formKeywordMode, setFormKeywordMode] = useState("KEYWORDS");
  const [formKeywords, setFormKeywords] = useState("giá, bao nhiêu, ib, inbox, tư vấn");
  const [formMatchType, setFormMatchType] = useState("CONTAINS");
  const [formReplyEnabled, setFormReplyEnabled] = useState(true);
  const [formReplyText, setFormReplyText] = useState(
    "{Dạ chào|Em chào} {name} ạ! Em đã nhắn tin riêng tư vấn chi tiết cho mình rồi, {name} kiểm tra hộp thư giúp em nhé ạ ❤️"
  );
  const [formPmEnabled, setFormPmEnabled] = useState(true);
  const [formPmText, setFormPmText] = useState(
    "Dạ em chào {name} ạ! Cảm ơn {name} đã quan tâm sản phẩm của Dược phẩm ADDP. Không biết {name} đang cần hỗ trợ cho tình trạng sức khỏe nào để Dược sĩ tư vấn ạ?"
  );
  const [formHidePhone, setFormHidePhone] = useState(true);
  const [formHideAfterReply, setFormHideAfterReply] = useState(false);
  const [formDelaySeconds, setFormDelaySeconds] = useState(3);

  // Tải bài viết trực tiếp từ Fanpage trong modal
  const [pickerPageId, setPickerPageId] = useState("");
  const [fetchedPosts, setFetchedPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(false);

  // Mô phỏng & Quét bù
  const [simPageId, setSimPageId] = useState("");
  const [simPostId, setSimPostId] = useState("");
  const [simSenderName, setSimSenderName] = useState("Chị Hoa");
  const [simCommentText, setSimCommentText] = useState("Sản phẩm này giá bao nhiêu vậy shop?");
  const [simResult, setSimResult] = useState(null);
  const [scanningPost, setScanningPost] = useState(false);

  const showToast = useCallback((text, type = "success") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3800);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/facebook/comment-automation");
      const data = await res.json();
      if (data.ok) {
        setPages(Array.isArray(data.pages) ? data.pages : []);
        setRules(Array.isArray(data.rules) ? data.rules : []);
        setLogs(Array.isArray(data.logs) ? data.logs : []);
        if (Array.isArray(data.pages) && data.pages.length > 0) {
          setPickerPageId((prev) => prev || data.pages[0].id);
          setSimPageId((prev) => prev || data.pages[0].id);
        }
      }
    } catch {
      showToast("Không thể tải dữ liệu cấu hình bình luận Fanpage", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/facebook/comment-automation");
        const data = await res.json();
        if (active && data.ok) {
          setPages(Array.isArray(data.pages) ? data.pages : []);
          setRules(Array.isArray(data.rules) ? data.rules : []);
          setLogs(Array.isArray(data.logs) ? data.logs : []);
          if (Array.isArray(data.pages) && data.pages.length > 0) {
            setPickerPageId((prev) => prev || data.pages[0].id);
            setSimPageId((prev) => prev || data.pages[0].id);
          }
        }
      } catch {
        if (active) showToast("Không thể tải dữ liệu cấu hình bình luận Fanpage", "error");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [showToast]);

  function openCreateModal() {
    setEditingRule(null);
    setFormName("");
    setFormEnabled(true);
    setFormPriority(10);
    setFormPageScope("ALL");
    setFormTargetPageIds([]);
    setFormPostScope("ALL_POSTS");
    setFormTargetPostsInput("");
    setFormTargetPostTitles({});
    setFormKeywordMode("KEYWORDS");
    setFormKeywords("giá, bao nhiêu, ib, inbox, tư vấn");
    setFormMatchType("CONTAINS");
    setFormReplyEnabled(true);
    setFormReplyText(
      "{Dạ chào|Em chào} {name} ạ! Em đã nhắn tin riêng tư vấn chi tiết cho mình rồi, {name} kiểm tra hộp thư giúp em nhé ạ ❤️"
    );
    setFormPmEnabled(true);
    setFormPmText(
      "Dạ em chào {name} ạ! Cảm ơn {name} đã quan tâm sản phẩm của Dược phẩm ADDP. Không biết {name} đang cần hỗ trợ cho tình trạng sức khỏe nào để Dược sĩ tư vấn ạ?"
    );
    setFormHidePhone(true);
    setFormHideAfterReply(false);
    setFormDelaySeconds(3);
    setFetchedPosts([]);
    setModalOpen(true);
  }

  function openEditModal(rule) {
    setEditingRule(rule);
    setFormName(rule.name || "");
    setFormEnabled(Boolean(rule.enabled));
    setFormPriority(rule.priority ?? 10);
    setFormPageScope(rule.pageScope || "ALL");
    setFormTargetPageIds(Array.isArray(rule.targetPageIds) ? rule.targetPageIds : []);
    setFormPostScope(rule.postScope || "ALL_POSTS");
    setFormTargetPostsInput((rule.targetPostIds || []).join("\n"));
    setFormTargetPostTitles(rule.targetPostTitles || {});
    setFormKeywordMode(rule.keywordMode || "KEYWORDS");
    setFormKeywords((rule.keywords || []).join(", "));
    setFormMatchType(rule.matchType || "CONTAINS");
    setFormReplyEnabled(Boolean(rule.replyCommentEnabled));
    setFormReplyText(rule.replyCommentText || "");
    setFormPmEnabled(Boolean(rule.privateMessageEnabled));
    setFormPmText(rule.privateMessageText || "");
    setFormHidePhone(Boolean(rule.hidePhoneComments));
    setFormHideAfterReply(Boolean(rule.hideAfterReply));
    setFormDelaySeconds(rule.delaySeconds ?? 3);
    setFetchedPosts([]);
    setModalOpen(true);
  }

  function toggleTargetPage(pageId) {
    setFormTargetPageIds((prev) =>
      prev.includes(pageId) ? prev.filter((id) => id !== pageId) : [...prev, pageId]
    );
  }

  async function handleFetchPagePosts() {
    const pid = pickerPageId || pages[0]?.id;
    if (!pid) {
      showToast("Chưa có Fanpage nào được kết nối", "error");
      return;
    }
    setLoadingPosts(true);
    try {
      const res = await fetch(
        `/api/facebook/comment-automation?action=posts&pageId=${encodeURIComponent(pid)}`
      );
      const data = await res.json();
      if (data.ok && Array.isArray(data.posts)) {
        setFetchedPosts(data.posts);
        showToast(`Đã tải ${data.posts.length} bài viết gần nhất từ Fanpage`);
      } else {
        showToast(data.error || "Không tải được bài viết từ Fanpage", "error");
      }
    } catch {
      showToast("Lỗi kết nối khi tải bài viết Fanpage", "error");
    } finally {
      setLoadingPosts(false);
    }
  }

  function togglePostSelection(post) {
    const currentIds = formTargetPostsInput
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const exists = currentIds.includes(post.id);
    const nextIds = exists
      ? currentIds.filter((id) => id !== post.id)
      : [...currentIds, post.id];
    setFormTargetPostsInput(nextIds.join("\n"));
    setFormTargetPostTitles((prev) => {
      const copy = { ...prev };
      if (exists) {
        delete copy[post.id];
      } else {
        copy[post.id] = String(post.message || "").slice(0, 70);
      }
      return copy;
    });
  }

  async function handleSaveRule(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const targetPostIds = formTargetPostsInput
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      const payload = {
        id: editingRule?.id,
        name: formName,
        enabled: formEnabled,
        priority: Number(formPriority) || 10,
        pageScope: formPageScope,
        targetPageIds: formPageScope === "SPECIFIC" ? formTargetPageIds : [],
        postScope: formPostScope,
        targetPostIds: formPostScope === "SPECIFIC_POSTS" ? targetPostIds : [],
        targetPostTitles: formTargetPostTitles,
        keywordMode: formKeywordMode,
        keywords: formKeywords,
        matchType: formMatchType,
        replyCommentEnabled: formReplyEnabled,
        replyCommentText: formReplyText,
        privateMessageEnabled: formPmEnabled,
        privateMessageText: formPmText,
        hidePhoneComments: formHidePhone,
        hideAfterReply: formHideAfterReply,
        delaySeconds: Number(formDelaySeconds) || 0,
      };

      const res = await fetch("/api/facebook/comment-automation", {
        method: editingRule ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) {
        showToast(data.error || "Không thể lưu kịch bản", "error");
        return;
      }

      showToast(editingRule ? "Đã cập nhật kịch bản bình luận!" : "Đã tạo kịch bản mới!");
      setModalOpen(false);
      await loadData();
    } catch {
      showToast("Lỗi khi lưu kịch bản bình luận Fanpage", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleRule(rule) {
    try {
      const res = await fetch("/api/facebook/comment-automation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id, enabled: !rule.enabled }),
      });
      const data = await res.json();
      if (data.ok) {
        setRules((prev) => prev.map((r) => (r.id === rule.id ? data.rule : r)));
        showToast(data.rule.enabled ? "Đã bật kịch bản" : "Đã tạm tắt kịch bản");
      }
    } catch {
      showToast("Không thể đổi trạng thái kịch bản", "error");
    }
  }

  async function handleDeleteRule(rule) {
    if (!window.confirm(`Xóa kịch bản "${rule.name}"?`)) return;
    try {
      const res = await fetch(
        `/api/facebook/comment-automation?id=${encodeURIComponent(rule.id)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (data.ok) {
        setRules((prev) => prev.filter((r) => r.id !== rule.id));
        showToast("Đã xóa kịch bản");
      }
    } catch {
      showToast("Không thể xóa kịch bản", "error");
    }
  }

  async function handleSimulate() {
    try {
      const res = await fetch("/api/facebook/comment-automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "simulate",
          pageId: simPageId,
          postId: simPostId,
          senderName: simSenderName,
          message: simCommentText,
        }),
      });
      const data = await res.json();
      setSimResult(data);
    } catch {
      showToast("Lỗi khi chạy mô phỏng", "error");
    }
  }

  async function handleScanPostNow() {
    if (!simPageId || !simPostId.trim()) {
      showToast("Vui lòng chọn Fanpage và nhập ID/Link bài viết để quét bình luận", "error");
      return;
    }
    setScanningPost(true);
    try {
      const res = await fetch("/api/facebook/comment-automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "scan_post",
          pageId: simPageId,
          postId: simPostId.trim(),
          limit: 25,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast(
          `Đã quét ${data.totalComments} bình luận: xử lý ${data.processed}, bỏ qua ${data.skipped}`
        );
        await loadData();
      } else {
        showToast(data.error || "Không quét được bình luận bài viết", "error");
      }
    } catch {
      showToast("Lỗi khi quét bình luận bài viết", "error");
    } finally {
      setScanningPost(false);
    }
  }

  const activeRuleCount = rules.filter((r) => r.enabled).length;
  const totalReplySuccess = rules.reduce((s, r) => s + (r.replySuccessCount || 0), 0);
  const totalPmSuccess = rules.reduce((s, r) => s + (r.pmSuccessCount || 0), 0);

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 rounded-xl px-4 py-3 text-xs font-semibold shadow-2xl border ${
            toast.type === "error"
              ? "bg-rose-950/95 border-rose-500/50 text-rose-200"
              : "bg-emerald-950/95 border-emerald-500/50 text-emerald-200"
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Header & KPI nhanh */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span>💬 Tự Động Trả Lời Bình Luận & Nhắn Tin Khách Bình Luận Fanpage</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Tự động phản hồi công khai dưới bình luận và gửi tin nhắn riêng (Private Reply) vào Messenger cho khách hàng theo từng bài viết hoặc từ khóa.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3.5 py-2 text-center">
            <div className="text-[10px] text-slate-400">Page kết nối</div>
            <div className="text-sm font-bold text-blue-400">{pages.length}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3.5 py-2 text-center">
            <div className="text-[10px] text-slate-400">Kịch bản bật</div>
            <div className="text-sm font-bold text-emerald-400">{activeRuleCount}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3.5 py-2 text-center">
            <div className="text-[10px] text-slate-400">Đã trả lời CMT</div>
            <div className="text-sm font-bold text-cyan-400">{totalReplySuccess}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3.5 py-2 text-center">
            <div className="text-[10px] text-slate-400">Đã Inbox khách</div>
            <div className="text-sm font-bold text-purple-400">{totalPmSuccess}</div>
          </div>

          <button
            type="button"
            onClick={openCreateModal}
            className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2.5 shadow-lg shadow-blue-600/25 transition cursor-pointer"
          >
            + Thêm Kịch Bản Bình Luận
          </button>
        </div>
      </div>

      {/* Danh sách kịch bản */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Danh Sách Kịch Bản Đang Cấu Hình</h3>
          <button
            type="button"
            onClick={loadData}
            className="text-xs text-slate-400 hover:text-white transition cursor-pointer"
          >
            ↻ Làm mới
          </button>
        </div>

        {loading ? (
          <div className="text-xs text-slate-400 py-8 text-center">Đang tải danh sách kịch bản...</div>
        ) : rules.length === 0 ? (
          <div className="text-xs text-slate-400 py-8 text-center">
            Chưa có kịch bản nào. Bấm &quot;+ Thêm Kịch Bản Bình Luận&quot; để tạo mới.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className={`rounded-xl border p-4 space-y-3 transition ${
                  rule.enabled
                    ? "border-slate-700 bg-slate-950/60"
                    : "border-slate-800/70 bg-slate-950/30 opacity-65"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white">{rule.name}</span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                          rule.postScope === "SPECIFIC_POSTS"
                            ? "bg-purple-500/15 text-purple-300 border-purple-500/30"
                            : "bg-blue-500/15 text-blue-300 border-blue-500/30"
                        }`}
                      >
                        {rule.postScope === "SPECIFIC_POSTS"
                          ? `📌 ${rule.targetPostIds?.length || 0} bài viết chỉ định`
                          : "🌐 Tất cả bài viết"}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                          rule.keywordMode === "KEYWORDS"
                            ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                            : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                        }`}
                      >
                        {rule.keywordMode === "KEYWORDS"
                          ? `🔑 ${rule.keywords?.length || 0} từ khóa`
                          : "💬 Mọi bình luận"}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      Fanpage:{" "}
                      {rule.pageScope === "SPECIFIC"
                        ? rule.targetPageIds
                            .map((id) => pages.find((p) => p.id === id)?.name || id)
                            .join(", ")
                        : "Tất cả Fanpage đã kết nối"}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleRule(rule)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                      rule.enabled
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                        : "bg-slate-800 text-slate-400 border-slate-700"
                    }`}
                  >
                    {rule.enabled ? "Đang Bật" : "Đang Tắt"}
                  </button>
                </div>

                {rule.keywordMode === "KEYWORDS" && rule.keywords?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {rule.keywords.map((kw, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-200 text-[11px] border border-slate-700"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-2 text-[11px]">
                  {rule.replyCommentEnabled && (
                    <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-2.5">
                      <div className="text-cyan-400 font-semibold mb-0.5">
                        ↳ Trả lời bình luận công khai:
                      </div>
                      <div className="text-slate-300 line-clamp-2">{rule.replyCommentText}</div>
                    </div>
                  )}
                  {rule.privateMessageEnabled && (
                    <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-2.5">
                      <div className="text-purple-400 font-semibold mb-0.5">
                        ✉️ Nhắn tin riêng Messenger (Private Reply):
                      </div>
                      <div className="text-slate-300 line-clamp-2">{rule.privateMessageText}</div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[11px] text-slate-400">
                  <div className="flex items-center gap-3">
                    <span>Khớp: <strong className="text-white">{rule.hitCount || 0}</strong></span>
                    <span>Reply: <strong className="text-cyan-300">{rule.replySuccessCount || 0}</strong></span>
                    <span>Inbox: <strong className="text-purple-300">{rule.pmSuccessCount || 0}</strong></span>
                    {rule.hidePhoneComments && <span className="text-amber-300">🛡️ Ẩn SĐT</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditModal(rule)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                    >
                      ✏️ Sửa
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteRule(rule)}
                      className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 cursor-pointer"
                    >
                      🗑️ Xóa
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bộ kiểm tra mô phỏng & Quét bù bình luận bài viết */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-5 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-3">
          <h3 className="text-sm font-bold text-white">🧪 Kiểm Tra Kịch Bản & Quét Bù Bài Viết</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Chọn Fanpage</label>
              <select
                value={simPageId}
                onChange={(e) => setSimPageId(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
              >
                <option value="">-- Bất kỳ Fanpage --</option>
                {pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">ID / Link Bài viết (tùy chọn)</label>
              <input
                type="text"
                value={simPostId}
                onChange={(e) => setSimPostId(e.target.value)}
                placeholder="VD: 123456_789012 hoặc link bài"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Tên khách</label>
              <input
                type="text"
                value={simSenderName}
                onChange={(e) => setSimSenderName(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] text-slate-400 mb-1">Nội dung bình luận thử</label>
              <input
                type="text"
                value={simCommentText}
                onChange={(e) => setSimCommentText(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={handleSimulate}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3.5 py-2 cursor-pointer"
            >
              ⚡ Chạy Thử (Không gửi thật)
            </button>
            <button
              type="button"
              onClick={handleScanPostNow}
              disabled={scanningPost}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold px-3.5 py-2 cursor-pointer"
            >
              {scanningPost ? "Đang quét..." : "🔎 Quét Bù Bình Luận Bài Viết"}
            </button>
          </div>

          {simResult && (
            <div className="rounded-xl border border-slate-700 bg-slate-950/80 p-3 text-xs space-y-1.5">
              {simResult.matched ? (
                <>
                  <div className="text-emerald-400 font-bold">
                    ✓ Khớp kịch bản: {simResult.ruleName} (Từ khóa: {simResult.matchedKeyword})
                  </div>
                  {simResult.replyText && (
                    <div className="text-slate-300">
                      <span className="text-cyan-400 font-semibold">Reply CMT:</span> {simResult.replyText}
                    </div>
                  )}
                  {simResult.pmText && (
                    <div className="text-slate-300">
                      <span className="text-purple-400 font-semibold">Inbox riêng:</span> {simResult.pmText}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-amber-300">Không có kịch bản nào khớp với bình luận này.</div>
              )}
            </div>
          )}
        </div>

        {/* Nhật ký thực thi */}
        <div className="xl:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">📜 Nhật Ký Tự Động Bình Luận & Nhắn Tin</h3>
            <span className="text-[11px] text-slate-400">{logs.length} bản ghi gần nhất</span>
          </div>

          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[11px] text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2 pr-3">Thời gian</th>
                  <th className="py-2 pr-3">Khách / Bình luận</th>
                  <th className="py-2 pr-3">Kịch bản</th>
                  <th className="py-2 pr-3">Trả lời CMT</th>
                  <th className="py-2">Nhắn tin riêng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-500">
                      Chưa có bình luận nào được xử lý tự động.
                    </td>
                  </tr>
                ) : (
                  logs.slice(0, 30).map((log) => (
                    <tr key={log.id} className="text-slate-300">
                      <td className="py-2 pr-3 whitespace-nowrap text-[11px] text-slate-400">
                        {new Date(log.timestamp).toLocaleString("vi-VN")}
                      </td>
                      <td className="py-2 pr-3 max-w-[200px]">
                        <div className="font-semibold text-white truncate">{log.senderName}</div>
                        <div className="text-[11px] text-slate-400 truncate">{log.commentText}</div>
                      </td>
                      <td className="py-2 pr-3 text-[11px]">
                        <div className="text-blue-300 font-medium">{log.ruleName}</div>
                        <div className="text-slate-500">{log.matchedKeyword}</div>
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            log.replyStatus === "SUCCESS"
                              ? "bg-emerald-500/20 text-emerald-300"
                              : log.replyStatus === "FAILED"
                              ? "bg-rose-500/20 text-rose-300"
                              : "bg-slate-800 text-slate-400"
                          }`}
                          title={log.replyError || ""}
                        >
                          {log.replyStatus}
                        </span>
                      </td>
                      <td className="py-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            log.pmStatus === "SUCCESS"
                              ? "bg-purple-500/20 text-purple-300"
                              : log.pmStatus === "FAILED"
                              ? "bg-rose-500/20 text-rose-300"
                              : "bg-slate-800 text-slate-400"
                          }`}
                          title={log.pmError || ""}
                        >
                          {log.pmStatus}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal Tạo / Sửa Kịch Bản */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 overflow-y-auto">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden my-8">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
              <h3 className="text-sm font-bold text-white">
                {editingRule ? "✏️ Sửa Kịch Bản Bình Luận Fanpage" : "➕ Tạo Kịch Bản Bình Luận Fanpage"}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveRule} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-slate-300 font-semibold mb-1">Tên kịch bản *</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="VD: Bài viết Glucare Plus - Tự động báo giá & Inbox"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Độ ưu tiên (nhỏ chạy trước)</label>
                  <input
                    type="number"
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                  />
                </div>
              </div>

              {/* Phạm vi Fanpage */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-2">
                <div className="font-semibold text-white">1. Áp dụng cho Fanpage nào?</div>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      checked={formPageScope === "ALL"}
                      onChange={() => setFormPageScope("ALL")}
                    />
                    Tất cả Fanpage đã kết nối
                  </label>
                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      checked={formPageScope === "SPECIFIC"}
                      onChange={() => setFormPageScope("SPECIFIC")}
                    />
                    Chọn Fanpage cụ thể
                  </label>
                </div>
                {formPageScope === "SPECIFIC" && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {pages.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleTargetPage(p.id)}
                        className={`px-3 py-1.5 rounded-lg border text-xs cursor-pointer ${
                          formTargetPageIds.includes(p.id)
                            ? "bg-blue-600/30 border-blue-400 text-blue-200 font-semibold"
                            : "bg-slate-900 border-slate-700 text-slate-400"
                        }`}
                      >
                        {formTargetPageIds.includes(p.id) ? "✓ " : ""}
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Phạm vi Bài viết */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-2.5">
                <div className="font-semibold text-white">2. Cài đặt theo Bài viết</div>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      checked={formPostScope === "ALL_POSTS"}
                      onChange={() => setFormPostScope("ALL_POSTS")}
                    />
                    Tất cả bài viết & Livestream
                  </label>
                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      checked={formPostScope === "SPECIFIC_POSTS"}
                      onChange={() => setFormPostScope("SPECIFIC_POSTS")}
                    />
                    Chỉ áp dụng cho Bài viết chỉ định
                  </label>
                </div>

                {formPostScope === "SPECIFIC_POSTS" && (
                  <div className="space-y-2.5 pt-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={pickerPageId}
                        onChange={(e) => setPickerPageId(e.target.value)}
                        className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-white"
                      >
                        {pages.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleFetchPagePosts}
                        disabled={loadingPosts}
                        className="rounded-lg bg-blue-600/25 border border-blue-500/40 text-blue-200 px-3 py-1.5 font-semibold hover:bg-blue-600/40 cursor-pointer"
                      >
                        {loadingPosts ? "Đang tải bài viết..." : "📥 Tải bài viết từ Page để chọn"}
                      </button>
                    </div>

                    {fetchedPosts.length > 0 && (
                      <div className="max-h-40 overflow-y-auto space-y-1.5 rounded-lg border border-slate-800 bg-slate-900/80 p-2">
                        {fetchedPosts.map((post) => {
                          const selected = formTargetPostsInput.includes(post.id);
                          return (
                            <label
                              key={post.id}
                              className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer border ${
                                selected
                                  ? "border-blue-500/50 bg-blue-500/10"
                                  : "border-transparent hover:bg-slate-800/60"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => togglePostSelection(post)}
                                className="mt-0.5"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="text-slate-200 line-clamp-1 font-medium">
                                  {post.message}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  ID: {post.id} •{" "}
                                  {post.createdTime
                                    ? new Date(post.createdTime).toLocaleDateString("vi-VN")
                                    : ""}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Danh sách ID hoặc Link bài viết (mỗi bài 1 dòng):
                      </label>
                      <textarea
                        rows={2}
                        value={formTargetPostsInput}
                        onChange={(e) => setFormTargetPostsInput(e.target.value)}
                        placeholder="VD: 123456789_987654321 hoặc https://www.facebook.com/.../posts/..."
                        className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Điều kiện từ khóa */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-2.5">
                <div className="font-semibold text-white">3. Điều kiện kích hoạt theo Từ khóa</div>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      checked={formKeywordMode === "ALL_COMMENTS"}
                      onChange={() => setFormKeywordMode("ALL_COMMENTS")}
                    />
                    Mọi bình luận (không cần lọc từ khóa)
                  </label>
                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      checked={formKeywordMode === "KEYWORDS"}
                      onChange={() => setFormKeywordMode("KEYWORDS")}
                    />
                    Chỉ khi bình luận chứa Từ khóa
                  </label>
                </div>

                {formKeywordMode === "KEYWORDS" && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Từ khóa (cách nhau bởi dấu phẩy)
                      </label>
                      <input
                        type="text"
                        value={formKeywords}
                        onChange={(e) => setFormKeywords(e.target.value)}
                        placeholder="giá, bao nhiêu, ib, tư vấn, mua"
                        className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Kiểu khớp</label>
                      <select
                        value={formMatchType}
                        onChange={(e) => setFormMatchType(e.target.value)}
                        className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-white"
                      >
                        {Object.entries(MATCH_TYPE_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Hành động phản hồi */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-2">
                  <label className="flex items-center gap-2 font-semibold text-cyan-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formReplyEnabled}
                      onChange={(e) => setFormReplyEnabled(e.target.checked)}
                    />
                    Tự động trả lời bình luận công khai
                  </label>
                  <textarea
                    rows={4}
                    disabled={!formReplyEnabled}
                    value={formReplyText}
                    onChange={(e) => setFormReplyText(e.target.value)}
                    placeholder="Hỗ trợ {name} và spin {Dạ chào|Em chào}"
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-white disabled:opacity-40"
                  />
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-2">
                  <label className="flex items-center gap-2 font-semibold text-purple-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formPmEnabled}
                      onChange={(e) => setFormPmEnabled(e.target.checked)}
                    />
                    Tự động nhắn tin riêng cho khách (Inbox)
                  </label>
                  <textarea
                    rows={4}
                    disabled={!formPmEnabled}
                    value={formPmText}
                    onChange={(e) => setFormPmText(e.target.value)}
                    placeholder="Hỗ trợ {name}, {comment} và spin {Dạ|Chào}"
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-white disabled:opacity-40"
                  />
                </div>
              </div>

              {/* Tùy chọn bảo vệ & trễ */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formHidePhone}
                      onChange={(e) => setFormHidePhone(e.target.checked)}
                    />
                    🛡️ Tự ẩn bình luận chứa SĐT
                  </label>
                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formHideAfterReply}
                      onChange={(e) => setFormHideAfterReply(e.target.checked)}
                    />
                    🙈 Ẩn bình luận sau khi trả lời
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Độ trễ (giây):</span>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={formDelaySeconds}
                    onChange={(e) => setFormDelaySeconds(e.target.value)}
                    className="w-16 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-white text-center"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-slate-300 hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold px-5 py-2 cursor-pointer disabled:opacity-50"
                >
                  {saving ? "Đang lưu..." : editingRule ? "Lưu Thay Đổi" : "Tạo Kịch Bản"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
