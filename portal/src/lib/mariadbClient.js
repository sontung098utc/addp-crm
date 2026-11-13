import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

/**
 * ADDP Omnichannel AI CRM — MariaDB 10.6 Client & Schema Initializer
 * Sử dụng cấu hình từ portal/.env (MYSQL_HOST, MYSQL_PORT, MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD hoặc DATABASE_URL).
 */

export function getMariaDbConfig() {
  let host = process.env.MYSQL_HOST || "";
  let port = process.env.MYSQL_PORT || "3306";
  let database = process.env.MYSQL_DATABASE || "";
  let user = process.env.MYSQL_USER || "";
  let password = process.env.MYSQL_PASSWORD || "";

  if ((!host || !database || !user) && process.env.DATABASE_URL) {
    try {
      const cleaned = process.env.DATABASE_URL.replace(/^mysql:\/\//i, "");
      const [authPart, rest] = cleaned.split("@");
      if (authPart && rest) {
        const colonIdx = authPart.indexOf(":");
        user = user || decodeURIComponent(colonIdx >= 0 ? authPart.slice(0, colonIdx) : authPart);
        password = password || decodeURIComponent(colonIdx >= 0 ? authPart.slice(colonIdx + 1) : "");
        const [hostPort, dbAndQuery] = rest.split("/");
        const [h, p] = hostPort.split(":");
        host = host || h || "localhost";
        port = p || port;
        database = database || (dbAndQuery || "").split("?")[0];
      }
    } catch {}
  }

  return {
    configured: Boolean(host && database && user),
    host: host || "localhost",
    port: String(port || "3306"),
    database,
    user,
    password,
  };
}

export function sqlEscape(val) {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return Number.isFinite(val) ? String(val) : "NULL";
  if (typeof val === "boolean") return val ? "1" : "0";
  const str = String(val)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\0/g, "\\0")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
  return `'${str}'`;
}

export function runMariaDbSql(sql) {
  const cfg = getMariaDbConfig();
  if (!cfg.configured) {
    return { ok: false, error: "Chưa cấu hình thông tin kết nối MariaDB trong .env." };
  }
  try {
    const args = [
      `-h${cfg.host}`,
      `-P${cfg.port}`,
      `-u${cfg.user}`,
      ...(cfg.password ? [`-p${cfg.password}`] : []),
      "--default-character-set=utf8mb4",
      "-B",
      "-N",
      "-r",
      cfg.database,
      "-e",
      sql,
    ];
    const stdout = execFileSync("mysql", args, {
      encoding: "utf8",
      maxBuffer: 25 * 1024 * 1024,
      timeout: 20000,
    });
    return { ok: true, stdout };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export function queryMariaDbJson(sql) {
  const res = runMariaDbSql(sql);
  if (!res.ok) return { ok: false, error: res.error, rows: [] };
  const rows = String(res.stdout || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return { ok: true, rows };
}

export function ensureAiMariaDbTables() {
  const ddl = `
    CREATE TABLE IF NOT EXISTS ai_settings (
      id INT PRIMARY KEY,
      settings_json LONGTEXT NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS ai_bot_profiles (
      account_key VARCHAR(128) PRIMARY KEY,
      channel VARCHAR(40) NOT NULL,
      account_id VARCHAR(128) NOT NULL,
      account_name VARCHAR(255) NOT NULL,
      bot_name VARCHAR(120) NOT NULL DEFAULT 'Trợ lý ADDP',
      mode VARCHAR(20) NOT NULL DEFAULT 'COPILOT',
      persona_prompt TEXT,
      assigned_doc_ids LONGTEXT,
      reply_delay_min INT NOT NULL DEFAULT 5,
      reply_delay_max INT NOT NULL DEFAULT 15,
      takeover_minutes INT NOT NULL DEFAULT 45,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS ai_knowledge_docs (
      id VARCHAR(64) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      category VARCHAR(40) NOT NULL DEFAULT 'PRODUCT',
      file_name VARCHAR(255),
      file_type VARCHAR(40),
      chunk_count INT NOT NULL DEFAULT 0,
      account_keys LONGTEXT,
      preview TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS ai_training_examples (
      id VARCHAR(64) PRIMARY KEY,
      account_key VARCHAR(128) NOT NULL,
      intent VARCHAR(80) NOT NULL DEFAULT 'GENERAL',
      customer_msg TEXT NOT NULL,
      staff_reply TEXT NOT NULL,
      source VARCHAR(40) NOT NULL DEFAULT 'MANUAL',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_account_intent (account_key, intent)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS crm_messages_archive (
      id VARCHAR(128) PRIMARY KEY,
      channel VARCHAR(40) NOT NULL,
      account_key VARCHAR(128) NOT NULL,
      thread_id VARCHAR(128) NOT NULL,
      sender_id VARCHAR(128),
      sender_name VARCHAR(255),
      is_self TINYINT(1) NOT NULL DEFAULT 0,
      content LONGTEXT NOT NULL,
      msg_type VARCHAR(40) NOT NULL DEFAULT 'text',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_thread_time (account_key, thread_id, created_at),
      FULLTEXT INDEX ft_content (content)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;
  return runMariaDbSql(ddl);
}

export function getLocalDataFilePath(fileName) {
  const dataDir =
    process.env.DATA_DIR ||
    (fs.existsSync(path.join(process.cwd(), "portal", "package.json"))
      ? "portal/.data"
      : ".data");
  return path.isAbsolute(dataDir)
    ? path.join(dataDir, fileName)
    : path.join(process.cwd(), dataDir, fileName);
}
