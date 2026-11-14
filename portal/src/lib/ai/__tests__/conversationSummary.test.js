import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_PATHOLOGY,
  EMPTY_DEMAND,
  EMPTY_CONCERNS,
  buildGroundedFallbackSummary,
  generateGroundedConversationSummary,
} from "../conversationSummary.js";

test("1. Hội thoại rỗng: KHÔNG bịa đặt bệnh lý/sản phẩm/băn khoăn", async () => {
  const res = await generateGroundedConversationSummary({
    messages: [],
    customer: { name: "Lan" },
    useLlm: false,
  });

  assert.equal(res.pathology, EMPTY_PATHOLOGY);
  assert.equal(res.demand, EMPTY_DEMAND);
  assert.equal(res.concerns, EMPTY_CONCERNS);
  assert.ok(!/glucare|tiểu đường|mất ngủ/i.test(res.closing_script));
  assert.ok(res.closing_script.includes("chào"));
});

test("2. Hội thoại chỉ chào hỏi ('Chào em', 'Alo'): trả về 'Chưa có thông tin...' cho 3 mục đầu & câu hỏi mở cho mục 4", async () => {
  const res = await generateGroundedConversationSummary({
    messages: [
      { isMe: false, text: "Alo" },
      { isMe: false, text: "Chào em" },
      { isMe: true, text: "Dạ em chào chị ạ" },
    ],
    customer: {
      name: "Nguyễn Thị Hoa",
      pathology: "Dữ liệu CRM cũ không được tự bịa vào hội thoại",
    },
    useLlm: false,
  });

  assert.equal(res.pathology, EMPTY_PATHOLOGY);
  assert.equal(res.demand, EMPTY_DEMAND);
  assert.equal(res.concerns, EMPTY_CONCERNS);
  assert.ok(!/glucare|tiểu đường|mất ngủ/i.test(res.closing_script));
  assert.ok(res.closing_script.length > 10);
});

test("3. Hội thoại thực tế ('mẹ cô bị tiểu đường 8 chấm, hay mất ngủ, hỏi giá sữa hạt'): trích xuất đúng sự thật, không thêm chi tiết ảo", async () => {
  const res = await generateGroundedConversationSummary({
    messages: [
      {
        isMe: false,
        text: "Em ơi mẹ cô bị tiểu đường 8 chấm, hay mất ngủ, hỏi giá sữa hạt bên mình bao nhiêu?",
      },
    ],
    customer: { name: "Cô Mai" },
    useLlm: false,
  });

  assert.match(res.pathology, /tiểu đường/i);
  assert.match(res.pathology, /8\.0 mmol\/L/);
  assert.match(res.pathology, /mất ngủ/i);
  assert.ok(!/tê bì|tiểu đêm/i.test(res.pathology));

  assert.match(res.demand, /Sữa hạt/i);
  assert.ok(!/Glucare Plus/i.test(res.demand));

  assert.match(res.concerns, /giá/i);
  assert.ok(!/vị ngọt|cách pha/i.test(res.concerns));

  assert.match(res.closing_script, /Sữa hạt/i);
  assert.ok(!/Glucare Plus/i.test(res.closing_script));
});

test("4. Gọi LLM với temperature = 0.1 và parse JSON chuẩn xác", async () => {
  let capturedArgs = null;
  const mockLlmCaller = async (args) => {
    capturedArgs = args;
    return {
      ok: true,
      provider: "openai",
      reply: JSON.stringify({
        pathology: "Mẹ khách bị tiểu đường (8.0 mmol/L), hay mất ngủ.",
        demand: "Quan tâm sữa hạt.",
        concerns: "Hỏi giá bán sữa hạt.",
        closing_script: "Dạ em gửi cô bảng giá sữa hạt bên em để mình tham khảo cho bác ạ.",
      }),
    };
  };

  const res = await generateGroundedConversationSummary({
    messages: [
      {
        isMe: false,
        text: "Mẹ cô bị tiểu đường 8 chấm, hay mất ngủ, hỏi giá sữa hạt",
      },
    ],
    customer: { name: "Cô Mai" },
    useLlm: true,
    llmCaller: mockLlmCaller,
  });

  assert.equal(capturedArgs.temperature, 0.1);
  assert.match(capturedArgs.systemPrompt, /CHỐNG BỊA ĐẶT/i);
  assert.equal(res.pathology, "Mẹ khách bị tiểu đường (8.0 mmol/L), hay mất ngủ.");
  assert.equal(res.demand, "Quan tâm sữa hạt.");
  assert.equal(res.concerns, "Hỏi giá bán sữa hạt.");
  assert.equal(res.source, "llm:openai");
});

test("5. Khi LLM lỗi hoặc timeout: fallback vẫn grounded, không trả về dữ liệu giả", async () => {
  const failingLlmCaller = async () => {
    throw new Error("Simulated network error");
  };

  const res = await generateGroundedConversationSummary({
    messages: [{ isMe: false, text: "Alo shop ơi" }],
    customer: { name: "Minh" },
    useLlm: true,
    llmCaller: failingLlmCaller,
  });

  assert.equal(res.pathology, EMPTY_PATHOLOGY);
  assert.equal(res.demand, EMPTY_DEMAND);
  assert.equal(res.concerns, EMPTY_CONCERNS);
  assert.equal(res.source, "fallback-grounded");
  assert.ok(!/Glucare Plus|7\.0 - 7\.5/i.test(JSON.stringify(res)));
});

test("6. buildGroundedFallbackSummary xử lý tin nhắn phủ định ('không bị tiểu đêm')", () => {
  const res = buildGroundedFallbackSummary({
    messages: [{ isMe: false, text: "Chú không bị tiểu đêm, chỉ hỏi sữa hạt thôi" }],
    customer: { name: "Chú Hùng" },
  });

  assert.equal(res.pathology, EMPTY_PATHOLOGY);
  assert.match(res.demand, /Sữa hạt/i);
  assert.equal(res.concerns, EMPTY_CONCERNS);
});
