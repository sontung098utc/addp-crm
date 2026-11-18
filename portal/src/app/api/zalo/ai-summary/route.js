import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import {
  EMPTY_PATHOLOGY,
  EMPTY_DEMAND,
  EMPTY_CONCERNS,
} from "@/lib/ai/conversationSummary.js";
import { generateAiReply } from "@/lib/ai/aiRouter.js";
import {
  extractMedicalEntities,
  analyzeVietnameseGenderAndPronoun,
} from "@/lib/customerStore.js";
import {
  getAllCustomers,
  findCustomerByPhone,
  updateCustomer,
  upsertCustomerByThreadOrPhone,
  normalizePhone,
  isValidVietnamPhone,
} from "@/lib/customerIdentityResolver.js";
import {
  resolveZaloHomeForThread,
  getAllZaloHistoryFiles,
  getOwnIdForHome,
  getActiveZaloAccountName,
} from "@/lib/zaloRunner.js";
import { getThreadMessages } from "@/lib/unifiedMessageRouter.js";

/**
 * ADDP Omnichannel AI CRM — Trợ Lý AI Tóm Tắt 4 Mục & Lưu Trữ Bền Vững (User Issue #4)
 * - GET  /api/zalo/ai-summary?threadId=...&phone=... : Tự động nạp bản tóm tắt đã lưu cho hội thoại.
 * - POST /api/zalo/ai-summary                        : Phân tích tối đa 40 tin nhắn thực tế (gộp từ body + history.jsonl),
 *                                                      trích xuất chính xác 4 mục + SĐT + Địa chỉ nhận hàng,
 *                                                      lưu vào portal/.data/ai_summaries.json và đồng bộ sang Customer 360.
 */

function getAiSummariesFilePath() {
  const dataDir =
    process.env.DATA_DIR ||
    (fs.existsSync(path.join(process.cwd(), "portal", "package.json"))
      ? "portal/.data"
      : ".data");
  return path.isAbsolute(dataDir)
    ? path.join(dataDir, "ai_summaries.json")
    : path.join(process.cwd(), dataDir, "ai_summaries.json");
}

if (!globalThis.__ADDP_AI_SUMMARIES_CACHE__) {
  globalThis.__ADDP_AI_SUMMARIES_CACHE__ = {
    byThreadId: {},
    byPhone: {},
    lastMtimeMs: 0,
    lastStatCheckTs: 0,
  };
}

function ensureSummariesDir() {
  const filePath = getAiSummariesFilePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return filePath;
}

function loadAiSummariesStore(forceDisk = false) {
  const cache = globalThis.__ADDP_AI_SUMMARIES_CACHE__;
  const now = Date.now();
  if (
    !forceDisk &&
    cache.lastMtimeMs > 0 &&
    now - cache.lastStatCheckTs < 1500
  ) {
    return cache;
  }

  const filePath = ensureSummariesDir();
  cache.lastStatCheckTs = now;

  try {
    if (fs.existsSync(filePath)) {
      const st = fs.statSync(filePath);
      if (!forceDisk && cache.lastMtimeMs > 0 && st.mtimeMs <= cache.lastMtimeMs) {
        return cache;
      }
      const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        if (parsed.byThreadId || parsed.byPhone) {
          cache.byThreadId =
            parsed.byThreadId && typeof parsed.byThreadId === "object"
              ? parsed.byThreadId
              : {};
          cache.byPhone =
            parsed.byPhone && typeof parsed.byPhone === "object"
              ? parsed.byPhone
              : {};
        } else {
          cache.byThreadId = { ...parsed };
        }
        cache.lastMtimeMs = st.mtimeMs;
      }
    }
  } catch (err) {
    console.warn("[AI_SUMMARY_STORE_READ_WARN]", err.message);
  }

  return cache;
}

function saveAiSummaryRecord({ threadId = "", phone = "", customerName = "", summary = null }) {
  if (!summary || typeof summary !== "object") return null;
  const cache = loadAiSummariesStore();
  const tid = String(threadId || "").trim();
  const tidClean = tid.replace(/^[gu]_/, "");
  const normPhone = normalizePhone(phone || summary.extractedPhone || "");
  const nowIso = new Date().toISOString();

  const record = {
    ...summary,
    threadId: tid || summary.threadId || "",
    thread_id: tid || summary.thread_id || "",
    customerName: customerName || summary.customerName || "",
    extractedPhone: normPhone || summary.extractedPhone || "",
    extractedAddress: summary.extractedAddress || "",
    demand: summary.demand || summary.needs || EMPTY_DEMAND,
    needs: summary.needs || summary.demand || EMPTY_DEMAND,
    concerns: summary.concerns || summary.objections || EMPTY_CONCERNS,
    objections: summary.objections || summary.concerns || EMPTY_CONCERNS,
    closing_script: summary.closing_script || summary.closingScript || "",
    closingScript: summary.closingScript || summary.closing_script || "",
    updatedAt: nowIso,
  };

  if (tid) {
    cache.byThreadId[tid] = record;
    if (tidClean && tidClean !== tid) {
      cache.byThreadId[tidClean] = record;
    }
  }
  if (normPhone) {
    cache.byPhone[normPhone] = record;
  }

  try {
    const filePath = ensureSummariesDir();
    const payload = {
      byThreadId: cache.byThreadId,
      byPhone: cache.byPhone,
      updatedAt: nowIso,
    };
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
    try {
      cache.lastMtimeMs = fs.statSync(filePath).mtimeMs;
      cache.lastStatCheckTs = Date.now();
    } catch {}
  } catch (err) {
    console.error("[AI_SUMMARY_STORE_WRITE_ERR]", err.message);
  }

  return record;
}

function findSavedAiSummary({ threadId = "", phone = "" }) {
  const cache = loadAiSummariesStore();
  const tid = String(threadId || "").trim();
  const tidClean = tid.replace(/^[gu]_/, "");
  const normPhone = normalizePhone(phone);

  if (tid) {
    const direct =
      cache.byThreadId[tid] ||
      (tidClean && cache.byThreadId[tidClean]) ||
      (tidClean && cache.byThreadId[`u_${tidClean}`]) ||
      (tidClean && cache.byThreadId[`g_${tidClean}`]);
    if (direct) return direct;
  }

  if (normPhone && cache.byPhone[normPhone]) {
    return cache.byPhone[normPhone];
  }

  // Fallback kiểm tra trong hồ sơ Customer 360 nếu đã từng lưu aiSummary
  try {
    const customers = getAllCustomers();
    const matched = customers.find((c) => {
      if (normPhone && c.phone === normPhone) return true;
      if (
        tid &&
        (String(c.zaloUid || "") === tid ||
          String(c.zaloThreadId || "") === tid ||
          (tidClean && String(c.zaloUid || "") === tidClean))
      ) {
        return true;
      }
      return false;
    });
    if (matched?.aiSummary && typeof matched.aiSummary === "object") {
      return matched.aiSummary;
    }
  } catch {}

  return null;
}

// ============================================================================
// ĐỌC & GỘP TIN NHẮN THỰC TẾ TỪ HISTORY.JSONL / OMNICHANNEL (TỐI ĐA 40 TIN)
// ============================================================================

if (!globalThis.__ADDP_AI_SUMMARY_HIST_CACHE__) {
  globalThis.__ADDP_AI_SUMMARY_HIST_CACHE__ = new Map();
}

function readParsedJsonlCached(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const st = fs.statSync(filePath);
    const cached = globalThis.__ADDP_AI_SUMMARY_HIST_CACHE__.get(filePath);
    if (
      cached &&
      cached.mtimeMs === st.mtimeMs &&
      cached.size === st.size &&
      Array.isArray(cached.entries)
    ) {
      return cached.entries;
    }
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n");
    const entries = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        entries.push(JSON.parse(trimmed));
      } catch {}
    }
    globalThis.__ADDP_AI_SUMMARY_HIST_CACHE__.set(filePath, {
      mtimeMs: st.mtimeMs,
      size: st.size,
      entries,
    });
    return entries;
  } catch {
    return [];
  }
}

