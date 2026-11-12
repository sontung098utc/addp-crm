/**
 * ADDP AI CRM — QA AGENT CONFIGURATION & PRODUCTION SAFETY GATE
 */

const fs = require("fs");
const path = require("path");

// Danh sách các nhóm kiểm thử hợp lệ
const VALID_GROUPS = new Set([
  "health",
  "auth",
  "ui-readonly",
  "integrations-readonly",
  "security-safe",
  "audit-claims",
  "all-readonly",
]);

/**
 * Tải tệp cấu hình .env.qa nếu tồn tại (không ghi đè biến môi trường đã có)
 */
function loadDotEnvQa(customEnvPath = null) {
  const envPath = customEnvPath || path.join(process.cwd(), ".env.qa");
  if (!fs.existsSync(envPath)) return false;
  try {
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (key && process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Đọc tham số dòng lệnh CLI
 */
function parseCliArgs(args = process.argv.slice(2)) {
  const parsed = {};
  for (const arg of args) {
    if (arg.startsWith("--target=")) {
      parsed.target = arg.slice("--target=".length).trim();
    } else if (arg.startsWith("--base-url=")) {
      parsed.baseUrl = arg.slice("--base-url=".length).trim();
    } else if (arg.startsWith("--group=")) {
      parsed.group = arg.slice("--group=".length).trim();
    } else if (arg.startsWith("--confirm-production=")) {
      parsed.confirmProduction = arg.slice("--confirm-production=".length).trim();
    } else if (arg === "--confirm-production") {
      parsed.confirmProduction = "true";
    } else if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    }
  }
  return parsed;
}

/**
 * Thẩm định tính hợp lệ của Hostname & Scheme theo từng Target cụ thể (Không dùng Wildcard rộng)
 * Chặn hoàn toàn URL có chứa credentials (user:pass), IP riêng lạ hoặc protocol nguy hiểm.
 */
function validateHost(baseUrl, target = "local") {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(`[INVALID_URL] Địa chỉ QA_BASE_URL "${baseUrl}" không phải là URL hợp lệ.`);
  }

  // 1. Chặn URL mang credentials (username/password)
  if (url.username || url.password) {
    throw new Error(
      `[SAFETY_VIOLATION] URL chứa credentials (user:pass@) bị từ chối vì lý do an toàn bảo mật.`
    );
  }

  // 2. Chặn các scheme không phải HTTP/HTTPS
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      `[SAFETY_VIOLATION] Giao thức "${url.protocol}" không được phép. Chỉ chấp nhận "http:" hoặc "https:".`
    );
  }

  const hostname = url.hostname.toLowerCase();
  const port = url.port ? Number(url.port) : (url.protocol === "https:" ? 443 : 80);

  // 3. Chặn các dải IP riêng (Private RFC1918 / Loopback lạ)
  const isPrivateIp = (ip) => {
    if (ip === "127.0.0.1" || ip === "::1") return false; // Cho phép loopback chuẩn
    return (
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip) ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(ip) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(ip) ||
      /^169\.254\.\d{1,3}\.\d{1,3}$/.test(ip)
    );
  };

  if (isPrivateIp(hostname)) {
    throw new Error(
      `[SAFETY_VIOLATION] IP nội bộ "${hostname}" bị từ chối. QA Agent không quét IP mạng nội bộ không xác thực.`
    );
  }

  // 4. Kiểm tra danh mục Host cụ thể theo từng Target (Explicit Whitelist - No Wildcards)
  if (target === "local") {
    const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
    if (!isLocalHost) {
      throw new Error(
        `[SAFETY_VIOLATION] Với target="local", hostname bắt buộc phải là localhost hoặc 127.0.0.1 (nhận được "${hostname}").`
      );
    }
    // Cho phép cổng local (1-65535)
    if (port < 1 || port > 65535) {
      throw new Error(`[SAFETY_VIOLATION] Cổng ${port} không hợp lệ.`);
    }
  } else if (target === "staging") {
    if (url.protocol !== "https:") {
      throw new Error(`[SAFETY_VIOLATION] Với target="staging", bắt buộc phải dùng giao thức https://`);
    }
    const isStagingHost = hostname === "staging-crm.addp.vn";
    if (!isStagingHost) {
      throw new Error(
        `[SAFETY_VIOLATION] Với target="staging", chỉ chấp nhận host cụ thể: "staging-crm.addp.vn" (nhận được "${hostname}").`
      );
    }
  } else if (target === "production") {
    if (url.protocol !== "https:") {
      throw new Error(`[SAFETY_VIOLATION] Với target="production", bắt buộc phải dùng giao thức https://`);
    }
    const isProductionHost = hostname === "crm.addp.vn";
    if (!isProductionHost) {
      throw new Error(
        `[SAFETY_VIOLATION] Với target="production", chỉ chấp nhận host sản xuất chính thức: "crm.addp.vn" (nhận được "${hostname}").`
      );
    }
  }

  return url.origin;
}

