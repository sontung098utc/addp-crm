import { execFile, spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import {
  isChannelBotEnabled,
  getConversationBotState,
  isBotActiveForThread,
} from "./botControlStore.js";
import { generateHumanLikeReply, extractCustomerPhoneFromMessage } from "./ai/chatBotEngine.js";
import { getOrCreateCustomerByPhone } from "./customerIdentityResolver.js";
import { syncCustomerMedicalStateFromMessage } from "./customerStore.js";

/**
 * ADDP Omnichannel AI CRM — High Performance Zalo CLI & Direct Sync Runner (Cross-Platform)
 * Tự động nhận diện môi trường Windows / Linux (CentOS, AlmaLinux, Ubuntu).
 * Hỗ trợ đa tài khoản độc lập qua connector-home, tiến trình đồng bộ ngầm (mcp start --http)
 * và đồng bộ trực tiếp Nhóm + Danh bạ + Ghim qua HTTP REST (zaloDirectSyncWorker.mjs).
 */

const LOCAL_ENTRY = "C:\\addp-crm\\server\\tools\\javis-zalo\\node_modules\\javis-zalo\\src\\index.js";
const REMOTE_TARBALL = "https://codeload.github.com/blogminhquy/javis-zalo/tar.gz/refs/tags/v1.9.0";
const SHARED_NPM_CACHE = path.join(os.tmpdir(), "addp-zalo-npm-cache");

if (!globalThis.__zaloMcpDaemons) {
  globalThis.__zaloMcpDaemons = new Map();
}
if (!globalThis.__zaloSyncInFlight) {
  globalThis.__zaloSyncInFlight = new Map();
}

let cachedJavisRoot = null;

function isPidAlive(pid) {
  const num = Number(pid);
  if (!num || num <= 0) return false;
  try {
    process.kill(num, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Tự động tìm thư mục gốc của package `javis-zalo` (trong dự án hoặc trong _npx cache của Linux/Windows)
 * để chạy trực tiếp bằng `node` (<30ms) thay vì gọi `npx` mỗi lần.
 */
export function findJavisZaloRoot(targetHome = "") {
  if (cachedJavisRoot && fs.existsSync(path.join(cachedJavisRoot, "src", "index.js"))) {
    return cachedJavisRoot;
  }

  const directCandidates = [
    path.resolve(process.cwd(), "server", "tools", "javis-zalo", "node_modules", "javis-zalo"),
    path.resolve(process.cwd(), "..", "server", "tools", "javis-zalo", "node_modules", "javis-zalo"),
    path.resolve(process.cwd(), "tools", "javis-zalo", "node_modules", "javis-zalo"),
    path.resolve(process.cwd(), "node_modules", "javis-zalo"),
    path.resolve(process.cwd(), "..", "node_modules", "javis-zalo"),
    "/home/addp/domains/crm.addp.vn/public_html/server/tools/javis-zalo/node_modules/javis-zalo",
    "/home/addp/domains/crm.addp.vn/public_html/portal/node_modules/javis-zalo",
    ...(process.platform === "win32"
      ? ["C:\\addp-crm\\server\\tools\\javis-zalo\\node_modules\\javis-zalo"]
      : []),
  ];

  for (const cand of directCandidates) {
    if (fs.existsSync(path.join(cand, "src", "index.js"))) {
      cachedJavisRoot = cand;
      return cand;
    }
  }

  // Quét các thư mục _npx cache trên Linux / Windows (kể cả các homeDir khác đã từng quét QR)
  const extraHomeNpxDirs = [];
  try {
    for (const hDir of getAllZaloHomes()) {
      extraHomeNpxDirs.push(path.join(hDir, ".npm", "_npx"));
    }
  } catch {}

  const npxBaseDirs = Array.from(
    new Set(
      [
        path.join(SHARED_NPM_CACHE, "_npx"),
        path.join(os.homedir(), ".npm", "_npx"),
        "/root/.npm/_npx",
        "/home/addp/.npm/_npx",
        "/home/addp/.cache/javis-zalo",
        targetHome ? path.join(targetHome, ".npm", "_npx") : "",
        ...extraHomeNpxDirs,
      ].filter(Boolean)
    )
  );

  for (const npxDir of npxBaseDirs) {
    if (!fs.existsSync(npxDir)) continue;
    try {
      const hashes = fs.readdirSync(npxDir, { withFileTypes: true });
      for (const h of hashes) {
        if (h.isDirectory()) {
          const pkgRoot = path.join(npxDir, h.name, "node_modules", "javis-zalo");
          if (fs.existsSync(path.join(pkgRoot, "src", "index.js"))) {
            cachedJavisRoot = pkgRoot;
            return pkgRoot;
          }
        }
      }
    } catch {}
  }

  return null;
}

/**
 * Đảm bảo tiến trình ngầm `mcp start --http 3099` luôn chạy 24/7 cho tài khoản Zalo đang kết nối
 * để tự động backfill 20 trang lịch sử tin nhắn và lắng nghe tin nhắn mới thời gian thực vào history.jsonl.
 */
export function ensureZaloMcpDaemon(homeDir) {
  try {
    const targetHome = homeDir || getActiveZaloHome();
    if (!targetHome) return false;

    // Tuyệt đối không khởi chạy MCP Daemon nếu tài khoản này đang kéo WebSocket Backfill (tránh lỗi CLOSE_DUPLICATE 3000)
    if (globalThis.__zaloSyncInFlight?.has(targetHome)) {
      return false;
    }
    const cliDir = path.join(targetHome, ".zalo-agent-cli");
    const syncProgressPath = path.join(cliDir, ".crm-sync-progress.json");
    if (fs.existsSync(syncProgressPath)) {
      try {
        const sp = JSON.parse(fs.readFileSync(syncProgressPath, "utf8"));
        const pidAlive = sp?.pid ? isPidAlive(sp.pid) : false;
        const fresh = sp?.updatedAt ? Date.now() - Number(sp.updatedAt) < 120000 : false;
        if (sp?.status === "syncing" && (pidAlive || fresh)) {
          return false;
        }
      } catch {}
    }

    const credPath = path.join(cliDir, "credentials");
    if (!fs.existsSync(credPath)) return false;

    // Đảm bảo cấu hình backfill sâu tối đa (150 trang DM + 150 trang Group, giữ 10 năm lịch sử)
    const configPath = path.join(cliDir, "mcp-config.json");
    let needWriteConfig = !fs.existsSync(configPath);
    if (!needWriteConfig) {
      try {
        const curCfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
        if (
          Number(curCfg?.limits?.historyBackfillPages || 0) < 120 ||
          Number(curCfg?.limits?.historyKeepDays || 0) < 3650
        ) {
          needWriteConfig = true;
        }
      } catch {
        needWriteConfig = true;
      }
    }
    if (needWriteConfig) {
      try {
        fs.writeFileSync(
          configPath,
          JSON.stringify(
            {
              limits: {
                historyBackfillPages: 150,
                historyBackfillPageTimeout: "12s",
                historyMaxPerThread: 5000,
                historyKeepDays: 3650,
              },
            },
            null,
            2
          ),
          "utf8"
        );
      } catch {}
    }

    // 0. Kích hoạt vòng lặp auto-reply nền (trừ khi cố ý tắt bằng ZALO_ENABLE_AUTO_REPLY_WATCHER=0)
    if (process.env.ZALO_ENABLE_AUTO_REPLY_WATCHER !== "0") {
      startZaloRealtimeAiWatcher();
    }

    const targetOwnId = getOwnIdForHome(targetHome);

    // Chỉ dọn dẹp tiến trình mcp daemon cũ nếu trùng CÙNG 1 ownId (cùng 1 tài khoản Zalo quét lại QR ở thư mục mới),
    // TUYỆT ĐỐI KHÔNG tắt daemon của các tài khoản Zalo khác (ví dụ: Sơn Tùng và Lê Quyên chạy song song)!
    try {
      for (const [otherHome, info] of globalThis.__zaloMcpDaemons.entries()) {
        if (otherHome !== targetHome && info?.pid) {
          const otherOwnId = getOwnIdForHome(otherHome);
          if (targetOwnId && otherOwnId && targetOwnId === otherOwnId) {
            try {
              process.kill(info.pid);
            } catch {}
            globalThis.__zaloMcpDaemons.delete(otherHome);
          }
        }
      }
      for (const otherDir of getAllZaloHomes()) {
        if (path.resolve(otherDir) !== path.resolve(targetHome)) {
          const otherOwnId = getOwnIdForHome(otherDir);
          if (targetOwnId && otherOwnId && targetOwnId === otherOwnId) {
            const oldPidFile = path.join(otherDir, ".zalo-agent-cli", "mcp.pid");
            if (fs.existsSync(oldPidFile)) {
              try {
                const oldPid = Number(fs.readFileSync(oldPidFile, "utf8").trim());
                if (oldPid && isPidAlive(oldPid)) {
                  process.kill(oldPid);
                }
                fs.unlinkSync(oldPidFile);
              } catch {}
            }
          }
        }
      }
    } catch {}

    // 1. Kiểm tra trong bộ nhớ process hiện tại
    const existingMem = globalThis.__zaloMcpDaemons.get(targetHome);
    if (existingMem && existingMem.pid && isPidAlive(existingMem.pid)) {
      return true;
    }

    // 2. Kiểm tra file mcp.pid trong .zalo-agent-cli
    const pidFile = path.join(cliDir, "mcp.pid");
    if (fs.existsSync(pidFile)) {
      try {
        const savedPid = Number(fs.readFileSync(pidFile, "utf8").trim());
        if (isPidAlive(savedPid)) {
          return true;
        } else {
          fs.unlinkSync(pidFile);
        }
      } catch {}
    }

    // 3. Cấp cổng HTTP riêng cho từng tài khoản Zalo (3099, 3100, 3101...) để chạy đa tài khoản song song không đụng cổng
    let portNum = 3099;
    try {
      const activeHomes = getAllActiveZaloHomes();
      const idx = activeHomes.findIndex(
        (h) => path.resolve(h.homeDir) === path.resolve(targetHome) || (targetOwnId && h.ownId === targetOwnId)
      );
      if (idx >= 0) {
        portNum = 3099 + idx;
      } else {
        const hash = String(targetOwnId || targetHome)
          .split("")
          .reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 50, 0);
        portNum = 3105 + Math.abs(hash);
      }
    } catch {}
    const portStr = String(portNum);

    const javisRoot = findJavisZaloRoot(targetHome);
    const localEntry = javisRoot ? path.join(javisRoot, "src", "index.js") : null;

    try {
      fs.mkdirSync(SHARED_NPM_CACHE, { recursive: true });
    } catch {}

    const env = {
      ...process.env,
      HOME: targetHome,
      USERPROFILE: targetHome,
      NPM_CONFIG_CACHE: SHARED_NPM_CACHE,
      ZALO_JSON_MODE: "1",
    };

    const logFile = path.join(cliDir, "mcp-daemon.log");
    let logFd = "ignore";
    try {
      logFd = fs.openSync(logFile, "a");
    } catch {}

    let child = null;
    if (localEntry) {
      child = spawn(process.execPath, [localEntry, "mcp", "start", "--http", portStr], {
        env,
        detached: process.platform !== "win32",
        stdio: ["ignore", logFd, logFd],
      });
    } else {
      const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
      child = spawn(
        npxCmd,
        ["-y", "--prefer-offline", REMOTE_TARBALL, "mcp", "start", "--http", portStr],
        {
          env,
          shell: process.platform === "win32",
          detached: process.platform !== "win32",
          stdio: ["ignore", logFd, logFd],
        }
      );
    }

    if (child && child.pid) {
      fs.writeFileSync(pidFile, String(child.pid), "utf8");
      globalThis.__zaloMcpDaemons.set(targetHome, {
        pid: child.pid,
        port: portNum,
        ownId: targetOwnId,
        startedAt: Date.now(),
      });
      child.on("exit", () => {
        globalThis.__zaloMcpDaemons.delete(targetHome);
        try {
          if (fs.existsSync(pidFile)) {
            const currentPid = Number(fs.readFileSync(pidFile, "utf8").trim());
            if (currentPid === child.pid) fs.unlinkSync(pidFile);
          }
        } catch {}
      });
      child.unref();
      return true;
    }
  } catch (err) {
    console.error("[ENSURE_ZALO_MCP_DAEMON_ERR]", err.message);
  }
  return false;
}

/**
 * Khởi chạy đồng thời tiến trình MCP daemon cho TẤT CẢ tài khoản Zalo đang kết nối
 */
export function ensureAllZaloMcpDaemons() {
  try {
    const accounts = getAllActiveZaloHomes();
    for (const acc of accounts) {
      if (acc.homeDir && acc.hasCredentials) {
        ensureZaloMcpDaemon(acc.homeDir);
      }
    }
  } catch {}
}

/**
 * Dừng tiến trình MCP daemon của một thư mục Zalo cụ thể khi xóa tài khoản khỏi Channels
 */
export function stopZaloMcpDaemon(homeDir) {
  if (!homeDir) return false;
  let stopped = false;
  try {
    const resolvedTarget = path.resolve(homeDir);
    if (globalThis.__zaloMcpDaemons instanceof Map) {
      for (const [k, info] of globalThis.__zaloMcpDaemons.entries()) {
        if (path.resolve(k) === resolvedTarget) {
          if (info?.pid && isPidAlive(info.pid)) {
            try {
              process.kill(info.pid);
              stopped = true;
            } catch {}
          }
          globalThis.__zaloMcpDaemons.delete(k);
        }
      }
    }

    const pidFile = path.join(homeDir, ".zalo-agent-cli", "mcp.pid");
    if (fs.existsSync(pidFile)) {
      try {
        const pid = Number(fs.readFileSync(pidFile, "utf8").trim());
        if (pid && isPidAlive(pid)) {
          try {
            process.kill(pid, "SIGTERM");
          } catch {}
          if (isPidAlive(pid)) {
            try {
              process.kill(pid, "SIGKILL");
            } catch {}
          }
          stopped = true;
        }
        fs.unlinkSync(pidFile);
      } catch {}
    }
  } catch (err) {
    console.error("[STOP_ZALO_MCP_DAEMON_ERR]", err.message);
  }
  return stopped;
}

/**
 * Dừng toàn bộ tiến trình daemon & watcher Zalo khi không còn tài khoản Zalo nào active trong Channels
 */
export function stopAllZaloMcpDaemons() {
  try {
    if (globalThis.__zaloAiWatcherTimer) {
      clearInterval(globalThis.__zaloAiWatcherTimer);
      globalThis.__zaloAiWatcherTimer = null;
    }

    if (globalThis.__zaloMcpDaemons instanceof Map) {
      for (const [homeDir, info] of globalThis.__zaloMcpDaemons.entries()) {
        if (info?.pid && isPidAlive(info.pid)) {
          try {
            process.kill(info.pid);
          } catch {}
        }
        globalThis.__zaloMcpDaemons.delete(homeDir);
      }
    }

    const allHomes = getAllZaloHomes();
    for (const dir of allHomes) {
      const pidFile = path.join(dir, ".zalo-agent-cli", "mcp.pid");
      if (fs.existsSync(pidFile)) {
        try {
          const pid = Number(fs.readFileSync(pidFile, "utf8").trim());
          if (pid && isPidAlive(pid)) {
            process.kill(pid);
          }
          fs.unlinkSync(pidFile);
        } catch {}
      }
    }
    return true;
  } catch (err) {
    console.error("[STOP_ALL_ZALO_DAEMONS_ERR]", err.message);
    return false;
  }
}

/**
 * Tìm tất cả thư mục phiên Zalo trong connector-home và sắp xếp theo thời gian sửa đổi (mtime)
 * mới nhất của file `.zalo-agent-cli/history.jsonl` hoặc `credentials`.
 */
export function getAllZaloHomes() {
  const envConnectorHome = process.env.ZALO_CONNECTOR_HOME
    ? path.resolve(process.env.ZALO_CONNECTOR_HOME)
    : "";

  const baseHomeCandidates = [
    envConnectorHome,
    path.resolve(process.cwd(), "..", "server", "connector-home"),
    path.resolve(process.cwd(), "server", "connector-home"),
    path.resolve(process.cwd(), "connector-home"),
    "/home/addp/domains/crm.addp.vn/public_html/server/connector-home",
    "/home/addp/domains/crm.addp.vn/public_html",
    os.homedir(),
    "/home/addp",
    "/root",
    path.resolve(os.tmpdir(), "addp-crm-zalo-homes"),
    ...(process.platform === "win32" ? ["C:\\addp-crm\\server\\connector-home"] : []),
  ].filter(Boolean);

  const historyMatches = [];
  const credOnlyMatches = [];
  const seenDirs = new Set();

  const inspectSessionDir = (fullDir) => {
    const resolvedDir = path.resolve(fullDir);
    if (seenDirs.has(resolvedDir)) return;
    seenDirs.add(resolvedDir);

    const cliDir = path.join(resolvedDir, ".zalo-agent-cli");
    if (!fs.existsSync(cliDir)) return;

    const histPath = path.join(cliDir, "history.jsonl");
    const credDir = path.join(cliDir, "credentials");
    const accPath = path.join(cliDir, "accounts.json");
    const metaPath = path.join(cliDir, "crm-meta-cache.json");

    if (fs.existsSync(histPath)) {
      try {
        const stat = fs.statSync(histPath);
        historyMatches.push({
          dir: resolvedDir,
          historyPath: histPath,
          mtime: stat.mtimeMs || 0,
          size: stat.size || 0,
        });
        return;
      } catch {}
    }

    if (fs.existsSync(credDir) || fs.existsSync(accPath) || fs.existsSync(metaPath)) {
      let credMtime = 0;
      for (const p of [credDir, accPath, metaPath]) {
        if (!fs.existsSync(p)) continue;
        try {
          const stat = fs.statSync(p);
          if (stat.mtimeMs > credMtime) credMtime = stat.mtimeMs;
          if (stat.isDirectory()) {
            for (const f of fs.readdirSync(p)) {
              const fStat = fs.statSync(path.join(p, f));
              if (fStat.mtimeMs > credMtime) credMtime = fStat.mtimeMs;
            }
          }
        } catch {}
      }
      credOnlyMatches.push({
        dir: resolvedDir,
        mtime: credMtime,
      });
    }
  };

  for (const base of baseHomeCandidates) {
    if (!fs.existsSync(base)) continue;
    try {
      if (fs.existsSync(path.join(base, ".zalo-agent-cli"))) {
        inspectSessionDir(base);
      }

      const entries = fs.readdirSync(base, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        inspectSessionDir(path.resolve(base, ent.name));
      }
    } catch {}
  }

  historyMatches.sort((a, b) => b.mtime - a.mtime || b.size - a.size);
  credOnlyMatches.sort((a, b) => b.mtime - a.mtime);

  return [
    ...historyMatches.map((h) => h.dir),
    ...credOnlyMatches.map((c) => c.dir),
  ];
}

function cleanDisplayAccountName(rawName, fallbackOwnId = "", folderSlug = "") {
  let s = String(rawName || "")
    .replace(/^Zalo Cá Nhân\s*\((.+)\)$/i, "$1")
    .replace(/^Zalo:\s*/i, "")
    .replace(/\s*\(ADDP\)\s*$/i, "")
    .trim();

  if (
    !s ||
    /^addp zalo/i.test(s) ||
    /^zalo cá nhân$/i.test(s) ||
    /^chuyên viên/i.test(s) ||
    /^dược sĩ/i.test(s)
  ) {
    if (String(fallbackOwnId) === "1781287338457243967") {
      return "Sơn Tùng";
    }
    if (folderSlug) {
      const cleanedSlug = folderSlug
        .replace(/^zalo-/i, "")
        .replace(/-[a-z0-9_]{5,8}$/i, "")
        .replace(/^addp-zalo-ca-nhan/i, "")
        .replace(/-/g, " ")
        .trim();
      if (cleanedSlug) {
        return cleanedSlug.replace(/\b\w/g, (c) => c.toUpperCase());
      }
    }
    return fallbackOwnId ? `Zalo #${String(fallbackOwnId).slice(-4)}` : "Zalo Cá Nhân";
  }
  return s;
}

/**
 * Lấy danh sách TẤT CẢ các tài khoản Zalo Cá Nhân đang hoạt động trong `server/connector-home/<slug>/`
 * Gom các thư mục trùng `ownId` (do quét lại QR nhiều lần) về 1 tài khoản duy nhất,
 * đồng thời giữ độc lập hoàn toàn giữa các nick Zalo khác nhau (ví dụ: Sơn Tùng & Lê Quyên).
 */
export function getAllActiveZaloHomes() {
  const rawDirs = getAllZaloHomes();
  const byAccountKey = new Map();

  for (const dir of rawDirs) {
    const cliDir = path.join(dir, ".zalo-agent-cli");
    const credPath = path.join(cliDir, "credentials");
    const histPath = path.join(cliDir, "history.jsonl");
    const accPath = path.join(cliDir, "accounts.json");
    const metaPath = path.join(cliDir, "crm-meta-cache.json");

    const hasCredentials = fs.existsSync(credPath);
    const hasHistory = fs.existsSync(histPath);
    const hasAccounts = fs.existsSync(accPath);
    const hasMeta = fs.existsSync(metaPath);

    if (!hasCredentials && !hasHistory && !hasAccounts && !hasMeta) continue;

    let ownId = "";
    let rawName = "";
    let mtime = 0;

    for (const p of [histPath, metaPath, accPath, credPath]) {
      if (fs.existsSync(p)) {
        try {
          const st = fs.statSync(p);
          if (st.mtimeMs > mtime) mtime = st.mtimeMs;
        } catch {}
      }
    }

    if (hasAccounts) {
      try {
        const list = JSON.parse(fs.readFileSync(accPath, "utf8"));
        if (Array.isArray(list) && list.length > 0) {
          const active = list.find((a) => a.active) || list[0];
          if (active?.ownId) ownId = String(active.ownId);
          if (active?.name || active?.displayName || active?.zaloName) {
            rawName = String(active.name || active.displayName || active.zaloName);
          }
        }
      } catch {}
    }

    if (hasMeta) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        if (!ownId && meta?.ownId) ownId = String(meta.ownId);
        if (!rawName && (meta?.accountName || meta?.displayName || meta?.ownName)) {
          rawName = String(meta.accountName || meta.displayName || meta.ownName);
        }
      } catch {}
    }

    if ((!ownId || !rawName) && hasHistory) {
      try {
        const lines = fs.readFileSync(histPath, "utf8").split("\n");
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i].trim();
          if (!line) continue;
          const msg = JSON.parse(line);
          if (msg?.isSelf) {
            if (!ownId && msg.senderId && /^\d{8,}$/.test(String(msg.senderId))) {
              ownId = String(msg.senderId);
            }
            if (
              !rawName &&
              msg.senderName &&
              !/ADDP|Dược sĩ|Chuyên viên|Khách/i.test(String(msg.senderName))
            ) {
              rawName = String(msg.senderName);
            }
            if (ownId && rawName) break;
          }
        }
      } catch {}
    }

    const folderSlug = path.basename(dir);
    if (!ownId && folderSlug.includes("son-tung")) {
      ownId = "1781287338457243967";
    }
    const displayName = cleanDisplayAccountName(rawName, ownId, folderSlug);
    const accountKey = ownId || folderSlug;

    if (!byAccountKey.has(accountKey)) {
      byAccountKey.set(accountKey, {
        accountId: accountKey,
        ownId: ownId || "",
        slug: folderSlug,
        name: displayName,
        displayName,
        accountName: `Zalo: ${displayName}`,
        channelLabel: `Zalo Cá Nhân (${displayName})`,
        homeDir: dir,
        allHomeDirs: [dir],
        hasCredentials,
        mtime,
      });
    } else {
      const existing = byAccountKey.get(accountKey);
      if (!existing.allHomeDirs.includes(dir)) {
        existing.allHomeDirs.push(dir);
      }
      // Ưu tiên chọn thư mục có credentials hợp lệ và mtime mới hơn làm homeDir chính
      if ((hasCredentials && !existing.hasCredentials) || (hasCredentials === existing.hasCredentials && mtime > existing.mtime)) {
        existing.homeDir = dir;
        existing.slug = folderSlug;
        existing.hasCredentials = hasCredentials;
        existing.mtime = mtime;
      }
      if (
        existing.displayName.startsWith("Zalo #") &&
        !displayName.startsWith("Zalo #")
      ) {
        existing.name = displayName;
        existing.displayName = displayName;
        existing.accountName = `Zalo: ${displayName}`;
        existing.channelLabel = `Zalo Cá Nhân (${displayName})`;
      }
    }
  }

  const accounts = Array.from(byAccountKey.values()).sort((a, b) => b.mtime - a.mtime);

  // Sắp xếp allHomeDirs của từng tài khoản từ cũ -> mới để thư mục mới nhất nằm cuối
  for (const acc of accounts) {
    acc.allHomeDirs = [...acc.allHomeDirs].reverse();
  }

  const sig = accounts.map((a) => `${a.displayName}:${a.ownId}:${a.homeDir}`).join(" | ");
  const now = Date.now();
  if (
    accounts.length > 0 &&
    (globalThis.__lastLoggedMultiZaloSig !== sig ||
      !globalThis.__lastLoggedMultiZaloAt ||
      now - globalThis.__lastLoggedMultiZaloAt > 60000)
  ) {
    globalThis.__lastLoggedMultiZaloSig = sig;
    globalThis.__lastLoggedMultiZaloAt = now;
    console.log(
      `[Zalo Runner] Đã tự động kết nối ${accounts.length} tài khoản Zalo active: ${accounts
        .map((a) => `${a.displayName} (${a.homeDir})`)
        .join(", ")}`
    );
  }

  return accounts;
}

