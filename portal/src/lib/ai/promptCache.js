import fs from "fs";
import path from "path";
import { getLocalDataFilePath } from "../mariadbClient.js";

/**
 * ADDP Omnichannel AI CRM — Prompt Caching & Prefix Optimization Engine
 *
 * Cung cấp:
 * 1. Tiền tố tĩnh bất biến (>1,024 tokens) gồm Persona Bác sĩ 10 năm kinh nghiệm,
 *    Phác đồ y khoa chuẩn hóa (Ăn đảo ngược, ngâm chân, vận động), và Danh mục sản phẩm ADDP.
 * 2. Cấu trúc Prompt tất định (Deterministic prompt structure): Static prefix -> RAG docs -> Dynamic context -> Turns.
 * 3. Hỗ trợ chuẩn Anthropic cache_control: { type: 'ephemeral' } và OpenAI automatic prefix caching (1,024+ tokens).
 * 4. Theo dõi thống kê cache hit/miss, tính toán chi phí và số tiền tiết kiệm thực tế (USD & VNĐ).
 */

// ============================================================================
// 1. STATIC SENIOR DOCTOR PERSONA, MEDICAL GUIDELINES & PRODUCT KNOWLEDGE
//    (Bảo đảm vượt quá ngưỡng 1,024 tokens chuẩn của OpenAI & Anthropic)
// ============================================================================

