import {
  extractMedicalEntities,
  analyzeVietnameseGenderAndPronoun,
} from "../customerStore.js";
import { generateAiReply } from "./aiRouter.js";

export const EMPTY_PATHOLOGY = "Chưa có thông tin bệnh lý trong hội thoại.";
export const EMPTY_DEMAND = "Chưa ghi nhận nhu cầu cụ thể.";
export const EMPTY_CONCERNS = "Chưa ghi nhận băn khoăn nào.";

const DISEASE_PATTERNS = [
  { label: "tiểu đường", regex: /(?:tiểu\s*đường|đái\s*tháo\s*đường)(?:\s*(?:tuýp|type|týp)\s*[12])?/i },
  { label: "tiền tiểu đường", regex: /tiền\s*tiểu\s*đường/i },
  { label: "dạ dày", regex: /(?:đau\s*dạ\s*dày|viêm\s*loét\s*dạ\s*dày|trào\s*ngược)/i },
  { label: "gout", regex: /\bgout\b|\bgút\b/i },
  { label: "rối loạn tiền đình", regex: /tiền\s*đình/i },
  { label: "suy thận", regex: /suy\s*thận|bệnh\s*thận/i },
  { label: "tai biến / đột quỵ", regex: /tai\s*biến|đột\s*quỵ/i },
];

const PRODUCT_PATTERNS = [
  { label: "Sữa hạt Glucare Plus", regex: /glucare\s*plus|glucare/i },
  { label: "Sữa hạt", regex: /sữa\s*hạt/i },
  { label: "Sữa dinh dưỡng", regex: /\bsữa\b/i },
  { label: "Đông trùng hạ thảo", regex: /đông\s*trùng\s*hạ\s*thảo|đông\s*trùng/i },
  { label: "Ngũ cốc", regex: /ngũ\s*cốc/i },
  { label: "Trà thảo mộc", regex: /\btrà\b/i },
  { label: "Viên uống / Thực phẩm chức năng", regex: /viên\s*uống|thực\s*phẩm\s*chức\s*năng|\bthuốc\b/i },
];

const CONCERN_PATTERNS = [
  {
    label: "Hỏi về giá bán và chi phí",
    regex: /(?:giá\s*(?:sao|nhiêu|bao\s*nhiêu|thế\s*nào)?|bao\s*nhiêu\s*tiền|\bbn\b|mấy\s*tiền|đắt|mắc|chi\s*phí)/i,
  },
  {
    label: "Quan tâm khuyến mãi / ưu đãi / vận chuyển",
    regex: /(?:khuyến\s*mãi|khuyến\s*mại|ưu\s*đãi|giảm\s*giá|freeship|miễn\s*phí\s*(?:ship|vận\s*chuyển)|phí\s*ship)/i,
  },
  {
    label: "Băn khoăn vị ngọt / độ ngọt có làm tăng đường không",
    regex: /(?:có\s*ngọt|vị\s*ngọt|ngọt\s*không|tăng\s*đường|lên\s*đường)/i,
  },
  {
    label: "Hỏi cách dùng / cách pha / liều lượng",
    regex: /(?:cách\s*(?:dùng|pha|uống)|uống\s*(?:như\s*thế\s*nào|thế\s*nào|ra\s*sao|mấy\s*lần)|pha\s*(?:thế\s*nào|sao)|liều\s*dùng)/i,
  },
  {
    label: "Quan tâm nguồn gốc / độ an toàn / tác dụng phụ",
    regex: /(?:tác\s*dụng\s*phụ|nguồn\s*gốc|xuất\s*xứ|chính\s*hãng|hạn\s*sử\s*dụng|an\s*toàn|dị\s*ứng|có\s*tốt\s*không|hiệu\s*quả\s*không)/i,
  },
  {
    label: "Đang cân nhắc / hỏi ý kiến gia đình",
    regex: /(?:để\s*(?:xem|suy\s*nghĩ|hỏi\s*lại)|cân\s*nhắc|chưa\s*chắc|ngại|để\s*sau)/i,
  },
];

/**
 * Chuẩn hóa danh sách tin nhắn hợp lệ (tối đa 15 tin gần nhất có nội dung text).
 */
