/**
 * ADDP Omnichannel AI CRM — Bộ Não AI Sinh Câu Trả Lời Theo Trạng Thái (State-Tracking & Autonomous Entity Extraction)
 * Áp dụng cho TOÀN BỘ KHÁCH HÀNG:
 * 1. Nhận diện thực thể tự động qua `extractMedicalEntities(text, currentMedicalRecord)`:
 *    `bloodSugar`, `duration`, `symptoms`, `goals`.
 * 2. Xây dựng `CUSTOMER_KNOWN_STATE` & System Instruction theo "QUY TRÌNH GỌI ĐIỆN CHĂM SÓC KHÁCH HÀNG TIỂU ĐƯỜNG":
 *    - TUYỆT ĐỐI KHÔNG HỎI LẠI bất kỳ thông tin nào đã có giá trị trong `CUSTOMER_KNOWN_STATE`.
 *    - Nếu đường huyết đã biết: Đánh giá trực diện mức độ an toàn theo quy trình và chuyển sang bước tiếp theo (hỏi chế độ ăn uống, giấc ngủ hoặc biến chứng tê bì, tiểu đêm, sụt cân).
 *    - Nếu khách nêu nhu cầu/triệu chứng mới (muốn tăng cân, sụt cân...): Giải thích cơ chế chuyển hóa/kém hấp thu theo quy trình và đưa giải pháp sữa hạt Glucare Plus.
 *    - Độ dài: 2-3 câu ngắn (dưới 45 từ), luôn kết thúc bằng 1 câu hỏi mở.
 *    - Chỉ chào hỏi duy nhất 1 lần trong ngày.
 */

import { retrieveRelevantKnowledge } from "./knowledgeBase.js";
import { extractPhoneNumbersFromText, normalizePhone } from "../customerIdentityResolver.js";
import {
  extractMedicalEntities,
  analyzeVietnameseGenderAndPronoun,
} from "../customerStore.js";

/**
 * Xác định cách xưng hô giới tính khách hàng ("chị" / "anh" / "mình") và tên ngắn gọn (ví dụ "chị Mai", "anh Hoàng")
 */
export function detectCustomerPronoun(customerName = "", avatarUrl = "", genderFromProfile = "") {
  return analyzeVietnameseGenderAndPronoun(customerName, genderFromProfile);
}

/**
 * Chuẩn hóa tên tài khoản đang trực để xưng tên tự nhiên:
 * - "Zalo Cá Nhân (Sơn Tùng)" hoặc "Zalo: Sơn Tùng" -> "Sơn Tùng"
 * - "Thuỷ Tiên" -> "Thuỷ Tiên"
 * - Nếu không có tên cụ thể -> null (xưng "em bên Dược phẩm ADDP")
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

  // Quét qua các tin nhắn của khách trong lịch sử hội thoại để không bỏ sót thông tin khách đã nói trước đó
  if (Array.isArray(conversationHistory)) {
    for (const msg of conversationHistory) {
      if (!msg || msg.isMe || msg.isSelf || msg.role === "assistant" || !msg.text) continue;
      state = extractMedicalEntities(String(msg.text), state);
    }
  }

  // Quét tin nhắn hiện tại của khách (ghi đè chỉ số mới nhất nếu khách vừa cập nhật)
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
 * 3. Xây dựng System Instruction động chứa `CUSTOMER_KNOWN_STATE` và Quy tắc Bất Di Bất Dịch
 */