export const SENIOR_DOCTOR_STATIC_PREFIX = `=== BÁC SĨ TƯ VẤN Y KHOA & DINH DƯỠNG LÂM SÀNG CAO CẤP (10 NĂM KINH NGHIỆM) ===
Bạn là Chuyên gia Tư vấn Sức khỏe & Dinh dưỡng Lâm sàng Cao cấp với hơn 10 năm kinh nghiệm đồng hành cùng hàng chục ngàn bệnh nhân đái tháo đường, tim mạch, mỡ máu và bệnh chuyển hóa tại Công ty Dược phẩm ADDP (crm.addp.vn).
Bạn kết hợp hài hòa giữa:
- Kiến thức y khoa thực chứng sâu sắc và góc nhìn chẩn đoán tận tâm, chuẩn xác như một BÁC SĨ LÂM SÀNG GIÀU KINH NGHIỆM.
- Khả năng thấu hiểu tâm lý bệnh nhân mạn tính, phong cách giao tiếp ân cần, lắng nghe và đồng hành như NGƯỜI THÂN TRONG GIA ĐÌNH.

MỤC TIÊU VÀ SỨ MỆNH CỐT LÕI:
1. KHÔNG bán hàng thô thiển hoặc ép khách chốt đơn. Mọi phản hồi đều phải tập trung vào THĂM KHÁM, HƯỚNG DẪN, GIẢI ĐÁP BỆNH HỌC và TRAO GIÁ TRỊ Y TẾ THỰC SỰ.
2. Tuyệt đối KHÔNG khuyên bệnh nhân bỏ hoặc giảm liều thuốc tây điều trị bệnh viện. Sữa hạt và thảo mộc dinh dưỡng ADDP là giải pháp dinh dưỡng bổ trợ, phục hồi thể trạng và bình ổn chỉ số bền vững.
3. Luôn tôn trọng phác đồ điều trị của cơ sở y tế và phối hợp giải pháp ăn uống khoa học nhằm giảm dần sự lệ thuộc vào thuốc khi cơ thể đã tự cân bằng tốt.

=== PHÁC ĐỒ Y KHOA & NGUYÊN TẮC DINH DƯỠNG CHUẨN HÓA ADDP (DIABETES & METABOLIC PROTOCOL) ===

1. QUY TẮC ĂN ĐẢO NGƯỢC (REVERSE EATING PROTOCOL):
- Thứ tự bữa ăn bắt buộc:
  + Bước 1: Ăn rau xanh và củ quả nhiều chất xơ hòa tan trước tiên. Lớp chất xơ sẽ tráng một màng nhầy tự nhiên lên niêm mạc ruột non, làm chậm tốc độ rỗng dạ dày và ức chế men amylase.
  + Bước 2: Ăn thức ăn giàu đạm (thịt nạc, cá hồi, cá sông, trứng, đậu phụ) để kích thích tiết hormone GLP-1 và peptide YY tạo cảm giác no tự nhiên.
  + Bước 3: Ăn lượng tinh bột đường hấp thu chậm (gạo lứt, yến mạch, khoai lang luộc) ở cuối bữa với lượng vừa phải (1/2 đến 2/3 bát).
- Tác dụng lâm sàng: Giúp chỉ số đường huyết sau ăn 2 giờ không bị tăng vọt đột ngột (blunting postprandial glucose spike), ngăn ngừa tình trạng kiệt quệ tế bào beta đảo tụy.

2. QUY TẮC KHỞI ĐỘNG TUẦN HOÀN & THANH LỌC BUỔI SÁNG:
- Ngay sau khi ngủ dậy, uống 1 cốc nước ấm (khoảng 200-250ml nhiệt độ 40-45°C).
- Lợi ích: Bù lượng nước mất qua đường thở sau 8 tiếng ngủ, giảm độ quánh của máu (viscosity), phòng ngừa cơn thiếu máu cơ tim hoặc đột quỵ sáng sớm, đồng thời kích hoạt nhu động đường ruột.

3. QUY TẮC VẬN ĐỘNG CƠ CƠ & HẠ ĐƯỜNG HUYẾT SAU ĂN:
- Đi bộ nhẹ nhàng hoặc vận động thư giãn 15 đến 20 phút sau các bữa ăn chính từ 30-45 phút.
- Cơ chế y học: Cơ bắp vận động nhẹ sẽ kích hoạt kênh vận chuyển đường GLUT-4 thẩm thấu trực tiếp glucose từ máu vào mô cơ mà không cần phụ thuộc hoàn toàn vào hormone insulin, hạ đường tự nhiên cực kỳ an toàn.

4. QUY TẮC BẢO VỆ TUẦN HOÀN NGOẠI VI & GIẢM TÊ BÌ CHI DƯỚI:
- Ngâm chân nước ấm (khoảng 38-40°C) kết hợp một chút gừng tươi đập dập và muối hạt trong 10-15 phút trước khi đi ngủ.
- Lợi ích: Tăng cường tưới máu mao mạch đầu chi, kích thích các đầu mút thần kinh cảm giác, hỗ trợ giảm nhanh chứng tê bì, châm chích kiến bò ngón chân, chuột rút ban đêm và giúp đi vào giấc ngủ sâu hơn.

=== DANH MỤC SẢN PHẨM & GIẢI PHÁP ĐIỀU TRỊ DINH DƯỠNG ĐẶC BIỆT CỦA ADDP ===

[SẢN PHẨM 1: SỮA HẠT GLUCARE PLUS ADDP]
- Phân loại & Công năng: Dinh dưỡng chuyên biệt chuẩn y khoa cho bệnh nhân đái tháo đường Tuýp 1, Tuýp 2, tiền đái tháo đường, người cao tuổi sụt cân, suy nhược cơ thể, teo cơ, người hay hạ đường huyết xế chiều.
- Thành phần vượt trội:
  + Đường ăn kiêng Isomalt tự nhiên chiết xuất từ củ cải đường có chỉ số đường huyết cực thấp (GI ~ 32), không làm tăng đường đột biến.
  + Hệ đạm thực vật tinh khiết 100% từ 9 loại hạt thượng hạng (Đậu Hà Lan, Hạnh nhân, Óc chó, Macca, Sachi, Hạt sen).
  + Cao Đông Trùng Hạ Thảo nguyên chất và Tinh chất Quả Nhàu (Noni) kháng viêm, phục hồi miễn dịch, hỗ trợ thận lọc máu.
  + Hệ chất béo tốt MUFA, PUFA, Omega 3-6-9 bảo vệ thành mạch, hạ mỡ máu xấu LDL-C.
  + Chất xơ hòa tan FOS/Inulin nuôi dưỡng hệ vi sinh đường ruột, chống táo bón.
  + Bổ sung Canxi sinh học và 28 vitamin & khoáng chất thiết yếu (Vitamin nhóm B, D3, K2, Magie, Kẽm).
- Hương vị: Vị các loại hạt bùi béo tự nhiên, ngọt thanh dịu từ Isomalt, không ngấy, không đọng vị chua ở cuống họng, dễ uống cho người già.
- Hướng dẫn sử dụng & Liều lượng: Pha 4 muỗng gạt ngang (hoặc 1 gói 30g tiện lợi) với 180ml nước ấm 45-50°C. Uống vào bữa phụ sáng (9-10h), bữa phụ chiều (15-16h) hoặc trước khi ngủ 1 giờ. Tuyệt đối không pha nước sôi 100°C làm biến tính protein thực vật.
- Quy cách & Giá niêm yết: Lon thiếc 900g giá 450.000đ/lon; Combo 3 lon chỉ 1.250.000đ tặng bình lắc giữ nhiệt cao cấp và miễn phí vận chuyển tận nhà. Hộp gói tiện lợi: Combo 3 hộp 699.000đ, Combo 6 hộp 1.190.000đ.

[SẢN PHẨM 2: VIÊN AN ĐƯỜNG ADDP]
- Phân loại: Viên nén thảo mộc hỗ trợ kiểm soát chỉ số đường huyết và giảm tải cho gan thận.
- Thành phần: Chiết xuất Dây thìa canh chuẩn hóa, Cao mướp đắng rừng, Cao lá xoài non, Sinh địa, Cao vỏ quế, bổ sung vi chất Taurine, L-Carnitine và Kẽm gluconat.
- Cơ chế tác động: Hoạt chất Gymnemic acid trong Dây thìa canh giúp ức chế hấp thu đường ở ruột non, kích thích tái tạo tế bào beta tuyến tụy và tăng độ nhạy insulin ngoại vi.
- Cách phối hợp phác đồ: Dùng kết hợp cùng Sữa hạt Glucare Plus. Viên An Đường hỗ trợ bình ổn chỉ số, Sữa Glucare Plus bù đắp năng lượng bữa phụ chống sụt cân teo cơ.

[SẢN PHẨM 3: MÁT GAN THANH NHIỆT DOVITAL]
- Phân loại: Thảo dược bảo vệ tế bào gan, hạ men gan và thanh lọc độc tố.
- Thành phần: Cao Cà gai leo chuẩn hóa, Diệp hạ châu đắng, Cao Actiso Đà Lạt, Silymarin chiết xuất từ Kế sữa, L-Arginine HCl.
- Đối tượng: Người men gan cao (AST, ALT, GGT tăng), gan nhiễm mỡ, người thường xuyên uống bia rượu hoặc uống thuốc tây lâu năm bị nóng trong, mẩn ngứa, mề đay, mệt mỏi vàng da.
- Giá niêm yết: Hộp 60 viên giá 250.000đ; Combo 3 hộp 650.000đ.

=== QUY CHUẨN GIAO TIẾP & NGUYÊN TẮC PHẢN HỒI (COMMUNICATION DISCIPLINE) ===
1. Độ dài tin nhắn: Ngắn gọn, súc tích (khoảng 2-4 câu, từ 30 đến 70 từ), chia ý rõ ràng bằng gạch đầu dòng nếu hướng dẫn phác đồ. Tránh viết bài luận văn dài làm người lớn tuổi khó đọc.
2. Xưng hô chuẩn mực: Tùy theo độ tuổi và thông tin khách hàng: xưng Con/Cháu với Cô/Chú/Bác; xưng Em với Anh/Chị. Thân thiện, tôn kính, lễ phép.
3. Nguyên tắc câu hỏi mở: LUÔN kết thúc mỗi tin nhắn bằng đúng 01 câu hỏi thăm dò mở nhẹ nhàng (về chỉ số đường huyết đói, biểu hiện tê bì, thói quen ăn uống, giấc ngủ) để dẫn dắt câu chuyện tự nhiên.
4. Xử lý khi khách thắc mắc giá: Trình bày ngắn gọn giá trị dinh dưỡng tương đương bữa phụ sạch chỉ vài chục ngàn đồng/ngày để bảo vệ sức khỏe lâu dài, tránh viện phí đắt đỏ, sau đó hỏi thăm tình trạng chỉ số hiện tại.`;

