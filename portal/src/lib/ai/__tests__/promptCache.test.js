import test from "node:test";
import assert from "node:assert/strict";
import {
  SENIOR_DOCTOR_STATIC_PREFIX,
  ANTHROPIC_CACHE_CONTROL,
  MODEL_CACHE_PRICING,
  estimateTokens,
  buildDeterministicPrompt,
  calculateTokenSavings,
  recordCacheEvent,
  getCacheStats,
  resetCacheStats,
} from "../promptCache.js";
import {
  getAiSettings,
  saveAiSettings,
} from "../aiRouter.js";

test("1. SENIOR_DOCTOR_STATIC_PREFIX phải vượt ngưỡng 1,024 tokens", () => {
  const tokenCount = estimateTokens(SENIOR_DOCTOR_STATIC_PREFIX);
  assert.ok(
    tokenCount >= 1024,
    `Tiền tố tĩnh phải >= 1024 tokens để OpenAI và Anthropic tự động cache (thực tế: ${tokenCount} tokens)`
  );
  assert.ok(
    SENIOR_DOCTOR_STATIC_PREFIX.includes("BÁC SĨ"),
    "Tiền tố phải có vai trò Bác sĩ 10 năm kinh nghiệm"
  );
  assert.ok(
    SENIOR_DOCTOR_STATIC_PREFIX.includes("QUY TẮC ĂN ĐẢO NGƯỢC"),
    "Tiền tố phải chứa phác đồ ăn đảo ngược"
  );
  assert.ok(
    SENIOR_DOCTOR_STATIC_PREFIX.includes("GLUCARE PLUS"),
    "Tiền tố phải chứa thông tin Sữa hạt Glucare Plus"
  );
});

test("2. Cấu trúc Prompt tất định (Deterministic Prompt Structure) - Thứ tự bảo toàn tối ưu cache", () => {
  const ragDocs = [
    { id: "doc_b", title: "Phác đồ hạ đường 2", content: "Nội dung tài liệu B" },
    { id: "doc_a", title: "Phác đồ hạ đường 1", content: "Nội dung tài liệu A" },
  ];
  const customer360 = "Khách hàng: Nguyễn Văn A, SĐT: 0912345678, Đường huyết: 8.5 mmol/L";
  const accountContext = "Nhân viên: Bác sĩ Tuấn ADDP";
  const rules = "Luôn kết thúc bằng 1 câu hỏi mở.";
  const turns = [
    { role: "user", content: "Sữa này vị gì vậy bác sĩ?" },
    { role: "assistant", content: "Dạ sữa có vị thơm bùi tự nhiên từ hạt hạnh nhân và óc chó ạ." },
    { role: "user", content: "Tôi bị tiểu đường 5 năm rồi uống được không?" },
  ];

  const result = buildDeterministicPrompt({
    staticPrefix: SENIOR_DOCTOR_STATIC_PREFIX,
    ragDocs,
    customer360,
    accountContext,
    rules,
    conversationTurns: turns,
  });

  // Kiểm tra metrics
  assert.ok(result.metrics.isCacheEligible, "Prompt phải đủ điều kiện cache (>1024 tokens)");
  assert.ok(result.metrics.staticPrefixTokens >= 1024, "Static prefix tokens >= 1024");

  // Kiểm tra thứ tự trong fullSystemPrompt: Tiền tố tĩnh luôn đứng đầu
  const staticIndex = result.fullSystemPrompt.indexOf("=== BÁC SĨ TƯ VẤN Y KHOA");
  const ragIndex = result.fullSystemPrompt.indexOf("TÀI LIỆU THAM KHẢO 1: Phác đồ hạ đường 1");
  const customerIndex = result.fullSystemPrompt.indexOf("Nguyễn Văn A");

  assert.equal(staticIndex, 0, "Tiền tố tĩnh phải nằm ở vị trí index 0");
  assert.ok(ragIndex > staticIndex, "RAG docs phải nằm sau static prefix");
  assert.ok(customerIndex > ragIndex, "Customer 360 động phải nằm sau RAG docs");

  // Kiểm tra RAG docs được sắp xếp tất định theo id (doc_a trước doc_b)
  const posA = result.fullSystemPrompt.indexOf("Phác đồ hạ đường 1");
  const posB = result.fullSystemPrompt.indexOf("Phác đồ hạ đường 2");
  assert.ok(posA < posB, "RAG docs phải được sắp xếp tất định (A trước B)");
});

