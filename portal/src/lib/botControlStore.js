import fs from "fs";
import path from "path";

/**
 * ADDP Omnichannel AI CRM — Bộ Điều Khiển Trạng Thái AI Bot & Human-Takeover (WBS-32 & WBS-33)
 * Lưu trữ bền vững trạng thái Bot theo Kênh (channelId) và theo Hội thoại (threadId) vào `.data/bot_states.json`.
 * Tự động dừng Bot khi nhân viên nhảy vào chat (Human-Takeover) và tự động bật lại sau 45 phút không có tương tác của nhân viên.
 */

const DEFAULT_PAUSE_MINUTES = 45;

function getBotStatesFilePath() {
  try {
    const candidates = [
      path.resolve(process.cwd(), ".data", "bot_states.json"),
      path.resolve(process.cwd(), "portal", ".data", "bot_states.json"),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate) || fs.existsSync(path.dirname(candidate))) {
        return candidate;
      }
    }
    const fallback = candidates[0];
    fs.mkdirSync(path.dirname(fallback), { recursive: true });
    return fallback;
  } catch {
    return null;
  }
}

function createInitialStore() {
  return {
    channels: {},
    conversations: {},
  };
}

function loadBotStoreFromDisk() {
  try {
    const filePath = getBotStatesFilePath();
    if (filePath && fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
      const parsed = JSON.parse(raw);
      return {
        channels: parsed && typeof parsed.channels === "object" ? parsed.channels : {},
        conversations:
          parsed && typeof parsed.conversations === "object" ? parsed.conversations : {},
      };
    }
  } catch (err) {
    console.error("[BOT_CONTROL_LOAD_ERR]", err.message);
  }
  return createInitialStore();
}

function saveBotStoreToDisk(store) {
  try {
    const filePath = getBotStatesFilePath();
    if (!filePath) return;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(store, null, 2), "utf8");
  } catch (err) {
    console.error("[BOT_CONTROL_SAVE_ERR]", err.message);
  }
}

function getStore() {
  const diskStore = loadBotStoreFromDisk();
  globalThis.__addpBotControlStore = diskStore;
  return globalThis.__addpBotControlStore;
}

/**
 * Kiểm tra kênh đó có bật AI Bot hay không (mặc định `true`).
 * @param {string} channelId
 * @returns {boolean}
 */
export function isChannelBotEnabled(channelId = "DEFAULT") {
  const key = String(channelId || "DEFAULT").trim() || "DEFAULT";
  const store = getStore();
  const entry = store.channels[key];
  if (!entry || typeof entry.enabled !== "boolean") {
    return true;
  }
  return entry.enabled;
}

/**
 * Bật/Tắt AI Bot trên toàn kênh.
 * @param {string} channelId
 * @param {boolean} enabled
 */
export function setChannelBotStatus(channelId = "DEFAULT", enabled = true) {
  const key = String(channelId || "DEFAULT").trim() || "DEFAULT";
  const store = getStore();
  store.channels[key] = {
    enabled: Boolean(enabled),
    updatedAt: Date.now(),
  };
  saveBotStoreToDisk(store);
  return store.channels[key];
}

/**
 * Trả về trạng thái hiện tại của hội thoại.
 * Nếu đang ở chế độ `HUMAN` nhưng đã hết thời gian tạm dừng (`pausedUntil < Date.now()`, mặc định 45 phút),
 * tự động chuyển lại về `AI`.
 * @param {string} threadId
 * @returns {{ threadId: string, mode: 'AI' | 'HUMAN', pausedUntil: number | null, staffId: string | null, updatedAt: number }}
 */
export function getConversationBotState(threadId) {
  const key = String(threadId || "").trim();
  if (!key) {
    return {
      threadId: "",
      mode: "AI",
      pausedUntil: null,
      staffId: null,
      updatedAt: Date.now(),
    };
  }

  const store = getStore();
  const existing = store.conversations[key];

  if (!existing) {
    return {
      threadId: key,
      mode: "AI",
      pausedUntil: null,
      staffId: null,
      updatedAt: Date.now(),
    };
  }

  // Nếu đang ở chế độ HUMAN nhưng đã hết hạn tạm dừng -> tự động mở lại AI
  if (
    existing.mode === "HUMAN" &&
    existing.pausedUntil &&
    Number(existing.pausedUntil) < Date.now()
  ) {
    const reverted = {
      threadId: key,
      mode: "AI",
      pausedUntil: null,
      staffId: null,
      updatedAt: Date.now(),
      autoResumedAt: Date.now(),
    };
    store.conversations[key] = reverted;
    saveBotStoreToDisk(store);
    return reverted;
  }

  return {
    threadId: key,
    mode: existing.mode === "HUMAN" ? "HUMAN" : "AI",
    pausedUntil: existing.pausedUntil || null,
    staffId: existing.staffId || null,
    updatedAt: existing.updatedAt || Date.now(),
  };
}

/**
 * Gọi ngay lập tức khi nhân viên gõ tin nhắn trả lời thủ công hoặc bấm nút "Tắt Bot / Tiếp quản",
 * khóa AI trong hội thoại đó.
 * @param {string} threadId
 * @param {string} [staffId]
 * @param {number} [pauseMinutes=45]
 */
export function triggerHumanTakeover(
  threadId,
  staffId = "STAFF",
  pauseMinutes = DEFAULT_PAUSE_MINUTES
) {
  const key = String(threadId || "").trim();
  if (!key) return null;

  const minutes = Number(pauseMinutes) > 0 ? Number(pauseMinutes) : DEFAULT_PAUSE_MINUTES;
  const now = Date.now();
  const pausedUntil = now + minutes * 60 * 1000;

  const store = getStore();
  const nextState = {
    threadId: key,
    mode: "HUMAN",
    pausedUntil,
    staffId: String(staffId || "STAFF"),
    updatedAt: now,
  };
  store.conversations[key] = nextState;
  saveBotStoreToDisk(store);
  return nextState;
}

/**
 * Bật lại AI Bot cho hội thoại.
 * @param {string} threadId
 */
export function resumeAiBot(threadId) {
  const key = String(threadId || "").trim();
  if (!key) return null;

  const store = getStore();
  const nextState = {
    threadId: key,
    mode: "AI",
    pausedUntil: null,
    staffId: null,
    updatedAt: Date.now(),
  };
  store.conversations[key] = nextState;
  saveBotStoreToDisk(store);
  return nextState;
}