export function normalizeConversationMessages(messages = []) {
  if (!Array.isArray(messages)) return [];
  return messages
    .slice(-15)
    .map((m) => ({
      isMe: Boolean(m?.isMe),
      text: String(m?.text || "").trim(),
    }))
    .filter((m) => m.text.length > 0);
}

/**
 * Bộ phân tích deterministic (fallback khi không có LLM hoặc LLM lỗi).
 * TUYỆT ĐỐI chỉ trích xuất thông tin xuất hiện rõ ràng trong mảng `messages`.
 */
export function buildGroundedFallbackSummary({ messages = [], customer = {} } = {}) {
  const recentMessages = normalizeConversationMessages(messages);
  const customerName = String(customer?.fullName || customer?.name || "").trim();
  const pronounInfo = analyzeVietnameseGenderAndPronoun(
    customerName || "Khách hàng",
    customer?.gender
  );
  const pronoun = pronounInfo.pronoun || "chị";
  const addressWithName =
    customerName && customerName !== "Khách hàng"
      ? pronounInfo.addressWithName || pronoun
      : pronoun;

  const emptyClosingScript = `Dạ em chào ${addressWithName}, không biết hôm nay ${pronoun} đang quan tâm tìm hiểu sản phẩm hay cần em hỗ trợ vấn đề sức khỏe nào để em tư vấn chi tiết cho mình ạ?`;

  if (recentMessages.length === 0) {
    return {
      pathology: EMPTY_PATHOLOGY,
      demand: EMPTY_DEMAND,
      concerns: EMPTY_CONCERNS,
      closing_script: emptyClosingScript,
      extractedEntities: {
        bloodSugar: null,
        bloodSugarNumeric: null,
        duration: null,
        symptoms: [],
        goals: [],
        desiredWeightGain: null,
        autoTags: [],
      },
      customerPronoun: pronoun,
      source: "fallback-empty",
    };
  }

  const allText = recentMessages.map((m) => m.text).join(" . ");
  const customerText = recentMessages
    .filter((m) => !m.isMe)
    .map((m) => m.text)
    .join(" . ");
  const analysisText = customerText || allText;

  // 1. Bệnh lý & Triệu chứng (CHỈ trích xuất từ text hội thoại, KHÔNG lấy currentMedicalRecord bên ngoài)
  const extracted = extractMedicalEntities(analysisText, {});
  const pathologyItems = [];

  const matchedDiseases = [];
  for (const d of DISEASE_PATTERNS) {
    const m = analysisText.match(d.regex);
    if (m) {
      const idx = m.index || 0;
      const prefix = analysisText.slice(Math.max(0, idx - 12), idx).toLowerCase();
      const isNegated = /(?:không|ko|k|chưa|chẳng)\s*(?:bị|có|mắc)?\s*$/i.test(prefix);
      if (!isNegated) {
        const label = m[0].trim();
        if (!matchedDiseases.some((x) => x.toLowerCase() === label.toLowerCase())) {
          matchedDiseases.push(label);
        }
      }
    }
  }

  if (matchedDiseases.length > 0) {
    pathologyItems.push(`Bệnh lý đề cập: ${matchedDiseases.join(", ")}`);
  }
  if (extracted.bloodSugar) {
    pathologyItems.push(`Đường huyết: ${extracted.bloodSugar} mmol/L`);
  }
  if (extracted.duration) {
    pathologyItems.push(`Thời gian mắc: ${extracted.duration}`);
  }
  if (Array.isArray(extracted.symptoms) && extracted.symptoms.length > 0) {
    pathologyItems.push(`Triệu chứng: ${extracted.symptoms.join(", ")}`);
  }

  const pathology =
    pathologyItems.length > 0 ? pathologyItems.join(" • ") : EMPTY_PATHOLOGY;

  // 2. Nhu cầu & Sản phẩm (CHỈ trích xuất sản phẩm/mục tiêu có mặt trong hội thoại)
  const matchedProducts = [];
  for (const p of PRODUCT_PATTERNS) {
    if (p.regex.test(analysisText)) {
      // Tránh trùng lặp kiểu "Sữa hạt Glucare Plus" + "Sữa hạt" + "Sữa dinh dưỡng"
      const alreadyCovered =
        (p.label === "Sữa hạt" && matchedProducts.includes("Sữa hạt Glucare Plus")) ||
        (p.label === "Sữa dinh dưỡng" &&
          (matchedProducts.includes("Sữa hạt Glucare Plus") ||
            matchedProducts.includes("Sữa hạt")));
      if (!alreadyCovered) {
        matchedProducts.push(p.label);
      }
    }
  }

  const demandParts = [];
  if (matchedProducts.length > 0) {
    demandParts.push(`Sản phẩm quan tâm: ${matchedProducts.join(", ")}`);
  }
  if (Array.isArray(extracted.goals) && extracted.goals.length > 0) {
    demandParts.push(`Mục tiêu: ${extracted.goals.join(", ")}`);
  }
  const demand = demandParts.length > 0 ? demandParts.join(" • ") : EMPTY_DEMAND;

  // 3. Điểm còn băn khoăn
  const matchedConcerns = [];
  for (const c of CONCERN_PATTERNS) {
    if (c.regex.test(analysisText)) {
      matchedConcerns.push(c.label);
    }
  }
  const concerns =
    matchedConcerns.length > 0 ? matchedConcerns.join(" • ") : EMPTY_CONCERNS;

  // 4. Gợi ý kịch bản chốt (bám sát thực tế, không tự bịa sản phẩm/bệnh lý)
  let closingScript = emptyClosingScript;
  if (
    pathology !== EMPTY_PATHOLOGY ||
    demand !== EMPTY_DEMAND ||
    concerns !== EMPTY_CONCERNS
  ) {
    const contextFragments = [];
    if (matchedProducts.length > 0) {
      contextFragments.push(`thông tin về ${matchedProducts.join(", ")}`);
    }
    if (matchedDiseases.length > 0 || (extracted.symptoms && extracted.symptoms.length > 0)) {
      const healthBits = [
        ...matchedDiseases,
        ...(extracted.symptoms || []),
      ].slice(0, 3);
      contextFragments.push(`tình trạng ${healthBits.join(", ")}`);
    }

    if (matchedConcerns.some((c) => c.includes("giá"))) {
      closingScript = `Dạ ${addressWithName}, em xin gửi thông tin chi tiết ${
        contextFragments.length > 0 ? `về ${contextFragments.join(" và ")}` : "báo giá sản phẩm"
      } để ${pronoun} tham khảo ạ. Không biết mình đang muốn tìm hiểu để dùng thử hay theo liệu trình để em tư vấn gói phù hợp nhất cho ${pronoun} nhé?`;
    } else if (contextFragments.length > 0) {
      closingScript = `Dạ ${addressWithName}, với ${contextFragments.join(
        " và "
      )} mà ${pronoun} vừa chia sẻ, ${pronoun} cho em hỏi thêm tình trạng hiện tại để em tư vấn chính xác nhất cho mình nhé ạ?`;
    } else {
      closingScript = `Dạ ${addressWithName}, em đã ghi nhận câu hỏi của ${pronoun}, để em kiểm tra và phản hồi chi tiết ngay cho mình ạ.`;
    }
  }

  return {
    pathology,
    demand,
    concerns,
    closing_script: closingScript,
    extractedEntities: extracted,
    customerPronoun: pronoun,
    source: "fallback-grounded",
  };
}

