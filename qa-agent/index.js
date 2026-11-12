#!/usr/bin/env node
/**
 * ADDP AI CRM — QA AGENT CLI ENTRYPOINT
 * Sử dụng:
 *   node qa-agent --help
 *   node qa-agent --target=local --group=all-readonly
 *   node qa-agent --target=local --group=health
 *   node qa-agent --target=local --group=audit-claims
 *   node qa-agent --target=production --confirm-production=true --group=all-readonly
 */

const { runQaAgent } = require("./runner");

function printHelp() {
  console.log(`
==============================================================================
ADDP AI CRM — QA AGENT (BỘ KIỂM TOÁN CHỨC NĂNG & AN TOÀN ĐỘC LẬP)
==============================================================================
Cú pháp lệnh:
  node qa-agent [tùy chọn]

Tùy chọn:
  --target=<local|staging|production>   Môi trường mục tiêu (Mặc định: local)
  --base-url=<url>                      Địa chỉ URL máy chủ (Mặc định: http://localhost:3000)
  --group=<nhóm>                        Nhóm bài kiểm tra:
                                          - health                (Kiểm tra sống & độ trễ)
                                          - auth                  (Kiểm tra xác thực & RBAC)
                                          - ui-readonly           (Kiểm tra giao diện chỉ đọc)
                                          - integrations-readonly (Kiểm tra cấu hình sàn & guard)
                                          - security-safe         (Kiểm tra rò rỉ stack trace & RBAC)
                                          - audit-claims          (Đối chiếu báo cáo bàn giao với code)
                                          - all-readonly          (Chạy tất cả các nhóm trên - Mặc định)
  --confirm-production=<true|false>     Cờ xác nhận an toàn bắt buộc khi target=production
  --help, -h                            Hiển thị hướng dẫn này

Biến môi trường hỗ trợ (trong tệp .env.qa):
  QA_TARGET, QA_BASE_URL, QA_CONFIRM_PRODUCTION, QA_GROUP, QA_REQUEST_TIMEOUT_MS

Ví dụ chạy an toàn:
  node qa-agent --target=local --group=audit-claims
  node qa-agent --target=local --group=all-readonly
==============================================================================
  `);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  try {
    const outcome = await runQaAgent();
    // Thoát với mã 0 nếu hoàn thành việc xuất báo cáo (kể cả khi có bài FAIL để ghi nhận kết quả)
    process.exit(0);
  } catch (err) {
    console.error(`\n❌ [QA_AGENT_ERROR] Lỗi thực thi QA Agent: ${err.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
