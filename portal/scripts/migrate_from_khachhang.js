#!/usr/bin/env node
/**
 * Script Migrate Toàn Diện Database từ khachhang.addp.vn (crm-nextjs, port 3000)
 * sang crm.addp.vn (portal/.data/*.json).
 *
 * Nguồn trích xuất hỗ trợ (theo thứ tự ưu tiên):
 *  1. Kết nối trực tiếp MySQL qua @prisma/client của app cũ hoặc lệnh `mysql` CLI (đọc DATABASE_URL từ .env)
 *  2. File JSON export / SQLite DB (.db) của app cũ
 *  3. File SQL dump (vd: import_len_server_utf8.sql, customers_dump.sql)
 *
 * Cách chạy:
 *  node portal/scripts/migrate_from_khachhang.js
 *  node portal/scripts/migrate_from_khachhang.js --source=/path/to/khachhang
 *  node portal/scripts/migrate_from_khachhang.js --file=/path/to/dump.sql
 *  node portal/scripts/migrate_from_khachhang.js --dry-run
 */

const fs = require("fs");
const path = require("path");
const { execFileSync, execSync } = require("child_process");

const PORTAL_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.resolve(PORTAL_DIR, ".data");
const BACKUP_DIR = path.resolve(DATA_DIR, "backups");

const COLOR_VARIANTS = {
  blue: "bg-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-500/30",
  rose: "bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/30",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30",
  emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30",
  purple: "bg-purple-500/15 text-purple-600 dark:text-purple-300 border-purple-500/30",
  teal: "bg-teal-500/15 text-teal-600 dark:text-teal-300 border-teal-500/30",
  indigo: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border-indigo-500/30",
  orange: "bg-orange-500/15 text-orange-600 dark:text-orange-300 border-orange-500/30",
  pink: "bg-pink-500/15 text-pink-600 dark:text-pink-300 border-pink-500/30",
  slate: "bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30",
};

const COLOR_CYCLE = ["emerald", "amber", "rose", "blue", "purple", "teal", "indigo", "orange", "pink", "slate"];

const TAG_PREFERRED_COLORS = new Map([
  ["đã chốt", "emerald"],
  ["chốt đơn", "emerald"],
  ["kh vip", "purple"],
  ["vip", "purple"],
  ["kh thân thiết", "indigo"],
  ["kh cũ", "teal"],
  ["kh mới", "blue"],
  ["tiềm năng", "amber"],
  ["cần chăm tiếp", "orange"],
  ["cần chăm sóc thêm", "orange"],
  ["đang chăm sóc", "blue"],
  ["gọi điện", "teal"],
  ["tương tác", "indigo"],
  ["khách hàng", "emerald"],
  ["không có nhu cầu", "slate"],
  ["thủ công", "slate"],
  ["chưa mua", "slate"],
]);

/**
 * Chuẩn hóa số điện thoại về định dạng chuẩn Việt Nam 10 chữ số bắt đầu bằng 0 (Điều 3 AGENTS.md)
 */
function normalizePhone(rawPhone) {
  if (!rawPhone) return "";
  let cleaned = String(rawPhone).trim();
  if (!cleaned) return "";

  cleaned = cleaned.replace(/[\s.\-()]/g, "");
  if (cleaned.startsWith("+84")) {
    cleaned = "0" + cleaned.slice(3);
  } else if (cleaned.startsWith("84") && cleaned.length >= 11) {
    cleaned = "0" + cleaned.slice(2);
  }

  cleaned = cleaned.replace(/\D/g, "");
  if (cleaned.startsWith("84") && cleaned.length >= 11) {
    cleaned = "0" + cleaned.slice(2);
  }
  if (cleaned.length === 9 && /^[35789]/.test(cleaned)) {
    cleaned = "0" + cleaned;
  }
  return cleaned;
}

function isValidVietnamPhone(phone) {
  return /^0[35789]\d{8}$/.test(String(phone || ""));
}

/**
 * Bóc tách SĐT hợp lệ từ văn bản (tên, ghi chú, địa chỉ) nếu cột phone chính bị lỗi CSV
 */
function extractBestPhone(row = {}) {
  const candidates = [row.phone, row.zalo, row.fullName, row.address];
  for (const cand of candidates) {
    if (!cand) continue;
    const direct = normalizePhone(cand);
    if (isValidVietnamPhone(direct)) return direct;
    const matches = String(cand).match(/(?:\+84|84|0)[35789](?:[\s.-]?\d){8}/g) || [];
    for (const m of matches) {
      const norm = normalizePhone(m);
      if (isValidVietnamPhone(norm)) return norm;
    }
  }
  const fallback = normalizePhone(row.phone);
  return fallback.length >= 9 && fallback.length <= 11 ? fallback : "";
}

function parseCliArgs(argv) {
  const args = { source: "", file: "", dryRun: false, replace: false };
  for (const a of argv.slice(2)) {
    if (a.startsWith("--source=")) args.source = a.slice("--source=".length).trim();
    else if (a.startsWith("--file=")) args.file = a.slice("--file=".length).trim();
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--replace") args.replace = true;
  }
  return args;
}

function parseEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const raw = fs.readFileSync(envPath, "utf8").replace(/^\uFEFF/, "");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/**
 * Tự động dò tìm thư mục cài đặt ứng dụng khachhang.addp.vn (PM2 crm-nextjs / path phổ biến)
 */
function discoverLegacyDirs(explicitSource) {
  const candidates = [];
  if (explicitSource) candidates.push(path.resolve(explicitSource));
  if (process.env.LEGACY_APP_DIR) candidates.push(path.resolve(process.env.LEGACY_APP_DIR));

  try {
    const pm2Raw = execSync("pm2 jlist", { stdio: ["ignore", "pipe", "ignore"], timeout: 5000 }).toString("utf8");
    const pm2List = JSON.parse(pm2Raw);
    if (Array.isArray(pm2List)) {
      for (const proc of pm2List) {
        const name = String(proc.name || "").toLowerCase();
        const cwd = proc.pm2_env?.pm_cwd || (proc.pm2_env?.pm_exec_path ? path.dirname(proc.pm2_env.pm_exec_path) : "");
        const port = String(proc.pm2_env?.PORT || proc.pm2_env?.env?.PORT || "");
        if (cwd && (name.includes("crm-nextjs") || name.includes("khachhang") || port === "3000" || cwd.toLowerCase().includes("khachhang"))) {
          candidates.unshift(path.resolve(cwd));
        }
      }
    }
  } catch {
    // PM2 không cài trên môi trường dev hoặc không chạy
  }

  const knownPaths = [
    "/home/addp/domains/khachhang.addp.vn/public_html",
    "/www/wwwroot/khachhang.addp.vn",
    "/var/www/khachhang.addp.vn",
    "/var/www/khachhang",
    "/var/www/crm-nextjs",
    "/home/addp/khachhang",
    "/opt/khachhang.addp.vn",
    "/opt/khachhang",
    "/root/khachhang",
    "C:\\QuanlyKH",
  ];
  for (const p of knownPaths) {
    candidates.push(p);
  }

  const seen = new Set();
  return candidates.filter((dir) => {
    const norm = path.normalize(dir);
    if (seen.has(norm)) return false;
    seen.add(norm);
    return fs.existsSync(norm);
  });
}

function parseMysqlUrl(dbUrl) {
  try {
    const u = new URL(dbUrl);
    if (u.protocol !== "mysql:") return null;
    return {
      host: u.hostname || "localhost",
      port: Number(u.port) || 3306,
      user: decodeURIComponent(u.username || "root"),
      password: decodeURIComponent(u.password || ""),
      database: u.pathname.replace(/^\//, "").split("?")[0],
    };
  } catch {
    return null;
  }
}

/**
 * Thử đọc dữ liệu trực tiếp qua Prisma Client của dự án cũ
 */
async function tryExtractViaPrisma(legacyDir, dbUrl) {
  const prismaPkgPath = path.join(legacyDir, "node_modules", "@prisma", "client");
  if (!fs.existsSync(prismaPkgPath)) return null;

  try {
    const { PrismaClient } = require(prismaPkgPath);
    const prisma = new PrismaClient(
      dbUrl ? { datasources: { db: { url: dbUrl } } } : undefined
    );
    await prisma.$connect();
    const [customers, staff, orders, careplans, interactions] = await Promise.all([
      prisma.customer.findMany({ orderBy: { id: "asc" } }),
      prisma.staff.findMany().catch(() => []),
      prisma.order.findMany().catch(() => []),
      prisma.careplan.findMany().catch(() => []),
      prisma.interaction.findMany({ orderBy: { createdAt: "desc" } }).catch(() => []),
    ]);
    await prisma.$disconnect();
    return { sourceLabel: `MySQL (@prisma/client tại ${legacyDir})`, customers, staff, orders, careplans, interactions };
  } catch (err) {
    console.warn(`⚠️  Không thể đọc qua Prisma (${legacyDir}): ${err.message.split("\n")[0]}`);
    return null;
  }
}

function unescapeMysqlTsv(val) {
  if (val === "\\N" || val === undefined) return null;
  return String(val)
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\0/g, "\0")
    .replace(/\\\\/g, "\\");
}

function queryMysqlCliTable(conn, sql) {
  const args = [
    `-h${conn.host}`,
    `-P${conn.port}`,
    `-u${conn.user}`,
    "--default-character-set=utf8mb4",
    "--batch",
    "--raw",
    conn.database,
    "-e",
    sql,
  ];
  const env = { ...process.env };
  if (conn.password) env.MYSQL_PWD = conn.password;
  const output = execFileSync("mysql", args, {
    env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const lines = output.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split("\t");
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("\t");
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = unescapeMysqlTsv(cols[j]);
    }
    rows.push(obj);
  }
  return rows;
}

/**
 * Thử đọc dữ liệu trực tiếp qua lệnh `mysql` CLI (an toàn trên VPS Linux bất kể phiên bản Prisma)
 */
