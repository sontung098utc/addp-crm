/**
 * Comprehensive Verification & Integration Test for Swarm AI Features:
 * Feature 1: Prompt Caching
 * Feature 2: Sentiment Alert & Auto-Handover
 * Feature 3: AI Lead Scoring (HOT/WARM/COLD)
 * Feature 4: Clean Integration into chatBotEngine.js
 */

import assert from "node:assert/strict";
import { generateHumanLikeReply } from "./src/lib/ai/chatBotEngine.js";
import {
  SENIOR_DOCTOR_STATIC_PREFIX,
  estimateTokens,
  buildDeterministicPrompt,
  calculateTokenSavings,
  recordCacheEvent,
  getCacheStats,
} from "./src/lib/ai/promptCache.js";
import {
  detectSentiment,
  shouldTriggerSentimentAlert,
  SENTIMENT_LEVELS,
} from "./src/lib/ai/sentimentDetector.js";
import {
  processMessageForSentimentAlert,
  getSentimentAlerts,
  acknowledgeSentimentAlert,
  resolveSentimentAlert,
} from "./src/lib/ai/sentimentAlertStore.js";
import {
  evaluateLeadScore,
  LEAD_TIERS,
  LEAD_ACTIONS,
} from "./src/lib/ai/leadScorer.js";
import {
  getLeadScore,
  recalculateAndSaveLeadScore,
  getAllLeadScores,
} from "./src/lib/ai/leadScoreStore.js";
import { isBotActiveForThread, getConversationBotState } from "./src/lib/botControlStore.js";

let passedCount = 0;
let failedCount = 0;

function testCase(name, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    failedCount++;
  }
}

async function testCaseAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    failedCount++;
  }
}

