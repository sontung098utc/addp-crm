/**
 * ADDP Omnichannel AI CRM — Kho Tri Thức AI (Second Brain Wiki) (WBS-31)
 * Tài liệu tri thức chuẩn hóa cho Trợ lý AI và Dược sĩ / Sale CSKH tư vấn khách hàng.
 * Kế thừa cấu trúc Second Brain từ Javis OS (docs/13-second-brain-bo-nho-wiki.md)
 */

export const SECOND_BRAIN_WIKI = [
  {
    id: "kb_prod_glucare_plus",
    category: "PRODUCT",
    title: "Sữa Hạt Tiểu Đường Glucare Plus",
    sku: "GLUCARE-PLUS-800G",
    retailPrice: 590000,
    unit: "Hộp 800g",
    usageDays: 15,
    summary:
      "Sữa hạt dinh dưỡng chuyên biệt cho người tiểu đường tuýp 1, tuýp 2 và tiền tiểu đường. 100% đạm thực vật cao cấp, chỉ số đường huyết thấp (GI < 35).",
    ingredients:
      "Chiết xuất Dây thìa canh, ALA (Alpha Lipoic Acid), Hạt Macca, Hạt Sachi, Óc chó, Đậu đỏ, Hạnh nhân, Đường Isomalt tự nhiên, Canxi Nano, 24 vitamin & khoáng chất.",
    benefits: [
      "Hỗ trợ hạ và ổn định đường huyết bền vững, giảm phụ thuộc thuốc hạ đường huyết.",
      "Giảm nhanh triệu chứng tê bì chân tay, mờ mắt, tiểu đêm nhiều lần sau 7 - 14 ngày.",
      "Bổ sung dinh dưỡng toàn diện, chống suy nhược cơ thể do ăn kiêng khem quá mức.",
      "Tốt cho tim mạch và huyết áp nhờ Omega 3-6-9 từ hạt sachi và macca.",
    ],
    usageInstruction:
      "Pha 2 muỗng gạt ngang (khoảng 25g) với 150ml - 180ml nước ấm 50°C. Khuấy đều cho tan hoàn toàn. Uống 1 - 2 ly mỗi ngày: ly sáng thay bữa phụ hoặc ăn sáng, ly chiều cách bữa tối 1 tiếng.",
    contraindications:
      "Không dùng cho người mẫn cảm với bất kỳ loại hạt nào có trong thành phần. Người suy thận giai đoạn cuối cần tham vấn ý kiến bác sĩ chuyên khoa.",
    combos: [
      { name: "Liệu trình 1 tháng (2 hộp)", price: 1100000, discount: "Tiết kiệm 80.000đ" },
      { name: "Combo 3 tặng 1 (4 hộp - 2 tháng)", price: 1770000, discount: "Tặng 1 hộp trị giá 590.000đ" },
      { name: "Liệu trình Chuyên Sâu 3 tháng (5 tặng 2)", price: 2950000, discount: "Tặng 2 hộp + 1 hộp Trà Mát Gan" },
    ],
  },
  {
    id: "kb_prod_tra_mat_gan",
    category: "PRODUCT",
    title: "Trà Thảo Mộc Mát Gan Hạ Men Gan ADDP",
    sku: "TRA-MAT-GAN-ADDP",
    retailPrice: 250000,
    unit: "Hộp 30 túi lọc",
    usageDays: 30,
    summary:
      "Trà thảo mộc tự nhiên hỗ trợ thanh nhiệt, giải độc gan, hạ men gan và giảm mỡ máu cho người tiểu đường kèm bệnh nền gan nhiễm mỡ.",
    ingredients: "Cà gai leo, Diệp hạ châu, Actiso, Kim ngân hoa, Cúc hoa, Cam thảo bắc.",
    benefits: [
      "Hỗ trợ phục hồi tế bào gan bị tổn thương do dùng thuốc Tây tiểu đường lâu năm.",
      "Giảm mẩn ngứa, nổi mề đay, vàng da, nóng trong người và hỗ trợ tiêu hóa tốt.",
      "Giúp ngủ ngon giấc, giảm cảm giác đắng miệng và mệt mỏi buổi sáng.",
    ],
    usageInstruction:
      "Hãm 1 - 2 túi lọc với 300ml - 500ml nước sôi 90°C trong 5 - 10 phút. Uống thay nước lọc hàng ngày, ngon hơn khi uống ấm.",
    contraindications: "Phụ nữ mang thai trong 3 tháng đầu không nên dùng liều đậm đặc.",
  },
  {
    id: "kb_prod_vien_an_duong",
    category: "PRODUCT",
    title: "Viên Uống Hỗ Trợ Tiểu Đường An Đường ADDP",
    sku: "AN-DUONG-60V",
    retailPrice: 420000,
    unit: "Hộp 60 viên nang",
    usageDays: 30,
    summary:
      "Viên uống chiết xuất thảo dược đậm đặc hỗ trợ kích thích tuyến tụy sản sinh insulin tự nhiên và ngăn ngừa biến chứng tiểu đường.",
    ingredients: "Cao Dây thìa canh chuẩn hóa 25%, Giảo cổ lam, Cao Mướp đắng rừng, Cao Nấm linh chi.",
    benefits: [
      "Kích thích tái tạo tế bào beta đảo tụy tự nhiên.",
      "Hỗ trợ giảm chỉ số HbA1c về mức an toàn (< 6.5%).",
      "Bảo vệ thành mạch máu, ngăn ngừa biến chứng hoại tử bàn chân và suy thận.",
    ],
    usageInstruction: "Ngày uống 2 lần, mỗi lần 1 - 2 viên trước bữa ăn 30 phút.",
    contraindications: "Hạ đường huyết quá mức (đường huyết đói < 4.0 mmol/L).",
  },
  {
    id: "kb_objection_price",
    category: "OBJECTION",
    title: "Xử lý từ chối: Khách chê giá đắt",
    keywords: ["đắt quá", "giá cao", "không có tiền", "sao đắt thế", "đắt"],
    strategy:
      "Đồng cảm, sau đó phân tích giá trị sức khỏe và chia nhỏ chi phí theo ngày để khách thấy hợp lý.",
    script:
      "Dạ em rất hiểu tâm lý của anh/chị khi cân nhắc chi phí điều trị ạ. Tuy nhiên, Glucare Plus là dòng sữa hạt 100% nguyên chất nhập khẩu, không độn bột ngũ cốc giá rẻ. Một hộp 800g mình dùng được nửa tháng, tính ra mỗi ly dinh dưỡng chỉ khoảng 25.000đ — vừa bằng một cốc trà hay bát phở thôi ạ, mà lại giúp mình vừa đủ chất vừa hạ đường huyết an toàn, đỡ tốn kém hàng triệu đồng tiền đi viện cấp cứu do biến chứng sau này ạ!",
  },
  {
    id: "kb_objection_western_med",
    category: "OBJECTION",
    title: "Xử lý từ chối: Đang uống thuốc Tây rồi, không cần uống sữa",
    keywords: ["uống thuốc tây", "bác sĩ kê thuốc", "đang uống thuốc", "thuốc bệnh viện"],
    strategy:
      "Làm rõ vai trò dinh dưỡng và phục hồi: Thuốc Tây chỉ ép đường hạ tạm thời, còn sữa hạt giúp nuôi dưỡng cơ thể và ngăn tụt đường huyết ban đêm.",
    script:
      "Dạ thuốc Tây của bác sĩ là rất quan trọng để khống chế chỉ số khẩn cấp, mình vẫn duy trì đúng đơn ạ. Nhưng thuốc Tây uống lâu ngày rất hại gan, thận và làm cơ thể bị kiệt sức do ăn kiêng. Sữa hạt Glucare Plus không phải thuốc mà là giải pháp DINH DƯỠNG PHỤC HỒI: giúp bù đắp năng lượng, chống suy nhược và hạ đường tự nhiên. Bác chỉ cần uống cách giờ uống thuốc Tây khoảng 1 - 2 tiếng là hoàn toàn an tâm và cơ thể khỏe khoắn hơn rất nhiều ạ!",
  },
  {
    id: "kb_objection_lactose",
    category: "OBJECTION",
    title: "Xử lý từ chối: Sợ uống sữa bị đầy bụng, đau bụng, tiêu chảy",
    keywords: ["đầy bụng", "tiêu chảy", "dị ứng sữa", "uống sữa bị đau bụng", "lactose"],
    strategy:
      "Khẳng định 100% đạm thực vật từ hạt cao cấp, không chứa đường Lactose từ sữa bò động vật.",
    script:
      "Dạ bác hoàn toàn yên tâm 100% nhé ạ! Hiện tượng đầy bụng, đi ngoài chỉ xảy ra khi uống sữa bò công nghiệp do có đường Lactose. Còn Glucare Plus là SỮA HẠT ĐẠM THỰC VẬT chiết xuất từ hạt Macca, Sachi, Hạnh nhân... hoàn toàn KHÔNG chứa Lactose và KHÔNG chứa đường tinh luyện. Rất êm bụng, dễ tiêu hóa, kể cả người có đường ruột nhạy cảm nhất uống vào cũng thấy nhẹ bụng và dễ chịu ngay ạ!",
  },
  {
    id: "kb_care_milestones",
    category: "GUIDELINE",
    title: "Quy chuẩn Lộ trình Chăm sóc Vàng 7 Mốc (CSKH ADDP)",
    milestones: [
      { day: 1, action: "Xác nhận nhận hàng, dặn dò pha nước ấm 50 độ C, uống sau ăn sáng 30p." },
      { day: 3, action: "Hỏi thăm cảm nhận vị giác, đường ruột có êm không, giấc ngủ có sâu hơn không." },
      { day: 7, action: "Đo chỉ số đường huyết lúc đói tuần 1, ghi nhận vào hồ sơ 360." },
      { day: 14, action: "Đánh giá mức giảm tiểu đêm, tê bì chân tay; tư vấn thêm chế độ ăn rau xanh/nước lọc." },
      { day: 21, action: "Củng cố thói quen uống đều đặn mỗi ngày để duy trì đường huyết ổn định." },
      { day: "1/2 liệu trình", action: "Kiểm tra lượng sữa còn lại trong hộp xem có khớp số ngày dùng không." },
      { day: "2/3 liệu trình", action: "Tư vấn đặt trước liệu trình tiếp theo để không bị ngắt quãng, áp dụng ưu đãi khách thân thiết." },
    ],
  },
];

