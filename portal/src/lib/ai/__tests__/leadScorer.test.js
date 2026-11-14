import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateLeadScore,
  LEAD_TIERS,
  LEAD_ACTIONS,
  SCORING_WEIGHTS,
} from "../leadScorer.js";
import {
  saveLeadScore,
  getLeadScore,
  getAllLeadScores,
  recalculateAndSaveLeadScore,
  getLeadScoresSummary,
  _resetLeadScoresStoreForTest,
} from "../leadScoreStore.js";
import { getCustomerById, getAllCustomers } from "../../customerIdentityResolver.js";

test("1. LeadScorer: Xử lý chuỗi rỗng và lời chào thông thường (Score = 0, Tier = COLD)", () => {
  const emptyRes = evaluateLeadScore({ messages: "" });
  assert.equal(emptyRes.score, 0);
  assert.equal(emptyRes.tier, LEAD_TIERS.COLD);
  assert.equal(emptyRes.suggestedAction, LEAD_ACTIONS.COLD);
  assert.equal(emptyRes.factors.length, 0);

  const greetingRes = evaluateLeadScore({
    messages: ["Chào shop ạ", "Alo có ai trực không?"],
  });
  assert.equal(greetingRes.score, 0);
  assert.equal(greetingRes.tier, LEAD_TIERS.COLD);
});

test("2. LeadScorer: Tiêu chí Bệnh lý & Triệu chứng cấp thiết (+25 điểm)", () => {
  const sicknessRes = evaluateLeadScore({
    messages: ["Tôi bị đái tháo đường 8 chấm 5, dạo này sụt 3 cân và bị tê bì chân tay"],
  });
  assert.equal(sicknessRes.score, 25);
  assert.equal(sicknessRes.tier, LEAD_TIERS.COLD);
  assert.equal(sicknessRes.breakdown.sickness.matched, true);
  assert.equal(sicknessRes.breakdown.sickness.score, 25);
  assert.ok(sicknessRes.factors[0].includes("Bệnh lý & triệu chứng"));
});

test("3. LeadScorer: Tiêu chí Hỏi giá & Khuyến mãi (+30 điểm)", () => {
  const pricingRes = evaluateLeadScore({
    messages: ["Giá một hộp sữa Glucare Plus bao nhiêu tiền em? Có khuyến mãi gì không?"],
  });
  assert.equal(pricingRes.score, 30);
  assert.equal(pricingRes.tier, LEAD_TIERS.COLD);
  assert.equal(pricingRes.breakdown.productPricing.matched, true);
  assert.equal(pricingRes.breakdown.productPricing.score, 30);
  assert.ok(pricingRes.factors[0].includes("Tìm hiểu sản phẩm & giá cả"));
});

test("4. LeadScorer: Khách hàng WARM (Bệnh lý 25 + Hỏi giá 30 = 55 điểm)", () => {
  const warmRes = evaluateLeadScore({
    messages: [
      { text: "Bác bị tiểu đường tuýp 2 mười năm nay rồi, đường huyết toàn 9 phẩy" },
      { text: "Sữa này uống bao lâu thì có hiệu quả? Một liệu trình 3 hộp giá bao nhiêu?" },
    ],
  });
  assert.equal(warmRes.score, 55);
  assert.equal(warmRes.tier, LEAD_TIERS.WARM);
  assert.equal(warmRes.suggestedAction, LEAD_ACTIONS.WARM);
  assert.equal(warmRes.factors.length, 2);
});

test("5. LeadScorer: Tiêu chí Liên hệ & Giao nhận (+35 điểm)", () => {
  const contactRes = evaluateLeadScore({
    messages: ["Ship về số 45 ngõ 10 Đội Cấn Ba Đình Hà Nội, gọi số 0912345678 cho tôi nhé"],
  });
  assert.equal(contactRes.score, 35);
  assert.equal(contactRes.tier, LEAD_TIERS.COLD);
  assert.equal(contactRes.breakdown.contactLogistics.matched, true);
  assert.equal(contactRes.breakdown.contactLogistics.score, 35);
});

