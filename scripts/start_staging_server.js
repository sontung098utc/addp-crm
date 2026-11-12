/**
 * ADDP AI CRM — KHỞI CHẠY STAGING SERVER CÔ LẬP TRÊN PORT 3006
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const stagingDir = path.resolve(process.cwd(), ".data_staging");
fs.mkdirSync(stagingDir, { recursive: true });

const jwtSecret = "staging_jwt_secret_64chars_long_unique_key_never_share_prod_2026";
function hashPassword(p) {
  return crypto.createHmac("sha256", jwtSecret).update(String(p).trim()).digest("hex");
}

const initialAdminPass = "AdminStaging@2026!";
const initialSalePass = "SaleStaging@2026!";

const syntheticStaff = [
  {
    id: 1,
    code: "ADMIN",
    username: "ADMIN",
    name: "Quản Trị Viên Staging",
    fullName: "Quản Trị Viên Staging",
    role: "ADMIN",
    teamName: "Ban Giám Đốc",
    isActive: true,
    mustChangePassword: true, // Thử nghiệm bắt buộc đổi mật khẩu
    passwordHash: hashPassword(initialAdminPass),
    allowedTabs: ["*"],
    assignedChannels: ["*"],
    customerScope: "all",
  },
  {
    id: 101,
    code: "STAGING_SALE",
    username: "STAGING_SALE",
    name: "Dược Sĩ Thử Nghiệm",
    fullName: "Dược Sĩ Thử Nghiệm",
    role: "SALE",
    teamName: "Team Thử Nghiệm Staging",
    isActive: true,
    mustChangePassword: false,
    passwordHash: hashPassword(initialSalePass),
    allowedTabs: ["customers", "inbox", "orders"],
    assignedChannels: ["ZALO_PERSONAL", "FACEBOOK"],
    customerScope: "assigned_only",
  },
];

const staffFile = path.join(stagingDir, "staff.json");
fs.writeFileSync(staffFile, JSON.stringify(syntheticStaff, null, 2), "utf8");

// 2. Tạo file customers.json synthetic
const custFile = path.join(stagingDir, "customers.json");
const syntheticCustomers = [
  {
    id: 9001,
    code: "KH_STAGING_01",
    fullName: "[SYNTHETIC] Khách Hàng Thử Nghiệm Staging 01",
    phone: "0911000001",
    staffId: 101,
    assignedStaff: "Dược Sĩ Thử Nghiệm",
    source: "WEBSITE",
    tags: ["Thử Nghiệm", "Đã Mua Glucare Plus"],
    isSyntheticMock: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 9002,
    code: "KH_STAGING_02",
    fullName: "[SYNTHETIC] Khách Hàng Thử Nghiệm Staging 02",
    phone: "0912000002",
    staffId: 101,
    assignedStaff: "Dược Sĩ Thử Nghiệm",
    source: "ZALO_PERSONAL",
    tags: ["Thử Nghiệm", "Zalo"],
    isSyntheticMock: true,
    createdAt: new Date().toISOString(),
  },
];
fs.writeFileSync(custFile, JSON.stringify(syntheticCustomers, null, 2), "utf8");

console.log(`[STAGING] Khởi động Next.js Staging trên port 3006...`);
console.log(`[STAGING] DATA_DIR = ${stagingDir}`);

const env = {
  ...process.env,
  NODE_ENV: "production",
  APP_ENV: "staging",
  PORT: "3006",
  DATA_DIR: stagingDir,
  PILOT_SAFE_MODE: "true",
  QA_DISABLE_AUTO_SYNC: "true",
  CRM_JWT_SECRET: jwtSecret,
  INITIAL_ADMIN_PASSWORD: initialAdminPass,
  KIOTVIET_WEBHOOK_SECRET: "staging_kv_secret_token",
  KIOTVIET_RETAILER: "addp_staging_store",
  NEXT_PUBLIC_APP_URL: "http://localhost:3006",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3006",
};

const nextBin = path.resolve(process.cwd(), "portal", "node_modules", "next", "dist", "bin", "next");
const child = spawn("node", [nextBin, "start", "-p", "3006"], {
  cwd: path.resolve(process.cwd(), "portal"),
  env,
  stdio: "inherit",
});

child.on("error", (err) => {
  console.error("[STAGING_ERROR]", err);
});

child.on("exit", (code) => {
  console.log(`[STAGING_EXIT] Mã thoát: ${code}`);
});
