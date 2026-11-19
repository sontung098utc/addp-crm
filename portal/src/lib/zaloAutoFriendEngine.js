import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { normalizePhone, isValidVietnamPhone } from "./phone.js";
import {
  findJavisZaloRoot,
  getAllActiveZaloHomes,
  getOwnIdForHome,
  getActiveZaloAccountName,
} from "./zaloRunner.js";
import { listAllChannels } from "./connectionHub.js";
import { DEFAULT_DAILY_ZALO_MSG_LIMIT, isSafePilotMode } from "./pilotConfig.js";

/**
 * ADDP CRM — Zalo Personal Auto-Friend Engine & Anti-Ban Queue
 * Tuân thủ Điều 3 (Chuẩn hóa SĐT 10 số VN), Điều 4 (Giãn cách 45-120s, giới hạn ngày/nick),
 * Điều 9 (Tiếng Việt chuẩn) và Điều 11 (Không số liệu ảo) của AGENTS.md.
 */

export const ZALO_FRIEND_MSG_MAX_LEN = 150;
export const DEFAULT_MIN_DELAY_SEC = 45;
export const DEFAULT_MAX_DELAY_SEC = 120;
export const DEFAULT_DAILY_FRIEND_LIMIT = Math.min(50, DEFAULT_DAILY_ZALO_MSG_LIMIT);

function getDataFilePath() {
  const candidates = [
    path.resolve(process.cwd(), ".data", "zalo_auto_friend.json"),
    path.resolve(process.cwd(), "portal", ".data", "zalo_auto_friend.json"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) || fs.existsSync(path.dirname(c))) {
      return c;
    }
  }
  const fallback = candidates[0];
  fs.mkdirSync(path.dirname(fallback), { recursive: true });
  return fallback;
}

function loadFromDisk() {
  try {
    const fp = getDataFilePath();
    if (fp && fs.existsSync(fp)) {
      const raw = fs.readFileSync(fp, "utf8").replace(/^\uFEFF/, "");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.error("[ZALO_AUTO_FRIEND_LOAD_ERR]", err.message);
  }
  return [];
}

function saveToDisk(campaigns) {
  try {
    const fp = getDataFilePath();
    if (!fp) return;
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, JSON.stringify(campaigns, null, 2), "utf8");
    try {
      globalThis.__addpAutoFriendLastMtime = fs.statSync(fp).mtimeMs;
    } catch {}
  } catch (err) {
    console.error("[ZALO_AUTO_FRIEND_SAVE_ERR]", err.message);
  }
}

if (!globalThis.__addpAutoFriendCampaigns) {
  globalThis.__addpAutoFriendCampaigns = loadFromDisk();
  try {
    const fp = getDataFilePath();
    if (fp && fs.existsSync(fp)) {
      globalThis.__addpAutoFriendLastMtime = fs.statSync(fp).mtimeMs;
    }
  } catch {}
}

if (!globalThis.__addpAutoFriendRunners) {
  globalThis.__addpAutoFriendRunners = new Map();
}

function getCampaignStore() {
  try {
    const fp = getDataFilePath();
    if (fp && fs.existsSync(fp)) {
      const mtime = fs.statSync(fp).mtimeMs;
      if (mtime > (globalThis.__addpAutoFriendLastMtime || 0)) {
        globalThis.__addpAutoFriendCampaigns = loadFromDisk();
        globalThis.__addpAutoFriendLastMtime = mtime;
      }
    }
  } catch {}
  return globalThis.__addpAutoFriendCampaigns;
}

/**
 * Tách và chuẩn hóa danh sách SĐT từ nội dung CSV / TXT / văn bản dán tay (Điều 3 AGENTS.md).
 */
