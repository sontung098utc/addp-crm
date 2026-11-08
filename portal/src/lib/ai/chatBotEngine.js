/**
 * ADDP Omnichannel AI CRM — Bộ Não AI Chuyên Viên Tư Vấn Dinh Dưỡng Dược Phẩm ADDP
 * Nâng cấp toàn diện theo "QUY TRÌNH GỌI ĐIỆN CHĂM SÓC KHÁCH HÀNG TIỂU ĐƯỜNG":
 * 1. Nhận diện giới tính khách hàng (chị / anh) & Chỉ chào 1 lần duy nhất trong ngày.
 * 2. Tự động lấy danh xưng theo tên tài khoản đang trực (Sơn Tùng, Thuỷ Tiên... hoặc bên Dược phẩm ADDP).
 * 3. Định vị vai trò: Chuyên viên tư vấn dinh dưỡng của Công ty Dược phẩm ADDP (TUYỆT ĐỐI KHÔNG xưng bác sĩ, dược sĩ, chuyên gia).
 * 4. Câu trả lời súc tích 2-3 câu ngắn (< 45 từ), luôn kết thúc bằng 1 câu hỏi thăm dò mở.
 */

import { retrieveRelevantKnowledge, PHARMA_KNOWLEDGE_BASE } from "./knowledgeBase.js";
import { extractPhoneNumbersFromText, normalizePhone } from "../customerIdentityResolver.js";

const FEMALE_NAME_KEYWORDS = new Set([
  "thị", "quyên", "hằng", "ý", "thảo", "trang", "nga", "mai", "lan", "vy",
  "linh", "dung", "loan", "huệ", "hoa", "yến", "ngọc", "phương", "oanh", "giang",
  "hương", "thúy", "thuý", "thủy", "thuỷ", "tiên", "nhung", "hạnh", "ngân", "trâm",
  "quỳnh", "nhi", "trinh", "diệp", "tuyết", "cúc", "đào", "liễu", "huyền", "my",
  "thư", "châu", "hiền", "lệ", "bích", "kiều", "diễm", "thắm", "hồng", "tâm",
  "vân", "nhàn", "phụng", "xuyến", "nguyệt", "thơ", "tươi", "xoan", "nương", "sương",
  "nhài", "trà", "ly", "hà", "thu",
]);

const MALE_NAME_KEYWORDS = new Set([
  "văn", "hùng", "dũng", "tùng", "tuấn", "cường", "thắng", "hoàng", "minh", "đức",
  "long", "nam", "hải", "sơn", "thành", "phúc", "trung", "trọng", "hiếu", "huy",
  "quân", "kiên", "khánh", "bình", "tài", "đạt", "lộc", "vinh", "khải", "hưng",
  "thịnh", "phát", "nghĩa", "bảo", "khang", "khoa", "phong", "vũ", "toàn", "tâm",
  "hào", "luân", "tiến", "lâm", "tân", "nhật", "dương", "công", "quyết", "chiến",
]);

/**
 * Xác định cách xưng hô giới tính khách hàng ("chị" / "anh" / "mình") và tên ngắn gọn (ví dụ "chị Quyên", "anh Tuấn")
 * @param {string} customerName
 * @param {string} [avatarUrl]
 * @param {string} [genderFromProfile]
 * @returns {{
 *   gender: "FEMALE"|"MALE"|"UNKNOWN",
 *   pronoun: string,
 *   shortName: string,
 *   addressWithName: string,
 *   capitalizedPronoun: string,
 *   capitalizedAddressWithName: string
 * }}
 */
