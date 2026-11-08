/**
 * ADDP Omnichannel AI CRM — Trợ Lý AI Chăm Sóc & Bộ Phán Xử AI (Judge) (WBS-32, WBS-33, WBS-34)
 * Kế thừa logic Chatbot 3 chế độ từ Javis OS (docs/25-chatbot.md & docs/28-hoi-thoai-khach.md)
 *
 * 3 Chế độ hoạt động:
 * 1. AUTO_REPLY (A.I. trả lời 24/7): Tự động trả lời tin nhắn thông thường, báo giá, HDSD.
 * 2. DRAFT_ONLY (A.I. soạn nháp chờ duyệt): AI tự soạn câu trả lời sẵn trong khung nhập, Sale xem và bấm gửi.
 * 3. HUMAN_ONLY (Sale tiếp quản): Tắt AI, người thật trực tiếp trò chuyện.
 *
 * Bộ phán xử (AI Judge): Tự động nhận diện khiếu nại, tình trạng khẩn cấp hoặc câu hỏi ngoài tầm để chuyển người thật.
 * Tự động gắn thẻ Tag màu (WBS-34): Bóc tách SĐT, bệnh lý, địa chỉ.
 */

import { searchSecondBrain } from "./secondBrain.js";
import { extractPhoneNumbersFromText } from "./customerIdentityResolver.js";
import { generateHumanLikeReply } from "./ai/chatBotEngine.js";

export const AI_MODES = {
  AUTO_REPLY: {
    code: "AUTO_REPLY",
    label: "A.I. Trả Lời 24/7",
    color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    description: "AI tự động gửi câu trả lời ngay khi khách nhắn.",
  },
  DRAFT_ONLY: {
    code: "DRAFT_ONLY",
    label: "A.I. Soạn Nháp Chờ Duyệt",
    color: "bg-purple-500/20 text-purple-300 border-purple-500/40",
    description: "AI gợi ý câu trả lời vào khung chat để Sale kiểm tra trước khi gửi.",
  },
  HUMAN_ONLY: {
    code: "HUMAN_ONLY",
    label: "Sale Tiếp Quản (Takeover)",
    color: "bg-slate-700 text-slate-300 border-slate-600",
    description: "Chỉ người thật trả lời, AI không can thiệp.",
  },
};

/**
 * Bộ Phán Xử AI (AI Judge) đánh giá mức độ khẩn cấp và nội dung tin nhắn khách
 * @param {string} messageText
 * @returns {{decision: "AI_CAN_ANSWER"|"NEEDS_HUMAN", reason: string, detectedTags: string[], detectedPhone: string|null}}
 */
export function judgeCustomerMessage(messageText) {
  if (!messageText || typeof messageText !== "string") {
    return { decision: "AI_CAN_ANSWER", reason: "Tin nhắn rỗng", detectedTags: [], detectedPhone: null };
  }

  const text = messageText.toLowerCase();
  const detectedTags = [];

  // 1. Trích xuất SĐT nếu khách để lại trong tin nhắn (WBS-34)
  const phones = extractPhoneNumbersFromText(messageText);
  const detectedPhone = phones.length > 0 ? phones[0] : null;
  if (detectedPhone) {
    detectedTags.push("Có SĐT mới");
  }

  // 2. Nhận diện các từ khóa khẩn cấp hoặc khiếu nại (Chuyển người thật)
  const urgentKeywords = [
    "khiếu nại", "lừa đảo", "hoàn tiền", "trả hàng", "hỏng", "mốc",
    "ngộ độc", "nhập viện", "cấp cứu", "gặp dược sĩ", "gặp bác sĩ",
    "gọi lại cho tôi", "gọi ngay", "nói chuyện với người", "không nói chuyện với bot"
  ];

  for (const kw of urgentKeywords) {
    if (text.includes(kw)) {
      detectedTags.push("Cần xử lý khẩn cấp");
      return {
        decision: "NEEDS_HUMAN",
        reason: `Phát hiện từ khóa nhạy cảm / khiếu nại: "${kw}". Chuyển ngay cho Sale tiếp quản.`,
        detectedTags,
        detectedPhone,
      };
    }
  }

  // 3. Nhận diện bệnh lý để tự gắn Tag
  if (text.includes("tiểu đường") || text.includes("đường huyết") || text.includes("chỉ số")) {
    detectedTags.push("Tiểu đường");
  }
  if (text.includes("mỡ máu") || text.includes("men gan") || text.includes("gan nhiễm mỡ")) {
    detectedTags.push("Mỡ máu & Gan");
  }
  if (text.includes("giá") || text.includes("nhiêu tiền") || text.includes("combo") || text.includes("ưu đãi")) {
    detectedTags.push("Hỏi giá & Combo");
  }

  return {
    decision: "AI_CAN_ANSWER",
    reason: "Câu hỏi nằm trong phạm vi Kho Tri Thức Second Brain của ADDP.",
    detectedTags,
    detectedPhone,
  };
}

/**
 * Sinh câu trả lời chuẩn Dược sĩ ADDP dựa trên Kho Tri Thức Second Brain
 * @param {object} params
 * @param {string} params.customerMessage - Tin nhắn của khách hoặc ý tưởng phác thảo thô của Sale
 * @param {string} [params.customerName] - Tên xưng hô với khách
 * @param {string} [params.context] - Ghi chú thêm
 * @returns {Promise<{replyText: string, references: string[], tags: string[]}>}
 */
export async function generateAiDraftResponse({
  customerMessage = "",
  customerName = "",
  context = "",
  accountName = "",
  conversationHistory = [],
} = {}) {
  const query = String(customerMessage || "").trim();
  const matchedDocs = searchSecondBrain(query);
  const references = matchedDocs.slice(0, 2).map((d) => d.title);

  const aiResult = await generateHumanLikeReply({
    customerMessage: query,
    customerProfile: {
      fullName: customerName || "",
      pathology: context || "",
    },
    accountName: accountName || "",
    conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : [],
  });

  return {
    replyText: aiResult.replyText,
    typingDelayMs: aiResult.typingDelayMs,
    detectedPhone: aiResult.detectedPhone,
    references:
      aiResult.matchedProducts?.length > 0
        ? aiResult.matchedProducts
        : references.length > 0
        ? references
        : ["Kho Tri Thức Dược Phẩm ADDP"],
    tags: aiResult.matchedProducts?.includes("glucare_plus")
      ? ["Sữa hạt Glucare Plus", "Tiểu đường"]
      : aiResult.matchedProducts?.includes("dovital")
      ? ["Mát Gan Dovital", "Bệnh gan"]
      : ["Tư vấn dinh dưỡng ADDP"],
  };
}
