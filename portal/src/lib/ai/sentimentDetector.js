/**
 * ADDP CRM — Vietnamese Customer Sentiment & Anger Detector
 * Module phân tích sắc thái cảm xúc, phát hiện khách hàng cáu gắt & bảo vệ thương hiệu.
 *
 * Tính năng chính:
 * 1. Phân loại chuẩn 5 cấp độ: 'ANGRY', 'COMPLAINT', 'NEGATIVE', 'NEUTRAL', 'POSITIVE'.
 * 2. Tính toán điểm số cáu gắt/rủi ro: score (0.0 -> 1.0).
 * 3. Phân biệt chính xác giữa TRIỆU CHỨNG BỆNH LÝ (đau nhức, mệt mỏi, tụt huyết áp...)
 *    và SỰ TỨC GIẬN ĐỐI VỚI CỬA HÀNG/SẢN PHẨM.
 * 4. Nhận diện các tín hiệu nghiêm trọng: Cáo buộc lừa đảo, đe dọa báo công an / bóc phốt,
 *    xúc phạm nhân viên, đòi tiền / bồi thường gay gắt, yêu cầu gặp quản lý / giám đốc.
 * 5. Tự động gắn cờ `requiresHandover` để kích hoạt tắt bot AI và chuyển giao nhân viên.
 */

export const SENTIMENT_LEVELS = Object.freeze({
  ANGRY: "ANGRY",
  COMPLAINT: "COMPLAINT",
  NEGATIVE: "NEGATIVE",
  NEUTRAL: "NEUTRAL",
  POSITIVE: "POSITIVE",
});

// Bộ từ khóa: Cáo buộc lừa đảo / gian lận
const FRAUD_KEYWORDS = [
  "lừa đảo", "lua dao", "lừa gạt", "lua gat", "gian lận", "gian lan",
  "bẫy khách", "bay khach", "treo đầu dê", "treo dau de", "treo đầu dê bán thịt chó",
  "đa cấp lừa", "đa cấp", "quỵt tiền", "quyt tien", "bọn lừa", "lũ lừa đảo",
  "lừa tiền", "lua tien", "lừa lọc", "bịp bợm", "ăn cướp", "ăn giật", "lừa đảo à", "lừa nhau à"
];

// Bộ từ khóa: Đe dọa cơ quan chức năng / Pháp luật / Bóc phốt / Tẩy chay
const THREAT_LEGAL_KEYWORDS = [
  "báo công an", "bao cong an", "báo ca", "gọi công an", "goi cong an",
  "báo chính quyền", "quản lý thị trường", "quan ly thi truong", "báo đài", "bao dai",
  "báo chí", "bao chi", "thưa kiện", "thua kien", "kiện ra tòa", "kien ra toa",
  "kiện công ty", "luật sư", "gặp luật sư", "ra pháp luật", "tố cáo", "to cao",
  "gửi đơn tố cáo", "đăng phốt", "dang phot", "bóc phốt", "boc phot", "phốt",
  "tẩy chay", "tay chay", "cho lên mạng", "đăng lên mạng", "đăng facebook",
  "đăng tiktok", "cho cộng đồng mạng", "cộng đồng mạng", "làm cho ra lẽ"
];

// Bộ từ khóa: Cáu gắt tột độ / Chửi bới / Xúc phạm / Thái độ gay gắt
const EXTREME_ANGER_KEYWORDS = [
  "bực mình", "buc minh", "bực cả mình", "quá bực", "điên máu", "dien mau",
  "phát điên", "tức điên", "tức điên người", "thái độ vớ vẩn", "thái độ bố láo",
  "thái độ láo toét", "mất dạy", "mat day", "khốn nạn", "khon nan", "bố láo",
  "láo toét", "vô trách nhiệm", "làm ăn như cc", "làm ăn như cặc", "làm ăn như lồn",
  "làm ăn tắc trách", "làm ăn bát nháo", "làm ăn cẩu thả", "lũ vô học", "bọn khốn",
  "chán ngấy", "quá quắt", "đm", "đcm", "vcl", "dm", "dkm", "mẹ kiếp", "tiên sư",
  "lũ khốn", "đồ lừa đảo", "đồ chó", "mất nết"
];

