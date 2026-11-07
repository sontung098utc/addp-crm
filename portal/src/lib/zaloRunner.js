import { execFile, spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

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

  // Quét các thư mục _npx cache trên Linux / Windows
  const npxBaseDirs = [
    path.join(SHARED_NPM_CACHE, "_npx"),
    path.join(os.homedir(), ".npm", "_npx"),
    "/root/.npm/_npx",
    targetHome ? path.join(targetHome, ".npm", "_npx") : "",
  ].filter(Boolean);

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

    const cliDir = path.join(targetHome, ".zalo-agent-cli");
    const credPath = path.join(cliDir, "credentials");
    if (!fs.existsSync(credPath)) return false;

    // Đảm bảo cấu hình backfill sâu (20 trang DM + 20 trang Group)
    const configPath = path.join(cliDir, "mcp-config.json");
    if (!fs.existsSync(configPath)) {
      try {
        fs.writeFileSync(
          configPath,
          JSON.stringify(
            {
              limits: {
                historyBackfillPages: 20,
                historyBackfillPageTimeout: "10s",
                historyMaxPerThread: 2000,
                historyKeepDays: 30,
              },
            },
            null,
            2
          ),
          "utf8"
        );
      } catch {}
    }

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

    // 3. Khởi chạy daemon `mcp start --http 3099` ngầm cho targetHome (không phụ thuộc stdio nên không bao giờ tự ngắt)
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
      child = spawn(process.execPath, [localEntry, "mcp", "start", "--http", "3099"], {
        env,
        detached: process.platform !== "win32",
        stdio: ["ignore", logFd, logFd],
      });
    } else {
      const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
      child = spawn(
        npxCmd,
        ["-y", "--prefer-offline", REMOTE_TARBALL, "mcp", "start", "--http", "3099"],
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
 * Tìm tất cả thư mục connector-home có chứa dữ liệu Zalo
 */
export function getAllZaloHomes() {
  const baseHomeCandidates = [
    path.resolve(process.cwd(), "connector-home"),
    path.resolve(process.cwd(), "server", "connector-home"),
    path.resolve(process.cwd(), "..", "server", "connector-home"),
    path.resolve(os.tmpdir(), "addp-crm-zalo-homes"),
    ...(process.platform === "win32" ? ["C:\\addp-crm\\server\\connector-home"] : []),
  ];

  const foundHomes = [];
  const seenDirs = new Set();

  for (const base of baseHomeCandidates) {
    if (!fs.existsSync(base)) continue;
    try {
      const entries = fs.readdirSync(base, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const fullDir = path.resolve(base, ent.name);
        if (seenDirs.has(fullDir)) continue;
        seenDirs.add(fullDir);

        const cliDir = path.join(fullDir, ".zalo-agent-cli");
        const credDir = path.join(cliDir, "credentials");
        if (fs.existsSync(credDir)) {
          let latestCredMtime = 0;
          try {
            const stat = fs.statSync(credDir);
            latestCredMtime = stat.mtimeMs;
            if (stat.isDirectory()) {
              for (const f of fs.readdirSync(credDir)) {
                const fStat = fs.statSync(path.join(credDir, f));
                if (fStat.mtimeMs > latestCredMtime) latestCredMtime = fStat.mtimeMs;
              }
            }
          } catch {}

          let historySize = 0;
          try {
            const histPath = path.join(cliDir, "history.jsonl");
            if (fs.existsSync(histPath)) {
              historySize = fs.statSync(histPath).size;
            }
          } catch {}

          foundHomes.push({
            dir: fullDir,
            mtime: latestCredMtime,
            historySize,
          });
        }
      }
    } catch {}
  }

  // Sắp xếp ưu tiên: nếu thời gian tạo credentials chênh lệch > 5 phút thì lấy mới nhất;
  // nếu tạo cùng đợt (như khi git clone) thì ưu tiên thư mục có history.jsonl lớn hơn.
  foundHomes.sort((a, b) => {
    if (Math.abs(b.mtime - a.mtime) > 300000) {
      return b.mtime - a.mtime;
    }
    if (b.historySize !== a.historySize) {
      return b.historySize - a.historySize;
    }
    return b.mtime - a.mtime;
  });

  return foundHomes.map((h) => h.dir);
}

export function getActiveZaloHome() {
  try {
    const allHomes = getAllZaloHomes();
    if (allHomes.length > 0) {
      return allHomes[0];
    }
  } catch (err) {
    console.error("[GET_ACTIVE_ZALO_HOME_ERROR]", err);
  }

  const fallback = path.resolve(process.cwd(), "connector-home", "zalo-default");
  try {
    fs.mkdirSync(fallback, { recursive: true });
  } catch {}
  return fallback;
}

/**
 * Lấy danh sách toàn bộ các file history JSONL (bao gồm cả history thực tế đã lưu, group history và live history)
 */
export function getAllZaloHistoryFiles(primaryHome) {
  const targetHome = primaryHome || getActiveZaloHome();
  const files = [];
  const seen = new Set();

  const addIfExist = (p) => {
    if (!p) return;
    const resolved = path.resolve(p);
    if (!seen.has(resolved) && fs.existsSync(resolved)) {
      seen.add(resolved);
      files.push(resolved);
    }
  };

  // 1. File lịch sử gốc của tài khoản Sơn Tùng (nếu có trong data/)
  addIfExist(path.resolve(process.cwd(), "data", "zalo_history_1781287338457243967.jsonl"));
  addIfExist(path.resolve(process.cwd(), "portal", "data", "zalo_history_1781287338457243967.jsonl"));

  // 2. Các thư mục connector-home khác
  for (const h of getAllZaloHomes()) {
    addIfExist(path.join(h, ".zalo-agent-cli", "crm-group-history.jsonl"));
    addIfExist(path.join(h, ".zalo-agent-cli", "history.jsonl"));
  }

  // 3. Thư mục chính hiện tại (đặt cuối để ghi đè trạng thái mới nhất nếu trùng)
  if (targetHome) {
    addIfExist(path.join(targetHome, ".zalo-agent-cli", "crm-group-history.jsonl"));
    addIfExist(path.join(targetHome, ".zalo-agent-cli", "history.jsonl"));
  }

  return files;
}

/**
 * Thực thi worker đồng bộ trực tiếp Danh bạ + Nhóm (kèm Avatar) + Ghim + Lịch sử tin nhắn Nhóm qua HTTP REST
 */
function triggerDirectSyncWorker(targetHome, forceFull = false) {
  if (globalThis.__zaloSyncInFlight.has(targetHome)) {
    return globalThis.__zaloSyncInFlight.get(targetHome);
  }

  const promise = new Promise((resolve) => {
    const workerCandidates = [
      path.resolve(process.cwd(), "src", "lib", "zaloDirectSyncWorker.mjs"),
      path.resolve(process.cwd(), "portal", "src", "lib", "zaloDirectSyncWorker.mjs"),
    ];
    const workerPath = workerCandidates.find((p) => fs.existsSync(p));
    let javisRoot = findJavisZaloRoot(targetHome);

    const runWorkerWithRoot = (rootDir) => {
      if (!workerPath || !rootDir) {
        return resolve({ ok: false });
      }
      const env = {
        ...process.env,
        HOME: targetHome,
        USERPROFILE: targetHome,
        JAVIS_ZALO_ROOT: rootDir,
        FORCE_FULL_SYNC: forceFull ? "1" : "0",
        ZALO_JSON_MODE: "1",
      };
      execFile(
        process.execPath,
        [workerPath],
        { env, timeout: 22000, maxBuffer: 20 * 1024 * 1024 },
        (err, stdout) => {
          if (err) {
            return resolve({ ok: false, error: err.message });
          }
          try {
            return resolve(JSON.parse(stdout.trim()));
          } catch {
            return resolve({ ok: true });
          }
        }
      );
    };

    if (javisRoot) {
      runWorkerWithRoot(javisRoot);
    } else {
      // Cài đặt ấm cache npx lần đầu rồi chạy worker
      runZaloCommand(["--version"], { homeDir: targetHome, timeout: 15000 }).then(() => {
        javisRoot = findJavisZaloRoot(targetHome);
        runWorkerWithRoot(javisRoot);
      });
    }
  }).finally(() => {
    globalThis.__zaloSyncInFlight.delete(targetHome);
  });

  globalThis.__zaloSyncInFlight.set(targetHome, promise);
  return promise;
}

/**
 * Lấy Metadata Zalo (Danh bạ, Nhóm kèm Avatar, Hội thoại Ghim) & tự động đồng bộ tin nhắn Nhóm mới nhất
 */
export async function syncZaloGroupsAndMetadata(homeDir, forceRefresh = false) {
  const targetHome = homeDir || getActiveZaloHome();
  const cliDir = path.join(targetHome, ".zalo-agent-cli");
  const metaCachePath = path.join(cliDir, "crm-meta-cache.json");

  let cached = null;
  if (fs.existsSync(metaCachePath)) {
    try {
      cached = JSON.parse(fs.readFileSync(metaCachePath, "utf8"));
    } catch {}
  }

  const now = Date.now();
  const cacheAge = cached?.updatedAt ? now - cached.updatedAt : Infinity;

  if (!cached || forceRefresh) {
    // Chờ worker chạy xong để có dữ liệu mới nhất ngay lập tức
    await triggerDirectSyncWorker(targetHome, forceRefresh);
    if (fs.existsSync(metaCachePath)) {
      try {
        cached = JSON.parse(fs.readFileSync(metaCachePath, "utf8"));
      } catch {}
    }
  } else if (cacheAge > 20000) {
    // Đã có cache trên đĩa -> kích hoạt đồng bộ ngầm không chặn phản hồi UI
    triggerDirectSyncWorker(targetHome, false).catch(() => {});
  }

  const friendMap = new Map();
  for (const f of cached?.friends || []) {
    if (f?.userId) friendMap.set(String(f.userId), f);
  }

  const groupMap = new Map();
  for (const g of cached?.groups || []) {
    if (g?.threadId) groupMap.set(String(g.threadId), g);
  }

  const pinnedSet = new Set((cached?.pinnedIds || []).map((id) => String(id)));

  // Fallback nếu worker chưa lấy được (ví dụ chạy qua CLI thuần)
  if (friendMap.size === 0 && groupMap.size === 0) {
    const [fRes, gRes] = await Promise.all([
      runZaloCommand(["friend", "list", "--json"], { homeDir: targetHome, timeout: 12000 }),
      runZaloCommand(["group", "list", "--json"], { homeDir: targetHome, timeout: 12000 }),
    ]);
    if (fRes.ok && Array.isArray(fRes.data)) {
      for (const f of fRes.data) friendMap.set(String(f.userId), f);
    }
    if (gRes.ok && Array.isArray(gRes.data)) {
      for (const g of gRes.data) groupMap.set(String(g.threadId), g);
    }
  }

  return {
    ownId: cached?.ownId || "1781287338457243967",
    friendMap,
    groupMap,
    pinnedSet,
  };
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