export function detectCustomerPronoun(customerName = "", avatarUrl = "", genderFromProfile = "") {
  const rawName = String(customerName || "").trim();
  const normalizedGender = String(genderFromProfile || "").toLowerCase().trim();

  // Loại bỏ các nhãn mặc định không phải tên thật
  const isGenericName =
    !rawName ||
    /^(khách|khách hàng|khách zalo|khách fb|bạn bè|anh\/chị|cô\/chú|user|unknown)/i.test(rawName);

  const cleanTokens = isGenericName
    ? []
    : rawName
        .replace(/[()[\].,-]/g, " ")
        .split(/\s+/)
        .map((t) => t.trim())
        .filter(Boolean);

  const shortName = cleanTokens.length > 0 ? cleanTokens[cleanTokens.length - 1] : "";
  const lowerTokens = cleanTokens.map((t) => t.toLowerCase());
  const firstToken = lowerTokens[0] || "";

  let gender = "UNKNOWN";

  if (["female", "nữ", "nu", "f", "chị", "chi", "cô", "co"].includes(normalizedGender)) {
    gender = "FEMALE";
  } else if (["male", "nam", "m", "anh", "chú", "chu"].includes(normalizedGender)) {
    gender = "MALE";
  } else if (firstToken === "chị" || firstToken === "cô") {
    gender = "FEMALE";
  } else if (firstToken === "anh" || firstToken === "chú") {
    gender = "MALE";
  } else if (lowerTokens.length > 0) {
    // Ưu tiên kiểm tra tên chính (từ cuối cùng) trước, sau đó kiểm tra tên đệm
    const givenNameLower = lowerTokens[lowerTokens.length - 1];
    if (FEMALE_NAME_KEYWORDS.has(givenNameLower)) {
      gender = "FEMALE";
    } else if (MALE_NAME_KEYWORDS.has(givenNameLower)) {
      gender = "MALE";
    } else {
      for (const token of lowerTokens) {
        if (FEMALE_NAME_KEYWORDS.has(token)) {
          gender = "FEMALE";
          break;
        }
        if (MALE_NAME_KEYWORDS.has(token)) {
          gender = "MALE";
          break;
        }
      }
    }
  }

  const pronoun = gender === "FEMALE" ? "chị" : gender === "MALE" ? "anh" : "mình";
  const capitalizedPronoun =
    pronoun.charAt(0).toUpperCase() + pronoun.slice(1);

  let addressWithName = pronoun;
  if (shortName) {
    if (gender === "FEMALE") {
      addressWithName = `chị ${shortName}`;
    } else if (gender === "MALE") {
      addressWithName = `anh ${shortName}`;
    } else {
      addressWithName = `mình`;
    }
  }

  const capitalizedAddressWithName =
    addressWithName.charAt(0).toUpperCase() + addressWithName.slice(1);

  return {
    gender,
    pronoun,
    shortName,
    addressWithName,
    capitalizedPronoun,
    capitalizedAddressWithName,
  };
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

  // Bóc tên trong ngoặc đơn: "Zalo Cá Nhân (Sơn Tùng)" -> "Sơn Tùng"
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

  // Bóc sau dấu hai chấm hoặc gạch ngang: "Zalo: Sơn Tùng" hoặc "Zalo Tư Vấn 01 - Thu Hà"
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
    const ts = rawTs > 2e12 ? Math.floor(rawTs / 1000) : rawTs > 0 && rawTs < 1e11 ? rawTs * 1000 : rawTs;
    if (ts > 0 && new Date(ts).toDateString() === todayStr) {
      return true;
    }
  }
  return false;
}

/**
 * Làm sạch mọi ký tự markdown, loại bỏ các danh xưng cấm ("dược sĩ", "bác sĩ", "chuyên gia")
 * và giới hạn câu trả lời ngắn gọn (2-3 câu).
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
 * Sinh câu trả lời ngắn gọn (2-3 câu, < 45 từ) đúng kịch bản Quy trình Chăm sóc Tiểu đường ADDP
 */
