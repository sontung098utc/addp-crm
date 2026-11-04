/**
 * ADDP Omnichannel AI CRM — Script Sao Lưu Database Tự Động Hàng Ngày (WBS-50)
 * Chạy định kỳ vào 02:00 sáng mỗi ngày qua cron hoặc Windows Task Scheduler.
 * Tuân thủ Điều 5 (Bảo mật) & Điều 10 AGENTS.md
 */

const fs = require("fs");
const path = require("path");

function runDatabaseBackup() {
  console.log("=== BẮT ĐẦU QUY TRÌNH SAO LƯU DỮ LIỆU TỰ ĐỘNG ADDP CRM (WBS-50) ===");
  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);

  const backupDir = path.join(process.cwd(), ".data", "backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const backupTargetFile = path.join(backupDir, `addp_crm_backup_${dateStr}.json`);

  // Thu thập toàn bộ dữ liệu đang hoạt động
  const dataDir = path.join(process.cwd(), ".data");
  const backupPayload = {
    backupTimestamp: now.toISOString(),
    system: "ADDP Omnichannel AI CRM & ERP",
    domain: "https://crm.addp.vn",
    version: "1.0.0-PROD",
    files: {},
  };

  if (fs.existsSync(dataDir)) {
    const files = fs.readdirSync(dataDir).filter((f) => f.endsWith(".json") && f !== "migration_log.json");
    for (const f of files) {
      try {
        const content = fs.readFileSync(path.join(dataDir, f), "utf8");
        backupPayload.files[f] = JSON.parse(content);
      } catch (e) {
        // bỏ qua
      }
    }
  }

  fs.writeFileSync(backupTargetFile, JSON.stringify(backupPayload, null, 2), "utf8");
  console.log(`[BACKUP_SUCCESS] Đã tạo bản sao lưu thành công tại: ${backupTargetFile}`);

  // Tự động dọn dẹp các bản sao lưu cũ hơn 30 ngày
  try {
    const allBackups = fs.readdirSync(backupDir).filter((f) => f.startsWith("addp_crm_backup_"));
    if (allBackups.length > 30) {
      allBackups.sort();
      const toDelete = allBackups.slice(0, allBackups.length - 30);
      for (const oldFile of toDelete) {
        fs.unlinkSync(path.join(backupDir, oldFile));
        console.log(`[PRUNED_OLD_BACKUP] Đã xóa bản sao lưu cũ: ${oldFile}`);
      }
    }
  } catch (e) {
    console.error("Lỗi dọn dẹp sao lưu cũ:", e);
  }

  console.log("=== QUY TRÌNH SAO LƯU HOÀN TẤT AN TOÀN ===");
  return {
    success: true,
    backupFile: backupTargetFile,
    timestamp: now.toISOString(),
  };
}

if (require.main === module) {
  runDatabaseBackup();
}

module.exports = { runDatabaseBackup };