/**
 * Tra cứu kho tri thức Second Brain theo từ khóa hoặc câu hỏi của khách hàng
 * @param {string} query - Câu hỏi hoặc từ khóa tìm kiếm
 * @returns {Array<object>} Danh sách tài liệu tri thức liên quan nhất
 */
export function searchSecondBrain(query) {
  if (!query || typeof query !== "string") return SECOND_BRAIN_WIKI;
  const q = query.trim().toLowerCase();

  return SECOND_BRAIN_WIKI.filter((item) => {
    // 1. Tìm theo tiêu đề hoặc tóm tắt
    if (item.title.toLowerCase().includes(q) || (item.summary && item.summary.toLowerCase().includes(q))) {
      return true;
    }
    // 2. Tìm theo từ khóa từ chối
    if (Array.isArray(item.keywords) && item.keywords.some((k) => q.includes(k) || k.includes(q))) {
      return true;
    }
    // 3. Tìm theo công dụng hoặc thành phần
    if (item.ingredients && item.ingredients.toLowerCase().includes(q)) {
      return true;
    }
    if (Array.isArray(item.benefits) && item.benefits.some((b) => b.toLowerCase().includes(q))) {
      return true;
    }
    return false;
  });
}

/**
 * Trả lời câu hỏi tự động dựa trên kho tri thức Second Brain
 * @param {string} query
 * @returns {{ answer: string, references: Array<object> }}
 */