test("3. Hỗ trợ cấu trúc Anthropic cache_control { type: 'ephemeral' }", () => {
  const result = buildDeterministicPrompt({
    staticPrefix: SENIOR_DOCTOR_STATIC_PREFIX,
    customer360: "Khách: Lê Thị B",
  });

  assert.ok(Array.isArray(result.anthropicSystem), "Anthropic system phải là mảng");
  assert.equal(result.anthropicSystem[0].type, "text");
  assert.deepEqual(
    result.anthropicSystem[0].cache_control,
    ANTHROPIC_CACHE_CONTROL,
    "Khối tiền tố tĩnh đầu tiên phải có cache_control: { type: 'ephemeral' }"
  );
  assert.equal(result.anthropicSystem[0].cache_control.type, "ephemeral");
});

test("4. Hỗ trợ cấu trúc OpenAI Automatic Prefix Caching (Tách static prefix thành message 0 riêng biệt)", () => {
  const result = buildDeterministicPrompt({
    staticPrefix: SENIOR_DOCTOR_STATIC_PREFIX,
    customer360: "Khách: Trần Văn C",
    conversationTurns: [{ role: "user", content: "Chào bác sĩ" }],
  });

  assert.ok(Array.isArray(result.openAiSystemMessages), "openAiSystemMessages phải là mảng");
  assert.equal(result.openAiSystemMessages[0].role, "system");
  // Message 0 hoàn toàn tĩnh và > 1024 tokens
  const msg0Tokens = estimateTokens(result.openAiSystemMessages[0].content);
  assert.ok(
    msg0Tokens >= 1024,
    `Message 0 của OpenAI phải >= 1024 tokens để tự động cache (thực tế: ${msg0Tokens})`
  );

  // Message 1 chứa ngữ cảnh động của từng khách
  assert.equal(result.openAiSystemMessages[1].role, "system");
  assert.ok(
    result.openAiSystemMessages[1].content.includes("Trần Văn C"),
    "Message 1 phải chứa thông tin khách hàng"
  );

  // OpenAI messages tổng thể ghép đúng thứ tự
  assert.equal(result.openAiMessages[0], result.openAiSystemMessages[0]);
  assert.equal(result.openAiMessages[1], result.openAiSystemMessages[1]);
  assert.equal(result.openAiMessages[2].role, "user");
});

test("5. Tính toán chi phí và mức tiết kiệm (calculateTokenSavings) cho các model", () => {
  // Test gpt-4o-mini với 10,000 cached tokens
  const miniSavings = calculateTokenSavings({
    model: "gpt-4o-mini",
    cachedTokens: 10000,
    exchangeRate: 25400,
  });
  assert.equal(miniSavings.cachedTokens, 10000);
  assert.equal(miniSavings.savedUsd, 0.00075);
  assert.equal(miniSavings.savedVnd, Math.round(0.00075 * 25400));
  assert.equal(miniSavings.discountPercent, 50);

  // Test gpt-4o với 20,000 cached tokens
  const gpt4Savings = calculateTokenSavings({
    model: "gpt-4o",
    cachedTokens: 20000,
    exchangeRate: 25400,
  });
  assert.equal(gpt4Savings.savedUsd, 0.025);
  assert.equal(gpt4Savings.savedVnd, Math.round(0.025 * 25400));

  // Test claude-3-5-sonnet với 10,000 cached tokens (90% discount on cache read)
  const claudeSavings = calculateTokenSavings({
    model: "claude-3-5-sonnet-20241022",
    cachedTokens: 10000,
    exchangeRate: 25400,
  });
  assert.equal(claudeSavings.savedUsd, 0.027);
  assert.equal(claudeSavings.discountPercent, 90);

  // Test khi 0 tokens
  const zeroSavings = calculateTokenSavings({
    model: "gpt-4o-mini",
    cachedTokens: 0,
  });
  assert.equal(zeroSavings.savedUsd, 0);
  assert.equal(zeroSavings.savedVnd, 0);
});