function tryExtractViaMysqlCli(dbUrl) {
  const conn = parseMysqlUrl(dbUrl);
  if (!conn || !conn.database) return null;

  try {
    const customers = queryMysqlCliTable(conn, "SELECT * FROM `customer` ORDER BY id ASC;");
    let staff = [];
    let orders = [];
    let careplans = [];
    let interactions = [];
    try { staff = queryMysqlCliTable(conn, "SELECT id, code, name, role FROM `staff`;"); } catch {}
    try { orders = queryMysqlCliTable(conn, "SELECT * FROM `order`;"); } catch {}
    try { careplans = queryMysqlCliTable(conn, "SELECT * FROM `careplan`;"); } catch {}
    try { interactions = queryMysqlCliTable(conn, "SELECT * FROM `interaction` ORDER BY createdAt DESC;"); } catch {}

    return {
      sourceLabel: `MySQL CLI (${conn.host}:${conn.port}/${conn.database})`,
      customers,
      staff,
      orders,
      careplans,
      interactions,
    };
  } catch (err) {
    console.warn(`⚠️  Không thể kết nối MySQL CLI (${conn.host}:${conn.port}/${conn.database}): ${err.message.split("\n")[0]}`);
    return null;
  }
}

/**
 * Parser SQL VALUES tuple cho MySQL/MariaDB dump (hỗ trợ chuỗi có dấu phẩy, ngoặc đơn, escape \')
 */
function parseSqlInsertTuples(valuesStr) {
  const rows = [];
  let i = 0;
  const len = valuesStr.length;

  while (i < len) {
    while (i < len && valuesStr[i] !== "(") i++;
    if (i >= len) break;
    i++; // skip '('

    const fields = [];
    while (i < len) {
      while (i < len && /\s/.test(valuesStr[i])) i++;
      if (valuesStr[i] === ")") {
        i++;
        break;
      }

      if (valuesStr[i] === "'" || valuesStr[i] === '"') {
        const quote = valuesStr[i++];
        let str = "";
        while (i < len) {
          const ch = valuesStr[i++];
          if (ch === "\\" && i < len) {
            const next = valuesStr[i++];
            if (next === "n") str += "\n";
            else if (next === "r") str += "\r";
            else if (next === "t") str += "\t";
            else if (next === "0") str += "\0";
            else str += next;
          } else if (ch === quote) {
            if (valuesStr[i] === quote) {
              str += quote;
              i++;
            } else {
              break;
            }
          } else {
            str += ch;
          }
        }
        fields.push(str);
      } else {
        let token = "";
        while (i < len && valuesStr[i] !== "," && valuesStr[i] !== ")") {
          token += valuesStr[i++];
        }
        token = token.trim();
        if (token.toUpperCase() === "NULL") fields.push(null);
        else if (/^-?\d+(\.\d+)?$/.test(token)) fields.push(Number(token));
        else fields.push(token);
      }

      while (i < len && /\s/.test(valuesStr[i])) i++;
      if (valuesStr[i] === ",") i++;
    }
    rows.push(fields);
  }
  return rows;
}

/**
 * Đọc dữ liệu từ file SQL dump (hỗ trợ dump `customer`, `staff`, `order`, `careplan`, `interaction`)
 */