/**
 * Tự động tìm thư mục Zalo đang hoạt động (Active Zalo Home):
 * Giữ tương thích ngược cho các hàm truyền thống nhưng ưu tiên lấy từ getAllActiveZaloHomes().
 */
export function getActiveZaloHome() {
  let activePath = "";

  try {
    const activeAccounts = getAllActiveZaloHomes();
    if (activeAccounts.length > 0) {
      activePath = activeAccounts[0].homeDir;
    } else {
      const allHomes = getAllZaloHomes();
      if (allHomes.length > 0) {
        activePath = allHomes[0];
      }
    }
  } catch (err) {
    console.error("[GET_ACTIVE_ZALO_HOME_ERROR]", err);
  }

  if (!activePath) {
    const cwd = path.resolve(process.cwd());
    const cwdCli = path.join(cwd, ".zalo-agent-cli");
    try {
      fs.mkdirSync(cwdCli, { recursive: true });
    } catch {}
    activePath = cwd;
  }

  const now = Date.now();
  if (
    globalThis.__lastLoggedActiveZaloHome !== activePath ||
    !globalThis.__lastLoggedActiveZaloHomeAt ||
    now - globalThis.__lastLoggedActiveZaloHomeAt > 30000
  ) {
    globalThis.__lastLoggedActiveZaloHome = activePath;
    globalThis.__lastLoggedActiveZaloHomeAt = now;
    console.log(`[Zalo Runner] Đã tự động kết nối thư mục Zalo active: ${activePath}`);
  }

  return activePath;
}