/**
 * Tải và kiểm tra toàn bộ cấu hình QA Agent
 */
function getQaConfig(overrideOpts = {}) {
  loadDotEnvQa();
  const cliArgs = parseCliArgs();

  const target = String(
    overrideOpts.target ||
    cliArgs.target ||
    process.env.QA_TARGET ||
    "local"
  ).trim().toLowerCase();

  if (!["local", "staging", "production"].includes(target)) {
    throw new Error(`[INVALID_TARGET] QA_TARGET "${target}" không hợp lệ. Phải là "local", "staging" hoặc "production".`);
  }

  let defaultBaseUrl = "http://localhost:3000";
  if (target === "production") defaultBaseUrl = "https://crm.addp.vn";
  if (target === "staging") defaultBaseUrl = "https://staging-crm.addp.vn";

  const rawBaseUrl = String(
    overrideOpts.baseUrl ||
    cliArgs.baseUrl ||
    process.env.QA_BASE_URL ||
    defaultBaseUrl
  ).trim();

  const validatedBaseUrl = validateHost(rawBaseUrl, target);

  // ĐIỀU KIỆN PRODUCTION GATE (Đã làm rõ: chấp nhận EITHER cờ CLI hoặc biến môi trường)
  const isCliConfirmed = String(cliArgs.confirmProduction || "").toLowerCase() === "true";
  const isEnvConfirmed = String(process.env.QA_CONFIRM_PRODUCTION || "").toLowerCase() === "true";
  const isOverrideConfirmed = String(overrideOpts.confirmProduction ?? "").toLowerCase() === "true";

  const confirmProduction = isOverrideConfirmed || isCliConfirmed || isEnvConfirmed;

  // KHÓA BẢO VỆ PRODUCTION (SAFETY BARRIER)
  if (target === "production" && !confirmProduction) {
    throw new Error(
      `[PRODUCTION_SAFETY_BLOCKED] Môi trường mục tiêu là "production" (${validatedBaseUrl}) ` +
      `nhưng cờ xác nhận an toàn chưa được bật. ` +
      `Để bảo vệ hệ thống sản xuất, QA Agent từ chối khởi chạy. ` +
      `Vui lòng cung cấp cờ --confirm-production=true trên dòng lệnh HOẶC thiết lập QA_CONFIRM_PRODUCTION=true trong biến môi trường.`
    );
  }

  const group = String(
    overrideOpts.group ||
    cliArgs.group ||
    process.env.QA_GROUP ||
    "all-readonly"
  ).trim();

  if (!VALID_GROUPS.has(group)) {
    throw new Error(
      `[INVALID_GROUP] Nhóm kiểm tra "${group}" không hợp lệ. ` +
      `Các nhóm được phép: ${Array.from(VALID_GROUPS).join(", ")}.`
    );
  }

  return {
    target,
    baseUrl: validatedBaseUrl,
    confirmProduction,
    group,
    testStaffCode: process.env.QA_TEST_STAFF_CODE || "QA_TEST_01",
    testStaffRole: process.env.QA_TEST_STAFF_ROLE || "SALE",
    testSessionToken: process.env.QA_TEST_SESSION_TOKEN || "",
    timeoutMs: Number(process.env.QA_REQUEST_TIMEOUT_MS) || 6000,
    delayBetweenRequestsMs: Number(process.env.QA_DELAY_BETWEEN_REQUESTS_MS) || 200,
    reportDir: process.env.QA_REPORT_DIR || "./reports/qa",
    help: Boolean(cliArgs.help),
  };
}

module.exports = {
  VALID_GROUPS,
  getQaConfig,
  validateHost,
  loadDotEnvQa,
  loadQaEnv: loadDotEnvQa,
  parseCliArgs,
};
