import fs from "fs";
import path from "path";
import { listAllChannels } from "./connectionHub.js";
import { normalizePhone } from "./phone.js";
import { addUnifiedMessage } from "./unifiedMessageRouter.js";

/**
 * ADDP Omnichannel AI CRM — Facebook Fanpage Comment & Private Reply Automation Engine
 * - Hỗ trợ cài đặt kịch bản tự động theo:
 *   1. Fanpage cụ thể hoặc tất cả Fanpage đang kết nối
 *   2. Bài viết cụ thể (Post ID / URL) hoặc tất cả bài viết & Livestream
 *   3. Từ khóa bình luận (CONTAINS / EXACT / STARTS_WITH) hoặc mọi bình luận (ALL_COMMENTS)
 * - Hành động:
 *   1. Tự động trả lời công khai dưới bình luận (POST /{commentId}/comments)
 *   2. Tự động nhắn tin riêng Messenger cho khách bình luận (POST /{pageId}/messages với recipient.comment_id)
 *   3. Tự động ẩn bình luận chứa SĐT hoặc ẩn sau khi trả lời
 */

const DATA_DIR = path.join(process.cwd(), ".data");
const RULES_PATH = path.join(DATA_DIR, "fb_comment_rules.json");
const LOGS_PATH = path.join(DATA_DIR, "fb_comment_logs.json");
const PROCESSED_IDS_PATH = path.join(DATA_DIR, "fb_comment_processed.json");

const MAX_LOGS = 300;
const MAX_PROCESSED_IDS = 3000;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJsonFile(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      return parsed;
    }
  } catch (err) {
    console.error(`[FB_COMMENT_ENGINE_READ_ERR] ${filePath}:`, err.message);
  }
  return fallback;
}

function writeJsonFile(filePath, data) {
  try {
    ensureDataDir();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error(`[FB_COMMENT_ENGINE_WRITE_ERR] ${filePath}:`, err.message);
  }
}

/**
 * Trích xuất Post ID từ ID thuần hoặc URL bài viết Facebook
 */
