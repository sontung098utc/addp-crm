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

import { searchSecondBrain, SECOND_BRAIN_WIKI } from "./secondBrain.js";
import { extractPhoneNumbersFromText } from "./customerIdentityResolver.js";

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
  customerName = "Anh/Chị",
  context = "",
} = {}) {
  const query = customerMessage.trim();
  const matchedDocs = searchSecondBrain(query);
  const references = matchedDocs.slice(0, 2).map((d) => d.title);

  const textLower = query.toLowerCase();

  // 1. Nếu khách hỏi về giá / combo
  if (textLower.includes("giá") || textLower.includes("bao nhiêu") || textLower.includes("combo")) {
    const glucare = SECOND_BRAIN_WIKI.find((d) => d.id === "kb_prod_glucare_plus");
    return {
      replyText: `Dạ em chào ${customerName}! Dạ dòng Sữa Hạt Tiểu Đường Glucare Plus bên em hiện có giá niêm yết là 590.000đ/hộp 800g (dùng được khoảng nửa tháng ạ). Hiện công ty đang có chương trình trợ giá đặc biệt: khi mua Combo Liệu trình 3 tặng 1 (tổng 4 hộp) giá chỉ 1.770.000đ, hoặc Combo 5 tặng 2 tặng kèm 1 hộp Trà Mát Gan giải độc. Em xin phép gửi thông tin chi tiết để ${customerName} tham khảo nhé ạ!`,
      references: ["Sữa Hạt Tiểu Đường Glucare Plus", "Bảng giá Combo"],
      tags: ["Hỏi giá & Combo"],
    };
  }

  // 2. Nếu khách chê đắt hoặc băn khoăn về giá
  if (textLower.includes("đắt") || textLower.includes("cao quá") || textLower.includes("sao đắt thế")) {
    const obj = SECOND_BRAIN_WIKI.find((d) => d.id === "kb_objection_price");
    return {
      replyText: obj ? obj.script.replace(/anh\/chị/g, customerName) : "",
      references: ["Xử lý từ chối: Khách chê giá đắt"],
      tags: ["Khách chê giá"],
    };
  }

  // 3. Nếu khách hỏi cách uống / cách pha
  if (textLower.includes("pha") || textLower.includes("uống thế nào") || textLower.includes("hướng dẫn") || textLower.includes("cách dùng")) {
    return {
      replyText: `Dạ cách pha sữa Glucare Plus rất đơn giản và chuẩn theo hướng dẫn của Dược sĩ bên em như sau ạ:\n- ${customerName} lấy 2 muỗng gạt ngang (khoảng 25g bột sữa).\n- Pha với 150ml - 180ml nước ấm khoảng 50°C (nước ấm vừa, không pha nước sôi 100 độ để giữ trọn vẹn vitamin và đạm hạt tự nhiên ạ).\n- Khuấy đều và uống ấm. Mình duy trì uống 1 - 2 ly mỗi ngày: ly sáng thay bữa ăn sáng và ly chiều sau ăn tối 1 tiếng là tốt nhất ạ!`,
      references: ["Hướng dẫn sử dụng Glucare Plus"],
      tags: ["Hỏi cách pha"],
    };
  }

  // 4. Nếu Sale gõ ý thô (Nút ✨ A.I. Soạn): Biến ý thô thành câu tư vấn lịch sự hoàn chỉnh
  if (query) {
    return {
      replyText: `Dạ em chào ${customerName}, Dược sĩ bên ADDP xin phép giải đáp chi tiết cho mình ạ: ${query}. Nếu trong quá trình sử dụng có bất kỳ thắc mắc nào về chỉ số đường huyết hay dinh dưỡng, ${customerName} cứ nhắn lại để em hỗ trợ mình theo dõi sát sao nhé ạ!`,
      references: references.length > 0 ? references : ["Kiến thức Dược sĩ ADDP"],
      tags: ["Tư vấn bệnh lý"],
    };
  }

  return {
    replyText: `Dạ em chào ${customerName}, Dược sĩ ADDP luôn sẵn sàng hỗ trợ mình kiểm soát đường huyết và tư vấn chế độ dinh dưỡng an toàn ạ. Anh/chị đang quan tâm đến vấn đề nào nhắn em hỗ trợ ngay nhé!`,
    references: ["Chào hỏi mở đầu"],
    tags: ["Tư vấn"],
  };
}