async function runAllVerificationTests() {
  console.log("=".repeat(80));
  console.log("🚀 BẮT ĐẦU KIỂM THỬ XÁC MINH TOÀN DIỆN (SWARM VERIFIER SUITE)");
  console.log("=".repeat(80));

  // =========================================================================
  // PHẦN 1: VERIFY PROMPT CACHING (@caching)
  // =========================================================================
  console.log("\n--- 1. Kiểm thử Tính Năng Prompt Caching (@caching) ---");

  testCase("1.1 Tiền tố tĩnh Bác sĩ cao cấp vượt ngưỡng 1,024 tokens", () => {
    const tokens = estimateTokens(SENIOR_DOCTOR_STATIC_PREFIX);
    assert.ok(tokens >= 1024, `Số token phải >= 1024, thực tế: ${tokens}`);
  });

  testCase("1.2 buildDeterministicPrompt bảo toàn tiền tố tĩnh bất biến ở đầu prompt", () => {
    const res = buildDeterministicPrompt({
      staticPrefix: SENIOR_DOCTOR_STATIC_PREFIX,
      ragDocs: [
        { id: "doc_b", title: "Doc B", content: "Content B" },
        { id: "doc_a", title: "Doc A", content: "Content A" },
      ],
      customer360: "Khách hàng: Bác Hùng, 62 tuổi, ĐT: 0912345678",
      rules: "Quy tắc: Tư vấn phác đồ ăn đảo ngược",
      conversationTurns: [{ role: "user", content: "Chào bác sĩ" }],
    });

    assert.ok(res.fullSystemPrompt.startsWith(SENIOR_DOCTOR_STATIC_PREFIX.trim()));
    assert.ok(res.openAiSystemMessages.length >= 2, "OpenAI message 0 phải là static prefix");
    assert.equal(res.openAiSystemMessages[0].role, "system");
    assert.ok(res.openAiSystemMessages[0].content.includes("BÁC SĨ TƯ VẤN Y KHOA"));
    assert.ok(res.openAiSystemMessages[1].content.includes("Khách hàng: Bác Hùng"));
    // RAG docs sắp xếp tất định theo ID: doc_a trước doc_b
    const idxA = res.fullSystemPrompt.indexOf("Doc A");
    const idxB = res.fullSystemPrompt.indexOf("Doc B");
    assert.ok(idxA !== -1 && idxB !== -1 && idxA < idxB, "RAG docs phải sắp xếp tất định");
  });

  testCase("1.3 Hỗ trợ Anthropic cache_control { type: 'ephemeral' }", () => {
    const res = buildDeterministicPrompt({
      staticPrefix: SENIOR_DOCTOR_STATIC_PREFIX,
      ragDocs: [{ id: "doc_1", title: "Tri thức", content: "Nội dung" }],
      customer360: "Khách VIP",
    });
    assert.ok(Array.isArray(res.anthropicSystem));
    assert.equal(res.anthropicSystem[0].type, "text");
    assert.deepEqual(res.anthropicSystem[0].cache_control, { type: "ephemeral" });
  });

  testCase("1.4 Tính toán chi phí và mức tiết kiệm (calculateTokenSavings)", () => {
    // 2,000 cached tokens trên gpt-4o-mini
    const savings = calculateTokenSavings({
      cachedTokens: 2000,
      totalPromptTokens: 2500,
      completionTokens: 200,
      model: "gpt-4o-mini",
    });
    assert.equal(savings.cachedTokens, 2000);
    assert.equal(savings.discountPercent, 50);
    assert.ok(savings.savedUsd > 0);
    assert.ok(savings.savedVnd > 0);
    assert.equal(savings.cacheHit, true);
  });

  testCase("1.5 Thống kê Cache Hit/Miss & Tích lũy tiền tiết kiệm", () => {
    const event = recordCacheEvent({
      model: "gpt-4o-mini",
      cachedTokens: 1500,
      totalPromptTokens: 2000,
      completionTokens: 150,
      savedUsd: 0.0001125,
      savedVnd: 2.8575,
      latencyMs: 320,
    });
    assert.equal(event.cacheHit, true);
    const stats = getCacheStats();
    assert.ok(stats.totalRequests >= 1);
    assert.ok(stats.totalSavedVnd >= 0);
  });

  // =========================================================================
  // PHẦN 2: VERIFY SENTIMENT ALERT & MEDICAL DISTINCTION (@sentiment)
  // =========================================================================
  console.log("\n--- 2. Kiểm thử Nhận Diện Sắc Thái & Cảnh Báo Cáu Gắt (@sentiment) ---");

  testCase("2.1 Phát hiện chính xác khách hàng cáu gắt, lừa đảo, đe dọa (ANGRY)", () => {
    const cases = [
      { text: "Bọn lừa đảo, tao đã chuyển khoản mà không gửi hàng, đồ ăn cướp!", cat: "FRAUD_ACCUSATION" },
      { text: "Tôi sẽ báo công an và quản lý thị trường cho các người đi tù!", cat: "LEGAL_THREAT" },
      { text: "Làm ăn như thế này à, cho tôi gặp giám đốc hoặc quản lý ngay!", cat: "DEMAND_ESCALATION" },
      { text: "Uống thuốc của shop bị ngộ độc phải đi cấp cứu, đền tiền ngay!", cat: "ADVERSE_EFFECT_BLAME" },
    ];
    for (const c of cases) {
      const sent = detectSentiment(c.text);
      assert.equal(sent.status, SENTIMENT_LEVELS.ANGRY, `Phải nhận diện ANGRY: "${c.text}"`);
      assert.ok(sent.score >= 0.75, `Score phải >= 0.75, thực tế: ${sent.score}`);
      assert.equal(shouldTriggerSentimentAlert(sent), true, "Phải kích hoạt cảnh báo");
    }
  });

  testCase("2.2 Phân biệt đúng TRIỆU CHỨNG BỆNH LÝ Y KHOA (Không coi là cáu gắt - False Positive Rate = 0)", () => {
    const medicalCases = [
      "Tôi hay bị đau nhức xương khớp, mệt mỏi và thỉnh thoảng tụt huyết áp",
      "Đường huyết của tôi sáng nay đo là 11.2, bị tê bì chân tay và khát nước nhiều",
      "Tôi bị mất ngủ, chóng mặt, đau đầu và sút mất 3 cân",
    ];
    for (const text of medicalCases) {
      const sent = detectSentiment(text);
      assert.equal(sent.status, SENTIMENT_LEVELS.NEUTRAL, `Triệu chứng y tế phải là NEUTRAL: "${text}"`);
      assert.ok(sent.score <= 0.35, `Score y tế phải <= 0.35, thực tế: ${sent.score}`);
      assert.equal(sent.isMedicalSymptomOnly, true, "isMedicalSymptomOnly phải là true");
      assert.equal(shouldTriggerSentimentAlert(sent), false, "Tuyệt đối không được kích hoạt cảnh báo với bệnh lý");
    }
  });

  testCase("2.3 Auto-Handover sang HUMAN trong botControlStore khi khách cáu gắt", () => {
    const testCustId = "test_verifier_angry_001";
    const testChannel = "ZALO_PERSONAL";
    const res = processMessageForSentimentAlert({
      messageText: "Đồ lừa đảo, trả tiền cho tao không tao báo công an đấy!",
      customerId: testCustId,
      customerName: "Khách Thử Nghiệm",
      channelId: testChannel,
      threadId: testCustId,
    });
    assert.equal(res.handoverTriggered, true, "Phải kích hoạt handoverTriggered");
    assert.ok(res.alert, "Phải có alert object");
    assert.equal(res.alert.severity, "CRITICAL");

    // Kiểm tra trạng thái bot trong botControlStore
    const threadState = isBotActiveForThread(testCustId, testChannel);
    assert.equal(threadState.active, false, "Bot AI phải bị tắt");
    assert.equal(threadState.mode, "HUMAN", "Chế độ phải chuyển thành HUMAN");
  });

  // =========================================================================
  // PHẦN 3: VERIFY AI LEAD SCORING (@leadscoring)
  // =========================================================================
  console.log("\n--- 3. Kiểm thử Chấm Điểm Mức Độ Quan Tâm Khách Hàng HOT / WARM / COLD (@leadscoring) ---");

  testCase("3.1 Lời chào thông thường hoặc tin rỗng -> COLD (Score < 50)", () => {
    const res = evaluateLeadScore({ messages: ["Chào em", "Alo"] });
    assert.equal(res.tier, LEAD_TIERS.COLD);
    assert.ok(res.score < 50, `Score phải < 50, thực tế: ${res.score}`);
    assert.equal(res.suggestedAction, LEAD_ACTIONS.COLD);
  });

  testCase("3.2 Bệnh lý cấp thiết + Hỏi giá sản phẩm -> WARM (Score 50-79)", () => {
    const res = evaluateLeadScore({
      messages: [
        "Tôi bị tiểu đường tuýp 2 đường huyết 9 chấm, hay sụt cân và tê bì chân tay", // +25
        "Sữa Glucare Plus giá bao nhiêu tiền một hộp vậy em, có khuyến mãi gì không?", // +30
      ],
    });
    assert.equal(res.score, 55, `Điểm phải là 55 (25+30), thực tế: ${res.score}`);
    assert.equal(res.tier, LEAD_TIERS.WARM);
    assert.equal(res.suggestedAction, LEAD_ACTIONS.WARM);
    assert.ok(res.factors.length >= 2);
  });

  testCase("3.3 Bệnh lý + Hỏi giá + Gửi địa chỉ SĐT nhận hàng -> HOT (Score >= 80)", () => {
    const res = evaluateLeadScore({
      messages: [
        "Tôi bị tiểu đường tuýp 2, dạo này đường huyết cao 10 chấm", // +25
        "Cho tôi xem combo 3 lon giá bao nhiêu", // +30
        "Gửi cho tôi 1 combo về số 123 đường Giải Phóng, SĐT: 0987654321, ship COD nhé", // +35
      ],
    });
    assert.equal(res.score, 90, `Điểm phải là 90 (25+30+35), thực tế: ${res.score}`);
    assert.equal(res.tier, LEAD_TIERS.HOT);
    assert.equal(res.suggestedAction, LEAD_ACTIONS.HOT);
  });

  testCase("3.4 Đầy đủ 4 tiêu chí kể cả Do dự -> 100 điểm HOT", () => {
    const res = evaluateLeadScore({
      messages: [
        "Đường huyết 12 phẩy, tê bì chân tay", // +25
        "Hỏi giá combo sữa hạt glucare", // +30
        "Gửi về địa chỉ số 10 Cầu Giấy Hà Nội, SĐT 0912233445", // +35
        "Giá hơi đắt nhưng để tôi cân nhắc hỏi lại vợ", // +10
      ],
    });
    assert.equal(res.score, 100);
    assert.equal(res.tier, LEAD_TIERS.HOT);
  });

  // =========================================================================
  // PHẦN 4: VERIFY TÍCH HỢP CHATBOTENGINE (@verifier)
  // =========================================================================
  console.log("\n--- 4. Kiểm thử Tích Hợp Toàn Bộ Vào ChatBotEngine (@verifier) ---");

  await testCaseAsync("4.1 ChatBotEngine: Phát hiện khách cáu gắt -> Auto-handover & Xoa dịu thương hiệu", async () => {
    const angryCustomer = {
      id: "cust_angry_verifier_999",
      fullName: "Nguyễn Văn Bực",
      phone: "0909999888",
      threadId: "cust_angry_verifier_999",
    };
    const reply = await generateHumanLikeReply({
      customerMessage: "Bọn lừa đảo, tao trả tiền rồi mà nuốt luôn, bố mày gọi công an bắt chúng mày!",
      customerProfile: angryCustomer,
      conversationHistory: [],
    });

    assert.equal(reply.handoverTriggered, true, "handoverTriggered phải là true");
    assert.equal(reply.requiresHandover, true, "requiresHandover phải là true");
    assert.ok(reply.sentimentAlert, "Phải có sentimentAlert");
    assert.ok(reply.replyText.includes("em xin lỗi"), "Câu trả lời phải có lời xin lỗi xoa dịu");
    assert.ok(reply.leadScore, "Lead score phải được tính toán");
    assert.ok(reply.autoTags.includes("KHACH_CAU_GAT"), "autoTags phải có KHACH_CAU_GAT");
  });

  await testCaseAsync("4.2 ChatBotEngine: Khách hỏi tư vấn bình thường -> Tính Lead Scoring + Áp dụng Prompt Caching", async () => {
    const normalCustomer = {
      id: "cust_normal_verifier_777",
      fullName: "Bác Trần Đình Lâm",
      phone: "0912888999",
      threadId: "cust_normal_verifier_777",
    };
    const reply = await generateHumanLikeReply({
      customerMessage: "Tôi bị tiểu đường 5 năm nay, đường huyết 9.8 và hay bị tê buồn chân tay, sữa Glucare Plus giá bao nhiêu tiền một hộp?",
      customerProfile: normalCustomer,
      conversationHistory: [],
    });

    assert.equal(reply.handoverTriggered, undefined, "Khách bình thường không được handover");
    assert.ok(reply.replyText.length > 10, "Phải có câu trả lời tư vấn hữu ích");
    // Lead scoring
    assert.ok(reply.leadScore, "Phải trả về leadScore");
    assert.equal(reply.leadTier, LEAD_TIERS.WARM, `Khách hỏi bệnh lý + giá phải là WARM (thực tế: ${reply.leadTier})`);
    assert.equal(reply.suggestedAction, LEAD_ACTIONS.WARM);
    // Sentiment
    assert.ok(reply.sentiment, "Phải có kết quả sentiment");
    assert.equal(reply.sentiment.status, SENTIMENT_LEVELS.NEUTRAL);
    // Prompt Cache
    assert.ok(reply.systemPrompt.includes("BÁC SĨ TƯ VẤN Y KHOA"), "System prompt phải chứa Senior Doctor static prefix");
    assert.ok(reply.systemPrompt.includes("QUY TẮC ĂN ĐẢO NGƯỢC"), "System prompt phải chứa phác đồ ăn đảo ngược");
  });

  console.log("\n" + "=".repeat(80));
  console.log(`🎯 KẾT QUẢ TỔNG THỂ BỘ KIỂM THỬ: ${passedCount} PASS, ${failedCount} FAIL`);
  console.log("=".repeat(80));

  if (failedCount > 0) {
    process.exit(1);
  }
}

runAllVerificationTests().catch((err) => {
  console.error("Unhandled verification error:", err);
  process.exit(1);
});