export function askSecondBrain(query) {
  const matches = searchSecondBrain(query);
  if (!matches || matches.length === 0) {
    return {
      answer: "Dạ em chào anh/chị, sản phẩm dinh dưỡng chính hãng ADDP (Sữa hạt Glucare Plus, Viên An Đường, Dovital) đều có hồ sơ kiểm định chất lượng đầy đủ. Anh/chị có thể cho em xin số điện thoại hoặc chia sẻ kỹ hơn về tình trạng sức khỏe để Dược sĩ ADDP tư vấn phác đồ phù hợp nhất cho mình nhé ạ!",
      references: [],
    };
  }

  const primary = matches[0];
  let answer = "";

  if (primary.script) {
    answer = primary.script;
  } else if (primary.pricing && primary.combos) {
    answer = `Dạ ${primary.title} có giá niêm yết: ${primary.pricing.regular.toLocaleString("vi-VN")} đ/${primary.pricing.unit}. ADDP đang có chính sách trợ giá hấp dẫn: Combo 2 lon là ${primary.combos[0]?.price.toLocaleString("vi-VN")} đ (tặng kèm quà), và Combo liệu trình 4 lon là ${primary.combos[1]?.price.toLocaleString("vi-VN")} đ kèm quà tặng đặc biệt ạ!`;
  } else if (primary.dosage) {
    answer = `Dạ về cách sử dụng ${primary.title}: Uống ${primary.dosage.daily} (${primary.dosage.serving}). ${primary.dosage.mixing}. Nên uống ${primary.dosage.timing} để ổn định đường huyết tối ưu nhất ạ!`;
  } else {
    answer = `Dạ ${primary.title} của ADDP ${primary.summary || ""}. Sản phẩm có công dụng nổi bật: ${(primary.benefits || []).slice(0, 3).join(", ")}. Anh/chị dùng đều đặn sẽ giúp ổn định đường huyết và nâng cao thể trạng rất tốt ạ!`;
  }

  return {
    answer,
    references: matches.slice(0, 3),
  };
}