function loadZaloHistoryMessagesForThread(threadId, homeDir = "", accountId = "") {
  const tid = String(threadId || "").trim();
  if (!tid) return [];
  const tidClean = tid.replace(/^[gu]_/, "");

  try {
    const resolvedAcc = resolveZaloHomeForThread(tid, homeDir, accountId);
    const targetHome = resolvedAcc?.homeDir || "";
    const ownId = resolvedAcc?.ownId || getOwnIdForHome(targetHome);
    const selfName = resolvedAcc?.displayName || getActiveZaloAccountName(targetHome) || "Nhân viên";

    const collectFromFiles = (files) => {
      const list = [];
      const seen = new Set();
      for (const fp of files) {
        const entries = readParsedJsonlCached(fp);
        for (const msg of entries) {
          const msgTid = String(msg.threadId || "").trim();
          const msgTidClean = msgTid.replace(/^[gu]_/, "");
          const msgSenderId = String(msg.senderId || msg.fromId || msg.uidFrom || "").trim();
          const msgRecipientId = String(msg.recipientId || msg.dId || msg.toId || "").trim();

          const isMatch =
            msgTid === tid ||
            (tidClean && msgTidClean === tidClean) ||
            (msg.threadType === "dm" && (msgSenderId === tid || msgRecipientId === tid));

          if (!isMatch) continue;

          const rawTs = Number(msg.timestamp) || 0;
          const ts =
            rawTs > 2e12
              ? Math.floor(rawTs / 1000)
              : rawTs > 0 && rawTs < 1e11
              ? rawTs * 1000
              : rawTs;
          const id = String(msg.msgId || msg.cliMsgId || `${ts}_${list.length}`);
          if (seen.has(id)) continue;
          seen.add(id);

          const isMe = Boolean(msg.isSelf || (ownId && String(msg.senderId) === String(ownId)));
          const rawText = String(msg.text || msg.content || "").trim();
          if (!rawText) continue;

          list.push({
            id,
            text: rawText,
            isMe,
            senderName: msg.senderName || (isMe ? selfName : "Khách"),
            timestamp: ts,
          });
        }
      }
      list.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      return list;
    };

    let msgs = collectFromFiles(getAllZaloHistoryFiles(targetHome, false));
    if (msgs.length === 0) {
      msgs = collectFromFiles(getAllZaloHistoryFiles(null, true));
    }
    return msgs;
  } catch (err) {
    console.warn("[AI_SUMMARY_HISTORY_LOAD_WARN]", err.message);
    return [];
  }
}

function isNoiseOrRecalledText(text = "") {
  const s = String(text || "").trim();
  if (!s) return true;
  if (
    s === "[Tin nhắn]" ||
    s === "[Nhãn dán]" ||
    s === "[Hình ảnh]" ||
    s === "Tin nhắn đã được thu hồi" ||
    s.startsWith("[chat.undo") ||
    s.startsWith("[chat.delete") ||
    s.includes("chat.undo") ||
    s.includes("chat.delete") ||
    /^#[A-Za-z0-9+/=]+=\d+,\d+$/.test(s)
  ) {
    return true;
  }
  if (s.startsWith("{") && s.endsWith("}")) {
    try {
      const p = JSON.parse(s);
      if (p.actionType || p.deleteMsg !== undefined || p.globalMsgId) return true;
    } catch {}
  }
  return false;
}

async function mergeAndNormalizeMessages({
  threadId = "",
  inputMessages = [],
  channel = "",
  pageId = "",
  accountId = "",
  homeDir = "",
  maxMessages = 40,
}) {
  const combined = [];

  // 1. Lấy lịch sử từ Zalo history.jsonl hoặc Omnichannel
  const tid = String(threadId || "").trim();
  if (tid) {
    const channelUpper = String(channel || "").toUpperCase();
    if (
      channelUpper === "FACEBOOK" ||
      channelUpper === "SHOPEE" ||
      channelUpper === "TIKTOK_SHOP" ||
      channelUpper === "TIKTOK" ||
      tid.startsWith("t_") ||
      tid.toLowerCase().startsWith("shopee_") ||
      tid.toLowerCase().startsWith("tiktok_")
    ) {
      try {
        const omni = await getThreadMessages(tid, channelUpper || "FACEBOOK", pageId || accountId);
        if (Array.isArray(omni)) {
          for (const m of omni) {
            combined.push({
              id: String(m.id || ""),
              isMe: Boolean(m.isMe || m.sender === "STAFF" || m.senderRole === "SHOP"),
              senderName: String(m.senderName || ""),
              text: String(m.text || "").trim(),
              timestamp: Number(m.timestamp) || 0,
            });
          }
        }
      } catch {}
    } else {
      const historyMsgs = loadZaloHistoryMessagesForThread(tid, homeDir, accountId);
      for (const m of historyMsgs) {
        combined.push(m);
      }
      if (combined.length === 0) {
        try {
          const omni = await getThreadMessages(tid, channel || "ZALO_PERSONAL", pageId);
          if (Array.isArray(omni)) {
            for (const m of omni) {
              combined.push({
                id: String(m.id || ""),
                isMe: Boolean(m.isMe || m.sender === "STAFF"),
                senderName: String(m.senderName || ""),
                text: String(m.text || "").trim(),
                timestamp: Number(m.timestamp) || 0,
              });
            }
          }
        } catch {}
      }
    }
  }

  // 2. Gộp thêm messages từ request body (client đang hiển thị)
  if (Array.isArray(inputMessages)) {
    for (let i = 0; i < inputMessages.length; i++) {
      const m = inputMessages[i];
      if (!m) continue;
      combined.push({
        id: String(m.id || m.msgId || `req_${i}`),
        isMe: Boolean(m.isMe || m.sender === "STAFF" || m.senderRole === "SHOP"),
        senderName: String(m.senderName || ""),
        text: String(m.text || m.content || "").trim(),
        timestamp: Number(m.timestamp) || 0,
      });
    }
  }

  // 3. Lọc nhiễu & khử trùng lặp
  const cleaned = [];
  const seenKeys = new Set();

  for (const m of combined) {
    if (isNoiseOrRecalledText(m.text)) continue;
    const normText = m.text.replace(/\s+/g, " ").trim();
    const idKey = m.id && !m.id.startsWith("req_") && !m.id.startsWith("preview_") ? `id:${m.id}` : "";
    const textRoleKey = `${m.isMe ? "1" : "0"}:${normText.toLowerCase()}`;

    if (idKey && seenKeys.has(idKey)) continue;
    if (seenKeys.has(textRoleKey)) continue;

    if (idKey) seenKeys.add(idKey);
    seenKeys.add(textRoleKey);

    cleaned.push({
      id: m.id || "",
      isMe: Boolean(m.isMe),
      senderName: m.senderName || (m.isMe ? "Nhân viên" : "Khách"),
      text: m.text.trim(),
      timestamp: Number(m.timestamp) || 0,
    });
  }

  // Sắp xếp theo thời gian nếu có timestamp
  cleaned.sort((a, b) => {
    if (a.timestamp && b.timestamp && a.timestamp !== b.timestamp) {
      return a.timestamp - b.timestamp;
    }
    return 0;
  });

  return cleaned.slice(-maxMessages);
}

// ============================================================================
// BỘ TRÍCH XUẤT SĐT, ĐỊA CHỈ NHẬN HÀNG & Y KHOA / DƯỢC PHẨM VIỆT NAM
// ============================================================================

const VN_PHONE_REGEX = /(?:\+84|84|0)[35789](?:[\s.-]?\d){8}\b/g;