// Marker cấu hình Anthropic Prompt Caching
export const ANTHROPIC_CACHE_CONTROL = Object.freeze({ type: "ephemeral" });

// Tỷ giá quy đổi mặc định USD sang VNĐ
export const DEFAULT_USD_TO_VND = 25400;

// Bảng giá và mức tiết kiệm token trên 1 triệu token (1M tokens) theo từng model
export const MODEL_CACHE_PRICING = Object.freeze({
  "gpt-4o-mini": {
    provider: "openai",
    baseInputPer1M: 0.15,
    cachedInputPer1M: 0.075,
    outputPer1M: 0.6,
    discountPer1M: 0.075, // 50% discount
    discountPerToken: 0.000000075,
  },
  "gpt-4o": {
    provider: "openai",
    baseInputPer1M: 2.5,
    cachedInputPer1M: 1.25,
    outputPer1M: 10.0,
    discountPer1M: 1.25, // 50% discount
    discountPerToken: 0.00000125,
  },
  "gpt-4o-2024-08-06": {
    provider: "openai",
    baseInputPer1M: 2.5,
    cachedInputPer1M: 1.25,
    outputPer1M: 10.0,
    discountPer1M: 1.25,
    discountPerToken: 0.00000125,
  },
  "claude-3-5-sonnet-20241022": {
    provider: "anthropic",
    baseInputPer1M: 3.0,
    cachedInputPer1M: 0.3, // 90% discount on cache read
    outputPer1M: 15.0,
    discountPer1M: 2.7,
    discountPerToken: 0.0000027,
  },
  "claude-3-5-haiku-20241022": {
    provider: "anthropic",
    baseInputPer1M: 0.8,
    cachedInputPer1M: 0.08, // 90% discount
    outputPer1M: 4.0,
    discountPer1M: 0.72,
    discountPerToken: 0.00000072,
  },
  "gemini-2.5-flash": {
    provider: "gemini",
    baseInputPer1M: 0.075,
    cachedInputPer1M: 0.01875, // 75% discount
    outputPer1M: 0.3,
    discountPer1M: 0.05625,
    discountPerToken: 0.00000005625,
  },
  "gemini-1.5-flash": {
    provider: "gemini",
    baseInputPer1M: 0.075,
    cachedInputPer1M: 0.01875,
    outputPer1M: 0.3,
    discountPer1M: 0.05625,
    discountPerToken: 0.00000005625,
  },
  "gemini-1.5-pro": {
    provider: "gemini",
    baseInputPer1M: 1.25,
    cachedInputPer1M: 0.3125,
    outputPer1M: 5.0,
    discountPer1M: 0.9375,
    discountPerToken: 0.0000009375,
  },
});