/**
 * Xác định chính xác tài khoản Zalo (`homeDir`, `ownId`, `displayName`) sở hữu một hội thoại `threadId`
 */
export function resolveZaloHomeForThread(threadId = "", preferredHomeDir = "", preferredAccountId = "") {
  const accounts = getAllActiveZaloHomes();
  if (accounts.length === 0) {
    const fallbackHome = preferredHomeDir || getActiveZaloHome();
    const ownId = getOwnIdForHome(fallbackHome);
    const displayName = cleanDisplayAccountName(getActiveZaloAccountName(fallbackHome), ownId);
    return {
      accountId: ownId,
      ownId,
      name: displayName,
      displayName,
      accountName: `Zalo: ${displayName}`,
      channelLabel: `Zalo Cá Nhân (${displayName})`,
      homeDir: fallbackHome,
      allHomeDirs: [fallbackHome],
    };
  }

  // 1. Khớp theo preferredHomeDir
  if (preferredHomeDir) {
    const resolvedPref = path.resolve(preferredHomeDir);
    const matchedByHome = accounts.find(
      (a) =>
        path.resolve(a.homeDir) === resolvedPref ||
        a.allHomeDirs.some((d) => path.resolve(d) === resolvedPref)
    );
    if (matchedByHome) return matchedByHome;
  }

  // 2. Khớp theo preferredAccountId (ownId hoặc slug)
  if (preferredAccountId && preferredAccountId !== "ALL") {
    const matchedById = accounts.find(
      (a) =>
        String(a.accountId) === String(preferredAccountId) ||
        String(a.ownId) === String(preferredAccountId) ||
        String(a.slug) === String(preferredAccountId)
    );
    if (matchedById) return matchedById;
  }

  // 3. Tự động dò trong history.jsonl và crm-meta-cache.json của từng tài khoản Zalo
  const tid = String(threadId || "").trim();
  const tidClean = tid.replace(/^[gu]_/, "");
  if (tid) {
    let bestMatch = null;
    let bestTimestamp = -1;

    for (const acc of accounts) {
      const files = getAllZaloHistoryFiles(acc.homeDir);
      for (const fp of files) {
        if (!fs.existsSync(fp)) continue;
        try {
          const raw = fs.readFileSync(fp, "utf8");
          if (!raw.includes(tid) && (!tidClean || !raw.includes(tidClean))) continue;
          const lines = raw.split("\n");
          for (let i = lines.length - 1; i >= 0; i--) {
            const l = lines[i].trim();
            if (!l || (!l.includes(tid) && (!tidClean || !l.includes(tidClean)))) continue;
            try {
              const parsed = JSON.parse(l);
              const pTid = String(parsed.threadId || "").trim();
              const pSender = String(parsed.senderId || parsed.fromId || "").trim();
              const pTidClean = pTid.replace(/^[gu]_/, "");

              const isMatch =
                pTid === tid ||
                (tidClean && pTidClean === tidClean) ||
                (parsed.threadType === "dm" && pSender === tid);

              if (isMatch) {
                const ts = Number(parsed.timestamp) || 1;
                if (ts > bestTimestamp) {
                  bestTimestamp = ts;
                  bestMatch = acc;
                }
                break;
              }
            } catch {}
          }
        } catch {}
      }

      if (!bestMatch) {
        const metaPath = path.join(acc.homeDir, ".zalo-agent-cli", "crm-meta-cache.json");
        if (fs.existsSync(metaPath)) {
          try {
            const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
            const inFriends = (meta?.friends || []).some((f) => {
              const fid = String(f?.userId || "").trim();
              return fid === tid || (tidClean && fid === tidClean);
            });
            const inGroups = (meta?.groups || []).some((g) => {
              const gid = String(g?.threadId || "").trim();
              return gid === tid || (tidClean && gid.replace(/^[gu]_/, "") === tidClean);
            });
            if (inFriends || inGroups) {
              bestMatch = acc;
            }
          } catch {}
        }
      }
    }

    if (bestMatch) return bestMatch;
  }

  return accounts[0];
}

/**
 * Lấy ownId thực tế của tài khoản Zalo đang kết nối từ crm-meta-cache.json hoặc accounts.json
 */
export function getOwnIdForHome(homeDir) {
  const targetHome = homeDir || getActiveZaloHome();
  const cliDir = path.join(targetHome, ".zalo-agent-cli");

  const accountsPath = path.join(cliDir, "accounts.json");
  if (fs.existsSync(accountsPath)) {
    try {
      const accounts = JSON.parse(fs.readFileSync(accountsPath, "utf8"));
      if (Array.isArray(accounts)) {
        const activeAcc = accounts.find((a) => a.active && a.ownId) || accounts[0];
        if (activeAcc?.ownId) return String(activeAcc.ownId);
      }
    } catch {}
  }

  const metaCachePath = path.join(cliDir, "crm-meta-cache.json");
  if (fs.existsSync(metaCachePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(metaCachePath, "utf8"));
      if (cached?.ownId) return String(cached.ownId);
    } catch {}
  }

  return "1781287338457243967";
}

