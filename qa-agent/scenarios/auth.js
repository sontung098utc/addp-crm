/**
 * ADDP AI CRM — QA AGENT SCENARIOS: AUTHENTICATION & ACCESS CONTROL (READ-ONLY)
 */

const { isEndpointAllowed } = require("../allowlist");

async function runAuthScenarios({ config, fetcher }) {
  const results = [];

  // AUT-01: Truy cập /api/channels khi chưa đăng nhập phải bị từ chối (401/403/Redirect)
  const allow01 = isEndpointAllowed("GET", "/api/channels", config.target);
  if (!allow01.allowed) {
    results.push({
      id: "AUT-01",
      group: "auth",
      title: "Chặn truy cập không xác thực vào /api/channels",
      status: "BLOCKED",
      evidence: allow01.reason,
    });
  } else {
    // Gửi request không kèm Cookie phiên làm việc (đánh dấu isAuthProbe để không in body)
    const res = await fetcher.request("/api/channels", { headers: {}, isAuthProbe: true });
    const isProtected = res.status === 401 || res.status === 403 || res.status === 307 || res.status === 302;
    results.push({
      id: "AUT-01",
      group: "auth",
      title: "Chặn truy cập không xác thực vào /api/channels",
      status: isProtected ? "PASS" : "FAIL",
      httpStatus: res.status,
      durationMs: res.durationMs,
      evidence: isProtected
        ? `Đã chặn thành công với mã HTTP ${res.status}`
        : `LỖ HỔNG: Endpoint cho phép đọc dữ liệu kênh không cần đăng nhập (Mã HTTP: ${res.status})`,
    });
  }

  // AUT-02: Truy cập /api/staff khi chưa đăng nhập phải bị từ chối
  const allow02 = isEndpointAllowed("GET", "/api/staff", config.target);
  if (!allow02.allowed) {
    results.push({
      id: "AUT-02",
      group: "auth",
      title: "Chặn truy cập không xác thực vào /api/staff (RBAC)",
      status: "BLOCKED",
      evidence: allow02.reason,
    });
  } else {
    const res = await fetcher.request("/api/staff", { headers: {}, isAuthProbe: true });
    const isProtected = res.status === 401 || res.status === 403 || res.status === 307 || res.status === 302;
    results.push({
      id: "AUT-02",
      group: "auth",
      title: "Chặn truy cập không xác thực vào /api/staff (RBAC)",
      status: isProtected ? "PASS" : "FAIL",
      httpStatus: res.status,
      durationMs: res.durationMs,
      evidence: isProtected
        ? `Đã chặn thành công với mã HTTP ${res.status}`
        : `LỖ HỔNG: Endpoint cho phép đọc danh sách nhân sự không cần đăng nhập (Mã HTTP: ${res.status})`,
    });
  }

  // AUT-03: Truy cập /api/auth/me khi chưa có phiên đăng nhập
  const allow03 = isEndpointAllowed("GET", "/api/auth/me", config.target);
  if (!allow03.allowed) {
    results.push({
      id: "AUT-03",
      group: "auth",
      title: "Kiểm tra endpoint phiên làm việc /api/auth/me",
      status: "BLOCKED",
      evidence: allow03.reason,
    });
  } else {
    const res = await fetcher.request("/api/auth/me", { headers: {}, isAuthProbe: true });
    const isCleanNoAuth = res.status === 401 || (res.status === 200 && res.json?.user === null) || res.status === 403;
    results.push({
      id: "AUT-03",
      group: "auth",
      title: "Kiểm tra endpoint phiên làm việc /api/auth/me",
      status: isCleanNoAuth ? "PASS" : "FAIL",
      httpStatus: res.status,
      durationMs: res.durationMs,
      evidence: isCleanNoAuth
        ? `Xác thực an toàn: mã ${res.status} (không nhận diện người dùng ảo)`
        : `Phản hồi không mong đợi: HTTP ${res.status}`,
    });
  }

  // AUT-04: Trang đăng nhập /login hiển thị sẵn sàng
  const allow04 = isEndpointAllowed("GET", "/login", config.target);
  if (!allow04.allowed) {
    results.push({
      id: "AUT-04",
      group: "auth",
      title: "Trang đăng nhập /login hiển thị sẵn sàng",
      status: "BLOCKED",
      evidence: allow04.reason,
    });
  } else {
    const res = await fetcher.request("/login");
    const isOk = res.status === 200;
    results.push({
      id: "AUT-04",
      group: "auth",
      title: "Trang đăng nhập /login hiển thị sẵn sàng",
      status: isOk ? "PASS" : "FAIL",
      httpStatus: res.status,
      durationMs: res.durationMs,
      evidence: isOk
        ? `Trang đăng nhập tải thành công mã 200 (${res.durationMs}ms)`
        : `Lỗi tải trang đăng nhập: HTTP ${res.status}`,
    });
  }

  return results;
}

module.exports = { runAuthScenarios };