export function parseAndNormalizePhones(rawInput) {
  const tokens = [];

  if (Array.isArray(rawInput)) {
    for (const item of rawInput) {
      if (item !== null && item !== undefined) {
        const parts = String(item).split(/[\r\n,;\t]+/);
        for (const p of parts) {
          const trimmed = p.replace(/^["'\s]+|["'\s]+$/g, "").trim();
          if (trimmed) tokens.push(trimmed);
        }
      }
    }
  } else {
    const text = String(rawInput || "");
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      const cells = line.split(/[,;\t]+/);
      for (const cell of cells) {
        const trimmed = cell.replace(/^["'\s]+|["'\s]+$/g, "").trim();
        if (trimmed) tokens.push(trimmed);
      }
    }
  }

  const seen = new Set();
  const validPhones = [];
  const invalidEntries = [];
  let duplicateCount = 0;

  for (const raw of tokens) {
    // Bỏ qua dòng tiêu đề CSV phổ biến (VD: "phone", "sdt", "số điện thoại")
    if (/^(phone|sdt|so[_\s]*dien[_\s]*thoai|số điện thoại|mobile|tel)$/i.test(raw)) {
      continue;
    }
    const normalized = normalizePhone(raw);
    if (isValidVietnamPhone(normalized)) {
      if (seen.has(normalized)) {
        duplicateCount += 1;
      } else {
        seen.add(normalized);
        validPhones.push(normalized);
      }
    } else {
      invalidEntries.push({
        raw,
        normalized: normalized || "",
        reason: "Không đúng định dạng SĐT di động Việt Nam 10 số (03/05/07/08/09).",
      });
    }
  }

  return {
    validPhones,
    invalidEntries,
    duplicateCount,
    totalRaw: validPhones.length + duplicateCount + invalidEntries.length,
    validCount: validPhones.length,
    invalidCount: invalidEntries.length,
  };
}

/**
 * Tính số lượt đã gửi kết bạn trong ngày hôm nay theo từng nick Zalo (ownId / accountId).
 */
export function getFriendRequestsSentTodayMap() {
  const store = getCampaignStore();
  const todayStr = new Date().toISOString().slice(0, 10);
  const counts = {};

  for (const camp of store) {
    const logs = Array.isArray(camp.logs) ? camp.logs : [];
    for (const log of logs) {
      if (
        log.status === "SENT" &&
        String(log.timestamp || "").startsWith(todayStr)
      ) {
        const key = String(log.ownId || log.accountId || "").trim();
        if (key) {
          counts[key] = (counts[key] || 0) + 1;
        }
      }
    }
  }
  return counts;
}

/**
 * Lấy danh sách tài khoản Zalo cá nhân đang kết nối thực tế trên hệ thống.
 */
export function listConnectedZaloAccounts() {
  const activeHomes = getAllActiveZaloHomes() || [];
  const hubChannels = (listAllChannels() || []).filter(
    (ch) => String(ch.platform || "").toUpperCase() === "ZALO_PERSONAL"
  );
  const sentTodayMap = getFriendRequestsSentTodayMap();
  const accountsByKey = new Map();

  for (const home of activeHomes) {
    const candidateDirs = Array.from(
      new Set([
        ...(typeof home === "object" && Array.isArray(home?.allHomeDirs) ? home.allHomeDirs : []),
        typeof home === "string" ? home : home?.homeDir || "",
      ].filter(Boolean))
    );
    if (candidateDirs.length === 0) continue;

    // Ưu tiên thư mục có file credentials/*.json mới nhất (mtimeMs lớn nhất)
    let bestHomeDir = "";
    let bestCredMtime = -1;
    for (const dir of candidateDirs) {
      const credDir = path.join(dir, ".zalo-agent-cli", "credentials");
      if (!fs.existsSync(credDir)) continue;
      try {
        const files = fs.readdirSync(credDir).filter((f) => f.endsWith(".json"));
        for (const f of files) {
          const st = fs.statSync(path.join(credDir, f));
          if (st.mtimeMs > bestCredMtime) {
            bestCredMtime = st.mtimeMs;
            bestHomeDir = dir;
          }
        }
        if (!bestHomeDir) bestHomeDir = dir;
      } catch {}
    }

    const homeDir = bestHomeDir || candidateDirs[0];
    const credPath = path.join(homeDir, ".zalo-agent-cli", "credentials");
    if (!fs.existsSync(credPath)) continue;

    const ownId = String((typeof home === "object" && home?.ownId) || getOwnIdForHome(homeDir) || "").trim();
    const name = String(
      (typeof home === "object" && (home?.accountName || home?.name)) ||
        getActiveZaloAccountName(homeDir) ||
        `Zalo (${ownId || path.basename(homeDir)})`
    ).trim();

    const matchedHub = hubChannels.find(
      (ch) =>
        (ownId && (String(ch.externalId) === ownId || String(ch.config?.ownId) === ownId)) ||
        (ch.config?.homeDir && candidateDirs.some((d) => path.resolve(ch.config.homeDir) === path.resolve(d)))
    );

    const key = ownId || homeDir;
    accountsByKey.set(key, {
      id: matchedHub?.id || ownId || homeDir,
      ownId: ownId || matchedHub?.externalId || "",
      externalId: ownId || matchedHub?.externalId || "",
      homeDir,
      allHomeDirs: candidateDirs,
      name: matchedHub?.name || name,
      platform: "ZALO_PERSONAL",
      status: "CONNECTED",
      sentToday: sentTodayMap[ownId] || sentTodayMap[matchedHub?.id] || 0,
      config: {
        ...(matchedHub?.config || {}),
        homeDir,
        allHomeDirs: candidateDirs,
        ownId,
      },
    });
  }

  return Array.from(accountsByKey.values());
}

/**
 * Render nội dung lời mời kết bạn (hỗ trợ Spin Text `{a|b}` và biến `{phone}`), giới hạn 150 ký tự.
 */
export function renderFriendInviteMessage(template = "", phone = "") {
  let text = String(template || "").trim();
  if (!text) return "";

  text = text.replace(/\{phone\}/gi, String(phone || ""));
  text = text.replace(/\{([^{}]*[|/][^{}]*)\}/g, (_, group) => {
    const delimiter = group.includes("|") ? "|" : "/";
    const opts = group
      .split(delimiter)
      .map((s) => s.trim())
      .filter(Boolean);
    if (opts.length === 0) return "";
    return opts[Math.floor(Math.random() * opts.length)];
  });

  return text.replace(/[ \t]{2,}/g, " ").trim().slice(0, ZALO_FRIEND_MSG_MAX_LEN);
}

function computeCampaignStats(items = []) {
  let pending = 0;
  let sent = 0;
  let alreadyFriend = 0;
  let notFound = 0;
  let error = 0;

  for (const item of items) {
    switch (item.status) {
      case "SENT":
        sent += 1;
        break;
      case "ALREADY_FRIEND":
        alreadyFriend += 1;
        break;
      case "NOT_FOUND":
        notFound += 1;
        break;
      case "ERROR":
        error += 1;
        break;
      default:
        pending += 1;
        break;
    }
  }

  const total = items.length;
  const processed = total - pending;
  return {
    total,
    processed,
    pending,
    sent,
    alreadyFriend,
    notFound,
    error,
  };
}

function runAutoFriendWorker({ homeDir, allHomeDirs = [], ownId = "", phone, message }) {
  return new Promise((resolve) => {
    const javisRoot = findJavisZaloRoot(homeDir);
    const workerCandidates = [
      path.resolve(process.cwd(), "src", "lib", "zaloAutoFriendWorker.mjs"),
      path.resolve(process.cwd(), "portal", "src", "lib", "zaloAutoFriendWorker.mjs"),
    ];
    const workerPath = workerCandidates.find((p) => fs.existsSync(p));

    if (!workerPath || !javisRoot || !homeDir) {
      resolve({
        ok: false,
        status: "ERROR",
        detail: !javisRoot
          ? "Không tìm thấy thư viện javis-zalo trên máy chủ."
          : "Thiếu worker kết bạn Zalo hoặc thư mục tài khoản.",
      });
      return;
    }

    const childEnv = {
      ...process.env,
      HOME: homeDir,
      USERPROFILE: homeDir,
      JAVIS_ZALO_ROOT: javisRoot,
      ALL_HOME_DIRS: JSON.stringify(allHomeDirs.length > 0 ? allHomeDirs : [homeDir]),
      TARGET_OWN_ID: String(ownId || ""),
      TARGET_PHONE: String(phone || ""),
      FRIEND_MESSAGE: String(message || "").slice(0, ZALO_FRIEND_MSG_MAX_LEN),
      ZALO_JSON_MODE: "1",
    };

    execFile(
      process.execPath,
      [workerPath],
      { env: childEnv, timeout: 30000, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err && !stdout) {
          resolve({
            ok: false,
            status: "ERROR",
            detail: `Lỗi tiến trình Zalo: ${err.message}`,
          });
          return;
        }
        try {
          const lines = String(stdout || "")
            .trim()
            .split(/\r?\n/)
            .filter(Boolean);
          const lastLine = lines[lines.length - 1] || "{}";
          resolve(JSON.parse(lastLine));
        } catch {
          resolve({
            ok: false,
            status: "ERROR",
            detail: "Phản hồi từ Zalo worker không hợp lệ.",
          });
        }
      }
    );
  });
}

function clearRunnerTimer(campaignId) {
  const runner = globalThis.__addpAutoFriendRunners.get(campaignId);
  if (runner?.timer) {
    clearTimeout(runner.timer);
  }
  globalThis.__addpAutoFriendRunners.delete(campaignId);
}

function randomDelayMs(minSec, maxSec) {
  const low = Math.max(DEFAULT_MIN_DELAY_SEC, Number(minSec) || DEFAULT_MIN_DELAY_SEC);
  const high = Math.max(low, Number(maxSec) || DEFAULT_MAX_DELAY_SEC);
  return Math.floor((low + Math.random() * (high - low)) * 1000);
}

async function processNextItem(campaignId) {
  const store = getCampaignStore();
  const camp = store.find((c) => c.id === campaignId);
  if (!camp || camp.status !== "RUNNING") {
    clearRunnerTimer(campaignId);
    return;
  }

  const nextIdx = camp.items.findIndex((it) => it.status === "PENDING");
  if (nextIdx === -1) {
    camp.status = "COMPLETED";
    camp.completedAt = new Date().toISOString();
    camp.stats = computeCampaignStats(camp.items);
    saveToDisk(store);
    clearRunnerTimer(campaignId);
    return;
  }

  const item = camp.items[nextIdx];
  const savedAccounts = Array.isArray(camp.accounts) ? camp.accounts : [];
  if (savedAccounts.length === 0) {
    camp.status = "PAUSED";
    camp.statusNote = "Không có nick Zalo khả dụng để tiếp tục.";
    saveToDisk(store);
    clearRunnerTimer(campaignId);
    return;
  }

  // Luôn đối chiếu với danh sách nick Zalo kết nối mới nhất (tránh dùng snapshot homeDir cũ nếu vừa quét lại QR)
  const liveAccounts = listConnectedZaloAccounts();
  const accounts = savedAccounts.map((saved) => {
    const fresh = liveAccounts.find(
      (la) =>
        (saved.ownId && (la.ownId === saved.ownId || la.externalId === saved.ownId)) ||
        (saved.id && la.id === saved.id) ||
        (saved.name && la.name === saved.name)
    );
    if (!fresh) return saved;
    const mergedDirs = Array.from(
      new Set([...(fresh.allHomeDirs || []), fresh.homeDir, ...(saved.allHomeDirs || []), saved.homeDir].filter(Boolean))
    );
    return {
      ...saved,
      ...fresh,
      allHomeDirs: mergedDirs,
    };
  });

  // Xoay vòng tài khoản & kiểm tra giới hạn/ngày/nick (Anti-Ban Điều 4 AGENTS.md)
  const sentMap = getFriendRequestsSentTodayMap();
  const dailyLimit = Math.min(
    DEFAULT_DAILY_ZALO_MSG_LIMIT,
    Math.max(1, Number(camp.config?.dailyLimitPerAccount) || DEFAULT_DAILY_FRIEND_LIMIT)
  );

  let chosenAccount = null;
  const startCursor = Number(camp.accountCursor || 0);
  for (let offset = 0; offset < accounts.length; offset++) {
    const idx = (startCursor + offset) % accounts.length;
    const acc = accounts[idx];
    const key = String(acc.ownId || acc.id || "");
    const usedToday = sentMap[key] || 0;
    if (usedToday < dailyLimit) {
      chosenAccount = acc;
      camp.accountCursor = (idx + 1) % accounts.length;
      break;
    }
  }

  if (!chosenAccount) {
    camp.status = "PAUSED";
    camp.statusNote = `Tất cả nick Zalo đã đạt giới hạn an toàn ${dailyLimit} lời mời/ngày. Chiến dịch tự động tạm dừng để bảo vệ tài khoản.`;
    saveToDisk(store);
    clearRunnerTimer(campaignId);
    return;
  }

  const renderedMsg = renderFriendInviteMessage(camp.messageTemplate, item.phone);
  let result;

  if (isSafePilotMode() || camp.mockMode) {
    result = {
      ok: true,
      status: "SENT",
      ownId: chosenAccount.ownId,
      uid: `mock_${item.phone}`,
      displayName: `Khách ${item.phone.slice(-4)}`,
      detail: "[CHẾ ĐỘ THỬ NGHIỆM] Giả lập gửi lời mời kết bạn an toàn.",
    };
  } else {
    result = await runAutoFriendWorker({
      homeDir: chosenAccount.homeDir,
      allHomeDirs: chosenAccount.allHomeDirs || [chosenAccount.homeDir],
      ownId: chosenAccount.ownId || chosenAccount.externalId || "",
      phone: item.phone,
      message: renderedMsg,
    });
  }

  // Re-check trạng thái sau khi worker chạy xong (tránh ghi đè nếu người dùng vừa bấm Pause/Cancel)
  const latestStore = getCampaignStore();
  const latestCamp = latestStore.find((c) => c.id === campaignId);
  if (!latestCamp) {
    clearRunnerTimer(campaignId);
    return;
  }

  const nowIso = new Date().toISOString();
  const targetItem = latestCamp.items[nextIdx];
  targetItem.status = result.status || (result.ok ? "SENT" : "ERROR");
  targetItem.accountId = chosenAccount.id;
  targetItem.ownId = chosenAccount.ownId;
  targetItem.accountName = chosenAccount.name;
  targetItem.uid = result.uid || "";
  targetItem.displayName = result.displayName || "";
  targetItem.renderedMessage = renderedMsg;
  targetItem.detail = result.detail || "";
  targetItem.updatedAt = nowIso;

  latestCamp.logs.unshift({
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    phone: targetItem.phone,
    status: targetItem.status,
    accountId: chosenAccount.id,
    ownId: chosenAccount.ownId,
    accountName: chosenAccount.name,
    uid: targetItem.uid,
    displayName: targetItem.displayName,
    renderedMessage: renderedMsg,
    detail: targetItem.detail,
    timestamp: nowIso,
  });
  if (latestCamp.logs.length > 1000) {
    latestCamp.logs = latestCamp.logs.slice(0, 1000);
  }

  latestCamp.stats = computeCampaignStats(latestCamp.items);

  if (latestCamp.stats.pending === 0) {
    latestCamp.status = "COMPLETED";
    latestCamp.completedAt = nowIso;
    saveToDisk(latestStore);
    clearRunnerTimer(campaignId);
    return;
  }

  saveToDisk(latestStore);

  if (latestCamp.status !== "RUNNING") {
    clearRunnerTimer(campaignId);
    return;
  }

  const delayMs =
    isSafePilotMode() || latestCamp.mockMode
      ? 1200
      : randomDelayMs(latestCamp.config?.minDelaySec, latestCamp.config?.maxDelaySec);

  latestCamp.nextRunAt = new Date(Date.now() + delayMs).toISOString();
  saveToDisk(latestStore);

  const timer = setTimeout(() => {
    processNextItem(campaignId).catch((err) => {
      console.error("[ZALO_AUTO_FRIEND_RUNNER_ERR]", err);
    });
  }, delayMs);

  globalThis.__addpAutoFriendRunners.set(campaignId, { timer });
}

export function startRunnerForCampaign(campaignId, delayMs = 100) {
  clearRunnerTimer(campaignId);
  const timer = setTimeout(() => {
    processNextItem(campaignId).catch((err) => {
      console.error("[ZALO_AUTO_FRIEND_START_ERR]", err);
    });
  }, delayMs);
  globalThis.__addpAutoFriendRunners.set(campaignId, { timer });
}

export function createAutoFriendCampaign({
  name,
  phones = [],
  accounts = [],
  messageTemplate = "",
  minDelaySec = DEFAULT_MIN_DELAY_SEC,
  maxDelaySec = DEFAULT_MAX_DELAY_SEC,
  dailyLimitPerAccount = DEFAULT_DAILY_FRIEND_LIMIT,
  scheduledAt = null,
  createdBy = null,
  mockMode = false,
}) {
  const parsed = parseAndNormalizePhones(phones);
  if (parsed.validPhones.length === 0) {
    return { ok: false, error: "Không có số điện thoại hợp lệ nào để chạy kết bạn." };
  }
  if (!Array.isArray(accounts) || accounts.length === 0) {
    return { ok: false, error: "Vui lòng chọn ít nhất 1 nick Zalo cá nhân." };
  }

  const cleanMsg = String(messageTemplate || "").trim();
  if (!cleanMsg) {
    return { ok: false, error: "Vui lòng nhập nội dung lời mời kết bạn." };
  }
  if (cleanMsg.length > ZALO_FRIEND_MSG_MAX_LEN && !/\{[^{}]*[|/][^{}]*\}/.test(cleanMsg)) {
    return {
      ok: false,
      error: `Lời mời kết bạn tối đa ${ZALO_FRIEND_MSG_MAX_LEN} ký tự theo quy định Zalo.`,
    };
  }

  const safeMinDelay = Math.max(DEFAULT_MIN_DELAY_SEC, Number(minDelaySec) || DEFAULT_MIN_DELAY_SEC);
  const safeMaxDelay = Math.max(safeMinDelay, Number(maxDelaySec) || DEFAULT_MAX_DELAY_SEC);
  const safeDailyLimit = Math.min(
    DEFAULT_DAILY_ZALO_MSG_LIMIT,
    Math.max(1, Number(dailyLimitPerAccount) || DEFAULT_DAILY_FRIEND_LIMIT)
  );

  let isScheduledFuture = false;
  let scheduleDelayMs = 100;
  let scheduledIso = null;
  if (scheduledAt) {
    const targetMs = new Date(scheduledAt).getTime();
    if (!Number.isNaN(targetMs) && targetMs > Date.now() + 5000) {
      isScheduledFuture = true;
      scheduleDelayMs = Math.min(targetMs - Date.now(), 2147483000);
      scheduledIso = new Date(targetMs).toISOString();
    }
  }

  const nowIso = new Date().toISOString();
  const id = `zaf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const items = parsed.validPhones.map((phone) => ({
    phone,
    status: "PENDING",
    accountId: "",
    ownId: "",
    accountName: "",
    uid: "",
    displayName: "",
    renderedMessage: "",
    detail: "Đang chờ xử lý",
    updatedAt: nowIso,
  }));

  const campaign = {
    id,
    name:
      String(name || "").trim() ||
      `Kết bạn Zalo (${parsed.validPhones.length} SĐT) - ${new Date().toLocaleDateString("vi-VN")}`,
    status: isScheduledFuture ? "SCHEDULED" : "RUNNING",
    statusNote: isScheduledFuture
      ? `Đã hẹn giờ chạy lúc ${new Date(scheduledIso).toLocaleString("vi-VN")}`
      : "",
    createdAt: nowIso,
    scheduledAt: scheduledIso,
    nextRunAt: isScheduledFuture ? scheduledIso : nowIso,
    completedAt: null,
    createdBy: createdBy
      ? { id: createdBy.id, name: createdBy.fullName || createdBy.name || createdBy.username }
      : null,
    accounts: accounts.map((a) => ({
      id: a.id,
      ownId: a.ownId,
      name: a.name,
      homeDir: a.homeDir,
    })),
    accountCursor: 0,
    messageTemplate: cleanMsg,
    config: {
      minDelaySec: safeMinDelay,
      maxDelaySec: safeMaxDelay,
      dailyLimitPerAccount: safeDailyLimit,
    },
    mockMode: Boolean(mockMode),
    stats: computeCampaignStats(items),
    items,
    logs: [],
  };

  const store = getCampaignStore();
  store.unshift(campaign);
  if (store.length > 50) {
    store.length = 50;
  }
  saveToDisk(store);

  if (isScheduledFuture) {
    const timer = setTimeout(() => {
      const s = getCampaignStore();
      const c = s.find((x) => x.id === id);
      if (c && c.status === "SCHEDULED") {
        c.status = "RUNNING";
        c.statusNote = "";
        saveToDisk(s);
        processNextItem(id).catch((err) => console.error("[ZALO_AUTO_FRIEND_SCHED_ERR]", err));
      }
    }, scheduleDelayMs);
    globalThis.__addpAutoFriendRunners.set(id, { timer });
  } else {
    startRunnerForCampaign(id, 100);
  }

  return { ok: true, campaign };
}

export function controlAutoFriendCampaign(id, action) {
  const store = getCampaignStore();
  const camp = store.find((c) => c.id === id);
  if (!camp) {
    return { ok: false, error: "Không tìm thấy chiến dịch kết bạn." };
  }

  const act = String(action || "").toLowerCase();
  if (act === "pause") {
    clearRunnerTimer(id);
    if (camp.status === "RUNNING" || camp.status === "SCHEDULED") {
      camp.status = "PAUSED";
      camp.statusNote = "Đã tạm dừng bởi nhân sự.";
      saveToDisk(store);
    }
    return { ok: true, campaign: camp };
  }

  if (act === "resume") {
    if (camp.status === "PAUSED" || camp.status === "SCHEDULED") {
      const pendingCount = camp.items.filter((i) => i.status === "PENDING").length;
      if (pendingCount === 0) {
        camp.status = "COMPLETED";
        camp.completedAt = new Date().toISOString();
        saveToDisk(store);
        return { ok: true, campaign: camp };
      }
      camp.status = "RUNNING";
      camp.statusNote = "";
      saveToDisk(store);
      startRunnerForCampaign(id, 100);
    }
    return { ok: true, campaign: camp };
  }

  if (act === "cancel") {
    clearRunnerTimer(id);
    if (camp.status !== "COMPLETED") {
      camp.status = "CANCELLED";
      camp.statusNote = "Đã hủy chiến dịch.";
      saveToDisk(store);
    }
    return { ok: true, campaign: camp };
  }

  return { ok: false, error: "Hành động không hợp lệ (chỉ hỗ trợ pause, resume, cancel)." };
}

export function getAllAutoFriendCampaigns() {
  return getCampaignStore();
}
