/**
 * ADDP AI CRM — QA AGENT SCENARIOS: UI ROUTES READ-ONLY INSPECTION
 */

const { isEndpointAllowed } = require("../allowlist");

const UI_PAGES = [
  { id: "UI-01", path: "/channels", name: "Quản lý kết nối kênh (/channels)" },
  { id: "UI-02", path: "/inbox", name: "Hộp thư đa kênh hợp nhất (/inbox)" },
  { id: "UI-03", path: "/orders", name: "Quản lý đơn hàng đa sàn (/orders)" },
  { id: "UI-04", path: "/customers", name: "Hồ sơ khách hàng 360 (/customers)" },
  { id: "UI-05", path: "/inventory", name: "Quản trị kho & SKU combo (/inventory)" },
  { id: "UI-06", path: "/settings", name: "Cài đặt & Phân quyền RBAC (/settings)" },
];

async function runUiReadonlyScenarios({ config, fetcher }) {
  const results = [];

  for (const page of UI_PAGES) {
    const allow = isEndpointAllowed("GET", page.path, config.target);
    if (!allow.allowed) {
      results.push({
        id: page.id,
        group: "ui-readonly",
        title: `Kiểm tra giao diện: ${page.name}`,
        status: "BLOCKED",
        evidence: allow.reason,
      });
      continue;
    }

    const res = await fetcher.request(page.path);
    // Giao diện hợp lệ khi trả về 200 OK (đã login) hoặc 302/307 (chưa login -> redirect về /login)
    const isHealthy = res.status === 200 || res.status === 302 || res.status === 307;
    const isServerError = res.status >= 500;

    let status = "PASS";
    let evidence = `Giao diện phản hồi mã HTTP ${res.status} (${res.durationMs}ms)`;

    if (isServerError) {
      status = "FAIL";
      evidence = `LỖI MÁY CHỦ HTTP ${res.status}: Trang gặp lỗi biên dịch hoặc unhandled exception.`;
    } else if (!isHealthy) {
      status = "INCONCLUSIVE";
      evidence = `Phản hồi mã HTTP không mong đợi: ${res.status}`;
    }

    results.push({
      id: page.id,
      group: "ui-readonly",
      title: `Kiểm tra giao diện: ${page.name}`,
      status,
      httpStatus: res.status,
      durationMs: res.durationMs,
      evidence,
    });
  }

  return results;
}

module.exports = { runUiReadonlyScenarios };
