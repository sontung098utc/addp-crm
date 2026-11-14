/**
 * ADDP Omnichannel AI CRM — AI Lead Scoring Engine (Chấm điểm mức độ quan tâm của khách hàng: Hot / Warm / Cold)
 * Tuân thủ Điều 2 & Điều 3 AGENTS.md.
 *
 * Tiêu chí chấm điểm (Scoring Criteria):
 * 1. Sickness urgency & disease sharing (đái tháo đường, sụt cân, tê bì, chỉ số đường huyết cao...) -> +25 điểm.
 * 2. Product & pricing inquiry (hỏi giá bao nhiêu, khuyến mãi, liệu trình, combo...) -> +30 điểm.
 * 3. Contact & logistics intent (cho số điện thoại, gửi địa chỉ giao hàng, hỏi ship bao lâu...) -> +35 điểm.
 * 4. Objection handling / hesitation (đắt quá, sợ không hợp, hỏi lại vợ/chồng, cân nhắc...) -> +10 điểm.
 *
 * Thang điểm & Phân cấp (Score Scale):
 * - HOT (Score >= 80): Sẵn sàng mua ngay, cần Sale chốt đơn lập tức. -> suggestedAction: 'Tạo đơn ngay'
 * - WARM (Score 50-79): Đang quan tâm sâu, cần tư vấn thêm về phác đồ/sản phẩm. -> suggestedAction: 'Tư vấn thêm liệu trình'
 * - COLD (Score < 50): Mới tiếp cận, cần nuôi dưỡng và cung cấp giá trị. -> suggestedAction: 'Gửi thực đơn miễn phí'
 */

import { extractPhoneNumbersFromText, normalizePhone } from "../customerIdentityResolver.js";
import { extractMedicalEntities } from "../customerStore.js";

export const LEAD_TIERS = {
  HOT: "HOT",
  WARM: "WARM",
  COLD: "COLD",
};

export const LEAD_ACTIONS = {
  HOT: "Tạo đơn ngay",
  WARM: "Tư vấn thêm liệu trình",
  COLD: "Gửi thực đơn miễn phí",
};

export const SCORING_WEIGHTS = {
  SICKNESS: 25,
  PRODUCT_PRICING: 30,
  CONTACT_LOGISTICS: 35,
  OBJECTION_HESITATION: 10,
};

// Từ khóa & Biểu thức chính quy cho Bệnh lý & Triệu chứng cấp thiết (+25 điểm)
const SICKNESS_PATTERNS = [
  /\b(tiểu\s*đường|đái\s*tháo\s*đường|tuýp\s*[12]|type\s*[12]|tiền\s*tiểu\s*đường|hba1c)\b/i,
  /\b(đường\s*huyết|chỉ\s*số\s*đường|hạ\s*đường|tụt\s*đường|tăng\s*đường|đo\s*đường)\b/i,
  /\b(sụt\s*cân|sút\s*cân|sút\s*\d+\s*(?:cân|kg|ký)|giảm\s*cân\s*nhanh)\b/i,
  /\b(tê\s*bì|tê\s*chân|tê\s*tay|tê\s*chân\s*tay|chuột\s*rút|châm\s*chích|buốt\s*chân)\b/i,
  /\b(tiểu\s*đêm|đái\s*đêm|đi\s*tiểu\s*nhiều|khô\s*miệng|khát\s*nước|uể\s*oải|mệt\s*mỏi)\b/i,
  /\b(mờ\s*mắt|mắt\s*mờ|teo\s*cơ|loét\s*chân|vết\s*thương\s*khó\s*lành|biến\s*chứng|hoại\s*tử)\b/i,
  /\b(huyết\s*áp|mỡ\s*máu|men\s*gan|suy\s*thận|đang\s*tiêm\s*insulin|uống\s*thuốc\s*tây)\b/i,
  /\b\d{1,2}(?:[.,]\d{1,2})?\s*(?:chấm|phẩy|mmol\/l|mmol|mg\/dl)\b/i,
];