/**
 * Lấy tên tài khoản Zalo đang trực thực tế (ví dụ: "Sơn Tùng", "Lê Quyên") từ accounts.json hoặc crm-meta-cache.json
 */
export function getActiveZaloAccountName(homeDir) {
  const targetHome = homeDir || getActiveZaloHome();
  const cliDir = path.join(targetHome, ".zalo-agent-cli");
  const ownId = getOwnIdForHome(targetHome);

  const accountsPath = path.join(cliDir, "accounts.json");
  if (fs.existsSync(accountsPath)) {
    try {
      const accounts = JSON.parse(fs.readFileSync(accountsPath, "utf8"));
      if (Array.isArray(accounts)) {
        const activeAcc = accounts.find((a) => a.active) || accounts[0];
        const name = activeAcc?.displayName || activeAcc?.name || activeAcc?.zaloName;
        if (name) return cleanDisplayAccountName(name, ownId, path.basename(targetHome));
      }
    } catch {}
  }

  const metaCachePath = path.join(cliDir, "crm-meta-cache.json");
  if (fs.existsSync(metaCachePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(metaCachePath, "utf8"));
      if (cached?.accountName || cached?.displayName || cached?.ownName) {
        return cleanDisplayAccountName(
          cached.accountName || cached.displayName || cached.ownName,
          ownId,
          path.basename(targetHome)
        );
      }
    } catch {}
  }

  return cleanDisplayAccountName("", ownId, path.basename(targetHome));
}

/**
 * Lấy danh sách các file history JSONL thuộc về ĐÚNG tài khoản Zalo `primaryHome` (cô lập theo `ownId`).
 * TUYỆT ĐỐI KHÔNG trộn lịch sử của nick Lê Quyên sang nick Sơn Tùng hoặc ngược lại.
 */
export function getAllZaloHistoryFiles(primaryHome, includeAllHomes = false) {
  const targetHome = primaryHome || getActiveZaloHome();
  const targetOwnId = getOwnIdForHome(targetHome);
  const files = [];
  const seen = new Set();

  const addIfExist = (p) => {
    if (!p) return;
    try {
      const resolved = path.resolve(p);
      if (!seen.has(resolved) && fs.existsSync(resolved)) {
        seen.add(resolved);
        files.push(resolved);
      }
    } catch {}
  };

  // 1. Quét toàn diện các file lịch sử zalo_history_*.jsonl trong tất cả các thư mục data khả dĩ
  const candidateDataDirs = [
    path.resolve(process.cwd(), "data"),
    path.resolve(process.cwd(), "portal", "data"),
    path.resolve(process.cwd(), "..", "portal", "data"),
    path.resolve(process.cwd(), "..", "data"),
    "/home/addp/domains/crm.addp.vn/public_html/portal/data",
    "/home/addp/domains/crm.addp.vn/public_html/data",
    "C:\\addp-crm\\portal\\data",
    "C:\\addp-crm\\data",
  ];

  for (const dir of candidateDataDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const entries = fs.readdirSync(dir);
      for (const ent of entries) {
        if (ent.startsWith("zalo_history_") && ent.endsWith(".jsonl")) {
          if (
            includeAllHomes ||
            !targetOwnId ||
            ent.includes(String(targetOwnId)) ||
            String(targetOwnId) === "1781287338457243967"
          ) {
            addIfExist(path.join(dir, ent));
          }
        }
      }
    } catch {}
  }

  // 2. Gộp các thư mục connector-home
  const allHomesOldestFirst = [...getAllZaloHomes()].reverse();
  for (const h of allHomesOldestFirst) {
    const hOwnId = getOwnIdForHome(h);
    if (
      includeAllHomes ||
      path.resolve(h) === path.resolve(targetHome) ||
      (targetOwnId && hOwnId && String(targetOwnId) === String(hOwnId))
    ) {
      addIfExist(path.join(h, ".zalo-agent-cli", "crm-group-history.jsonl"));
      addIfExist(path.join(h, ".zalo-agent-cli", "history.jsonl"));
      addIfExist(path.join(h, "history.jsonl"));
    }
  }

  // 3. Thư mục chính hiện tại
  if (targetHome) {
    addIfExist(path.join(targetHome, ".zalo-agent-cli", "crm-group-history.jsonl"));
    addIfExist(path.join(targetHome, ".zalo-agent-cli", "history.jsonl"));
    addIfExist(path.join(targetHome, "history.jsonl"));
  }

  return files;
}

/**
 * Đọc trạng thái tiến trình đồng bộ lịch sử Zalo (.crm-sync-progress.json & .zalo-sync-state.json)
 */
export function getZaloSyncStatus(homeDir) {
  const targetHome = homeDir || getActiveZaloHome();
  if (!targetHome) return { isSyncing: false };
  const cliDir = path.join(targetHome, ".zalo-agent-cli");
  const progressPath = path.join(cliDir, ".crm-sync-progress.json");
  const syncStatePath = path.join(cliDir, ".zalo-sync-state.json");

  let progress = null;
  if (fs.existsSync(progressPath)) {
    try {
      progress = JSON.parse(fs.readFileSync(progressPath, "utf8"));
    } catch {}
  }

  let state = null;
  if (fs.existsSync(syncStatePath)) {
    try {
      state = JSON.parse(fs.readFileSync(syncStatePath, "utf8"));
    } catch {}
  }

  const inMemory = Boolean(globalThis.__zaloSyncInFlight?.has(targetHome));
  const ageMs = progress?.updatedAt ? Date.now() - Number(progress.updatedAt) : Infinity;
  const startedAgeMs = progress?.startedAt ? Date.now() - Number(progress.startedAt) : Infinity;

  // Kiểm tra PID tiến trình đồng bộ
  let pidAlive = false;
  if (progress?.pid) {
    pidAlive = isPidAlive(progress.pid);
  }

  // Trạng thái đang đồng bộ chỉ hợp lệ khi:
  // 1. In-memory promise đang chạy trong tiến trình Node hiện tại
  // 2. HOẶC file progress ghi status === "syncing" VÀ:
  //    - Nếu có PID: PID bắt buộc phải còn sống (pidAlive === true) và age < 60s
  //    - Nếu không có PID: chỉ cho phép trong 45s kể từ lúc bắt đầu
  const fileSyncing =
    progress?.status === "syncing" &&
    ((progress?.pid && pidAlive && ageMs < 60 * 1000) ||
      (!progress?.pid && startedAgeMs < 45 * 1000 && ageMs < 30 * 1000));

  const isSyncing = Boolean(inMemory || fileSyncing);

  // Nếu progress ghi status === "syncing" nhưng worker đã chết hoặc quá hạn -> xóa trạng thái treo để không khóa UI
  if (progress?.status === "syncing" && !isSyncing) {
    try {
      progress.status = "done";
      progress.phase = "idle";
      fs.writeFileSync(progressPath, JSON.stringify(progress), "utf8");
    } catch {}
  }

  return {
    isSyncing,
    phase: progress?.phase || (state?.initialSyncCompleted ? "done" : "idle"),
    friendsCount: progress?.friendsCount || 0,
    groupsCount: progress?.groupsCount || 0,
    dmBackfilled: progress?.dmBackfilled || 0,
    groupBackfilled: progress?.groupBackfilled || 0,
    groupRestFetched: progress?.groupRestFetched || 0,
    initialSyncCompleted: Boolean(state?.initialSyncCompleted),
    totalSynced: state?.totalSynced || 0,
    errors: Array.isArray(progress?.errors) ? progress.errors : [],
  };
}

/**
 * Thực thi worker đồng bộ toàn diện: Danh bạ + Nhóm (kèm Avatar) + Ghim + WS Cloud Backfill (DM & Group) + Group REST History
 */
export function triggerDirectSyncWorker(targetHome, optionsOrForceFull = false) {
  if (!targetHome) return Promise.resolve({ ok: false, error: "Missing targetHome" });
  if (globalThis.__zaloSyncInFlight.has(targetHome)) {
    return globalThis.__zaloSyncInFlight.get(targetHome);
  }

  const opts =
    typeof optionsOrForceFull === "object" && optionsOrForceFull !== null
      ? optionsOrForceFull
      : { forceFull: Boolean(optionsOrForceFull), runWsBackfill: false };

  const forceFull = Boolean(opts.forceFull);
  const runWsBackfill = Boolean(opts.runWsBackfill);
  const timeoutMs = Number(opts.timeoutMs) || (runWsBackfill ? 300000 : 120000);

  const promise = (async () => {
    let stoppedDaemonForWs = false;
    try {
      const workerCandidates = [
        path.resolve(process.cwd(), "src", "lib", "zaloDirectSyncWorker.mjs"),
        path.resolve(process.cwd(), "portal", "src", "lib", "zaloDirectSyncWorker.mjs"),
      ];
      const workerPath = workerCandidates.find((p) => fs.existsSync(p));
      let javisRoot = findJavisZaloRoot(targetHome);

      if (!javisRoot) {
        await runZaloCommand(["--version"], { homeDir: targetHome, timeout: 20000 });
        javisRoot = findJavisZaloRoot(targetHome);
      }

      if (!workerPath || !javisRoot) {
        return { ok: false, error: "Không tìm thấy worker hoặc javis-zalo" };
      }

      // Khi chạy WebSocket Backfill chủ động, tạm dừng daemon và chờ 800ms để Zalo đóng socket cũ tránh code 3000
      if (runWsBackfill) {
        stoppedDaemonForWs = stopZaloMcpDaemon(targetHome);
        await new Promise((r) => setTimeout(r, 850));
      }

      return await new Promise((resolve) => {
        const env = {
          ...process.env,
          HOME: targetHome,
          USERPROFILE: targetHome,
          JAVIS_ZALO_ROOT: javisRoot,
          FORCE_FULL_SYNC: forceFull ? "1" : "0",
          RUN_WS_BACKFILL: runWsBackfill ? "1" : "0",
          ZALO_JSON_MODE: "1",
        };
        execFile(
          process.execPath,
          [workerPath],
          { env, timeout: timeoutMs, maxBuffer: 25 * 1024 * 1024 },
          (err, stdout) => {
            if (err) {
              return resolve({ ok: false, error: err.message });
            }
            try {
              const lastLine = stdout.trim().split("\n").pop() || "{}";
              return resolve(JSON.parse(lastLine));
            } catch {
              return resolve({ ok: true });
            }
          }
        );
      });
    } finally {
      if (runWsBackfill || stoppedDaemonForWs) {
        try {
          ensureZaloMcpDaemon(targetHome);
        } catch {}
      }
      globalThis.__zaloSyncInFlight.delete(targetHome);
    }
  })();

  globalThis.__zaloSyncInFlight.set(targetHome, promise);
  return promise;
}

/**
 * Lấy Metadata Zalo (Danh bạ, Nhóm kèm Avatar, Hội thoại Ghim) & tự động đồng bộ tin nhắn Nhóm mới nhất
 */
