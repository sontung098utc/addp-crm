import { execFile, spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

/**
 * ADDP Omnichannel AI CRM — High Performance Zalo CLI Runner (Cross-Platform)
 * Tự động nhận diện môi trường Windows / Linux (CentOS, Ubuntu).
 * Hỗ trợ đa tài khoản độc lập qua connector-home & tự động chạy tiến trình đồng bộ ngầm (mcp start).
 */

const LOCAL_ENTRY = "C:\\addp-crm\\server\\tools\\javis-zalo\\node_modules\\javis-zalo\\src\\index.js";
const REMOTE_TARBALL = "https://codeload.github.com/blogminhquy/javis-zalo/tar.gz/refs/tags/v1.9.0";

if (!globalThis.__zaloMcpDaemons) {
  globalThis.__zaloMcpDaemons = new Map();
}

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
 * Đảm bảo tiến trình ngầm `mcp start` luôn chạy cho tài khoản Zalo đang kết nối
 * để tự động backfill lịch sử tin nhắn cũ và lắng nghe tin nhắn mới thời gian thực vào history.jsonl.
 */
export function ensureZaloMcpDaemon(homeDir) {
  try {
    const targetHome = homeDir || getActiveZaloHome();
    if (!targetHome) return false;

    const cliDir = path.join(targetHome, ".zalo-agent-cli");
    const credPath = path.join(cliDir, "credentials");
    if (!fs.existsSync(credPath)) return false;

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
        }
      } catch {}
    }

    // 3. Kiểm tra mcp-stdio-pids.json của Javis (nếu có)
    const stdioCandidates = [
      path.resolve(process.cwd(), "server", "mcp-stdio-pids.json"),
      path.resolve(process.cwd(), "..", "server", "mcp-stdio-pids.json"),
    ];
    for (const sp of stdioCandidates) {
      if (fs.existsSync(sp)) {
        try {
          const map = JSON.parse(fs.readFileSync(sp, "utf8"));
          for (const p of Object.values(map || {})) {
            if (isPidAlive(p)) return true;
          }
        } catch {}
      }
    }

    // 4. Khởi chạy daemon `mcp start` ngầm cho targetHome
    const localCandidates = [
      path.resolve(process.cwd(), "server", "tools", "javis-zalo", "node_modules", "javis-zalo", "src", "index.js"),
      path.resolve(process.cwd(), "..", "server", "tools", "javis-zalo", "node_modules", "javis-zalo", "src", "index.js"),
      path.resolve(process.cwd(), "tools", "javis-zalo", "node_modules", "javis-zalo", "src", "index.js"),
      ...(process.platform === "win32" ? [LOCAL_ENTRY] : []),
    ];
    const localEntry = localCandidates.find((p) => fs.existsSync(p));

    const env = {
      ...process.env,
      HOME: targetHome,
      USERPROFILE: targetHome,
      ZALO_JSON_MODE: "1",
    };

    let child = null;
    if (localEntry) {
      child = spawn(process.execPath, [localEntry, "mcp", "start"], {
        env,
        stdio: ["pipe", "ignore", "ignore"],
      });
    } else {
      const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
      child = spawn(
        npxCmd,
        ["-y", "--prefer-offline", REMOTE_TARBALL, "mcp", "start"],
        {
          env,
          shell: process.platform === "win32",
          stdio: ["pipe", "ignore", "ignore"],
        }
      );
    }

    if (child && child.pid) {
      fs.writeFileSync(pidFile, String(child.pid), "utf8");
      globalThis.__zaloMcpDaemons.set(targetHome, {
        pid: child.pid,
        stdin: child.stdin, // Giữ stdin mở để stdio MCP server không tự thoát
        startedAt: Date.now(),
      });
      child.on("exit", () => {
        globalThis.__zaloMcpDaemons.delete(targetHome);
      });
      child.unref();
      return true;
    }
  } catch (err) {
    console.error("[ENSURE_ZALO_MCP_DAEMON_ERR]", err.message);
  }
  return false;
}