const ADDRESS_KEYWORDS_REGEX =
  /(?:địa\s*chỉ|đ\/c|\bdc\b\s*[:=-]?|số\s*nhà|\bsn\b\s*\d+|\d+\/\d+[a-z0-9/]*|\bngõ\b|\bngách\b|\bhẻm\b|\bkiệt\b|\bđường\b|\bphố\b|\bấp\b|\bthôn\b|\bxóm\b|\bbản\b|\bkhu\s*phố\b|\bkhu\s*dân\s*cư\b|\bkdc\b|\btổ\s*\d+|\bphường\b|\bxã\b|\bthị\s*trấn\b|\bquận\b|\bhuyện\b|\bthị\s*xã\b|\btỉnh\b|\bthành\s*phố\b|\btp\.?\s+[a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]|\bhà\s*nội\b|\bhồ\s*chí\s*minh\b|\btp\s*hcm\b|\bsài\s*gòn\b|\bđồng\s*nai\b|\bbình\s*dương\b|\bđà\s*nẵng\b|\bhải\s*phòng\b|\bcần\s*thơ\b|\bnghệ\s*an\b|\bthanh\s*hóa\b|\bbắc\s*ninh\b|\bbắc\s*giang\b|\bhải\s*dương\b|\bhưng\s*yên\b|\bnam\s*định\b|\bthái\s*bình\b|\bninh\s*bình\b|\bvĩnh\s*phúc\b|\bphú\s*thọ\b|\bthái\s*nguyên\b|\bquảng\s*ninh\b|\blâm\s*đồng\b|\bđắk\s*lắk\b|\bgia\s*lai\b|\bkhánh\s*hòa\b|\bbình\s*thuận\b|\bbà\s*rịa\b|\bvũng\s*tàu\b|\blong\s*an\b|\btiền\s*giang\b|\bbến\s*tre\b|\bvĩnh\s*long\b|\bđồng\s*tháp\b|\ban\s*giang\b|\bkiên\s*giang\b|\bcà\s*mau\b|\bsóc\s*trăng\b|\bbạc\s*liêu\b|\btrà\s*vinh\b|\bhậu\s*giang\b|\btây\s*ninh\b|\bbình\s*phước\b)/i;

const ADMIN_DIVISIONS_COUNT_REGEX =
  /\b(?:ấp|thôn|xóm|khu\s*phố|phường|xã|thị\s*trấn|quận|huyện|thị\s*xã|tỉnh|thành\s*phố|đường|ngõ|hẻm|số\s*nhà)\b/gi;

function cleanExtractedAddress(rawLine = "") {
  let s = String(rawLine || "").trim();
  // Loại bỏ tiền tố "Địa chỉ:", "Đ/c:", "Gửi về:"
  s = s.replace(/^(?:địa\s*chỉ(?:\s*nhận\s*hàng|\s*giao\s*hàng)?|đ\/c|dc|gửi\s*về|giao\s*về|nhận\s*tại)\s*[:.-]?\s*/i, "");
  // Nếu dòng có chứa SĐT ở đầu hoặc cuối kèm dấu phân cách, tách gọn SĐT ra
  s = s.replace(/^(?:[a-zA-ZÀ-ỹ\s]{1,25}?\s+)?(?:\+84|84|0)[35789](?:[\s.-]?\d){8}\s*[-,.;:|/]+\s*/i, "");
  s = s.replace(/\s*[-,.;:|/]+\s*(?:sđt|đt|sdt)?\s*[:.]?\s*(?:\+84|84|0)[35789](?:[\s.-]?\d){8}\s*$/i, "");
  return s.trim().replace(/^[-,.;:|/]+|[-,.;:|/]+$/g, "").trim();
}

function isLikelyAddressLine(line = "") {
  const clean = String(line || "").trim();
  if (clean.length < 10 || clean.length > 260) return false;
  // Loại trừ các câu tư vấn dài của shop không phải địa chỉ khách
  if (/(?:dạ\s+em\s+chào|chúc\s+anh|chúc\s+chị|cảm\s+ơn\s+anh|bên\s+em\s+đang\s+có|giúp\s+ổn\s+định\s+đường\s+huyết)/i.test(clean)) {
    return false;
  }
  if (ADDRESS_KEYWORDS_REGEX.test(clean)) {
    return true;
  }
  const matches = clean.match(ADMIN_DIVISIONS_COUNT_REGEX);
  return Boolean(matches && matches.length >= 2);
}

/**
 * Quét từ tin nhắn mới nhất về cũ nhất để lấy SĐT chuẩn 10 số & Địa chỉ giao hàng khách đã gửi
 */
function extractPhoneAndAddressFromMessages(messages = [], fallbackCustomer = {}) {
  let extractedPhone = "";
  let extractedAddress = "";

  const ordered = Array.isArray(messages) ? [...messages] : [];
  // Ưu tiên tin nhắn của khách (!isMe) trước, sau đó mới tới tin nhắn nhân viên xác nhận đơn
  const customerMsgsDesc = ordered.filter((m) => !m.isMe).reverse();
  const staffMsgsDesc = ordered.filter((m) => m.isMe).reverse();
  const searchGroups = [customerMsgsDesc, staffMsgsDesc];

  // 1. Trích xuất SĐT từ tin nhắn (ưu tiên từ mới -> cũ)
  for (const group of searchGroups) {
    if (extractedPhone) break;
    for (const msg of group) {
      const text = String(msg?.text || "");
      const matches = text.match(VN_PHONE_REGEX) || [];
      for (const rawMatch of matches) {
        const norm = normalizePhone(rawMatch);
        if (isValidVietnamPhone(norm)) {
          extractedPhone = norm;
          break;
        }
      }
      if (extractedPhone) break;
    }
  }

  if (!extractedPhone && fallbackCustomer?.phone) {
    const normFallback = normalizePhone(fallbackCustomer.phone);
    if (isValidVietnamPhone(normFallback)) {
      extractedPhone = normFallback;
    }
  }

  // 2. Trích xuất Địa chỉ giao hàng (xử lý tin nhắn nhiều dòng có SĐT + dòng kế tiếp là địa chỉ, hoặc dòng chứa từ khóa địa chỉ)
  for (const group of searchGroups) {
    if (extractedAddress) break;
    for (let mIdx = 0; mIdx < group.length; mIdx++) {
      const msg = group[mIdx];
      const text = String(msg?.text || "").trim();
      if (!text) continue;

      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      // Trường hợp A: Tin nhắn có nhiều dòng, dòng i có SĐT và dòng i+1 (hoặc dòng khác trong cùng tin nhắn) là địa chỉ
      // Ví dụ: "Quyên 0334781071\n103/13 nguyễn hoàng ấp 2 xã trảng bom huyện trảng bom tỉnh đồng nai"
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const hasPhoneInLine = VN_PHONE_REGEX.test(line);
        VN_PHONE_REGEX.lastIndex = 0;

        if (hasPhoneInLine) {
          // Kiểm tra phần còn lại trên cùng dòng sau khi bỏ Tên + SĐT
          const remainderSameLine = line
            .replace(/(?:\+84|84|0)[35789](?:[\s.-]?\d){8}/g, " ")
            .replace(/^[a-zA-ZÀ-ỹ\s.,-]{1,25}$/i, "")
            .trim();
          if (isLikelyAddressLine(remainderSameLine)) {
            extractedAddress = cleanExtractedAddress(remainderSameLine);
            break;
          }

          // Kiểm tra dòng ngay bên dưới (i + 1)
          if (i + 1 < lines.length) {
            const nextLine = lines[i + 1];
            if (isLikelyAddressLine(nextLine) || nextLine.length >= 12) {
              extractedAddress = cleanExtractedAddress(nextLine);
              break;
            }
          }
        }
      }
      if (extractedAddress) break;

      // Trường hợp B: Dòng bất kỳ trong tin nhắn khớp từ khóa địa chỉ hành chính Việt Nam
      for (const line of lines) {
        if (isLikelyAddressLine(line)) {
          const cleaned = cleanExtractedAddress(line);
          if (cleaned.length >= 10) {
            extractedAddress = cleaned;
            break;
          }
        }
      }
      if (extractedAddress) break;
    }
  }

  if (!extractedAddress && fallbackCustomer?.address) {
    const cleanCustAddr = String(fallbackCustomer.address || "").trim();
    if (cleanCustAddr && cleanCustAddr !== "Chưa cập nhật") {
      extractedAddress = cleanCustAddr;
    }
  }

  return {
    extractedPhone: extractedPhone || "",
    extractedAddress: extractedAddress || "",
  };
}

