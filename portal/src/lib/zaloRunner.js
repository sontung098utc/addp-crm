import { execFile } from "child_process";
import fs from "fs";
import path from "path";

/**
 * ADDP Omnichannel AI CRM — High Performance Zalo CLI Runner
 * Chạy trực tiếp Node.js với file mã nguồn javis-zalo đã cài sẵn trong server/tools/javis-zalo.
 * Loại bỏ 100% độ trễ của npx (từ 10-12s giảm xuống dưới 1-2s).
 */

const LOCAL_ENTRY = "C:\\addp-crm\\server\\tools\\javis-zalo\\node_modules\\javis-zalo\\src\\index.js";
const REMOTE_TARBALL = "https://codeload.github.com/blogminhquy/javis-zalo/tar.gz/refs/tags/v1.9.0";

export function getActiveZaloHome() {
  try {
    const candidates = [
      path.resolve(process.cwd(), "server", "mcp_servers.json"),
      path.resolve(process.cwd(), "..", "server", "mcp_servers.json"),
      "C:\\addp-crm\\server\\mcp_servers.json",
    ];
    const mcpPath = candidates.find((p) => fs.existsSync(p));
    if (!mcpPath) return "C:\\addp-crm\\server\\connector-home\\zalo-addp-zalo-ca-nhan-b0cdc0";

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
  } catch {}
  return "C:\\addp-crm\\server\\connector-home\\zalo-addp-zalo-ca-nhan-b0cdc0";
}

export function runZaloCommand(args, options = {}) {
  const targetHome = options.homeDir || getActiveZaloHome();
  const env = {
    ...process.env,
    HOME: targetHome,
    USERPROFILE: targetHome,
  };

  const timeout = options.timeout || 20000;

  return new Promise((resolve, reject) => {
    // 1. Ưu tiên chạy trực tiếp bằng node nếu có file entry nội bộ
    if (fs.existsSync(LOCAL_ENTRY)) {
      const commandArgs = [LOCAL_ENTRY, ...args];
      execFile(
        "node",
        commandArgs,
        { env, timeout, maxBuffer: 10 * 1024 * 1024 },
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

    // 2. Dự phòng npx nếu chưa cài
    const npxArgs = ["--prefer-offline", REMOTE_TARBALL, ...args];
    execFile(
      "npx.cmd",
      npxArgs,
      { env, shell: true, timeout, maxBuffer: 10 * 1024 * 1024 },
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
