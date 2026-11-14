/**
 * ADDP Omnichannel AI CRM — Bộ Não AI Sinh Câu Trả Lời Tự Nhiên & Đồng Cảm (State-Aware, Empathy & Anti-Duplicate)
 * Điều chỉnh toàn diện 4 cơ chế cốt lõi:
 * 1. Empathy & Explanation: Khi khách nêu triệu chứng ("thèm ngọt", "tụt 3 cân", "đói cồn cào", "tê bì", "nhức lưng"...),
 *    giải thích ngay cơ chế bệnh lý (tế bào đói năng lượng do không chuyển hóa được đường) + hướng dẫn ăn đảo ngược (Rau -> Đạm -> Tinh bột) & dùng 1 ly sữa hạt Isomalt.
 * 2. Anti-Interrogation Policy: Nếu hồ sơ đã có >= 2 thông tin (ví dụ: đường huyết + sụt cân/thèm ngọt/thời gian bị),
 *    NGỪNG TOÀN BỘ câu hỏi điều tra triệu chứng ("có tê bì không", "có tiểu đêm không", "có sụt cân không"), chuyển sang định hướng giải pháp dinh dưỡng.
 * 3. Context-Aware Greeting: Khi khách nhắn mở đầu ngắn ("Nói đi em", "Alo", "Tư vấn đi", "Có việc gì" hoặc "C đã hỏi gì đâu..."),
 *    trả lời lịch thiệp hỏi nhu cầu chứ tuyệt đối không xả bài quảng cáo sản phẩm.
 * 4. Anti-Duplicate Response: Tính độ tương đồng với `lastBotReply` (và các câu bot vừa gửi). Nếu > 60%, hủy câu cũ và sinh câu trả lời mới bám sát tin nhắn mới nhất của khách.
 */

import { retrieveRelevantKnowledge } from "./knowledgeBase.js";
import { generateAiReply } from "./aiRouter.js";
import { listBotProfiles, MASTER_HEALTH_CONSULTANT_PERSONA } from "./botProfileStore.js";
import { searchKnowledgeVectors } from "./vectorStore.js";
import { getAccountLearnedData, findRelevantLearnedExamples } from "./accountLearner.js";
import { extractPhoneNumbersFromText, normalizePhone } from "../customerIdentityResolver.js";
import {
  extractMedicalEntities,
  analyzeVietnameseGenderAndPronoun,
} from "../customerStore.js";

/**
 * Xác định cách xưng hô giới tính khách hàng ("chị" / "anh" / "mình") và tên ngắn gọn (ví dụ "chị Quyên", "anh Hoàng")
 */
export function detectCustomerPronoun(customerName = "", avatarUrl = "", genderFromProfile = "") {
  return analyzeVietnameseGenderAndPronoun(customerName, genderFromProfile);
}

/**
 * Chuẩn hóa tên tài khoản đang trực để xưng tên tự nhiên:
 * - "Zalo Cá Nhân (Sơn Tùng)" hoặc "Zalo: Sơn Tùng" -> "Sơn Tùng"
 * - "Thuỷ Tiên" -> "Thuỷ Tiên"
 */
export function resolveActiveStaffDisplayName(accountOrChannelName = "") {
  const raw = String(accountOrChannelName || "").trim();
  if (!raw) return null;

  const parenMatch = raw.match(/\(([^)]+)\)/);
  if (parenMatch && parenMatch[1]) {
    const inside = parenMatch[1]
      .replace(/^(dược sĩ|bác sĩ|chuyên gia|chuyên viên|sale|cskh|ai|multi-qr)\s*/i, "")
      .trim();
    if (
      inside &&
      !/^(multi-qr|ai|zalo|facebook|fanpage|official|connected|\d+)$/i.test(inside)
    ) {
      return inside;
    }
  }

  const splitParts = raw.split(/[:\-–]/).map((s) => s.trim()).filter(Boolean);
  const candidate = (splitParts.length > 1 ? splitParts[splitParts.length - 1] : raw)
    .replace(/^(zalo cá nhân|zalo oa|zalo|fanpage|dược sĩ|bác sĩ|chuyên gia|chuyên viên|nhân viên|tư vấn)\s*/gi, "")
    .replace(/\(\d+\)/g, "")
    .trim();

  if (
    !candidate ||
    /^(addp|dược phẩm addp|official|account|khách|admin|quản trị viên|default|ai|bot|\d+)$/i.test(
      candidate
    )
  ) {
    return null;
  }

  return candidate;
}

/**
 * Kiểm tra xem trong ngày hôm nay hệ thống/nhân viên đã gửi tin nhắn chào hoặc phản hồi cho khách chưa
 * để tuân thủ quy tắc: CHỈ CHÀO 1 LẦN DUY NHẤT TRONG NGÀY.
 */
export function hasAlreadyGreetedToday(conversationHistory = []) {
  if (!Array.isArray(conversationHistory) || conversationHistory.length === 0) {
    return false;
  }
  const now = new Date();
  const todayStr = now.toDateString();

  for (const msg of conversationHistory) {
    if (!msg) continue;
    const isStaffOrBot = Boolean(msg.isMe || msg.isSelf || msg.role === "assistant");
    if (!isStaffOrBot) continue;

    if (!msg.timestamp) {
      return true;
    }
    const rawTs = Number(msg.timestamp) || 0;
    const ts =
      rawTs > 2e12 ? Math.floor(rawTs / 1000) : rawTs > 0 && rawTs < 1e11 ? rawTs * 1000 : rawTs;
    if (ts > 0 && new Date(ts).toDateString() === todayStr) {
      return true;
    }
  }
  return false;
}

/**
 * Tính độ tương đồng từ vựng (Jaccard / Overlap Similarity 0.0 -> 1.0) giữa 2 câu trả lời
 * Phục vụ cơ chế Anti-Duplicate Response (> 0.60 là chặn ngay).
 */