// Từ khóa & Biểu thức chính quy cho Hỏi giá, Khuyến mãi, Liệu trình (+30 điểm)
const PRODUCT_PRICING_PATTERNS = [
  /\b(bao\s*nhiêu\s*tiền|giá\s*bao\s*nhiêu|nhiêu\s*tiền|nhiêu\s*1\s*hộp|bao\s*tiền|mấy\s*tiền|chi\s*phí)\b/i,
  /\b(giá\s*cả|báo\s*giá|xin\s*giá|cho\s*giá|inbox\s*giá|check\s*giá|giá\s*thế\s*nào|giá\s*sao|bao\s*nhiêu\s*1\s*hộp)\b/i,
  /\b(khuyến\s*mãi|khuyến\s*mại|giảm\s*giá|ưu\s*đãi|u\s*đãi|voucher|mã\s*giảm|quà\s*tặng|tặng\s*quà)\b/i,
  /\b(mua\s*mấy\s*tặng\s*mấy|mua\s*[1234]\s*tặng|tặng\s*[123]|combo|chương\s*trình)\b/i,
  /\b(liệu\s*trình|uống\s*bao\s*lâu|dùng\s*bao\s*lâu|mấy\s*tháng|1\s*tháng|3\s*tháng|liều\s*lượng)\b/i,
  /\b(hộp\s*bao\s*nhiêu|lon\s*bao\s*nhiêu|hũ\s*bao\s*nhiêu|thùng\s*bao\s*nhiêu|bao\s*nhiêu\s*gam|gam|gram)\b/i,
  /\b(thành\s*phần|sữa\s*hạt|sữa|glucare|dovital|isomalt|cách\s*dùng|uống\s*thế\s*nào|uống\s*có\s*đỡ\s*không)\b/i,
  /\b(uống\s*(?:ngày\s*)?mấy\s*(?:lần|ly|gói|viên|muỗng|thìa)|ngày\s*mấy\s*lần|uống\s*lúc\s*nào|pha\s*như\s*thế\s*nào|uống\s*như\s*thế\s*nào|uống\s*sao)\b/i,
];

// Từ khóa & Biểu thức chính quy cho Thông tin liên hệ & Giao nhận / Chốt đơn (+35 điểm)
const CONTACT_LOGISTICS_PATTERNS = [
  /\b(ship\s*bao\s*lâu|mấy\s*ngày\s*tới|khi\s*nào\s*nhận|bao\s*lâu\s*nhận\s*được|thời\s*gian\s*giao)\b/i,
  /\b(phí\s*ship|tiền\s*ship|có\s*freeship|miễn\s*phí\s*vận\s*chuyển|miễn\s*phí\s*ship|giao\s*tận\s*nơi)\b/i,
  /\b(kiểm\s*tra\s*hàng|cho\s*xem\s*hàng|xem\s*hàng\s*trước|đồng\s*kiểm|thanh\s*toán\s*khi\s*nhận|ship\s*cod|cod)\b/i,
  /\b(ship\s*(?:về|cho|đến)|gửi\s*(?:về|cho|đến)|giao\s*(?:về|cho|đến)|chuyển\s*(?:về|cho|đến))\b/i,
  /\b(địa\s*chỉ|số\s*nhà|thôn|xóm|ấp|bản|phường|xã|quận|huyện|thành\s*phố|tỉnh|ngõ|ngách|đường)\b/i,
  /\b(đặt\s*(?:1|2|3|4|\d+)\s*(?:hộp|lon|hũ|liệu\s*trình|thùng)|lấy\s*(?:1|2|3|4|\d+)\s*(?:hộp|lon|hũ|liệu\s*trình|thùng))\b/i,
  /\b(chốt\s*cho\s*(?:tôi|chị|anh|cô|chú|mình)|chốt\s*đơn|cho\s*(?:tôi|chị|anh|cô|chú|mình)\s*(?:1|2|3|\d+)\s*(?:hộp|lon)|đặt\s*hàng)\b/i,
  /\b(số\s*điện\s*thoại\s*của\s*(?:tôi|chị|anh|cô|chú)|sđt\s*(?:là|:)?|gọi\s*(?:cho\s*)?(?:tôi|chị|anh|cô|chú|số\s*này))\b/i,
];

