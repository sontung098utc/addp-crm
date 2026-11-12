/**
 * ADDP AI CRM — QA AGENT SCENARIOS: HEALTH & SERVICE READINESS
 */

const { isEndpointAllowed } = require("../allowlist");

async function runHealthScenarios({ config, fetcher }) {
  const results = [];

  // HLT-01: Kiểm tra endpoint /api/health
  const allow01 = isEndpointAllowed("GET", "/api/health", config.target);
  if (!allow01.allowed) {
    results.push({
      id: "HLT-01",
      group: "health",
      title: "Kiểm tra endpoint /api/health phản hồi HTTP 200",
      status: "BLOCKED",
      evidence: allow01.reason,
    });
  } else {
    const res = await fetcher.request("/api/health");
    results.push({
      id: "HLT-01",
      group: "health",
      title: "Kiểm tra endpoint /api/health phản hồi HTTP 200",
      status: res.status === 200 ? "PASS" : "FAIL",
      httpStatus: res.status,
      durationMs: res.durationMs,
      evidence: res.status === 200
        ? `Server phản hồi 200 OK (${res.durationMs}ms)`
        : `Lỗi kết nối /api/health (Mã HTTP: ${res.status}): ${res.error || "Không nhận được phản hồi"}`,
    });
  }

  // HLT-02: Kiểm tra trang chủ / hoặc redirect về /login
  const allow02 = isEndpointAllowed("GET", "/", config.target);
  if (!allow02.allowed) {
    results.push({
      id: "HLT-02",
      group: "health",
      title: "Kiểm tra đường dẫn gốc / phản hồi sẵn sàng",
      status: "BLOCKED",
      evidence: allow02.reason,
    });
  } else {
    const res = await fetcher.request("/");
    const isOk = res.status === 200 || res.status === 307 || res.status === 302;
    results.push({
      id: "HLT-02",
      group: "health",
      title: "Kiểm tra đường dẫn gốc / phản hồi sẵn sàng",
      status: isOk ? "PASS" : "FAIL",
      httpStatus: res.status,
      durationMs: res.durationMs,
      evidence: isOk
        ? `Trang chủ phản hồi mã ${res.status} (${res.durationMs}ms)`
        : `Lỗi truy cập trang chủ (Mã HTTP: ${res.status})`,
    });
  }

  // HLT-03: Kiểm tra thời gian phản hồi (Response Latency Baseline < 2500ms)
  const healthRes = results.find((r) => r.id === "HLT-01");
  if (healthRes && healthRes.durationMs !== undefined) {
    const isFast = healthRes.durationMs < 2500;
    results.push({
      id: "HLT-03",
      group: "health",
      title: "Kiểm tra thời gian phản hồi chuẩn mạng (Latency Baseline < 2500ms)",
      status: isFast ? "PASS" : "FAIL",
      durationMs: healthRes.durationMs,
      evidence: isFast
        ? `Độ trễ phản hồi đạt tiêu chuẩn: ${healthRes.durationMs}ms`
        : `Độ trễ mạng quá cao: ${healthRes.durationMs}ms (Vượt ngưỡng 2500ms)`,
    });
  } else {
    results.push({
      id: "HLT-03",
      group: "health",
      title: "Kiểm tra thời gian phản hồi chuẩn mạng (Latency Baseline < 2500ms)",
      status: "INCONCLUSIVE",
      evidence: "Không có dữ liệu thời gian phản hồi từ bài kiểm tra HLT-01.",
    });
  }

  // HLT-04: Kiểm tra kết nối an toàn TLS/HTTPS trên môi trường Remote
  if (config.target === "production" || config.target === "staging") {
    const isHttps = config.baseUrl.toLowerCase().startsWith("https://");
    results.push({
      id: "HLT-04",
      group: "health",
      title: "Kiểm tra kết nối bảo mật HTTPS/TLS trên môi trường Staging/Production",
      status: isHttps ? "PASS" : "FAIL",
      evidence: isHttps
        ? `Đã cấu hình giao thức an toàn HTTPS: ${config.baseUrl}`
        : `Môi trường ${config.target} đang chạy HTTP không mã hóa!`,
    });
  } else {
    results.push({
      id: "HLT-04",
      group: "health",
      title: "Kiểm tra kết nối bảo mật HTTPS/TLS trên môi trường Staging/Production",
      status: "NOT_RUN",
      evidence: "Bỏ qua vì đang kiểm tra trên môi trường local (HTTP).",
    });
  }

  return results;
}

module.exports = { runHealthScenarios };