export async function syncZaloGroupsAndMetadata(homeDir, forceRefresh = false) {
  const targetHome = homeDir || getActiveZaloHome();
  const cliDir = path.join(targetHome, ".zalo-agent-cli");
  const credPath = path.join(cliDir, "credentials");
  const hasCredentials = fs.existsSync(credPath);
  const metaCachePath = path.join(cliDir, "crm-meta-cache.json");
  const historyPath = path.join(cliDir, "history.jsonl");
  const groupHistoryPath = path.join(cliDir, "crm-group-history.jsonl");

  let cached = null;
  if (fs.existsSync(metaCachePath)) {
    try {
      cached = JSON.parse(fs.readFileSync(metaCachePath, "utf8"));
    } catch {}
  }

  // Nếu chưa có phiên đăng nhập Zalo (credentials) và chưa có cache, trả về ngay lập tức không chờ spawn CLI 27s
  if (!hasCredentials && !cached) {
    return {
      ownId: "1781287338457243967",
      friendMap: new Map(),
      groupMap: new Map(),
      pinnedSet: new Set(),
    };
  }

  const now = Date.now();
  const cacheAge = cached?.updatedAt ? now - cached.updatedAt : Infinity;
  const syncStatePath = path.join(cliDir, ".zalo-sync-state.json");
  let syncState = null;
  if (fs.existsSync(syncStatePath)) {
    try {
      syncState = JSON.parse(fs.readFileSync(syncStatePath, "utf8"));
    } catch {}
  }
  const hasDmHistory = fs.existsSync(historyPath) && fs.statSync(historyPath).size > 300;
  const wsBackfillDone = Boolean(syncState?.wsBackfillCompleted && hasDmHistory);

  if (forceRefresh && hasCredentials) {
    await Promise.race([
      triggerDirectSyncWorker(targetHome, {
        forceFull: true,
        runWsBackfill: !wsBackfillDone,
      }),
      new Promise((r) => setTimeout(r, 3500)),
    ]);
    if (fs.existsSync(metaCachePath)) {
      try {
        cached = JSON.parse(fs.readFileSync(metaCachePath, "utf8"));
      } catch {}
    }
  } else if (!cached && hasCredentials) {
    // Chỉ kích hoạt đồng bộ worker khi CHƯA TỪNG CÓ CACHE (lần đầu đăng nhập)
    // Tuyệt đối không tự động chạy worker định kỳ trong các lượt đọc passive API để tránh giật lag UI và tải lại trang
    triggerDirectSyncWorker(targetHome, { forceFull: false, runWsBackfill: false }).catch(() => {});
  }

  const friendMap = new Map();
  for (const s of cached?.strangers || []) {
    if (s?.userId) friendMap.set(String(s.userId), s);
  }
  for (const f of cached?.friends || []) {
    if (f?.userId) friendMap.set(String(f.userId), f);
  }

  const groupMap = new Map();
  for (const g of cached?.groups || []) {
    if (g?.threadId) groupMap.set(String(g.threadId), g);
  }

  const pinnedSet = new Set((cached?.pinnedIds || []).map((id) => String(id)));

  return {
    ownId: cached?.ownId || "1781287338457243967",
    friendMap,
    groupMap,
    pinnedSet,
  };
}

/**
 * Đảm bảo tài khoản Zalo đã được kéo lịch sử hội thoại ban đầu tối đa khi vừa đăng nhập (Universal Initial Sync on Connect)
 * - Chạy đồng bộ sâu: WebSocket Cloud Backfill (cmd 510 DM & cmd 511 Group tối đa 150 trang) + HTTP getGroupChatHistory (50 tin/nhóm).
 * - Sau đó tự động khởi động lại MCP Daemon 24/7 để nghe tin nhắn mới realtime.
 */
export async function ensureAccountHistorySynced(zaloHomePath, accountId = "", options = {}) {
  const targetHome = zaloHomePath || getActiveZaloHome();
  const cliDir = path.join(targetHome, ".zalo-agent-cli");
  const syncStatePath = path.join(cliDir, ".zalo-sync-state.json");
  const historyPath = path.join(cliDir, "history.jsonl");
  const groupHistoryPath = path.join(cliDir, "crm-group-history.jsonl");
  const force = Boolean(options?.force);

  let state = { initialSyncCompleted: false, lastSyncTime: 0, totalSynced: 0 };
  if (fs.existsSync(syncStatePath)) {
    try {
      state = JSON.parse(fs.readFileSync(syncStatePath, "utf8"));
    } catch {}
  }

  const countLines = (p) => {
    if (!fs.existsSync(p)) return 0;
    try {
      return fs.readFileSync(p, "utf8").split("\n").filter((l) => l.trim().length > 0).length;
    } catch {
      return 0;
    }
  };

  const existingCount = countLines(historyPath) + countLines(groupHistoryPath);
  if (!force && state.initialSyncCompleted && existingCount > 0 && Date.now() - state.lastSyncTime < 24 * 3600 * 1000) {
    return { ok: true, alreadySynced: true, state };
  }

  console.log(
    `[Zalo Sync] Bắt đầu kéo toàn bộ lịch sử hội thoại (DM + Nhóm) cho tài khoản (${accountId || path.basename(targetHome)})...`
  );

  try {
    // 1. Chạy DirectSyncWorker kèm RUN_WS_BACKFILL=1 (tạm dừng daemon, kéo 150 trang cmd 510/511 + 50 tin/nhóm HTTP, rồi bật lại daemon)
    const workerRes = await triggerDirectSyncWorker(targetHome, {
      forceFull: true,
      runWsBackfill: true,
      timeoutMs: 180000,
    });

    // 2. Đếm tổng số tin nhắn thực tế từ cả history.jsonl và crm-group-history.jsonl
    const msgCount = countLines(historyPath) + countLines(groupHistoryPath);
    const hasPulledData =
      Number(workerRes?.dmBackfilledCount || 0) > 0 ||
      Number(workerRes?.groupBackfilledCount || 0) > 0 ||
      Number(workerRes?.newGroupMessagesCount || 0) > 0;

    state = {
      initialSyncCompleted: Boolean(workerRes?.ok && msgCount > 0),
      wsBackfillCompleted: Boolean(workerRes?.ok && !workerRes?.wsError && (hasPulledData || msgCount > 0)),
      wsError: workerRes?.wsError || null,
      lastSyncTime: Date.now(),
      totalSynced: msgCount,
      dmBackfilled: workerRes?.dmBackfilledCount || 0,
      groupBackfilled: workerRes?.groupBackfilledCount || 0,
      groupRestFetched: workerRes?.newGroupMessagesCount || 0,
    };

    fs.mkdirSync(cliDir, { recursive: true });
    fs.writeFileSync(syncStatePath, JSON.stringify(state, null, 2), "utf8");
    console.log(
      `[Zalo Sync] Hoàn thành kéo lịch sử cho ${accountId || path.basename(targetHome)}: ${msgCount} tin nhắn (DM WS: ${state.dmBackfilled}, Group WS: ${state.groupBackfilled}, Group REST: ${state.groupRestFetched}).`
    );
    return { ok: Boolean(workerRes?.ok), synced: true, state, workerRes };
  } catch (err) {
    console.error(
      `[Zalo Sync] Lỗi đồng bộ ban đầu cho ${accountId || path.basename(targetHome)}:`,
      err.message
    );
    return { ok: false, error: err.message };
  }
}

export function runZaloCommand(args, options = {}) {
  const targetHome = options.homeDir || getActiveZaloHome();
  try {
    fs.mkdirSync(SHARED_NPM_CACHE, { recursive: true });
  } catch {}

  const env = {
    ...process.env,
    HOME: targetHome,
    USERPROFILE: targetHome,
    NPM_CONFIG_CACHE: SHARED_NPM_CACHE,
    ZALO_JSON_MODE: "1",
  };

  const timeout = options.timeout || 25000;
  const javisRoot = findJavisZaloRoot(targetHome);
  const localEntry = javisRoot ? path.join(javisRoot, "src", "index.js") : null;

  return new Promise((resolve) => {
    // 1. Ưu tiên chạy trực tiếp bằng node nếu đã tìm thấy javis-zalo (<30ms)
    if (localEntry) {
      const commandArgs = [localEntry, ...args];
      execFile(
        process.execPath,
        commandArgs,
        { env, timeout, maxBuffer: 20 * 1024 * 1024 },
        (err, stdout, stderr) => {
          if (err) {
            return resolve({ ok: false, error: stderr || err.message, raw: stdout });
          }
          try {
            const data = JSON.parse(stdout);
            return resolve({ ok: true, data, raw: stdout });
          } catch {
            return resolve({ ok: true, data: stdout, raw: stdout });
          }
        }
      );
      return;
    }

    // 2. Chạy qua npx (tương thích cả Linux và Windows, dùng chung SHARED_NPM_CACHE)
    const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
    const npxArgs = ["-y", "--prefer-offline", REMOTE_TARBALL, ...args];
    execFile(
      npxCmd,
      npxArgs,
      { env, shell: process.platform === "win32", timeout, maxBuffer: 20 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          return resolve({ ok: false, error: stderr || err.message, raw: stdout });
        }
        try {
          const data = JSON.parse(stdout);
          return resolve({ ok: true, data, raw: stdout });
        } catch {
          return resolve({ ok: true, data: stdout, raw: stdout });
        }
      }
    );
  });
}

if (!globalThis.__zaloBotRepliedMsgIds) {
  globalThis.__zaloBotRepliedMsgIds = new Set();
}
if (!globalThis.__zaloBotInFlightMsgIds) {
  globalThis.__zaloBotInFlightMsgIds = new Set();
}
if (!globalThis.__zaloBotInFlightThreads) {
  globalThis.__zaloBotInFlightThreads = new Map();
}
if (!globalThis.__zaloBotLastReplyByThread) {
  globalThis.__zaloBotLastReplyByThread = new Map();
}
if (!globalThis.__zaloBotLoggedHumanSkipIds) {
  globalThis.__zaloBotLoggedHumanSkipIds = new Set();
}
if (!globalThis.__zaloAutoReplyBootAt) {
  globalThis.__zaloAutoReplyBootAt = Date.now();
}
if (!globalThis.__zaloPersistedRepliedLoadedHomes) {
  globalThis.__zaloPersistedRepliedLoadedHomes = new Set();
}

function getRepliedIdsFilePath(targetHome) {
  return path.join(targetHome, ".zalo-agent-cli", ".crm-replied-ids.json");
}

function loadPersistedRepliedIds(targetHome) {
  if (!targetHome) return;
  const resolved = path.resolve(targetHome);
  if (globalThis.__zaloPersistedRepliedLoadedHomes.has(resolved)) return;
  globalThis.__zaloPersistedRepliedLoadedHomes.add(resolved);
  try {
    const filePath = getRepliedIdsFilePath(targetHome);
    if (!fs.existsSync(filePath)) return;
    const arr = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (Array.isArray(arr)) {
      for (const k of arr) {
        if (k) globalThis.__zaloBotRepliedMsgIds.add(String(k));
      }
    }
  } catch {}
}

