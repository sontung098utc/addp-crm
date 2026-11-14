/**
 * Test & Verification script for AI Lead Scoring (Feature 3)
 */

import { evaluateLeadScore, LEAD_TIERS, LEAD_ACTIONS, SCORING_WEIGHTS } from "../src/lib/ai/leadScorer.js";
import {
  saveLeadScore,
  getLeadScore,
  getAllLeadScores,
  recalculateAndSaveLeadScore,
  getLeadScoresSummary,
  _resetLeadScoresStoreForTest,
} from "../src/lib/ai/leadScoreStore.js";
import { getCustomerById, getAllCustomers } from "../src/lib/customerIdentityResolver.js";

let passedCount = 0;
let failedCount = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passedCount++;
  } else {
    console.error(`  [FAIL] ${testName}`);
    failedCount++;
  }
}

async function runTests() {
  console.log("=== BẮT ĐẦU KIỂM THỬ AI LEAD SCORING ===");

  // 1. Kiểm tra trường hợp rỗng
  console.log("\n1. Test trường hợp rỗng / lời chào đơn thuần:");
  const emptyRes = evaluateLeadScore({ messages: "" });
  assert(emptyRes.score === 0, "Điểm rỗng phải là 0");
  assert(emptyRes.tier === LEAD_TIERS.COLD, "Phân hạng phải là COLD");
  assert(emptyRes.suggestedAction === LEAD_ACTIONS.COLD, "Action phải là 'Gửi thực đơn miễn phí'");

  const greetingRes = evaluateLeadScore({ messages: ["Chào shop", "Alo shop ơi"] });
  assert(greetingRes.score === 0, "Lời chào thông thường điểm = 0");
  assert(greetingRes.tier === LEAD_TIERS.COLD, "Lời chào thông thường phân hạng COLD");

  // 2. Test Tiêu chí 1: Sickness urgency (+25 điểm)
  console.log("\n2. Test Tiêu chí Bệnh lý & Triệu chứng cấp thiết (+25 điểm):");
  const sicknessRes = evaluateLeadScore({
    messages: ["Tôi bị đái tháo đường 8 chấm 5, dạo này sụt 3 cân và bị tê bì chân tay"],
  });
  assert(sicknessRes.score === 25, `Điểm phải là 25 (thực tế: ${sicknessRes.score})`);
  assert(sicknessRes.tier === LEAD_TIERS.COLD, "25 điểm thuộc hạng COLD (<50)");
  assert(sicknessRes.breakdown.sickness.matched === true, "Breakdown sickness phải matched");
  assert(sicknessRes.breakdown.sickness.score === 25, "Breakdown sickness score = 25");

  // 3. Test Tiêu chí 2: Product & pricing inquiry (+30 điểm)
  console.log("\n3. Test Tiêu chí Hỏi giá & Sản phẩm (+30 điểm):");
  const pricingRes = evaluateLeadScore({
    messages: ["Giá một hộp sữa Glucare Plus bao nhiêu tiền em? Có khuyến mãi gì không?"],
  });
  assert(pricingRes.score === 30, `Điểm phải là 30 (thực tế: ${pricingRes.score})`);
  assert(pricingRes.tier === LEAD_TIERS.COLD, "30 điểm thuộc hạng COLD (<50)");
  assert(pricingRes.breakdown.productPricing.matched === true, "Breakdown productPricing matched");

  // 4. Test Sickness + Product inquiry (25 + 30 = 55 điểm -> WARM)
  console.log("\n4. Test Bệnh lý + Hỏi giá (25 + 30 = 55 -> WARM):");
  const warmRes = evaluateLeadScore({
    messages: [
      { text: "Bác bị tiểu đường tuýp 2 mười năm nay rồi, đường huyết toàn 9 phẩy" },
      { text: "Sữa này uống bao lâu thì có hiệu quả? Một liệu trình 3 hộp giá bao nhiêu?" },
    ],
  });
  assert(warmRes.score === 55, `Điểm phải là 55 (thực tế: ${warmRes.score})`);
  assert(warmRes.tier === LEAD_TIERS.WARM, "55 điểm thuộc hạng WARM (50-79)");
  assert(warmRes.suggestedAction === LEAD_ACTIONS.WARM, "Hành động gợi ý phải là 'Tư vấn thêm liệu trình'");

  // 5. Test Tiêu chí 3: Contact & logistics intent (+35 điểm)
  console.log("\n5. Test Tiêu chí Liên hệ & Giao nhận (+35 điểm):");
  const contactRes = evaluateLeadScore({
    messages: ["Ship về số 45 ngõ 10 Đội Cấn Ba Đình Hà Nội, gọi số 0912345678 cho tôi nhé"],
  });
  assert(contactRes.score === 35, `Điểm phải là 35 (thực tế: ${contactRes.score})`);
  assert(contactRes.breakdown.contactLogistics.matched === true, "Contact logistics matched");

  // 6. Test Khách hàng HOT (Bệnh lý 25 + Hỏi giá 30 + Đặt hàng/SĐT 35 = 90 điểm -> HOT)
  console.log("\n6. Test Khách hàng HOT (25 + 30 + 35 = 90 -> HOT):");
  const hotSample = [
    "Tôi bị tiểu đường 8 phẩy 2, hay bị tê chân và tiểu đêm",
    "Hộp Glucare bao nhiêu tiền vậy em? Có được freeship không?",
    "Gửi cho tôi 2 hộp về số 15 Lê Lợi, TP Vinh, Nghệ An. SĐT 0988776655, giao hàng kiểm tra thanh toán COD nhé",
  ];
  const hotRes = evaluateLeadScore({ messages: hotSample });
  assert(hotRes.score === 90, `Điểm phải là 90 (thực tế: ${hotRes.score})`);
  assert(hotRes.tier === LEAD_TIERS.HOT, "90 điểm thuộc hạng HOT (>=80)");
  assert(hotRes.suggestedAction === LEAD_ACTIONS.HOT, "Hành động gợi ý phải là 'Tạo đơn ngay'");
  assert(hotRes.factors.length === 3, "Phải có 3 yếu tố thúc đẩy");

  // 7. Test Đầy đủ 4 tiêu chí kể cả Do dự (25 + 30 + 35 + 10 = 100 điểm -> HOT)
  console.log("\n7. Test Đầy đủ 4 tiêu chí (25 + 30 + 35 + 10 = 100 -> HOT):");
  const allFourSample = [
    "Tôi bị đái tháo đường sụt 4 cân, đường huyết 9.0",
    "Báo giá một liệu trình sữa hạt tiểu đường nhé",
    "Giá hơi cao nhưng thôi ship cho tôi về số 10 Cầu Giấy Hà Nội, SĐT 0901234567",
  ];
  const maxRes = evaluateLeadScore({ messages: allFourSample });
  assert(maxRes.score === 100, `Điểm tối đa là 100 (thực tế: ${maxRes.score})`);
  assert(maxRes.tier === LEAD_TIERS.HOT, "100 điểm là HOT");
  assert(maxRes.breakdown.objectionHesitation.matched === true, "Objection matched (giá hơi cao)");

  // 8. Test Metadata khách hàng (Pathology, MedicalRecord, Tags, Phone, Address)
  console.log("\n8. Test Chấm điểm kết hợp Metadata khách hàng:");
  const customerMeta = {
    id: 9999,
    fullName: "Nguyễn Văn Test",
    phone: "0934567890",
    pathology: "Tiểu đường tuýp 2, men gan cao",
    currentGlucose: "8.8",
    address: "Số 123 Phố Huế, Hai Bà Trưng, Hà Nội",
    totalOrders: 1,
    tags: ["#TieuDuong", "#CanTuVan"],
  };
  const metaRes = evaluateLeadScore({
    customer: customerMeta,
    messages: ["Sữa này uống ngày mấy lần em?"],
  });
  // Sickness (+25 từ pathology/glucose/tags) + Product inquiry (+30 từ messages/tags) + Contact/Address (+35 từ phone+address) = 90
  assert(metaRes.score >= 80, `Điểm kết hợp metadata đạt HOT (thực tế: ${metaRes.score})`);
  assert(metaRes.tier === LEAD_TIERS.HOT, "Phân loại HOT");

  // 9. Test LeadScoreStore: Lưu trữ, Truy xuất & Đồng bộ CustomerStore
  console.log("\n9. Test leadScoreStore (Lưu, đọc, cập nhật khách hàng):");
  _resetLeadScoresStoreForTest();

  // Tìm 1 khách hàng có sẵn trong hệ thống
  const allCustomers = getAllCustomers();
  const testCustomer = allCustomers.length > 0 ? allCustomers[0] : { id: 1001, fullName: "Khách Mẫu", phone: "0912345678" };

  const saved = saveLeadScore(testCustomer.id, hotRes, {
    customerName: testCustomer.fullName,
    phone: testCustomer.phone,
  });

  assert(saved.score === 90, "Điểm lưu phải là 90");
  assert(saved.tier === LEAD_TIERS.HOT, "Tier lưu phải là HOT");

  const fetched = getLeadScore(testCustomer.id);
  assert(fetched !== null, "Phải lấy được lead score từ store");
  assert(fetched.score === 90, "Điểm lấy ra đúng 90");
  assert(fetched.tier === LEAD_TIERS.HOT, "Tier lấy ra đúng HOT");

  // Kiểm tra customerStore xem đã được update chưa
  const updatedCust = getCustomerById(testCustomer.id);
  if (updatedCust) {
    assert(updatedCust.leadScore === 90, "CustomerStore phải cập nhật leadScore = 90");
    assert(updatedCust.leadTier === LEAD_TIERS.HOT, "CustomerStore phải cập nhật leadTier = HOT");
    assert(Array.isArray(updatedCust.tags) && updatedCust.tags.includes("#Lead_HOT"), "Customer tags phải có #Lead_HOT");
  }

  // 10. Test recalculateAndSaveLeadScore
  console.log("\n10. Test recalculateAndSaveLeadScore:");
  const recalcRes = recalculateAndSaveLeadScore(testCustomer.id, [
    "Tôi chỉ muốn hỏi thực đơn thôi, chưa mua đâu",
  ]);
  assert(recalcRes.ok === true, "Recalculate thành công");
  assert(recalcRes.leadScore.score < 50, `Điểm sau tính lại phải là COLD (thực tế: ${recalcRes.leadScore.score})`);
  assert(recalcRes.leadScore.tier === LEAD_TIERS.COLD, "Tier tính lại là COLD");

  // 11. Test getAllLeadScores & getLeadScoresSummary
  console.log("\n11. Test thống kê & bộ lọc getAllLeadScores:");
  const listAll = getAllLeadScores();
  assert(listAll.total >= 1, "Tổng số lead scores >= 1");
  assert(listAll.summary.totalCount >= 1, "Summary totalCount >= 1");

  const filteredCold = getAllLeadScores({ tier: "COLD" });
  assert(filteredCold.scores.every((s) => s.tier === "COLD"), "Bộ lọc tier=COLD hoạt động chính xác");

  console.log("\n=== TỔNG KẾT KIỂM THỬ ===");
  console.log(`Thành công: ${passedCount} bài test`);
  console.log(`Thất bại: ${failedCount} bài test`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("LỖI NGOẠI LỆ KHI CHẠY TEST:", err);
  process.exit(1);
});
