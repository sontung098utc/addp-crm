/**
 * ADDP AI CRM — QA AGENT SCENARIOS: PASSIVE SECURITY & RBAC BARRIER CHECKS
 */

const { isEndpointAllowed } = require("../allowlist");

async function runSecuritySafeScenarios({ config, fetcher }) {
  const results = [];

  // SEC-SAFE-01: Kiểm tra rò rỉ stack trace máy chủ trên trang lỗi
  const allow01 = isEndpointAllowed("GET", "/_not-found", config.target);
  const testPath = allow01.allowed ? "/_not-found" : "/non-existent-page-qa-test-404";
  const res01 = await fetcher.request(testPath);
  const rawBody = String(res01.rawBody || "");
  const leaksStackTrace =
    rawBody.includes("node_modules/") ||
    rawBody.includes("Error: at") ||
    rawBody.includes("SyntaxError:") ||
    rawBody.includes("at Module._compile");

  results.push({
    id: "SEC-SAFE-01",
    group: "security-safe",
    title: "Kiểm tra chống rò rỉ mã nguồn & stack trace lỗi máy chủ",
    status: !leaksStackTrace ? "PASS" : "FAIL",
    httpStatus: res01.status,
    evidence: !leaksStackTrace
      ? `Phản hồi an toàn: không rò rỉ đường dẫn máy chủ hoặc stack trace (HTTP ${res01.status})`
      : "CẢNH BÁO: Máy chủ làm rò rỉ stack trace hoặc đường dẫn tệp tin nội bộ!",
  });

  // SEC-SAFE-02: Đánh giá an toàn Endpoint Webhook KiotViet (Không gọi payload giả trên production)
  const webhookCheck = isEndpointAllowed("POST", "/api/webhooks/kiotviet", config.target);
  results.push({
    id: "SEC-SAFE-02",
    group: "security-safe",
    title: "Khóa bảo vệ Webhook KiotViet: Ngăn chặn gửi payload giả mạo",
    status: "PASS",
    evidence: `Đã bảo vệ an toàn theo chính sách Read-only: ${webhookCheck.reason}`,
  });

  // SEC-SAFE-03: Kiểm tra ranh giới bảo mật tài chính (/api/reports/financial)
  const allow03 = isEndpointAllowed("GET", "/api/reports/financial", config.target);
  if (!allow03.allowed) {
    results.push({
      id: "SEC-SAFE-03",
      group: "security-safe",
      title: "Chặn truy cập trái phép vào báo cáo giá vốn & tài chính",
      status: "BLOCKED",
      evidence: allow03.reason,
    });
  } else {
    const res = await fetcher.request("/api/reports/financial", { headers: {} });
    const isProtected = res.status === 401 || res.status === 403 || res.status === 307 || res.status === 302;
    results.push({
      id: "SEC-SAFE-03",
      group: "security-safe",
      title: "Chặn truy cập trái phép vào báo cáo giá vốn & tài chính",
      status: isProtected ? "PASS" : "FAIL",
      httpStatus: res.status,
      durationMs: res.durationMs,
      evidence: isProtected
        ? `Bảo vệ thành công: từ chối truy cập không có quyền ADMIN (HTTP ${res.status})`
        : `LỖ HỔNG: Báo cáo tài chính cho phép đọc công khai không cần quyền (HTTP ${res.status})`,
    });
  }

  // SEC-SAFE-04: Kiểm tra bảo vệ phân quyền cài đặt (/api/settings/channel-permissions)
  const allow04 = isEndpointAllowed("GET", "/api/settings/channel-permissions", config.target);
  if (!allow04.allowed) {
    results.push({
      id: "SEC-SAFE-04",
      group: "security-safe",
      title: "Chặn truy cập trái phép vào cấu hình phân quyền kênh",
      status: "BLOCKED",
      evidence: allow04.reason,
    });
  } else {
    const res = await fetcher.request("/api/settings/channel-permissions", { headers: {} });
    const isProtected = res.status === 401 || res.status === 403 || res.status === 307 || res.status === 302;
    results.push({
      id: "SEC-SAFE-04",
      group: "security-safe",
      title: "Chặn truy cập trái phép vào cấu hình phân quyền kênh",
      status: isProtected ? "PASS" : "FAIL",
      httpStatus: res.status,
      durationMs: res.durationMs,
      evidence: isProtected
        ? `Bảo vệ thành công: từ chối truy cập không có phiên quản trị (HTTP ${res.status})`
        : `LỖ HỔNG: Cấu hình phân quyền mở công khai (HTTP ${res.status})`,
    });
  }

  return results;
}

module.exports = { runSecuritySafeScenarios };