// Bộ từ khóa: Đòi gặp cấp trên / Quản lý / Đòi tiền / Bồi thường gay gắt
const DEMAND_ESCALATION_KEYWORDS = [
  "gặp quản lý", "gap quan ly", "cho gặp quản lý", "gặp giám đốc", "cho gặp giám đốc",
  "gặp sếp", "cho gặp sếp", "gọi chủ ra đây", "chủ đâu ra đây", "ai là người phụ trách",
  "cho tôi nói chuyện với chủ", "chuyển máy cho quản lý", "người có thẩm quyền",
  "đòi tiền", "doi tien", "trả lại tiền", "tra lai tien", "hoàn tiền ngay", "hoan tien ngay",
  "đền tiền", "den tien", "bắt đền", "bat den", "đòi lại tiền", "trả tiền đây",
  "không trả tiền thì biết tay", "bồi thường thiệt hại", "phải bồi thường"
];

// Bộ từ khóa: Khiếu nại chất lượng sản phẩm & Dịch vụ (Mức COMPLAINT)
const PRODUCT_SERVICE_COMPLAINTS = [
  "chất lượng tệ", "chat luong te", "chất lượng quá kém", "hàng kém chất lượng",
  "hàng dởm", "hàng dỏm", "hang dom", "hàng giả", "hang gia", "hàng nhái", "hang nhai",
  "hàng hết hạn", "hết hạn sử dụng", "hết date", "mốc meo", "hư hỏng", "bị vỡ", "bị bể",
  "giao sai hàng", "giao nhầm", "giao thiếu", "thiếu hàng", "sai mẫu",
  "không đúng như quảng cáo", "quá thất vọng", "that vong", "chờ cả tuần",
  "mãi không giao", "giao hàng quá chậm", "không chấp nhận được", "làm việc tắc trách",
  "hỏi mãi không trả lời", "chăm sóc khách hàng quá chán", "tư vấn vớ vẩn", "thái độ không tốt",
  "làm ăn chán", "phục vụ quá kém", "gọi không nghe máy", "bỏ mặc khách"
];

// Bộ từ khóa: Khiếu nại biến chứng / ngộ độc DO dùng thuốc của shop
const ADVERSE_EFFECT_BLAME = [
  "uống vào bị ngộ độc", "uống xong bị ngộ độc", "uống bị ngộ độc",
  "uống vào đau bụng dữ dội", "uống vào nôn mửa", "uống vào đi ngoài liên tục",
  "nhập viện cấp cứu", "phải nhập viện", "suýt chết", "càng bệnh nặng hơn",
  "uống vào càng đau hơn", "dị ứng nặng", "nổi mề đay khắp người",
  "tại thuốc của shop", "do thuốc của bên", "do sữa của bên", "uống xong suýt chết"
];

// Bộ từ khóa: Tiêu cực nhẹ / Thắc mắc chần chừ (NEGATIVE)
const MILD_NEGATIVE_KEYWORDS = [
  "sao đắt thế", "giá chát quá", "chưa thấy hiệu quả", "uống chưa thấy giảm",
  "thấy không đỡ", "hơi lâu", "lo lắng", "không biết có tốt thật không",
  "sợ không khỏi", "sao lâu thế", "hơi buồn", "hơi phiền", "giá hơi cao",
  "nghi ngờ", "chưa an tâm", "sợ bị lừa", "uống không thấy tác dụng", "chậm có kết quả"
];

// Bộ từ khóa: Tích cực / Khen ngợi / Cảm ơn (POSITIVE)
const POSITIVE_KEYWORDS = [
  "cảm ơn", "cam on", "cám ơn", "tốt lắm", "tot lam", "rất tốt", "rat tot",
  "đã nhận được hàng", "hàng đẹp", "đóng gói cẩn thận", "uống đỡ nhiều",
  "uống thấy khỏe", "đường huyết đã hạ", "đường huyết ổn định", "tư vấn nhiệt tình",
  "shop uy tín", "sẽ ủng hộ tiếp", "tuyệt vời", "tuyet voi", "ok shop", "cảm ơn bác sĩ",
  "rất hài lòng", "rat hai long", "ưng ý", "cho 5 sao", "uống rất êm", "đã khỏe lại"
];