/**
 * Parse JSON an toàn từ phản hồi LLM (loại bỏ markdown code block nếu có).
 */
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

/**
 * Tạo Tóm tắt AI 4 Mục (chống bịa đặt / anti-hallucination).
 * Ưu tiên gọi LLM với temperature = 0.1; nếu chưa cấu hình key hoặc lỗi -> dùng fallback grounded.
 */
export async function generateGroundedConversationSummary({
  messages = [],
  customer = {},
  useLlm = true,
  llmCaller = generateAiReply,
} = {}) {
  const recentMessages = normalizeConversationMessages(messages);
  const fallback = buildGroundedFallbackSummary({ messages: recentMessages, customer });

  // Hội thoại rỗng -> trả về ngay kết quả rỗng chuẩn hóa, không cần gọi LLM
  if (recentMessages.length === 0 || !useLlm) {
    return fallback;
  }

  const conversationText = recentMessages
    .map((m) => `${m.isMe ? "Nhân viên" : "Khách"}: ${m.text}`)
    .join("\n");

  const systemPrompt = `Bạn là Trợ lý Trích Xuất Thông Tin Hội Thoại CSKH Y Tế / Dinh Dưỡng (STRICT GROUNDED EXTRACTION).
NHIỆM VỤ: Phân tích đoạn hội thoại giữa Khách và Nhân viên dưới đây và trả về DUY NHẤT một JSON object gồm 4 trường:
- "pathology": Tóm tắt bệnh lý, triệu chứng, chỉ số sức khỏe ĐƯỢC NÊU RÕ RÀNG trong hội thoại.
- "demand": Tóm tắt nhu cầu hoặc sản phẩm cụ thể ĐƯỢC ĐỀ CẬP RÕ RÀNG trong hội thoại.
- "concerns": Tóm tắt điểm còn băn khoăn, thắc mắc (giá, cách dùng, vị ngọt, tác dụng phụ, giao hàng...) ĐƯỢC NÊU trong hội thoại.
- "closing_script": Gợi ý 1 câu phản hồi lịch sự bằng tiếng Việt dành cho nhân viên Sale gửi khách.

QUY TẮC CHỐNG BỊA ĐẶT (BẮT BUỘC TUÂN THỦ 100%):
1. CHỈ trích xuất những sự thật ĐƯỢC NÊU TRỰC TIẾP trong hội thoại. TUYỆT ĐỐI KHÔNG suy đoán, KHÔNG tự thêm bệnh (như tiểu đường, mất ngủ...), KHÔNG tự thêm tên sản phẩm (như Glucare Plus), KHÔNG tự thêm chỉ số hay băn khoăn nếu trong hội thoại KHÔNG nhắc tới.
2. Nếu hội thoại KHÔNG nhắc tới bệnh lý/triệu chứng/chỉ số nào -> "pathology" BẮT BUỘC phải là chính xác chuỗi: "${EMPTY_PATHOLOGY}"
3. Nếu hội thoại KHÔNG nhắc tới sản phẩm hay nhu cầu cụ thể nào -> "demand" BẮT BUỘC phải là chính xác chuỗi: "${EMPTY_DEMAND}"
4. Nếu hội thoại KHÔNG có băn khoăn/thắc mắc nào -> "concerns" BẮT BUỘC phải là chính xác chuỗi: "${EMPTY_CONCERNS}"
5. Với "closing_script": nếu hội thoại chỉ là lời chào hỏi xã giao và chưa có thông tin bệnh lý hay sản phẩm, CHỈ gợi ý câu chào lịch sự kèm câu hỏi mở để khai thác nhu cầu (KHÔNG nhắc tới tiểu đường hay Glucare Plus).
6. Chỉ trả về JSON thuần, không giải thích thêm.`;

  const customerName = String(customer?.fullName || customer?.name || "").trim();
  const userPrompt = `${
    customerName ? `Tên khách hàng (hiển thị trên kênh chat): ${customerName}\n` : ""
  }HỘI THOẠI CẦN PHÂN TÍCH:\n${conversationText}`;

  try {
    const aiRes = await llmCaller({
      systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      temperature: 0.1,
      maxTokens: 600,
    });

    if (!aiRes?.ok || !aiRes?.reply) {
      return fallback;
    }

    const parsed = parseSummaryJson(aiRes.reply);
    if (!parsed || typeof parsed !== "object") {
      return fallback;
    }

    const normalizeField = (val, emptyDefault) => {
      const s = String(val || "").trim();
      return s.length > 0 ? s : emptyDefault;
    };

    return {
      pathology: normalizeField(parsed.pathology, EMPTY_PATHOLOGY),
      demand: normalizeField(parsed.demand, EMPTY_DEMAND),
      concerns: normalizeField(parsed.concerns, EMPTY_CONCERNS),
      closing_script: normalizeField(parsed.closing_script, fallback.closing_script),
      extractedEntities: fallback.extractedEntities,
      customerPronoun: fallback.customerPronoun,
      source: `llm:${aiRes.provider || "unknown"}`,
    };
  } catch {
    return fallback;
  }
}
