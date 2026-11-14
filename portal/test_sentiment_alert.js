import { analyzeCustomerSentiment, isUrgentAngryCustomer } from "./src/lib/ai/sentimentDetector.js";
import {
  processMessageForSentimentAlert,
  getSentimentAlerts,
  acknowledgeSentimentAlert,
  resolveSentimentAlert,
  getSentimentAlertStats,
  _clearAlertsForTesting,
} from "./src/lib/ai/sentimentAlertStore.js";
import { getConversationBotState } from "./src/lib/botControlStore.js";
import { generateHumanLikeReply } from "./src/lib/ai/chatBotEngine.js";

async function runTests() {
  console.log("================================================================================");
  console.log("🚀 CHẠY KIỂM THỬ: BỘ NHẬN DIỆN SẮC THÁI CẢM XÚC & CẢNH BÁO KHÁCH CÁU GẮT (FEAT 2)");
  console.log("================================================================================\n");

  _clearAlertsForTesting();

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      failed++;
    }
  }

  // --------------------------------------------------------------------------------
  // 1. KIỂM THỬ NHÓM 1: KHÁCH HÀNG CÁU GẮT CỰC ĐỘ (ANGRY)
  // --------------------------------------------------------------------------------
  console.log("--- 1. Kiểm thử Nhóm Cáu Gắt Cực Độ & Cáo Buộc Nghiêm Trọng (ANGRY) ---");

  const angryCases = [
    {
      text: "Bọn lừa đảo, tao đã chuyển khoản mà không giao hàng, quân mất dạy!",
      expectedCategory: "FRAUD_ACCUSATION",
    },
    {
      text: "Tôi sẽ báo công an và bóc phốt công ty này lên mạng cho mọi người tẩy chay!",
      expectedCategory: "LEGAL_THREAT",
    },
    {
      text: "Thái độ vớ vẩn, làm ăn tắc trách, điên cả máu!",
      expectedCategory: "EXTREME_ANGER",
    },
    {
      text: "Cho tôi gặp giám đốc hoặc quản lý ngay, bắt đền và hoàn tiền lại đây!",
      expectedCategory: "DEMAND_ESCALATION",
    },
    {
      text: "Uống vào bị ngộ độc phải nhập viện cấp cứu, do thuốc của shop suýt chết!",
      expectedCategory: "ADVERSE_EFFECT_BLAME",
    },
  ];

  for (const item of angryCases) {
    const res = analyzeCustomerSentiment(item.text);
    assert(
      res.status === "ANGRY" && res.score >= 0.8 && res.requiresHandover === true,
      `Nhận diện ANGRY chuẩn: "${item.text.substring(0, 40)}..." (Score: ${res.score}, Category: ${res.matchedCategories.join(", ")})`
    );
  }

  // --------------------------------------------------------------------------------
  // 2. KIỂM THỬ NHÓM 2: KHIẾU NẠI CHẤT LƯỢNG / DỊCH VỤ (COMPLAINT)
  // --------------------------------------------------------------------------------
  console.log("\n--- 2. Kiểm thử Nhóm Khiếu Nại Chất Lượng / Giao Hàng (COMPLAINT) ---");

  const complaintCases = [
    "Chất lượng tệ quá, hộp sữa bị móp méo và rách tem niêm phong",
    "Giao sai hàng cho tôi rồi, tôi đặt vị vani lại gửi sô-cô-la",
    "Chờ cả tuần nay chưa thấy giao hàng, gọi mãi không nghe máy",
  ];

  for (const text of complaintCases) {
    const res = analyzeCustomerSentiment(text);
    assert(
      res.status === "COMPLAINT" && res.score >= 0.6 && res.score < 0.8,
      `Nhận diện COMPLAINT chuẩn: "${text.substring(0, 40)}..." (Score: ${res.score})`
    );
  }

  // --------------------------------------------------------------------------------
  // 3. KIỂM THỬ NHÓM 3: TRIỆU CHỨNG BỆNH LÝ Y KHOA (PHẢI LÀ NEUTRAL, KHÔNG BÁO CÁU GẮT!)
  // --------------------------------------------------------------------------------
  console.log("\n--- 3. Kiểm thử Phân Biệt Triệu Chứng Bệnh Lý Y Khoa (CRITICAL MEDICAL TEST) ---");

  const medicalSymptomCases = [
    "Dạo này tôi hay mệt mỏi, đau nhức xương khớp và thỉnh thoảng bị tụt huyết áp",
    "Đường huyết của tôi đo lúc sáng là 10.5 chấm, hay bị tê bì chân tay và khát nước",
    "Tôi bị đau đầu, chóng mặt và mất ngủ cả tháng nay có uống được loại này không?",
  ];

  for (const text of medicalSymptomCases) {
    const res = analyzeCustomerSentiment(text);
    assert(
      res.status === "NEUTRAL" &&
        res.isMedicalSymptomOnly === true &&
        res.requiresHandover === false &&
        res.score <= 0.35,
      `Phân biệt đúng triệu chứng y khoa (KHÔNG cáu gắt): "${text.substring(0, 40)}..." (Score: ${res.score}, Symptoms: ${res.detectedSymptoms.join(", ")})`
    );
  }

  // --------------------------------------------------------------------------------
  // 4. KIỂM THỬ NHÓM 4: KHÁCH HÀNG HÀI LÒNG / KHEN NGỢI (POSITIVE)
  // --------------------------------------------------------------------------------
  console.log("\n--- 4. Kiểm thử Nhóm Khách Hàng Tích Cực / Hài Lòng (POSITIVE) ---");

  const positiveCases = [
    "Cảm ơn shop, tôi uống được 2 hộp thấy đường huyết hạ và người khỏe hẳn",
    "Đã nhận được hàng rồi nhé, đóng gói cẩn thận, sản phẩm rất tốt",
  ];

  for (const text of positiveCases) {
    const res = analyzeCustomerSentiment(text);
    assert(
      res.status === "POSITIVE" && res.score <= 0.15 && res.requiresHandover === false,
      `Nhận diện POSITIVE chuẩn: "${text.substring(0, 40)}..." (Score: ${res.score})`
    );
  }

  // --------------------------------------------------------------------------------
  // 5. KIỂM THỬ TỰ ĐỘNG CHUYỂN GIAO BOT -> HUMAN (AUTO-HANDOVER STORE & BOT CONTROL)
  // --------------------------------------------------------------------------------
  console.log("\n--- 5. Kiểm thử Tự Động Chuyển Giao Bot -> Nhân Viên Trực (Auto-Handover) ---");

  const customerId = "cust_angry_test_001";
  const channelId = "zalo_test_acc";
  const angryMsg = "Quân lừa đảo, tao báo công an cho chúng mày đi tù!";

  const processRes = processMessageForSentimentAlert({
    messageText: angryMsg,
    customerId,
    customerName: "Anh Hoàng Cáu Gắt",
    customerPhone: "0988776655",
    channelId,
    threadId: customerId,
  });

  assert(processRes.handoverTriggered === true, "Kích hoạt chuyển giao tự động thành công (handoverTriggered = true)");
  assert(processRes.alert && processRes.alert.severity === "CRITICAL", "Tạo cảnh báo mức độ CRITICAL");

  // Kiểm tra trạng thái bot trong botControlStore
  const botState = getConversationBotState(customerId);
  assert(botState && botState.mode === "HUMAN", "Bot AI đã bị NGẮT LẬP TỨC và chuyển sang chế độ HUMAN");

  // --------------------------------------------------------------------------------
  // 6. KIỂM THỬ QUẢN LÝ CẢNH BÁO (ACKNOWLEDGE & RESOLVE & STATS)
  // --------------------------------------------------------------------------------
  console.log("\n--- 6. Kiểm thử Vòng Đời Cảnh Báo (Acknowledge & Resolve) ---");

  const activeAlerts = getSentimentAlerts({ status: "ACTIVE" });
  assert(activeAlerts.length >= 1, `Truy vấn cảnh báo ACTIVE thành công (tìm thấy ${activeAlerts.length})`);

  const alertId = processRes.alert.id;
  const ackRes = acknowledgeSentimentAlert(alertId, "STAFF_02", "Đã gọi điện thoại xoa dịu khách hàng");
  assert(ackRes.ok === true && ackRes.alert.status === "ACKNOWLEDGED", "Nhân viên tiếp nhận xử lý cảnh báo thành công (ACKNOWLEDGED)");

  const resolveRes = resolveSentimentAlert(alertId, "STAFF_02", "Đã thu hồi hàng lỗi và gửi sản phẩm bù cho khách, khách đã nguôi giận");
  assert(resolveRes.ok === true && resolveRes.alert.status === "RESOLVED", "Nhân viên giải quyết xong sự vụ thành công (RESOLVED)");

  const stats = getSentimentAlertStats();
  assert(stats.resolved >= 1 && stats.criticalCount >= 1, `Thống kê cảnh báo chính xác (Resolved: ${stats.resolved}, Critical: ${stats.criticalCount})`);

  // --------------------------------------------------------------------------------
  // 7. KIỂM THỬ TÍCH HỢP TRONG ChatBotEngine (generateHumanLikeReply)
  // --------------------------------------------------------------------------------
  console.log("\n--- 7. Kiểm thử Tích Hợp ChatBotEngine (Bảo Vệ Thương Hiệu Không Cãi Khách) ---");

  const botReply = await generateHumanLikeReply({
    customerMessage: "Chất lượng quá tệ, bọn lừa tiền, tao bóc phốt trên facebook!",
    customerProfile: {
      id: "cust_angry_test_002",
      name: "Bác Hùng",
      gender: "MALE",
      phone: "0912998877",
    },
    conversationHistory: [],
    accountName: "Dược Sĩ Minh",
  });

  assert(botReply.handoverTriggered === true, "ChatBotEngine tự động phát hiện cáu gắt và kích hoạt handover");
  assert(botReply.requiresHandover === true, "ChatBotEngine gắn cờ requiresHandover = true");
  assert(
    botReply.replyText.includes("xin lỗi") && botReply.replyText.includes("Quản lý"),
    `ChatBotEngine trả lời xoa dịu thương hiệu: "${botReply.replyText}"`
  );

  // --------------------------------------------------------------------------------
  // TỔNG KẾT
  // --------------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(`🎯 KẾT QUẢ KIỂM THỬ TỔNG THỂ: ${passed} PASS, ${failed} FAIL`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