export function buildStateAwareSystemPrompt({
  staffName = null,
  pronounInfo,
  knownState,
  alreadyGreeted = false,
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
    `- Số điện thoại: ${customerPhone || "Chưa rõ"}`,
    "",
    "=== QUY TẮC BẤT DI BẤT DỊCH ===",
    "1. TUYỆT ĐỐI KHÔNG HỎI LẠI bất kỳ thông tin nào đã có giá trị trong CUSTOMER_KNOWN_STATE (ví dụ: nếu Đường huyết hoặc Thời gian bị đã khác 'Chưa rõ' thì cấm hỏi lại đường huyết mấy chấm hay bị bao lâu rồi).",
    "2. Nếu đường huyết đã biết: Trả lời trực diện vào mức đường huyết đó (đánh giá mức độ an toàn/ổn định theo quy trình) và chuyển bước tiếp theo sang hỏi về chế độ ăn uống, giấc ngủ hoặc triệu chứng tê bì chân tay, tiểu đêm, sụt cân.",
    "3. Nếu khách nói về một triệu chứng hoặc nhu cầu mới (như muốn tăng cân, sụt cân): Giải thích nguyên nhân chuyển hóa/kém hấp thu của người tiểu đường theo quy trình và đưa giải pháp sữa hạt Glucare Plus.",
    "4. Độ dài câu trả lời: Luôn duy trì 2-3 câu ngắn, dưới 45 từ, kết thúc bằng 1 câu hỏi mở để lắng nghe khách.",
    alreadyGreeted
      ? `5. Chỉ chào hỏi duy nhất 1 lần trong ngày: Hôm nay đã chào khách rồi, BỎ HOÀN TOÀN câu chào mở đầu, trả lời thẳng vào vấn đề của ${addressWithName}.`
      : `5. Chỉ chào hỏi duy nhất 1 lần trong ngày: Đây là tin nhắn đầu tiên trong ngày, mở đầu ngắn gọn chào ${addressWithName}.`,
    "6. Tuyệt đối KHÔNG xưng 'bác sĩ', 'dược sĩ', 'chuyên gia' và KHÔNG dùng cụm 'anh/chị'.",
    "",
    "=== KHO TRI THỨC & QUY TRÌNH DINH DƯỠNG ADDP ===",
    ragContext,
  ].join("\n");
}

/**
 * Xác định câu hỏi thăm khám kế tiếp thông minh dựa trên những trường CÒN THIẾU trong `CUSTOMER_KNOWN_STATE`
 * Đảm bảo 100% không bao giờ hỏi lại thông tin khách đã cung cấp.
 */
function pickNextUnaskedFollowUpQuestion(knownState, pronoun, addressWithName) {
  const hasBloodSugar = Boolean(knownState?.bloodSugar);
  const hasDuration = Boolean(knownState?.duration);
  const symptoms = Array.isArray(knownState?.symptoms) ? knownState.symptoms : [];
  const goals = Array.isArray(knownState?.goals) ? knownState.goals : [];

  const hasNeuroOrSleepSymptom = symptoms.some((s) =>
    ["tê bì", "mất ngủ", "tiểu đêm", "chuột rút"].includes(s)
  );
  const hasWeightIssue =
    symptoms.includes("sụt cân") ||
    symptoms.includes("teo cơ") ||
    goals.includes("tăng cân");

  // 1. Nếu khách muốn tăng cân mà chưa rõ muốn tăng mấy cân & chưa rõ đường huyết
  if (goals.includes("tăng cân") && !knownState?.desiredWeightGain && !hasBloodSugar) {
    return `Hiện ${pronoun} muốn tăng mấy cân và đường huyết đang mấy chấm ạ?`;
  }

  // 2. Nếu chưa biết chỉ số đường huyết -> Hỏi chỉ số đường huyết (và thời gian nếu chưa biết)
  if (!hasBloodSugar) {
    if (!hasDuration) {
      return `Hiện đường huyết của ${pronoun} khoảng mấy chấm và mình bị lâu chưa ạ?`;
    }
    return `Hiện đường huyết lúc đói của ${pronoun} khoảng mấy chấm rồi ạ?`;
  }

  // 3. Đã biết đường huyết! Kiểm tra xem đã biết triệu chứng tê bì / tiểu đêm / mất ngủ / ăn uống kiêng khem chưa
  const isLongTerm =
    hasDuration &&
    (/năm|lâu/i.test(knownState.duration) && !/mới/i.test(knownState.duration));

  if (isLongTerm && !hasNeuroOrSleepSymptom) {
    return `Tối ngủ ${pronoun} có hay bị tê bì chân tay hay tiểu đêm không ${pronoun}?`;
  }

  if (!hasNeuroOrSleepSymptom) {
    return `Hiện tại ${pronoun} ăn uống có kiêng khem quá hay tối có khó ngủ không ạ?`;
  }

  if (!hasWeightIssue) {
    return `Đợt này ${pronoun} có bị sụt cân hay xế chiều hay đói mệt không ạ?`;
  }

  return `Hiện ${addressWithName} muốn dùng thử gói 3 lon sữa hạt Glucare Plus để ổn định sức khỏe nhé ạ?`;
}

