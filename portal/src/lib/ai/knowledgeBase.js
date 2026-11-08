/**
 * ADDP Omnichannel AI CRM — Kho Tri Thức Dược Phẩm & Kịch Bản Dinh Dưỡng Tiểu Đường Chuẩn Hóa
 * Tích hợp đầy đủ dữ liệu sản phẩm (Sữa hạt Glucare Plus, Viên An Đường, Mát Gan Thanh Nhiệt Dovital)
 * và Quy Trình Gọi Điện & Tư Vấn Chăm Sóc Khách Hàng Tiểu Đường ADDP.
 */

export const PHARMA_KNOWLEDGE_BASE = {
  glucare_plus: {
    id: "glucare_plus",
    name: "Sữa hạt Glucare Plus",
    category: "Dinh dưỡng chuyên biệt cho người đái tháo đường, tiền đái tháo đường, người sụt cân, suy nhược, teo cơ.",
    tasteProfile:
      "Vị các loại hạt tự nhiên thơm bùi (Hạnh nhân, Óc chó, Macca, Đậu Hà Lan), vị ngọt thanh dịu từ đường ăn kiêng Isomalt rất dễ uống, nhẹ bụng, không ngấy.",
    ingredients:
      "Đường ăn kiêng Hạt Isomalt năng lượng thấp (GI thấp ~32), Đạm thực vật tinh khiết (Đậu Hà Lan, Hạnh nhân, Óc chó, Macca, Sachi, Đậu nành phân lập), Cao Đông Trùng Hạ Thảo, tinh chất Quả Nhàu, MUFA & PUFA, Omega 6-9, Chất xơ hòa tan FOS/Inulin, Canxi và 28 Vitamin & Khoáng chất (nhóm B, D3).",
    targetAudience:
      "Người tiểu đường Tuýp 1, Tuýp 2, tiền tiểu đường (đường huyết lúc đói > 7.0 mmol/L), người tiểu đường lâu năm hấp thu kém bị sụt cân, teo cơ, mệt mỏi hụt hơi, mất ngủ, tê bì chân tay hoặc hay đói lả xế chiều.",
    usageAndDosage:
      "Pha 4 muỗng gạt ngang (hoặc 1 gói 30g tiện lợi) với 180ml nước ấm 45-50°C, ngày uống 1-2 ly vào bữa phụ hoặc sau bữa ăn chính 2 giờ. Tuyệt đối không pha với nước sôi 100°C.",
    coreFaq:
      "Sữa không thay thế thuốc tây điều trị của bệnh viện mà là giải pháp bồi bổ bữa phụ để tránh tụt đường huyết, chống teo cơ sụt cân. Kết hợp chế độ ăn đảo ngược: ăn rau xanh trước -> đạm (thịt nạc, đậu, cá) sau -> tinh bột cuối cùng, tối ngâm chân nước ấm gừng muối và đi bộ nhẹ 15-20 phút sau ăn.",
    pricingAndPromo:
      "Lon 900g giá 450.000đ/lon; Combo 3 lon chỉ 1.250.000đ tặng kèm bình lắc giữ nhiệt và miễn phí giao hàng tận nhà (Dạng hộp gói tiện lợi: Combo 3 hộp 699.000đ dùng 1 tháng, Combo 6 hộp 1.190.000đ miễn phí vận chuyển).",
    keywords: [
      "tiểu đường",
      "đái tháo đường",
      "đường huyết",
      "hạ đường",
      "tăng đường",
      "ổn đường",
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
      "tăng cân",
      "sụt cân",
      "tụt cân",
      "teo cơ",
      "vị gì",
      "ngon không",
      "ngon k",
      "dễ uống",
      "đông trùng",
      "quả nhàu",
      "tuýp 1",
      "tuýp 2",
      "type 1",
      "type 2",
    ],
  },
  vien_an_duong: {
    id: "vien_an_duong",
    name: "Viên An Đường ADDP",
    category: "Viên nén thảo mộc hỗ trợ ổn định và hạ chỉ số đường huyết an toàn, giảm tải gan thận.",
    ingredients:
      "Chiết xuất Dây thìa canh, Mướp đắng, Cao lá xoài, Sinh địa, Cao quế, bổ sung Taurine, L-Carnitine và Vitamin nhóm B.",
    targetAudience:
      "Người có chỉ số đường huyết cao hoặc dao động thất thường, muốn hỗ trợ ổn định đường huyết bền vững, giảm gánh nặng cho gan thận khi dùng thuốc tây lâu năm.",
    usageAndDosage:
      "Kết hợp song song cùng Sữa hạt Glucare Plus: Viên An Đường hỗ trợ ổn định chỉ số đường huyết, Sữa hạt Glucare Plus bổ sung dinh dưỡng bữa phụ chống tụt đường và phục hồi thể trạng.",
    coreFaq:
      "Thảo mộc lành tính hỗ trợ ổn định đường huyết tự nhiên, kết hợp cùng thuốc điều trị theo chỉ định và chế độ ăn đảo ngược để đạt hiệu quả tối ưu.",
    pricingAndPromo:
      "Thường kết hợp trong bộ đôi chuyên sâu cùng Sữa hạt Glucare Plus theo tình trạng chỉ số đường huyết của khách hàng.",
    keywords: [
      "viên an đường",
      "dây thìa canh",
      "mướp đắng",
      "lá xoài",
      "sinh địa",
      "cao quế",
      "hạ đường huyết",
      "dao động",
      "thảo dược tiểu đường",
    ],
  },
  dovital: {
    id: "dovital",
    name: "Mát Gan Thanh Nhiệt Dovital",
    category: "Thảo dược bảo vệ nhu mô gan, hạ men gan.",
    ingredients:
      "Cao Cà gai leo chuẩn hóa, Diệp hạ châu đắng, Actiso Đà Lạt, Silymarin chiết xuất Kế sữa, L-Arginine HCl, Vitamin nhóm B.",
    targetAudience:
      "Người men gan cao (AST, ALT tăng), gan nhiễm mỡ, người thường xuyên uống bia rượu, người nóng trong mẩn ngứa mề đay hoặc uống thuốc tây lâu ngày gây nóng gan.",
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
 * Kịch bản tư vấn & chăm sóc khách hàng tiểu đường chuẩn từ tài liệu
 * "QUY TRÌNH GỌI ĐIỆN CHĂM SÓC KHÁCH HÀNG TIỂU ĐƯỜNG.docx"
 */
export const DIABETES_CARE_PROTOCOL = {
  roleIdentity:
    "Chuyên viên tư vấn dinh dưỡng của Công ty Dược phẩm ADDP (bên chăm sóc sức khỏe ADDP). Tuyệt đối không xưng là bác sĩ, dược sĩ hay chuyên gia.",
  communicationRules: [
    "Giới hạn độ dài: Tối đa 2 đến 3 câu ngắn (dưới 45 từ mỗi tin nhắn). Không xả đoạn văn dài như bài báo y khoa.",
    "Luôn kết thúc bằng 1 câu hỏi thăm dò mở nhẹ nhàng để khách hàng thoải mái chia sẻ tiếp.",
    "Chỉ chào hỏi khách 1 lần duy nhất trong ngày. Nếu trong lịch sử hội thoại hôm nay đã chào rồi thì bỏ hoàn toàn câu chào ở đầu tin nhắn, đi thẳng vào câu trả lời.",
    "Xưng hô chuẩn giới tính theo tên khách (chị Quyên, anh Tuấn...); tuyệt đối không gọi gộp 'anh/chị Lê Quyên'.",
    "Thái độ ân cần, đồng hành, hiểu chuyện, không phán xét, không ép mua hàng.",
  ],
  situationalScripts: {
    askTaste: {
      trigger: "Khách hỏi vị sữa ('Sữa vị gì đấy ngon k?', 'có dễ uống không', 'ngọt không')",
      responseTemplate:
        "Dạ dòng sữa hạt bên em có vị hạt tự nhiên thơm bùi, vị ngọt thanh thanh từ đường ăn kiêng Isomalt rất dễ uống {pronoun} nhé. Hiện tại {pronoun} thích uống ngọt nhẹ hay không ngọt hẳn ạ?",
    },
    askPrice: {
      trigger: "Khách hỏi giá ('Sữa Glucare Plus giá bao nhiêu em?', 'bao nhiêu tiền 1 hộp')",
      responseTemplate:
        "Dạ sữa lon 900g giá 450.000đ {pronoun} ạ. Bên em đang có combo 3 lon chỉ 1.250.000đ tặng kèm bình lắc giữ nhiệt và miễn ship tận nhà. Hiện tại chỉ số đường huyết của {pronoun} đang khoảng mấy chấm rồi để em hướng dẫn liều uống phù hợp nhất cho {pronoun} ạ?",
    },
    wantWeightGain: {
      trigger: "Khách muốn tăng cân / bị sụt cân ('T muốn tăng cân', 'gầy quá', 'sụt cân', 'tụt cân')",
      responseTemplate:
        "Dạ người tiểu đường thường hấp thu kém nên dễ bị tụt cân, teo cơ và mệt mỏi đó {pronoun}. Hiện tại {pronoun} muốn cải thiện tăng khoảng mấy cân và tối ngủ có hay bị tê bì chân tay không {pronoun}?",
    },
    complainRepetitive: {
      trigger: "Khách thắc mắc trả lời lặp / giống nhau ('Sao tl giống nhau thế', 'sao nói lặp lại vậy', 'bot à')",
      responseTemplate:
        "Dạ {pronoun} thông cảm cho em nhé, em đang đối chiếu lại chỉ số sức khỏe của {pronoun} để tư vấn cho chuẩn xác ạ. {CapitalizedPronounAndName} cho em hỏi thăm thêm là hiện tại đường huyết lúc đói của mình khoảng mấy chấm rồi ạ?",
    },
    askLifestyleTips: {
      trigger: "Khách hỏi chế độ ăn uống / thực đơn / mẹo hạ đường tại nhà",
      responseTemplate:
        "Dạ {pronoun} áp dụng chế độ ăn đảo ngược: ăn rau xanh trước, thức ăn đạm sau rồi mới ăn lưng bát cơm cuối cùng để đường không tăng vọt sau ăn nhé. Bình thường tầm 3-4h chiều {pronoun} có hay bị đói lả hay run tay chân không ạ?",
    },
    objectionUsingHospitalMeds: {
      trigger: "Khách bảo đang uống thuốc bệnh viện / sợ trùng thuốc tây",
      responseTemplate:
        "Dạ thuốc bác sĩ kê mình vẫn duy trì đều đặn, còn sữa hạt bên em là dinh dưỡng bữa phụ giúp bù đạm thực vật để {pronoun} không bị sụt cân hay mệt mỏi do tác dụng phụ của thuốc ạ. Đợt này uống thuốc tây {pronoun} có hay thấy nóng trong hay cồn cào ruột không ạ?",
    },
    objectionPriceHigh: {
      trigger: "Khách chê đắt / cân nhắc chi phí",
      responseTemplate:
        "Dạ em rất hiểu ạ, tính ra mỗi ngày 1-2 ly sữa chỉ tương đương bữa sáng nhẹ nhưng bù đủ đạm hạt và Đông trùng hạ thảo giúp {pronoun} giữ sức khỏe, đỡ tốn kém viện phí về sau. Không biết mức chi phí tầm bao nhiêu một tháng là vừa vặn với mình nhất ạ?",
    },
    objectionAskFamily: {
      trigger: "Khách bảo hỏi ý kiến con cái / người nhà",
      responseTemplate:
        "Dạ vấn đề sức khỏe mình bàn bạc cùng gia đình là rất chuẩn luôn {pronoun} ạ, bên em có đủ giấy công bố của Bộ Y tế để {pronoun} gửi người nhà xem. Không biết gia đình mình đang băn khoăn nhất ở điểm nào để em gửi thông tin chi tiết qua cho {pronoun} nhé?",
    },
  },
};

/**
 * Format 1 khối kiến thức sản phẩm thành đoạn Context Prompt chuẩn cho AI
 */
function formatProductKnowledgeBlock(item) {
  return [
    `[SẢN PHẨM: ${item.name}]`,
    `- Phân loại: ${item.category}`,
    item.tasteProfile ? `- Hương vị: ${item.tasteProfile}` : null,
    `- Thành phần: ${item.ingredients}`,
    `- Đối tượng sử dụng: ${item.targetAudience}`,
    `- Cách dùng & Liều lượng: ${item.usageAndDosage}`,
    `- Lưu ý & Phối hợp dinh dưỡng: ${item.coreFaq}`,
    `- Giá bán & Ưu đãi: ${item.pricingAndPromo}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Phân tích từ khóa bệnh học trong tin nhắn khách hàng để trích xuất đúng khối kiến thức liên quan làm Context Prompt.
 * @param {string} customerText
 * @returns {{ matchedProducts: string[], contextPrompt: string, items: Array<object>, protocol: object }}
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

  const selectedKeys =
    matchedKeys.length > 0 ? matchedKeys : ["glucare_plus", "dovital"];

  const items = selectedKeys.map((k) => PHARMA_KNOWLEDGE_BASE[k]).filter(Boolean);
  const productBlocks = items.map(formatProductKnowledgeBlock).join("\n\n");

  const protocolBlock = [
    "[QUY TRÌNH TƯ VẤN DINH DƯỠNG TIỂU ĐƯỜNG ADDP]",
    `- Định vị vai trò: ${DIABETES_CARE_PROTOCOL.roleIdentity}`,
    ...DIABETES_CARE_PROTOCOL.communicationRules.map((r) => `- ${r}`),
  ].join("\n");

  return {
    matchedProducts: matchedKeys,
    items,
    protocol: DIABETES_CARE_PROTOCOL,
    contextPrompt: `${productBlocks}\n\n${protocolBlock}`,
  };
}