test("6. LeadScorer: Khách hàng HOT (Bệnh lý 25 + Hỏi giá 30 + Đặt hàng 35 = 90 điểm)", () => {
  const hotSample = [
    "Tôi bị tiểu đường 8 phẩy 2, hay bị tê chân và tiểu đêm",
    "Hộp Glucare bao nhiêu tiền vậy em? Có được freeship không?",
    "Gửi cho tôi 2 hộp về số 15 Lê Lợi, TP Vinh, Nghệ An. SĐT 0988776655, giao hàng kiểm tra thanh toán COD nhé",
  ];
  const hotRes = evaluateLeadScore({ messages: hotSample });
  assert.equal(hotRes.score, 90);
  assert.equal(hotRes.tier, LEAD_TIERS.HOT);
  assert.equal(hotRes.suggestedAction, LEAD_ACTIONS.HOT);
  assert.equal(hotRes.factors.length, 3);
});

test("7. LeadScorer: Đầy đủ 4 tiêu chí kể cả Do dự (25 + 30 + 35 + 10 = 100 điểm)", () => {
  const maxSample = [
    "Tôi bị đái tháo đường sụt 4 cân, đường huyết 9.0",
    "Báo giá một liệu trình sữa hạt tiểu đường nhé",
    "Giá hơi cao nhưng thôi ship cho tôi về số 10 Cầu Giấy Hà Nội, SĐT 0901234567",
  ];
  const maxRes = evaluateLeadScore({ messages: maxSample });
  assert.equal(maxRes.score, 100);
  assert.equal(maxRes.tier, LEAD_TIERS.HOT);
  assert.equal(maxRes.breakdown.objectionHesitation.matched, true);
  assert.equal(maxRes.breakdown.objectionHesitation.score, 10);
});

test("8. LeadScorer: Kết hợp dữ liệu Metadata khách hàng (Pathology, Glucose, Phone, Address)", () => {
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
  assert.ok(metaRes.score >= 80, `Điểm phải >= 80 (thực tế: ${metaRes.score})`);
  assert.equal(metaRes.tier, LEAD_TIERS.HOT);
});

test("9. LeadScoreStore: Lưu trữ, truy xuất & Đồng bộ CustomerStore", () => {
  _resetLeadScoresStoreForTest();
  const allCustomers = getAllCustomers();
  const testCustomer = allCustomers.length > 0 ? allCustomers[0] : { id: 1001, fullName: "Khách Mẫu", phone: "0912345678" };

  const hotScore = {
    score: 90,
    tier: LEAD_TIERS.HOT,
    factors: ["Bệnh lý cấp thiết (+25 điểm)", "Hỏi giá liệu trình (+30 điểm)", "Cung cấp địa chỉ & SĐT (+35 điểm)"],
    suggestedAction: LEAD_ACTIONS.HOT,
    breakdown: {},
    evaluatedAt: new Date().toISOString(),
  };

  const saved = saveLeadScore(testCustomer.id, hotScore, {
    customerName: testCustomer.fullName,
    phone: testCustomer.phone,
  });

  assert.equal(saved.score, 90);
  assert.equal(saved.tier, LEAD_TIERS.HOT);

  const fetched = getLeadScore(testCustomer.id);
  assert.ok(fetched !== null);
  assert.equal(fetched.score, 90);
  assert.equal(fetched.tier, LEAD_TIERS.HOT);

  const updatedCust = getCustomerById(testCustomer.id);
  if (updatedCust) {
    assert.equal(updatedCust.leadScore, 90);
    assert.equal(updatedCust.leadTier, LEAD_TIERS.HOT);
    assert.ok(Array.isArray(updatedCust.tags));
    assert.ok(updatedCust.tags.includes("#Lead_HOT"));
  }
});

test("10. LeadScoreStore: recalculateAndSaveLeadScore cập nhật lại điểm số", () => {
  const allCustomers = getAllCustomers();
  const testCustomerId = allCustomers.length > 0 ? allCustomers[0].id : 1001;

  const recalcRes = recalculateAndSaveLeadScore(testCustomerId, [
    "Tôi chỉ xin tài liệu thôi nhé",
  ]);
  assert.equal(recalcRes.ok, true);
  assert.ok(recalcRes.leadScore.score < 50);
  assert.equal(recalcRes.leadScore.tier, LEAD_TIERS.COLD);
});

test("11. LeadScoreStore: getAllLeadScores và getLeadScoresSummary", () => {
  const listAll = getAllLeadScores();
  assert.ok(listAll.total >= 1);
  assert.ok(listAll.summary.totalCount >= 1);

  const summary = getLeadScoresSummary();
  assert.ok(typeof summary.totalCount === "number");
  assert.ok(typeof summary.hotCount === "number");
  assert.ok(typeof summary.warmCount === "number");
  assert.ok(typeof summary.coldCount === "number");
});
