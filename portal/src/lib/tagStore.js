import fs from "fs";
import path from "path";
import { COLOR_VARIANTS, COLOR_OPTIONS } from "./tagConstants.js";

export { COLOR_VARIANTS, COLOR_OPTIONS };

const CANDIDATE_DIRS = [
  path.resolve(process.cwd(), ".data"),
  path.resolve(process.cwd(), "portal", ".data"),
  path.resolve(process.cwd(), "..", ".data"),
  path.resolve(process.cwd(), "..", "portal", ".data"),
  "/home/addp/domains/crm.addp.vn/public_html/portal/.data",
  "/home/addp/domains/crm.addp.vn/public_html/.data",
  "C:\\addp-crm\\.data",
  "C:\\addp-crm\\portal\\.data",
];

function getAllDataDirs() {
  const dirs = new Set();
  if (process.env.DATA_DIR) {
    const custom = path.isAbsolute(process.env.DATA_DIR)
      ? process.env.DATA_DIR
      : path.join(process.cwd(), process.env.DATA_DIR);
    dirs.add(path.resolve(custom));
  }
  for (const d of CANDIDATE_DIRS) {
    try {
      if (fs.existsSync(d) || fs.existsSync(path.dirname(d))) {
        dirs.add(path.resolve(d));
      }
    } catch {}
  }
  return Array.from(dirs);
}

function resolveDataPath(filename) {
  const allDirs = getAllDataDirs();
  for (const d of allDirs) {
    const fp = path.join(d, filename);
    if (fs.existsSync(fp)) return fp;
  }
  const primary = allDirs[0] || path.resolve(process.cwd(), ".data");
  try {
    fs.mkdirSync(primary, { recursive: true });
  } catch {}
  return path.join(primary, filename);
}

export const DEFAULT_TAGS = [
  { id: "tag_vip", name: "Khách VIP", color: "amber", bg: COLOR_VARIANTS.amber },
  { id: "tag_potential", name: "Khách Tiềm Năng", color: "blue", bg: COLOR_VARIANTS.blue },
  { id: "tag_purchased", name: "Đã Mua Hàng", color: "emerald", bg: COLOR_VARIANTS.emerald },
  { id: "tag_care", name: "Cần Chăm Sóc", color: "purple", bg: COLOR_VARIANTS.purple },
  { id: "tag_diabetes", name: "Tiểu Đường", color: "rose", bg: COLOR_VARIANTS.rose },
  { id: "tag_bp", name: "Huyết Áp", color: "orange", bg: COLOR_VARIANTS.orange },
  { id: "tag_used_half", name: "Dùng 1/2 Liệu Trình", color: "indigo", bg: COLOR_VARIANTS.indigo },
  { id: "tag_used_two_thirds", name: "Dùng 2/3 Liệu Trình", color: "cyan", bg: COLOR_VARIANTS.cyan },
  { id: "tag_new", name: "Khách Mới", color: "teal", bg: COLOR_VARIANTS.teal },
];

export function getTags() {
  let existing = [];
  try {
    const file = resolveDataPath("tags.json");
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        existing = parsed;
      }
    }
  } catch (err) {
    console.error("[getTags ERROR]", err);
  }

  // Tự động đảm bảo tất cả các thẻ chuẩn DEFAULT_TAGS đều có mặt trong hệ thống
  let updated = false;
  const merged = [...existing];
  for (const def of DEFAULT_TAGS) {
    if (!merged.some((t) => t.name === def.name || t.id === def.id)) {
      merged.push(def);
      updated = true;
    }
  }

  if (updated || existing.length === 0) {
    saveTags(merged);
  }

  return merged;
}

export function saveTags(tags) {
  try {
    const content = JSON.stringify(tags, null, 2);
    const dirs = getAllDataDirs();
    for (const d of dirs) {
      try {
        fs.mkdirSync(d, { recursive: true });
        fs.writeFileSync(path.join(d, "tags.json"), content, "utf8");
      } catch {}
    }
    return true;
  } catch (err) {
    console.error("[saveTags ERROR]", err);
    return false;
  }
}

export function addTag({ name, color = "blue", bg }) {
  const cleanName = String(name || "").trim();
  if (!cleanName) return null;
  const tags = getTags();

  // Tránh trùng tên
  const existing = tags.find((t) => t.name.toLowerCase() === cleanName.toLowerCase());
  if (existing) return existing;

  const validColor = COLOR_VARIANTS[color] ? color : "blue";
  const newTag = {
    id: `tag_${Date.now()}`,
    name: cleanName,
    color: validColor,
    bg: bg || COLOR_VARIANTS[validColor],
    createdAt: new Date().toISOString(),
  };

  tags.push(newTag);
  saveTags(tags);
  return newTag;
}

export function updateTag({ id, name, color, bg }) {
  if (!id) return null;
  const tags = getTags();
  const index = tags.findIndex((t) => t.id === id || t.name === id);
  if (index === -1) return null;

  const cleanName = name ? String(name).trim() : tags[index].name;
  const validColor = color && COLOR_VARIANTS[color] ? color : tags[index].color || "blue";

  tags[index] = {
    ...tags[index],
    name: cleanName,
    color: validColor,
    bg: bg || COLOR_VARIANTS[validColor],
    updatedAt: new Date().toISOString(),
  };

  saveTags(tags);
  return tags[index];
}

