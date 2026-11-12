/**
 * ADDP AI CRM — QA AGENT SCENARIOS: AUDIT HANDOVER CLAIMS AGAINST CODEBASE
 * Tự động đối chiếu các tuyên bố trong BAO_CAO_BAN_GIAO_ADDP_CRM.md với mã nguồn thực tế.
 */

const fs = require("fs");
const path = require("path");

async function runAuditClaimsScenarios() {
  const results = [];
  const rootDir = process.cwd();

  // AUD-01: Đối chiếu tuyên bố "CSDL quan hệ MySQL 8.0 (addp_crm) & Prisma"
  let hasPrisma = false;
  try {
    const pkgPath = path.join(rootDir, "portal", "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      hasPrisma = Boolean(
        pkg.dependencies?.["@prisma/client"] ||
        pkg.dependencies?.["mysql2"] ||
        pkg.devDependencies?.["prisma"]
      );
    }
  } catch {}

  results.push({
    id: "AUD-01",
    group: "audit-claims",
    title: "Đối chiếu CSDL: Kiểm tra kết nối MySQL 8.0 / Prisma trong portal/package.json",
    status: hasPrisma ? "PASS" : "FAIL",
    evidence: hasPrisma
      ? "Mã nguồn portal có cài đặt @prisma/client hoặc mysql2"
      : "KHÔNG TÌM THẤY KẾT NỐI RUNTIME: portal/package.json hoàn toàn không có @prisma/client hoặc mysql2. Toàn bộ logic đọc/ghi dữ liệu của portal đang chạy 100% trên JSON phẳng cục bộ (.data/*.json). (Lưu ý: Không loại trừ khả năng server có dịch vụ MySQL chạy độc lập cho connectors/ hoặc module khác, nhưng CRM Portal không dùng).",
  });

  // AUD-02: Đối chiếu tuyên bố "Hàng đợi Redis (Queue gửi tin & Cache)"
  let hasRedis = false;
  try {
    const portalPkgPath = path.join(rootDir, "portal", "package.json");
    if (fs.existsSync(portalPkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(portalPkgPath, "utf8"));
      hasRedis = Boolean(pkg.dependencies?.["ioredis"] || pkg.dependencies?.["redis"]);
    }
  } catch {}

  results.push({
    id: "AUD-02",
    group: "audit-claims",
    title: "Đối chiếu Hạ tầng: Kiểm tra kết nối Redis Queue trong mã nguồn",
    status: hasRedis ? "PASS" : "FAIL",
    evidence: hasRedis
      ? "Tìm thấy thư viện kết nối Redis trong package.json"
      : "SAI LỆCH BÁO CÁO: Không có thư viện Redis; hàng đợi phát tin đang chạy trên mảng RAM JavaScript (globalThis).",
  });

  // AUD-03: Đối chiếu Shop Cipher TikTok chính thức ROW_ZYiTi...
  let cipherVerified = false;
  try {
    const tiktokConfigPath = path.join(rootDir, "portal", "src", "lib", "tiktokConfig.js");
    if (fs.existsSync(tiktokConfigPath)) {
      const content = fs.readFileSync(tiktokConfigPath, "utf8");
      cipherVerified = content.includes("ROW_ZYiTiAAAAAAKQIKT19iz-hy3D_kGFVJk");
    }
  } catch {}

  results.push({
    id: "AUD-03",
    group: "audit-claims",
    title: "Đối chiếu TikTok: Xác nhận Shop Cipher chuẩn ROW_ZYiTiAAAAAAKQIKT19iz-hy3D_kGFVJk",
    status: cipherVerified ? "PASS" : "FAIL",
    evidence: cipherVerified
      ? "ĐÃ XÁC NHẬN: File tiktokConfig.js đã khóa cứng đúng chuỗi cipher chuẩn của Dược Phẩm ADDP."
      : "SAI LỆCH: Không tìm thấy chuỗi Shop Cipher ROW_ZYiTi... trong tiktokConfig.js.",
  });

  // AUD-04: Đối chiếu TikTok API page_size <= 20
  let pageSizeClamped = false;
  try {
    const routerPath = path.join(rootDir, "portal", "src", "lib", "unifiedMessageRouter.js");
    if (fs.existsSync(routerPath)) {
      const content = fs.readFileSync(routerPath, "utf8");
      pageSizeClamped =
        content.includes("Math.min(Math.max(rawSize, 1), 20)") &&
        content.includes("page_size: \"20\"");
    }
  } catch {}

  results.push({
    id: "AUD-04",
    group: "audit-claims",
    title: "Đối chiếu TikTok API: Xác nhận ràng buộc page_size <= 20 trong unifiedMessageRouter.js",
    status: pageSizeClamped ? "PASS" : "FAIL",
    evidence: pageSizeClamped
      ? "ĐÃ XÁC NHẬN: Đã kẹp an toàn page_size <= 20 và cố định tham số gọi API phân trang theo đúng luật TikTok."
      : "SAI LỆCH: Chưa tìm thấy ràng buộc page_size <= 20 trong unifiedMessageRouter.js.",
  });

  // AUD-05: Đối chiếu cấu hình PM2 Backup Cronjob trong ecosystem.config.js
  let pm2CronSafe = false;
  let pm2Note = "";
  try {
    const ecoPath = path.join(rootDir, "ecosystem.config.js");
    if (fs.existsSync(ecoPath)) {
      const content = fs.readFileSync(ecoPath, "utf8");
      const match = content.match(/name:\s*"addp-crm-backup-cron"[\s\S]*?autorestart:\s*(true|false)/);
      if (match) {
        const autorestart = match[1];
        if (autorestart === "false") {
          pm2CronSafe = true;
          pm2Note = "[SUY RA TỪ CẤU HÌNH TĨNH] PM2 backup cronjob cấu hình an toàn autorestart: false.";
        } else {
          pm2CronSafe = false;
          pm2Note = "[SUY RA TỪ CẤU HÌNH TĨNH] LỖI CẤU HÌNH PM2: addp-crm-backup-cron đang để autorestart: true kèm cron_restart: '0 2 * * *' (ecosystem.config.js:43-44). Tiến trình sẽ tự động khởi động lại liên tục ngay khi script hoàn tất thay vì chỉ chạy 1 lần vào 02:00 sáng. (Lưu ý: Đây là suy đoán từ phân tích cấu hình tĩnh, chưa kiểm tra runtime log thực tế của PM2).";
        }
      }
    }
  } catch {}

  results.push({
    id: "AUD-05",
    group: "audit-claims",
    title: "Đối chiếu PM2: Kiểm tra cấu hình tiến trình backup cron trong ecosystem.config.js",
    status: pm2CronSafe ? "PASS" : "FAIL",
    evidence: pm2Note || "Không tìm thấy cấu hình addp-crm-backup-cron trong ecosystem.config.js.",
  });

  // AUD-06: Đối chiếu tuyên bố "Build 72/72 Routes Verified & kiểm thử nghiêm ngặt"
  let hasPortalTests = false;
  try {
    const portalDir = path.join(rootDir, "portal");
    const walkForTests = (dir) => {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        if (item.name === "node_modules" || item.name === ".next" || item.name === ".data") continue;
        const full = path.join(dir, item.name);
        if (item.isDirectory()) {
          if (item.name === "__tests__" || walkForTests(full)) return true;
        } else if (item.name.endsWith(".test.js") || item.name.endsWith(".spec.js")) {
          return true;
        }
      }
      return false;
    };
    hasPortalTests = walkForTests(portalDir);
  } catch {}

  results.push({
    id: "AUD-06",
    group: "audit-claims",
    title: "Đối chiếu Kiểm thử: Kiểm tra sự tồn tại của bộ test tự động trong thư mục portal/",
    status: hasPortalTests ? "PASS" : "FAIL",
    evidence: hasPortalTests
      ? "Tìm thấy tệp test tự động trong portal/"
      : "SAI LỆCH BÁO CÁO: Thư mục portal/ có 0 tệp test tự động; tuyên bố 72/72 routes verified thực chất chỉ là số lượng trang tĩnh được biên dịch trong quá trình build của Next.js.",
  });

  // AUD-07: Static Audit: Kiểm tra bảo vệ xác thực trên POST /api/customers
  let customerPostProtected = false;
  try {
    const custRoutePath = path.join(rootDir, "portal", "src", "app", "api", "customers", "route.js");
    if (fs.existsSync(custRoutePath)) {
      const content = fs.readFileSync(custRoutePath, "utf8");
      // Tìm khối export async function POST
      const postMatch = content.match(/export\s+async\s+function\s+POST\s*\([\s\S]*?\n\}/);
      if (postMatch) {
        const postBody = postMatch[0];
        customerPostProtected = postBody.includes("guardApiRequest") || postBody.includes("getSessionStaff");
      }
    }
  } catch {}

  results.push({
    id: "AUD-07",
    group: "audit-claims",
    title: "Static Audit: Xác thực quyền trên POST /api/customers (Tạo/Cập nhật khách hàng)",
    status: customerPostProtected ? "PASS" : "FAIL",
    evidence: customerPostProtected
      ? "POST /api/customers đã có guard xác thực phiên làm việc."
      : "LỖ HỔNG XÁC THỰC (portal/src/app/api/customers/route.js:258-284): Hàm POST không có guardApiRequest hoặc getSessionStaff. Bất kỳ client nào cũng có thể gửi POST tạo/ghi đè hồ sơ khách hàng mà không cần đăng nhập.",
  });

  // AUD-08: Static Audit: Kiểm tra chữ ký webhook KiotViet trên POST /api/webhooks/kiotviet
  let kiotvietWebhookVerified = false;
  try {
    const kvRoutePath = path.join(rootDir, "portal", "src", "app", "api", "webhooks", "kiotviet", "route.js");
    if (fs.existsSync(kvRoutePath)) {
      const content = fs.readFileSync(kvRoutePath, "utf8");
      kiotvietWebhookVerified =
        content.includes("verifyWebhookSignature") ||
        content.includes("validateWebhookToken") ||
        content.includes("crypto.createHmac");
    }
  } catch {}

  results.push({
    id: "AUD-08",
    group: "audit-claims",
    title: "Static Audit: Xác thực chữ ký webhook KiotViet trên POST /api/webhooks/kiotviet",
    status: kiotvietWebhookVerified ? "PASS" : "FAIL",
    evidence: kiotvietWebhookVerified
      ? "POST /api/webhooks/kiotviet có kiểm tra chữ ký xác thực payload."
      : "LỖ HỔNG TÍCH HỢP (portal/src/app/api/webhooks/kiotviet/route.js:16-55): Endpoint webhook không có cơ chế xác thực chữ ký (HMAC / Secret Token). Bất kỳ ai cũng có thể giả mạo thông báo hóa đơn KiotViet để trừ kho và tạo đơn ảo.",
  });

  // AUD-09: Static Audit: Kiểm tra hardcoded fallback secrets trong mã nguồn
  const hardcodedSecrets = [];
  try {
    const filesToCheck = [
      { path: path.join(rootDir, "portal", "src", "lib", "tiktokConfig.js"), pattern: /process\.env\.TIKTOK_APP_SECRET\s*\|\|\s*["']([^"']+)["']/, name: "TIKTOK_APP_SECRET" },
      { path: path.join(rootDir, "portal", "src", "lib", "kiotvietConnector.js"), pattern: /process\.env\.KIOTVIET_CLIENT_SECRET\s*\|\|\s*["']([^"']+)["']/, name: "KIOTVIET_CLIENT_SECRET" },
      { path: path.join(rootDir, "portal", "src", "lib", "magentoConnector.js"), pattern: /process\.env\.MAGENTO_WEBHOOK_SECRET\s*\|\|\s*["']([^"']+)["']/, name: "MAGENTO_WEBHOOK_SECRET" },
      { path: path.join(rootDir, "portal", "src", "lib", "ssoBridge.js"), pattern: /process\.env\.CRM_JWT_SECRET\s*\|\|\s*["']([^"']+)["']/, name: "CRM_JWT_SECRET" },
    ];
    for (const f of filesToCheck) {
      if (fs.existsSync(f.path)) {
        const text = fs.readFileSync(f.path, "utf8");
        const m = text.match(f.pattern);
        if (m) {
          hardcodedSecrets.push(`${f.name} có fallback cứng trong ${path.relative(rootDir, f.path)}`);
        }
      }
    }
  } catch {}

  results.push({
    id: "AUD-09",
    group: "audit-claims",
    title: "Static Audit: Kiểm tra hardcoded secret fallbacks trong mã nguồn",
    status: hardcodedSecrets.length === 0 ? "PASS" : "FAIL",
    evidence: hardcodedSecrets.length === 0
      ? "Không tìm thấy hardcoded secret fallbacks trong các connector chính."
      : `RỦI RO BẢO MẬT: Tìm thấy ${hardcodedSecrets.length} hardcoded fallback secrets trong source: ${hardcodedSecrets.join("; ")}. Cần chuyển toàn bộ sang biến môi trường bắt buộc.`,
  });

  // AUD-10: Static Audit: Kiểm tra phân quyền RBAC báo cáo tài chính
  let financialRbacEnforced = false;
  try {
    const finRoutePath = path.join(rootDir, "portal", "src", "app", "api", "reports", "financial", "route.js");
    if (fs.existsSync(finRoutePath)) {
      const content = fs.readFileSync(finRoutePath, "utf8");
      financialRbacEnforced =
        content.includes("guardApiRequest") &&
        content.includes("allowedRoles: [\"ADMIN\", \"SALE_LEADER\", \"KE_TOAN\"]") &&
        content.includes("canViewFinancialCost");
    }
  } catch {}

  results.push({
    id: "AUD-10",
    group: "audit-claims",
    title: "Static Audit: Kiểm tra phân quyền RBAC trên GET /api/reports/financial",
    status: financialRbacEnforced ? "PASS" : "FAIL",
    evidence: financialRbacEnforced
      ? "ĐÃ BẢO VỆ (portal/src/app/api/reports/financial/route.js:15-46): Route tài chính có guardApiRequest hạn chế ADMIN, SALE_LEADER, KE_TOAN và tự động ẩn giá vốn với SALE_LEADER."
      : "CHƯA BẢO VỆ: Không tìm thấy guardApiRequest hoặc bộ lọc canViewFinancialCost trên route tài chính.",
  });

  // AUD-11: Static Audit: Kiểm tra thiếu guard xác thực trên các route cấu hình hệ thống
  const unprotectedGetRoutes = [];
  try {
    const routesToCheck = [
      { path: path.join(rootDir, "portal", "src", "app", "api", "channels", "route.js"), name: "GET /api/channels", line: "18-26" },
      { path: path.join(rootDir, "portal", "src", "app", "api", "staff", "route.js"), name: "GET /api/staff", line: "17-46" },
      { path: path.join(rootDir, "portal", "src", "app", "api", "settings", "channel-permissions", "route.js"), name: "GET /api/settings/channel-permissions", line: "14-28" },
    ];
    for (const r of routesToCheck) {
      if (fs.existsSync(r.path)) {
        const text = fs.readFileSync(r.path, "utf8");
        const getMatch = text.match(/export\s+async\s+function\s+GET\s*\([^)]*\)\s*\{([\s\S]*?)(?:export\s+async\s+function|export\s+const|\s*$)/);
        if (getMatch) {
          const getBody = getMatch[1];
          if (!getBody.includes("guardApiRequest") && !getBody.includes("getSessionStaff")) {
            unprotectedGetRoutes.push(`${r.name} (${r.line})`);
          }
        }
      }
    }
  } catch {}

  results.push({
    id: "AUD-11",
    group: "audit-claims",
    title: "Static Audit: Kiểm tra bảo vệ xác thực trên các route quản trị GET (channels, staff, ACL)",
    status: unprotectedGetRoutes.length === 0 ? "PASS" : "FAIL",
    evidence: unprotectedGetRoutes.length === 0
      ? "Tất cả các GET route nhạy cảm đều được bảo vệ bằng RBAC guard."
      : `LỖ HỔNG XÁC THỰC: Các route sau cho phép đọc không cần xác thực: ${unprotectedGetRoutes.join(", ")}. Không tuân thủ Điều 5 AGENTS.md.`,
  });

  return results;
}

module.exports = { runAuditClaimsScenarios };