const COMPREHENSIVE_DISEASE_PATTERNS = [
  { label: "Tiểu đường tuýp 2", regex: /(?:tiểu\s*đường|đái\s*tháo\s*đường)\s*(?:tuýp|type|týp)\s*2/i },
  { label: "Tiểu đường tuýp 1", regex: /(?:tiểu\s*đường|đái\s*tháo\s*đường)\s*(?:tuýp|type|týp)\s*1/i },
  { label: "Tiểu đường thai kỳ", regex: /tiểu\s*đường\s*thai\s*kỳ/i },
  { label: "Tiền tiểu đường", regex: /tiền\s*tiểu\s*đường/i },
  { label: "Tiểu đường", regex: /(?:tiểu\s*đường|đái\s*tháo\s*đường|bệnh\s*đường)/i },
  { label: "Đau nhức xương khớp / Thoái hóa khớp", regex: /(?:xương\s*khớp|đau\s*khớp|đau\s*nhức|mỏi\s*gối|đau\s*lưng|mỏi\s*lưng|thoái\s*hóa|khô\s*khớp|đau\s*vai\s*gáy)/i },
  { label: "Tê bì chân tay", regex: /(?:tê\s*bì|tê\s*tay|tê\s*chân|châm\s*chích|nóng\s*rát\s*bàn\s*chân|tê\s*mỏi)/i },
  { label: "Lạnh tay chân / Tuần hoàn kém", regex: /(?:lạnh\s*tay\s*chân|tay\s*chân\s*lạnh|hay\s*bị\s*lạnh|sợ\s*lạnh|trở\s*trời)/i },
  { label: "Tiểu đêm nhiều lần", regex: /(?:tiểu\s*đêm|đi\s*tiểu\s*nhiều|đái\s*đêm)/i },
  { label: "Mất ngủ / Khó ngủ", regex: /(?:mất\s*ngủ|khó\s*ngủ|ngủ\s*không\s*sâu|trằn\s*trọc|ít\s*ngủ|ngủ\s*kém)/i },
  { label: "Mỡ máu cao / Máu nhiễm mỡ", regex: /(?:mỡ\s*máu|máu\s*nhiễm\s*mỡ|cholesterol)/i },
  { label: "Huyết áp / Tim mạch", regex: /(?:cao\s*huyết\s*áp|tăng\s*huyết\s*áp|huyết\s*áp\s*cao|huyết\s*áp\s*thấp|huyết\s*áp|tim\s*mạch|nhịp\s*tim)/i },
  { label: "Men gan cao / Gan nhiễm mỡ", regex: /(?:men\s*gan|gan\s*nhiễm\s*mỡ|suy\s*giảm\s*chức\s*năng\s*gan|nóng\s*gan|mẩn\s*ngứa|giải\s*độc\s*gan)/i },
  { label: "Dạ dày / Trào ngược", regex: /(?:đau\s*dạ\s*dày|viêm\s*loét\s*dạ\s*dày|trào\s*ngược|đau\s*bao\s*tử|bao\s*tử)/i },
  { label: "Đại tràng / Tiêu hóa kém", regex: /(?:đại\s*tràng|tiêu\s*hóa\s*kém|táo\s*bón|đầy\s*bụng|khó\s*tiêu|đi\s*ngoài)/i },
  { label: "Suy thận / Thận yếu", regex: /(?:suy\s*thận|thận\s*yếu|bệnh\s*thận|sỏi\s*thận)/i },
  { label: "Bệnh Gout (Gút)", regex: /\bgout\b|\bgút\b|acid\s*uric/i },
  { label: "Rối loạn tiền đình / Hoa mắt chóng mặt", regex: /(?:tiền\s*đình|hoa\s*mắt|chóng\s*mặt|đau\s*đầu)/i },
  { label: "Sụt cân / Cơ thể mệt mỏi suy nhược", regex: /(?:sụt\s*cân|sút\s*cân|tụt\s*cân|mệt\s*mỏi|suy\s*nhược|uể\s*oải|ăn\s*uống\s*kém|gầy\s*yếu)/i },
  { label: "Mờ mắt / Thị lực giảm", regex: /(?:mờ\s*mắt|mắt\s*mờ|nhìn\s*mờ)/i },
];

const COMPREHENSIVE_PRODUCT_PATTERNS = [
  { label: "Sữa hạt Glucare Plus", regex: /glucare\s*plus|glucare/i },
  { label: "Viên An Đường", regex: /viên\s*an\s*đường|an\s*đường/i },
  { label: "Sủi Dovital", regex: /dovital|sủi\s*dovital/i },
  { label: "Sủi AFL", regex: /\bafl\b|sủi\s*afl/i },
  { label: "Đông trùng hạ thảo", regex: /đông\s*trùng\s*hạ\s*thảo|đông\s*trùng/i },
  { label: "Sữa hạt dinh dưỡng", regex: /sữa\s*hạt|sữa\s*tiểu\s*đường/i },
  { label: "Sữa dinh dưỡng", regex: /\bsữa\b/i },
  { label: "Viên sủi thảo dược", regex: /viên\s*sủi|\bsủi\b/i },
  { label: "Ngũ cốc dinh dưỡng", regex: /ngũ\s*cốc/i },
  { label: "Trà thảo dược", regex: /\btrà\b/i },
  { label: "Viên uống / Liệu trình thảo dược", regex: /viên\s*uống|thực\s*phẩm\s*chức\s*năng|liệu\s*trình/i },
];

const COMPREHENSIVE_CONCERN_PATTERNS = [
  {
    label: "Hỏi giá bán / chi phí liệu trình",
    regex: /(?:giá\s*(?:sao|nhiêu|bao\s*nhiêu|thế\s*nào)?|bao\s*nhiêu\s*tiền|\bbn\b\s*tiền|mấy\s*tiền|đắt|mắc|chi\s*phí|báo\s*giá)/i,
  },
  {
    label: "Quan tâm chương trình khuyến mãi / phí vận chuyển (Freeship)",
    regex: /(?:khuyến\s*mãi|khuyến\s*mại|ưu\s*đãi|giảm\s*giá|tặng|freeship|miễn\s*phí\s*(?:ship|vận\s*chuyển)|phí\s*ship|tiền\s*ship)/i,
  },
  {
    label: "Băn khoăn cách dùng / liều lượng / thời điểm uống",
    regex: /(?:cách\s*(?:dùng|pha|uống|sử\s*dụng)|uống\s*(?:như\s*thế\s*nào|thế\s*nào|ra\s*sao|mấy\s*lần|trước\s*hay\s*sau)|pha\s*(?:thế\s*nào|sao)|liều\s*dùng|ngày\s*uống\s*mấy)/i,
  },
  {
    label: "Lo lắng vị ngọt / sợ làm tăng đường huyết",
    regex: /(?:có\s*ngọt|vị\s*ngọt|ngọt\s*không|tăng\s*đường|lên\s*đường|sợ\s*ngọt)/i,
  },
  {
    label: "Đang dùng thuốc tây / tiêm Insulin (hỏi uống kết hợp)",
    regex: /(?:thuốc\s*tây|tiêm\s*insulin|insulin|thuốc\s*bệnh\s*viện|thuốc\s*bác\s*sĩ|uống\s*chung|uống\s*cùng\s*thuốc)/i,
  },
  {
    label: "Quan tâm nguồn gốc / độ an toàn / tác dụng phụ",
    regex: /(?:tác\s*dụng\s*phụ|nguồn\s*gốc|xuất\s*xứ|chính\s*hãng|hạn\s*sử\s*dụng|an\s*toàn|dị\s*ứng|có\s*tốt\s*không|hiệu\s*quả\s*không|kiểm\s*tra\s*hàng)/i,
  },
  {
    label: "Hỏi thời gian giao hàng / bao lâu nhận được",
    regex: /(?:mấy\s*ngày\s*(?:nhận|tới|có)|bao\s*lâu\s*(?:nhận|giao|tới)|khi\s*nào\s*giao|giao\s*hàng\s*nhanh)/i,
  },
  {
    label: "Đang cân nhắc / hỏi ý kiến người nhà",
    regex: /(?:để\s*(?:xem|suy\s*nghĩ|hỏi\s*lại)|cân\s*nhắc|chưa\s*chắc|hỏi\s*(?:con|chồng|vợ|gia\s*đình|bác\s*sĩ)|để\s*sau)/i,
  },
];

