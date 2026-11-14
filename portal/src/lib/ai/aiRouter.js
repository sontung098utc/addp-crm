import fs from "fs";
import path from "path";
import {
  getLocalDataFilePath,
  runMariaDbSql,
  queryMariaDbJson,
  sqlEscape,
} from "../mariadbClient.js";
import {
  recordCacheEvent,
  calculateTokenSavings,
  estimateTokens,
  buildDeterministicPrompt,
  SENIOR_DOCTOR_STATIC_PREFIX,
  getCacheStats,
  resetCacheStats,
  ANTHROPIC_CACHE_CONTROL,
} from "./promptCache.js";

/**
 * ADDP Omnichannel AI CRM — AI Router với Prompt Caching Thông Minh
 * Hỗ trợ OpenAI GPT (tự động cache prefix >1024 tokens), Anthropic Claude (cache_control ephemeral)
 * và Google Gemini (Context Caching & Fallback).
 */

const DEFAULT_SETTINGS = {
  primaryProvider: "openai", // 'openai' | 'anthropic' | 'gemini'
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-20241022",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  updatedAt: null,
};

export function getAiSettings({ maskSecrets = false } = {}) {
  let settings = { ...DEFAULT_SETTINGS };

  // 1. Đọc từ file cục bộ nhanh
  try {
    const filePath = getLocalDataFilePath("ai_settings.json");
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
      settings = { ...settings, ...parsed };
    }
  } catch {}

  // 2. Fallback từ env nếu chưa có
  settings.openaiApiKey = settings.openaiApiKey || process.env.OPENAI_API_KEY || "";
  settings.anthropicApiKey = settings.anthropicApiKey || process.env.ANTHROPIC_API_KEY || "";
  settings.geminiApiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY || "";

  if (!maskSecrets) return settings;

  const mask = (k) => {
    const s = String(k || "").trim();
    if (!s) return "";
    if (s.length <= 10) return "****";
    return `${s.slice(0, 6)}...${s.slice(-4)}`;
  };

  return {
    ...settings,
    openaiApiKey: mask(settings.openaiApiKey),
    anthropicApiKey: mask(settings.anthropicApiKey),
    geminiApiKey: mask(settings.geminiApiKey),
    hasOpenaiKey: Boolean(settings.openaiApiKey),
    hasAnthropicKey: Boolean(settings.anthropicApiKey),
    hasGeminiKey: Boolean(settings.geminiApiKey),
  };
}

export function saveAiSettings(updates = {}) {
  const current = getAiSettings({ maskSecrets: false });
  const next = {
    ...current,
    primaryProvider: updates.primaryProvider || current.primaryProvider || "openai",
    openaiModel: updates.openaiModel || current.openaiModel || "gpt-4o-mini",
    anthropicModel: updates.anthropicModel || current.anthropicModel || "claude-3-5-haiku-20241022",
    geminiModel: updates.geminiModel || current.geminiModel || "gemini-2.5-flash",
    openaiApiKey:
      updates.openaiApiKey && !String(updates.openaiApiKey).includes("...")
        ? String(updates.openaiApiKey).trim()
        : current.openaiApiKey,
    anthropicApiKey:
      updates.anthropicApiKey && !String(updates.anthropicApiKey).includes("...")
        ? String(updates.anthropicApiKey).trim()
        : current.anthropicApiKey,
    geminiApiKey:
      updates.geminiApiKey && !String(updates.geminiApiKey).includes("...")
        ? String(updates.geminiApiKey).trim()
        : current.geminiApiKey,
    updatedAt: new Date().toISOString(),
  };

  // Lưu file cục bộ
  const filePath = getLocalDataFilePath("ai_settings.json");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2), "utf8");

  // Đồng bộ vào MariaDB 10.6 (nếu đã cấu hình)
  try {
    runMariaDbSql(
      `INSERT INTO ai_settings (id, settings_json) VALUES (1, ${sqlEscape(
        JSON.stringify(next)
      )}) ON DUPLICATE KEY UPDATE settings_json = ${sqlEscape(JSON.stringify(next))};`
    );
  } catch {}

  return getAiSettings({ maskSecrets: true });
}