function buildContextualNutritionAdvisorReply({
  customerMessage = "",
  customerName = "",
  avatarUrl = "",
  genderFromProfile = "",
  accountName = "",
  detectedPhoneInMsg = null,
  pathology = "",
  ragResult,
  conversationHistory = [],
}) {
  const msgLower = String(customerMessage || "").toLowerCase().trim();
  const pronounInfo = detectCustomerPronoun(customerName, avatarUrl, genderFromProfile);
  const { pronoun, addressWithName, capitalizedAddressWithName } = pronounInfo;

  const staffName = resolveActiveStaffDisplayName(accountName);
  const staffSelfIntro = staffName
    ? `em là ${staffName} tư vấn bên Dược phẩm ADDP`
    : `em bên chăm sóc sức khỏe Dược phẩm ADDP`;

  const alreadyGreeted = hasAlreadyGreetedToday(conversationHistory);

  // Prefix chào hỏi: Chỉ xuất hiện ở tin nhắn ĐẦU TIÊN trong ngày, các tin sau bỏ hoàn toàn câu chào
  const firstTimeGreeting = alreadyGreeted
    ? "Dạ "
    : `Dạ em chào ${addressWithName} ạ, ${staffSelfIntro}. `;

  // 1. Khi khách thắc mắc / khó chịu vì câu trả lời lặp ("Sao tl giống nhau thế", "trả lời giống nhau", "bot à")
  const isComplainingRepetitive =
    msgLower.includes("giống nhau") ||
    msgLower.includes("tl giống") ||
    msgLower.includes("trả lời giống") ||
    msgLower.includes("lặp lại") ||
    msgLower.includes("nhai lại") ||
    msgLower.includes("máy trả lời") ||
    msgLower.includes("bot à");

  if (isComplainingRepetitive) {
    return `Dạ ${pronoun} thông cảm cho em nhé, em đang đối chiếu lại chỉ số sức khỏe của ${pronoun} để tư vấn cho chuẩn xác ạ. ${capitalizedAddressWithName} cho em hỏi thăm thêm là hiện tại đường huyết lúc đói của mình khoảng mấy chấm rồi ạ?`;
  }

  // 2. Khi khách vừa gửi số điện thoại trong tin nhắn
  if (detectedPhoneInMsg) {
    return `Dạ em đã lưu số Zalo ${detectedPhoneInMsg} của ${addressWithName} rồi ạ. Hiện tại đường huyết của ${pronoun} đang khoảng mấy chấm để em gửi thực đơn và hướng dẫn chi tiết qua cho ${pronoun} nhé?`;
  }

  // 3. Khi khách hỏi vị sữa ("Sữa vị gì đấy ngon k?", "có dễ uống không", "vị thế nào")
  const isAskingTaste =
    msgLower.includes("vị gì") ||
    msgLower.includes("vị thế nào") ||
    msgLower.includes("vị sao") ||
    msgLower.includes("ngon k") ||
    msgLower.includes("ngon không") ||
    msgLower.includes("dễ uống") ||
    msgLower.includes("ngọt không") ||
    msgLower.includes("có ngọt") ||
    msgLower.includes("mùi vị");

  if (isAskingTaste) {
    return `Dạ dòng sữa hạt bên em có vị hạt tự nhiên thơm bùi, vị ngọt thanh thanh từ đường ăn kiêng Isomalt rất dễ uống ${pronoun} nhé. Hiện tại ${pronoun} thích uống ngọt nhẹ hay không ngọt hẳn ạ?`;
  }

  // 4. Khi khách bảo muốn tăng cân / bị sụt cân ("T muốn tăng cân", "muốn lên cân", "sụt cân", "tụt cân", "gầy quá")
  const isWantingWeightGain =
    msgLower.includes("tăng cân") ||
    msgLower.includes("lên cân") ||
    msgLower.includes("sụt cân") ||
    msgLower.includes("tụt cân") ||
    msgLower.includes("gầy") ||
    msgLower.includes("ốm quá") ||
    msgLower.includes("teo cơ");

  if (isWantingWeightGain) {
    return `Dạ người tiểu đường thường hấp thu kém nên dễ bị tụt cân, teo cơ và mệt mỏi đó ${pronoun}. Hiện tại ${pronoun} muốn cải thiện tăng khoảng mấy cân và tối ngủ có hay bị tê bì chân tay không ${pronoun}?`;
  }

  // 5. Khi khách hỏi giá / khuyến mãi / combo ("Sữa Glucare Plus giá bao nhiêu em?", "nhiêu tiền")
  const isAskingPrice =
    msgLower.includes("giá") ||
    msgLower.includes("bao nhiêu") ||
    msgLower.includes("nhiêu tiền") ||
    msgLower.includes("khuyến mãi") ||
    msgLower.includes("ưu đãi") ||
    msgLower.includes("combo") ||
    msgLower.includes("mấy tiền");

  const matched = ragResult?.matchedProducts || [];
  const isDovital =
    matched.includes("dovital") ||
    (!matched.includes("glucare_plus") && String(pathology || "").toLowerCase().includes("gan"));

  if (isAskingPrice) {
    if (isDovital && !matched.includes("glucare_plus")) {
      return `Dạ viên uống Mát Gan Dovital hộp 60 viên giá 250.000đ, lấy combo 3 hộp ưu đãi còn 650.000đ và miễn phí giao hàng ${pronoun} ạ. Hiện tại ${pronoun} đang gặp tình trạng men gan cao hay nóng trong, mẩn ngứa vậy ạ?`;
    }
    return `Dạ sữa lon 900g giá 450.000đ ${pronoun} ạ. Bên em đang có combo 3 lon chỉ 1.250.000đ tặng kèm bình lắc giữ nhiệt và miễn ship tận nhà. Hiện tại chỉ số đường huyết của ${pronoun} đang khoảng mấy chấm rồi để em hướng dẫn liều uống phù hợp nhất cho ${pronoun} ạ?`;
  }

  // 6. Khi khách hỏi cách pha / cách dùng
  const isAskingUsage =
    msgLower.includes("cách dùng") ||
    msgLower.includes("cách uống") ||
    msgLower.includes("cách pha") ||
    msgLower.includes("pha thế nào") ||
    msgLower.includes("liều lượng") ||
    msgLower.includes("mấy muỗng") ||
    msgLower.includes("mấy ly");

  if (isAskingUsage) {
    if (isDovital && !matched.includes("glucare_plus")) {
      return `Dạ ${pronoun} uống ngày 2 lần, mỗi lần 1-2 viên sau bữa ăn 30 phút để hỗ trợ hạ men gan và mát gan tốt nhất nhé. Hiện tại chỉ số men gan của ${pronoun} đang ở mức bao nhiêu rồi ạ?`;
    }
    return `Dạ mỗi lần ${pronoun} pha 4 muỗng gạt ngang với 180ml nước ấm 45-50 độ C, uống 1-2 ly vào bữa phụ giúp no lâu mà ổn định đường huyết nhé. Bình thường tầm xế chiều ${pronoun} có hay bị đói lả hay mệt người không ạ?`;
  }

  // 7. Khi khách hỏi đang uống thuốc tây / thuốc bệnh viện
  const isAskingMedicine =
    msgLower.includes("thuốc tây") ||
    msgLower.includes("thuốc viện") ||
    msgLower.includes("thuốc bệnh viện") ||
    msgLower.includes("thay thuốc") ||
    msgLower.includes("tiêm insulin");

  if (isAskingMedicine) {
    return `Dạ thuốc bác sĩ kê mình vẫn duy trì đều đặn, còn sữa hạt bên em là dinh dưỡng bữa phụ giúp bù đạm thực vật để ${pronoun} không bị sụt cân hay mệt mỏi ạ. Đợt này uống thuốc tây ${pronoun} có hay thấy nóng trong hay cồn cào ruột không ạ?`;
  }

  // 8. Khi khách hỏi về chế độ ăn / thực đơn tiểu đường
  const isAskingDiet =
    msgLower.includes("ăn gì") ||
    msgLower.includes("kiêng gì") ||
    msgLower.includes("thực đơn") ||
    msgLower.includes("chế độ ăn");

  if (isAskingDiet) {
    return `Dạ ${pronoun} áp dụng chế độ ăn đảo ngược: ăn rau xanh trước, thức ăn đạm sau rồi mới ăn lưng bát cơm cuối cùng để đường không tăng vọt sau ăn nhé. Hiện tại bữa ăn hàng ngày ${pronoun} có đang kiêng khem tinh bột quá mức không ạ?`;
  }

  // 9. Khi khách hỏi về Gan / Mát gan Dovital
  if (isDovital && !matched.includes("glucare_plus")) {
    return `${firstTimeGreeting}Dòng Mát Gan Dovital bên em chiết xuất Cà gai leo, Kế sữa và Actiso giúp hạ men gan, giảm nóng trong mẩn ngứa rất êm ${pronoun} ạ. Hiện tại ${pronoun} đang bị men gan cao, gan nhiễm mỡ hay hay nóng nhiệt mất ngủ vậy ạ?`;
  }

  // 10. Câu hỏi tư vấn tiểu đường / chào hỏi chung (Tuân thủ Bước 1 & Phần 3 Quy trình mới)
  if (!alreadyGreeted) {
    return `Dạ em chào ${addressWithName} ạ, ${staffSelfIntro}. Hiện tại ${pronoun} đang muốn ổn định chỉ số đường huyết hay đang bị sụt cân, mệt mỏi cần bổ sung dinh dưỡng tăng cân an toàn vậy ${pronoun}?`;
  }

  return `Dạ dòng sữa hạt Glucare Plus bên em dùng đường Isomalt và đạm hạt kết hợp Đông trùng hạ thảo giúp bồi bổ thể trạng mà giữ đường huyết rất êm ${pronoun} ạ. Hiện tại đường huyết lúc đói của ${pronoun} khoảng mấy chấm và mình phát hiện tiểu đường lâu chưa ${pronoun}?`;
}

