/**
 * ADDP AI CRM — QA AGENT SCENARIOS: INTEGRATIONS READ-ONLY & MUTATION GUARD
 */

const { isEndpointAllowed } = require("../allowlist");

async function runIntegrationsReadonlyScenarios({ config, fetcher }) {
  const results = [];

  // INT-01: Kiểm tra an toàn endpoint thống kê sidebar (/api/sidebar-stats)
  const allow01 = isEndpointAllowed("GET", "/api/sidebar-stats", config.target);
  if (!allow01.allowed) {
    results.push({
      id: "INT-01",
      group: "integrations-readonly",
      title: "Đọc trạng thái thống kê kênh kết nối (/api/sidebar-stats)",
      status: "BLOCKED",
      evidence: allow01.reason,
    });
  } else {
    const res = await fetcher.request("/api/sidebar-stats");
    const isOk = res.status === 200 || res.status === 401;
    results.push({
      id: "INT-01",
      group: "integrations-readonly",
      title: "Đọc trạng thái thống kê kênh kết nối (/api/sidebar-stats)",
      status: isOk ? "PASS" : "FAIL",
      httpStatus: res.status,
      durationMs: res.durationMs,
      evidence: isOk
        ? `Đọc an toàn mã HTTP ${res.status} (${res.durationMs}ms)`
        : `Lỗi đọc sidebar stats: HTTP ${res.status}`,
    });
  }

  // INT-02: Kiểm tra an toàn danh mục tag (/api/tags)
  const allow02 = isEndpointAllowed("GET", "/api/tags", config.target);
  if (!allow02.allowed) {
    results.push({
      id: "INT-02",
      group: "integrations-readonly",
      title: "Đọc danh mục thẻ tag phân loại y tế (/api/tags)",
      status: "BLOCKED",
      evidence: allow02.reason,
    });
  } else {
    const res = await fetcher.request("/api/tags");
    const isOk = res.status === 200 || res.status === 401;
    results.push({
      id: "INT-02",
      group: "integrations-readonly",
      title: "Đọc danh mục thẻ tag phân loại y tế (/api/tags)",
      status: isOk ? "PASS" : "FAIL",
      httpStatus: res.status,
      durationMs: res.durationMs,
      evidence: isOk
        ? `Đọc danh mục tag thành công mã ${res.status}`
        : `Lỗi đọc danh mục tag: HTTP ${res.status}`,
    });
  }

  // INT-03: Rào chắn an toàn: Chặn gọi đồng bộ tin nhắn TikTok thật
  const checkTikTokSync = isEndpointAllowed("POST", "/api/channels/tiktok/sync-messages", config.target);
  results.push({
    id: "INT-03",
    group: "integrations-readonly",
    title: "Rào chắn an toàn: Chặn gọi đồng bộ tin nhắn TikTok Shop thật",
    status: !checkTikTokSync.allowed ? "PASS" : "FAIL",
    evidence: !checkTikTokSync.allowed
      ? `Đã bảo vệ an toàn: ${checkTikTokSync.reason}`
      : "NGUY HIỂM: Cho phép gọi endpoint đột biến tin nhắn TikTok trong chế độ read-only!",
  });

  // INT-04: Rào chắn an toàn: Chặn gọi đồng bộ đơn hàng KiotViet thật
  const checkKiotSync = isEndpointAllowed("POST", "/api/orders/kiotviet/sync", config.target);
  results.push({
    id: "INT-04",
    group: "integrations-readonly",
    title: "Rào chắn an toàn: Chặn kích hoạt đồng bộ đơn hàng KiotViet thật",
    status: !checkKiotSync.allowed ? "PASS" : "FAIL",
    evidence: !checkKiotSync.allowed
      ? `Đã bảo vệ an toàn: ${checkKiotSync.reason}`
      : "NGUY HIỂM: Cho phép gọi endpoint đồng bộ đơn hàng thật trong chế độ read-only!",
  });

  // INT-05: Rào chắn an toàn: Chặn gọi gửi tin nhắn Zalo cá nhân thật
  const checkZaloSend = isEndpointAllowed("POST", "/api/channels/zalo/send", config.target);
  results.push({
    id: "INT-05",
    group: "integrations-readonly",
    title: "Rào chắn an toàn: Chặn gửi tin nhắn Zalo cá nhân thật",
    status: !checkZaloSend.allowed ? "PASS" : "FAIL",
    evidence: !checkZaloSend.allowed
      ? `Đã bảo vệ an toàn: ${checkZaloSend.reason}`
      : "NGUY HIỂM: Cho phép gọi endpoint gửi tin nhắn thật trong chế độ read-only!",
  });

  // INT-06: Rào chắn an toàn: Chặn kích hoạt chiến dịch Broadcast thật
  const checkBroadcast = isEndpointAllowed("POST", "/api/broadcast/send", config.target);
  results.push({
    id: "INT-06",
    group: "integrations-readonly",
    title: "Rào chắn an toàn: Chặn kích hoạt chiến dịch phát tin hàng loạt (Broadcast)",
    status: !checkBroadcast.allowed ? "PASS" : "FAIL",
    evidence: !checkBroadcast.allowed
      ? `Đã bảo vệ an toàn: ${checkBroadcast.reason}`
      : "NGUY HIỂM: Cho phép gọi endpoint phát tin hàng loạt trong chế độ read-only!",
  });

  return results;
}

module.exports = { runIntegrationsReadonlyScenarios };
