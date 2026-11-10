import fs from "fs";
import path from "path";
import { COLOR_VARIANTS, COLOR_OPTIONS } from "./tagConstants.js";

export { COLOR_VARIANTS, COLOR_OPTIONS };

function resolveDataPath(filename) {
  const candidates = [
    path.resolve(process.cwd(), ".data", filename),
    path.resolve(process.cwd(), "portal", ".data", filename),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) || fs.existsSync(path.dirname(c))) {
      return c;
    }
  }
  const fallback = candidates[0];
  try {
    fs.mkdirSync(path.dirname(fallback), { recursive: true });
  } catch {}
  return fallback;
}

export function getTags() {
  try {
    const file = resolveDataPath("tags.json");
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.error("[getTags ERROR]", err);
  }
  return [];
}

export function saveTags(tags) {
  try {
    const file = resolveDataPath("tags.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(tags, null, 2), "utf8");
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

export function getAllConversationTags() {
  try {
    const file = resolveDataPath("conversation_tags.json");
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error("[getAllConversationTags ERROR]", err);
  }
  return {};
}

export function getConversationTags(threadId) {
  if (!threadId) return [];
  const map = getAllConversationTags();
  return Array.isArray(map[threadId]) ? map[threadId] : [];
}

export function updateConversationTags(threadId, tags) {
  if (!threadId) return [];
  const map = getAllConversationTags();
  const cleanTags = Array.isArray(tags)
    ? Array.from(new Set(tags.map((t) => String(t || "").trim()).filter(Boolean)))
    : [];
  map[threadId] = cleanTags;

  try {
    const file = resolveDataPath("conversation_tags.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(map, null, 2), "utf8");
  } catch (err) {
    console.error("[updateConversationTags ERROR]", err);
  }
  return cleanTags;
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