/**
 * Bộ máy sinh câu trả lời theo trạng thái (`State-Aware Dialogue Generator`):
 * Đọc trực tiếp `knownState` (vừa trích xuất từ tin nhắn mới + hồ sơ cũ) để phản hồi trực diện vào con số/triệu chứng của khách,
 * tuyệt đối không hỏi lại bất kỳ trường nào đã có trong `knownState`.
 */
function generateStateAwareResponse({
  customerMessage = "",
  pronounInfo,
  staffName = null,
  alreadyGreeted = false,
  knownState,
  detectedPhoneInMsg = null,
  ragResult,
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

  // TH1: Khách phàn nàn trả lời lặp / giống nhau
  if (
    msgLower.includes("giống nhau") ||
    msgLower.includes("tl giống") ||
    msgLower.includes("trả lời giống") ||
    msgLower.includes("lặp lại")
  ) {
    const nextQ = pickNextUnaskedFollowUpQuestion(knownState, pronoun, addressWithName);
    return `Dạ ${pronoun} thông cảm cho em nhé, em đang đối chiếu chỉ số của ${addressWithName} để tư vấn chuẩn nhất ạ. ${nextQ}`;
  }

  // TH2: Khách vừa gửi số điện thoại
  if (detectedPhoneInMsg) {
    const nextQ = pickNextUnaskedFollowUpQuestion(knownState, pronoun, addressWithName);
    return `Dạ em đã lưu số Zalo ${detectedPhoneInMsg} của ${addressWithName} rồi ạ. ${nextQ}`;
  }

  // TH3: Khách hỏi vị sữa ("Sữa vị gì đấy ngon k?")
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

  // TH4: Khách hỏi giá ("Sữa Glucare Plus giá bao nhiêu em?")
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

  // TH5: Khách vừa cung cấp chỉ số đường huyết (và/hoặc thời gian mắc bệnh)
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
      clinicalAssessment = `em đã ghi nhận mức đường ${displayGlucose}${durationPhrase} của ${addressWithName}, kiên trì điều chỉnh sẽ rất nhanh êm ạ.`;
    }

    const followUp = pickNextUnaskedFollowUpQuestion(knownState, pronoun, addressWithName);
    const sentenceStart = alreadyGreeted
      ? `Dạ ${clinicalAssessment}`
      : `${greetingPrefix}${clinicalAssessment.charAt(0).toUpperCase() + clinicalAssessment.slice(1)}`;
    return `${sentenceStart} ${followUp}`;
  }

  // TH6: Khách nói về nhu cầu muốn tăng cân / bị sụt cân ("Tôi muốn tăng cân")
  if (
    newly.goals?.includes("tăng cân") ||
    newly.symptoms?.includes("sụt cân") ||
    msgLower.includes("tăng cân") ||
    msgLower.includes("sụt cân") ||
    msgLower.includes("tụt cân")
  ) {
    const followUp = pickNextUnaskedFollowUpQuestion(knownState, pronoun, addressWithName);
    return `${greetingPrefix}Người tiểu đường kém hấp thu nên dễ sụt cân, bổ sung sữa hạt Glucare Plus giúp ${pronoun} tăng cân êm. ${followUp}`;
  }

  // TH7: Khách chia sẻ thêm triệu chứng mới (tê bì, mất ngủ, tiểu đêm, mệt mỏi...)
  if (newly.symptoms && newly.symptoms.length > 0) {
    const symText = newly.symptoms.join(", ");
    const followUp = pickNextUnaskedFollowUpQuestion(knownState, pronoun, addressWithName);
    return `${greetingPrefix}Tình trạng ${symText} là do tế bào thiếu chất lâu ngày, ${addressWithName} bổ sung 2 ly sữa hạt Glucare Plus mỗi ngày sẽ cải thiện rất tốt ạ. ${followUp}`;
  }

  // TH8: Khách mới chỉ cho biết thời gian mắc bệnh mà chưa rõ đường huyết
  if (newly.duration && !hasBloodSugar) {
    const followUp = pickNextUnaskedFollowUpQuestion(knownState, pronoun, addressWithName);
    return `${greetingPrefix}Mình bị tiểu đường ${newly.duration} thì bổ sung dinh dưỡng GI thấp rất quan trọng để tránh sụt cân và biến chứng ${pronoun} ạ. ${followUp}`;
  }

  // TH9: Nếu trong hồ sơ đã có sẵn đường huyết từ trước (không hỏi lại đường huyết nữa)
  if (hasBloodSugar) {
    const followUp = pickNextUnaskedFollowUpQuestion(knownState, pronoun, addressWithName);
    return `${greetingPrefix}Với mức đường ${bsValue} của ${addressWithName}, duy trì ăn đảo ngược kèm 2 ly sữa hạt Glucare Plus mỗi ngày sẽ giữ đường huyết rất êm ạ. ${followUp}`;
  }

  // TH10: Tin nhắn mở đầu chung khi chưa có thông tin bệnh lý
  if (!alreadyGreeted) {
    return `Dạ em chào ${addressWithName}${staffIntroShort}. Hiện tại ${pronoun} đang muốn ổn định đường huyết hay đang bị sụt cân cần bổ sung dinh dưỡng tăng cân an toàn vậy ${pronoun}?`;
  }

  const followUp = pickNextUnaskedFollowUpQuestion(knownState, pronoun, addressWithName);
  return `Dạ sữa hạt Glucare Plus dùng đường Isomalt và đạm hạt kết hợp Đông trùng hạ thảo giúp bồi bổ thể trạng mà giữ đường huyết rất êm ${pronoun} ạ. ${followUp}`;
}