export function getActiveZaloHome() {
  try {
    // 1. Kiểm tra các file mcp_servers.json
    const mcpCandidates = [
      path.resolve(process.cwd(), "server", "mcp_servers.json"),
      path.resolve(process.cwd(), "..", "server", "mcp_servers.json"),
      path.resolve(process.cwd(), "mcp_servers.json"),
      ...(process.platform === "win32" ? ["C:\\addp-crm\\server\\mcp_servers.json"] : []),
    ];
    const mcpPath = mcpCandidates.find((p) => fs.existsSync(p));
    if (mcpPath) {
      const mcpData = JSON.parse(fs.readFileSync(mcpPath, "utf8"));
      const validHomes = [];
      for (const conn of mcpData.connections || []) {
        if (conn.connector_id === "zalo" && conn.config?.home_dir) {
          const credPath = path.join(conn.config.home_dir, ".zalo-agent-cli", "credentials");
          if (fs.existsSync(credPath)) {
            const stat = fs.statSync(credPath);
            validHomes.push({ dir: conn.config.home_dir, mtime: stat.mtimeMs });
          }
        }
      }
      if (validHomes.length > 0) {
        validHomes.sort((a, b) => b.mtime - a.mtime);
        return validHomes[0].dir;
      }
    }

    // 2. Tự động quét trực tiếp các thư mục connector-home
    const baseHomeCandidates = [
      path.resolve(process.cwd(), "connector-home"),
      path.resolve(process.cwd(), "server", "connector-home"),
      path.resolve(process.cwd(), "..", "server", "connector-home"),
      path.resolve(os.tmpdir(), "addp-crm-zalo-homes"),
      ...(process.platform === "win32" ? ["C:\\addp-crm\\server\\connector-home"] : []),
    ];

    const foundHomes = [];
    for (const base of baseHomeCandidates) {
      if (fs.existsSync(base)) {
        try {
          const entries = fs.readdirSync(base, { withFileTypes: true });
          for (const ent of entries) {
            if (ent.isDirectory()) {
              const fullDir = path.join(base, ent.name);
              const credPath = path.join(fullDir, ".zalo-agent-cli", "credentials");
              if (fs.existsSync(credPath)) {
                const stat = fs.statSync(credPath);
                foundHomes.push({ dir: fullDir, mtime: stat.mtimeMs });
              }
            }
          }
        } catch {}
      }
    }

    if (foundHomes.length > 0) {
      foundHomes.sort((a, b) => b.mtime - a.mtime);
      return foundHomes[0].dir;
    }
  } catch (err) {
    console.error("[GET_ACTIVE_ZALO_HOME_ERROR]", err);
  }

  // Fallback an toàn (tự tạo thư mục nếu chưa có)
  const fallback = path.resolve(process.cwd(), "connector-home", "zalo-default");
  try {
    fs.mkdirSync(fallback, { recursive: true });
  } catch {}
  return fallback;
}

export function runZaloCommand(args, options = {}) {
  const targetHome = options.homeDir || getActiveZaloHome();
  const env = {
    ...process.env,
    HOME: targetHome,
    USERPROFILE: targetHome,
    ZALO_JSON_MODE: "1",
  };

  const timeout = options.timeout || 25000;

  const localCandidates = [
    path.resolve(process.cwd(), "server", "tools", "javis-zalo", "node_modules", "javis-zalo", "src", "index.js"),
    path.resolve(process.cwd(), "..", "server", "tools", "javis-zalo", "node_modules", "javis-zalo", "src", "index.js"),
    path.resolve(process.cwd(), "tools", "javis-zalo", "node_modules", "javis-zalo", "src", "index.js"),
    ...(process.platform === "win32" ? [LOCAL_ENTRY] : []),
  ];
  const localEntry = localCandidates.find((p) => fs.existsSync(p));

  return new Promise((resolve) => {
    // 1. Ưu tiên chạy trực tiếp bằng node nếu có file mã nguồn
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

    // 2. Chạy qua npx (tương thích cả Linux và Windows)
    const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
    const npxArgs = ["--prefer-offline", REMOTE_TARBALL, ...args];
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
