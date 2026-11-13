import fs from "fs";
import path from "path";
import os from "os";
import { execFileSync } from "child_process";
import { getLocalDataFilePath } from "../mariadbClient.js";
import { createEmbedding, buildLocalFallbackVector } from "./aiRouter.js";

/**
 * ADDP Omnichannel AI CRM — Vector Store cho Thư viện Kiến thức & Hội thoại Khách hàng
 * Hỗ trợ tìm kiếm ngữ nghĩa Cosine Similarity tốc độ cao + lưu trữ bền vững trên ổ đĩa.
 */

function getVectorFile(collection = "knowledge") {
  return getLocalDataFilePath(`vectors_${collection}.json`);
}

function loadCollection(collection = "knowledge") {
  try {
    const filePath = getVectorFile(collection);
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function saveCollection(collection = "knowledge", records = []) {
  const filePath = getVectorFile(collection);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(records), "utf8");
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

export function extractTextFromBuffer(buffer, fileName = "") {
  const ext = path.extname(String(fileName || "")).toLowerCase();

  if ([".txt", ".md", ".csv", ".json", ".log"].includes(ext) || !ext) {
    return buffer.toString("utf8").replace(/^\uFEFF/, "");
  }

  if (ext === ".docx") {
    const tmpFile = path.join(os.tmpdir(), `addp_doc_${Date.now()}.docx`);
    try {
      fs.writeFileSync(tmpFile, buffer);
      // Dùng unzip -p để đọc word/document.xml trên Linux/macOS
      const xml = execFileSync("unzip", ["-p", tmpFile, "word/document.xml"], {
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
        timeout: 10000,
      });
      return xml
        .replace(/<\/w:p>/g, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+\n/g, "\n")
        .replace(/[ \t]+/g, " ")
        .trim();
    } catch {
      return buffer.toString("utf8").replace(/[^\x20-\x7E\u00A0-\uFFFF\n]/g, " ");
    } finally {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
  }

  if (ext === ".pdf") {
    const tmpFile = path.join(os.tmpdir(), `addp_pdf_${Date.now()}.pdf`);
    try {
      fs.writeFileSync(tmpFile, buffer);
      const txt = execFileSync("pdftotext", ["-enc", "UTF-8", tmpFile, "-"], {
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
        timeout: 15000,
      });
      if (txt && txt.trim()) return txt.trim();
    } catch {} finally {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
    // Fallback nhẹ trích chuỗi văn bản trong PDF nếu server chưa cài pdftotext
    const raw = buffer.toString("latin1");
    const matches = raw.match(/\(([^()]{3,200})\)/g) || [];
    return matches.map((m) => m.slice(1, -1)).join(" ").trim();
  }

  return buffer.toString("utf8");
}

export function chunkText(text = "", chunkSize = 650, overlap = 120) {
  const clean = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  if (clean.length <= chunkSize) return [clean];

  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(clean.length, start + chunkSize);
    if (end < clean.length) {
      const lastBreak = Math.max(
        clean.lastIndexOf("\n", end),
        clean.lastIndexOf(". ", end),
        clean.lastIndexOf(" ", end)
      );
      if (lastBreak > start + chunkSize * 0.5) {
        end = lastBreak + 1;
      }
    }
    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= clean.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

export async function indexKnowledgeDocument({
  docId,
  title = "",
  category = "PRODUCT",
  text = "",
  accountKeys = ["ALL"],
}) {
  const chunks = chunkText(text);
  const existing = loadCollection("knowledge").filter((r) => r.docId !== docId);

  const createdAt = new Date().toISOString();
  const newRecords = [];
  for (let i = 0; i < chunks.length; i++) {
    const content = chunks[i];
    const emb = await createEmbedding(`${title}\n${content}`);
    newRecords.push({
      id: `${docId}_chunk_${i}`,
      docId,
      title,
      category,
      accountKeys: Array.isArray(accountKeys) && accountKeys.length > 0 ? accountKeys : ["ALL"],
      chunkIndex: i,
      text: content,
      provider: emb.provider,
      vector: emb.vector,
      localVector: buildLocalFallbackVector(`${title} ${content}`),
      createdAt,
    });
  }

  saveCollection("knowledge", [...existing, ...newRecords]);
  return { chunkCount: newRecords.length };
}

export function deleteDocumentVectors(docId) {
  const records = loadCollection("knowledge");
  const filtered = records.filter((r) => r.docId !== docId);
  saveCollection("knowledge", filtered);
  return records.length - filtered.length;
}

export async function searchKnowledgeVectors({
  query = "",
  accountKey = "",
  topK = 5,
} = {}) {
  const records = loadCollection("knowledge");
  if (records.length === 0) return [];

  const qEmb = await createEmbedding(query);
  const qLocal = buildLocalFallbackVector(query);
  const qTerms = String(query || "")
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  const scoped = accountKey
    ? records.filter(
        (r) =>
          !Array.isArray(r.accountKeys) ||
          r.accountKeys.includes("ALL") ||
          r.accountKeys.includes(accountKey)
      )
    : records;

  const scored = scoped.map((r) => {
    let score = 0;
    if (Array.isArray(r.vector) && r.vector.length === qEmb.vector.length && r.provider === qEmb.provider) {
      score = cosineSimilarity(qEmb.vector, r.vector);
    } else if (Array.isArray(r.localVector)) {
      score = cosineSimilarity(qLocal, r.localVector);
    }
    const hay = `${r.title || ""} ${r.text || ""}`.toLowerCase();
    let kwBoost = 0;
    for (const term of qTerms) {
      if (hay.includes(term)) kwBoost += 0.04;
    }
    return {
      id: r.id,
      docId: r.docId,
      title: r.title,
      category: r.category,
      text: r.text,
      score: Number((score + Math.min(0.25, kwBoost)).toFixed(4)),
    };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}

export async function indexConversationVector({
  id,
  accountKey = "ALL",
  threadId = "",
  customerPhone = "",
  intent = "GENERAL",
  text = "",
  metadata = {},
}) {
  const records = loadCollection("conversations").filter((r) => r.id !== id);
  const emb = await createEmbedding(text);
  records.push({
    id,
    accountKey,
    threadId,
    customerPhone,
    intent,
    text,
    metadata,
    provider: emb.provider,
    vector: emb.vector,
    localVector: buildLocalFallbackVector(text),
    createdAt: new Date().toISOString(),
  });
  saveCollection("conversations", records);
  return { ok: true, id };
}

export async function searchConversationVectors({
  query = "",
  accountKey = "",
  threadId = "",
  topK = 5,
} = {}) {
  const records = loadCollection("conversations");
  if (records.length === 0) return [];

  const qEmb = await createEmbedding(query);
  const qLocal = buildLocalFallbackVector(query);

  const scoped = records.filter((r) => {
    if (threadId && r.threadId && r.threadId !== threadId) return false;
    if (accountKey && r.accountKey && r.accountKey !== "ALL" && r.accountKey !== accountKey) {
      return false;
    }
    return true;
  });

  const scored = scoped.map((r) => {
    let score = 0;
    if (Array.isArray(r.vector) && r.vector.length === qEmb.vector.length && r.provider === qEmb.provider) {
      score = cosineSimilarity(qEmb.vector, r.vector);
    } else if (Array.isArray(r.localVector)) {
      score = cosineSimilarity(qLocal, r.localVector);
    }
    return {
      id: r.id,
      accountKey: r.accountKey,
      threadId: r.threadId,
      intent: r.intent,
      text: r.text,
      metadata: r.metadata,
      score: Number(score.toFixed(4)),
    };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}

export function getVectorStats() {
  const knowledge = loadCollection("knowledge");
  const conversations = loadCollection("conversations");
  return {
    knowledgeChunks: knowledge.length,
    conversationVectors: conversations.length,
  };
}