/**
 * Gọi LLM nếu hệ thống có cấu hình OPENAI_API_KEY, ép buộc tuân thủ nghiêm ngặt quy chuẩn xưng hô & độ dài < 45 từ
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
        temperature: 0.4,
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
 * Xây dựng System Prompt động theo tên tài khoản đang trực, giới tính khách và trạng thái đã chào trong ngày
 */
export function buildNutritionAdvisorSystemPrompt({
  staffName = null,
  pronounInfo,
  alreadyGreeted = false,
  ragContext = "",
  customerPhone = null,
  pathology = "",
} = {}) {
  const pronoun = pronounInfo?.pronoun || "mình";
  const addressWithName = pronounInfo?.addressWithName || "mình";
  const staffIntro = staffName
    ? `Tên của bạn là "${staffName}" — Chuyên viên tư vấn dinh dưỡng của Công ty Dược phẩm ADDP.`
    : `Bạn là Chuyên viên tư vấn dinh dưỡng bên chăm sóc sức khỏe Dược phẩm ADDP (xưng là "em").`;

  return [
    staffIntro,
    "QUY TẮC BẮT BUỘC TUYỆT ĐỐI:",
    "1. ĐỊNH VỊ VAI TRÒ: Tuyệt đối KHÔNG BAO GIỜ xưng là 'dược sĩ', 'bác sĩ', hay 'chuyên gia'. Chỉ xưng là 'em' hoặc chuyên viên tư vấn bên Dược phẩm ADDP.",
    `2. XƯNG HÔ GIỚI TÍNH: Khách hàng này xưng hô là "${pronoun}" (gọi đầy đủ là "${addressWithName}"). Tuyệt đối không dùng cụm vô cảm "anh/chị".`,
    alreadyGreeted
      ? `3. KHÔNG CHÀO LẠI: Hôm nay đã chào khách rồi. BỎ HOÀN TOÀN câu chào mở đầu ("Dạ chào ${pronoun}...", "Dạ ${addressWithName} ơi..."). Hãy trả lời thẳng vào câu hỏi của khách (bắt đầu bằng "Dạ...").`
      : `3. CHÀO LẦN ĐẦU: Đây là tin nhắn đầu tiên trong ngày, hãy chào ngắn gọn: "Dạ em chào ${addressWithName} ạ, ${
          staffName ? `em là ${staffName} tư vấn bên Dược phẩm ADDP.` : "em bên Dược phẩm ADDP ạ."
        }"`,
    "4. ĐỘ DÀI NGẮN GỌN: Tối đa 2 đến 3 câu ngắn (dưới 45 từ). Không xả đoạn văn dài như bài báo y khoa. Không dùng ký tự markdown (*, #, -).",
    "5. KẾT THÚC BẰNG CÂU HỎI MỞ: Luôn kết thúc bằng 1 câu hỏi thăm dò nhẹ nhàng về tình trạng sức khỏe (chỉ số đường huyết mấy chấm, muốn tăng mấy cân, có tê bì mất ngủ không...) để khách chia sẻ tiếp.",
    "",
    "--- HỒ SƠ KHÁCH HÀNG ---",
    `- Cách gọi khách: ${addressWithName}`,
    `- Số điện thoại: ${customerPhone || "Chưa có"}`,
    `- Ghi chú bệnh lý: ${pathology || "Chưa ghi nhận"}`,
    "",
    "--- KHO TRI THỨC & KỊCH BẢN TIỂU ĐƯỜNG ADDP ---",
    ragContext,
  ].join("\n");
}