export function syncAiSettingsFromMariaDb() {
  const res = queryMariaDbJson(
    `SELECT settings_json AS json FROM ai_settings WHERE id = 1 LIMIT 1;`
  );
  if (res.ok && res.rows[0]?.json) {
    try {
      const parsed = JSON.parse(res.rows[0].json);
      const filePath = getLocalDataFilePath("ai_settings.json");
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), "utf8");
      return parsed;
    } catch {}
  }
  return null;
}

/**
 * Gọi OpenAI Chat Completions với bảo toàn thứ tự tiền tố (Prompt Prefix Order)
 * và tự động trích xuất cached_tokens từ usage.prompt_tokens_details
 */
async function callOpenAiChat({
  apiKey,
  model,
  systemPrompt,
  systemMessages,
  messages,
  temperature,
  maxTokens,
}) {
  const targetModel = model || "gpt-4o-mini";
  const startTime = Date.now();

  // Chuẩn bị danh sách messages bảo toàn thứ tự: Tiền tố tĩnh luôn đứng đầu
  let finalMessages = [];
  if (Array.isArray(systemMessages) && systemMessages.length > 0) {
    finalMessages = [...systemMessages, ...messages];
  } else if (systemPrompt) {
    finalMessages = [{ role: "system", content: systemPrompt }, ...messages];
  } else {
    finalMessages = [...messages];
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: targetModel,
      temperature: temperature ?? 0.6,
      max_tokens: maxTokens ?? 500,
      messages: finalMessages,
    }),
    signal: AbortSignal.timeout(25000),
  });

  const data = await res.json();
  const durationMs = Date.now() - startTime;

  if (!res.ok) {
    throw new Error(data?.error?.message || `OpenAI HTTP ${res.status}`);
  }

  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenAI trả về nội dung rỗng.");

  // Trích xuất usage và cached_tokens chuẩn của OpenAI
  const usage = data?.usage || {};
  const promptTokens = Number(usage.prompt_tokens || 0);
  const completionTokens = Number(usage.completion_tokens || 0);
  const promptDetails = usage.prompt_tokens_details || {};
  const cachedTokens = Number(promptDetails.cached_tokens || 0);

  // Tính số tiền thực tế tiết kiệm được
  const savings = calculateTokenSavings({
    model: targetModel,
    provider: "openai",
    cachedTokens,
  });

  // Ghi nhận vào thống kê
  recordCacheEvent({
    provider: "openai",
    model: targetModel,
    promptTokens,
    cachedTokens,
    completionTokens,
    durationMs,
  });

  return {
    ok: true,
    text,
    providerUsed: "openai",
    modelUsed: targetModel,
    usage: {
      promptTokens,
      cachedTokens,
      completionTokens,
      totalTokens: Number(usage.total_tokens || promptTokens + completionTokens),
      cacheHit: cachedTokens > 0,
      savedUsd: savings.savedUsd,
      savedVnd: savings.savedVnd,
      savedUsdFormatted: savings.savedUsdFormatted,
      savedVndFormatted: savings.savedVndFormatted,
    },
  };
}

/**
 * Gọi Anthropic Messages API với cấu trúc cache_control: { type: 'ephemeral' }
 * và trích xuất cache_read_input_tokens
 */
async function callAnthropicChat({
  apiKey,
  model,
  systemPrompt,
  anthropicSystem,
  messages,
  temperature,
  maxTokens,
}) {
  const targetModel = model || "claude-3-5-haiku-20241022";
  const startTime = Date.now();

  // Chuẩn bị System Prompt với cache_control
  let systemPayload = null;
  if (Array.isArray(anthropicSystem) && anthropicSystem.length > 0) {
    systemPayload = anthropicSystem;
  } else if (systemPrompt) {
    systemPayload = [
      {
        type: "text",
        text: systemPrompt,
        cache_control: ANTHROPIC_CACHE_CONTROL,
      },
    ];
  }

  // Chuẩn hóa messages cho Anthropic (role: 'user' | 'assistant')
  const formattedMessages = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role,
      content: String(m.content || ""),
    }));

  const body = {
    model: targetModel,
    max_tokens: maxTokens ?? 500,
    temperature: temperature ?? 0.6,
    messages: formattedMessages,
    ...(systemPayload ? { system: systemPayload } : {}),
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "prompt-caching-2024-07-31",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });

  const data = await res.json();
  const durationMs = Date.now() - startTime;

  if (!res.ok) {
    throw new Error(data?.error?.message || `Anthropic HTTP ${res.status}`);
  }

  const text = data?.content?.[0]?.text?.trim();
  if (!text) throw new Error("Anthropic trả về nội dung rỗng.");

  const usage = data?.usage || {};
  const cachedTokens = Number(usage.cache_read_input_tokens || 0);
  const cacheCreatedTokens = Number(usage.cache_creation_input_tokens || 0);
  const inputTokens = Number(usage.input_tokens || 0);
  const promptTokens = inputTokens + cacheCreatedTokens + cachedTokens;
  const completionTokens = Number(usage.output_tokens || 0);

  const savings = calculateTokenSavings({
    model: targetModel,
    provider: "anthropic",
    cachedTokens,
  });

  recordCacheEvent({
    provider: "anthropic",
    model: targetModel,
    promptTokens,
    cachedTokens,
    completionTokens,
    durationMs,
  });

  return {
    ok: true,
    text,
    providerUsed: "anthropic",
    modelUsed: targetModel,
    usage: {
      promptTokens,
      cachedTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      cacheHit: cachedTokens > 0,
      savedUsd: savings.savedUsd,
      savedVnd: savings.savedVnd,
      savedUsdFormatted: savings.savedUsdFormatted,
      savedVndFormatted: savings.savedVndFormatted,
    },
  };
}

