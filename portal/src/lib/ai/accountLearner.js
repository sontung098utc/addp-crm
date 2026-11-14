import fs from "fs";
import path from "path";
import { getLocalDataFilePath } from "../mariadbClient.js";

/**
 * ADDP Omnichannel AI CRM — Bộ Tự Học Phong Cách & Kinh Nghiệm Tư Vấn Theo Từng Tài Khoản
 * Mỗi tài khoản Zalo/Kênh là 1 Bot AI riêng biệt, tự động đọc toàn bộ lịch sử hội thoại
 * từ trước đến nay của tài khoản đó để:
 *  1. Học cách xưng hô, giọng điệu, cách mở/kết câu của nhân viên thật trên tài khoản đó.
 *  2. Trích xuất các cặp Hỏi-Đáp (Few-Shot Q&A) thực tế để trả lời tự nhiên như người thật.
 *  3. Lưu cache bền vững để nạp vào Prompt mỗi khi Bot tư vấn.
 */

function sanitizeKey(accountKey = "") {
  return String(accountKey || "default")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getLearnedFilePath(accountKey = "") {
  return getLocalDataFilePath(`ai_learned_${sanitizeKey(accountKey)}.json`);
}

function resolveCandidateHistoryFiles(homeDir = "") {
  const files = [];
  if (!homeDir) return files;
  const cliDir = path.join(homeDir, ".zalo-agent-cli");
  for (const name of ["history.jsonl", "crm-group-history.jsonl"]) {
    const p = path.join(cliDir, name);
    if (fs.existsSync(p)) files.push(p);
  }
  return files;
}

const TOPIC_KEYWORDS = [
  { topic: "tiểu đường / đường huyết", regex: /tiểu đường|đường huyết|chỉ số|mmol|hba1c|mỡ máu|huyết áp/i },
  { topic: "sản phẩm / sữa hạt / viên an đường", regex: /sữa hạt|glucare|an đường|đông trùng|sản phẩm|hộp|lon|liệu trình/i },
  { topic: "giá bán / khuyến mãi", regex: /giá|bao nhiêu|tiền|ưu đãi|giảm|khuyến mãi|9k|dùng thử|ship|miễn phí/i },
  { topic: "cách dùng / liều dùng / thực đơn", regex: /uống|pha|cách dùng|liều|thực đơn|ăn uống|bữa phụ|đảo ngược/i },
  { topic: "triệu chứng / thể trạng", regex: /mệt|tê bì|mất ngủ|ngủ|sụt cân|tăng cân|tăng cơ|mờ mắt|tiểu đêm/i },
  { topic: "đặt hàng / giao hàng", regex: /đặt|mua|chốt|gửi|địa chỉ|sđt|số điện thoại|nhận hàng|đơn hàng/i },
];

function detectTopic(text = "") {
  for (const item of TOPIC_KEYWORDS) {
    if (item.regex.test(text)) return item.topic;
  }
  return "tư vấn chung";
}

function isUsefulChatText(text = "") {
  const clean = String(text || "").trim();
  if (clean.length < 4 || clean.length > 600) return false;
  if (/^\[(chat\.|Nhãn dán|Hình ảnh|Video|Tệp|Sticker|Ghi âm)/i.test(clean)) return false;
  if (/^https?:\/\/\S+$/i.test(clean)) return false;
  return true;
}

/**
 * Quét toàn bộ lịch sử hội thoại của một tài khoản để học phong cách & mẫu tư vấn.
 */
export function learnFromAccountHistory({
  accountKey = "",
  homeDir = "",
  accountName = "",
} = {}) {
  const historyFiles = resolveCandidateHistoryFiles(homeDir);
  const threads = new Map();
  let totalMessages = 0;

  for (const filePath of historyFiles) {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed);
          const tid = String(msg.threadId || msg.toId || msg.fromId || "").trim();
          const text = String(msg.text || msg.content || msg.msg || "").trim();
          const threadType = String(msg.threadType || "").toLowerCase();
          if (!tid || threadType === "group" || !isUsefulChatText(text)) continue;

          totalMessages++;
          if (!threads.has(tid)) threads.set(tid, []);
          threads.get(tid).push({
            isMe: Boolean(msg.isSelf || msg.isMe),
            text,
            ts: Number(msg.timestamp) || 0,
          });
        } catch {}
      }
    } catch {}
  }

  let staffMsgCount = 0;
  let totalStaffLen = 0;
  let emCount = 0;
  let conChauCount = 0;
  let politeEndCount = 0;
  const qaExamples = [];
  const seenQuestions = new Set();

  for (const msgs of threads.values()) {
    msgs.sort((a, b) => a.ts - b.ts);

    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      if (m.isMe) {
        staffMsgCount++;
        totalStaffLen += m.text.length;
        if (/\bem\b/i.test(m.text)) emCount++;
        if (/\b(con|cháu)\b/i.test(m.text)) conChauCount++;
        if (/(ạ|nhé|nha)[.!?]*$/i.test(m.text.trim())) politeEndCount++;

        // Tìm cặp Khách hỏi -> Nhân viên trả lời ngay sau đó
        if (i > 0 && !msgs[i - 1].isMe) {
          const customerQ = msgs[i - 1].text;
          // Gộp tối đa 2 tin liên tiếp của nhân viên nếu trả lời liền mạch
          let staffA = m.text;
          if (i + 1 < msgs.length && msgs[i + 1].isMe && msgs[i + 1].ts - m.ts < 60000) {
            staffA = `${staffA} ${msgs[i + 1].text}`;
          }

          if (
            customerQ.length >= 5 &&
            staffA.length >= 12 &&
            staffA.length <= 500 &&
            !/^ok|^vâng|^dạ$/i.test(staffA.trim())
          ) {
            const qNorm = customerQ.toLowerCase().slice(0, 40);
            if (!seenQuestions.has(qNorm)) {
              seenQuestions.add(qNorm);
              qaExamples.push({
                topic: detectTopic(`${customerQ} ${staffA}`),
                customer: customerQ,
                staff: staffA,
              });
            }
          }
        }
      }
    }
  }

  const avgStaffLen = staffMsgCount > 0 ? Math.round(totalStaffLen / staffMsgCount) : 120;
  const dominantSelfPronoun =
    conChauCount > emCount * 1.2 ? "con/cháu (gọi cô/chú/bác)" : "em (gọi anh/chị/cô/chú)";
  const politeRate = staffMsgCount > 0 ? Math.round((politeEndCount / staffMsgCount) * 100) : 70;

  // Giữ tối đa 80 cặp Q&A đa dạng chủ đề nhất
  const topExamples = qaExamples.slice(-80);

  const learned = {
    accountKey: accountKey || "default",
    accountName: accountName || "",
    homeDir: homeDir || "",
    totalConversations: threads.size,
    totalMessages,
    staffMessagesAnalyzed: staffMsgCount,
    qaCount: topExamples.length,
    styleSummary:
      staffMsgCount > 0
        ? `Xưng hô chủ đạo của nick này: ${dominantSelfPronoun}; độ dài trung bình ${avgStaffLen} ký tự/tin; ${politeRate}% câu kết thúc lịch sự (ạ/nhé/nha).`
        : "Chưa có nhiều tin nhắn cũ trên nick này; dùng phong cách ấm áp, lịch sự, tự nhiên.",
    qaExamples: topExamples,
    learnedAt: new Date().toISOString(),
  };

  try {
    const outPath = getLearnedFilePath(accountKey);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(learned, null, 2), "utf8");
  } catch (err) {
    console.error("[ACCOUNT_LEARNER_SAVE_ERR]", err.message);
  }

  return learned;
}

