import fs from "fs";
import path from "path";
import {
  getLocalDataFilePath,
  runMariaDbSql,
  queryMariaDbJson,
  sqlEscape,
} from "../mariadbClient.js";

/**
 * ADDP Omnichannel AI CRM — AI Router (OpenAI GPT Primary -> Gemini Fallback)
 */

const DEFAULT_SETTINGS = {
  primaryProvider: "openai", // 'openai' | 'gemini'
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
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
    geminiApiKey: mask(settings.geminiApiKey),
    hasOpenaiKey: Boolean(settings.openaiApiKey),
    hasGeminiKey: Boolean(settings.geminiApiKey),
  };
}

export function saveAiSettings(updates = {}) {
  const current = getAiSettings({ maskSecrets: false });
  const next = {
    ...current,
    primaryProvider: updates.primaryProvider || current.primaryProvider || "openai",
    openaiModel: updates.openaiModel || current.openaiModel || "gpt-4o-mini",
    geminiModel: updates.geminiModel || current.geminiModel || "gemini-2.5-flash",
    openaiApiKey:
      updates.openaiApiKey && !String(updates.openaiApiKey).includes("...")
        ? String(updates.openaiApiKey).trim()
        : current.openaiApiKey,
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

async function callOpenAiChat({ apiKey, model, systemPrompt, messages, temperature, maxTokens }) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
      temperature: temperature ?? 0.6,
      max_tokens: maxTokens ?? 500,
      messages: [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        ...messages,
      ],
    }),
    signal: AbortSignal.timeout(25000),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `OpenAI HTTP ${res.status}`);
  }
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenAI trả về nội dung rỗng.");
  return { ok: true, text, providerUsed: "openai", modelUsed: model || "gpt-4o-mini" };
}

async function callGeminiChat({ apiKey, model, systemPrompt, messages, temperature, maxTokens }) {
  const targetModel = model || "gemini-2.5-flash";
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: String(m.content || "") }],
  }));

  const body = {
    ...(systemPrompt
      ? { systemInstruction: { parts: [{ text: systemPrompt }] } }
      : {}),
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
  if (!res.ok) {
    throw new Error(data?.error?.message || `Gemini HTTP ${res.status}`);
  }
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error("Gemini trả về nội dung rỗng.");
  return { ok: true, text, providerUsed: "gemini", modelUsed: targetModel };
}

/**
 * Sinh câu trả lời AI: ưu tiên OpenAI GPT, tự động fallback sang Gemini nếu hết quota hoặc lỗi.
 */
export async function generateAiReply({
  systemPrompt = "",
  messages = [],
  temperature = 0.6,
  maxTokens = 500,
}) {
  const cfg = getAiSettings({ maskSecrets: false });
  const order =
    cfg.primaryProvider === "gemini" ? ["gemini", "openai"] : ["openai", "gemini"];

  const errors = [];
  for (const provider of order) {
    if (provider === "openai" && cfg.openaiApiKey) {
      try {
        const result = await callOpenAiChat({
          apiKey: cfg.openaiApiKey,
          model: cfg.openaiModel,
          systemPrompt,
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

    if (provider === "gemini" && cfg.geminiApiKey) {
      try {
        const result = await callGeminiChat({
          apiKey: cfg.geminiApiKey,
          model: cfg.geminiModel,
          systemPrompt,
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
        ? `Cả OpenAI và Gemini đều không phản hồi (${errors.join(" | ")})`
        : "Chưa cấu hình OpenAI API Key hoặc Gemini API Key trong mục AI Bot & Tri Thức.",
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