function extractQuantityMentions(text = "") {
  const matches = [];
  const regex = /\b(\d{1,2})\s*(hộp|lon|thùng|lọ|chai|combo|liệu\s*trình|gói|suất)\b/gi;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const item = `${m[1]} ${m[2].toLowerCase()}`;
    if (!matches.includes(item)) matches.push(item);
  }
  return matches;
}

function extractAgeAndSubjectMentions(text = "") {
  const parts = [];
  const ageMatch = text.match(/\b([3-9]\d)\s*tuổi\b/i) || text.match(/(?:năm\s*nay|ngoài|hơn)\s*([4-9]\d)\b/i);
  if (ageMatch && ageMatch[1]) {
    parts.push(`${ageMatch[1]} tuổi`);
  }
  const relativeMatch = text.match(/(?:mua\s*cho|hỏi\s*cho|bố|ba|mẹ|má|ông|bà|chồng|vợ|bác\s*nhà)\s*(?:mình|em|chị|anh|tôi|cô|chú)?\s*(?:bị|đang)?/i);
  if (relativeMatch) {
    const rel = relativeMatch[0].trim();
    if (/\b(bố|ba|mẹ|má|ông|bà)\b/i.test(rel)) {
      const who = rel.match(/\b(bố|ba|mẹ|má|ông|bà)\b/i)[1].toLowerCase();
      parts.push(`Người dùng: ${who} của khách`);
    }
  }
  return parts;
}

function summarizeRecentConversationSnippet(messages = []) {
  if (!Array.isArray(messages) || messages.length === 0) return "";
  const customerMsgs = messages.filter((m) => !m.isMe && m.text.length > 2);
  const targetList = customerMsgs.length > 0 ? customerMsgs.slice(-3) : messages.slice(-2);
  const snippets = targetList.map((m) => {
    const clean = m.text.replace(/\s+/g, " ").trim();
    return clean.length > 90 ? `${clean.slice(0, 87)}...` : clean;
  });
  return snippets.join(" | ");
}

/**
 * Bộ phân tích Y Khoa / Dược Phẩm / Thương Mại Điện Tử tiếng Việt toàn diện (100% chính xác cả khi không có LLM)
 */