export function calculateTextSimilarity(textA = "", textB = "") {
  const cleanA = String(textA || "")
    .toLowerCase()
    .replace(/[.,?!:;()[\]"']/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
  const cleanB = String(textB || "")
    .toLowerCase()
    .replace(/[.,?!:;()[\]"']/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);

  if (cleanA.length === 0 || cleanB.length === 0) return 0;

  const setA = new Set(cleanA);
  const setB = new Set(cleanB);
  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }

  const minSize = Math.min(setA.size, setB.size);
  const unionSize = new Set([...setA, ...setB]).size;
  const jaccard = unionSize > 0 ? intersection / unionSize : 0;
  const overlap = minSize > 0 ? intersection / minSize : 0;
  return Math.max(jaccard, overlap * 0.85);
}

/**
 * Lấy câu trả lời gần nhất của Bot/Nhân viên trong lịch sử hội thoại (`lastBotReply`)
 */
export function getLastBotReplyFromHistory(conversationHistory = []) {
  if (!Array.isArray(conversationHistory) || conversationHistory.length === 0) return "";
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const m = conversationHistory[i];
    if (m && (m.isMe || m.isSelf || m.role === "assistant") && m.text) {
      const txt = String(m.text).trim();
      if (txt.toLowerCase() !== "stop") return txt;
    }
  }
  return "";
}

/**
 * Đếm số lượng thông tin y khoa đã biết trong `knownState`
 * Nếu `knownFactCount >= 2` -> Kích hoạt Anti-Interrogation Policy (Ngừng hỏi thăm dò triệu chứng).
 */
export function countKnownMedicalFacts(knownState = {}) {
  let count = 0;
  if (knownState?.bloodSugar) count++;
  if (knownState?.duration) count++;
  if (Array.isArray(knownState?.symptoms) && knownState.symptoms.length > 0) {
    count += knownState.symptoms.length;
  }
  if (Array.isArray(knownState?.goals) && knownState.goals.length > 0) {
    count += knownState.goals.length;
  }
  return count;
}

/**
 * Gộp toàn bộ thực thể y khoa từ hồ sơ cũ + lịch sử hội thoại + tin nhắn mới nhất
 * để tạo ra `CUSTOMER_KNOWN_STATE` đầy đủ và chính xác nhất.
 */
export function buildConsolidatedMedicalState(
  customerMessage = "",
  customerProfile = {},
  conversationHistory = []
) {
  let state = {
    bloodSugar:
      customerProfile?.medicalRecord?.bloodSugar ||
      (customerProfile?.currentGlucose ? String(customerProfile.currentGlucose) : null) ||
      (customerProfile?.initialGlucose ? String(customerProfile.initialGlucose) : null),
    bloodSugarNumeric:
      customerProfile?.medicalRecord?.bloodSugarNumeric ??
      (customerProfile?.currentGlucose ? Number(customerProfile.currentGlucose) : null),
    duration: customerProfile?.medicalRecord?.duration || null,
    symptoms: Array.isArray(customerProfile?.medicalRecord?.symptoms)
      ? [...customerProfile.medicalRecord.symptoms]
      : [],
    goals: Array.isArray(customerProfile?.medicalRecord?.goals)
      ? [...customerProfile.medicalRecord.goals]
      : [],
    desiredWeightGain: customerProfile?.medicalRecord?.desiredWeightGain || null,
  };

  if (Array.isArray(conversationHistory)) {
    for (const msg of conversationHistory) {
      if (!msg || msg.isMe || msg.isSelf || msg.role === "assistant" || !msg.text) continue;
      state = extractMedicalEntities(String(msg.text), state);
    }
  }

  const finalState = extractMedicalEntities(customerMessage, state);
  return finalState;
}

/**
 * Làm sạch ký tự markdown, xóa các danh xưng cấm ("dược sĩ", "bác sĩ", "chuyên gia")
 */
function sanitizeHumanChatText(rawText = "") {
  return String(rawText || "")
    .replace(/\*\*/g, "")
    .replace(/__+/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*•+]\s+/gm, "")
    .replace(/\b(em\s+dược\s+sĩ|dược\s+sĩ\s+thảo|dược\s+sĩ|bác\s+sĩ|chuyên\s+gia)\b/gi, "em")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Tính toán độ trễ giả lập người thật đang gõ phím (~3 giây)
 */
export function calculateTypingDelayMs(replyText = "") {
  const charCount = String(replyText || "").length;
  const lengthFactor = Math.min(300, Math.floor((charCount / 200) * 200));
  const jitter = Math.floor(Math.random() * 150);
  return 3000 + lengthFactor + jitter;
}

/**
 * Bóc tách số điện thoại Việt Nam chuẩn 10 số từ tin nhắn khách gửi
 */
export function extractCustomerPhoneFromMessage(text = "") {
  if (!text || typeof text !== "string") return null;
  const extracted = extractPhoneNumbersFromText(text);
  if (extracted && extracted.length > 0) {
    return extracted[0];
  }
  const regex = /(?:\+84|84|0)(?:3|5|7|8|9)\d{8}\b/g;
  const matches = text.replace(/[.\-\s]/g, "").match(regex);
  if (matches && matches.length > 0) {
    return normalizePhone(matches[0]);
  }
  return null;
}

/**
 * Xây dựng System Instruction động chứa `CUSTOMER_KNOWN_STATE`, Anti-Interrogation Policy & Anti-Duplicate
 */
export function buildStateAwareSystemPrompt({
  staffName = null,
  pronounInfo,
  knownState,
  alreadyGreeted = false,
  lastBotReply = "",
  ragContext = "",
  customerPhone = null,
} = {}) {
  const pronoun = pronounInfo?.pronoun || "mình";
  const addressWithName = pronounInfo?.addressWithName || "mình";
  const staffIntro = staffName
    ? `Bạn là "${staffName}" — Chuyên viên tư vấn dinh dưỡng của Công ty Dược phẩm ADDP.`
    : `Bạn là Chuyên viên tư vấn dinh dưỡng bên chăm sóc sức khỏe Công ty Dược phẩm ADDP (xưng là "em").`;

  const symptomsList =
    Array.isArray(knownState?.symptoms) && knownState.symptoms.length > 0
      ? knownState.symptoms.join(", ")
      : "Chưa rõ";
  const goalsList =
    Array.isArray(knownState?.goals) && knownState.goals.length > 0
      ? knownState.goals.join(", ")
      : "Chưa rõ";
  const factCount = countKnownMedicalFacts(knownState);

  return [
    staffIntro,
    "Dựa trên tài liệu QUY TRÌNH GỌI ĐIỆN CHĂM SÓC KHÁCH HÀNG TIỂU ĐƯỜNG của Dược phẩm ADDP.",
    "",
    "=== THÔNG TIN ĐÃ BIẾT VỀ KHÁCH HÀNG (CUSTOMER_KNOWN_STATE) ===",
    `- Họ tên & Xưng hô: ${addressWithName} (đại từ: "${pronoun}")`,
    `- Đường huyết: ${knownState?.bloodSugar ? `${knownState.bloodSugar} mmol/L` : "Chưa rõ"}`,
    `- Thời gian bị: ${knownState?.duration || "Chưa rõ"}`,
    `- Nhu cầu cốt lõi (goals): ${goalsList}`,
    `- Triệu chứng đã ghi nhận (symptoms): ${symptomsList}`,
    `- Tổng số thông tin đã thu thập: ${factCount}`,
    `- Câu trả lời vừa gửi gần nhất (CẤM LẶP LẠI): "${lastBotReply || "Chưa có"}"`,
    "",
    "=== QUY TẮC BẤT DI BẤT DỊCH ===",
    "1. ĐỒNG CẢM & GIẢI THÍCH CƠ CHẾ (Empathy & Explanation): Khi khách nêu triệu chứng ('thèm ngọt', 'tụt cân', 'đói', 'tê bì', 'nhức mỏi'), giải thích ngay nguyên nhân do cơ thể không chuyển hóa được đường vào tế bào khiến tế bào bị đói năng lượng, kèm lời khuyên ăn đảo ngược (Rau -> Đạm -> Tinh bột) và bổ sung 1 ly sữa hạt đường Isomalt.",
    "2. CHÍNH SÁCH CHỐNG ĐIỀU TRA (Anti-Interrogation): Nếu hồ sơ đã có >= 2 thông tin (ví dụ đã có đường huyết + triệu chứng/thời gian), NGỪNG TOÀN BỘ câu hỏi thăm dò triệu chứng ('có tê bì không', 'có tiểu đêm không', 'có sụt cân không'). Chuyển ngay sang định hướng giải pháp dinh dưỡng.",
    "3. PHẢN XẠ MỞ ĐẦU LINH HOẠT: Khi khách nhắn ngắn ('Nói đi em', 'Alo', 'Tư vấn đi', 'Chị đã hỏi gì đâu'), trả lời lịch thiệp hỏi xem khách muốn ổn định đường huyết hay cải thiện cân nặng/thể trạng, tuyệt đối không xả bài quảng cáo sản phẩm.",
    "4. CHỐNG LẶP CÂU TRẢ LỜI: Tuyệt đối không lặp lại câu trả lời vừa gửi trước đó. Giữ độ dài 2-3 câu ngắn (< 45 từ).",
    alreadyGreeted
      ? `5. Hôm nay đã chào khách rồi: BỎ HOÀN TOÀN câu chào mở đầu, trả lời thẳng vào ý vừa nhắn của ${addressWithName}.`
      : `5. Đây là tin nhắn đầu tiên trong ngày: Mở đầu chào ngắn gọn ${addressWithName}.`,
    "",
    "=== KHO TRI THỨC & QUY TRÌNH DINH DƯỠNG ADDP ===",
    ragContext,
  ].join("\n");
}

/**
 * Chọn câu kết thúc định hướng giải pháp (khi đã có >= 2 thông tin) hoặc câu hỏi thăm khám (khi mới có < 2 thông tin)
 * Tuân thủ nghiêm ngặt Anti-Interrogation Policy.
 */
function pickClosingOrNextStepQuestion(knownState, pronoun, addressWithName) {
  const factCount = countKnownMedicalFacts(knownState);
  const hasBloodSugar = Boolean(knownState?.bloodSugar);
  const hasDuration = Boolean(knownState?.duration);
  const symptoms = Array.isArray(knownState?.symptoms) ? knownState.symptoms : [];
  const goals = Array.isArray(knownState?.goals) ? knownState.goals : [];

  // ANTI-INTERROGATION POLICY:
  // Nếu đã có >= 2 thông tin (ví dụ: đường huyết 7.0 + thời gian 1 năm / hoặc đường huyết + sụt cân / thèm ngọt),
  // NGỪNG TOÀN BỘ câu hỏi điều tra triệu chứng ("có tê bì không", "có tiểu đêm không", "có sụt cân không").
  // Chuyển sang định hướng giải pháp dinh dưỡng & hướng dẫn cách cải thiện.
  if (factCount >= 2) {
    if (symptoms.includes("thèm ngọt") || symptoms.includes("sụt cân")) {
      return `Em gửi ${addressWithName} hướng dẫn chi tiết cách ăn đảo ngược và liều dùng sữa hạt vào bữa phụ để mình áp dụng ngay nhé ạ?`;
    }
    if (symptoms.includes("mất ngủ") || symptoms.includes("đau nhức xương khớp") || symptoms.includes("tê bì")) {
      return `${addressWithName.charAt(0).toUpperCase() + addressWithName.slice(1)} muốn em hướng dẫn chi tiết khung giờ uống sữa hạt kết hợp chế độ ăn để cải thiện sớm tình trạng này nhé ạ?`;
    }
    return `Hiện ${pronoun} có đang phải kiêng khem tinh bột quá mức không để em hướng dẫn chế độ ăn đảo ngược phù hợp nhất cho ${pronoun} ạ?`;
  }

  // Khi mới có < 2 thông tin (giai đoạn đầu mới làm quen):
  if (goals.includes("tăng cân") && !knownState?.desiredWeightGain && !hasBloodSugar) {
    return `Hiện ${pronoun} muốn tăng mấy cân và đường huyết đang mấy chấm ạ?`;
  }

  if (!hasBloodSugar) {
    if (!hasDuration) {
      return `Hiện đường huyết của ${pronoun} khoảng mấy chấm và mình bị lâu chưa ạ?`;
    }
    return `Hiện đường huyết lúc đói của ${pronoun} khoảng mấy chấm rồi ạ?`;
  }

  // Mới chỉ có duy nhất 1 thông tin là bloodSugar (chưa có duration, chưa có symptoms, chưa có goals):
  return `Tối ngủ ${pronoun} có hay bị tê bì chân tay hay tiểu đêm không ${pronoun}?`;
}

/**
 * Kiểm tra tin nhắn có phải là câu mở lời ngắn / giục nói ("Nói đi em", "Alo", "Tư vấn đi", "Có việc gì", "Sao em")
 * hoặc khách vặn lại vì chưa hỏi sản phẩm ("C đã hỏi gì đâu mà bt c hỏi sữa hạt")
 */
function isShortConversationalPrompt(msgLower = "") {
  const clean = msgLower.replace(/[.,?!~]/g, "").trim();
  const shortOpeners = [
    "nói đi em",
    "nói đi",
    "noi di em",
    "noi di",
    "alo",
    "alo em",
    "tư vấn đi",
    "tư vấn đi em",
    "có việc gì",
    "có gì không em",
    "sao em",
    "gì thế em",
    "em nói đi",
    "chào em",
    "hi",
    "hello",
    "dạ",
    "vâng",
    "ok em",
    "ừ",
    "uh",
  ];
  if (shortOpeners.includes(clean)) return true;
  if (
    clean.length <= 16 &&
    /(nói đi|tư vấn đi|sao đấy|việc gì|gì đấy|alo)/i.test(clean)
  ) {
    return true;
  }
  return false;
}

/**
 * Bộ máy sinh câu trả lời theo trạng thái, giàu sự đồng cảm & giải thích cơ chế bệnh lý
 */
function generateStateAwareResponse({
  customerMessage = "",
  pronounInfo,
  staffName = null,
  alreadyGreeted = false,
  knownState,
  detectedPhoneInMsg = null,
  lastBotReply = "",
}) {
  const msgLower = String(customerMessage || "").toLowerCase().trim();
  const { pronoun, addressWithName } = pronounInfo;

  const staffIntroShort = staffName ? `, em ${staffName} bên ADDP ạ` : ` ạ`;
  const greetingPrefix = alreadyGreeted
    ? "Dạ "
    : `Dạ chào ${addressWithName}${staffIntroShort}. `;

  const newly = knownState?.newlyExtracted || {};
  const hasBloodSugar = Boolean(knownState?.bloodSugar);
  const bsValue = knownState?.bloodSugar;
  const bsNum = Number(knownState?.bloodSugarNumeric || parseFloat(bsValue) || 0);
  const durationVal = knownState?.duration;
  const allSymptoms = Array.isArray(knownState?.symptoms) ? knownState.symptoms : [];

  // =========================================================================
  // 1. Khi khách vặn lại ("C đã hỏi gì đâu mà bt c hỏi sữa hạt") hoặc phàn nàn Bot đơ / không đọc tin ("M đơ ak", "K đọc ak AI", "Sao tl giống nhau thế")
  // =========================================================================
  if (
    msgLower.includes("hỏi gì đâu") ||
    msgLower.includes("biết chị hỏi") ||
    msgLower.includes("bt c hỏi") ||
    msgLower.includes("chưa hỏi")
  ) {
    return `Dạ em xin lỗi ${addressWithName} vì em giới thiệu hơi vội ạ. Bên em thấy mình đang quan tâm chăm sóc sức khỏe tiểu đường, hiện ${pronoun} đang muốn ổn định chỉ số đường huyết hay cải thiện cân nặng và thể trạng vậy ạ?`;
  }

  if (
    msgLower.includes("đơ ak") ||
    msgLower.includes("đơ à") ||
    msgLower.includes("k đọc") ||
    msgLower.includes("không đọc") ||
    msgLower.includes("k thấy chị tl") ||
    msgLower.includes("giống nhau") ||
    msgLower.includes("tl giống") ||
    msgLower.includes("lặp lại")
  ) {
    // Nếu khách đã chia sẻ sụt cân / thèm ngọt trước đó thì giải thích ngay cho khách thay vì nói chung chung!
    if (allSymptoms.includes("thèm ngọt") || allSymptoms.includes("sụt cân")) {
      return `Dạ ${pronoun} thông cảm giúp em tin nhắn vừa bị trễ nhịp ạ. Hiện tượng sụt cân và đói thèm ngọt liên tục là do đường không vào được tế bào khiến tế bào bị đói năng lượng đó ${addressWithName}. ${
        addressWithName.charAt(0).toUpperCase() + addressWithName.slice(1)
      } áp dụng ăn rau trước, đạm sau và uống 1 ly sữa hạt đường Isomalt khi đói sẽ cắt cơn thèm ngọt và giữ cân rất tốt ạ!`;
    }
    const nextStep = pickClosingOrNextStepQuestion(knownState, pronoun, addressWithName);
    return `Dạ ${pronoun} thông cảm cho em nhé, em đang đối chiếu lại chỉ số sức khỏe của ${addressWithName} để tư vấn cho chuẩn xác ạ. ${nextStep}`;
  }

  // =========================================================================
  // 2. Phản xạ mở đầu linh hoạt (Context-Aware Greeting) khi khách nhắn "Nói đi em", "Alo", "Tư vấn đi"...
  // =========================================================================
  if (isShortConversationalPrompt(msgLower)) {
    return `Dạ ${addressWithName}, bên em thấy mình đang tìm hiểu giải pháp dinh dưỡng cho người tiểu đường. ${
      pronoun.charAt(0).toUpperCase() + pronoun.slice(1)
    } đang muốn tìm giải pháp ổn định đường huyết hay muốn cải thiện cân nặng và thể trạng vậy ạ?`;
  }

  // =========================================================================
  // 3. Cơ chế Đồng cảm & Giải thích (Empathy & Explanation) khi khách chia sẻ triệu chứng "thèm ngọt", "tụt cân", "đói cồn cào"
  // =========================================================================
  const mentionsCravingOrHunger =
    newly.symptoms?.includes("thèm ngọt") ||
    /(thèm\s*ngọt|đói\s*thèm|lk\s*nào\s*cx\s*đói|lúc\s*nào\s*cũng\s*đói|hay\s*đói|đói\s*cồn\s*cào|đói\s*lả)/i.test(
      msgLower
    );
  const mentionsWeightLossNow =
    newly.symptoms?.includes("sụt cân") ||
    /(tụt\s*\d*\s*cân|sụt\s*\d*\s*cân|sút\s*\d*\s*cân|tụt\s*cân|sụt\s*cân)/i.test(msgLower);

  if (mentionsCravingOrHunger || (mentionsWeightLossNow && allSymptoms.includes("thèm ngọt"))) {
    return `Dạ hiện tượng sụt cân và thèm ngọt liên tục là do cơ thể không chuyển hóa được đường vào tế bào, khiến tế bào bị đói năng lượng đó ${addressWithName}. Mình áp dụng ăn đảo ngược (ăn rau trước, đạm sau, tinh bột cuối) và dùng 1 ly sữa hạt đường Isomalt khi đói để cắt cơn thèm ngọt an toàn ${pronoun} nhé?`;
  }

  if (mentionsWeightLossNow) {
    if (hasBloodSugar) {
      return `Dạ tình trạng bị tụt cân dù đường huyết ${bsValue} là do cơ thể không chuyển hóa được đường vào nuôi tế bào khiến cơ bắp bị hao hụt đó ${addressWithName}. Mình áp dụng ăn đảo ngược (Rau -> Đạm -> Tinh bột) kết hợp bổ sung đạm thực vật từ sữa hạt đường Isomalt vào bữa phụ sẽ phục hồi cân nặng êm mà không tăng đường ${pronoun} nhé?`;
    }
    const nextQ = pickClosingOrNextStepQuestion(knownState, pronoun, addressWithName);
    return `${greetingPrefix}Người tiểu đường kém hấp thu nên dễ sụt cân, bổ sung sữa hạt Glucare Plus giúp ${pronoun} tăng cân êm. ${nextQ}`;
  }

  // =========================================================================
  // 4. Khi khách chia sẻ triệu chứng đau nhức lưng/chân tay, tê bì, mất ngủ, tiểu đêm
  // =========================================================================
  if (
    newly.symptoms?.includes("đau nhức xương khớp") ||
    /(nhức|đau\s*lưng|mỏi\s*lưng|chân\s*tay\s*nhức)/i.test(msgLower)
  ) {
    return `Dạ tình trạng nhức mỏi tay chân và đau lưng ở người tiểu đường là do tuần hoàn máu kém và thiếu hụt Canxi, Vitamin D3 nuôi dưỡng xương khớp đó ${addressWithName}. Bổ sung sữa hạt Glucare Plus giàu Canxi, Omega 6-9 kết hợp ngâm chân nước ấm buổi tối sẽ giúp ${pronoun} đỡ nhức mỏi và ngủ sâu giấc hơn nhiều ạ. Hiện bữa ăn hàng ngày ${pronoun} có kiêng khem quá mức không ạ?`;
  }

  if (
    newly.symptoms?.includes("tê bì") ||
    newly.symptoms?.includes("mất ngủ") ||
    newly.symptoms?.includes("tiểu đêm") ||
    newly.symptoms?.includes("mệt mỏi")
  ) {
    const symText = newly.symptoms.join(" và ");
    return `Dạ hiện tượng ${symText} là do đường huyết chưa chuyển hóa tốt vào tế bào khiến hệ thần kinh ngoại biên thiếu dưỡng chất đó ${addressWithName}. Mình kết hợp ngâm chân nước ấm gừng muối trước khi ngủ và dùng sữa hạt Glucare Plus (có Đông trùng hạ thảo, Quả nhàu) vào bữa phụ sẽ giúp ${pronoun} khỏe người, ngủ ngon hơn nhé ạ?`;
  }

  // =========================================================================
  // 5. Khi khách vừa gửi số điện thoại
  // =========================================================================
  if (detectedPhoneInMsg) {
    const nextQ = pickClosingOrNextStepQuestion(knownState, pronoun, addressWithName);
    return `Dạ em đã lưu số Zalo ${detectedPhoneInMsg} của ${addressWithName} rồi ạ. ${nextQ}`;
  }

  // =========================================================================
  // 6. Khi khách hỏi vị sữa ("Sữa vị gì đấy ngon k?")
  // =========================================================================
  if (
    msgLower.includes("vị gì") ||
    msgLower.includes("vị thế nào") ||
    msgLower.includes("ngon k") ||
    msgLower.includes("ngon không") ||
    msgLower.includes("dễ uống") ||
    msgLower.includes("ngọt không")
  ) {
    return `Dạ dòng sữa hạt bên em có vị hạt tự nhiên thơm bùi, ngọt thanh nhẹ từ đường ăn kiêng Isomalt rất dễ uống ${pronoun} nhé. Hiện ${pronoun} thích uống ngọt nhẹ hay không ngọt hẳn ạ?`;
  }

  // =========================================================================
  // 7. Khi khách hỏi giá ("Sữa Glucare Plus giá bao nhiêu em?")
  // =========================================================================
  if (
    msgLower.includes("giá") ||
    msgLower.includes("bao nhiêu") ||
    msgLower.includes("nhiêu tiền") ||
    msgLower.includes("combo") ||
    msgLower.includes("ưu đãi")
  ) {
    const nextQ = hasBloodSugar
      ? `Với mức đường ${bsValue}, ${addressWithName} lấy combo 3 lon để dùng đều 2 ly mỗi ngày nhé ạ?`
      : `Hiện chỉ số đường huyết của ${pronoun} khoảng mấy chấm để em hướng dẫn liều uống phù hợp nhất ạ?`;
    return `Dạ sữa lon 900g giá 450.000đ, combo 3 lon chỉ 1.250.000đ tặng bình lắc giữ nhiệt và miễn ship ${pronoun} ạ. ${nextQ}`;
  }

  // =========================================================================
  // 8. Khi khách vừa cung cấp chỉ số đường huyết (và/hoặc thời gian mắc bệnh)
  // =========================================================================
  if (newly.bloodSugar) {
    const displayGlucose = msgLower.includes("chấm")
      ? `${parseFloat(bsValue)} chấm`
      : `${bsValue}`;
    const durationPhrase = durationVal ? ` (${durationVal})` : "";

    let clinicalAssessment = "";
    if (bsNum <= 7.5 && (!durationVal || /tháng|mới/i.test(durationVal))) {
      clinicalAssessment = `mức đường ${displayGlucose}${durationPhrase} của ${addressWithName} đang ở giai đoạn thuận lợi để điều chỉnh về mức ổn định ạ.`;
    } else if (bsNum >= 8.0) {
      clinicalAssessment = `mức đường ${displayGlucose} sau ${durationVal || "một thời gian"} của ${addressWithName} còn hơi cao, dễ gây thiếu năng lượng ạ.`;
    } else {
      clinicalAssessment = `em đã ghi nhận mức đường ${displayGlucose}${durationPhrase} của ${addressWithName}, kiên trì điều chỉnh dinh dưỡng sẽ rất nhanh êm ạ.`;
    }

    // Riêng khi khách mới báo đường huyết + thời gian (chưa có triệu chứng nào), hỏi thăm nhẹ 1 câu về giấc ngủ/ăn uống hoặc tê bì
    let followUp = "";
    if (allSymptoms.length === 0) {
      const isLongTerm =
        durationVal && /năm|lâu/i.test(durationVal) && !/mới/i.test(durationVal);
      followUp = isLongTerm
        ? `Tối ngủ ${pronoun} có hay bị tê bì chân tay hay tiểu đêm không ${pronoun}?`
        : `Hiện tại ${pronoun} ăn uống có kiêng khem quá hay tối có khó ngủ không ạ?`;
    } else {
      followUp = pickClosingOrNextStepQuestion(knownState, pronoun, addressWithName);
    }

    const sentenceStart = alreadyGreeted
      ? `Dạ ${clinicalAssessment}`
      : `${greetingPrefix}${clinicalAssessment.charAt(0).toUpperCase() + clinicalAssessment.slice(1)}`;
    return `${sentenceStart} ${followUp}`;
  }

  // =========================================================================
  // 9. Khi khách nói muốn tăng cân / tăng cơ ("Tôi muốn tăng cân", "muốn tăng cơ")
  // =========================================================================
  if (newly.goals?.includes("tăng cân") || msgLower.includes("tăng cân") || msgLower.includes("tăng cơ")) {
    const goalText = msgLower.includes("tăng cơ") ? "tăng cơ và giữ thể lực" : "tăng cân êm";
    const followUp = hasBloodSugar
      ? `Hiện ${pronoun} đã thử qua dòng sữa hạt dinh dưỡng chuyên biệt nào chưa ạ?`
      : `Hiện chỉ số đường huyết lúc đói của ${addressWithName} đang dao động khoảng mấy chấm để em lên thực đơn đạm thực vật và sữa hạt cho sát ạ?`;
    return `${greetingPrefix}Người tiểu đường dễ bị mất cơ và thiếu đạm thực vật, nên mình kết hợp ăn đảo ngược (Rau -> Đạm -> Tinh bột) cùng 1-2 ly sữa hạt Glucare Plus mỗi ngày sẽ giúp ${goalText} rất tốt mà không làm vọt đường ạ. ${followUp}`;
  }

  // =========================================================================
  // 9b. Khi khách trả lời mục tiêu là ổn định đường huyết ("ổn định đường huyết", "giữ đường")
  // =========================================================================
  if (/ổn định đường|hạ đường|kiểm soát đường|giữ đường|ổn đường/i.test(msgLower)) {
    if (hasBloodSugar) {
      return `Dạ với mức đường ${bsValue} của ${addressWithName}, giải pháp tốt nhất là sáng dậy uống 1 cốc nước ấm, bữa chính ăn đảo ngược (rau xanh trước, đạm sau, tinh bột cuối) và dặm thêm 1 ly sữa hạt đường Isomalt vào bữa phụ xế chiều. ${pronoun} hiện có hay bị mệt hay tê bì chân tay vào buổi tối không ạ?`;
    }
    return `Dạ em ghi nhận mục tiêu ổn định đường huyết của ${addressWithName} rồi ạ. Để em tư vấn sát nhất lộ trình ăn uống và dinh dưỡng, hiện chỉ số đường huyết gần nhất của ${pronoun} đang khoảng mấy chấm và ${pronoun} bị tiểu đường lâu chưa ạ?`;
  }

  // =========================================================================
  // 10. Tin nhắn mở đầu hoặc câu hỏi chung khác (Tuyệt đối không xả quảng cáo sản phẩm nếu khách chưa hỏi)
  // =========================================================================
  if (!alreadyGreeted) {
    return `Dạ chào ${addressWithName}${staffIntroShort}. Bên em thấy mình đang tìm hiểu giải pháp dinh dưỡng cho người tiểu đường, ${pronoun} đang muốn ổn định đường huyết hay cải thiện cân nặng và thể trạng vậy ạ?`;
  }

  if (hasBloodSugar) {
    return `Dạ để ổn định mức đường ${bsValue} và tránh đói mệt, ${addressWithName} áp dụng nguyên tắc ăn đảo ngược (ăn rau xanh trước, đạm sau, tinh bột cuối) kết hợp 1-2 ly sữa hạt đường Isomalt vào bữa phụ nhé. Em gửi ${pronoun} chi tiết lộ trình dùng thử nha ạ?`;
  }

  return `Dạ ${addressWithName}, bên em đồng hành tư vấn chế độ dinh dưỡng chuyên biệt cho người tiểu đường. Hiện ${pronoun} đang muốn tìm giải pháp ổn định đường huyết hay muốn cải thiện cân nặng và thể trạng vậy ạ?`;
}

/**
 * 4. Chặn Tuyệt Đối Lặp Lại Cùng Một Câu Trả Lời (Anti-Duplicate Response)
 * Nếu `candidateReply` có độ tương đồng > 60% (`> 0.60`) với `lastBotReply`,
 * hủy bỏ ngay câu đó và sinh câu trả lời mới tập trung trực tiếp vào tin nhắn mới nhất của khách.
 */
export function ensureNonDuplicateReply({
  candidateReply = "",
  lastBotReply = "",
  customerMessage = "",
  pronounInfo,
  knownState,
}) {
  if (!lastBotReply) return candidateReply;

  const similarity = calculateTextSimilarity(candidateReply, lastBotReply);
  if (similarity <= 0.6) {
    return candidateReply;
  }

  const { pronoun, addressWithName } = pronounInfo || {
    pronoun: "chị",
    addressWithName: "chị",
  };
  const msgClean = String(customerMessage || "").trim();
  const symptoms = Array.isArray(knownState?.symptoms) ? knownState.symptoms : [];
  const bs = knownState?.bloodSugar;

  // Sinh câu trả lời thay thế hoàn toàn mới tập trung vào nội dung khách vừa nhắn
  if (symptoms.includes("thèm ngọt") || symptoms.includes("sụt cân")) {
    return `Dạ hiện tượng sụt cân và thèm ngọt liên tục là do cơ thể không chuyển hóa được đường vào tế bào, khiến tế bào bị đói năng lượng đó ${addressWithName}. Mình áp dụng ăn đảo ngược (Rau -> Đạm -> Tinh bột) và uống 1 ly sữa hạt đường Isomalt khi đói sẽ cắt cơn thèm ngọt và giữ cân rất tốt ạ!`;
  }

  if (bs) {
    return `Dạ em ghi nhận thêm chia sẻ "${msgClean}" của ${addressWithName} rồi ạ. Với mức đường ${bs} hiện tại, mình kết hợp chế độ ăn đảo ngược (ăn rau trước, đạm sau) và bổ sung 1 ly sữa hạt đường Isomalt vào bữa phụ xế chiều sẽ giúp cơ thể đủ chất, hết mệt mỏi ngay ${pronoun} nhé!`;
  }

  return `Dạ em cảm ơn ${addressWithName} đã chia sẻ ạ. Để em tư vấn sát nhất với thể trạng của mình, không biết hiện tại ${pronoun} đang ưu tiên giữ ổn định chỉ số đường huyết hay muốn bồi bổ để người khỏe khoắn, đỡ mệt mỏi hơn ạ?`;
}

/**
 * Gọi LLM nếu có cấu hình OPENAI_API_KEY
 */
async function callExternalLlmIfAvailable({
  systemPrompt,
  userPrompt,
  conversationHistory = [],
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const messages = [{ role: "system", content: systemPrompt }];
    const recentHistory = Array.isArray(conversationHistory)
      ? conversationHistory.slice(-6)
      : [];
    for (const msg of recentHistory) {
      if (!msg || !msg.text) continue;
      messages.push({
        role: msg.isMe ? "assistant" : "user",
        content: String(msg.text),
      });
    }
    messages.push({ role: "user", content: userPrompt });

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages,
        temperature: 0.3,
        max_tokens: 120,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    return content ? sanitizeHumanChatText(content) : null;
  } catch {
    return null;
  }
}

/**
 * Tìm Bot Profile riêng của tài khoản đang trực (mỗi tài khoản là 1 Bot AI riêng)
 */
function resolveBotProfileForAccount({ channelId = "", accountName = "" } = {}) {
  try {
    const profiles = listBotProfiles();
    if (!Array.isArray(profiles) || profiles.length === 0) return null;
    const chNorm = String(channelId || "").toLowerCase();
    const accNorm = String(accountName || "").toLowerCase();
    const ownIdMatch = chNorm.replace(/^zalo_/, "");

    return (
      profiles.find((p) => {
        const pKey = String(p.accountKey || "").toLowerCase();
        const pAccId = String(p.accountId || "").toLowerCase();
        const pName = String(p.accountName || "").toLowerCase();
        return (
          (chNorm && (pKey === chNorm || pKey.endsWith(`:${ownIdMatch}`) || pAccId === ownIdMatch)) ||
          (accNorm && pName && (accNorm.includes(pName) || pName.includes(accNorm)))
        );
      }) || profiles[0]
    );
  } catch {
    return null;
  }
}

/**
 * Chuyển đổi lịch sử chat cũ thành mảng turns chuẩn cho LLM (tối đa 40 tin gần nhất),
 * tự động gộp các tin liên tiếp cùng 1 phía để LLM đọc mạch hội thoại trọn vẹn không bị lặp câu hỏi.
 */
function buildConversationTurns(conversationHistory = [], latestCustomerMessage = "") {
  const raw = Array.isArray(conversationHistory) ? conversationHistory.slice(-40) : [];
  const turns = [];

  for (const m of raw) {
    if (!m) continue;
    const text = String(m.text || m.content || "").trim();
    if (!text) continue;
    const role = m.isMe || m.sender === "STAFF" || m.sender === "BOT" ? "assistant" : "user";
    const last = turns[turns.length - 1];
    if (last && last.role === role) {
      if (!last.content.includes(text)) {
        last.content = `${last.content}\n${text}`;
      }
    } else {
      turns.push({ role, content: text });
    }
  }

  const cleanLatest = String(latestCustomerMessage || "").trim();
  if (cleanLatest) {
    const last = turns[turns.length - 1];
    if (!last || last.role !== "user") {
      turns.push({ role: "user", content: cleanLatest });
    } else if (!last.content.includes(cleanLatest)) {
      last.content = `${last.content}\n${cleanLatest}`;
    }
  }

  // Đảm bảo luôn kết thúc bằng user message
  while (turns.length > 0 && turns[turns.length - 1].role !== "user") {
    turns.pop();
  }
  return turns.length > 0 ? turns : [{ role: "user", content: cleanLatest || "Chào bạn" }];
}

/**
 * Tổng hợp Hồ sơ Khách hàng 360 (đơn hàng, sản phẩm đã dùng, thẻ Tag, bệnh lý)
 */
function buildCustomer360Context(customerProfile = {}, knownState = {}) {
  const lines = [];
  if (customerProfile?.fullName || customerProfile?.name) {
    lines.push(`- Họ tên khách: ${customerProfile.fullName || customerProfile.name}`);
  }
  if (customerProfile?.phone) {
    lines.push(`- SĐT: ${customerProfile.phone}`);
  }
  if (Array.isArray(customerProfile?.tags) && customerProfile.tags.length > 0) {
    lines.push(`- Thẻ phân loại hiện tại: ${customerProfile.tags.join(", ")}`);
  }
  if (Array.isArray(customerProfile?.orders) && customerProfile.orders.length > 0) {
    const orderSummary = customerProfile.orders
      .slice(0, 5)
      .map((o) => `${o.code || o.id || "Đơn"} (${o.productName || o.itemsSummary || "SP ADDP"} - ${o.totalAmount || o.total || ""}đ)`)
      .join("; ");
    lines.push(`- Lịch sử đơn hàng đã mua: ${orderSummary}`);
  } else if (customerProfile?.totalOrders > 0) {
    lines.push(`- Đã từng mua ${customerProfile.totalOrders} đơn hàng tại ADDP (Khách cũ).`);
  }
  if (customerProfile?.notes) {
    lines.push(`- Ghi chú CSKH trước đó: ${String(customerProfile.notes).slice(0, 300)}`);
  }
  if (knownState?.bloodSugar) lines.push(`- Đường huyết: ${knownState.bloodSugar}`);
  if (knownState?.duration) lines.push(`- Thời gian mắc: ${knownState.duration}`);
  if (knownState?.symptoms?.length) lines.push(`- Triệu chứng: ${knownState.symptoms.join(", ")}`);
  if (knownState?.goals?.length) lines.push(`- Mục tiêu sức khỏe: ${knownState.goals.join(", ")}`);

  return lines.length > 0 ? lines.join("\n") : "- Chưa có nhiều dữ liệu hồ sơ cũ (Khách mới hoặc mới tương tác).";
}

/**
 * Hàm chính sinh câu trả lời thông minh:
 * 1. Đọc Bot Profile riêng của tài khoản + Phong cách & Q&A đã học từ toàn bộ lịch sử chat của nick đó.
 * 2. Tìm kiếm Tri thức Vector (Vector RAG) + Hồ sơ 360 + Lịch sử 40 tin nhắn gần nhất của khách.
 * 3. Gọi LLM thật (OpenAI GPT / Gemini qua aiRouter.js) để trả lời tự nhiên như người thật, tuyệt đối không lặp câu hỏi.
 * 4. Fallback an toàn sang State-Aware Engine nếu chưa cấu hình API Key.
 */
export async function generateHumanLikeReply({
  customerMessage = "",
  customerProfile = {},
  conversationHistory = [],
  channelConfig = {},
  accountName = "",
} = {}) {
  const cleanMessage = String(customerMessage || "").trim();
  const detectedPhone = extractCustomerPhoneFromMessage(cleanMessage);
  const ragResult = retrieveRelevantKnowledge(cleanMessage);

  const customerName =
    customerProfile?.fullName ||
    customerProfile?.name ||
    customerProfile?.customerName ||
    "";
  const avatarUrl = customerProfile?.avatar || customerProfile?.avatarUrl || "";
  const genderFromProfile = customerProfile?.gender || "";
  const customerPhone =
    detectedPhone ||
    customerProfile?.phone ||
    customerProfile?.customerPhone ||
    null;

  const effectiveAccountName =
    accountName ||
    channelConfig?.accountName ||
    channelConfig?.channelLabel ||
    channelConfig?.name ||
    customerProfile?.accountName ||
    "";

  const pronounInfo = detectCustomerPronoun(customerName, avatarUrl, genderFromProfile);
  const staffName = resolveActiveStaffDisplayName(effectiveAccountName);
  const alreadyGreeted = hasAlreadyGreetedToday(conversationHistory);
  const lastBotReply = getLastBotReplyFromHistory(conversationHistory);

  // 1. Trích xuất và hợp nhất trạng thái y khoa (`CUSTOMER_KNOWN_STATE`)
  const knownState = buildConsolidatedMedicalState(
    cleanMessage,
    customerProfile,
    conversationHistory
  );

  // 2. Nạp Bot Profile riêng của tài khoản + Dữ liệu tự học từ lịch sử hội thoại nick đó
  const botProfile = resolveBotProfileForAccount({
    channelId: channelConfig?.channelId,
    accountName: effectiveAccountName,
  });
  const learnedData = getAccountLearnedData({
    accountKey: botProfile?.accountKey || channelConfig?.channelId || effectiveAccountName,
    homeDir: botProfile?.homeDir || channelConfig?.homeDir || "",
    accountName: effectiveAccountName,
  });
  const learnedExamples = findRelevantLearnedExamples(learnedData, cleanMessage, 4);

  // 3. Tìm kiếm thêm tri thức từ file đã upload (Vector RAG)
  let vectorContext = "";
  try {
    const vectorHits = await searchKnowledgeVectors(cleanMessage, {
      topK: 4,
      docIds: botProfile?.assignedDocIds || ["ALL"],
    });
    if (Array.isArray(vectorHits) && vectorHits.length > 0) {
      vectorContext = vectorHits
        .map((h, idx) => `[Tài liệu ${idx + 1}: ${h.docTitle || "Tri thức ADDP"}]\n${h.text}`)
        .join("\n\n");
    }
  } catch {}

  const personaBase = botProfile?.personaPrompt || MASTER_HEALTH_CONSULTANT_PERSONA;
  const customer360Text = buildCustomer360Context(customerProfile, knownState);
  const learnedExamplesText =
    learnedExamples.length > 0
      ? learnedExamples
          .map((ex, i) => `Mẫu ${i + 1} (${ex.topic}):\n- Khách: "${ex.customer}"\n- Cách nick này trả lời: "${ex.staff}"`)
          .join("\n")
      : "";

  // 4. Xây dựng System Instruction đầy đủ cho LLM
  const stateAwareRules = buildStateAwareSystemPrompt({
    staffName,
    pronounInfo,
    knownState,
    alreadyGreeted,
    lastBotReply,
    ragContext: [ragResult.contextPrompt, vectorContext].filter(Boolean).join("\n\n"),
    customerPhone,
  });

  const fullSystemPrompt = `${personaBase}

=== THÔNG TIN TÀI KHOẢN & PHONG CÁCH ĐÃ HỌC TỪ LỊCH SỬ NICK NÀY ===
- Tên nhân sự trực nick: ${staffName || effectiveAccountName || "Chuyên viên ADDP"}
- Phong cách giao tiếp thực tế của nick này: ${learnedData?.styleSummary || "Ấm áp, lễ phép, xưng em - anh/chị hoặc con/cháu - cô/chú."}
${learnedExamplesText ? `\nMẪU CÂU ĐỐI THOẠI THỰC TẾ ĐÃ HỌC TỪ NICK NÀY (hãy học giọng văn tự nhiên này, không copy máy móc):\n${learnedExamplesText}` : ""}

=== HỒ SƠ 360 CỦA KHÁCH HÀNG HIỆN TẠI ===
${customer360Text}

=== QUY TẮC CHỐNG LẶP & PHẢN HỒI NHƯ NGƯỜI THẬT ===
1. ĐỌC KỸ toàn bộ lịch sử hội thoại bên dưới. TUYỆT ĐỐI KHÔNG hỏi lại câu hỏi đã hỏi ở các tin trước (ví dụ: nếu khách vừa trả lời "ổn định đường huyết" hay "muốn tăng cơ" thì ghi nhận ngay và đi tiếp sang bước tiếp theo, KHÔNG hỏi lại "muốn ổn định đường huyết hay cải thiện thể trạng").
2. Trả lời ngắn gọn, tự nhiên như tin nhắn Zalo người thật (2-4 câu, có chia ý gọn gàng nếu tư vấn phác đồ, không viết sớ quá dài).
3. Kết thúc bằng 01 câu hỏi mở nhẹ nhàng để dẫn dắt tiếp cuộc trò chuyện.

${stateAwareRules}`;

  // 5. Gọi LLM thật (OpenAI GPT / Gemini qua aiRouter.js) kèm lịch sử 40 tin nhắn gần nhất
  const messageTurns = buildConversationTurns(conversationHistory, cleanMessage);
  let replyText = "";
  let llmUsed = false;
  let llmProvider = null;
  let llmError = null;

  try {
    const llmRes = await generateAiReply({
      systemPrompt: fullSystemPrompt,
      messages: messageTurns,
      maxTokens: 450,
      temperature: 0.55,
    });
    if (llmRes?.ok && llmRes.text) {
      replyText = sanitizeHumanChatText(llmRes.text);
      llmUsed = true;
      llmProvider = `${llmRes.providerUsed || "llm"}:${llmRes.modelUsed || ""}`;
    } else if (llmRes?.error) {
      llmError = llmRes.error;
    }
  } catch (err) {
    llmError = err?.message || "LLM_CALL_ERROR";
  }

  // 6. Fallback an toàn khi chưa cấu hình API Key hoặc LLM lỗi
  if (!replyText) {
    replyText = generateStateAwareResponse({
      customerMessage: cleanMessage,
      pronounInfo,
      staffName,
      alreadyGreeted,
      knownState,
      detectedPhoneInMsg: detectedPhone,
      lastBotReply,
    });

    replyText = ensureNonDuplicateReply({
      candidateReply: replyText,
      lastBotReply,
      customerMessage: cleanMessage,
      pronounInfo,
      knownState,
    });
    replyText = sanitizeHumanChatText(replyText);
  }

  const typingDelayMs = calculateTypingDelayMs(replyText);
  const personaLabel = staffName
    ? `${staffName} - Chuyên viên tư vấn dinh dưỡng Dược phẩm ADDP`
    : "Chuyên viên tư vấn dinh dưỡng Dược phẩm ADDP";

  return {
    replyText,
    typingDelayMs,
    detectedPhone,
    matchedProducts: ragResult.matchedProducts,
    ragContext: ragResult.contextPrompt,
    systemPrompt: fullSystemPrompt,
    persona: personaLabel,
    pronounInfo,
    staffName,
    alreadyGreeted,
    llmUsed,
    llmProvider,
    llmError,
    learnedQaUsed: learnedExamples.length,
    medicalRecord: {
      bloodSugar: knownState.bloodSugar,
      bloodSugarNumeric: knownState.bloodSugarNumeric,
      duration: knownState.duration,
      symptoms: knownState.symptoms,
      goals: knownState.goals,
      desiredWeightGain: knownState.desiredWeightGain,
    },
    autoTags: knownState.autoTags,
  };
}
