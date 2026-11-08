/**
 * ADDP Omnichannel AI CRM — Kho Tri Thức Dược Phẩm Chuẩn Hóa (Pharmaceutical RAG Knowledge Base)
 * Chứa dữ liệu sản phẩm chuẩn y khoa của Sữa hạt Glucare Plus và Mát Gan Thanh Nhiệt Dovital
 * phục vụ bộ máy AI Bot Chat tư vấn tự động.
 */

export const PHARMA_KNOWLEDGE_BASE = {
  glucare_plus: {
    id: "glucare_plus",
    name: "Sữa hạt Glucare Plus",
    category: "Dinh dưỡng chuyên biệt cho người đái tháo đường & tiền đái tháo đường.",
    ingredients:
      "Hạt Isomalt năng lượng thấp (GI thấp ~32), Đạm thực vật tinh khiết (Hạnh nhân, Óc chó, Đậu nành phân lập), MUFA & PUFA, Chất xơ hòa tan FOS/Inulin, 28 Vitamin & Khoáng chất.",
    targetAudience:
      "Người tiểu đường Tuýp 1, Tuýp 2, người rối loạn dung nạp glucose (đường huyết lúc đói > 7.0 mmol/L), người ăn kiêng kiểm soát cân nặng.",
    usageAndDosage:
      "4 muỗng gạt ngang pha với 180ml nước ấm 45-50°C, ngày 1-2 ly thay thế bữa phụ hoặc sau bữa chính 2 giờ. Tuyệt đối không pha nước sôi 100°C.",
    coreFaq:
      "Sữa không thay thế thuốc tây điều trị; duy trì 10-14 ngày kết hợp ăn uống giảm tinh bột trắng để bình ổn đường huyết đói và giảm mệt mỏi.",
    pricingAndPromo:
      "Lon 900g giá 450.000đ/lon; Combo 3 lon tặng kèm bình lắc giữ nhiệt và miễn phí giao hàng.",
    keywords: [
      "tiểu đường",
      "đái tháo đường",
      "đường huyết",
      "hạ đường",
      "tăng đường",
      "mmol",
      "hba1c",
      "insulin",
      "sữa",
      "sữa hạt",
      "glucare",
      "isomalt",
      "tê bì",
      "tiểu đêm",
      "mệt mỏi",
      "ăn kiêng",
      "tuýp 1",
      "tuýp 2",
      "type 1",
      "type 2",
    ],
  },
  dovital: {
    id: "dovital",
    name: "Mát Gan Thanh Nhiệt Dovital",
    category: "Thảo dược bảo vệ nhu mô gan, hạ men gan.",
    ingredients:
      "Cao Cà gai leo chuẩn hóa, Diệp hạ châu đắng, Actiso Đà Lạt, Silymarin chiết xuất Kế sữa, L-Arginine HCl, Vitamin nhóm B.",
    targetAudience:
      "Người men gan cao (AST, ALT tăng), gan nhiễm mỡ, người thường xuyên uống bia rượu, người nóng trong mẩn ngứa mề đay.",
    usageAndDosage:
      "Ngày 2 lần, mỗi lần 1-2 viên sau bữa ăn 30 phút. Khuyến nghị liệu trình 2-3 tháng.",
    coreFaq:
      "Hỗ trợ giải độc gan, hạ men gan AST/ALT an toàn từ thảo dược chuẩn hóa, giảm nhanh tình trạng nóng trong, mẩn ngứa, mệt mỏi do suy giảm chức năng gan hoặc dùng bia rượu.",
    pricingAndPromo: "Hộp 60 viên giá 250.000đ/hộp; Combo 3 hộp giá 650.000đ.",
    keywords: [
      "gan",
      "men gan",
      "hạ men gan",
      "mát gan",
      "giải độc gan",
      "gan nhiễm mỡ",
      "viêm gan",
      "xơ gan",
      "ast",
      "alt",
      "ggt",
      "bia rượu",
      "rượu bia",
      "nhậu",
      "dovital",
      "ngứa",
      "mẩn ngứa",
      "mề đay",
      "nóng trong",
      "mụn nhọt",
      "vàng da",
      "cà gai leo",
      "silymarin",
      "actiso",
    ],
  },
};

/**
 * Format 1 khối kiến thức sản phẩm thành đoạn Context Prompt chuẩn cho AI
 */
function formatProductKnowledgeBlock(item) {
  return [
    `[SẢN PHẨM: ${item.name}]`,
    `- Phân loại: ${item.category}`,
    `- Thành phần: ${item.ingredients}`,
    `- Đối tượng sử dụng: ${item.targetAudience}`,
    `- Cách dùng & Liều lượng: ${item.usageAndDosage}`,
    `- Lưu ý & Câu hỏi thường gặp (FAQ): ${item.coreFaq}`,
    `- Giá bán & Ưu đãi: ${item.pricingAndPromo}`,
  ].join("\n");
}

/**
 * Phân tích từ khóa bệnh học trong tin nhắn khách hàng để trích xuất đúng khối kiến thức liên quan làm Context Prompt.
 * @param {string} customerText
 * @returns {{ matchedProducts: string[], contextPrompt: string, items: Array<object> }}
 */
export function retrieveRelevantKnowledge(customerText = "") {
  const normalized = String(customerText || "").toLowerCase().trim();

  const matchedKeys = [];

  if (normalized) {
    for (const [key, product] of Object.entries(PHARMA_KNOWLEDGE_BASE)) {
      const hasMatch = product.keywords.some((kw) => normalized.includes(kw));
      if (hasMatch) {
        matchedKeys.push(key);
      }
    }
  }

  // Nếu câu hỏi chung (ví dụ hỏi giá, tư vấn, sản phẩm, công ty...) hoặc chưa rõ sản phẩm, nạp cả 2 sản phẩm chủ lực để AI nắm toàn diện
  const selectedKeys =
    matchedKeys.length > 0 ? matchedKeys : Object.keys(PHARMA_KNOWLEDGE_BASE);

  const items = selectedKeys.map((k) => PHARMA_KNOWLEDGE_BASE[k]);
  const contextPrompt = items.map(formatProductKnowledgeBlock).join("\n\n");

  return {
    matchedProducts: matchedKeys,
    items,
    contextPrompt,
  };
}