export function extractFacebookPostId(input = "") {
  const raw = String(input || "").trim();
  if (!raw) return "";

  // Dạng chuẩn pageId_postId hoặc số thuần
  if (/^\d+_\d+$/.test(raw) || /^\d{6,}$/.test(raw)) {
    return raw;
  }

  // URL dạng .../posts/123456 hoặc .../videos/123456 hoặc pfbid...
  const postMatch = raw.match(/\/(?:posts|videos|photos|reel)\/(?:[^/?#]+\/)?([^/?#]+)/i);
  if (postMatch && postMatch[1]) {
    return postMatch[1];
  }

  const storyFbid = raw.match(/[?&](?:story_fbid|fbid|v)=([^&#]+)/i);
  if (storyFbid && storyFbid[1]) {
    return storyFbid[1];
  }

  return raw;
}

/**
 * Lấy danh sách Fanpage Facebook đang kết nối từ ConnectionHub (+ fallback .env)
 */
export function getConnectedFacebookPages() {
  const channels = listAllChannels() || [];
  const fbPages = channels
    .filter((c) => c.platform === "FACEBOOK" && c.config?.pageId && c.config?.pageAccessToken)
    .map((c) => ({
      id: String(c.config.pageId).trim(),
      channelId: c.id,
      name: c.name || `Fanpage ${String(c.config.pageId).slice(-4)}`,
      accessToken: String(c.config.pageAccessToken).trim(),
      status: c.status || "CONNECTED",
    }));

  if (
    fbPages.length === 0 &&
    process.env.FB_PAGE_ID &&
    process.env.FB_PAGE_ACCESS_TOKEN
  ) {
    fbPages.push({
      id: String(process.env.FB_PAGE_ID).trim(),
      channelId: "env_fb_page",
      name: "Fanpage Mặc Định (.env)",
      accessToken: String(process.env.FB_PAGE_ACCESS_TOKEN).trim(),
      status: "CONNECTED",
    });
  }

  return fbPages;
}

/**
 * Tìm Page Access Token theo pageId
 */
export function getFacebookPageToken(pageId) {
  const pid = String(pageId || "").trim();
  const pages = getConnectedFacebookPages();
  const matched = pages.find((p) => p.id === pid);
  if (matched?.accessToken) return matched;

  if (process.env.FB_PAGE_ACCESS_TOKEN) {
    return {
      id: pid,
      name: `Fanpage ${pid.slice(-4)}`,
      accessToken: String(process.env.FB_PAGE_ACCESS_TOKEN).trim(),
    };
  }
  return null;
}

/**
 * Chuẩn hóa cấu trúc Rule tự động bình luận Fanpage
 */
export function normalizeCommentRule(raw = {}) {
  const keywords = Array.isArray(raw.keywords)
    ? raw.keywords.map((k) => String(k || "").trim()).filter(Boolean)
    : String(raw.keywords || "")
        .split(/[,;\n]/)
        .map((k) => k.trim())
        .filter(Boolean);

  const targetPostIds = Array.isArray(raw.targetPostIds)
    ? raw.targetPostIds.map((p) => extractFacebookPostId(p)).filter(Boolean)
    : String(raw.targetPostIds || "")
        .split(/[,;\n]/)
        .map((p) => extractFacebookPostId(p))
        .filter(Boolean);

  const targetPageIds = Array.isArray(raw.targetPageIds)
    ? raw.targetPageIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];

  return {
    id: String(raw.id || `fb_cmt_rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`),
    name: String(raw.name || "Kịch bản bình luận Fanpage").trim(),
    enabled: raw.enabled !== undefined ? Boolean(raw.enabled) : true,
    priority: Number.isFinite(Number(raw.priority)) ? Number(raw.priority) : 10,

    // Phạm vi Fanpage
    pageScope: raw.pageScope === "SPECIFIC" ? "SPECIFIC" : "ALL",
    targetPageIds,

    // Phạm vi Bài viết
    postScope: raw.postScope === "SPECIFIC_POSTS" ? "SPECIFIC_POSTS" : "ALL_POSTS",
    targetPostIds,
    targetPostTitles: typeof raw.targetPostTitles === "object" && raw.targetPostTitles ? raw.targetPostTitles : {},

    // Điều kiện từ khóa
    keywordMode: raw.keywordMode === "KEYWORDS" ? "KEYWORDS" : "ALL_COMMENTS",
    keywords,
    matchType: ["CONTAINS", "EXACT", "STARTS_WITH"].includes(raw.matchType)
      ? raw.matchType
      : "CONTAINS",

    // Hành động 1: Tự động trả lời bình luận
    replyCommentEnabled:
      raw.replyCommentEnabled !== undefined ? Boolean(raw.replyCommentEnabled) : true,
    replyCommentText: String(
      raw.replyCommentText ||
        "{Dạ chào|Chào} {name} ạ! Bên em đã gửi thông tin chi tiết vào tin nhắn riêng (Inbox) cho mình rồi ạ, {name} kiểm tra tin nhắn giúp em nhé!"
    ).trim(),

    // Hành động 2: Tự động nhắn tin riêng (Private Reply)
    privateMessageEnabled:
      raw.privateMessageEnabled !== undefined ? Boolean(raw.privateMessageEnabled) : true,
    privateMessageText: String(
      raw.privateMessageText ||
        "Dạ chào {name} ạ! Cảm ơn mình đã bình luận quan tâm sản phẩm của Dược phẩm ADDP. Em xin phép tư vấn chi tiết và báo ưu đãi riêng cho {name} ngay tại đây nhé ạ!"
    ).trim(),

    // Chống cướp khách & an toàn
    hidePhoneComments:
      raw.hidePhoneComments !== undefined ? Boolean(raw.hidePhoneComments) : true,
    hideAfterReply: Boolean(raw.hideAfterReply),
    delaySeconds: Math.max(0, Math.min(120, Number(raw.delaySeconds ?? 3) || 0)),

    hitCount: Number(raw.hitCount || 0),
    replySuccessCount: Number(raw.replySuccessCount || 0),
    pmSuccessCount: Number(raw.pmSuccessCount || 0),
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

export function getCommentAutoRules() {
  const list = readJsonFile(RULES_PATH, null);
  if (Array.isArray(list)) {
    return list.map(normalizeCommentRule);
  }
  // Khởi tạo rule mẫu chuẩn nghiệp vụ ở trạng thái tắt/bật minh bạch
  const initialRules = [
    normalizeCommentRule({
      id: "fb_cmt_rule_default_price",
      name: "Khách hỏi giá / tư vấn trên mọi bài viết",
      enabled: true,
      priority: 1,
      pageScope: "ALL",
      postScope: "ALL_POSTS",
      keywordMode: "KEYWORDS",
      keywords: ["giá", "bao nhiêu", "ib", "inbox", "tư vấn", "đặt hàng", "mua"],
      matchType: "CONTAINS",
      replyCommentEnabled: true,
      replyCommentText:
        "{Dạ chào|Em chào} {name} ạ! Em đã nhắn tin riêng báo giá ưu đãi cho mình rồi, {name} kiểm tra hộp thư giúp em nhé ạ ❤️",
      privateMessageEnabled: true,
      privateMessageText:
        "Dạ em chào {name} ạ! Cảm ơn {name} đã quan tâm đến sản phẩm của Dược Phẩm ADDP. Mình đang cần tư vấn cho tình trạng sức khỏe nào để Dược sĩ hỗ trợ chi tiết và gửi ưu đãi ạ?",
      hidePhoneComments: true,
      hideAfterReply: false,
      delaySeconds: 3,
    }),
  ];
  writeJsonFile(RULES_PATH, initialRules);
  return initialRules;
}

export function saveCommentAutoRules(rules) {
  const normalized = (Array.isArray(rules) ? rules : []).map(normalizeCommentRule);
  writeJsonFile(RULES_PATH, normalized);
  return normalized;
}

export function getCommentAutoLogs() {
  const logs = readJsonFile(LOGS_PATH, []);
  return Array.isArray(logs) ? logs : [];
}

function appendCommentAutoLog(entry) {
  const logs = getCommentAutoLogs();
  logs.unshift({
    id: `fblog_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  });
  if (logs.length > MAX_LOGS) {
    logs.length = MAX_LOGS;
  }
  writeJsonFile(LOGS_PATH, logs);
}

function isCommentProcessed(commentId) {
  if (!commentId) return false;
  const ids = readJsonFile(PROCESSED_IDS_PATH, []);
  return Array.isArray(ids) && ids.includes(String(commentId));
}

function markCommentProcessed(commentId) {
  if (!commentId) return;
  const cid = String(commentId);
  let ids = readJsonFile(PROCESSED_IDS_PATH, []);
  if (!Array.isArray(ids)) ids = [];
  if (!ids.includes(cid)) {
    ids.unshift(cid);
    if (ids.length > MAX_PROCESSED_IDS) {
      ids = ids.slice(0, MAX_PROCESSED_IDS);
    }
    writeJsonFile(PROCESSED_IDS_PATH, ids);
  }
}

/**
 * Render spin text {a|b} và biến {name}, {comment}
 */
export function renderCommentTemplate(template = "", ctx = {}) {
  let text = String(template || "");
  const name = String(ctx.senderName || "Anh/Chị").trim() || "Anh/Chị";
  const comment = String(ctx.commentText || "").trim();

  text = text
    .replace(/\{name\}|\{fullName\}/gi, name)
    .replace(/\{comment\}/gi, comment);

  text = text.replace(/\{([^{}]*[|/][^{}]*)\}/g, (_, group) => {
    const delimiter = group.includes("|") ? "|" : "/";
    const opts = group
      .split(delimiter)
      .map((s) => s.trim())
      .filter(Boolean);
    if (opts.length === 0) return "";
    const idx = Math.floor(Math.random() * opts.length);
    return opts[idx];
  });

  return text.trim();
}

/**
 * Kiểm tra bình luận có khớp Post ID không
 * Lưu ý Facebook postId có dạng "pageId_postId" hoặc chỉ "postId"
 */
function isPostMatched(rule, postId = "") {
  if (rule.postScope !== "SPECIFIC_POSTS") return true;
  if (!Array.isArray(rule.targetPostIds) || rule.targetPostIds.length === 0) return false;

  const incoming = String(postId || "").trim();
  if (!incoming) return false;
  const incomingShort = incoming.includes("_") ? incoming.split("_").pop() : incoming;

  return rule.targetPostIds.some((target) => {
    const t = String(target || "").trim();
    if (!t) return false;
    const tShort = t.includes("_") ? t.split("_").pop() : t;
    return incoming === t || incomingShort === tShort;
  });
}

/**
 * Kiểm tra bình luận có khớp từ khóa của rule không
 */
function findMatchedKeyword(rule, commentText = "") {
  if (rule.keywordMode !== "KEYWORDS") {
    return { matched: true, matchedKeyword: "(Mọi bình luận)" };
  }
  const normalizedText = String(commentText || "").toLowerCase().trim();
  if (!normalizedText) return { matched: false, matchedKeyword: null };

  for (const kw of rule.keywords || []) {
    const k = String(kw || "").toLowerCase().trim();
    if (!k) continue;

    if (rule.matchType === "EXACT" && normalizedText === k) {
      return { matched: true, matchedKeyword: kw };
    }
    if (rule.matchType === "STARTS_WITH" && normalizedText.startsWith(k)) {
      return { matched: true, matchedKeyword: kw };
    }
    if (rule.matchType === "CONTAINS" && normalizedText.includes(k)) {
      return { matched: true, matchedKeyword: kw };
    }
  }
  return { matched: false, matchedKeyword: null };
}

/**
 * Tìm Rule phù hợp nhất cho sự kiện bình luận Facebook
 */
export function matchCommentAutoRule({ pageId, postId, commentText }) {
  const rules = getCommentAutoRules()
    .filter((r) => r.enabled)
    .sort((a, b) => {
      // Ưu tiên rule bài viết cụ thể trước, sau đó theo priority nhỏ -> lớn
      if (a.postScope !== b.postScope) {
        return a.postScope === "SPECIFIC_POSTS" ? -1 : 1;
      }
      return (a.priority || 10) - (b.priority || 10);
    });

  const pid = String(pageId || "").trim();

  for (const rule of rules) {
    // 1. Kiểm tra Fanpage
    if (rule.pageScope === "SPECIFIC") {
      if (!rule.targetPageIds.includes(pid)) continue;
    }

    // 2. Kiểm tra Bài viết
    if (!isPostMatched(rule, postId)) continue;

    // 3. Kiểm tra Từ khóa / Mọi bình luận
    const kwCheck = findMatchedKeyword(rule, commentText);
    if (!kwCheck.matched) continue;

    return {
      rule,
      matchedKeyword: kwCheck.matchedKeyword,
    };
  }

  return null;
}

/**
 * Lấy danh sách bài viết gần nhất của Fanpage qua Meta Graph API
 */
export async function fetchFanpagePosts(pageId, limit = 20) {
  const page = getFacebookPageToken(pageId);
  if (!page?.accessToken) {
    return {
      ok: false,
      error: "Không tìm thấy Page Access Token cho Fanpage này. Vui lòng kết nối lại Fanpage.",
      posts: [],
    };
  }

  try {
    const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(
      page.id
    )}/posts?fields=id,message,created_time,permalink_url,full_picture&limit=${Math.min(
      50,
      Math.max(1, Number(limit) || 20)
    )}&access_token=${encodeURIComponent(page.accessToken)}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await res.json();

    if (data?.error) {
      return {
        ok: false,
        error: `Meta Graph API: ${data.error.message} (Mã ${data.error.code})`,
        posts: [],
      };
    }

    const posts = (Array.isArray(data?.data) ? data.data : []).map((p) => ({
      id: p.id,
      message: p.message || "(Bài viết hình ảnh / video không có mô tả)",
      createdTime: p.created_time || "",
      permalinkUrl: p.permalink_url || "",
      picture: p.full_picture || "",
    }));

    return { ok: true, pageName: page.name, posts };
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi kết nối Meta Graph API: ${err.message}`,
      posts: [],
    };
  }
}

/**
 * Thực thi trả lời bình luận + nhắn tin riêng (Private Reply) khi có bình luận mới trên Fanpage
 */
export async function processFacebookCommentEvent({
  pageId,
  postId,
  commentId,
  parentId = "",
  senderId = "",
  senderName = "Khách hàng",
  message = "",
  dryRun = false,
}) {
  const pid = String(pageId || "").trim();
  const cid = String(commentId || "").trim();
  const text = String(message || "").trim();

  // Bỏ qua bình luận do chính Fanpage tự đăng để tránh vòng lặp vô hạn
  if (!dryRun && senderId && pid && String(senderId) === pid) {
    return { ok: true, skipped: true, reason: "SELF_PAGE_COMMENT" };
  }

  // Bỏ qua nếu commentId đã xử lý rồi
  if (!dryRun && cid && isCommentProcessed(cid)) {
    return { ok: true, skipped: true, reason: "ALREADY_PROCESSED" };
  }

  // Nếu là reply con của 1 comment khác mà không có text hoặc từ Page -> bỏ qua nhẹ nhàng nếu cần
  if (!dryRun && parentId && postId && String(parentId) !== String(postId)) {
    // Vẫn có thể là khách reply lại comment; chỉ skip nếu chính Page trả lời (đã check ở trên)
  }

  const matched = matchCommentAutoRule({
    pageId: pid,
    postId,
    commentText: text,
  });

  if (!matched) {
    return { ok: true, matched: false, reason: "NO_RULE_MATCHED" };
  }

  const { rule, matchedKeyword } = matched;
  const replyText = rule.replyCommentEnabled
    ? renderCommentTemplate(rule.replyCommentText, { senderName, commentText: text })
    : "";
  const pmText = rule.privateMessageEnabled
    ? renderCommentTemplate(rule.privateMessageText, { senderName, commentText: text })
    : "";

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      matched: true,
      ruleId: rule.id,
      ruleName: rule.name,
      matchedKeyword,
      replyText,
      pmText,
    };
  }

  if (cid) {
    markCommentProcessed(cid);
  }

  const page = getFacebookPageToken(pid);
  if (!page?.accessToken) {
    appendCommentAutoLog({
      pageId: pid,
      postId,
      commentId: cid,
      senderName,
      commentText: text,
      ruleId: rule.id,
      ruleName: rule.name,
      matchedKeyword,
      replyStatus: "FAILED",
      replyError: "Thiếu Page Access Token",
      pmStatus: "FAILED",
      pmError: "Thiếu Page Access Token",
    });
    return { ok: false, error: "MISSING_PAGE_TOKEN" };
  }

  // Độ trễ tự nhiên trước khi phản hồi
  if (rule.delaySeconds > 0) {
    await new Promise((r) => setTimeout(r, Math.min(30, rule.delaySeconds) * 1000));
  }

  let replyStatus = rule.replyCommentEnabled ? "PENDING" : "SKIPPED";
  let replyError = "";
  let replyCommentId = "";

  let pmStatus = rule.privateMessageEnabled ? "PENDING" : "SKIPPED";
  let pmError = "";
  let pmMessageId = "";

  let hiddenStatus = "SKIPPED";

  // 1. Trả lời công khai dưới bình luận
  if (rule.replyCommentEnabled && cid && replyText) {
    try {
      const replyRes = await fetch(
        `https://graph.facebook.com/v19.0/${encodeURIComponent(cid)}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: replyText,
            access_token: page.accessToken,
          }),
          signal: AbortSignal.timeout(10000),
        }
      );
      const replyData = await replyRes.json();
      if (replyData?.id) {
        replyStatus = "SUCCESS";
        replyCommentId = String(replyData.id);
      } else {
        replyStatus = "FAILED";
        replyError = replyData?.error?.message || "Không thể trả lời bình luận";
      }
    } catch (err) {
      replyStatus = "FAILED";
      replyError = err.message;
    }
  }

  // 2. Nhắn tin riêng (Private Reply) cho khách hàng từ comment_id
  if (rule.privateMessageEnabled && cid && pmText) {
    try {
      const pmRes = await fetch(
        `https://graph.facebook.com/v19.0/${encodeURIComponent(page.id)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient: { comment_id: cid },
            message: { text: pmText },
            access_token: page.accessToken,
          }),
          signal: AbortSignal.timeout(10000),
        }
      );
      const pmData = await pmRes.json();
      if (pmData?.message_id || pmData?.recipient_id) {
        pmStatus = "SUCCESS";
        pmMessageId = String(pmData.message_id || "");

        // Lưu vào hộp thư hợp nhất để Sale nhìn thấy tin nhắn vừa tự động gửi
        if (pmData.recipient_id) {
          await addUnifiedMessage({
            channel: "FACEBOOK",
            channelId: page.id,
            channelName: page.name,
            threadId: String(pmData.recipient_id),
            senderId: page.id,
            senderName: page.name,
            text: pmText,
            isMe: true,
            timestamp: Date.now(),
            metadata: { autoPrivateReplyFromCommentId: cid, postId },
          }).catch(() => {});
        }
      } else {
        pmStatus = "FAILED";
        pmError = pmData?.error?.message || "Không thể gửi tin nhắn riêng từ bình luận";
      }
    } catch (err) {
      pmStatus = "FAILED";
      pmError = err.message;
    }
  }

  // 3. Ẩn bình luận nếu chứa SĐT hoặc bật chế độ ẩn sau khi trả lời
  const hasPhone = Boolean(text.match(/(0|\+?84)(3|5|7|8|9)[0-9]{8}/));
  if (cid && (rule.hideAfterReply || (rule.hidePhoneComments && hasPhone))) {
    try {
      const hideRes = await fetch(
        `https://graph.facebook.com/v19.0/${encodeURIComponent(cid)}?is_hidden=true`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${page.accessToken}` },
          signal: AbortSignal.timeout(8000),
        }
      );
      if (hideRes.ok) {
        hiddenStatus = "HIDDEN";
      }
    } catch {
      hiddenStatus = "HIDE_FAILED";
    }
  }

  // Cập nhật bộ đếm cho Rule
  const currentRules = getCommentAutoRules();
  const rIdx = currentRules.findIndex((r) => r.id === rule.id);
  if (rIdx >= 0) {
    currentRules[rIdx].hitCount = (currentRules[rIdx].hitCount || 0) + 1;
    if (replyStatus === "SUCCESS") {
      currentRules[rIdx].replySuccessCount = (currentRules[rIdx].replySuccessCount || 0) + 1;
    }
    if (pmStatus === "SUCCESS") {
      currentRules[rIdx].pmSuccessCount = (currentRules[rIdx].pmSuccessCount || 0) + 1;
    }
    saveCommentAutoRules(currentRules);
  }

  appendCommentAutoLog({
    pageId: pid,
    pageName: page.name,
    postId,
    commentId: cid,
    senderId,
    senderName,
    commentText: text,
    detectedPhone: hasPhone ? normalizePhone(text.match(/(0|\+?84)(3|5|7|8|9)[0-9]{8}/)[0]) : "",
    ruleId: rule.id,
    ruleName: rule.name,
    matchedKeyword,
    replyText,
    replyStatus,
    replyError,
    replyCommentId,
    pmText,
    pmStatus,
    pmError,
    pmMessageId,
    hiddenStatus,
  });

  return {
    ok: true,
    matched: true,
    ruleId: rule.id,
    replyStatus,
    pmStatus,
    hiddenStatus,
  };
}

/**
 * Quét bù các bình luận gần đây trên 1 bài viết (nếu mới bật quy tắc hoặc muốn chạy lại bài cũ)
 */
export async function scanPostCommentsAndAutoReply(pageId, postId, limit = 25) {
  const page = getFacebookPageToken(pageId);
  const pid = extractFacebookPostId(postId);
  if (!page?.accessToken || !pid) {
    return { ok: false, error: "Thiếu Fanpage hoặc ID bài viết hợp lệ." };
  }

  const fullPostId = pid.includes("_") ? pid : `${page.id}_${pid}`;
  try {
    const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(
      fullPostId
    )}/comments?fields=id,message,from,created_time&limit=${Math.min(
      50,
      Math.max(1, Number(limit) || 25)
    )}&access_token=${encodeURIComponent(page.accessToken)}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await res.json();
    if (data?.error) {
      return {
        ok: false,
        error: `Meta Graph API: ${data.error.message} (Mã ${data.error.code})`,
      };
    }

    const comments = Array.isArray(data?.data) ? data.data : [];
    let processed = 0;
    let skipped = 0;

    for (const c of comments) {
      const outcome = await processFacebookCommentEvent({
        pageId: page.id,
        postId: fullPostId,
        commentId: c.id,
        senderId: c.from?.id || "",
        senderName: c.from?.name || "Khách hàng",
        message: c.message || "",
      });
      if (outcome.matched && !outcome.skipped) {
        processed++;
      } else {
        skipped++;
      }
    }

    return {
      ok: true,
      totalComments: comments.length,
      processed,
      skipped,
    };
  } catch (err) {
    return { ok: false, error: `Lỗi quét bình luận bài viết: ${err.message}` };
  }
}
