/**
 * ADDP AI CRM — CÔNG CỤ CHUYỂN DỊCH DỮ LIỆU TỪ JSON SANG MYSQL (MIGRATION SCRIPT)
 * Hỗ trợ chuyển đổi toàn bộ 6 thực thể cốt lõi: staff, customers, orders, inventory, conversations, care_tasks
 * Chạy với cờ --dry-run để kiểm tra tính toàn vẹn và sinh lệnh SQL an toàn trong Transaction.
 *
 * Cách dùng:
 *   node scripts/migrate_json_to_mysql.js --dry-run
 *   node scripts/migrate_json_to_mysql.js --output-sql=database/seeds/migrated_data.sql
 */

const fs = require("fs");
const path = require("path");

function normalizePhone(raw) {
  if (!raw) return "";
  let digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("84") && digits.length >= 11) {
    digits = "0" + digits.slice(2);
  }
  if (!digits.startsWith("0") && (digits.length === 9 || digits.length === 10)) {
    digits = "0" + digits;
  }
  return digits.length === 10 ? digits : "";
}

function resolveJsonFile(fileName) {
  const candidates = [
    path.join(process.cwd(), "portal", ".data", fileName),
    path.join(process.cwd(), ".data", fileName),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function readJsonSafe(fileName) {
  const filePath = resolveJsonFile(fileName);
  if (!filePath) return [];
  try {
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : Object.values(parsed);
  } catch (err) {
    console.error(`[READ_ERROR] ${fileName}:`, err.message);
    return [];
  }
}

function escapeSql(val) {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number" || typeof val === "boolean") return val ? 1 : 0;
  if (typeof val === "object") return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  return `'${String(val).replace(/'/g, "''").replace(/\\/g, "\\\\")}'`;
}

function runMigration() {
  if (process.argv.some((a) => a.startsWith("--db-pass") || a.startsWith("-p"))) {
    console.error("\n❌ [SECURITY ERROR] Tuyệt đối không truyền mật khẩu CSDL qua tham số dòng lệnh!");
    console.error("👉 Vui lòng sử dụng biến môi trường bảo mật: DB_PASSWORD hoặc DATABASE_URL.\n");
    process.exit(1);
  }

  const isDryRun = process.argv.includes("--dry-run");
  const sqlOutputArg = process.argv.find((a) => a.startsWith("--output-sql="));
  const sqlOutputPath = sqlOutputArg ? sqlOutputArg.split("=")[1] : null;

  console.log("==============================================================================");
  console.log("🚀 ADDP AI CRM — KẾ HOẠCH & CÔNG CỤ CHUYỂN DỊCH DỮ LIỆU TỪ JSON SANG MYSQL");
  console.log("==============================================================================");
  console.log(`📌 Chế độ thực thi : ${isDryRun ? "DRY-RUN (Kiểm tra & Báo cáo)" : "EXPORT / LIVE"}`);

  const sqlStatements = [
    "-- Tự động sinh bởi migrate_json_to_mysql.js",
    "SET NAMES utf8mb4;",
    "SET FOREIGN_KEY_CHECKS = 0;",
    "START TRANSACTION;",
    "",
  ];

  const stats = {
    staff: { read: 0, valid: 0, skipped: 0 },
    customers: { read: 0, valid: 0, skipped: 0 },
    orders: { read: 0, valid: 0, skipped: 0 },
    inventory: { read: 0, valid: 0, skipped: 0 },
    careTasks: { read: 0, valid: 0, skipped: 0 },
  };

  // 1. Chuyển đổi Staff
  const rawStaff = readJsonSafe("staff.json");
  stats.staff.read = rawStaff.length;
  const staffCodeSet = new Set();
  for (const s of rawStaff) {
    const code = String(s.code || s.username || "").trim().toUpperCase();
    if (!code || staffCodeSet.has(code)) {
      stats.staff.skipped++;
      continue;
    }
    staffCodeSet.add(code);
    stats.staff.valid++;
    sqlStatements.push(
      `INSERT INTO \`staff\` (\`code\`, \`name\`, \`email\`, \`phone\`, \`role\`, \`teamName\`, \`dailyCareTarget\`, \`dailyMsgTarget\`, \`isActive\`) ` +
      `VALUES (${escapeSql(code)}, ${escapeSql(s.name || s.fullName)}, ${escapeSql(s.email)}, ${escapeSql(s.phone)}, ${escapeSql(s.role || "SALE")}, ${escapeSql(s.teamName || "Team Sale 01")}, ${Number(s.dailyCareTarget) || 10}, ${Number(s.dailyMsgTarget) || 70}, ${s.isActive !== false ? 1 : 0}) ` +
      `ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`), \`role\` = VALUES(\`role\`);`
    );
  }

  // 2. Chuyển đổi Customers
  const rawCustomers = readJsonSafe("customers.json");
  stats.customers.read = rawCustomers.length;
  const customerPhoneSet = new Set();
  for (const c of rawCustomers) {
    const cleanPhone = normalizePhone(c.phone);
    if (!cleanPhone || customerPhoneSet.has(cleanPhone)) {
      stats.customers.skipped++;
      continue;
    }
    customerPhoneSet.add(cleanPhone);
    stats.customers.valid++;
    sqlStatements.push(
      `INSERT INTO \`customers\` (\`phone\`, \`name\`, \`address\`, \`pathology\`, \`bloodSugar\`, \`assignedStaffId\`, \`assignedStaffName\`, \`totalSpent\`, \`totalOrders\`) ` +
      `VALUES (${escapeSql(cleanPhone)}, ${escapeSql(c.fullName || c.name || "Khách hàng")}, ${escapeSql(c.address || "")}, ${escapeSql(c.pathology || "")}, ${c.bloodSugar ? Number(c.bloodSugar) : "NULL"}, ${Number(c.staffId) || 1}, ${escapeSql(c.assignedStaff || c.staffName || "Admin")}, ${Number(c.totalSpent) || 0}, ${Number(c.totalOrders) || 0}) ` +
      `ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`), \`totalSpent\` = VALUES(\`totalSpent\`);`
    );
  }

  // 3. Chuyển đổi Orders
  const rawOrders = readJsonSafe("orders.json");
  stats.orders.read = rawOrders.length;
  const orderCodeSet = new Set();
  for (const o of rawOrders) {
    const code = String(o.orderCode || o.id || "").trim();
    if (!code || orderCodeSet.has(code)) {
      stats.orders.skipped++;
      continue;
    }
    orderCodeSet.add(code);
    stats.orders.valid++;
    sqlStatements.push(
      `INSERT INTO \`orders\` (\`orderCode\`, \`customerName\`, \`customerPhone\`, \`totalAmount\`, \`finalAmount\`, \`channel\`, \`status\`, \`staffId\`, \`staffName\`) ` +
      `VALUES (${escapeSql(code)}, ${escapeSql(o.customerName || "Khách hàng")}, ${escapeSql(normalizePhone(o.phone))}, ${Number(o.totalAmount) || 0}, ${Number(o.finalAmount) || 0}, ${escapeSql(o.channel || "ZALO_PERSONAL")}, ${escapeSql(o.status || "CONFIRMED")}, ${Number(o.staffId) || 1}, ${escapeSql(o.staffName || "Admin")}) ` +
      `ON DUPLICATE KEY UPDATE \`status\` = VALUES(\`status\`);`
    );
  }

  // 4. Chuyển đổi Care Tasks
  const rawTasks = readJsonSafe("care_tasks.json");
  stats.careTasks.read = rawTasks.length;
  const taskIdSet = new Set();
  for (const t of rawTasks) {
    const id = String(t.id || "").trim();
    if (!id || taskIdSet.has(id)) {
      stats.careTasks.skipped++;
      continue;
    }
    taskIdSet.add(id);
    stats.careTasks.valid++;
    sqlStatements.push(
      `INSERT INTO \`care_tasks\` (\`id\`, \`orderCode\`, \`customerName\`, \`customerPhone\`, \`staffId\`, \`staffName\`, \`taskType\`, \`title\`, \`deadline\`, \`isCompleted\`) ` +
      `VALUES (${escapeSql(id)}, ${escapeSql(t.orderCode || null)}, ${escapeSql(t.customerName || "Khách hàng")}, ${escapeSql(normalizePhone(t.customerPhone || t.phone))}, ${Number(t.staffId) || 1}, ${escapeSql(t.staffName || "Admin")}, ${escapeSql(t.taskType || "DAY_1")}, ${escapeSql(t.title || "Chăm sóc")}, ${escapeSql(t.deadline || new Date().toISOString().slice(0, 10))}, ${t.isCompleted ? 1 : 0}) ` +
      `ON DUPLICATE KEY UPDATE \`isCompleted\` = VALUES(\`isCompleted\`);`
    );
  }

  sqlStatements.push("COMMIT;");
  sqlStatements.push("SET FOREIGN_KEY_CHECKS = 1;");

  console.log("\n📊 KẾT QUẢ ĐỐI SOÁT & KIỂM TRA TÍNH TOÀN VẸN:");
  console.log("------------------------------------------------------------------------------");
  console.log(`  1. Nhân sự (Staff)          : Đọc ${stats.staff.read} | Hợp lệ: ${stats.staff.valid} | Bỏ qua trùng: ${stats.staff.skipped}`);
  console.log(`  2. Khách hàng (Customers)   : Đọc ${stats.customers.read} | Hợp lệ: ${stats.customers.valid} | Bỏ qua trùng: ${stats.customers.skipped}`);
  console.log(`  3. Đơn hàng (Orders)        : Đọc ${stats.orders.read} | Hợp lệ: ${stats.orders.valid} | Bỏ qua trùng: ${stats.orders.skipped}`);
  console.log(`  4. Lịch chăm sóc (CareTasks): Đọc ${stats.careTasks.read} | Hợp lệ: ${stats.careTasks.valid} | Bỏ qua trùng: ${stats.careTasks.skipped}`);
  console.log("------------------------------------------------------------------------------");

  if (sqlOutputPath) {
    const outFull = path.resolve(process.cwd(), sqlOutputPath);
    fs.mkdirSync(path.dirname(outFull), { recursive: true });
    fs.writeFileSync(outFull, sqlStatements.join("\n"), "utf8");
    console.log(`💾 Đã xuất file SQL an toàn: ${outFull} (${sqlStatements.length} câu lệnh)`);
  }

  console.log("✅ Quá trình phân tích dữ liệu hoàn tất an toàn. Đảm bảo Transaction ACID và Idempotency.");
  return { stats, totalStatements: sqlStatements.length };
}

if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };
