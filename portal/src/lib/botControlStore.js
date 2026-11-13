import fs from "fs";
import path from "path";

/**
 * ADDP Omnichannel AI CRM — Bộ Điều Khiển Trạng Thái AI Bot & Human-Takeover Phân Cấp (Hierarchical Bot Control)
 * Tuân thủ nghiêm ngặt 2 cấp điều khiển:
 * 1. CẤP TÀI KHOẢN (Channel-level - Master Rule):
 *    - Đọc trực tiếp `botMode` của từng tài khoản kết nối từ `channels.json`.
 *    - Nếu tài khoản được cài đặt `botMode === 'HUMAN'`:
 *      * Khóa AI trên TOÀN BỘ hội thoại thuộc tài khoản này.
 *      * Bất kể trạng thái riêng của `threadId` là gì, `isBotActiveForThread` PHẢI LUÔN TRẢ VỀ `false` (Mode: HUMAN).
 *      * Bot Runner tuyệt đối không tự động sinh tin nhắn trả lời.
 * 2. CẤP HỘI THOẠI (Thread-level - Sub Rule):
 *    - Chỉ có hiệu lực khi Cấp Tài Khoản đang bật `botMode === 'AI'`.
 *    - Từng hội thoại có thể chuyển đổi giữa `AI` (tự động) và `HUMAN` (tạm dừng 45 phút khi nhân viên chat tay).
 */

const DEFAULT_PAUSE_MINUTES = 45;

function resolveDataDir() {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, "portal", "package.json"))) {
    return path.join(cwd, "portal", ".data");
  }
  return path.join(cwd, ".data");
}