function persistRepliedId(targetHome, dedupKey) {
  if (!targetHome || !dedupKey) return;
  try {
    globalThis.__zaloBotRepliedMsgIds.add(dedupKey);
    const filePath = getRepliedIdsFilePath(targetHome);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    let arr = [];
    if (fs.existsSync(filePath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
        if (Array.isArray(parsed)) arr = parsed;
      } catch {}
    }
    if (!arr.includes(dedupKey)) {
      arr.push(dedupKey);
      if (arr.length > 10000) {
        arr = arr.slice(-10000);
      }
      fs.writeFileSync(filePath, JSON.stringify(arr), "utf8");
    }
  } catch {}
}

/**
 * Xử lý tự động tin nhắn mới từ khách hàng trên Zalo Cá Nhân (Module 5 - Realtime Auto-Reply):
 * 1. Kiểm tra isChannelBotEnabled(channelId) và getConversationBotState(threadId).
 * 2. Bóc tách SĐT (nếu có) và cập nhật Hồ sơ 360 qua getOrCreateCustomerByPhone.
 * 3. Nếu mode === 'HUMAN' -> Bỏ qua, không tự động trả lời.
 * 4. Nếu mode === 'AI' -> Sinh câu trả lời Dược sĩ Thảo ngay lập tức, chờ typingDelayMs (3-5s),
 *    kiểm tra lại lần nữa xem nhân viên có nhảy vào tiếp quản trong lúc chờ không, rồi gọi trực tiếp sendTextMessage về cho khách.
 */
export async function processIncomingZaloMessageWithBot({
  msgId,
  timestamp,
  threadId,
  senderName = "",
  senderPhone = "",
  avatarUrl = "",
  genderFromProfile = "",
  accountName = "",
  text = "",
  isMe = false,
  type = "DIRECT",
  channelId = "ZALO_PERSONAL",
  conversationHistory = [],
  homeDir,
  forceReply = false,
} = {}) {
  const cleanText = String(text || "").trim();
  if (
    !threadId ||
    !cleanText ||
    type === "GROUP" ||
    cleanText.startsWith("[chat.undo") ||
    cleanText === "[Nhãn dán]"
  ) {
    return { skipped: true, reason: "GROUP_OR_EMPTY_OR_SYSTEM" };
  }

  // 1. Cơ chế Dedup bền vững (RAM + Disk .crm-replied-ids.json)
  const targetHomePrecheck = homeDir || getActiveZaloHome();
  loadPersistedRepliedIds(targetHomePrecheck);
  const msgToken = String(msgId || timestamp || Date.now());
  const dedupKey = `${threadId}_${msgToken}`;
  if (!forceReply) {
    if (globalThis.__zaloBotRepliedMsgIds.has(dedupKey)) {
      return { skipped: true, reason: "ALREADY_PROCESSED" };
    }
    if (globalThis.__zaloBotInFlightMsgIds.has(dedupKey)) {
      return { skipped: true, reason: "IN_FLIGHT" };
    }
  }

  const targetHome = homeDir || getActiveZaloHome();
  const targetOwnId = getOwnIdForHome(targetHome);
  const specificChannelId =
    channelId && channelId !== "ZALO_PERSONAL"
      ? channelId
      : targetOwnId
      ? `zalo_${targetOwnId}`
      : "ZALO_PERSONAL";
  const botCheck = isBotActiveForThread(threadId, specificChannelId);
  const effectiveMode = botCheck.mode;

  if (isMe) {
    return { skipped: true, reason: "SELF_MESSAGE" };
  }

  // 2. Chỉ cập nhật ngữ cảnh y khoa vào hồ sơ Khách hàng ĐÃ TỒN TẠI (từ khachhang.addp.vn / tạo tay),
  // TUYỆT ĐỐI KHÔNG tự tạo khách mới và KHÔNG tự gắn SĐT hay Thẻ Tag từ nội dung tin nhắn
  const detectedPhone = extractCustomerPhoneFromMessage(cleanText);
  let syncedResult = null;
  let customerRecord = null;
  try {
    syncedResult = await syncCustomerMedicalStateFromMessage({
      threadId: String(threadId),
      senderName: senderName || "Khách Zalo",
      senderPhone: senderPhone || "",
      messageText: cleanText,
      source: channelId || "ZALO_PERSONAL",
      avatarUrl,
      createIfMissing: false,
      allowAutoTags: false,
    });
    customerRecord = syncedResult?.customer || null;
  } catch (syncErr) {
    console.error("[Zalo AI Bot] Lỗi đồng bộ Medical State:", syncErr.message);
  }

  // 3. Kiểm tra trạng thái Bot trên kênh & hội thoại và in log rõ ràng
  if (effectiveMode === "HUMAN") {
    if (!globalThis.__zaloBotLoggedHumanSkipIds.has(dedupKey)) {
      globalThis.__zaloBotLoggedHumanSkipIds.add(dedupKey);
      console.log(
        `[Zalo AI Bot] Nhận tin từ khách: ${cleanText} (threadId: ${threadId}, msgId: ${msgToken}, isMe: ${Boolean(isMe)})`
      );
      console.log(
        `[Zalo AI Bot] Mode: HUMAN (reason: ${botCheck.reason}, accountMode: ${botCheck.accountMode})`
      );
    }
    return {
      skipped: true,
      reason: botCheck.reason,
      state: botCheck,
      customer: customerRecord,
      medicalRecord: syncedResult?.medicalRecord || null,
    };
  }

  globalThis.__zaloBotInFlightMsgIds.add(dedupKey);
  globalThis.__zaloBotInFlightThreads.set(String(threadId), msgToken);

  try {
    const targetHome = homeDir || getActiveZaloHome();
    const effectiveAccountName = accountName || getActiveZaloAccountName(targetHome);

    console.log(
      `[Zalo AI Bot] Nhận tin từ khách: ${cleanText} (threadId: ${threadId}, msgId: ${msgToken}, isMe: ${Boolean(isMe)})`
    );
    console.log(`[Zalo AI Bot] Mode: ${effectiveMode}`);

    // Bổ sung câu trả lời gần nhất của Bot trên thread này vào conversationHistory để chống lặp 100%
    const lastSentReply = globalThis.__zaloBotLastReplyByThread.get(String(threadId));
    const historyWithLastBotReply = Array.isArray(conversationHistory)
      ? [...conversationHistory]
      : [];
    if (
      lastSentReply &&
      !historyWithLastBotReply.some((m) => m && m.isMe && m.text === lastSentReply)
    ) {
      historyWithLastBotReply.push({
        isMe: true,
        text: lastSentReply,
        timestamp: Date.now() - 1000,
      });
    }

    // 4. Đấu nối chuẩn State-Aware Prompting: truyền đầy đủ customerProfile (kèm medicalRecord vừa đồng bộ)
    const aiResult = await generateHumanLikeReply({
      customerMessage: cleanText,
      customerProfile: {
        ...(customerRecord || {}),
        fullName: senderName || customerRecord?.fullName || "",
        phone: detectedPhone || senderPhone || customerRecord?.phone || null,
        avatar: avatarUrl || customerRecord?.avatar || "",
        gender: genderFromProfile || customerRecord?.gender || "",
        medicalRecord: customerRecord?.medicalRecord || syncedResult?.medicalRecord || {},
      },
      accountName: effectiveAccountName,
      channelConfig: {
        channelId,
        accountName: effectiveAccountName,
        homeDir: targetHome,
      },
      conversationHistory: historyWithLastBotReply,
    });

    // Thời gian chờ typing delay 3s (3000ms) trước khi gửi tin
    const delayMs = 3000;
    console.log(
      `[Zalo AI Bot] Đang trả lời sau ${delayMs} ms (LLM=${Boolean(aiResult.llmUsed)}, provider=${aiResult.llmProvider || "fallback"}, learnedQA=${aiResult.learnedQaUsed || 0}${aiResult.llmError ? `, err=${aiResult.llmError}` : ""}): ${aiResult.replyText}`
    );

    await new Promise((resolve) => setTimeout(resolve, delayMs));

    // Nếu trong 3s chờ gõ phím, khách vừa gửi tiếp 1 tin nhắn mới hơn trên cùng threadId -> nhường cho tin nhắn mới nhất trả lời gộp 1 lần!
    if (
      !forceReply &&
      globalThis.__zaloBotInFlightThreads.get(String(threadId)) !== msgToken
    ) {
      globalThis.__zaloBotRepliedMsgIds.add(dedupKey);
      console.log(
        `[Zalo AI Bot] Gộp phản hồi sang tin nhắn mới hơn của khách trên hội thoại ${threadId}.`
      );
      return { skipped: true, reason: "SUPERSEDED_BY_NEWER_CUSTOMER_MESSAGE" };
    }

    // 5. Kiểm tra lại lần nữa sau khi hết thời gian chờ typingDelayMs (chống xung đột nếu nhân viên nhảy vào gõ hoặc kênh chuyển HUMAN)
    const afterDelayCheck = isBotActiveForThread(threadId, specificChannelId);
    if (!afterDelayCheck.active) {
      console.log(
        `[Zalo AI Bot] Đã hủy gửi vì hội thoại/kênh ${specificChannelId} đang ở Mode HUMAN (${afterDelayCheck.reason}).`
      );
      return { skipped: true, reason: afterDelayCheck.reason, state: afterDelayCheck };
    }

    // 6. Gọi trực tiếp hàm gửi tin nhắn sendTextMessage về cho khách (xưng đúng tên nick đang trực)
    const senderLabel = aiResult.staffName
      ? `${aiResult.staffName} (ADDP)`
      : "Chuyên viên Tư vấn ADDP";
    const sendRes = await sendTextMessage(
      senderLabel,
      String(threadId),
      String(aiResult.replyText),
      {
        homeDir: targetHome,
        minTimestamp: Number(timestamp || Date.now()) + 1,
      }
    );

    if (sendRes.ok) {
      persistRepliedId(targetHome, dedupKey);
      globalThis.__zaloBotLastReplyByThread.set(String(threadId), String(aiResult.replyText));
      console.log(`[Zalo AI Bot] Trả lời RAG thành công: ${aiResult.replyText}`);
    }

    return {
      skipped: false,
      sent: sendRes.ok,
      replyText: aiResult.replyText,
      typingDelayMs: delayMs,
      detectedPhone: aiResult.detectedPhone || detectedPhone,
      customer: customerRecord,
      medicalRecord: aiResult.medicalRecord,
      autoTags: aiResult.autoTags,
      error: sendRes.error || null,
    };
  } finally {
    globalThis.__zaloBotInFlightMsgIds.delete(dedupKey);
    if (globalThis.__zaloBotInFlightThreads.get(String(threadId)) === msgToken) {
      globalThis.__zaloBotInFlightThreads.delete(String(threadId));
    }
  }
}