/**
 * Hàm chính sinh câu trả lời tự nhiên của Chuyên viên Tư vấn Dinh dưỡng ADDP + độ trễ gõ phím + bóc tách SĐT
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
  const pathology =
    customerProfile?.pathology ||
    (Array.isArray(customerProfile?.tags) ? customerProfile.tags.join(", ") : "") ||
    "";

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

  // Ưu tiên khớp trực tiếp các kịch bản chuẩn trong tài liệu Quy trình ADDP (hỏi vị, hỏi giá, muốn tăng cân, phàn nàn lặp tin...)
  const msgLower = cleanMessage.toLowerCase();
  const isDirectProtocolScenario =
    msgLower.includes("vị gì") ||
    msgLower.includes("ngon k") ||
    msgLower.includes("ngon không") ||
    msgLower.includes("dễ uống") ||
    msgLower.includes("tăng cân") ||
    msgLower.includes("lên cân") ||
    msgLower.includes("sụt cân") ||
    msgLower.includes("tụt cân") ||
    msgLower.includes("giá") ||
    msgLower.includes("bao nhiêu") ||
    msgLower.includes("nhiêu tiền") ||
    msgLower.includes("giống nhau") ||
    msgLower.includes("tl giống") ||
    msgLower.includes("lặp lại");

  const fullSystemPrompt = buildNutritionAdvisorSystemPrompt({
    staffName,
    pronounInfo,
    alreadyGreeted,
    ragContext: ragResult.contextPrompt,
    customerPhone,
    pathology,
  });

  let replyText = null;
  if (!isDirectProtocolScenario) {
    replyText = await callExternalLlmIfAvailable({
      systemPrompt: fullSystemPrompt,
      userPrompt: cleanMessage || "Tư vấn giúp mình",
      conversationHistory,
    });
  }

  if (!replyText) {
    replyText = buildContextualNutritionAdvisorReply({
      customerMessage: cleanMessage,
      customerName,
      avatarUrl,
      genderFromProfile,
      accountName: effectiveAccountName,
      detectedPhoneInMsg: detectedPhone,
      pathology,
      ragResult,
      conversationHistory,
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
    persona: personaLabel,
    pronounInfo,
    staffName,
    alreadyGreeted,
  };
}