function getBotStatesFilePath() {
  try {
    const dataDir = resolveDataDir();
    const candidate = path.join(dataDir, "bot_states.json");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    return candidate;
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
 * Đọc trực tiếp cấu hình `botMode` cấp độ Tài Khoản (Channel-level) từ `channels.json`.
 * Hỗ trợ tra cứu theo id, externalId, ownId, tên tài khoản ("Sơn Tùng", "Lê Quyên", "Zalo: Sơn Tùng"...).
 * @param {string} channelOrAccountId
 * @returns {'AI' | 'HUMAN'}
 */
export function getChannelBotMode(channelOrAccountId = "") {
  const query = String(channelOrAccountId || "").trim().toLowerCase();
  if (!query || query === "default") return "HUMAN";

  const store = getStore();
  const explicitStoreEntry =
    store.channels[query] ||
    store.channels[channelOrAccountId] ||
    store.channels[`zalo_${query}`] ||
    (query.includes("zalo") ? store.channels["ZALO_PERSONAL"] : null);

  if (explicitStoreEntry && typeof explicitStoreEntry.enabled === "boolean") {
    if (!explicitStoreEntry.enabled) return "HUMAN";
  }

  try {
    const dataDir = resolveDataDir();
    const channelsPath = path.join(dataDir, "channels.json");
    if (fs.existsSync(channelsPath)) {
      const raw = fs.readFileSync(channelsPath, "utf8").replace(/^\uFEFF/, "");
      const channels = JSON.parse(raw);
      if (Array.isArray(channels)) {
        for (const ch of channels) {
          if (!ch) continue;
          const chId = String(ch.id || "").toLowerCase();
          const extId = String(ch.externalId || "").toLowerCase();
          const ownId = String(ch.config?.ownId || "").toLowerCase();
          const accName = String(ch.config?.accountName || ch.name || "").toLowerCase();
          const label = String(ch.config?.label || "").toLowerCase();

          const isMatch =
            chId === query ||
            extId === query ||
            ownId === query ||
            `zalo_${extId}` === query ||
            `zalo_${ownId}` === query ||
            (query.length >= 3 &&
              (chId.includes(query) ||
                extId.includes(query) ||
                ownId.includes(query) ||
                accName.includes(query) ||
                label.includes(query) ||
                query.includes(accName) ||
                query.includes(label)));

          if (isMatch) {
            return ch.botMode === "AI" ? "AI" : "HUMAN";
          }
        }
      }
    }
  } catch (err) {
    console.error("[GET_CHANNEL_BOT_MODE_ERR]", err.message);
  }

  if (explicitStoreEntry && explicitStoreEntry.enabled === true) {
    return "AI";
  }

  return "HUMAN";
}

/**
 * Kiểm tra kênh đó có bật AI Bot hay không.
 * Nếu tài khoản ở channels.json cấu hình `botMode === 'HUMAN'` -> trả về `false`.
 * @param {string} channelId
 * @returns {boolean}
 */
export function isChannelBotEnabled(channelId = "DEFAULT") {
  const mode = getChannelBotMode(channelId);
  return mode === "AI";
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

  // Đồng bộ sang channels.json nếu tìm thấy channel tương ứng
  try {
    const dataDir = resolveDataDir();
    const channelsPath = path.join(dataDir, "channels.json");
    if (fs.existsSync(channelsPath)) {
      const raw = fs.readFileSync(channelsPath, "utf8").replace(/^\uFEFF/, "");
      const channels = JSON.parse(raw);
      if (Array.isArray(channels)) {
        let changed = false;
        const q = key.toLowerCase();
        for (const ch of channels) {
          if (!ch) continue;
          const chId = String(ch.id || "").toLowerCase();
          const extId = String(ch.externalId || "").toLowerCase();
          const ownId = String(ch.config?.ownId || "").toLowerCase();
          if (
            chId === q ||
            extId === q ||
            ownId === q ||
            `zalo_${extId}` === q ||
            `zalo_${ownId}` === q
          ) {
            ch.botMode = enabled ? "AI" : "HUMAN";
            changed = true;
          }
        }
        if (changed) {
          fs.writeFileSync(channelsPath, JSON.stringify(channels, null, 2), "utf8");
        }
      }
    }
  } catch {}

  return store.channels[key];
}

/**
 * Trả về trạng thái hiện tại của hội thoại theo threadId.
 * @param {string} threadId
 * @returns {{ threadId: string, mode: 'AI' | 'HUMAN', pausedUntil: number | null, staffId: string | null, updatedAt: number }}
 */
export function getConversationBotState(threadId) {
  const key = String(threadId || "").trim();
  if (!key) return null;

  const store = getStore();
  const existing = store.conversations[key];

  // Nếu khách hàng chưa có cài đặt riêng -> trả về null để kế thừa chế độ Cấp Tài Khoản (Toàn Nick)
  if (!existing) {
    return null;
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
    isExplicit: true,
  };
}

/**
 * QUY TẮC PHÂN CẤP QUYỀN ĐIỀU KHIỂN BOT (Hierarchical Bot Control):
 * 1. CẤP TÀI KHOẢN (Channel-level - Master Rule):
 *    - Đọc `botMode` của tài khoản Zalo sở hữu hội thoại từ `channels.json`.
 *    - NẾU `botMode === 'HUMAN'`:
 *      * Khóa Bot AI trên TOÀN BỘ hội thoại thuộc tài khoản này.
 *      * Bất kể trạng thái riêng của `threadId` là gì, hàm `isBotActiveForThread` PHẢI LUÔN TRẢ VỀ `false` (Mode: HUMAN).
 *      * Bot Runner tuyệt đối không tự động sinh tin nhắn trả lời.
 * 2. CẤP HỘI THOẠI (Thread-level - Sub Rule):
 *    - Chỉ có hiệu lực khi Cấp Tài Khoản đang bật `botMode === 'AI'`.
 *    - Khi đó, từng hội thoại mới có thể chuyển đổi linh hoạt giữa `AI` (tự động) và `HUMAN` (tạm dừng 45 phút khi nhân viên vào chat tay).
 *
 * @param {string} threadId - Mã hội thoại
 * @param {string} channelOrAccountId - Định danh tài khoản/kênh sở hữu hội thoại
 * @returns {{ active: boolean, mode: 'AI' | 'HUMAN', reason: string, pausedUntil: number | null, staffId: string | null, accountMode: 'AI' | 'HUMAN' }}
 */
export function isBotActiveForThread(threadId = "", channelOrAccountId = "") {
  const tid = String(threadId || "").trim();
  const accountMode = getChannelBotMode(channelOrAccountId);

  // 1. CẤP HỘI THOẠI RIÊNG BIỆT (Per-customer Explicit Selection):
  // Theo quy tắc cốt lõi: Mặc định tất cả mọi khách hàng là Nhân viên trực (HUMAN).
  // CHỈ khi người dùng tự tay chỉ định cho khách hàng này chat AI (convState.mode === 'AI'),
  // thì khách hàng đó mới được kích hoạt AI Bot.
  if (tid) {
    const convState = getConversationBotState(tid);
    if (convState && convState.mode === "AI") {
      return {
        active: true,
        mode: "AI",
        reason: "EXPLICIT_THREAD_AI",
        pausedUntil: null,
        staffId: null,
        accountMode,
        isExplicit: true,
      };
    }
    // Mọi khách hàng khác chưa được chỉ định hoặc đã tắt -> Luôn luôn là Nhân viên trực (HUMAN)
    return {
      active: false,
      mode: "HUMAN",
      reason: convState?.mode === "HUMAN" ? "THREAD_LEVEL_PAUSED" : "DEFAULT_HUMAN",
      pausedUntil: convState?.pausedUntil || null,
      staffId: convState?.staffId || "STAFF",
      accountMode,
      isExplicit: Boolean(convState),
    };
  }

  // 2. CẤP TÀI KHOẢN (Khi không truyền threadId - chỉ kiểm tra toàn nick):
  if (accountMode === "AI") {
    return {
      active: true,
      mode: "AI",
      reason: "ACCOUNT_LEVEL_AI",
      pausedUntil: null,
      staffId: null,
      accountMode: "AI",
      isExplicit: false,
    };
  }

  return {
    active: false,
    mode: "HUMAN",
    reason: "ACCOUNT_LEVEL_HUMAN",
    pausedUntil: null,
    staffId: "STAFF",
    accountMode: "HUMAN",
    isExplicit: false,
  };
}

/**
 * Tự động đồng bộ và làm mới bộ nhớ đệm trạng thái bot (`bot_states.json`) theo `channels.json`
 * để đảm bảo không còn tình trạng kênh báo Nhân viên trực mà thread lại giữ cờ AI cũ.
 */
export function syncBotStatesWithChannels() {
  try {
    const dataDir = resolveDataDir();
    const channelsPath = path.join(dataDir, "channels.json");
    if (!fs.existsSync(channelsPath)) return;

    const raw = fs.readFileSync(channelsPath, "utf8").replace(/^\uFEFF/, "");
    const channels = JSON.parse(raw);
    if (!Array.isArray(channels)) return;

    const store = getStore();
    for (const ch of channels) {
      if (!ch || !ch.id) continue;
      const isEnabled = ch.botMode === "AI";
      store.channels[String(ch.id)] = {
        enabled: isEnabled,
        updatedAt: Date.now(),
      };
      if (ch.externalId) {
        store.channels[String(ch.externalId)] = {
          enabled: isEnabled,
          updatedAt: Date.now(),
        };
        store.channels[`zalo_${ch.externalId}`] = {
          enabled: isEnabled,
          updatedAt: Date.now(),
        };
      }
    }
    saveBotStoreToDisk(store);
  } catch (err) {
    console.error("[SYNC_BOT_STATES_ERR]", err.message);
  }
}

// Khởi chạy đồng bộ ngay khi module được nạp
syncBotStatesWithChannels();

/**
 * Gọi khi nhân viên gõ tin nhắn trả lời thủ công hoặc bấm nút "Tắt Bot / Tiếp quản",
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