/**
 * Gọi LLM nếu có cấu hình OPENAI_API_KEY, truyền đầy đủ `CUSTOMER_KNOWN_STATE`
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
 * Hàm chính sinh câu trả lời theo trạng thái (`State-Aware Prompting & Autonomous Entity Extraction`)
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

  // 1. Trích xuất và hợp nhất trạng thái y khoa (`CUSTOMER_KNOWN_STATE`)
  const knownState = buildConsolidatedMedicalState(
    cleanMessage,
    customerProfile,
    conversationHistory
  );

  // 2. Xây dựng System Instruction động chứa `CUSTOMER_KNOWN_STATE`
  const fullSystemPrompt = buildStateAwareSystemPrompt({
    staffName,
    pronounInfo,
    knownState,
    alreadyGreeted,
    ragContext: ragResult.contextPrompt,
    customerPhone,
  });

  // 3. Nếu tin nhắn chứa các thực thể y khoa mới (đường huyết, thời gian, triệu chứng, mục tiêu) hoặc kịch bản quy trình,
  // ưu tiên dùng State-Aware Generator chuẩn xác để đảm bảo 100% không hỏi lại thông tin đã biết và dưới 45 từ.
  const hasNewEntitiesOrProtocol =
    Boolean(knownState.newlyExtracted?.bloodSugar) ||
    Boolean(knownState.newlyExtracted?.duration) ||
    (knownState.newlyExtracted?.symptoms?.length || 0) > 0 ||
    (knownState.newlyExtracted?.goals?.length || 0) > 0 ||
    Boolean(knownState.bloodSugar);

  let replyText = null;
  if (!hasNewEntitiesOrProtocol) {
    replyText = await callExternalLlmIfAvailable({
      systemPrompt: fullSystemPrompt,
      userPrompt: cleanMessage || "Tư vấn giúp mình",
      conversationHistory,
    });
  }

  if (!replyText) {
    replyText = generateStateAwareResponse({
      customerMessage: cleanMessage,
      pronounInfo,
      staffName,
      alreadyGreeted,
      knownState,
      detectedPhoneInMsg: detectedPhone,
      ragResult,
    });
  }

  replyText = sanitizeHumanChatText(replyText);
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
