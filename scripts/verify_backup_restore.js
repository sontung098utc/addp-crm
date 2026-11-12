/**
 * ADDP AI CRM — THỬ NGHIỆM SAO LƯU VÀ KHÔI PHỤC DỮ LIỆU THỰC TẾ (ITEM 8)
 * 1. Khởi tạo dữ liệu mẫu tổng hợp (synthetic data) có số bản ghi xác định.
 * 2. Tính mã băm SHA-256 từng file trước khi sao lưu.
 * 3. Chạy sao lưu, đo lường thời gian thực thi (ms).
 * 4. Giả lập thảm họa mất dữ liệu (xóa sạch thư mục dữ liệu).
 * 5. Chạy quy trình khôi phục từ bản sao lưu.
 * 6. Đối chiếu số bản ghi và mã băm SHA-256 trước và sau khôi phục.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function computeFileSha256(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

function assertSyntheticDirectorySafety(dirPath, paramName = "DIR") {
  const resolved = path.resolve(dirPath);
  const normalized = resolved.toLowerCase().replace(/\\/g, "/");

  // Kiểm tra cấm: Tuyệt đối không được là thư mục .data, portal/.data, C:\QuanlyKH hoặc thư mục người dùng thực
  if (
    normalized.endsWith("/.data") ||
    normalized.includes("/.data/") ||
    normalized.includes("quanlykh") ||
    normalized.includes("ah-trabi") ||
    normalized.includes("adstiktok") ||
    normalized.includes("users") && !normalized.includes("scratch")
  ) {
    throw new Error(
      `[SAFETY_ABORT] TỪ CHỐI THỰC THI: Tham số ${paramName} ("${resolved}") trỏ tới thư mục dữ liệu thật. Tuyệt đối cấm thao tác hoặc xóa dữ liệu sản xuất!`
    );
  }

  // Bắt buộc thư mục phải thuộc vùng tạm 'scratch' hoặc chứa tiền tố 'synthetic'
  if (!normalized.includes("/scratch/") && !normalized.includes("synthetic")) {
    throw new Error(
      `[SAFETY_ABORT] TỪ CHỐI THỰC THI: Tham số ${paramName} ("${resolved}") không phải là thư mục thử nghiệm tổng hợp (synthetic scratch). Script chỉ được phép chạy trên synthetic data.`
    );
  }

  return resolved;
}

function runBackupRestoreVerification(customSourceDir, customBackupDir) {
  console.log("==============================================================================");
  console.log("📦 ADDP AI CRM — THỬ NGHIỆM SAO LƯU & KHÔI PHỤC DỮ LIỆU THỰC TẾ (ITEM 8)");
  console.log("==============================================================================");

  const rawSourceDir = customSourceDir || path.resolve(process.cwd(), "scratch", "backup_restore_test_data");
  const rawBackupDir = customBackupDir || path.resolve(process.cwd(), "scratch", "backup_restore_archive");

  // RÀNG BUỘC AN TOÀN TUYỆT ĐỐI (SAFETY GUARDS):
  const testDataDir = assertSyntheticDirectorySafety(rawSourceDir, "SOURCE_DATA_DIR");
  const testBackupDir = assertSyntheticDirectorySafety(rawBackupDir, "BACKUP_ARCHIVE_DIR");

  console.log(`📍 ĐƯỜNG DẪN DỮ LIỆU NGUỒN TUYỆT ĐỐI : ${testDataDir}`);
  console.log(`📍 ĐƯỜNG DẪN SAO LƯU / ĐÍCH TUYỆT ĐỐI : ${testBackupDir}`);
  console.log(`🔒 CHẾ ĐỘ AN TOÀN                    : ĐÃ XÁC MINH SYNTHETIC ONLY (KHÔNG CHẠM .data SẢN XUẤT)`);
  console.log("------------------------------------------------------------------------------");

  // Dọn dẹp thư mục thử nghiệm synthetic cũ nếu có
  fs.rmSync(testDataDir, { recursive: true, force: true });
  fs.rmSync(testBackupDir, { recursive: true, force: true });
  fs.mkdirSync(testDataDir, { recursive: true });
  fs.mkdirSync(testBackupDir, { recursive: true });

  // 1. Tạo tập dữ liệu thử nghiệm tổng hợp (Synthetic Test Dataset)
  const initialData = {
    "staff.json": [
      { id: 1, code: "ADMIN", name: "Quản trị viên", role: "ADMIN", isActive: true },
      { id: 101, code: "SALE_A", name: "Sale Nguyễn Văn A", role: "SALE", isActive: true },
    ],
    "customers.json": [
      { id: 1001, code: "KH001", fullName: "Nguyễn Văn Hùng", phone: "0912345678", staffId: 101 },
      { id: 1002, code: "KH002", fullName: "Trần Thị Mai", phone: "0987654321", staffId: 101 },
      { id: 1003, code: "KH003", fullName: "Lê Hoàng Nam", phone: "0901234567", staffId: 1 },
      { id: 1004, code: "KH004", fullName: "Phạm Thu Hương", phone: "0934567890", staffId: 101 },
      { id: 1005, code: "KH005", fullName: "Vũ Đức Đam", phone: "0978901234", staffId: 1 },
    ],
    "orders.json": [
      { orderCode: "DH_TEST_01", customerPhone: "0912345678", totalAmount: 1200000, staffId: 101 },
      { orderCode: "DH_TEST_02", customerPhone: "0987654321", totalAmount: 600000, staffId: 101 },
      { orderCode: "DH_TEST_03", customerPhone: "0901234567", totalAmount: 2400000, staffId: 1 },
    ],
    "care_tasks.json": [
      { id: "TASK_01", orderCode: "DH_TEST_01", taskType: "DAY_1", title: "Gọi hướng dẫn uống sữa" },
      { id: "TASK_02", orderCode: "DH_TEST_01", taskType: "DAY_3", title: "Hỏi thăm cảm nhận hương vị" },
      { id: "TASK_03", orderCode: "DH_TEST_01", taskType: "DAY_7", title: "Kiểm tra chỉ số đường huyết" },
      { id: "TASK_04", orderCode: "DH_TEST_01", taskType: "DAY_14", title: "Nhắc duy trì chế độ dinh dưỡng" },
      { id: "TASK_05", orderCode: "DH_TEST_01", taskType: "DAY_21", title: "Đánh giá mức độ ổn định" },
      { id: "TASK_06", orderCode: "DH_TEST_01", taskType: "HALF_USED", title: "Hỏi lượng sữa còn lại" },
      { id: "TASK_07", orderCode: "DH_TEST_01", taskType: "TWO_THIRDS", title: "Nhắc tái mua trước khi hết" },
    ],
  };

  const beforeStats = {};
  const beforeSha256 = {};

  for (const [filename, records] of Object.entries(initialData)) {
    const filePath = path.join(testDataDir, filename);
    fs.writeFileSync(filePath, JSON.stringify(records, null, 2), "utf8");
    beforeStats[filename] = records.length;
    beforeSha256[filename] = computeFileSha256(filePath);
  }

  console.log("\n📊 [BƯỚC 1] DỮ LIỆU BAN ĐẦU TRƯỚC KHI SAO LƯU:");
  console.log("------------------------------------------------------------------------------");
  for (const [file, count] of Object.entries(beforeStats)) {
    console.log(`  - ${file.padEnd(18)} : ${count} bản ghi | SHA-256: ${beforeSha256[file]}`);
  }

  // 2. Thực hiện Sao lưu (Backup)
  const backupStart = performance.now();
  const backupDate = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupFile = path.join(testBackupDir, `backup_test_${backupDate}.json`);

  const backupPayload = {
    backupTimestamp: new Date().toISOString(),
    system: "ADDP Omnichannel AI CRM Test",
    files: {},
  };

  for (const filename of Object.keys(initialData)) {
    const content = fs.readFileSync(path.join(testDataDir, filename), "utf8");
    backupPayload.files[filename] = JSON.parse(content);
  }

  fs.writeFileSync(backupFile, JSON.stringify(backupPayload, null, 2), "utf8");
  const backupEnd = performance.now();
  const backupDurationMs = (backupEnd - backupStart).toFixed(2);
  const backupSha256 = computeFileSha256(backupFile);

  console.log("\n💾 [BƯỚC 2] KẾT QUẢ SAO LƯU (BACKUP):");
  console.log("------------------------------------------------------------------------------");
  console.log(`  - Tệp sao lưu       : ${backupFile}`);
  console.log(`  - Dung lượng        : ${fs.statSync(backupFile).size} bytes`);
  console.log(`  - Thời gian sao lưu : ${backupDurationMs} ms`);
  console.log(`  - SHA-256 Archive   : ${backupSha256}`);

  // 3. Giả lập Thảm họa (Xóa sạch toàn bộ dữ liệu trong testDataDir)
  console.log("\n⚠️ [BƯỚC 3] GIẢ LẬP SỰ CỐ: XÓA HOÀN TOÀN DỮ LIỆU TRONG THƯ MỤC NGUỒN...");
  for (const filename of Object.keys(initialData)) {
    fs.unlinkSync(path.join(testDataDir, filename));
  }
  const filesLeft = fs.readdirSync(testDataDir);
  console.log(`  -> Số tệp còn lại trong thư mục dữ liệu: ${filesLeft.length} (Đã xóa 100%)`);

  // 4. Thực hiện Khôi phục (Restore)
  const restoreStart = performance.now();
  const backupRaw = fs.readFileSync(backupFile, "utf8");
  const restoredPayload = JSON.parse(backupRaw);

  const afterStats = {};
  const afterSha256 = {};
  let isAllMatch = true;

  for (const [filename, content] of Object.entries(restoredPayload.files)) {
    const restorePath = path.join(testDataDir, filename);
    fs.writeFileSync(restorePath, JSON.stringify(content, null, 2), "utf8");
    afterStats[filename] = content.length;
    afterSha256[filename] = computeFileSha256(restorePath);

    if (afterSha256[filename] !== beforeSha256[filename] || afterStats[filename] !== beforeStats[filename]) {
      isAllMatch = false;
    }
  }

  const restoreEnd = performance.now();
  const restoreDurationMs = (restoreEnd - restoreStart).toFixed(2);

  console.log("\n♻️ [BƯỚC 4] KẾT QUẢ KHÔI PHỤC (RESTORE) & ĐỐI SOÁT:");
  console.log("------------------------------------------------------------------------------");
  console.log(`  - Thời gian khôi phục : ${restoreDurationMs} ms`);
  console.log("------------------------------------------------------------------------------");
  for (const [file, count] of Object.entries(afterStats)) {
    const matchStatus = afterSha256[file] === beforeSha256[file] ? "✅ KHỚP 100%" : "❌ SAI LỆCH";
    console.log(
      `  - ${file.padEnd(18)} : Trước: ${beforeStats[file]} bản ghi | Sau: ${count} bản ghi | ${matchStatus}`
    );
    console.log(`    SHA-256 Khôi phục: ${afterSha256[file]}`);
  }

  console.log("------------------------------------------------------------------------------");
  if (isAllMatch) {
    console.log("🎉 KẾT QUẢ: TOÀN BỘ 4/4 TỆP DỮ LIỆU KHÔI PHỤC CHÍNH XÁC TỪNG BYTE (SHA-256 100% MATCH)!");
  } else {
    console.error("❌ KẾT QUẢ: PHÁT HIỆN SAI LỆCH DỮ LIỆU SAU KHÔI PHỤC!");
    process.exit(1);
  }

  // Dọn dẹp scratch
  fs.rmSync(testDataDir, { recursive: true, force: true });
  fs.rmSync(testBackupDir, { recursive: true, force: true });

  return {
    success: isAllMatch,
    backupDurationMs,
    restoreDurationMs,
    beforeStats,
    afterStats,
    beforeSha256,
    afterSha256,
  };
}

if (require.main === module) {
  runBackupRestoreVerification();
}

module.exports = { runBackupRestoreVerification };
