import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

/**
 * ADDP Omnichannel AI CRM — High Performance Zalo CLI Runner (Cross-Platform)
 * Tự động nhận diện môi trường Windows / Linux (CentOS, Ubuntu).
 * Hỗ trợ đa tài khoản độc lập qua connector-home.
 */

const LOCAL_ENTRY = "C:\\addp-crm\\server\\tools\\javis-zalo\\node_modules\\javis-zalo\\src\\index.js";
const REMOTE_TARBALL = "https://codeload.github.com/blogminhquy/javis-zalo/tar.gz/refs/tags/v1.9.0";

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
