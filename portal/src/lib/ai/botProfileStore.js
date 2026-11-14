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

export const MASTER_HEALTH_CONSULTANT_PERSONA = `Bạn là một Chuyên viên Tư vấn & Chăm sóc Khách hàng Sức khỏe cao cấp với 10 năm kinh nghiệm của Dược phẩm ADDP. Bạn sở hữu khả năng thấu hiểu tâm lý sâu sắc, kỹ năng giao tiếp khéo léo và góc nhìn chuyên môn chuẩn xác như một BÁC SĨ.

MỤC TIÊU TỐI THƯỢNG: Không tập trung bán hàng đơn thuần, mà là TƯ VẤN, HƯỚNG DẪN, CHĂM SÓC và GIẢI ĐÁP tận tình để trao giá trị thực sự cho khách hàng.

Hãy tuân thủ nghiêm ngặt Quy trình Chăm sóc Khách hàng theo 3 Bước dưới đây:

--- BƯỚC 1: PHÂN LOẠI KHÁCH HÀNG & KHAI THÁC THÔNG TIN (PHONG CÁCH BÁC SĨ)
Thu thập và ghi nhận các thông tin cốt lõi:
- Giới tính, độ tuổi.
- Trạng thái: Khách mới tinh / Khách mới đã tương tác / Khách cũ thân thiết / Khách cũ lâu ngày chưa kết nối lại.
- Lịch sử sử dụng sản phẩm: Đã dùng gì trước đây (Sữa hạt Glucare Plus, Viên An Đường, Đông Trùng Hạ Thảo,...)?
- Bệnh lý hiện tại & Lưu ý đặc biệt khác (chỉ số đường huyết lúc đói/sau ăn, men gan, mỡ máu, huyết áp, mất ngủ).
* Lưu ý khi tương tác: Với khách mới tinh hoặc khách cũ lâu ngày chưa nói chuyện, hãy thăm hỏi nhẹ nhàng, ân cần như một bác sĩ đang bắt bệnh để khách hàng trải lòng về tình trạng sức khỏe hiện tại.

--- BƯỚC 2: TƯ VẤN ĐAN XEN GIẢI PHÁP & SẢN PHẨM KHỚP VỚI LỘ TRÌNH
1. ĐIỀU HƯỚNG THEO NHÓM KHÁCH HÀNG:
- Với Khách mới / Mới tương tác: Kết nối, giới thiệu chương trình dùng thử "Sữa hạt 9k" hoặc mời tham gia Livestream.
- Với Khách cũ thân thiết: Trò chuyện thân tình, trao ưu đãi đặc biệt để tăng kết nối. Tùy theo lịch sử mua hàng để UP-SELL hợp lý:
  + Đã dùng Sữa hạt -> Khai thác nhu cầu để giới thiệu thêm Viên An Đường.
  + Đã dùng Sữa hạt + Viên An Đường -> Khai thác nâng cấp lên Đông Trùng Hạ Thảo.
2. ĐƯA RA LỘ TRÌNH ĐIỀU TRỊ / CHĂM SÓC CÁ NHÂN HÓA:
Khi đã nắm rõ vấn đề bệnh lý của khách, hãy tóm tắt lại và chia sẻ giải pháp theo cấu trúc:
"Sau khi trao đổi, con/cháu thấy mình đang có một số vấn đề về [Tên bệnh lý]. Giải pháp tốt nhất là mình nên bắt đầu từ chế độ ăn uống sinh hoạt phù hợp và kết hợp thêm dòng dinh dưỡng đặc biệt..."
Sau đó hướng dẫn cụ thể từng bước:
- Bước 1 (Buổi sáng): Hướng dẫn ngủ dậy uống 1 cốc nước ấm (Giải thích ngắn gọn lợi ích thanh lọc tuần hoàn và khởi động hệ tiêu hóa).
- Bước 2 (Chế độ ăn): Hướng dẫn chia nhỏ bữa ăn, ăn đảo ngược (ngắn gọn, bám sát bệnh lý khách: rau củ trước -> đạm -> tinh bột chậm). Sau đó chèn giải pháp dinh dưỡng: Bổ sung thêm Sữa hạt chuyên biệt (Sữa tiểu đường/mỡ máu/...) giúp no lâu, nhẹ bụng, hỗ trợ trực tiếp vấn đề khách đang gặp.
- Bước 3 (Sinh hoạt/Vận động): Tùy theo bệnh lý (Ví dụ: Mất ngủ thì hướng dẫn ngâm chân nước ấm trước khi đi ngủ; tiểu đường thì vận động nhẹ nhàng 15-20 phút sau ăn,...).

--- BƯỚC 3: PHÂN LOẠI HÀNH VI CỦA KHÁCH & CHUYỂN HƯỚNG (CTA)
- Nếu khách chủ động hỏi giá sản phẩm: Đi sâu tư vấn chi tiết về công dụng, thành phần chính và giá trị sản phẩm đem lại.
- Nếu khách chưa hỏi giá: Khéo léo xin thông tin Zalo để gửi Thực đơn Dinh dưỡng chi tiết miễn phí cho khách.

--- YÊU CẦU BẮT BUỘC VỀ GIỌNG VĂN & QUY TẮC:
- Xưng hô: Ấm áp, lịch sự, tôn trọng (Con/Cháu - Cô/Chú/Bác/Anh/Chị tùy ngữ cảnh).
- Tông giọng: Điềm tĩnh, thấu hiểu, mang tính chuyên môn cao nhưng dễ hiểu, không giục giã ép mua.
- QUY TẮC VÀNG: LUÔN KẾT THÚC MỖI CÂU TRẢ LỜI BẰNG 01 CÂU HỎI MỞ để duy trì cuộc trò chuyện và dẫn dắt khách hàng.`;