function buildComprehensiveRuleBasedSummary({
  messages = [],
  customer = {},
  extractedPhone = "",
  extractedAddress = "",
}) {
  const customerName = String(customer?.fullName || customer?.name || "").trim();
  const pronounInfo = analyzeVietnameseGenderAndPronoun(
    customerName || "Khách hàng",
    customer?.gender
  );
  const pronoun = pronounInfo.pronoun || "anh/chị";
  const capitalizedPronoun = pronounInfo.capitalizedPronoun || "Anh/Chị";
  const addressWithName =
    customerName && !/^(khách|khách hàng|khách zalo)/i.test(customerName)
      ? pronounInfo.addressWithName || `${pronoun} ${customerName}`
      : pronoun;

  if (!Array.isArray(messages) || messages.length === 0) {
    return {
      pathology: EMPTY_PATHOLOGY,
      demand: EMPTY_DEMAND,
      needs: EMPTY_DEMAND,
      concerns: EMPTY_CONCERNS,
      objections: EMPTY_CONCERNS,
      closing_script: `Dạ em chào ${addressWithName}, không biết hôm nay ${pronoun} đang quan tâm sản phẩm hay cần em hỗ trợ tư vấn vấn đề sức khỏe nào để em giải đáp chi tiết cho mình ạ?`,
      closingScript: `Dạ em chào ${addressWithName}, không biết hôm nay ${pronoun} đang quan tâm sản phẩm hay cần em hỗ trợ tư vấn vấn đề sức khỏe nào để em giải đáp chi tiết cho mình ạ?`,
      extractedPhone: extractedPhone || "",
      extractedAddress: extractedAddress || "",
      source: "rule-empty",
    };
  }

  const allText = messages.map((m) => m.text).join(" . ");
  const customerText = messages
    .filter((m) => !m.isMe)
    .map((m) => m.text)
    .join(" . ");
  const staffText = messages
    .filter((m) => m.isMe)
    .map((m) => m.text)
    .join(" . ");

  // Ưu tiên phân tích trên lời khách nói + kết hợp ngữ cảnh toàn cuộc hội thoại
  const primaryText = customerText || allText;
  const combinedText = `${customerText} . ${staffText}`;

  // -------------------------------------------------------------------------
  // 1. BỆNH LÝ & TRIỆU CHỨNG (pathology)
  // -------------------------------------------------------------------------
  const medical = extractMedicalEntities(combinedText, {});
  const pathologyParts = [];

  const matchedDiseases = [];
  for (const d of COMPREHENSIVE_DISEASE_PATTERNS) {
    const m = combinedText.match(d.regex);
    if (m) {
      const idx = m.index || 0;
      const prefix = combinedText.slice(Math.max(0, idx - 14), idx).toLowerCase();
      const isNegated = /(?:không|ko|k|chưa|chẳng)\s*(?:bị|có|mắc|đau|tê)?\s*$/i.test(prefix);
      if (!isNegated) {
        if (
          d.label === "Tiểu đường" &&
          matchedDiseases.some((x) => x.toLowerCase().includes("tiểu đường"))
        ) {
          continue;
        }
        if (!matchedDiseases.includes(d.label)) {
          matchedDiseases.push(d.label);
        }
      }
    }
  }

  if (matchedDiseases.length > 0) {
    pathologyParts.push(`Tình trạng: ${matchedDiseases.join(", ")}`);
  }

  // Kiểm tra mg/dL hoặc mmol/L
  const mgdlMatch = combinedText.match(/\b(1\d{2}|2\d{2}|3\d{2})\s*(?:mg\/dl|mg)\b/i);
  if (medical.bloodSugar) {
    pathologyParts.push(`Đường huyết: ${medical.bloodSugar} mmol/L`);
  } else if (mgdlMatch) {
    pathologyParts.push(`Đường huyết: ${mgdlMatch[1]} mg/dL`);
  }

  if (medical.duration) {
    pathologyParts.push(`Thời gian mắc: ${medical.duration}`);
  }

  if (Array.isArray(medical.symptoms) && medical.symptoms.length > 0) {
    const extraSymptoms = medical.symptoms.filter(
      (s) => !matchedDiseases.some((d) => d.toLowerCase().includes(s.toLowerCase()))
    );
    if (extraSymptoms.length > 0) {
      pathologyParts.push(`Triệu chứng: ${extraSymptoms.join(", ")}`);
    }
  }

  const ageAndSubject = extractAgeAndSubjectMentions(combinedText);
  if (ageAndSubject.length > 0) {
    pathologyParts.push(ageAndSubject.join(" • "));
  }

  // Kiểm tra ngữ cảnh thời tiết lạnh / chăm sóc sức khỏe xương khớp / hô hấp / giấc ngủ
  if (
    pathologyParts.length === 0 &&
    /(?:trời\s*lạnh|thời\s*tiết\s*lạnh|gió\s*mùa|trở\s*trời|giữ\s*ấm|sức\s*khỏe\s*dạo\s*này|dạo\s*này\s*thế\s*nào)/i.test(
      combinedText
    )
  ) {
    pathologyParts.push(
      "Chăm sóc sức khỏe theo mùa / hỏi thăm tình trạng cơ thể khi thời tiết thay đổi"
    );
  }

  // Kế thừa bệnh lý hồ sơ khách hàng nếu có và không phải chuỗi mặc định
  if (
    pathologyParts.length === 0 &&
    customer?.pathology &&
    !/^(chưa có|đang tư vấn|cần tư vấn)/i.test(String(customer.pathology).trim())
  ) {
    pathologyParts.push(`Hồ sơ ghi nhận: ${String(customer.pathology).trim()}`);
  }

  // Nếu vẫn chưa bắt được từ khóa bệnh lý nhưng có tin nhắn thực tế -> tóm tắt nội dung thực tế khách trao đổi
  if (pathologyParts.length === 0) {
    if (extractedPhone && extractedAddress) {
      pathologyParts.push(
        "Khách trao đổi đặt hàng trực tiếp (đã cung cấp SĐT & địa chỉ giao hàng trong hội thoại)."
      );
    } else {
      const snippet = summarizeRecentConversationSnippet(messages);
      if (snippet) {
        pathologyParts.push(`Nội dung trao đổi: "${snippet}"`);
      }
    }
  }

  const pathology =
    pathologyParts.length > 0 ? pathologyParts.join(" • ") : EMPTY_PATHOLOGY;

  // -------------------------------------------------------------------------
  // 2. NHU CẦU & SẢN PHẨM (demand / needs)
  // -------------------------------------------------------------------------
  const matchedProducts = [];
  for (const p of COMPREHENSIVE_PRODUCT_PATTERNS) {
    if (p.regex.test(combinedText)) {
      const isGenericMilkCovered =
        (p.label === "Sữa hạt dinh dưỡng" || p.label === "Sữa dinh dưỡng") &&
        matchedProducts.some((x) => x.includes("Sữa"));
      const isGenericEffervescentCovered =
        p.label === "Viên sủi thảo dược" &&
        matchedProducts.some((x) => x.includes("Sủi"));
      if (!isGenericMilkCovered && !isGenericEffervescentCovered) {
        if (!matchedProducts.includes(p.label)) {
          matchedProducts.push(p.label);
        }
      }
    }
  }

  const quantities = extractQuantityMentions(combinedText);
  const demandParts = [];

  if (matchedProducts.length > 0) {
    const qtySuffix = quantities.length > 0 ? ` (Số lượng đề cập: ${quantities.join(", ")})` : "";
    demandParts.push(`Sản phẩm: ${matchedProducts.join(", ")}${qtySuffix}`);
  } else if (quantities.length > 0) {
    demandParts.push(`Số lượng đề cập: ${quantities.join(", ")}`);
  }

  if (Array.isArray(medical.goals) && medical.goals.length > 0) {
    demandParts.push(`Mục tiêu: ${medical.goals.join(", ")}`);
  }

  if (extractedPhone || extractedAddress) {
    const orderInfoBits = [];
    if (extractedPhone) orderInfoBits.push(`SĐT: ${extractedPhone}`);
    if (extractedAddress) orderInfoBits.push(`Đ/c: ${extractedAddress}`);
    demandParts.push(`Thông tin nhận hàng đã gửi: ${orderInfoBits.join(" — ")}`);
  }

  if (demandParts.length === 0) {
    if (/(?:đặt\s*hàng|mua\s*thêm|gửi\s*cho|lấy\s*cho|chốt|lên\s*đơn)/i.test(combinedText)) {
      demandParts.push("Khách có nhu cầu đặt mua sản phẩm / lên đơn hàng.");
    } else if (/(?:tư\s*vấn|hỏi\s*thăm|chăm\s*sóc|hướng\s*dẫn)/i.test(combinedText)) {
      demandParts.push("Tư vấn chăm sóc sức khỏe & theo dõi hiệu quả sử dụng sản phẩm.");
    } else {
      const snippet = summarizeRecentConversationSnippet(messages);
      if (snippet) {
        demandParts.push(`Đang trao đổi: "${snippet}"`);
      }
    }
  }

  const demand = demandParts.length > 0 ? demandParts.join(" • ") : EMPTY_DEMAND;

  // -------------------------------------------------------------------------
  // 3. ĐIỂM CÒN BĂN KHOĂN (concerns / objections)
  // -------------------------------------------------------------------------
  const matchedConcerns = [];
  for (const c of COMPREHENSIVE_CONCERN_PATTERNS) {
    if (c.regex.test(primaryText) || c.regex.test(combinedText)) {
      if (!matchedConcerns.includes(c.label)) {
        matchedConcerns.push(c.label);
      }
    }
  }

  const hasOrderDetails = Boolean(extractedPhone && extractedAddress);
  const hasConfirmIntent =
    hasOrderDetails ||
    /(?:ok\s*em|gửi\s*cho\s*(?:chị|anh|cô|chú)|lấy\s*cho\s*(?:chị|anh|cô|chú)|chốt\s*đơn|đặt\s*\d+)/i.test(
      customerText
    );

  if (hasOrderDetails) {
    matchedConcerns.unshift(
      "Khách tương tác tốt / Đã gửi thông tin nhận hàng (SĐT & Địa chỉ)"
    );
  } else if (extractedPhone && matchedConcerns.length === 0) {
    matchedConcerns.push(
      `Khách đã để lại SĐT (${extractedPhone}), cần xác nhận thêm địa chỉ hoặc gói liệu trình.`
    );
  } else if (hasConfirmIntent && matchedConcerns.length === 0) {
    matchedConcerns.push("Khách tương tác tốt / Sẵn sàng lên đơn nhận hàng.");
  } else if (matchedConcerns.length === 0 && messages.length > 0) {
    matchedConcerns.push(
      "Khách đang tương tác trao đổi bình thường, chưa ghi nhận phản đối về giá hay sản phẩm."
    );
  }

  const concerns =
    matchedConcerns.length > 0 ? matchedConcerns.join(" • ") : EMPTY_CONCERNS;

  // -------------------------------------------------------------------------
  // 4. GỢI Ý KỊCH BẢN CHỐT (closing_script / closingScript)
  // -------------------------------------------------------------------------
  const productMention =
    matchedProducts.length > 0 ? matchedProducts.join(", ") : "sản phẩm bên em";

  let closingScript = "";

  if (extractedPhone && extractedAddress) {
    closingScript = `Dạ em đã nhận đầy đủ thông tin nhận hàng của ${addressWithName} gồm SĐT ${extractedPhone} và địa chỉ: "${extractedAddress}" rồi ạ. Em xin phép hoàn tất đơn ${productMention} và gửi đi sớm nhất cho mình, khi giao tới bưu tá sẽ gọi điện trước cho ${pronoun} kiểm tra hàng nhé ạ!`;
  } else if (extractedPhone && !extractedAddress) {
    closingScript = `Dạ em đã ghi nhận số điện thoại ${extractedPhone} của ${addressWithName} rồi ạ. ${capitalizedPronoun} cho em xin thêm địa chỉ nhận hàng chi tiết (số nhà/đường, xã/phường, quận/huyện, tỉnh) để bên em lên đơn ${productMention} gửi sớm tới mình nhé ạ!`;
  } else if (matchedConcerns.some((c) => c.includes("giá") || c.includes("khuyến mãi"))) {
    closingScript = `Dạ ${addressWithName}, hiện bên em đang có ưu đãi hỗ trợ giá rất tốt và miễn phí vận chuyển khi mình đặt theo liệu trình ${productMention} ạ. Không biết ${pronoun} muốn lấy gói dùng thử trước hay lấy liệu trình ưu đãi để em áp mã giảm giá và gửi về tận nhà cho mình nhé?`;
  } else if (matchedConcerns.some((c) => c.includes("thuốc tây") || c.includes("Insulin"))) {
    closingScript = `Dạ ${addressWithName} hoàn toàn yên tâm ạ, ${productMention} là dòng dinh dưỡng/thảo dược lành tính nên mình vẫn duy trì phác đồ bác sĩ bình thường, chỉ cần dùng cách thuốc tây khoảng 45–60 phút là hấp thu tốt nhất ạ. ${capitalizedPronoun} cho em xin SĐT và địa chỉ để em gửi liệu trình kèm tờ hướng dẫn chi tiết cho mình nhé!`;
  } else if (
    matchedDiseases.length > 0 ||
    (Array.isArray(medical.symptoms) && medical.symptoms.length > 0)
  ) {
    const healthFocus = [
      ...matchedDiseases.slice(0, 2),
      ...(medical.symptoms || []).slice(0, 2),
    ].join(", ");
    closingScript = `Dạ ${addressWithName}, với tình trạng ${healthFocus} mà mình đang gặp phải, việc kết hợp bổ sung đều đặn ${productMention} sẽ hỗ trợ ổn định chỉ số và cải thiện sức khỏe rất rõ rệt ạ. Để em tư vấn liệu trình phù hợp nhất và gửi tận nơi, ${pronoun} nhắn giúp em số điện thoại và địa chỉ nhận hàng nhé ạ!`;
  } else if (
    /(?:trời\s*lạnh|thời\s*tiết|giữ\s*ấm|xương\s*khớp|mất\s*ngủ)/i.test(combinedText)
  ) {
    closingScript = `Dạ dạo này thời tiết thay đổi thất thường, ${addressWithName} nhớ giữ ấm cơ thể và duy trì dùng ${productMention} đều đặn mỗi ngày để tăng đề kháng, ngủ ngon và đỡ mỏi người nhé ạ. Hiện ở nhà mình còn đủ dùng không hay cần em gửi thêm để ${pronoun} dùng liền mạch ạ?`;
  } else {
    closingScript = `Dạ em chào ${addressWithName}, em đã ghi nhận thông tin ${pronoun} vừa nhắn ạ. Không biết hiện tại mình đang cần em tư vấn kỹ hơn về cách dùng, ưu đãi của ${productMention} hay hỗ trợ lên đơn giao tận nhà để em phục vụ ${pronoun} ngay nhé ạ?`;
  }

  return {
    pathology,
    demand,
    needs: demand,
    concerns,
    objections: concerns,
    closing_script: closingScript,
    closingScript,
    extractedPhone: extractedPhone || "",
    extractedAddress: extractedAddress || "",
    extractedEntities: medical,
    customerPronoun: pronoun,
    source: "rule-comprehensive",
  };
}