test("6. Thống kê Cache Hit/Miss và tích lũy tiền tiết kiệm (recordCacheEvent & getCacheStats)", () => {
  resetCacheStats();

  // Sự kiện 1: Cache Miss (0 cached tokens)
  const ev1 = recordCacheEvent({
    provider: "openai",
    model: "gpt-4o-mini",
    promptTokens: 1500,
    cachedTokens: 0,
    completionTokens: 100,
  });
  assert.equal(ev1.isHit, false);
  assert.equal(ev1.cachedTokens, 0);

  // Sự kiện 2: Cache Hit (1200 cached tokens)
  const ev2 = recordCacheEvent({
    provider: "openai",
    model: "gpt-4o-mini",
    promptTokens: 1500,
    cachedTokens: 1200,
    completionTokens: 120,
  });
  assert.equal(ev2.isHit, true);
  assert.equal(ev2.cachedTokens, 1200);
  assert.ok(ev2.savedUsd > 0);

  // Sự kiện 3: Cache Hit trên Gemini (1400 cached tokens)
  const ev3 = recordCacheEvent({
    provider: "gemini",
    model: "gemini-2.5-flash",
    promptTokens: 1800,
    cachedTokens: 1400,
    completionTokens: 150,
  });
  assert.equal(ev3.isHit, true);

  const stats = getCacheStats();
  assert.equal(stats.totalRequests, 3, "Tổng số request phải là 3");
  assert.equal(stats.cacheHits, 2, "Số cache hit phải là 2");
  assert.equal(stats.cacheMisses, 1, "Số cache miss phải là 1");
  assert.equal(stats.hitRatePercent, 66.7, "Tỷ lệ hit phải là 66.7%");
  assert.equal(stats.totalCachedTokens, 2600, "Tổng cached tokens phải là 2600");
  assert.ok(stats.totalSavedUsd > 0, "Tổng USD tiết kiệm phải > 0");
  assert.ok(stats.totalSavedVnd > 0, "Tổng VNĐ tiết kiệm phải > 0");

  // Kiểm tra phân tách theo Provider
  assert.equal(stats.byProvider.openai.requests, 2);
  assert.equal(stats.byProvider.openai.hits, 1);
  assert.equal(stats.byProvider.gemini.requests, 1);
  assert.equal(stats.byProvider.gemini.hits, 1);

  // Reset thống kê
  resetCacheStats();
  const resetStats = getCacheStats();
  assert.equal(resetStats.totalRequests, 0);
  assert.equal(resetStats.cacheHits, 0);
  assert.equal(resetStats.totalCachedTokens, 0);
});

test("7. AI Router cấu hình và đồng bộ cài đặt AI", () => {
  const settings = getAiSettings({ maskSecrets: true });
  assert.ok(settings, "Cài đặt AI phải tồn tại");
  assert.ok("hasOpenaiKey" in settings, "Phải có trường hasOpenaiKey");
  assert.ok("hasAnthropicKey" in settings, "Phải có trường hasAnthropicKey");
  assert.ok("hasGeminiKey" in settings, "Phải có trường hasGeminiKey");
});

test("8. Trích xuất usage.prompt_tokens_details.cached_tokens chuẩn từ OpenAI response", () => {
  // Giả lập OpenAI response thực tế trả về từ OpenAI API
  const mockOpenAiResponse = {
    choices: [{ message: { role: "assistant", content: "Chào bác, cháu là chuyên viên tư vấn ADDP..." } }],
    usage: {
      prompt_tokens: 2150,
      completion_tokens: 85,
      total_tokens: 2235,
      prompt_tokens_details: {
        cached_tokens: 1920,
      },
    },
  };

  const cachedTokens = mockOpenAiResponse.usage.prompt_tokens_details.cached_tokens;
  assert.equal(cachedTokens, 1920, "Trích xuất đúng 1920 cached tokens từ OpenAI response");

  const savings = calculateTokenSavings({
    model: "gpt-4o-mini",
    cachedTokens,
    exchangeRate: 25400,
  });

  assert.ok(savings.savedUsd > 0);
  assert.ok(savings.savedVnd > 0);
  assert.equal(savings.discountPercent, 50);

  const event = recordCacheEvent({
    provider: "openai",
    model: "gpt-4o-mini",
    promptTokens: mockOpenAiResponse.usage.prompt_tokens,
    cachedTokens,
    completionTokens: mockOpenAiResponse.usage.completion_tokens,
  });

  assert.equal(event.isHit, true);
  assert.equal(event.cachedTokens, 1920);
});

test("9. Trích xuất cache_read_input_tokens từ Anthropic response và cachedContentTokenCount từ Gemini", () => {
  // Anthropic mock response
  const mockAnthropicUsage = {
    input_tokens: 230,
    output_tokens: 90,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 1850,
  };
  const anthropicCached = mockAnthropicUsage.cache_read_input_tokens;
  assert.equal(anthropicCached, 1850);
  const anthropicSavings = calculateTokenSavings({
    model: "claude-3-5-sonnet-20241022",
    cachedTokens: anthropicCached,
  });
  assert.equal(anthropicSavings.discountPercent, 90);

  // Gemini mock response
  const mockGeminiUsage = {
    promptTokenCount: 2000,
    candidatesTokenCount: 80,
    totalTokenCount: 2080,
    cachedContentTokenCount: 1500,
  };
  const geminiCached = mockGeminiUsage.cachedContentTokenCount;
  assert.equal(geminiCached, 1500);
  const geminiSavings = calculateTokenSavings({
    model: "gemini-2.5-flash",
    cachedTokens: geminiCached,
  });
  assert.equal(geminiSavings.discountPercent, 75);
});