function extractFromSqlDump(sqlFilePath) {
  const sqlText = fs.readFileSync(sqlFilePath, "utf8").replace(/^\uFEFF/, "");
  const customers = [];
  const staff = [];
  const orders = [];
  const careplans = [];
  const interactions = [];

  const insertRegex = /INSERT\s+(?:IGNORE\s+)?INTO\s+`?([a-zA-Z0-9_]+)`?\s*(?:\(([^)]+)\))?\s+VALUES\s*([\s\S]*?);(?=\r?\n|$)/gi;
  let match;
  while ((match = insertRegex.exec(sqlText)) !== null) {
    const table = match[1].toLowerCase();
    const colList = match[2]
      ? match[2].split(",").map((c) => c.replace(/`/g, "").trim())
      : null;
    const tuples = parseSqlInsertTuples(match[3]);

    for (const t of tuples) {
      if (table === "customer") {
        if (colList) {
          const obj = {};
          colList.forEach((col, idx) => { obj[col] = t[idx]; });
          customers.push(obj);
        } else {
          // Thứ tự cột chuẩn từ C:\QuanlyKH MariaDB dump
          customers.push({
            id: t[0],
            code: t[1],
            fullName: t[2],
            phone: t[3],
            age: t[4],
            pathology: t[5],
            initialGlucose: t[6],
            status: t[7],
            staffId: t[8],
            createdAt: t[9],
            updatedAt: t[10],
            facebook: t[11],
            zalo: t[12],
            source: t[13],
            address: t[14],
            careStatus: t[15],
            level: t[16],
          });
        }
      } else if (table === "staff" && colList) {
        const obj = {};
        colList.forEach((col, idx) => { obj[col] = t[idx]; });
        staff.push(obj);
      } else if (table === "staff") {
        staff.push({ id: t[0], code: t[1], password: t[2], name: t[3], role: t[4] });
      } else if (table === "order") {
        if (colList) {
          const obj = {};
          colList.forEach((col, idx) => { obj[col] = t[idx]; });
          orders.push(obj);
        } else {
          orders.push({
            id: t[0],
            code: t[1],
            customerId: t[2],
            staffId: t[3],
            products: t[4],
            orderDate: t[5],
            deliveredDate: t[6],
            status: t[7],
            deliveryStatus: t[8],
            createdAt: t[9],
            updatedAt: t[10],
          });
        }
      } else if (table === "careplan") {
        if (colList) {
          const obj = {};
          colList.forEach((col, idx) => { obj[col] = t[idx]; });
          careplans.push(obj);
        } else {
          careplans.push({ id: t[0], customerId: t[1], productName: t[2], startDate: t[3], historyChanges: t[4] });
        }
      } else if (table === "interaction") {
        if (colList) {
          const obj = {};
          colList.forEach((col, idx) => { obj[col] = t[idx]; });
          interactions.push(obj);
        } else {
          interactions.push({
            id: t[0],
            customerId: t[1],
            interactionDate: t[2],
            channel: t[3],
            interactionStatus: t[4],
            content: t[5],
            weeklyFeedback: t[6],
            healthIndexRaw: t[7],
            feedbackRating: t[8],
          });
        }
      }
    }
  }

  return {
    sourceLabel: `SQL Dump (${sqlFilePath})`,
    customers,
    staff,
    orders,
    careplans,
    interactions,
  };
}

function extractFromJsonFile(jsonPath) {
  const raw = fs.readFileSync(jsonPath, "utf8").replace(/^\uFEFF/, "");
  const parsed = JSON.parse(raw);
  const customers = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.customers)
      ? parsed.customers
      : [];
  return {
    sourceLabel: `JSON File (${jsonPath})`,
    customers,
    staff: Array.isArray(parsed.staff) ? parsed.staff : [],
    orders: Array.isArray(parsed.orders) ? parsed.orders : [],
    careplans: Array.isArray(parsed.careplans) ? parsed.careplans : [],
    interactions: Array.isArray(parsed.interactions) ? parsed.interactions : [],
  };
}

function computePurchaseLevelAndVip(totalOrders, totalSpent, legacyLevel) {
  let purchaseLevel = legacyLevel && String(legacyLevel).trim() ? String(legacyLevel).trim() : "Chưa mua";
  if (totalSpent > 20000000) purchaseLevel = "KH VIP";
  else if (totalSpent > 10000000) purchaseLevel = "KH Thân thiết";
  else if (totalSpent > 3000000) purchaseLevel = "KH Cũ";
  else if (totalSpent >= 1000000) purchaseLevel = "KH Mới";
  else if (totalSpent > 0) purchaseLevel = "Khác (<1tr)";

  let vipLevel = "POTENTIAL";
  let vipLabel = "Tiềm năng";
  if (totalOrders >= 5 || totalSpent >= 10000000 || /vip/i.test(purchaseLevel)) {
    vipLevel = "VIP_5";
    vipLabel = "Khách VIP";
  } else if (totalOrders >= 3 || /thân thiết/i.test(purchaseLevel)) {
    vipLevel = "LOYAL_3";
    vipLabel = "Khách Thân Thiết";
  } else if (totalOrders === 2 || /kh cũ/i.test(purchaseLevel)) {
    vipLevel = "REPEAT_2";
    vipLabel = "Tái Mua Lần 2";
  } else if (totalOrders === 1 || /kh mới/i.test(purchaseLevel)) {
    vipLevel = "NEW";
    vipLabel = "Khách Mới";
  }

  return { purchaseLevel, vipLevel, vipLabel };
}

function parseProductsAndSpendFromOrder(orderRow) {
  const statusLower = String(orderRow.status || "").toLowerCase();
  if (statusLower.includes("hủy") || statusLower.includes("cancel") || statusLower.includes("hoàn")) {
    return { spent: 0, products: [] };
  }

  let list = [];
  if (Array.isArray(orderRow.products)) {
    list = orderRow.products;
  } else if (typeof orderRow.products === "string" && orderRow.products.trim()) {
    try {
      const parsed = JSON.parse(orderRow.products);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [{ name: orderRow.products.trim(), subtotal: 0 }];
    }
  }

  let spent = 0;
  const products = [];
  for (const p of list) {
    if (!p) continue;
    const rawName = String(p.name || p.productName || p.title || "").trim();
    const lowerName = rawName.toLowerCase();
    const qty = Number(p.qty || p.quantity || 1) || 1;
    const price = Number(p.price || 0) || 0;
    const subtotal = Number(p.subtotal ?? p.total ?? price * qty) || 0;

    if (!lowerName.includes("tổng tiền") && !lowerName.includes("giảm giá") && !lowerName.includes("trừ tiền")) {
      spent += subtotal;
      if (rawName) {
        const cleanProd = rawName.split(" (")[0].trim();
        if (cleanProd && !products.includes(cleanProd)) products.push(cleanProd);
      }
    }
  }
  return { spent, products };
}

function normalizeChannelAndLabel(row) {
  const rawSource = String(row.source || "").toUpperCase();
  const hasVpage = Boolean(row.vpageUrl && String(row.vpageUrl).trim());
  const hasFb = Boolean(row.facebook && String(row.facebook).trim());
  const hasZalo = Boolean(row.zalo && String(row.zalo).trim());

  if (rawSource === "ZALO" || rawSource === "ZALO_PERSONAL" || (!rawSource && hasZalo)) {
    return { source: "ZALO_PERSONAL", channelLabel: "Zalo Cá Nhân" };
  }
  if (rawSource === "FACEBOOK" || hasFb) {
    return { source: "FACEBOOK", channelLabel: hasVpage ? "Vpage / Fanpage" : "Fanpage FB" };
  }
  if (hasVpage) {
    return { source: "FACEBOOK", channelLabel: "Vpage" };
  }
  if (rawSource === "CALL") {
    return { source: "CALL", channelLabel: "Hotline / Tư vấn" };
  }
  if (rawSource === "SMS") {
    return { source: "SMS", channelLabel: "SMS" };
  }
  if (row.address && /Ngọc Linh|\d{2}-\d{2}-202\d/i.test(String(row.address))) {
    return { source: "FACEBOOK", channelLabel: "Vpage / Fanpage" };
  }
  return { source: rawSource || "OTHER", channelLabel: rawSource || "Hệ thống cũ" };
}

function inferStaffNameFromLegacyRow(row, staffMap) {
  const sId = Number(row.staffId || 0);
  if (sId && staffMap.has(sId)) {
    return staffMap.get(sId);
  }
  const addr = String(row.address || "");
  if (/Ngọc Linh/i.test(addr)) return { id: sId || 4, code: "NL", name: "Ngọc Linh" };
  if (/Sơn Tùng/i.test(addr)) return { id: sId || 2, code: "S001", name: "Sơn Tùng" };
  if (sId === 4) return { id: 4, code: "NL", name: "Ngọc Linh" };
  if (sId === 2) return { id: 2, code: "S001", name: "Sơn Tùng" };
  if (sId === 1) return { id: 1, code: "ADMIN", name: "Quản Trị Viên ADDP" };
  if (row.assignedStaff) return { id: sId || 1, code: "NV", name: String(row.assignedStaff).trim() };
  return { id: 1, code: "ADMIN", name: "Chưa phân bổ" };
}

function pickColorForTag(tagName, index) {
  const lower = String(tagName || "").trim().toLowerCase();
  for (const [key, color] of TAG_PREFERRED_COLORS.entries()) {
    if (lower === key || lower.includes(key)) {
      return color;
    }
  }
  return COLOR_CYCLE[index % COLOR_CYCLE.length];
}

function readJsonSafe(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
      return JSON.parse(raw);
    }
  } catch {}
  return fallback;
}

function backupIfExists(filePath, dryRun) {
  if (dryRun || !fs.existsSync(filePath)) return;
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = path.basename(filePath);
  fs.copyFileSync(filePath, path.join(BACKUP_DIR, `${base}.${stamp}.bak`));
}

async function loadRawDataset(cliArgs) {
  // 1. Chỉ định trực tiếp qua --file
  if (cliArgs.file) {
    const abs = path.resolve(cliArgs.file);
    if (!fs.existsSync(abs)) {
      throw new Error(`Không tìm thấy file nguồn: ${abs}`);
    }
    if (abs.toLowerCase().endsWith(".json")) return extractFromJsonFile(abs);
    if (abs.toLowerCase().endsWith(".sql")) return extractFromSqlDump(abs);
    throw new Error(`Định dạng file chưa hỗ trợ (chỉ hỗ trợ .json hoặc .sql): ${abs}`);
  }

  // 2. Dò tìm thư mục app cũ khachhang.addp.vn
  const candidateDirs = discoverLegacyDirs(cliArgs.source);
  for (const dir of candidateDirs) {
    const envVars = parseEnvFile(path.join(dir, ".env"));
    const dbUrl = envVars.DATABASE_URL || process.env.LEGACY_DATABASE_URL || "";

    if (dbUrl && dbUrl.startsWith("mysql://")) {
      const prismaData = await tryExtractViaPrisma(dir, dbUrl);
      if (prismaData && prismaData.customers.length > 0) return prismaData;

      const cliData = tryExtractViaMysqlCli(dbUrl);
      if (cliData && cliData.customers.length > 0) return cliData;
    }

    // Kiểm tra các file JSON trong thư mục dự án cũ
    const jsonCandidates = [
      path.join(dir, ".data", "customers.json"),
      path.join(dir, "data", "customers.json"),
      path.join(dir, "customers.json"),
    ];
    for (const jf of jsonCandidates) {
      if (fs.existsSync(jf)) {
        const jData = extractFromJsonFile(jf);
        if (jData.customers.length > 0) return jData;
      }
    }

    // Kiểm tra file SQL dump dự phòng trong thư mục dự án cũ
    const sqlCandidates = [
      path.join(dir, "import_len_server_utf8.sql"),
      path.join(dir, "customers_dump.sql"),
      path.join(dir, "dump.sql"),
      path.join(dir, "backup.sql"),
    ];
    for (const sf of sqlCandidates) {
      if (fs.existsSync(sf)) {
        const sData = extractFromSqlDump(sf);
        if (sData.customers.length > 0) return sData;
      }
    }
  }

  throw new Error(
    "Không tìm thấy cơ sở dữ liệu hoặc file dump của khachhang.addp.vn.\n" +
      "Hãy chạy lại kèm tham số --source=/duong-dan/thu-muc-khachhang hoặc --file=/duong-dan/file.sql"
  );
}

async function main() {
  const cliArgs = parseCliArgs(process.argv);
  console.log("🚀 Bắt đầu Migrate dữ liệu từ khachhang.addp.vn sang crm.addp.vn...");
  if (cliArgs.dryRun) console.log("🧪 Chế độ DRY-RUN: chỉ kiểm tra dữ liệu, không ghi đè file.");

  const rawDataset = await loadRawDataset(cliArgs);
  console.log(`📦 Nguồn dữ liệu: ${rawDataset.sourceLabel}`);
  console.log(`📊 Số bản ghi thô đọc được: ${rawDataset.customers.length} khách, ${(rawDataset.orders || []).length} đơn hàng`);

  // Map nhân sự từ DB cũ
  const legacyStaffMap = new Map();
  for (const s of rawDataset.staff || []) {
    legacyStaffMap.set(Number(s.id), {
      id: Number(s.id),
      code: s.code || `NV${s.id}`,
      name: s.name || s.code || `Nhân viên #${s.id}`,
    });
  }

  // Đọc nhân sự hiện có ở portal/.data/staff.json để map RBAC staffId nếu trùng tên/mã
  const portalStaffList = readJsonSafe(path.join(DATA_DIR, "staff.json"), []);
  const portalStaffByName = new Map();
  for (const ps of Array.isArray(portalStaffList) ? portalStaffList : []) {
    if (ps.name) portalStaffByName.set(String(ps.name).trim().toLowerCase(), ps);
    if (ps.code) portalStaffByName.set(String(ps.code).trim().toLowerCase(), ps);
  }

  // Gom đơn hàng, careplan, tương tác theo customerId
  const ordersByCustId = new Map();
  for (const o of rawDataset.orders || []) {
    const cid = Number(o.customerId);
    if (!ordersByCustId.has(cid)) ordersByCustId.set(cid, []);
    ordersByCustId.get(cid).push(o);
  }

  const careplansByCustId = new Map();
  for (const cp of rawDataset.careplans || []) {
    const cid = Number(cp.customerId);
    if (!careplansByCustId.has(cid)) careplansByCustId.set(cid, []);
    careplansByCustId.get(cid).push(cp);
  }

  const interactionsByCustId = new Map();
  for (const it of rawDataset.interactions || []) {
    const cid = Number(it.customerId);
    if (!interactionsByCustId.has(cid)) interactionsByCustId.set(cid, []);
    interactionsByCustId.get(cid).push(it);
  }

  // Đọc dữ liệu hiện có của crm.addp.vn để merge an toàn
  const existingTags = readJsonSafe(path.join(DATA_DIR, "tags.json"), []);
  const existingConvTags = readJsonSafe(path.join(DATA_DIR, "conversation_tags.json"), {});
  const existingCustomers = cliArgs.replace
    ? []
    : readJsonSafe(path.join(DATA_DIR, "customers.json"), []);

  const tagByNameLower = new Map();
  const mergedTags = Array.isArray(existingTags) ? [...existingTags] : [];
  for (const t of mergedTags) {
    if (t && t.name) tagByNameLower.set(String(t.name).trim().toLowerCase(), t);
  }

  function ensureTagExists(tagName) {
    const clean = String(tagName || "").trim();
    if (!clean || ["null", "undefined", "-"].includes(clean.toLowerCase())) return null;
    const lower = clean.toLowerCase();
    if (tagByNameLower.has(lower)) return tagByNameLower.get(lower);

    const color = pickColorForTag(clean, mergedTags.length);
    const created = {
      id: `tag_mig_${Date.now()}_${mergedTags.length + 1}`,
      name: clean,
      color,
      bg: COLOR_VARIANTS[color] || COLOR_VARIANTS.blue,
      createdAt: new Date().toISOString(),
    };
    mergedTags.push(created);
    tagByNameLower.set(lower, created);
    return created;
  }

  const mergedConvTags = typeof existingConvTags === "object" && existingConvTags ? { ...existingConvTags } : {};

  // Index existing customers theo SĐT và code để chống trùng lặp
  const customerMapByKey = new Map();
  let nextCustomerId = 1001;
  for (const ec of Array.isArray(existingCustomers) ? existingCustomers : []) {
    if (Number(ec.id) >= nextCustomerId) nextCustomerId = Number(ec.id) + 1;
    const cleanPhone = normalizePhone(ec.phone);
    const key = isValidVietnamPhone(cleanPhone) ? `phone:${cleanPhone}` : `code:${ec.code || ec.id}`;
    customerMapByKey.set(key, ec);
  }

  let newCustomerCount = 0;
  let updatedCustomerCount = 0;
  let validPhoneCount = 0;
  let mappedConvPhoneCount = 0;
  const newTagNames = new Set();

  for (const row of rawDataset.customers) {
    const legacyId = Number(row.id || 0);
    const cleanPhone = extractBestPhone(row);
    const hasValidVnPhone = isValidVietnamPhone(cleanPhone);
    if (hasValidVnPhone) validPhoneCount++;

    const custOrders = ordersByCustId.get(legacyId) || [];
    const custCareplans = careplansByCustId.get(legacyId) || [];
    const custInteractions = interactionsByCustId.get(legacyId) || [];

    let totalSpent = Number(row.totalSpent || 0) || 0;
    let totalOrders = Number(row.totalOrders || 0) || 0;
    const productSet = new Set(Array.isArray(row.purchasedProducts) ? row.purchasedProducts : []);

    if (custOrders.length > 0) {
      let calcSpent = 0;
      let validOrders = 0;
      for (const ord of custOrders) {
        const { spent, products } = parseProductsAndSpendFromOrder(ord);
        calcSpent += spent;
        if (spent > 0 || !String(ord.status || "").toLowerCase().includes("hủy")) {
          validOrders++;
        }
        for (const p of products) productSet.add(p);
      }
      if (calcSpent > 0) totalSpent = calcSpent;
      if (validOrders > 0) totalOrders = validOrders;
    }

    for (const cp of custCareplans) {
      if (cp.productName) {
        const cleanCpProd = String(cp.productName).split(" (")[0].trim();
        if (cleanCpProd) productSet.add(cleanCpProd);
      }
    }

    const { purchaseLevel, vipLevel, vipLabel } = computePurchaseLevelAndVip(
      totalOrders,
      totalSpent,
      row.level || row.purchaseLevel
    );

    const { source, channelLabel } = normalizeChannelAndLabel(row);
    const legacyStaff = inferStaffNameFromLegacyRow(row, legacyStaffMap);
    const matchedPortalStaff =
      portalStaffByName.get(String(legacyStaff.name || "").toLowerCase()) ||
      portalStaffByName.get(String(legacyStaff.code || "").toLowerCase()) ||
      null;

    // Thu thập thẻ tag chăm sóc
    const rawCareTags = [];
    if (row.status && String(row.status).trim()) rawCareTags.push(String(row.status).trim());
    if (row.careStatus && String(row.careStatus).trim()) rawCareTags.push(String(row.careStatus).trim());
    if (row.careRoute && String(row.careRoute).trim()) rawCareTags.push(String(row.careRoute).trim());
    if (row.careTag && String(row.careTag).trim()) rawCareTags.push(String(row.careTag).trim());
    if (row.level && String(row.level).trim()) rawCareTags.push(String(row.level).trim());
    if (Array.isArray(row.tags)) {
      for (const t of row.tags) if (t) rawCareTags.push(String(t).trim());
    }

    const resolvedTags = [];
    for (const rt of rawCareTags) {
      const existedBefore = tagByNameLower.has(rt.toLowerCase());
      const tagObj = ensureTagExists(rt);
      if (tagObj) {
        if (!existedBefore) newTagNames.add(tagObj.name);
        if (!resolvedTags.includes(tagObj.name)) resolvedTags.push(tagObj.name);
      }
    }

    // Gắn conversation_tags theo SĐT chuẩn
    if (hasValidVnPhone && resolvedTags.length > 0) {
      const existingPhoneTags = Array.isArray(mergedConvTags[cleanPhone]) ? mergedConvTags[cleanPhone] : [];
      mergedConvTags[cleanPhone] = Array.from(new Set([...existingPhoneTags, ...resolvedTags]));
      mappedConvPhoneCount++;
    }

    const latestInteraction = custInteractions[0];
    const notesText =
      (latestInteraction && (latestInteraction.weeklyFeedback || latestInteraction.content)) ||
      row.notes ||
      row.weeklyFeedback ||
      "";

    const key = hasValidVnPhone ? `phone:${cleanPhone}` : `code:${row.code || `KH_${legacyId}`}`;
    const existingRecord = customerMapByKey.get(key);

    const purchasedProducts = Array.from(productSet);
    const createdAtIso = row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString();
    const updatedAtIso = row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString();

    if (existingRecord) {
      const mergedTagList = Array.from(new Set([...(existingRecord.tags || []), ...resolvedTags]));
      const mergedProdList = Array.from(new Set([...(existingRecord.purchasedProducts || []), ...purchasedProducts]));
      customerMapByKey.set(key, {
        ...existingRecord,
        fullName: existingRecord.fullName || String(row.fullName || "Khách hàng").trim(),
        phone: cleanPhone || existingRecord.phone || "",
        address: existingRecord.address || row.address || "",
        age: existingRecord.age ?? (row.age ? Number(row.age) : null),
        pathology: existingRecord.pathology || row.pathology || "",
        initialGlucose: existingRecord.initialGlucose ?? (row.initialGlucose ? Number(row.initialGlucose) : null),
        source: existingRecord.source || source,
        channelLabel: existingRecord.channelLabel || channelLabel,
        facebookUrl: existingRecord.facebookUrl || row.facebook || null,
        vpageUrl: existingRecord.vpageUrl || row.vpageUrl || null,
        zaloPhone: existingRecord.zaloPhone || (isValidVietnamPhone(normalizePhone(row.zalo)) ? normalizePhone(row.zalo) : cleanPhone || null),
        purchasedProducts: mergedProdList,
        totalOrders: Math.max(Number(existingRecord.totalOrders || 0), totalOrders),
        totalSpent: Math.max(Number(existingRecord.totalSpent || 0), totalSpent),
        purchaseLevel,
        vipLevel,
        vipLabel,
        careRoute: existingRecord.careRoute || row.status || resolvedTags[0] || "",
        status: existingRecord.status || row.status || "Tiềm năng",
        careStatus: existingRecord.careStatus || row.careStatus || "Đang chăm sóc",
        tags: mergedTagList,
        staffId: matchedPortalStaff ? Number(matchedPortalStaff.id) : existingRecord.staffId || 1,
        staffCode: matchedPortalStaff?.code || existingRecord.staffCode || legacyStaff.code,
        staffName: existingRecord.staffName || legacyStaff.name,
        assignedStaff: existingRecord.assignedStaff || legacyStaff.name,
        notes: existingRecord.notes || notesText,
        weeklyFeedback: existingRecord.weeklyFeedback || notesText,
        migratedFrom: "khachhang.addp.vn",
        updatedAt: updatedAtIso,
      });
      updatedCustomerCount++;
    } else {
      customerMapByKey.set(key, {
        id: nextCustomerId++,
        legacyId: legacyId || null,
        code: row.code || `KH${String(nextCustomerId).padStart(4, "0")}`,
        fullName: String(row.fullName || "Khách hàng").trim(),
        phone: cleanPhone || "",
        address: row.address || "",
        province: "",
        age: row.age ? Number(row.age) : null,
        pathology: row.pathology || "",
        initialGlucose: row.initialGlucose ? Number(row.initialGlucose) : null,
        currentGlucose: null,
        source,
        channelLabel,
        facebookUrl: row.facebook || null,
        vpageUrl: row.vpageUrl || null,
        zaloUid: null,
        zaloPhone: isValidVietnamPhone(normalizePhone(row.zalo)) ? normalizePhone(row.zalo) : cleanPhone || null,
        purchasedProducts,
        totalOrders,
        totalSpent,
        purchaseLevel,
        vipLevel,
        vipLabel,
        careRoute: row.status || resolvedTags[0] || "",
        status: row.status || "Tiềm năng",
        careStatus: row.careStatus || "Đang chăm sóc",
        tags: resolvedTags,
        staffId: matchedPortalStaff ? Number(matchedPortalStaff.id) : 1,
        staffCode: matchedPortalStaff?.code || legacyStaff.code,
        staffName: legacyStaff.name,
        assignedStaff: legacyStaff.name,
        notes: notesText,
        weeklyFeedback: notesText,
        migratedFrom: "khachhang.addp.vn",
        createdAt: createdAtIso,
        updatedAt: updatedAtIso,
      });
      newCustomerCount++;
    }
  }

  const finalCustomers = Array.from(customerMapByKey.values());

  if (!cliArgs.dryRun) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const customersFile = path.join(DATA_DIR, "customers.json");
    const tagsFile = path.join(DATA_DIR, "tags.json");
    const convTagsFile = path.join(DATA_DIR, "conversation_tags.json");

    backupIfExists(customersFile, false);
    backupIfExists(tagsFile, false);
    backupIfExists(convTagsFile, false);

    fs.writeFileSync(customersFile, JSON.stringify(finalCustomers, null, 2), "utf8");
    fs.writeFileSync(tagsFile, JSON.stringify(mergedTags, null, 2), "utf8");
    fs.writeFileSync(convTagsFile, JSON.stringify(mergedConvTags, null, 2), "utf8");
  }

  console.log("\n✅ HOÀN TẤT MIGRATE DỮ LIỆU!");
  console.log(`   - Tổng khách hàng sau gộp: ${finalCustomers.length} (Thêm mới: ${newCustomerCount}, Cập nhật: ${updatedCustomerCount})`);
  console.log(`   - Khách có SĐT chuẩn VN 10 số: ${validPhoneCount}`);
  console.log(`   - Tổng Thẻ Tag trong tags.json: ${mergedTags.length} (Tạo mới: ${newTagNames.size} -> [${Array.from(newTagNames).join(", ")}])`);
  console.log(`   - Số SĐT được ánh xạ vào conversation_tags.json: ${mappedConvPhoneCount}`);
}

main().catch((err) => {
  console.error("❌ LỖI MIGRATE:", err.message);
  process.exit(1);
});