// BỘ TỪ KHÓA BỆNH LÝ Y KHOA — TRIỆU CHỨNG LÂM SÀNG CỦA BỆNH NHÂN (KHÔNG PHẢI KHÁCH CÁU GẮT!)
const MEDICAL_SYMPTOM_KEYWORDS = [
  "đau nhức", "nhức mỏi", "mệt mỏi", "tụt huyết áp", "tut huyet ap", "tăng huyết áp",
  "huyết áp cao", "huyết áp thấp", "tiểu đường", "đái tháo đường", "đường huyết",
  "đo đường huyết", "chỉ số đường huyết", "tê bì", "tê bì chân tay", "mờ mắt",
  "sụt cân", "khát nước", "tiểu nhiều", "tiểu đêm", "mất ngủ", "đau đầu",
  "chóng mặt", "đau lưng", "thoái hóa khớp", "sốt", "đau dạ dày", "đầy bụng",
  "chướng bụng", "buồn nôn", "viêm họng", "ho có đờm", "khó thở", "đau tim",
  "men gan cao", "mỡ máu", "acid uric", "gout", "chấn thương", "suy thận",
  "chỉ số", "chấm đường", "uống thuốc tây", "đang điều trị"
];

/**
 * Chuẩn hóa chuỗi văn bản phục vụ so khớp
 */