/**
 * Gọi Google Gemini Chat với cấu trúc systemInstruction bảo toàn tiền tố tĩnh
 * và trích xuất cachedContentTokenCount
 */
async function callGeminiChat({
  apiKey,
  model,
  systemPrompt,
  systemMessages,
  messages,
  temperature,
  maxTokens,
}) {
  const targetModel = model || "gemini-2.5-flash";
  const startTime = Date.now();

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: String(m.content || "") }],
  }));

  // Ghép systemInstruction bảo đảm tiền tố tĩnh xuất hiện trước
  let systemText = "";
  if (Array.isArray(systemMessages) && systemMessages.length > 0) {
    systemText = systemMessages.map((m) => m.content).filter(Boolean).join("\n\n");
  } else if (systemPrompt) {
    systemText = String(systemPrompt);
  }

  const body = {
    ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
    contents,
    generationConfig: {
      temperature: temperature ?? 0.6,
      maxOutputTokens: maxTokens ?? 500,
    },
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      targetModel
    )}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    }
  );

  const data = await res.json();
  const durationMs = Date.now() - startTime;

  if (!res.ok) {
    throw new Error(data?.error?.message || `Gemini HTTP ${res.status}`);
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error("Gemini trả về nội dung rỗng.");

  const usageMeta = data?.usageMetadata || {};
  const promptTokens = Number(usageMeta.promptTokenCount || 0);
  const completionTokens = Number(usageMeta.candidatesTokenCount || 0);
  const cachedTokens = Number(usageMeta.cachedContentTokenCount || 0);

  const savings = calculateTokenSavings({
    model: targetModel,
    provider: "gemini",
    cachedTokens,
  });

  recordCacheEvent({
    provider: "gemini",
    model: targetModel,
    promptTokens,
    cachedTokens,
    completionTokens,
    durationMs,
  });

  return {
    ok: true,
    text,
    providerUsed: "gemini",
    modelUsed: targetModel,
    usage: {
      promptTokens,
      cachedTokens,
      completionTokens,
      totalTokens: Number(usageMeta.totalTokenCount || promptTokens + completionTokens),
      cacheHit: cachedTokens > 0,
      savedUsd: savings.savedUsd,
      savedVnd: savings.savedVnd,
      savedUsdFormatted: savings.savedUsdFormatted,
      savedVndFormatted: savings.savedVndFormatted,
    },
  };
}

/**
 * Sinh câu trả lời AI:
 * - Bảo toàn thứ tự tiền tố tĩnh (Static Prefix Preserving)
 * - Tự động định tuyến giữa OpenAI, Anthropic và Gemini
 * - Trích xuất chi tiết token đã cache và số tiền tiết kiệm
 */
