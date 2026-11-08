/**
 * ADDP Omnichannel AI CRM — Bộ Não AI Trả Lời Tự Nhiên Như Người Thật & Giả Lập Độ Trễ Gõ Phím
 * Persona: Dược sĩ Thảo - Chuyên viên tư vấn y khoa ADDP
 * Kết hợp RAG Dược phẩm (Sữa hạt Glucare Plus, Mát Gan Dovital) + Hồ sơ Khách hàng 360 + Bóc tách SĐT.
 */

import { retrieveRelevantKnowledge, PHARMA_KNOWLEDGE_BASE } from "./knowledgeBase.js";
import { extractPhoneNumbersFromText, normalizePhone } from "../customerIdentityResolver.js";

export const DUOC_SI_THAO_SYSTEM_PROMPT = `Bạn là Dược sĩ Thảo - Chuyên viên tư vấn y khoa tại Dược phẩm ADDP.
Nguyên tắc giao tiếp bắt buộc:
1. Văn phong giống người thật đang gõ phím trò chuyện 100%: Xưng hô ấm áp, lễ phép ("Dạ em Thảo chào anh/chị...", "Dạ anh/chị ơi..."), biết lắng nghe và đồng cảm với tình trạng sức khỏe của khách hàng.
2. Tuyệt đối KHÔNG dùng văn phong liệt kê gạch đầu dòng máy móc kiểu tổng đài robot, KHÔNG dùng ký tự markdown thô như dấu sao (*), dấu thăng (#), gạch đầu dòng (-). Hãy viết thành các câu văn liền mạch, ngắt câu tự nhiên.
3. Tư vấn chuẩn xác dựa trên Kho Tri Thức Dược Phẩm ADDP (Sữa hạt Glucare Plus và Mát Gan Thanh Nhiệt Dovital). Không tự bịa đặt công dụng hoặc giá bán ngoài kho tri thức.
4. Nếu khách chưa để lại số điện thoại và đang quan tâm sâu về bệnh lý hoặc đặt hàng, khéo léo xin số điện thoại để em Thảo tiện kết bạn Zalo hoặc gọi tư vấn kỹ hơn.`;

/**
 * Làm sạch mọi ký tự markdown hoặc gạch đầu dòng nếu LLM trả về để đảm bảo văn phong chat tự nhiên 100%
 */
