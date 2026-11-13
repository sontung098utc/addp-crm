import fs from "fs";
import path from "path";
import {
  getLocalDataFilePath,
  runMariaDbSql,
  sqlEscape,
} from "../mariadbClient.js";
import {
  getAllActiveZaloHomes,
  getActiveZaloAccountName,
  getOwnIdForHome,
} from "../zaloRunner.js";

/**
 * ADDP Omnichannel AI CRM — Quản lý Bot Profile theo từng Tài khoản Kênh & Tài liệu Tri thức
 */

const DEFAULT_PERSONA =
  "Bạn là chuyên viên tư vấn sức khỏe & dược phẩm ADDP thân thiện, xưng em và gọi khách là anh/chị/cô/chú theo ngữ cảnh. Trả lời ngắn gọn, tự nhiên như người thật, không dùng văn phong máy móc, dựa trên hồ sơ khách hàng và tài liệu sản phẩm.";

function readJsonFile(fileName, fallback) {
  try {
    const p = getLocalDataFilePath(fileName);
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
    }
  } catch {}
  return fallback;
}

function writeJsonFile(fileName, data) {
  const p = getLocalDataFilePath(fileName);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
}

export function listBotProfiles() {
  const saved = readJsonFile("ai_bot_profiles.json", []);
  const byKey = new Map();
  for (const item of Array.isArray(saved) ? saved : []) {
    if (item?.accountKey) byKey.set(item.accountKey, item);
  }

  // Tự động phát hiện các tài khoản Zalo Cá nhân đang kết nối
  let zaloHomes = [];
  try {
    zaloHomes = getAllActiveZaloHomes() || [];
  } catch {}

  for (const homeDir of zaloHomes) {
    const ownId = getOwnIdForHome(homeDir) || "";
    const accName = getActiveZaloAccountName(homeDir) || path.basename(homeDir);
    const accountId = String(ownId || path.basename(homeDir) || "default");
    const accountKey = `ZALO_PERSONAL:${accountId}`;
    if (!byKey.has(accountKey)) {
      byKey.set(accountKey, {
        accountKey,
        channel: "ZALO_PERSONAL",
        accountId,
        accountName: accName,
        homeDir,
        botName: `Bot ${accName}`,
        mode: "COPILOT", // HUMAN | COPILOT | AUTO
        personaPrompt: DEFAULT_PERSONA,
        assignedDocIds: ["ALL"],
        replyDelayMin: 5,
        replyDelayMax: 15,
        takeoverMinutes: 45,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  // Các kênh chuẩn khác (Zalo OA, Fanpage, TikTok Shop, Shopee) để sẵn sàng cấu hình
  const defaultChannels = [
    { channel: "ZALO_OA", accountId: "default", accountName: "Zalo OA Dược Phẩm ADDP" },
    { channel: "FACEBOOK_FANPAGE", accountId: "default", accountName: "Fanpage Facebook ADDP" },
    { channel: "TIKTOK_SHOP", accountId: "default", accountName: "TikTok Shop ADDP" },
    { channel: "SHOPEE", accountId: "default", accountName: "Shopee Mall ADDP" },
  ];

  for (const ch of defaultChannels) {
    const accountKey = `${ch.channel}:${ch.accountId}`;
    if (!byKey.has(accountKey)) {
      byKey.set(accountKey, {
        accountKey,
        channel: ch.channel,
        accountId: ch.accountId,
        accountName: ch.accountName,
        botName: `Bot ${ch.accountName}`,
        mode: "HUMAN",
        personaPrompt: DEFAULT_PERSONA,
        assignedDocIds: ["ALL"],
        replyDelayMin: 5,
        replyDelayMax: 15,
        takeoverMinutes: 45,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  return Array.from(byKey.values());
}

export function upsertBotProfile(input = {}) {
  const accountKey = String(input.accountKey || "").trim();
  if (!accountKey) {
    throw new Error("Thiếu accountKey để lưu cấu hình Bot.");
  }

  const profiles = listBotProfiles();
  const idx = profiles.findIndex((p) => p.accountKey === accountKey);
  const prev = idx >= 0 ? profiles[idx] : {};

  const next = {
    accountKey,
    channel: input.channel || prev.channel || "ZALO_PERSONAL",
    accountId: input.accountId || prev.accountId || accountKey.split(":")[1] || "default",
    accountName: input.accountName || prev.accountName || accountKey,
    botName: String(input.botName ?? prev.botName ?? "Trợ lý ADDP").trim(),
    mode: ["HUMAN", "COPILOT", "AUTO"].includes(input.mode)
      ? input.mode
      : prev.mode || "COPILOT",
    personaPrompt:
      input.personaPrompt !== undefined
        ? String(input.personaPrompt)
        : prev.personaPrompt || DEFAULT_PERSONA,
    assignedDocIds: Array.isArray(input.assignedDocIds)
      ? input.assignedDocIds
      : prev.assignedDocIds || ["ALL"],
    replyDelayMin: Math.max(2, Number(input.replyDelayMin ?? prev.replyDelayMin ?? 5)),
    replyDelayMax: Math.max(5, Number(input.replyDelayMax ?? prev.replyDelayMax ?? 15)),
    takeoverMinutes: Math.max(5, Number(input.takeoverMinutes ?? prev.takeoverMinutes ?? 45)),
    updatedAt: new Date().toISOString(),
  };

  if (idx >= 0) profiles[idx] = next;
  else profiles.push(next);

  writeJsonFile("ai_bot_profiles.json", profiles);

  // Đồng bộ vào MariaDB 10.6
  try {
    runMariaDbSql(
      `INSERT INTO ai_bot_profiles
        (account_key, channel, account_id, account_name, bot_name, mode, persona_prompt, assigned_doc_ids, reply_delay_min, reply_delay_max, takeover_minutes)
       VALUES (
        ${sqlEscape(next.accountKey)},
        ${sqlEscape(next.channel)},
        ${sqlEscape(next.accountId)},
        ${sqlEscape(next.accountName)},
        ${sqlEscape(next.botName)},
        ${sqlEscape(next.mode)},
        ${sqlEscape(next.personaPrompt)},
        ${sqlEscape(JSON.stringify(next.assignedDocIds))},
        ${next.replyDelayMin},
        ${next.replyDelayMax},
        ${next.takeoverMinutes}
       )
       ON DUPLICATE KEY UPDATE
        account_name = VALUES(account_name),
        bot_name = VALUES(bot_name),
        mode = VALUES(mode),
        persona_prompt = VALUES(persona_prompt),
        assigned_doc_ids = VALUES(assigned_doc_ids),
        reply_delay_min = VALUES(reply_delay_min),
        reply_delay_max = VALUES(reply_delay_max),
        takeover_minutes = VALUES(takeover_minutes);`
    );
  } catch {}

  return next;
}

export function listKnowledgeDocs() {
  return readJsonFile("ai_knowledge_docs.json", []);
}

export function saveKnowledgeDocMeta(doc) {
  const docs = listKnowledgeDocs().filter((d) => d.id !== doc.id);
  docs.unshift(doc);
  writeJsonFile("ai_knowledge_docs.json", docs);

  try {
    runMariaDbSql(
      `INSERT INTO ai_knowledge_docs
        (id, title, category, file_name, file_type, chunk_count, account_keys, preview)
       VALUES (
        ${sqlEscape(doc.id)},
        ${sqlEscape(doc.title)},
        ${sqlEscape(doc.category || "PRODUCT")},
        ${sqlEscape(doc.fileName || "")},
        ${sqlEscape(doc.fileType || "text")},
        ${Number(doc.chunkCount) || 0},
        ${sqlEscape(JSON.stringify(doc.accountKeys || ["ALL"]))},
        ${sqlEscape(doc.preview || "")}
       )
       ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        category = VALUES(category),
        chunk_count = VALUES(chunk_count),
        account_keys = VALUES(account_keys),
        preview = VALUES(preview);`
    );
  } catch {}

  return doc;
}

export function deleteKnowledgeDocMeta(docId) {
  const docs = listKnowledgeDocs();
  const next = docs.filter((d) => d.id !== docId);
  writeJsonFile("ai_knowledge_docs.json", next);
  try {
    runMariaDbSql(`DELETE FROM ai_knowledge_docs WHERE id = ${sqlEscape(docId)};`);
  } catch {}
  return docs.length - next.length;
}