export async function generateAiReply({
  systemPrompt = "",
  systemMessages = null,
  anthropicSystem = null,
  messages = [],
  temperature = 0.6,
  maxTokens = 500,
  preferredProvider = null,
}) {
  const cfg = getAiSettings({ maskSecrets: false });

  // Xác định thứ tự ưu tiên gọi model
  const primary = preferredProvider || cfg.primaryProvider || "openai";
  const allProviders = ["openai", "anthropic", "gemini"];
  const order = [primary, ...allProviders.filter((p) => p !== primary)];

  const errors = [];
  for (const provider of order) {
    if (provider === "openai" && cfg.openaiApiKey) {
      try {
        const result = await callOpenAiChat({
          apiKey: cfg.openaiApiKey,
          model: cfg.openaiModel,
          systemPrompt,
          systemMessages,
          messages,
          temperature,
          maxTokens,
        });
        return {
          ...result,
          fallbackUsed: errors.length > 0,
          fallbackReason: errors.join("; ") || null,
        };
      } catch (err) {
        errors.push(`OpenAI: ${err.message}`);
      }
    }

    if (provider === "anthropic" && cfg.anthropicApiKey) {
      try {
        const result = await callAnthropicChat({
          apiKey: cfg.anthropicApiKey,
          model: cfg.anthropicModel,
          systemPrompt,
          anthropicSystem,
          messages,
          temperature,
          maxTokens,
        });
        return {
          ...result,
          fallbackUsed: errors.length > 0,
          fallbackReason: errors.join("; ") || null,
        };
      } catch (err) {
        errors.push(`Anthropic: ${err.message}`);
      }
    }

    if (provider === "gemini" && cfg.geminiApiKey) {
      try {
        const result = await callGeminiChat({
          apiKey: cfg.geminiApiKey,
          model: cfg.geminiModel,
          systemPrompt,
          systemMessages,
          messages,
          temperature,
          maxTokens,
        });
        return {
          ...result,
          fallbackUsed: errors.length > 0,
          fallbackReason: errors.join("; ") || null,
        };
      } catch (err) {
        errors.push(`Gemini: ${err.message}`);
      }
    }
  }

  return {
    ok: false,
    error:
      errors.length > 0
        ? `Tất cả các nhà cung cấp AI đều không phản hồi (${errors.join(" | ")})`
        : "Chưa cấu hình API Key (OpenAI / Anthropic / Gemini) trong mục AI Bot & Tri Thức.",
  };
}

/**
 * Tạo vector hash cục bộ 256 chiều (fallback khi chưa nhập API key embedding)
 */
export function buildLocalFallbackVector(text = "") {
  const dim = 256;
  const vec = new Array(dim).fill(0);
  const clean = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ");

  const tokens = clean.split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    let h = 2166136261;
    for (let i = 0; i < tok.length; i++) {
      h ^= tok.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    vec[Math.abs(h) % dim] += 1;
    // Bigram ký tự để hỗ trợ khớp gần đúng tiếng Việt
    for (let i = 0; i < tok.length - 1; i++) {
      const bg = tok.slice(i, i + 2);
      let bh = 5381;
      for (let j = 0; j < bg.length; j++) bh = (bh * 33) ^ bg.charCodeAt(j);
      vec[Math.abs(bh) % dim] += 0.5;
    }
  }

  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => Number((v / norm).toFixed(5)));
}

/**
 * Tạo Embedding Vector: ưu tiên OpenAI text-embedding-3-small -> Gemini text-embedding-004 -> Local fallback
 */
export async function createEmbedding(text = "") {
  const cfg = getAiSettings({ maskSecrets: false });
  const input = String(text || "").slice(0, 8000).trim();
  if (!input) return { vector: buildLocalFallbackVector(""), provider: "local" };

  if (cfg.openaiApiKey) {
    try {
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json();
      const emb = data?.data?.[0]?.embedding;
      if (res.ok && Array.isArray(emb)) {
        return { vector: emb, provider: "openai" };
      }
    } catch {}
  }

  if (cfg.geminiApiKey) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${encodeURIComponent(
          cfg.geminiApiKey
        )}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "models/text-embedding-004",
            content: { parts: [{ text: input }] },
          }),
          signal: AbortSignal.timeout(15000),
        }
      );
      const data = await res.json();
      const emb = data?.embedding?.values;
      if (res.ok && Array.isArray(emb)) {
        return { vector: emb, provider: "gemini" };
      }
    } catch {}
  }

  return { vector: buildLocalFallbackVector(input), provider: "local" };
}

// Tái xuất bản các hàm tiện ích Prompt Caching
export {
  getCacheStats,
  resetCacheStats,
  recordCacheEvent,
  calculateTokenSavings,
  buildDeterministicPrompt,
  SENIOR_DOCTOR_STATIC_PREFIX,
  estimateTokens,
};