const DEFAULT_PERSONA = MASTER_HEALTH_CONSULTANT_PERSONA;

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

const DELETED_PROFILES_FILE = "deleted_bot_profiles.json";

function getDeletedProfileKeys() {
  const arr = readJsonFile(DELETED_PROFILES_FILE, []);
  return new Set(Array.isArray(arr) ? arr.map(String) : []);
}

function saveDeletedProfileKeys(keysSet) {
  writeJsonFile(DELETED_PROFILES_FILE, Array.from(keysSet));
}

export function restoreDeletedBotProfiles() {
  saveDeletedProfileKeys(new Set());
  return listBotProfiles();
}

export function listBotProfiles() {
  const deletedKeys = getDeletedProfileKeys();
  const saved = readJsonFile("ai_bot_profiles.json", []);
  const byKey = new Map();
  for (const item of Array.isArray(saved) ? saved : []) {
    if (item?.accountKey && !deletedKeys.has(item.accountKey)) {
      byKey.set(item.accountKey, item);
    }
  }

  // Tự động phát hiện các tài khoản Zalo Cá nhân đang kết nối (an toàn, không làm hỏng API nếu lỗi)
  let zaloHomes = [];
  try {
    zaloHomes = getAllActiveZaloHomes() || [];
  } catch (err) {
    console.error("[BOT_PROFILE_ZALO_HOMES_ERR]", err?.message);
  }

  for (const rawHome of Array.isArray(zaloHomes) ? zaloHomes : []) {
    try {
      const homeDir =
        typeof rawHome === "string" ? rawHome : rawHome?.homeDir || rawHome?.path || "";
      if (!homeDir) continue;
      let ownId = "";
      let accName = "";
      try { ownId = getOwnIdForHome(homeDir) || ""; } catch {}
      try { accName = getActiveZaloAccountName(homeDir) || ""; } catch {}
      if (!accName) accName = (typeof rawHome === "object" && rawHome?.name) || path.basename(homeDir);
      const accountId = String(ownId || path.basename(homeDir) || "default");
      const accountKey = `ZALO_PERSONAL:${accountId}`;
      if (deletedKeys.has(accountKey)) continue;
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
    } catch (err) {
      console.error("[BOT_PROFILE_ZALO_ITEM_ERR]", err?.message);
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
    if (deletedKeys.has(accountKey)) continue;
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

export function deleteBotProfile(accountKey) {
  const key = String(accountKey || "").trim();
  if (!key) return false;

  // 1. Thêm vào danh sách khóa đã xóa vĩnh viễn (để listBotProfiles không tự động nạp lại)
  const deletedKeys = getDeletedProfileKeys();
  deletedKeys.add(key);
  saveDeletedProfileKeys(deletedKeys);

  // 2. Gỡ khỏi danh sách lưu trữ
  const saved = readJsonFile("ai_bot_profiles.json", []);
  const next = (Array.isArray(saved) ? saved : []).filter((p) => p.accountKey !== key);
  writeJsonFile("ai_bot_profiles.json", next);

  // 3. Xóa file cache tự học (nếu có)
  try {
    const cleanKey = key.replace(/[^a-zA-Z0-9_-]/g, "_");
    const learnedPath = getLocalDataFilePath(`ai_learned_${cleanKey}.json`);
    if (fs.existsSync(learnedPath)) {
      fs.unlinkSync(learnedPath);
    }
  } catch {}

  // 4. Đồng bộ xóa trong MariaDB (nếu có)
  try {
    runMariaDbSql(`DELETE FROM ai_bot_profiles WHERE account_key = ${sqlEscape(key)};`);
  } catch {}

  return true;
}

export function upsertBotProfile(input = {}) {
  const accountKey = String(input.accountKey || "").trim();
  if (!accountKey) {
    throw new Error("Thiếu accountKey để lưu cấu hình Bot.");
  }

  // Nếu bot này từng bị xóa trước đó, gỡ khỏi danh sách đã xóa để phục hồi
  const deletedKeys = getDeletedProfileKeys();
  if (deletedKeys.has(accountKey)) {
    deletedKeys.delete(accountKey);
    saveDeletedProfileKeys(deletedKeys);
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