export function deleteTag(id) {
  const tags = getTags();
  const target = tags.find((t) => t.id === id || t.name === id);
  const targetName = target ? target.name : id;
  const filtered = tags.filter((t) => t.id !== id && t.name !== id);
  saveTags(filtered);

  // Cũng dọn dẹp thẻ này khỏi conversation_tags
  try {
    const convMap = getAllConversationTags();
    let changed = false;
    for (const tid of Object.keys(convMap)) {
      if (Array.isArray(convMap[tid]) && (convMap[tid].includes(id) || convMap[tid].includes(targetName))) {
        convMap[tid] = convMap[tid].filter((t) => t !== id && t !== targetName);
        changed = true;
      }
    }
    if (changed) {
      const convFile = resolveDataPath("conversation_tags.json");
      fs.writeFileSync(convFile, JSON.stringify(convMap, null, 2), "utf8");
    }
  } catch (err) {
    console.error("[deleteTag clean conv tags err]", err);
  }

  return filtered;
}

export function saveConversationTags(map) {
  try {
    const content = JSON.stringify(map, null, 2);
    const dirs = getAllDataDirs();
    for (const d of dirs) {
      try {
        fs.mkdirSync(d, { recursive: true });
        fs.writeFileSync(path.join(d, "conversation_tags.json"), content, "utf8");
      } catch {}
    }
    return true;
  } catch (err) {
    console.error("[saveConversationTags ERROR]", err);
    return false;
  }
}

export function getAllConversationTags() {
  const merged = {};
  const dirs = getAllDataDirs();
  for (const d of dirs) {
    const file = path.join(d, "conversation_tags.json");
    if (fs.existsSync(file)) {
      try {
        const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          Object.assign(merged, parsed);
        }
      } catch {}
    }
  }
  return merged;
}

export function getConversationTags(threadId) {
  if (!threadId) return [];
  const map = getAllConversationTags();
  const tidStr = String(threadId).trim();
  const tidClean = tidStr.replace(/^[gu]_/, "");
  return Array.isArray(map[tidStr])
    ? map[tidStr]
    : Array.isArray(map[tidClean])
    ? map[tidClean]
    : [];
}

export function updateConversationTags(threadId, tags, phone = "") {
  if (!threadId) return [];
  const map = getAllConversationTags();
  const cleanTags = Array.isArray(tags)
    ? Array.from(new Set(tags.map((t) => String(t || "").trim()).filter(Boolean)))
    : [];

  const tidStr = String(threadId).trim();
  const tidClean = tidStr.replace(/^[gu]_/, "");

  if (cleanTags.length > 0) {
    map[tidStr] = cleanTags;
    if (tidClean) map[tidClean] = cleanTags;
    if (phone) {
      const cleanPhone = String(phone).replace(/\D/g, "");
      if (cleanPhone) map[cleanPhone] = cleanTags;
    }
  } else {
    delete map[tidStr];
    if (tidClean) delete map[tidClean];
    if (phone) {
      const cleanPhone = String(phone).replace(/\D/g, "");
      if (cleanPhone) delete map[cleanPhone];
    }
  }

  saveConversationTags(map);
  return cleanTags;
}

export function removeConversationTags(threadId) {
  if (!threadId) return false;
  const map = getAllConversationTags();
  const tidStr = String(threadId).trim();
  const tidClean = tidStr.replace(/^[gu]_/, "");
  delete map[tidStr];
  if (tidClean) delete map[tidClean];
  saveConversationTags(map);
  return true;
}

export function bulkAddConversationTag(keys = [], tagValue = "") {
  const cleanTag = String(tagValue || "").trim();
  const cleanKeys = Array.from(
    new Set((Array.isArray(keys) ? keys : []).map((k) => String(k || "").trim()).filter(Boolean))
  );
  if (!cleanTag || cleanKeys.length === 0) return false;

  const map = getAllConversationTags();
  let changed = false;
  for (const key of cleanKeys) {
    const prev = Array.isArray(map[key]) ? map[key] : [];
    if (!prev.includes(cleanTag)) {
      map[key] = [...prev, cleanTag];
      changed = true;
    }
  }
  if (!changed) return true;

  try {
    const file = resolveDataPath("conversation_tags.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(map, null, 2), "utf8");
    return true;
  } catch (err) {
    console.error("[bulkAddConversationTag ERROR]", err);
    return false;
  }
}

export function bulkRemoveConversationTags(keys = []) {
  const cleanKeys = Array.from(
    new Set((Array.isArray(keys) ? keys : []).map((k) => String(k || "").trim()).filter(Boolean))
  );
  if (cleanKeys.length === 0) return false;

  const map = getAllConversationTags();
  let changed = false;
  for (const key of cleanKeys) {
    if (key in map) {
      delete map[key];
      changed = true;
    }
  }
  if (!changed) return true;

  try {
    const file = resolveDataPath("conversation_tags.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(map, null, 2), "utf8");
    return true;
  } catch (err) {
    console.error("[bulkRemoveConversationTags ERROR]", err);
    return false;
  }
}

export function getTagUsageCount() {
  const convTags = getAllConversationTags();
  const counts = {};
  for (const tid of Object.keys(convTags)) {
    const list = convTags[tid];
    if (Array.isArray(list)) {
      for (const t of list) {
        counts[t] = (counts[t] || 0) + 1;
      }
    }
  }
  return counts;
}