/**
 * Đọc dữ liệu đã học của tài khoản (tự động học lần đầu nếu có homeDir mà chưa học).
 */
export function getAccountLearnedData({ accountKey = "", homeDir = "", accountName = "" } = {}) {
  try {
    const filePath = getLearnedFilePath(accountKey);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
    }
  } catch {}

  if (homeDir) {
    return learnFromAccountHistory({ accountKey, homeDir, accountName });
  }
  return null;
}

/**
 * Tìm 3-4 mẫu hội thoại thực tế gần nhất với câu hỏi hiện tại của khách để làm Few-Shot cho AI.
 */
export function findRelevantLearnedExamples(learnedData, customerMessage = "", limit = 4) {
  const examples = Array.isArray(learnedData?.qaExamples) ? learnedData.qaExamples : [];
  if (examples.length === 0) return [];

  const msgLower = String(customerMessage || "").toLowerCase();
  const msgTopic = detectTopic(msgLower);
  const tokens = msgLower
    .split(/[\s,.;:!?()]+/)
    .filter((t) => t.length >= 2);

  const scored = examples.map((ex) => {
    let score = ex.topic === msgTopic ? 3 : 0;
    const hay = `${ex.customer} ${ex.staff}`.toLowerCase();
    for (const tk of tokens) {
      if (hay.includes(tk)) score += 1;
    }
    return { ...ex, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
