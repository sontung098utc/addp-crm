/**
 * ADDP AI CRM — QA AGENT REPORT GENERATOR (MARKDOWN & JSON)
 */

const fs = require("fs");
const path = require("path");
const { sanitizePayload, maskRawText } = require("./masker");

/**
 * Lấy mã commit git hiện tại (nếu có git CLI)
 */
function getGitCommitSha() {
  try {
    const { execSync } = require("child_process");
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

/**
 * Tổng hợp số liệu thống kê các bài kiểm tra
 */
function computeSummary(results = []) {
  const counts = {
    TOTAL: results.length,
    PASS: 0,
    FAIL: 0,
    BLOCKED: 0,
    NOT_RUN: 0,
    INCONCLUSIVE: 0,
  };

  for (const r of results) {
    const status = String(r.status || "INCONCLUSIVE").toUpperCase();
    if (counts[status] !== undefined) {
      counts[status]++;
    } else {
      counts.INCONCLUSIVE++;
    }
  }

  const passRate = counts.TOTAL > 0
    ? ((counts.PASS / (counts.TOTAL - counts.NOT_RUN || 1)) * 100).toFixed(1)
    : "0.0";

  return {
    ...counts,
    passRate: `${passRate}%`,
  };
}

/**
 * Định dạng báo cáo dưới dạng Markdown chuẩn
 */
function generateMarkdownReport(payload) {
  const { config, summary, results, startedAt, durationMs, commitSha } = payload;
  const cleanBaseUrl = maskRawText(config.baseUrl);

  let md = `# Báo Cáo Đánh Giá & Xác Thực QA Agent — ADDP AI CRM\n\n`;
  md += `**Thời điểm kiểm tra:** ${startedAt}  \n`;
  md += `**Môi trường mục tiêu:** \`${config.target.toUpperCase()}\` (\`${cleanBaseUrl}\`)  \n`;
  md += `**Nhóm kiểm thử:** \`${config.group}\`  \n`;
  md += `**Phiên bản Git Commit:** \`${commitSha}\`  \n`;
  md += `**Tổng thời gian thực thi:** \`${durationMs} ms\`  \n`;
  md += `**Chế độ vận hành:** \`READ-ONLY (An toàn tuyệt đối - Không biến đổi dữ liệu)\`  \n\n`;

  md += `## 1. Tóm Tắt Kết Quả (Executive Summary)\n\n`;
  md += `| Trạng Thái | Số Lượng | Tỷ Lệ | Diễn Giải |\n`;
  md += `| :--- | :---: | :---: | :--- |\n`;
  md += `| **PASS** | ${summary.PASS} | ${(summary.PASS / (summary.TOTAL || 1) * 100).toFixed(1)}% | Đạt yêu cầu, có bằng chứng xác thực trực tiếp |\n`;
  md += `| **FAIL** | ${summary.FAIL} | ${(summary.FAIL / (summary.TOTAL || 1) * 100).toFixed(1)}% | Phát hiện lỗi hoặc không đạt tiêu chí kỳ vọng |\n`;
  md += `| **BLOCKED** | ${summary.BLOCKED} | ${(summary.BLOCKED / (summary.TOTAL || 1) * 100).toFixed(1)}% | Bị chặn do an toàn, thiếu quyền hoặc là endpoint ghi |\n`;
  md += `| **INCONCLUSIVE** | ${summary.INCONCLUSIVE} | ${(summary.INCONCLUSIVE / (summary.TOTAL || 1) * 100).toFixed(1)}% | Chưa đủ bằng chứng hoặc quá thời gian phản hồi |\n`;
  md += `| **NOT RUN** | ${summary.NOT_RUN} | ${(summary.NOT_RUN / (summary.TOTAL || 1) * 100).toFixed(1)}% | Bỏ qua theo bộ lọc nhóm kịch bản |\n`;
  md += `| **TỔNG CỘNG** | **${summary.TOTAL}** | **100%** | **Tỷ lệ Pass (trừ Not Run): ${summary.passRate}** |\n\n`;

  md += `## 2. Bảng Chi Tiết Từng Kịch Bản Kiểm Tra\n\n`;
  md += `| Mã Test | Nhóm | Tên Kịch Bản | Trạng Thái | HTTP | Thời Gian | Bằng Chứng Xác Thực / Ghi Chú |\n`;
  md += `| :--- | :--- | :--- | :---: | :---: | :---: | :--- |\n`;

  for (const r of results) {
    const statusEmoji =
      r.status === "PASS"
        ? "✅ PASS"
        : r.status === "FAIL"
        ? "❌ FAIL"
        : r.status === "BLOCKED"
        ? "🛡️ BLOCKED"
        : r.status === "NOT_RUN"
        ? "⚪ NOT_RUN"
        : "⚠️ INCONCL";

    const httpCode = r.httpStatus !== undefined && r.httpStatus !== null ? r.httpStatus : "-";
    const duration = r.durationMs !== undefined ? `${r.durationMs}ms` : "-";
    const cleanEvidence = maskRawText(String(r.evidence || r.message || "").replace(/\|/g, "\\|"));

    md += `| \`${r.id}\` | \`${r.group}\` | ${r.title} | **${statusEmoji}** | \`${httpCode}\` | \`${duration}\` | ${cleanEvidence} |\n`;
  }

  md += `\n## 3. Khuyến Nghị & Hành Động Tiếp Theo\n\n`;
  if (summary.FAIL > 0) {
    md += `- ⚠️ **Phát hiện ${summary.FAIL} bài kiểm tra không đạt (FAIL):** Đội ngũ kỹ thuật cần đối chiếu mã lỗi trong bảng chi tiết ở trên để khắc phục.\n`;
  }
  if (summary.BLOCKED > 0) {
    md += `- 🛡️ **Có ${summary.BLOCKED} kịch bản bị chặn (BLOCKED):** Đây là các endpoint đột biến dữ liệu hoặc cần quyền bổ sung để kiểm tra.\n`;
  }
  if (summary.FAIL === 0 && summary.BLOCKED === 0) {
    md += `- 🎉 **Tất cả các bài kiểm tra được kích hoạt đều vượt qua an toàn (100% PASS).**\n`;
  }

  md += `\n---\n*Báo cáo được khởi tạo tự động bởi ADDP CRM QA Agent (Strict Read-Only Mode).*  \n`;

  return md;
}

/**
 * Lưu báo cáo ra tệp Markdown và JSON
 */
function saveReport(reportData, customDir = null) {
  const targetDir = customDir || reportData.config.reportDir || "./reports/qa";
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const baseName = `qa-report-${reportData.config.target}-${timestamp}`;

  const mdPath = path.join(targetDir, `${baseName}.md`);
  const jsonPath = path.join(targetDir, `${baseName}.json`);

  const mdContent = generateMarkdownReport(reportData);
  const cleanJsonData = sanitizePayload(reportData);

  fs.writeFileSync(mdPath, mdContent, "utf8");
  fs.writeFileSync(jsonPath, JSON.stringify(cleanJsonData, null, 2), "utf8");

  return {
    markdownFile: mdPath,
    jsonFile: jsonPath,
  };
}

module.exports = {
  getGitCommitSha,
  computeSummary,
  generateMarkdownReport,
  saveReport,
};