/**
 * Quét các file history.jsonl để phát hiện tức thì tin nhắn mới từ khách hàng (!isSelf)
 * và kích hoạt AI Bot Dược sĩ Thảo tự động trả lời ngay lập tức (kể cả khi nhân viên chưa bấm vào hội thoại).
 */
export async function scanAndAutoReplyZaloHistories(homeDir, ownIdOverride = "") {
  try {
    if (process.env.ZALO_ENABLE_AUTO_REPLY_WATCHER === "0") {
      return;
    }
    const targetHome = homeDir || getActiveZaloHome();
    const ownId = String(ownIdOverride || getOwnIdForHome(targetHome));
    const specificChannelId = ownId ? `zalo_${ownId}` : "ZALO_PERSONAL";

    const activeAccountName = getActiveZaloAccountName(targetHome);
    const cliDir = path.join(targetHome, ".zalo-agent-cli");
    loadPersistedRepliedIds(targetHome);

    // Tuyệt đối không quét auto-reply trong lúc đang đồng bộ lịch sử cũ (backfill)
    const syncProgressPath = path.join(cliDir, ".crm-sync-progress.json");
    if (fs.existsSync(syncProgressPath)) {
      try {
        const sp = JSON.parse(fs.readFileSync(syncProgressPath, "utf8"));
        if (sp?.status === "syncing") {
          return;
        }
      } catch {}
    }

    if (!globalThis.__zaloBotInitialSeedHomes) {
      globalThis.__zaloBotInitialSeedHomes = new Set();
    }

    // Đọc danh sách nhóm (để loại trừ chat nhóm) và danh sách bạn bè (để lấy đúng tên & avatar khách hàng)
    const groupIds = new Set();
    const friendMap = new Map();
    const metaCachePath = path.join(cliDir, "crm-meta-cache.json");
    if (fs.existsSync(metaCachePath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaCachePath, "utf8"));
        for (const g of meta?.groups || []) {
          if (g?.threadId) groupIds.add(String(g.threadId));
        }
        for (const f of meta?.friends || []) {
          if (f?.userId) friendMap.set(String(f.userId), f);
        }
      } catch {}
    }

    const historyFiles = getAllZaloHistoryFiles(targetHome);
    const threadsHistory = new Map();
    const seenMsgIds = new Set();
    const now = Date.now();
    const homeSeedKey = path.resolve(targetHome);
    const isInitialSeed = !globalThis.__zaloBotInitialSeedHomes.has(homeSeedKey);

    for (const filePath of historyFiles) {
      if (!fs.existsSync(filePath)) continue;
      try {
        const content = fs.readFileSync(filePath, "utf8");
        const lines = content.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const msg = JSON.parse(trimmed);
            if (msg.isBackfill) continue;
            const tid = String(msg.threadId || "");
            if (!tid || tid === "0") continue;

            const rawTs = Number(msg.timestamp) || 0;
            const ts =
              rawTs > 2e12 ? Math.floor(rawTs / 1000) : rawTs > 0 && rawTs < 1e11 ? rawTs * 1000 : rawTs;
            if (ts <= 0) continue;

            const msgId = String(msg.msgId || msg.cliMsgId || `${tid}_${ts}`);
            if (seenMsgIds.has(msgId)) continue;
            seenMsgIds.add(msgId);

            const isGroup =
              msg.threadType === "group" || Boolean(msg.isGroup) || groupIds.has(tid);
            if (isGroup) continue;

            const isMe = Boolean(
              msg.isSelf || (ownId && msg.senderId && String(msg.senderId) === ownId)
            );
            const text = String(msg.text || "").trim();

            // Chỉ coi là đã trả lời nếu tin nhắn đã cũ hơn 30 phút
            if (ts < now - 30 * 60 * 1000) {
              globalThis.__zaloBotRepliedMsgIds.add(`${tid}_${msgId}`);
            }

            if (!threadsHistory.has(tid)) {
              threadsHistory.set(tid, []);
            }
            threadsHistory.get(tid).push({
              id: msgId,
              threadId: tid,
              senderId: String(msg.senderId || ""),
              senderName: msg.senderName || (isMe ? activeAccountName : "Khách Zalo"),
              isMe,
              text,
              type: msg.type || "text",
              timestamp: ts,
              seq: threadsHistory.get(tid).length,
            });
          } catch {}
        }
      } catch {}
    }

    globalThis.__zaloBotInitialSeedHomes.add(homeSeedKey);

    // Kiểm tra tin nhắn cuối cùng thực sự (theo timestamp) của từng hội thoại DM
    for (const [tid, msgs] of threadsHistory.entries()) {
      if (!msgs || msgs.length === 0) continue;
      if (ownId && tid === ownId) continue;

      // 1. Kiểm tra trạng thái AI cho riêng hội thoại này (hoặc kế thừa toàn nick)
      const threadBotCheck = isBotActiveForThread(tid, specificChannelId);
      if (!threadBotCheck.active) {
        continue;
      }

      const sortedMsgs = [...msgs].sort((a, b) => a.timestamp - b.timestamp || a.seq - b.seq);
      const lastMsg = sortedMsgs[sortedMsgs.length - 1];

      // 2. Phản hồi tin nhắn hợp lệ từ khách chưa được trả lời (trong vòng 30 phút gần nhất)
      const dedupKey = `${tid}_${lastMsg.id}`;
      if (
        lastMsg &&
        !lastMsg.isMe &&
        lastMsg.text &&
        lastMsg.type === "text" &&
        !globalThis.__zaloBotRepliedMsgIds.has(dedupKey) &&
        !globalThis.__zaloBotInFlightMsgIds.has(dedupKey) &&
        now - lastMsg.timestamp < 30 * 60 * 1000
      ) {
        const friendInfo = friendMap.get(tid);
        const resolvedCustomerName =
          (lastMsg.senderName && lastMsg.senderName !== "Khách Zalo" ? lastMsg.senderName : "") ||
          friendInfo?.displayName ||
          friendInfo?.zaloName ||
          "";

        processIncomingZaloMessageWithBot({
          msgId: lastMsg.id,
          timestamp: lastMsg.timestamp,
          threadId: tid,
          senderName: resolvedCustomerName,
          senderPhone: friendInfo?.phoneNumber || "",
          avatarUrl: friendInfo?.avatar || "",
          accountName: activeAccountName,
          text: lastMsg.text,
          isMe: false,
          type: "DIRECT",
          channelId: specificChannelId,
          conversationHistory: sortedMsgs.slice(-40),
          homeDir: targetHome,
        }).catch((err) => {
          console.error("[Zalo AI Bot] Lỗi xử lý tự động trả lời:", err.message);
        });
      }
    }
  } catch (err) {
    console.error("[Zalo AI Bot] Lỗi quét history.jsonl:", err.message);
  }
}

/**
 * Khởi động vòng lặp theo dõi ngầm history.jsonl (tự động chạy 24/7).
 */
export function startZaloRealtimeAiWatcher() {
  if (process.env.ZALO_ENABLE_AUTO_REPLY_WATCHER === "0") {
    return;
  }
  if (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.NEXT_PHASE?.includes("build") ||
    process.env.npm_lifecycle_event === "build" ||
    process.env.NEXT_RUNTIME === "edge"
  ) {
    return;
  }
  if (globalThis.__zaloAiWatcherTimer) {
    return;
  }

  globalThis.__zaloAiWatcherTimer = setInterval(() => {
    try {
      const accounts = getAllActiveZaloHomes();
      if (accounts.length > 0) {
        for (const acc of accounts) {
          scanAndAutoReplyZaloHistories(acc.homeDir, acc.ownId).catch(() => {});
        }
      } else {
        const fallbackHome = getActiveZaloHome();
        scanAndAutoReplyZaloHistories(fallbackHome).catch(() => {});
      }
    } catch {}
  }, 3000);

  if (typeof globalThis.__zaloAiWatcherTimer.unref === "function") {
    globalThis.__zaloAiWatcherTimer.unref();
  }
}

/**
 * Kiểm tra khách hàng đã từng có kết nối / tin nhắn Zalo từ trước hay chưa trên bất kỳ tài khoản Zalo nào
 * (Tuân thủ Module 3: Tuyệt đối không gửi Broadcast cho người lạ chưa có thread)
 */
export function hasExistingZaloConnection(targetZaloId = "", customerPhone = "") {
  const tid = String(targetZaloId || "").trim();
  const phone = String(customerPhone || "").trim();
  const accounts = getAllActiveZaloHomes();
  const homesToCheck =
    accounts.length > 0 ? accounts.map((a) => a.homeDir) : [getActiveZaloHome()];

  for (const targetHome of homesToCheck) {
    // 1. Kiểm tra trong crm-meta-cache.json (danh sách bạn bè / hội thoại)
    const metaCachePath = path.join(targetHome, ".zalo-agent-cli", "crm-meta-cache.json");
    if (fs.existsSync(metaCachePath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaCachePath, "utf8"));
        if (Array.isArray(meta?.friends)) {
          const matchedFriend = meta.friends.some(
            (f) =>
              (tid && String(f.userId) === tid) ||
              (phone && String(f.phoneNumber || "").includes(phone.slice(-9)))
          );
          if (matchedFriend) return true;
        }
      } catch {}
    }

    // 2. Kiểm tra trong các file history.jsonl
    const historyFiles = getAllZaloHistoryFiles(targetHome);
    for (const hp of historyFiles) {
      try {
        const raw = fs.readFileSync(hp, "utf8");
        if (tid && raw.includes(`"${tid}"`)) return true;
        if (phone && raw.includes(phone)) return true;
      } catch {}
    }
  }

  // 3. Nếu hồ sơ khách hàng đã lưu sẵn zaloUid hoặc zaloThreadId
  if (tid && tid.length >= 6 && tid !== phone) {
    return true;
  }

  return false;
}

/**
 * Gửi tin nhắn trực tiếp qua zaloDirectSendWorker.mjs (<300ms)
 * Tự động tìm UID nếu người nhận là SĐT, ghi log ngay vào history.jsonl
 */