// Từ khóa & Biểu thức chính quy cho Băn khoăn / Do dự / Phản hồi (+10 điểm)
const OBJECTION_HESITATION_PATTERNS = [
  /\b(đắt\s*quá|giá\s*hơi\s*cao|giá\s*hơi\s*đắt|hơi\s*đắt|hơi\s*cao|đắt\s*thế|đắt\s*vậy|sợ\s*đắt|sợ\s*tốn\s*tiền)\b/i,
  /\b(sợ\s*không\s*hợp|uống\s*nhiều\s*loại\s*không\s*đỡ|uống\s*không\s*hiệu\s*quả|có\s*chắc\s*chắn\s*không)\b/i,
  /\b(có\s*cam\s*kết|cam\s*kết\s*gì\s*không|có\s*đảm\s*bảo|đảm\s*bảo\s*không|uống\s*có\s*tác\s*dụng\s*phụ)\b/i,
  /\b(hỏi\s*(?:ý\s*kiến\s*)?(?:vợ|chồng|con|bác\s*sĩ)|bàn\s*với\s*(?:vợ|chồng|con|gia\s*đình))\b/i,
  /\b(để\s*suy\s*nghĩ|để\s*cân\s*nhắc|xem\s*lại\s*đã|suy\s*nghĩ\s*thêm|cân\s*nhắc\s*đã|đang\s*phân\s*vân)\b/i,
  /\b(chưa\s*có\s*tiền|lương\s*về\s*mới\s*mua|hôm\s*khác|để\s*tính\s*sau|để\s*sau)\b/i,
];

/**
 * Trích xuất toàn bộ nội dung văn bản từ danh sách tin nhắn hoặc chuỗi hội thoại
 * @param {Array<object|string>|string} messages
 * @returns {string}
 */
export function extractTextFromMessages(messages) {
  if (!messages) return "";
  if (typeof messages === "string") return messages.trim();

  if (Array.isArray(messages)) {
    return messages
      .map((item) => {
        if (!item) return "";
        if (typeof item === "string") return item;
        // Bóc tách từ object tin nhắn phong phú
        return (
          item.text ||
          item.message ||
          item.content ||
          item.body ||
          item.msg ||
          ""
        );
      })
      .filter(Boolean)
      .join(" \n ");
  }

  return "";
}

/**
 * Chấm điểm mức độ quan tâm của khách hàng (AI Lead Scoring)
 *
 * @param {object} input
 * @param {Array<object|string>|string} [input.messages] - Danh sách tin nhắn hoặc nội dung hội thoại
 * @param {string} [input.conversationText] - Nội dung text trực tiếp nếu có
 * @param {object} [input.customer] - Hồ sơ khách hàng 360 (metadata: phone, pathology, medicalRecord, tags, orders...)
 * @returns {{
 *   score: number,
 *   tier: 'HOT' | 'WARM' | 'COLD',
 *   factors: string[],
 *   suggestedAction: string,
 *   breakdown: {
 *     sickness: { score: number, max: number, matched: boolean, details: string[] },
 *     productPricing: { score: number, max: number, matched: boolean, details: string[] },
 *     contactLogistics: { score: number, max: number, matched: boolean, details: string[] },
 *     objectionHesitation: { score: number, max: number, matched: boolean, details: string[] }
 *   },
 *   evaluatedAt: string
 * }}
 */