function sanitizeHumanChatText(rawText = "") {
  return String(rawText || "")
    .replace(/\*\*/g, "")
    .replace(/__+/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*•+]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Tính toán độ trễ giả lập người thật đang gõ phím (từ 3000ms đến 5000ms tùy độ dài câu trả lời).
 * TUYỆT ĐỐI KHÔNG áp dụng giãn cách 45-120s của Smart Broadcast vào luồng chat 1-1 trực tiếp.
 * @param {string} replyText
 * @returns {number} typingDelayMs (3000 - 5000)
 */
export function calculateTypingDelayMs(replyText = "") {
  const charCount = String(replyText || "").length;
  // Thời gian chờ typing delay chuẩn ~3s (3000 - 3500ms)
  const lengthFactor = Math.min(300, Math.floor((charCount / 300) * 300));
  const jitter = Math.floor(Math.random() * 201);
  return 3000 + lengthFactor + jitter;
}

/**
 * Bóc tách số điện thoại Việt Nam chuẩn 10 số từ tin nhắn khách gửi
 * @param {string} text
 * @returns {string|null}
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
 * Sinh câu trả lời tự nhiên chuẩn Dược sĩ Thảo dựa trên ngữ cảnh khách hàng & RAG
 */
function buildContextualPharmacistReply({
  customerMessage = "",
  customerName = "anh/chị",
  customerPhone = null,
  detectedPhoneInMsg = null,
  pathology = "",
  ragResult,
  conversationHistory = [],
}) {
  const msgLower = String(customerMessage || "").toLowerCase().trim();
  const displayName =
    customerName &&
    !["khách", "khách hàng", "khách zalo", "anh/chị"].includes(
      String(customerName).toLowerCase().trim()
    )
      ? `anh/chị ${customerName}`
      : "anh/chị";

  const hasGreetedBefore =
    Array.isArray(conversationHistory) &&
    conversationHistory.some((m) => m && m.isMe);

  const greetingPrefix = hasGreetedBefore
    ? `Dạ ${displayName} ơi,`
    : `Dạ em Thảo chào ${displayName} ạ,`;

  const glucare = PHARMA_KNOWLEDGE_BASE.glucare_plus;
  const dovital = PHARMA_KNOWLEDGE_BASE.dovital;

  const isAskingPrice =
    msgLower.includes("giá") ||
    msgLower.includes("bao nhiêu") ||
    msgLower.includes("nhiêu tiền") ||
    msgLower.includes("khuyến mãi") ||
    msgLower.includes("ưu đãi") ||
    msgLower.includes("combo") ||
    msgLower.includes("mua");

  const isAskingUsage =
    msgLower.includes("cách dùng") ||
    msgLower.includes("cách uống") ||
    msgLower.includes("cách pha") ||
    msgLower.includes("pha thế nào") ||
    msgLower.includes("liều lượng") ||
    msgLower.includes("liệu trình") ||
    msgLower.includes("mấy viên") ||
    msgLower.includes("mấy muỗng");

  const isAskingIngredients =
    msgLower.includes("thành phần") ||
    msgLower.includes("làm từ gì") ||
    msgLower.includes("chất gì") ||
    msgLower.includes("nguồn gốc");

  const isAskingReplaceMedicine =
    msgLower.includes("thay thuốc") ||
    msgLower.includes("bỏ thuốc") ||
    msgLower.includes("thuốc tây") ||
    msgLower.includes("bao lâu") ||
    msgLower.includes("hiệu quả");

  const matched = ragResult?.matchedProducts || [];
  const isDovital =
    matched.includes("dovital") ||
    (!matched.includes("glucare_plus") &&
      String(pathology || "").toLowerCase().includes("gan"));
  const isGlucare =
    matched.includes("glucare_plus") ||
    (!isDovital &&
      (matched.length === 0 &&
        String(pathology || "").toLowerCase().includes("tiểu đường")));

  // 1. Trường hợp khách vừa gửi SĐT trong tin nhắn
  if (detectedPhoneInMsg) {
    if (isDovital && !isGlucare) {
      return `${greetingPrefix} em Thảo đã nhận được số điện thoại ${detectedPhoneInMsg} của mình rồi ạ. Dòng ${dovital.name} bên em hiện đang có giá ${dovital.pricingAndPromo} Em Thảo xin phép liên hệ qua số này để hỏi kỹ hơn về chỉ số men gan hiện tại và lên liệu trình phù hợp nhất cho ${displayName} nhé ạ!`;
    }
    if (isGlucare) {
      return `${greetingPrefix} em Thảo đã lưu lại số điện thoại ${detectedPhoneInMsg} của mình rồi ạ. Với dòng ${glucare.name} chuyên biệt cho người tiểu đường (${glucare.pricingAndPromo}), em Thảo xin phép gọi hoặc nhắn Zalo qua số này để tư vấn kỹ hơn theo mức đường huyết hiện tại của ${displayName} nha!`;
    }
    return `${greetingPrefix} em Thảo đã nhận được số điện thoại ${detectedPhoneInMsg} của ${displayName} rồi ạ. Em xin phép lưu vào hồ sơ sức khỏe và liên hệ hỗ trợ mình chi tiết ngay bây giờ nhé ạ!`;
  }

  // 2. Tư vấn chuyên sâu về Mát Gan Thanh Nhiệt Dovital
  if (isDovital && !matched.includes("glucare_plus")) {
    if (isAskingPrice) {
      return `${greetingPrefix} hiện tại sản phẩm ${dovital.name} bên em có quy cách ${dovital.pricingAndPromo} Với tình trạng men gan cao, gan nhiễm mỡ hoặc hay dùng bia rượu, nóng trong mẩn ngứa thì mình dùng Combo 3 hộp sẽ vừa đủ liệu trình 2 đến 3 tháng bảo vệ nhu mô gan bền vững và tiết kiệm được 100.000đ luôn đó ạ. ${
        customerPhone
          ? `Anh/chị muốn lấy thử trước 1 hộp hay lấy luôn Combo 3 hộp để em Thảo lên đơn gửi về số ${customerPhone} cho mình ạ?`
          : `Hiện tại ${displayName} đang gặp tình trạng men gan cao hay nóng trong mẩn ngứa để em Thảo tư vấn liệu trình chuẩn nhất cho mình ạ?`
      }`;
    }

    if (isAskingUsage) {
      return `${greetingPrefix} cách dùng ${dovital.name} rất tiện lợi ạ, mình uống ngày 2 lần, mỗi lần từ 1 đến 2 viên sau bữa ăn khoảng 30 phút. Để các thảo dược như Cao Cà gai leo chuẩn hóa, Diệp hạ châu đắng, Actiso Đà Lạt và Silymarin chiết xuất Kế sữa giúp phục hồi nhu mô gan và hạ men gan AST, ALT ổn định thì em Thảo khuyến nghị mình duy trì đều đặn liệu trình từ 2 đến 3 tháng nhé ạ.`;
    }

    if (isAskingIngredients) {
      return `${greetingPrefix} viên uống ${dovital.name} được chiết xuất từ bộ thảo dược bảo vệ nhu mô gan rất lành tính gồm Cao Cà gai leo chuẩn hóa, Diệp hạ châu đắng, Actiso Đà Lạt kết hợp cùng hoạt chất Silymarin từ Kế sữa, L-Arginine HCl và các Vitamin nhóm B ạ. Nhờ công thức này nên sản phẩm hỗ trợ hạ men gan, giảm gan nhiễm mỡ và làm dịu nhanh tình trạng nóng trong, mẩn ngứa mề đay hay mệt mỏi sau khi dùng bia rượu đó ạ.`;
    }

    return `${greetingPrefix} với tình trạng cần giải độc gan, hạ men gan hay hay bị nóng trong mẩn ngứa, bên em có dòng ${dovital.name} rất phù hợp cho mình ạ. Sản phẩm kết hợp Cao Cà gai leo chuẩn hóa, Diệp hạ châu đắng, Actiso Đà Lạt và Silymarin chiết xuất Kế sữa giúp bảo vệ nhu mô gan và hạ chỉ số AST, ALT an toàn. Mình chỉ cần uống ngày 2 lần, mỗi lần 1-2 viên sau ăn 30 phút thôi ạ, hộp 60 viên giá 250.000đ hoặc Combo 3 hộp giá ưu đãi 650.000đ cho liệu trình 2-3 tháng. Không biết hiện tại ${displayName} có đang gặp triệu chứng mẩn ngứa hay mới xét nghiệm thấy men gan tăng không ạ?`;
  }

  // 3. Tư vấn chuyên sâu về Sữa hạt Glucare Plus
  if (isGlucare || matched.includes("glucare_plus")) {
    if (isAskingPrice) {
      return `${greetingPrefix} dòng ${glucare.name} (sử dụng đường Hạt Isomalt chỉ số đường huyết thấp GI ~32) chuyên biệt cho người tiểu đường và tiền tiểu đường bên em hiện có giá 450.000đ/lon 900g ạ. Khi lấy Combo 3 lon mình sẽ được tặng ngay bình lắc giữ nhiệt kèm miễn phí giao hàng tận nhà để duy trì bình ổn đường huyết lúc đói hiệu quả nhất. ${
        customerPhone
          ? `${displayName} muốn em Thảo lên đơn 1 lon dùng thử hay lấy Combo 3 lon để em gửi về số ${customerPhone} cho mình ạ?`
          : `Không biết hiện tại chỉ số đường huyết lúc đói của ${displayName} đang khoảng bao nhiêu mmol/L để em Thảo hướng dẫn liều uống phù hợp nhất ạ?`
      }`;
    }

    if (isAskingUsage) {
      return `${greetingPrefix} khi pha ${glucare.name} (đường Hạt Isomalt GI ~32, giá 450.000đ/lon 900g), mình lấy 4 muỗng gạt ngang pha cùng 180ml nước ấm khoảng 45 đến 50°C rồi khuấy đều là dùng được ngay ạ. Mình lưu ý giúp em Thảo là tuyệt đối không pha bằng nước sôi 100°C để giữ trọn vẹn 28 Vitamin, khoáng chất và chất xơ hòa tan FOS/Inulin nhé. Mỗi ngày ${displayName} duy trì uống 1 đến 2 ly vào bữa phụ hoặc sau bữa ăn chính 2 giờ sẽ giúp no lâu, đỡ thèm ngọt mà không lo tăng đường huyết ạ.`;
    }

    if (isAskingIngredients) {
      return `${greetingPrefix} ${glucare.name} sử dụng hệ đường Hạt Isomalt năng lượng thấp có chỉ số đường huyết GI rất thấp chỉ khoảng 32, kết hợp cùng Đạm thực vật tinh khiết từ Hạnh nhân, Óc chó, Đậu nành phân lập, chất béo tốt MUFA & PUFA, chất xơ hòa tan FOS/Inulin và 28 Vitamin khoáng chất ạ (lon 900g giá 450.000đ/lon, Combo 3 lon tặng bình lắc giữ nhiệt và miễn phí giao hàng). Nhờ vậy khi uống vào cơ thể hấp thu chậm, giúp người tiểu đường Tuýp 1, Tuýp 2 hay người có đường huyết lúc đói trên 7.0 mmol/L bổ sung đủ chất, hết mệt mỏi mà đường huyết vẫn êm ru ạ.`;
    }

    if (isAskingReplaceMedicine) {
      return `${greetingPrefix} em Thảo xin chia sẻ thật kỹ để mình yên tâm là ${glucare.name} (đường Hạt Isomalt GI ~32, giá 450.000đ/lon 900g) là dòng dinh dưỡng chuyên biệt hỗ trợ kiểm soát đường huyết chứ không thay thế thuốc tây điều trị của bác sĩ ạ. Tuy nhiên khi ${displayName} duy trì uống đều đặn 1 đến 2 ly mỗi ngày trong khoảng 10 đến 14 ngày kết hợp chế độ ăn giảm tinh bột trắng thì đường huyết lúc đói sẽ bình ổn rõ rệt, cơ thể khỏe khoắn và giảm hẳn cảm giác mệt mỏi, đói run tay chân đó ạ.`;
    }

    return `${greetingPrefix} bên em có dòng ${glucare.name} là dinh dưỡng chuyên biệt dành riêng cho người tiểu đường Tuýp 1, Tuýp 2 và tiền đái tháo đường có đường huyết lúc đói trên 7.0 mmol/L ạ. Sữa dùng đường Hạt Isomalt chỉ số GI thấp (~32) cùng đạm thực vật Hạnh nhân, Óc chó, chất xơ FOS/Inulin và 28 Vitamin khoáng chất nên uống rất thơm ngon mà không làm tăng đường huyết sau ăn. Mình duy trì ngày 1-2 ly (pha 4 muỗng gạt ngang với 180ml nước ấm 45-50°C) tầm 10-14 ngày kết hợp giảm tinh bột trắng là đường huyết đói êm hơn và đỡ mệt mỏi hẳn ạ. Hiện lon 900g có giá 450.000đ/lon, mua Combo 3 lon được tặng kèm bình lắc giữ nhiệt và miễn phí giao hàng. Không biết hiện tại đường huyết của ${displayName} đang ở mức bao nhiêu để em Thảo tư vấn kỹ hơn cho mình ạ?`;
  }

  // 4. Nếu khách hỏi cả 2 sản phẩm hoặc câu hỏi mở đầu chung
  return `${greetingPrefix} em là Dược sĩ Thảo phụ trách tư vấn sức khỏe tại Dược phẩm ADDP ạ. Hiện bên em đang đồng hành chăm sóc chuyên sâu 2 dòng sản phẩm chủ lực là ${glucare.name} dành cho người tiểu đường, tiền tiểu đường (450.000đ/lon 900g, Combo 3 lon tặng bình lắc giữ nhiệt và miễn phí ship) và viên thảo dược ${dovital.name} giúp hạ men gan, giải độc gan, giảm mẩn ngứa (250.000đ/hộp 60 viên, Combo 3 hộp 650.000đ). Không biết hiện tại ${displayName} đang quan tâm cải thiện vấn đề đường huyết hay chức năng gan để em Thảo tư vấn chi tiết cho mình ạ?`;
}

/**
 * Gọi LLM nếu hệ thống có cấu hình OPENAI_API_KEY, nếu không hoặc lỗi mạng thì dùng bộ máy RAG Dược sĩ Thảo nội bộ
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
        temperature: 0.5,
        max_tokens: 350,
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
 * Hàm chính sinh câu trả lời tự nhiên chuẩn Dược sĩ Thảo + độ trễ gõ phím + bóc tách SĐT
 * @param {object} params
 * @param {string} params.customerMessage
 * @param {object} [params.customerProfile]
 * @param {Array} [params.conversationHistory]
 * @returns {Promise<{
 *   replyText: string,
 *   typingDelayMs: number,
 *   detectedPhone: string | null,
 *   matchedProducts: string[],
 *   ragContext: string,
 *   persona: string
 * }>}
 */
export async function generateHumanLikeReply({
  customerMessage = "",
  customerProfile = {},
  conversationHistory = [],
} = {}) {
  const cleanMessage = String(customerMessage || "").trim();
  const detectedPhone = extractCustomerPhoneFromMessage(cleanMessage);
  const ragResult = retrieveRelevantKnowledge(cleanMessage);

  const customerName =
    customerProfile?.fullName ||
    customerProfile?.name ||
    customerProfile?.customerName ||
    "anh/chị";
  const customerPhone =
    detectedPhone ||
    customerProfile?.phone ||
    customerProfile?.customerPhone ||
    null;
  const pathology =
    customerProfile?.pathology ||
    (Array.isArray(customerProfile?.tags) ? customerProfile.tags.join(", ") : "") ||
    "";

  const fullSystemPrompt = [
    DUOC_SI_THAO_SYSTEM_PROMPT,
    "",
    "--- NGỮ CẢNH HỒ SƠ KHÁCH HÀNG ---",
    `- Tên khách hàng: ${customerName}`,
    `- Số điện thoại đã nhận diện: ${customerPhone || "Chưa có"}`,
    `- Lịch sử bệnh lý / Ghi chú: ${pathology || "Chưa ghi nhận"}`,
    "",
    "--- KHO TRI THỨC DƯỢC PHẨM RAG ---",
    ragResult.contextPrompt,
  ].join("\n");

  let replyText = await callExternalLlmIfAvailable({
    systemPrompt: fullSystemPrompt,
    userPrompt: cleanMessage || "Chào shop, tư vấn giúp mình với",
    conversationHistory,
  });

  if (!replyText) {
    replyText = buildContextualPharmacistReply({
      customerMessage: cleanMessage,
      customerName,
      customerPhone,
      detectedPhoneInMsg: detectedPhone,
      pathology,
      ragResult,
      conversationHistory,
    });
  }

  replyText = sanitizeHumanChatText(replyText);
  const typingDelayMs = calculateTypingDelayMs(replyText);

  return {
    replyText,
    typingDelayMs,
    detectedPhone,
    matchedProducts: ragResult.matchedProducts,
    ragContext: ragResult.contextPrompt,
    persona: "Dược sĩ Thảo - Chuyên viên tư vấn y khoa ADDP",
  };
}
