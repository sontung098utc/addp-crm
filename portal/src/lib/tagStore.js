import fs from "fs";
import path from "path";

export const COLOR_VARIANTS = {
  amber: "bg-amber-500/15 text-amber-400 dark:text-amber-300 border-amber-500/30",
  rose: "bg-rose-500/15 text-rose-400 dark:text-rose-300 border-rose-500/30",
  blue: "bg-blue-500/15 text-blue-400 dark:text-blue-300 border-blue-500/30",
  emerald: "bg-emerald-500/15 text-emerald-400 dark:text-emerald-300 border-emerald-500/30",
  purple: "bg-purple-500/15 text-purple-400 dark:text-purple-300 border-purple-500/30",
  teal: "bg-teal-500/15 text-teal-400 dark:text-teal-300 border-teal-500/30",
  indigo: "bg-indigo-500/15 text-indigo-400 dark:text-indigo-300 border-indigo-500/30",
  orange: "bg-orange-500/15 text-orange-400 dark:text-orange-300 border-orange-500/30",
  pink: "bg-pink-500/15 text-pink-400 dark:text-pink-300 border-pink-500/30",
  slate: "bg-slate-500/15 text-slate-400 dark:text-slate-300 border-slate-500/30",
};

export const DEFAULT_TAGS = [
  { id: "tag_vip", name: "Khách VIP", color: "amber", bg: COLOR_VARIANTS.amber },
  { id: "tag_hot", name: "Khách Nóng - Chốt Ngay", color: "rose", bg: COLOR_VARIANTS.rose },
  { id: "tag_tieu_duong", name: "Tiểu Đường", color: "blue", bg: COLOR_VARIANTS.blue },
  { id: "tag_men_gan", name: "Men Gan", color: "emerald", bg: COLOR_VARIANTS.emerald },
  { id: "tag_lan_tan_gia", name: "Lăn Tăn Giá", color: "purple", bg: COLOR_VARIANTS.purple },
  { id: "tag_da_chot", name: "Đã Chốt Đơn", color: "teal", bg: COLOR_VARIANTS.teal },
];

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
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
    // Khởi tạo file mặc định
    saveTags(DEFAULT_TAGS);
    return DEFAULT_TAGS;
  } catch (err) {
    console.error("[getTags ERROR]", err);
    return DEFAULT_TAGS;
  }
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
  };

  tags.push(newTag);
  saveTags(tags);
  return newTag;
}

export function deleteTag(id) {
  const tags = getTags();
  const filtered = tags.filter((t) => t.id !== id && t.name !== id);
  saveTags(filtered);
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