export function evaluateLeadScore(input = {}) {
  const { messages, conversationText, customer = {} } = input;
  const rawText = (conversationText || extractTextFromMessages(messages) || "").trim();
  const lowerText = rawText.toLowerCase();

  const factors = [];
  let totalScore = 0;

  // ==========================================
  // TIÊU CHÍ 1: Sickness urgency & disease sharing (+25 điểm)
  // ==========================================
  const sicknessDetails = [];
  let isSicknessMatched = false;

  // 1.1 Kiểm tra văn bản hội thoại
  for (const pattern of SICKNESS_PATTERNS) {
    const match = lowerText.match(pattern);
    if (match && match[0]) {
      sicknessDetails.push(match[0].trim());
    }
  }

  // 1.2 Bóc tách y khoa tự động nếu có
  if (rawText) {
    const entities = extractMedicalEntities(rawText, customer?.medicalRecord || {});
    if (entities?.bloodSugar) {
      sicknessDetails.push(`đường huyết ${entities.bloodSugar}`);
    }
    if (Array.isArray(entities?.symptoms) && entities.symptoms.length > 0) {
      sicknessDetails.push(...entities.symptoms);
    }
  }

  // 1.3 Kiểm tra metadata khách hàng (nếu có sẵn hồ sơ bệnh lý hoặc tags)
  if (customer) {
    if (customer.initialGlucose || customer.currentGlucose || customer.medicalRecord?.bloodSugar) {
      const bs = customer.currentGlucose || customer.initialGlucose || customer.medicalRecord?.bloodSugar;
      sicknessDetails.push(`chỉ số đường huyết ${bs}`);
    }
    if (customer.pathology && /tiểu\s*đường|huyết\s*áp|gan|suy\s*thận/i.test(customer.pathology)) {
      sicknessDetails.push(`bệnh lý: ${customer.pathology}`);
    }
    if (Array.isArray(customer.tags)) {
      const medicalTags = customer.tags.filter((t) =>
        /tiểu đường|tieu\s*duong|đường huyết|duong\s*huyet|sụt cân|sut\s*can|tê bì|te\s*bi|men gan|men\s*gan|thận|than/i.test(String(t))
      );
      if (medicalTags.length > 0) {
        sicknessDetails.push(...medicalTags);
      }
    }
  }

  const uniqueSicknessDetails = Array.from(new Set(sicknessDetails));
  if (uniqueSicknessDetails.length > 0) {
    isSicknessMatched = true;
    totalScore += SCORING_WEIGHTS.SICKNESS;
    factors.push(
      `Bệnh lý & triệu chứng cấp thiết: ${uniqueSicknessDetails.slice(0, 3).join(", ")} (+${SCORING_WEIGHTS.SICKNESS} điểm)`
    );
  }

  // ==========================================
  // TIÊU CHÍ 2: Product & pricing inquiry (+30 điểm)
  // ==========================================
  const pricingDetails = [];
  let isPricingMatched = false;

  for (const pattern of PRODUCT_PRICING_PATTERNS) {
    const match = lowerText.match(pattern);
    if (match && match[0]) {
      pricingDetails.push(match[0].trim());
    }
  }

  if (customer && Array.isArray(customer.tags)) {
    const inquiryTags = customer.tags.filter((t) =>
      /hỏi giá|hoi\s*gia|cần tư vấn|can\s*tu\s*van|quan tâm|quan\s*tam|liệu trình|lieu\s*trinh|tuvan/i.test(String(t))
    );
    if (inquiryTags.length > 0) {
      pricingDetails.push(...inquiryTags);
    }
  }

  const uniquePricingDetails = Array.from(new Set(pricingDetails));
  if (uniquePricingDetails.length > 0) {
    isPricingMatched = true;
    totalScore += SCORING_WEIGHTS.PRODUCT_PRICING;
    factors.push(
      `Tìm hiểu sản phẩm & giá cả: ${uniquePricingDetails.slice(0, 3).join(", ")} (+${SCORING_WEIGHTS.PRODUCT_PRICING} điểm)`
    );
  }

  // ==========================================
  // TIÊU CHÍ 3: Contact & logistics intent (+35 điểm)
  // ==========================================
  const logisticsDetails = [];
  let isLogisticsMatched = false;

  // 3.1 Nhận diện số điện thoại trong tin nhắn
  const extractedPhones = extractPhoneNumbersFromText(rawText);
  if (extractedPhones.length > 0) {
    logisticsDetails.push(`cung cấp SĐT (${extractedPhones.join(", ")})`);
  }

  // 3.2 Nhận diện địa chỉ giao nhận / ship / COD
  for (const pattern of CONTACT_LOGISTICS_PATTERNS) {
    const match = lowerText.match(pattern);
    if (match && match[0]) {
      logisticsDetails.push(match[0].trim());
    }
  }

  // 3.3 Kiểm tra hồ sơ khách hàng đã có đơn hoặc có SĐT + địa chỉ
  if (customer) {
    if (customer.phone && normalizePhone(customer.phone) && (customer.address || (Number(customer.totalOrders) > 0))) {
      logisticsDetails.push(`đã có SĐT ${customer.phone} & địa chỉ giao hàng`);
    } else if (Number(customer.totalOrders) > 0) {
      logisticsDetails.push(`khách đã từng đặt ${customer.totalOrders} đơn hàng`);
    }
  }

  const uniqueLogisticsDetails = Array.from(new Set(logisticsDetails));
  if (uniqueLogisticsDetails.length > 0) {
    isLogisticsMatched = true;
    totalScore += SCORING_WEIGHTS.CONTACT_LOGISTICS;
    factors.push(
      `Sẵn sàng giao dịch & nhận hàng: ${uniqueLogisticsDetails.slice(0, 3).join(", ")} (+${SCORING_WEIGHTS.CONTACT_LOGISTICS} điểm)`
    );
  }

  // ==========================================
  // TIÊU CHÍ 4: Objection handling / hesitation (+10 điểm)
  // ==========================================
  const objectionDetails = [];
  let isObjectionMatched = false;

  for (const pattern of OBJECTION_HESITATION_PATTERNS) {
    const match = lowerText.match(pattern);
    if (match && match[0]) {
      objectionDetails.push(match[0].trim());
    }
  }

  const uniqueObjectionDetails = Array.from(new Set(objectionDetails));
  if (uniqueObjectionDetails.length > 0) {
    isObjectionMatched = true;
    totalScore += SCORING_WEIGHTS.OBJECTION_HESITATION;
    factors.push(
      `Có băn khoăn / do dự nghiêm túc: ${uniqueObjectionDetails.slice(0, 3).join(", ")} (+${SCORING_WEIGHTS.OBJECTION_HESITATION} điểm)`
    );
  }

  // Giới hạn điểm số từ 0 đến 100
  const finalScore = Math.min(100, Math.max(0, totalScore));

  // Phân hạng tier & Hành động gợi ý theo thang điểm chuẩn
  let tier = LEAD_TIERS.COLD;
  let suggestedAction = LEAD_ACTIONS.COLD;

  if (finalScore >= 80) {
    tier = LEAD_TIERS.HOT;
    suggestedAction = LEAD_ACTIONS.HOT;
  } else if (finalScore >= 50) {
    tier = LEAD_TIERS.WARM;
    suggestedAction = LEAD_ACTIONS.WARM;
  } else {
    tier = LEAD_TIERS.COLD;
    suggestedAction = LEAD_ACTIONS.COLD;
  }

  return {
    score: finalScore,
    tier,
    factors,
    suggestedAction,
    breakdown: {
      sickness: {
        score: isSicknessMatched ? SCORING_WEIGHTS.SICKNESS : 0,
        max: SCORING_WEIGHTS.SICKNESS,
        matched: isSicknessMatched,
        details: uniqueSicknessDetails,
      },
      productPricing: {
        score: isPricingMatched ? SCORING_WEIGHTS.PRODUCT_PRICING : 0,
        max: SCORING_WEIGHTS.PRODUCT_PRICING,
        matched: isPricingMatched,
        details: uniquePricingDetails,
      },
      contactLogistics: {
        score: isLogisticsMatched ? SCORING_WEIGHTS.CONTACT_LOGISTICS : 0,
        max: SCORING_WEIGHTS.CONTACT_LOGISTICS,
        matched: isLogisticsMatched,
        details: uniqueLogisticsDetails,
      },
      objectionHesitation: {
        score: isObjectionMatched ? SCORING_WEIGHTS.OBJECTION_HESITATION : 0,
        max: SCORING_WEIGHTS.OBJECTION_HESITATION,
        matched: isObjectionMatched,
        details: uniqueObjectionDetails,
      },
    },
    evaluatedAt: new Date().toISOString(),
  };
}