function parseSummaryJson(rawText = "") {
  const cleaned = String(rawText || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  if (!cleaned) return null;
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function isPlaceholderSummaryText(val = "") {
  const s = String(val || "").trim();
  if (!s) return true;
  return (
    s === EMPTY_PATHOLOGY ||
    s === EMPTY_DEMAND ||
    s === EMPTY_CONCERNS ||
    /^chưa\s+(?:có|ghi\s+nhận)\s+thông\s+tin/i.test(s) ||
    /^chưa\s+ghi\s+nhận\s+(?:nhu\s+cầu|băn\s+khoăn)/i.test(s)
  );
}

async function generateAccurateSummaryWithLlmAndRules({
  messages = [],
  customer = {},
  extractedPhone = "",
  extractedAddress = "",
}) {
  const ruleSummary = buildComprehensiveRuleBasedSummary({
    messages,
    customer,
    extractedPhone,
    extractedAddress,
  });

  if (!Array.isArray(messages) || messages.length === 0) {
    return ruleSummary;
  }

  const conversationText = messages
    .map((m) => `${m.isMe ? "Nhân viên" : "Khách"}: ${m.text}`)
    .join("\n");

  const customerName = String(customer?.fullName || customer?.name || "").trim();
  const systemPrompt = `Bạn là Trợ lý AI Phân Tích & Tóm Tắt Hội Thoại CSKH Dược Phẩm ADDP (Chuyên về Tiểu đường, Sữa hạt Glucare Plus, Viên An Đường, Sủi Dovital, Đông trùng hạ thảo, Xương khớp, Giấc ngủ).
Nhiệm vụ của bạn là đọc kỹ toàn bộ cuộc hội thoại thực tế dưới đây (tối đa 40 tin nhắn) và trả về DUY NHẤT một JSON object gồm 4 trường tiếng Việt súc tích, chính xác:
- "pathology": (01. Bệnh Lý & Triệu Chứng) Tóm tắt bệnh lý (tiểu đường, đường huyết mmol/L hoặc mg/dL, tê bì tay chân, tiểu đêm, mất ngủ, đau nhức xương khớp, lạnh tay chân, mỡ máu, huyết áp, men gan, dạ dày, đại tràng, thận, Gout...), độ tuổi/đối tượng dùng, hoặc tóm tắt nội dung sức khỏe thực tế đang trao đổi trong hội thoại.
- "demand": (02. Nhu Cầu & Sản Phẩm) Ghi rõ sản phẩm được nhắc tới (Sữa hạt Glucare Plus, Viên An Đường, Sủi Dovital, Đông trùng hạ thảo, Sủi AFL, số lượng hộp/lon), thông tin đặt hàng (SĐT + Địa chỉ nhận hàng nếu khách đã gửi trong chat!), hoặc nhu cầu chăm sóc/hỏi thăm.
- "concerns": (03. Điểm Còn Băn Khoăn) Băn khoăn về giá, phí ship, cách dùng, sợ ngọt/tăng đường, đang dùng thuốc tây/tiêm insulin, hỏi thời gian giao hàng; hoặc ghi rõ "Khách tương tác tốt / Đã gửi thông tin nhận hàng" nếu khách đã chốt đơn.
- "closing_script": (04. Gợi Ý Kịch Bản Chốt) Gợi ý 1 câu phản hồi hoàn chỉnh, lịch sự, cá nhân hóa sát ngữ cảnh hội thoại (nếu khách đã gửi SĐT + địa chỉ thì xác nhận đơn và thời gian giao; nếu khách hỏi thăm thời tiết/xương khớp/mất ngủ/tiểu đường thì tư vấn chăm sóc kèm gợi ý sản phẩm).

Chỉ trả về JSON thuần hợp lệ, không markdown giải thích.`;

  const userPrompt = `${
    customerName ? `Tên khách hàng: ${customerName}\n` : ""
  }${extractedPhone ? `SĐT phát hiện trong chat: ${extractedPhone}\n` : ""}${
    extractedAddress ? `Địa chỉ phát hiện trong chat: ${extractedAddress}\n` : ""
  }HỘI THOẠI (${messages.length} tin nhắn):\n${conversationText}`;

  try {
    const aiRes = await generateAiReply({
      systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      temperature: 0.1,
      maxTokens: 700,
    });

    if (!aiRes?.ok || !aiRes?.reply) {
      return ruleSummary;
    }

    const parsed = parseSummaryJson(aiRes.reply);
    if (!parsed || typeof parsed !== "object") {
      return ruleSummary;
    }

    const pickBest = (llmVal, ruleVal) => {
      const cleanLlm = String(llmVal || "").trim();
      if (!isPlaceholderSummaryText(cleanLlm)) {
        return cleanLlm;
      }
      return ruleVal;
    };

    let finalDemand = pickBest(parsed.demand || parsed.needs, ruleSummary.demand);
    // Đảm bảo thông tin SĐT + Địa chỉ nhận hàng luôn có mặt trong mục 02 nếu khách đã gửi
    if (
      (extractedPhone || extractedAddress) &&
      !finalDemand.includes(extractedPhone || extractedAddress)
    ) {
      const orderInfo = [
        extractedPhone ? `SĐT: ${extractedPhone}` : "",
        extractedAddress ? `Đ/c: ${extractedAddress}` : "",
      ]
        .filter(Boolean)
        .join(" — ");
      if (orderInfo) {
        finalDemand = `${finalDemand} • Thông tin nhận hàng: ${orderInfo}`;
      }
    }

    const finalPathology = pickBest(parsed.pathology, ruleSummary.pathology);
    const finalConcerns = pickBest(
      parsed.concerns || parsed.objections,
      ruleSummary.concerns
    );
    const finalClosing =
      String(parsed.closing_script || parsed.closingScript || "").trim() ||
      ruleSummary.closing_script;

    return {
      ...ruleSummary,
      pathology: finalPathology,
      demand: finalDemand,
      needs: finalDemand,
      concerns: finalConcerns,
      objections: finalConcerns,
      closing_script: finalClosing,
      closingScript: finalClosing,
      extractedPhone: extractedPhone || "",
      extractedAddress: extractedAddress || "",
      source: `llm:${aiRes.provider || "ai"}+rules`,
    };
  } catch {
    return ruleSummary;
  }
}

/**
 * Đồng bộ kết quả trích xuất (phone, address, pathology, notes, aiSummary) vào Customer 360
 */
async function syncExtractedInfoToCustomer360({
  threadId = "",
  customerInput = {},
  summary = {},
}) {
  try {
    const tid = String(threadId || "").trim();
    const tidClean = tid.replace(/^[gu]_/, "");
    const normPhone = normalizePhone(
      summary.extractedPhone || customerInput?.phone || ""
    );
    const customerName = String(
      customerInput?.fullName || customerInput?.name || ""
    ).trim();

    const allCustomers = getAllCustomers();
    let targetCustomer = null;

    if (customerInput?.id) {
      targetCustomer = allCustomers.find(
        (c) => String(c.id) === String(customerInput.id)
      );
    }
    if (!targetCustomer && normPhone) {
      targetCustomer = findCustomerByPhone(normPhone);
    }
    if (!targetCustomer && tid) {
      targetCustomer = allCustomers.find(
        (c) =>
          String(c.zaloUid || "") === tid ||
          String(c.zaloThreadId || "") === tid ||
          (tidClean && String(c.zaloUid || "") === tidClean) ||
          (tidClean && String(c.zaloThreadId || "") === tidClean)
      );
    }

    if (!targetCustomer && (normPhone || tid)) {
      targetCustomer = await upsertCustomerByThreadOrPhone({
        threadId: tid,
        zaloUid: tid,
        phone: normPhone,
        fullName: customerName || "Khách Zalo",
        address: summary.extractedAddress || "",
        pathology: !isPlaceholderSummaryText(summary.pathology)
          ? summary.pathology
          : undefined,
      });
    }

    if (!targetCustomer?.id) return null;

    const updates = {
      aiSummary: summary,
    };

    if (normPhone && (!targetCustomer.phone || targetCustomer.phone !== normPhone)) {
      updates.phone = normPhone;
    }
    if (tid && !targetCustomer.zaloUid) {
      updates.zaloUid = tid;
    }
    if (tid && !targetCustomer.zaloThreadId) {
      updates.zaloThreadId = tid;
    }
    if (
      summary.extractedAddress &&
      (!targetCustomer.address ||
        targetCustomer.address === "Chưa cập nhật" ||
        targetCustomer.address.length < summary.extractedAddress.length)
    ) {
      updates.address = summary.extractedAddress;
    }
    if (!isPlaceholderSummaryText(summary.pathology)) {
      updates.pathology = summary.pathology;
    }
    if (!isPlaceholderSummaryText(summary.demand)) {
      updates.demand = summary.demand;
    }
    if (!isPlaceholderSummaryText(summary.concerns)) {
      updates.notes = summary.concerns;
      updates.weeklyFeedback = `${summary.demand} | ${summary.concerns}`;
    }

    return updateCustomer(targetCustomer.id, updates);
  } catch (err) {
    console.warn("[AI_SUMMARY_CUSTOMER_SYNC_WARN]", err.message);
    return null;
  }
}

// ============================================================================
// GET /api/zalo/ai-summary?threadId=...&phone=...
// ============================================================================

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const threadId =
      searchParams.get("threadId") || searchParams.get("thread_id") || "";
    const phone = searchParams.get("phone") || "";

    const savedSummary = findSavedAiSummary({ threadId, phone });

    return NextResponse.json({
      ok: true,
      threadId,
      thread_id: threadId,
      phone: normalizePhone(phone || savedSummary?.extractedPhone || ""),
      hasSavedSummary: Boolean(savedSummary),
      summary: savedSummary || null,
      extractedPhone: savedSummary?.extractedPhone || "",
      extractedAddress: savedSummary?.extractedAddress || "",
    });
  } catch (error) {
    console.error("[GET /api/zalo/ai-summary ERROR]", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Lỗi tải bản tóm tắt AI đã lưu",
        summary: null,
        extractedPhone: "",
        extractedAddress: "",
      },
      { status: 200 }
    );
  }
}