// Fallback mặc định khi model chưa có trong bảng
const DEFAULT_FALLBACK_PRICING = Object.freeze({
  provider: "openai",
  baseInputPer1M: 0.15,
  cachedInputPer1M: 0.075,
  outputPer1M: 0.6,
  discountPer1M: 0.075,
  discountPerToken: 0.000000075,
});

// ============================================================================
// 2. TOKEN ESTIMATOR UTILITY (Hỗ trợ tiếng Việt dấu thanh & ký tự đa ngữ)
// ============================================================================

/**
 * Ước tính số token tương đối chính xác cho tiếng Việt và tiếng Anh.
 * Đối với BPE tokenizers (OpenAI cl100k_base / Claude), tiếng Việt trung bình
 * dao động từ 1.2 - 1.4 token/từ (hoặc khoảng 3.2 - 3.8 ký tự/token).
 */
export function estimateTokens(text = "") {
  const str = String(text || "").trim();
  if (!str) return 0;

  // Tách theo khoảng trắng để đếm số từ
  const words = str.split(/\s+/).filter(Boolean);
  // Đếm các ký tự đặc biệt / dấu câu thường sinh token riêng
  const specialChars = (str.match(/[\n\r\t.,!?:;()\[\]{}"'\\\/<>=+*#@$%^&~`|_-]/g) || []).length;
  // Ước tính chuẩn theo trọng số từ vựng tiếng Việt kết hợp dấu câu
  const wordTokens = Math.ceil(words.length * 1.28);
  const punctuationTokens = Math.ceil(specialChars * 0.4);
  const rawEstimate = wordTokens + punctuationTokens;

  // Đối chiếu theo độ dài ký tự để tránh lệch khi gặp chuỗi dài không khoảng trắng
  const charBasedEstimate = Math.ceil(str.length / 3.4);

  return Math.max(rawEstimate, charBasedEstimate, 1);
}

// ============================================================================
// 3. DETERMINISTIC PROMPT BUILDER
//    (Sắp xếp theo thứ tự tối ưu cache: Tiền tố tĩnh -> RAG Docs -> Ngữ cảnh động -> Hội thoại)
// ============================================================================

/**
 * Xây dựng prompt có cấu trúc tất định (Deterministic Prompt Structure)
 * Bảo đảm tiền tố tĩnh xuất hiện trước tiên, nguyên vẹn 100% qua mọi cuộc gọi
 * để đạt tỷ lệ Cache Hit tối đa trên OpenAI, Anthropic và Gemini.
 */
export function buildDeterministicPrompt({
  staticPrefix = SENIOR_DOCTOR_STATIC_PREFIX,
  ragDocs = [],
  customer360 = "",
  accountContext = "",
  rules = "",
  conversationTurns = [],
} = {}) {
  // 1. Tiền tố tĩnh chuẩn hóa (loại bỏ khoảng trắng thừa đầu cuối, giữ cấu trúc cố định)
  const prefix = String(staticPrefix || SENIOR_DOCTOR_STATIC_PREFIX).trim();
  const prefixTokens = estimateTokens(prefix);

  // 2. RAG Documents: Sắp xếp tất định theo ID hoặc tiêu đề để giữ thứ tự ổn định
  let ragText = "";
  if (Array.isArray(ragDocs) && ragDocs.length > 0) {
    const sortedDocs = [...ragDocs].sort((a, b) => {
      const idA = String(a?.id || a?.title || "");
      const idB = String(b?.id || b?.title || "");
      return idA.localeCompare(idB);
    });

    ragText = sortedDocs
      .map((doc, idx) => {
        const title = doc.title || doc.docTitle || `Tài liệu ${idx + 1}`;
        const content = doc.content || doc.text || "";
        return `[TÀI LIỆU THAM KHẢO ${idx + 1}: ${title}]\n${content}`.trim();
      })
      .filter(Boolean)
      .join("\n\n");
  }

  // Ghép phần tĩnh hoàn toàn (Static Prefix + RAG Knowledge ổn định)
  const fullStaticBlock = [prefix, ragText ? `=== TÀI LIỆU TRI THỨC BỔ SUNG ===\n${ragText}` : null]
    .filter(Boolean)
    .join("\n\n");

  const fullStaticTokens = estimateTokens(fullStaticBlock);

  // 3. Ngữ cảnh động (Tài khoản nhân sự, Hồ sơ 360 của khách hàng, Quy tắc trạng thái)
  const dynamicSections = [
    accountContext ? `=== THÔNG TIN NHÂN SỰ & TÀI KHOẢN KÊNH ===\n${accountContext.trim()}` : null,
    customer360 ? `=== HỒ SƠ 360 CỦA KHÁCH HÀNG HIỆN TẠI ===\n${customer360.trim()}` : null,
    rules ? `=== QUY TẮC PHẢN HỒI THỜI GIAN THỰC ===\n${rules.trim()}` : null,
  ].filter(Boolean);

  const dynamicBlock = dynamicSections.join("\n\n");
  const dynamicTokens = estimateTokens(dynamicBlock);

  // 4. Toàn bộ system prompt hợp nhất (đặt tiền tố tĩnh lên đầu)
  const fullSystemPrompt = [fullStaticBlock, dynamicBlock].filter(Boolean).join("\n\n");

  // 5. Chuẩn hóa messages cho OpenAI:
  // Tách làm 2 system messages riêng biệt nếu có ngữ cảnh động:
  // - Message 1: Static Prefix (>1024 tokens) -> OpenAI hash và cache vĩnh viễn trên toàn hệ thống!
  // - Message 2: Dynamic Context (Thông tin riêng của từng khách hàng)
  const openAiSystemMessages = dynamicBlock
    ? [
        { role: "system", content: fullStaticBlock },
        { role: "system", content: dynamicBlock },
      ]
    : [{ role: "system", content: fullStaticBlock }];

  const openAiMessages = [...openAiSystemMessages, ...conversationTurns];

  // 6. Cấu trúc chuẩn Anthropic với cache_control: { type: 'ephemeral' }
  const anthropicSystem = [
    {
      type: "text",
      text: fullStaticBlock,
      cache_control: ANTHROPIC_CACHE_CONTROL,
    },
    ...(dynamicBlock ? [{ type: "text", text: dynamicBlock }] : []),
  ];

  // 7. Cấu trúc chuẩn Gemini với systemInstruction
  const geminiSystemInstruction = {
    parts: [{ text: fullSystemPrompt }],
  };

  // Tính toán tổng số token ước tính
  const turnsTokens = conversationTurns.reduce(
    (acc, m) => acc + estimateTokens(m?.content || ""),
    0
  );
  const totalTokens = fullStaticTokens + dynamicTokens + turnsTokens;
  const isCacheEligible = fullStaticTokens >= 1024;

  return {
    staticPrefix: fullStaticBlock,
    dynamicContext: dynamicBlock,
    fullSystemPrompt,
    openAiMessages,
    openAiSystemMessages,
    anthropicSystem,
    geminiSystemInstruction,
    conversationTurns,
    metrics: {
      staticPrefixTokens: fullStaticTokens,
      dynamicTokens,
      turnsTokens,
      totalEstimatedTokens: totalTokens,
      isCacheEligible,
      cacheThreshold: 1024,
      statusMessage: isCacheEligible
        ? `Đủ điều kiện kích hoạt Prompt Caching tự động (${fullStaticTokens} >= 1024 tokens)`
        : `Chưa đạt ngưỡng cache (${fullStaticTokens} < 1024 tokens)`,
    },
  };
}

// ============================================================================
// 4. TÍNH TOÁN CHI PHÍ & MỨC TIẾT KIỆM (COST SAVINGS ENGINE)
// ============================================================================

/**
 * Tính số tiền tiết kiệm được khi hit prompt cache dựa trên model và số token đã cache
 */
export function calculateTokenSavings({
  model = "gpt-4o-mini",
  provider = "openai",
  cachedTokens = 0,
  exchangeRate = DEFAULT_USD_TO_VND,
} = {}) {
  const count = Math.max(0, Number(cachedTokens) || 0);
  if (count <= 0) {
    return {
      cachedTokens: 0,
      savedUsd: 0,
      savedVnd: 0,
      discountPercent: 0,
      savedUsdFormatted: "$0.000000",
      savedVndFormatted: "0 ₫",
    };
  }

  // Tìm bảng giá theo model
  const pricing =
    MODEL_CACHE_PRICING[model] ||
    Object.values(MODEL_CACHE_PRICING).find(
      (p) => model.toLowerCase().includes(p.provider) || p.provider === provider
    ) ||
    DEFAULT_FALLBACK_PRICING;

  const discountPerToken = pricing.discountPerToken || 0.000000075;
  const savedUsd = Number((count * discountPerToken).toFixed(7));
  const savedVnd = Math.round(savedUsd * exchangeRate);

  const discountPercent = pricing.baseInputPer1M
    ? Math.round((pricing.discountPer1M / pricing.baseInputPer1M) * 100)
    : 50;

  return {
    cachedTokens: count,
    savedUsd,
    savedVnd,
    discountPercent,
    savedUsdFormatted: `$${savedUsd.toFixed(6)}`,
    savedVndFormatted: `${savedVnd.toLocaleString("vi-VN")} ₫`,
    cacheHit: count > 0,
  };
}

// ============================================================================
// 5. CACHE HIT/MISS TRACKING & STATISTICS STORE
// ============================================================================

const STATS_FILE_NAME = "prompt_cache_stats.json";

function getInitialStats() {
  return {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    hitRatePercent: 0,
    totalPromptTokens: 0,
    totalCachedTokens: 0,
    totalCompletionTokens: 0,
    totalSavedUsd: 0,
    totalSavedVnd: 0,
    byProvider: {
      openai: { requests: 0, hits: 0, cachedTokens: 0, savedUsd: 0, savedVnd: 0 },
      anthropic: { requests: 0, hits: 0, cachedTokens: 0, savedUsd: 0, savedVnd: 0 },
      gemini: { requests: 0, hits: 0, cachedTokens: 0, savedUsd: 0, savedVnd: 0 },
    },
    byModel: {},
    recentEvents: [],
    updatedAt: new Date().toISOString(),
  };
}

// Bộ nhớ đệm in-memory singleton
let memoryStats = null;

function loadStatsFromFile() {
  try {
    const filePath = getLocalDataFilePath(STATS_FILE_NAME);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
      return { ...getInitialStats(), ...JSON.parse(raw) };
    }
  } catch {}
  return getInitialStats();
}

function persistStatsToFile(stats) {
  try {
    const filePath = getLocalDataFilePath(STATS_FILE_NAME);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(stats, null, 2), "utf8");
  } catch {}
}

/**
 * Lấy báo cáo thống kê Prompt Caching hiện tại
 */
export function getCacheStats() {
  if (!memoryStats) {
    memoryStats = loadStatsFromFile();
  }
  return { ...memoryStats };
}

/**
 * Đặt lại toàn bộ dữ liệu thống kê cache
 */
export function resetCacheStats() {
  memoryStats = getInitialStats();
  persistStatsToFile(memoryStats);
  return { ...memoryStats };
}

/**
 * Ghi nhận một sự kiện gọi LLM để cập nhật tỷ lệ Hit/Miss và số tiền tiết kiệm
 */
export function recordCacheEvent({
  provider = "openai",
  model = "gpt-4o-mini",
  promptTokens = 0,
  cachedTokens = 0,
  completionTokens = 0,
  durationMs = 0,
  metadata = null,
} = {}) {
  const stats = getCacheStats();

  const isHit = Number(cachedTokens) > 0;
  const cTokens = Math.max(0, Number(cachedTokens) || 0);
  const pTokens = Math.max(0, Number(promptTokens) || 0);
  const compTokens = Math.max(0, Number(completionTokens) || 0);

  const savings = calculateTokenSavings({
    model,
    provider,
    cachedTokens: cTokens,
  });

  // Cập nhật tổng thể
  stats.totalRequests += 1;
  if (isHit) {
    stats.cacheHits += 1;
  } else {
    stats.cacheMisses += 1;
  }
  stats.hitRatePercent = Number(((stats.cacheHits / stats.totalRequests) * 100).toFixed(1));
  stats.totalPromptTokens += pTokens;
  stats.totalCachedTokens += cTokens;
  stats.totalCompletionTokens += compTokens;
  stats.totalSavedUsd = Number((stats.totalSavedUsd + savings.savedUsd).toFixed(6));
  stats.totalSavedVnd += savings.savedVnd;
  stats.updatedAt = new Date().toISOString();

  // Thống kê theo Provider
  const provKey = String(provider || "openai").toLowerCase();
  if (!stats.byProvider[provKey]) {
    stats.byProvider[provKey] = {
      requests: 0,
      hits: 0,
      cachedTokens: 0,
      savedUsd: 0,
      savedVnd: 0,
    };
  }
  stats.byProvider[provKey].requests += 1;
  if (isHit) stats.byProvider[provKey].hits += 1;
  stats.byProvider[provKey].cachedTokens += cTokens;
  stats.byProvider[provKey].savedUsd = Number(
    (stats.byProvider[provKey].savedUsd + savings.savedUsd).toFixed(6)
  );
  stats.byProvider[provKey].savedVnd += savings.savedVnd;

  // Thống kê theo Model
  const modelKey = String(model || "unknown").toLowerCase();
  if (!stats.byModel[modelKey]) {
    stats.byModel[modelKey] = {
      requests: 0,
      hits: 0,
      cachedTokens: 0,
      savedUsd: 0,
      savedVnd: 0,
    };
  }
  stats.byModel[modelKey].requests += 1;
  if (isHit) stats.byModel[modelKey].hits += 1;
  stats.byModel[modelKey].cachedTokens += cTokens;
  stats.byModel[modelKey].savedUsd = Number(
    (stats.byModel[modelKey].savedUsd + savings.savedUsd).toFixed(6)
  );
  stats.byModel[modelKey].savedVnd += savings.savedVnd;

  // Lưu lịch sử gần đây (tối đa 50 sự kiện)
  stats.recentEvents.unshift({
    timestamp: new Date().toISOString(),
    provider: provKey,
    model: modelKey,
    isHit,
    promptTokens: pTokens,
    cachedTokens: cTokens,
    completionTokens: compTokens,
    savedUsd: savings.savedUsd,
    savedVnd: savings.savedVnd,
    durationMs,
    metadata,
  });
  if (stats.recentEvents.length > 50) {
    stats.recentEvents = stats.recentEvents.slice(0, 50);
  }

  memoryStats = stats;
  persistStatsToFile(stats);

  return {
    isHit,
    cacheHit: isHit,
    cachedTokens: cTokens,
    savedUsd: savings.savedUsd,
    savedVnd: savings.savedVnd,
    savedUsdFormatted: savings.savedUsdFormatted,
    savedVndFormatted: savings.savedVndFormatted,
    hitRatePercent: stats.hitRatePercent,
  };
}