function normalizeText(str = "") {
  return String(str || "")
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Kiểm tra xuất hiện của từ khóa độc lập hoặc cụm từ
 */
function containsKeyword(normalizedText, keyword) {
  const normKw = normalizeText(keyword);
  if (!normKw) return false;
  // Khớp ranh giới từ hoặc cụm từ
  const pattern = new RegExp(`(^|\\s)${normKw.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")}(\\s|$)`, "i");
  return pattern.test(normalizedText);
}

/**
 * Trích xuất danh sách từ khóa khớp
 */
function extractMatches(normalizedText, keywordList) {
  const matches = [];
  for (const kw of keywordList) {
    if (containsKeyword(normalizedText, kw)) {
      matches.push(kw);
    }
  }
  return matches;
}

/**
 * Phát hiện biểu hiện gào thét / viết hoa toàn bộ (CAPS LOCK shouting)
 * Ví dụ: "LỪA ĐẢO HẢ BỌN KHỐN!", "TRẢ TIỀN LẠI ĐÂY"
 */
function detectShouting(rawText = "") {
  const lettersOnly = rawText.replace(/[^a-zA-ZÀ-ỹ]/g, "");
  if (lettersOnly.length >= 8) {
    const uppercaseCount = (rawText.match(/[A-ZÀ-Ỹ]/g) || []).length;
    const ratio = uppercaseCount / lettersOnly.length;
    if (ratio > 0.75) {
      return true;
    }
  }
  return false;
}

/**
 * Phát hiện chuỗi dấu chấm than / chấm hỏi gay gắt liên tiếp
 * Ví dụ: "???!!!", "!!!!!", "???"
 */
function detectAggressivePunctuation(rawText = "") {
  return /[!?]{2,}/.test(rawText);
}

/**
 * Phân tích sắc thái cảm xúc của tin nhắn khách hàng (Sentiment Analysis Engine).
 *
 * @param {string} messageText - Nội dung tin nhắn của khách hàng
 * @param {object} [context={}] - Ngữ cảnh bổ sung (tên khách, lịch sử, metadata...)
 * @returns {{
 *   status: 'ANGRY' | 'COMPLAINT' | 'NEGATIVE' | 'NEUTRAL' | 'POSITIVE',
 *   score: number, // 0.0 -> 1.0 (Anger / Risk severity score)
 *   polarity: 'NEGATIVE' | 'NEUTRAL' | 'POSITIVE',
 *   confidence: number,
 *   requiresHandover: boolean,
 *   isMedicalSymptomOnly: boolean,
 *   matchedCategories: string[],
 *   matchedKeywords: string[],
 *   reasons: string[],
 *   detectedSymptoms: string[],
 *   originalText: string
 * }}
 */
export function analyzeCustomerSentiment(messageText = "", context = {}) {
  const rawText = String(messageText || "").trim();
  const normalizedText = normalizeText(rawText);

  // Mặc định kết quả
  const result = {
    status: "NEUTRAL",
    score: 0.2, // Rủi ro cáu gắt mặc định thấp
    polarity: "NEUTRAL",
    confidence: 0.8,
    requiresHandover: false,
    isMedicalSymptomOnly: false,
    matchedCategories: [],
    matchedKeywords: [],
    reasons: [],
    detectedSymptoms: [],
    originalText: rawText,
  };

  if (!normalizedText) {
    result.score = 0.0;
    return result;
  }

  // 1. Trích xuất các danh mục
  const fraudMatches = extractMatches(normalizedText, FRAUD_KEYWORDS);
  const legalMatches = extractMatches(normalizedText, THREAT_LEGAL_KEYWORDS);
  const extremeAngerMatches = extractMatches(normalizedText, EXTREME_ANGER_KEYWORDS);
  const escalationMatches = extractMatches(normalizedText, DEMAND_ESCALATION_KEYWORDS);
  const adverseBlameMatches = extractMatches(normalizedText, ADVERSE_EFFECT_BLAME);
  const complaintMatches = extractMatches(normalizedText, PRODUCT_SERVICE_COMPLAINTS);
  const mildNegativeMatches = extractMatches(normalizedText, MILD_NEGATIVE_KEYWORDS);
  const positiveMatches = extractMatches(normalizedText, POSITIVE_KEYWORDS);
  const symptomMatches = extractMatches(normalizedText, MEDICAL_SYMPTOM_KEYWORDS);

  const isShouting = detectShouting(rawText);
  const hasAggressivePunct = detectAggressivePunctuation(rawText);

  if (symptomMatches.length > 0) {
    result.detectedSymptoms = symptomMatches;
  }

  // 2. PHÂN TÍCH ƯU TIÊN 1: CÁC TÍN HIỆU CÁU GẮT CỰC ĐỘ HOẶC CÁO BUỘC NGHIÊM TRỌNG (ANGRY)
  const isFraud = fraudMatches.length > 0;
  const isLegalThreat = legalMatches.length > 0;
  const isExtremeAnger = extremeAngerMatches.length > 0;
  const isDemandEscalation = escalationMatches.length > 0;
  const isAdverseBlame = adverseBlameMatches.length > 0;

  if (isFraud || isLegalThreat || isExtremeAnger || isDemandEscalation || isAdverseBlame) {
    result.status = "ANGRY";
    result.polarity = "NEGATIVE";
    result.requiresHandover = true;

    // Tính điểm cáu gắt (0.80 -> 1.0)
    let score = 0.85;
    if (isFraud) {
      result.matchedCategories.push("FRAUD_ACCUSATION");
      result.matchedKeywords.push(...fraudMatches);
      result.reasons.push("Cáo buộc lừa đảo/gian lận: " + fraudMatches.join(", "));
      score += 0.08;
    }
    if (isLegalThreat) {
      result.matchedCategories.push("LEGAL_THREAT");
      result.matchedKeywords.push(...legalMatches);
      result.reasons.push("Đe dọa báo công an / kiện tụng / bóc phốt: " + legalMatches.join(", "));
      score += 0.07;
    }
    if (isExtremeAnger) {
      result.matchedCategories.push("EXTREME_ANGER");
      result.matchedKeywords.push(...extremeAngerMatches);
      result.reasons.push("Ngôn từ tức giận / xúc phạm gay gắt: " + extremeAngerMatches.join(", "));
      score += 0.06;
    }
    if (isDemandEscalation) {
      result.matchedCategories.push("DEMAND_ESCALATION");
      result.matchedKeywords.push(...escalationMatches);
      result.reasons.push("Đòi gặp quản lý / đòi tiền gắt gao: " + escalationMatches.join(", "));
      score += 0.05;
    }
    if (isAdverseBlame) {
      result.matchedCategories.push("ADVERSE_EFFECT_BLAME");
      result.matchedKeywords.push(...adverseBlameMatches);
      result.reasons.push("Khiếu nại ngộ độc / cấp cứu do sản phẩm: " + adverseBlameMatches.join(", "));
      score += 0.08;
    }

    if (isShouting) score += 0.04;
    if (hasAggressivePunct) score += 0.03;

    result.score = Math.min(1.0, Math.round(score * 100) / 100);
    result.confidence = 0.95;
    return result;
  }

  // 3. PHÂN TÍCH ƯU TIÊN 2: KHIẾU NẠI CHẤT LƯỢNG / DỊCH VỤ / ĐƠN HÀNG (COMPLAINT)
  if (complaintMatches.length > 0) {
    result.status = "COMPLAINT";
    result.polarity = "NEGATIVE";
    result.matchedCategories.push("SERVICE_OR_PRODUCT_COMPLAINT");
    result.matchedKeywords.push(...complaintMatches);
    result.reasons.push("Khiếu nại chất lượng sản phẩm/dịch vụ: " + complaintMatches.join(", "));

    let score = 0.65;
    score += Math.min(0.12, complaintMatches.length * 0.04);
    if (isShouting) score += 0.05;
    if (hasAggressivePunct) score += 0.04;

    // Nếu khiếu nại nhiều điểm cùng lúc hoặc đi kèm thái độ gay gắt -> Kích hoạt Handover
    if (score >= 0.75 || complaintMatches.length >= 2 || isShouting) {
      result.requiresHandover = true;
    }

    result.score = Math.min(0.79, Math.round(score * 100) / 100);
    result.confidence = 0.90;
    return result;
  }

  // 4. PHÂN TÍCH ƯU TIÊN 3: PHẢN HỒI TÍCH CỰC / KHEN NGỢI / ĐỠ BỆNH (POSITIVE)
  if (positiveMatches.length > 0 && mildNegativeMatches.length === 0) {
    result.status = "POSITIVE";
    result.polarity = "POSITIVE";
    result.matchedCategories.push("POSITIVE_FEEDBACK");
    result.matchedKeywords.push(...positiveMatches);
    result.reasons.push("Khách hàng hài lòng, khen ngợi: " + positiveMatches.join(", "));
    result.score = Math.max(0.02, Math.round((0.15 - positiveMatches.length * 0.03) * 100) / 100);
    result.requiresHandover = false;
    result.confidence = 0.94;
    return result;
  }

  // 5. PHÂN TÍCH ƯU TIÊN 4: PHÂN BIỆT RÕ RÀNG TRIỆU CHỨNG BỆNH LÝ (MEDICAL SYMPTOMS)
  // Lưu ý nghiệp vụ: Bệnh nhân mô tả đau nhức, tụt huyết áp, mệt mỏi là triệu chứng sinh lý, KHÔNG PHẢI cáu gắt!
  if (symptomMatches.length > 0 && mildNegativeMatches.length === 0) {
    result.status = "NEUTRAL";
    result.polarity = "NEUTRAL";
    result.isMedicalSymptomOnly = true;
    result.matchedCategories.push("MEDICAL_CONSULTATION");
    result.matchedKeywords.push(...symptomMatches);
    result.reasons.push("Chia sẻ triệu chứng bệnh lý lâm sàng: " + symptomMatches.join(", "));
    result.score = 0.20; // Điểm rủi ro thấp, an toàn để AI bot tư vấn tiếp
    result.requiresHandover = false;
    result.confidence = 0.92;
    return result;
  }


  // 6. PHÂN TÍCH ƯU TIÊN 5: TIÊU CỰC NHẸ / THẮC MẮC CHẦN CHỪ (NEGATIVE)
  if (mildNegativeMatches.length > 0) {
    result.status = "NEGATIVE";
    result.polarity = "NEGATIVE";
    result.matchedCategories.push("MILD_NEGATIVE_OR_HESITATION");
    result.matchedKeywords.push(...mildNegativeMatches);
    result.reasons.push("Khách hàng băn khoăn / lo ngại về giá hoặc tác dụng: " + mildNegativeMatches.join(", "));
    result.score = 0.45;
    result.requiresHandover = false; // Tiêu cực nhẹ AI bot vẫn xử lý từ chối (objection handling) được
    result.confidence = 0.85;
    return result;
  }

  // 7. MẶC ĐỊNH: BÌNH THƯỜNG / HỎI THÔNG TIN / ĐẶT HÀNG (NEUTRAL)
  result.status = "NEUTRAL";
  result.polarity = "NEUTRAL";
  result.score = 0.20;
  result.requiresHandover = false;
  result.confidence = 0.80;
  return result;
}

/**
 * Helper kiểm tra nhanh xem tin nhắn có cần tắt bot ngay lập tức hay không.
 * @param {string} messageText
 * @returns {boolean}
 */
export function isUrgentAngryCustomer(messageText = "") {
  const analysis = analyzeCustomerSentiment(messageText);
  return analysis.requiresHandover || analysis.status === "ANGRY";
}

export const detectSentiment = analyzeCustomerSentiment;
export function shouldTriggerSentimentAlert(analysis) {
  if (!analysis) return false;
  return Boolean(analysis.requiresHandover || analysis.status === "ANGRY");
}