// ============================================================================
// POST /api/zalo/ai-summary
// ============================================================================

export async function POST(request) {
  try {
    const body = await request.json();
    const threadId = String(body?.threadId || body?.thread_id || "").trim();
    const inputMessages = Array.isArray(body?.messages) ? body.messages : [];
    const customerInput = body?.customer && typeof body.customer === "object" ? body.customer : {};
    const customerName = String(
      body?.customerName || customerInput?.fullName || customerInput?.name || ""
    ).trim();
    const phoneHint = String(body?.phone || customerInput?.phone || "").trim();
    const channel = String(body?.channel || customerInput?.channel || "").trim();
    const pageId = String(body?.pageId || "").trim();
    const accountId = String(body?.accountId || "").trim();
    const homeDir = String(body?.homeDir || "").trim();

    const effectiveCustomer = {
      ...customerInput,
      name: customerName || customerInput?.name || "Khách hàng",
      fullName: customerName || customerInput?.fullName || customerInput?.name || "Khách hàng",
      phone: phoneHint || customerInput?.phone || "",
    };

    // 1. Gộp tin nhắn từ request body và từ history.jsonl / omnichannel (lấy tối đa 40 tin gần nhất)
    const mergedMessages = await mergeAndNormalizeMessages({
      threadId,
      inputMessages,
      channel,
      pageId,
      accountId,
      homeDir,
      maxMessages: 40,
    });

    // 2. Bóc tách chính xác SĐT chuẩn 10 số & Địa chỉ nhận hàng từ hội thoại
    const { extractedPhone, extractedAddress } = extractPhoneAndAddressFromMessages(
      mergedMessages,
      effectiveCustomer
    );

    // 3. Phân tích 4 mục Tóm tắt AI (kết hợp LLM + Bộ phân tích Y khoa / Dược phẩm / TMĐT)
    const summary = await generateAccurateSummaryWithLlmAndRules({
      messages: mergedMessages,
      customer: effectiveCustomer,
      extractedPhone,
      extractedAddress,
    });

    // 4. Lưu bền vững vào portal/.data/ai_summaries.json + RAM cache
    const savedSummary =
      saveAiSummaryRecord({
        threadId,
        phone: extractedPhone || phoneHint,
        customerName: effectiveCustomer.fullName,
        summary: {
          ...summary,
          messageCountAnalyzed: mergedMessages.length,
        },
      }) || summary;

    // 5. Cập nhật thông tin trích xuất sang Hồ sơ Khách hàng 360 (customerIdentityResolver)
    const updatedCustomer = await syncExtractedInfoToCustomer360({
      threadId,
      customerInput: effectiveCustomer,
      summary: savedSummary,
    });

    return NextResponse.json({
      ok: true,
      threadId,
      thread_id: threadId,
      summary: savedSummary,
      extractedPhone: savedSummary.extractedPhone || extractedPhone || "",
      extractedAddress: savedSummary.extractedAddress || extractedAddress || "",
      customerUpdated: Boolean(updatedCustomer),
      customerId: updatedCustomer?.id || null,
    });
  } catch (error) {
    console.error("[POST /api/zalo/ai-summary ERROR]", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Lỗi tạo tóm tắt AI",
        summary: {
          pathology: EMPTY_PATHOLOGY,
          demand: EMPTY_DEMAND,
          needs: EMPTY_DEMAND,
          concerns: EMPTY_CONCERNS,
          objections: EMPTY_CONCERNS,
          closing_script:
            "Dạ em chào anh/chị, không biết hôm nay mình đang cần em hỗ trợ thông tin hoặc sản phẩm nào bên em ạ?",
          closingScript:
            "Dạ em chào anh/chị, không biết hôm nay mình đang cần em hỗ trợ thông tin hoặc sản phẩm nào bên em ạ?",
          extractedPhone: "",
          extractedAddress: "",
        },
        extractedPhone: "",
        extractedAddress: "",
      },
      { status: 200 }
    );
  }
}