export async function sendZaloMessageDirect({
  homeDir = "",
  recipient = "",
  recipientPhone = "",
  message = "",
  voiceUrl = "",
  isGroup = false,
  timeout = 25000,
}) {
  const targetHome = homeDir || getActiveZaloHome();
  if (!targetHome) {
    return { ok: false, error: "Không tìm thấy thư mục tài khoản Zalo." };
  }

  const workerCandidates = [
    path.resolve(process.cwd(), "src", "lib", "zaloDirectSendWorker.mjs"),
    path.resolve(process.cwd(), "portal", "src", "lib", "zaloDirectSendWorker.mjs"),
  ];
  const workerPath = workerCandidates.find((p) => fs.existsSync(p));

  let javisRoot = findJavisZaloRoot(targetHome);
  if (!javisRoot) {
    try {
      await runZaloCommand(["--version"], { homeDir: targetHome, timeout: 20000 });
      javisRoot = findJavisZaloRoot(targetHome);
    } catch {}
  }

  if (!workerPath || !javisRoot) {
    return { ok: false, error: "WORKER_UNAVAILABLE" };
  }

  return new Promise((resolve) => {
    const childEnv = {
      ...process.env,
      HOME: targetHome,
      USERPROFILE: targetHome,
      JAVIS_ZALO_ROOT: javisRoot,
      SEND_RECIPIENT: String(recipient || ""),
      SEND_RECIPIENT_PHONE: String(recipientPhone || ""),
      SEND_MESSAGE: String(message || ""),
      SEND_VOICE_URL: String(voiceUrl || ""),
      SEND_THREAD_TYPE: isGroup ? "1" : "0",
      ZALO_JSON_MODE: "1",
    };

    execFile(
      process.execPath,
      [workerPath],
      { env: childEnv, timeout, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err && !stdout) {
          return resolve({ ok: false, error: err.message || stderr || "Gửi tin nhắn thất bại" });
        }
        try {
          const lines = String(stdout || "")
            .trim()
            .split(/\r?\n/)
            .filter(Boolean);
          const lastLine = lines[lines.length - 1] || "{}";
          const res = JSON.parse(lastLine);
          return resolve(res);
        } catch {
          return resolve({ ok: false, error: "Phản hồi từ worker gửi tin không hợp lệ" });
        }
      }
    );
  });
}

export async function sendZaloVoiceDirect({
  homeDir = "",
  recipient = "",
  recipientPhone = "",
  voiceUrl = "",
  isGroup = false,
  timeout = 25000,
}) {
  return sendZaloMessageDirect({
    homeDir,
    recipient,
    recipientPhone,
    voiceUrl,
    isGroup,
    timeout,
  });
}

/**
 * Gửi tin nhắn văn bản qua Zalo Cá Nhân (`zca-js` / Zalo Agent CLI)
 * @param {string} targetZaloId - ThreadId hoặc SĐT khách nhận
 * @param {string} text - Nội dung tin nhắn đã cá nhân hóa
 * @param {object} [options] - Tùy chọn { homeDir, isGroup }
 */
export async function sendTextMessage(accountPhone, targetZaloId, text, options = {}) {
  const recipient = String(targetZaloId || "").trim();
  const message = String(text || "").trim();
  if (!recipient || !message) {
    return { ok: false, error: "Thiếu người nhận hoặc nội dung tin nhắn Zalo." };
  }

  const targetHome = options.homeDir || getActiveZaloHome();
  const ownId = getOwnIdForHome(targetHome);
  const isGroup = Boolean(options.isGroup);

  // 1. Thử gửi trực tiếp qua zaloDirectSendWorker (<300ms)
  const directRes = await sendZaloMessageDirect({
    homeDir: targetHome,
    recipient,
    recipientPhone: options.recipientPhone || "",
    message,
    isGroup,
    timeout: 20000,
  });

  if (directRes?.ok) {
    console.log(
      `[Zalo AI Bot] Đã gửi tin nhắn Zalo thành công qua Direct Worker tới ${recipient} (msgId: ${directRes.msgId})`
    );
    return directRes;
  }

  // 2. Fallback sang runZaloCommand nếu worker không khả dụng
  const typeFlag = isGroup ? "1" : "0";
  const res = await runZaloCommand(
    ["msg", "send", recipient, message, "-t", typeFlag, "--json"],
    {
      homeDir: targetHome,
      timeout: 20000,
    }
  );

  if (res.ok) {
    const sentMsgId = String(
      res.data?.message?.msgId || res.data?.msgId || `bot_${Date.now()}`
    );
    console.log(
      `[Zalo AI Bot] Đã gửi tin nhắn Zalo thành công tới ${recipient} (msgId: ${sentMsgId})`
    );
    try {
      const histPath = path.join(targetHome, ".zalo-agent-cli", "history.jsonl");
      fs.mkdirSync(path.dirname(histPath), { recursive: true });
      const lineObj = {
        msgId: sentMsgId,
        threadId: recipient,
        threadType: isGroup ? "group" : "dm",
        senderId: ownId,
        senderName: accountPhone || "Chuyên viên Tư vấn ADDP",
        text: message,
        timestamp: Date.now(),
        isSelf: true,
        type: "text",
      };
      fs.appendFileSync(histPath, JSON.stringify(lineObj) + "\n", "utf8");
    } catch (err) {
      console.warn("[Zalo AI Bot] Không thể ghi history.jsonl:", err.message);
    }
  } else {
    console.error(
      `[Zalo AI Bot] Lỗi gửi tin nhắn Zalo tới ${recipient}:`,
      res.error || res.raw
    );
  }

  return res;
}

export function getMcpPortForHome(targetHome) {
  const cached = globalThis.__zaloMcpDaemons?.get(targetHome);
  if (cached?.port) return cached.port;

  const targetOwnId = getOwnIdForHome(targetHome);
  let portNum = 3099;
  try {
    const activeHomes = getAllActiveZaloHomes();
    const idx = activeHomes.findIndex(
      (h) => path.resolve(h.homeDir) === path.resolve(targetHome) || (targetOwnId && h.ownId === targetOwnId)
    );
    if (idx >= 0) {
      portNum = 3099 + idx;
    } else {
      const hash = String(targetOwnId || targetHome)
        .split("")
        .reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 50, 0);
      portNum = 3105 + Math.abs(hash);
    }
  } catch {}
  return portNum;
}

/**
 * Gửi file đính kèm / ghi âm / hình ảnh qua MCP Daemon HTTP (`zalo_send_file`)
 * vì Zalo yêu cầu kết nối WebSocket sống (`file_done`) để xác nhận upload file non-image.
 */
export async function sendZaloFileViaMcp({
  homeDir,
  recipient,
  recipientPhone = "",
  filePath,
  caption = "",
  isGroup = false,
  isImage = false,
}) {
  const targetHome = homeDir || getActiveZaloHome();
  if (!targetHome || !filePath || !fs.existsSync(filePath)) {
    return { ok: false, error: "Không tìm thấy tệp tin hoặc tài khoản Zalo." };
  }

  const cliDir = path.join(targetHome, ".zalo-agent-cli");
  const outboxDir = path.join(cliDir, "outbox");
  try {
    fs.mkdirSync(outboxDir, { recursive: true });
  } catch {}

  const outboxPath = path.join(outboxDir, path.basename(filePath));
  try {
    if (path.resolve(filePath) !== path.resolve(outboxPath)) {
      fs.copyFileSync(filePath, outboxPath);
    }
  } catch (copyErr) {
    return { ok: false, error: `Không thể chuẩn bị file trong outbox: ${copyErr.message}` };
  }

  // Phân giải SĐT -> UID nếu là DM
  let targetUid = String(recipient || "").trim();
  if (!isGroup && /^(\+?84|0)?\d{9,10}$/.test(targetUid.replace(/[\s.-]/g, ""))) {
    const cleanDigits = String(recipientPhone || targetUid).replace(/\D/g, "");
    const cleanVn = cleanDigits.startsWith("84") && cleanDigits.length >= 10 ? `0${cleanDigits.slice(2)}` : cleanDigits;
    const metaPath = path.join(cliDir, "crm-meta-cache.json");
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        const allContacts = [
          ...(Array.isArray(meta?.friends) ? meta.friends : []),
          ...(Array.isArray(meta?.strangers) ? meta.strangers : []),
        ];
        const matched = allContacts.find((c) => {
          const p = String(c.phoneNumber || c.phone || "").replace(/\D/g, "");
          const pVn = p.startsWith("84") && p.length >= 10 ? `0${p.slice(2)}` : p;
          return pVn && pVn === cleanVn;
        });
        if (matched && (matched.userId || matched.uid)) {
          targetUid = String(matched.userId || matched.uid);
        }
      } catch {}
    }
  }

  // Khởi chạy / kiểm tra MCP Daemon
  ensureZaloMcpDaemon(targetHome);
  const portNum = getMcpPortForHome(targetHome);
  const baseUrl = `http://127.0.0.1:${portNum}`;

  // Đợi tối đa 4 giây cho MCP Daemon sẵn sàng nếu vừa được khởi chạy
  let daemonReady = false;
  for (let i = 0; i < 8; i++) {
    try {
      const hRes = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(800) });
      if (hRes.ok) {
        daemonReady = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }

  if (daemonReady) {
    try {
      const mcpRes = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "tools/call",
          params: {
            name: "zalo_send_file",
            arguments: {
              threadId: targetUid,
              paths: [outboxPath],
              caption: caption || "",
              threadType: isGroup ? 1 : 0,
            },
          },
        }),
        signal: AbortSignal.timeout(45000),
      });

      const rawText = await mcpRes.text();
      let rpcData = null;
      try {
        rpcData = JSON.parse(rawText);
      } catch {
        // Parse SSE response lines if StreamableHTTP returns text/event-stream
        const dataLines = rawText
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim());
        for (const dl of dataLines) {
          try {
            const parsed = JSON.parse(dl);
            if (parsed.result || parsed.error) {
              rpcData = parsed;
              break;
            }
          } catch {}
        }
      }

      if (rpcData?.error) {
        return { ok: false, error: rpcData.error.message || "Lỗi MCP zalo_send_file", recipient: targetUid };
      }
      if (rpcData?.result?.isError) {
        const errTxt = rpcData.result.content?.map((c) => c.text).join(" ") || "Zalo từ chối gửi tệp.";
        return { ok: false, error: errTxt, recipient: targetUid };
      }
      if (rpcData?.result) {
        return { ok: true, data: rpcData.result, recipient: targetUid, via: "mcp" };
      }
    } catch (mcpErr) {
      console.warn("[ZALO_MCP_SEND_FILE_WARN]", mcpErr?.message);
    }
  }

  // Fallback CLI: ảnh dùng send-image (HTTP), file/ghi âm dùng send-file --listen
  const typeStr = isGroup ? "1" : "0";
  if (isImage) {
    const imageArgs = ["msg", "send-image", targetUid, outboxPath, "-t", typeStr, ...(caption ? ["--caption", caption] : []), "--json"];
    const res = await runZaloCommand(imageArgs, { homeDir: targetHome, timeout: 35000 });
    return { ...res, recipient: targetUid };
  } else {
    const fileArgs = ["msg", "send-file", targetUid, outboxPath, "-t", typeStr, "--listen", "--json"];
    const res = await runZaloCommand(fileArgs, { homeDir: targetHome, timeout: 45000 });
    return { ...res, recipient: targetUid };
  }
}
