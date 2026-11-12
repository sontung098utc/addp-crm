/**
 * ADDP AI CRM — QA AGENT SELF-TEST SUITE
 * Kiểm tra các tính năng an toàn cốt lõi của QA Agent bằng node:test
 */

const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const { getQaConfig, validateHost } = require("../config");
const { isEndpointAllowed } = require("../allowlist");
const { maskPhone, maskEmail, maskSecret, sanitizePayload } = require("../masker");
const { runQaAgent, createSafeFetcher } = require("../runner");

test("QA Agent Safety: 1. Chặn chạy Production khi thiếu cờ xác nhận an toàn (Các trường hợp)", () => {
  // 1a. Thiếu cờ hoàn toàn
  assert.throws(
    () => {
      getQaConfig({
        target: "production",
        confirmProduction: false,
        baseUrl: "https://crm.addp.vn",
      });
    },
    (err) => err.message.includes("[PRODUCTION_SAFETY_BLOCKED]"),
    "Phải ném ngoại lệ khi confirmProduction = false"
  );

  // 1b. Cờ confirmProduction = true qua options -> Hợp lệ
  const cfgCli = getQaConfig({
    target: "production",
    confirmProduction: true,
    baseUrl: "https://crm.addp.vn",
  });
  assert.strictEqual(cfgCli.target, "production");

  // 1c. Cờ QA_CONFIRM_PRODUCTION=true qua env -> Hợp lệ
  const oldEnv = process.env.QA_CONFIRM_PRODUCTION;
  try {
    process.env.QA_CONFIRM_PRODUCTION = "true";
    const cfgEnv = getQaConfig({
      target: "production",
      baseUrl: "https://crm.addp.vn",
    });
    assert.strictEqual(cfgEnv.target, "production");
  } finally {
    if (oldEnv === undefined) delete process.env.QA_CONFIRM_PRODUCTION;
    else process.env.QA_CONFIRM_PRODUCTION = oldEnv;
  }

  // 1d. Target local hoặc staging không cần cờ confirmProduction
  const cfgLocal = getQaConfig({ target: "local" });
  assert.strictEqual(cfgLocal.target, "local");
  const cfgStaging = getQaConfig({ target: "staging" });
  assert.strictEqual(cfgStaging.target, "staging");
});

test("QA Agent Safety: 2. Chặn URL có credentials, IP riêng hoặc không thuộc Allowlist", () => {
  const disallowedUrls = [
    "http://google.com",
    "http://attacker.com/api/test",
    "https://api.unknown-target.net",
    "http://192.168.1.99:8080",
    "http://10.0.0.1:3000",
    "http://172.16.0.1:3000",
    "http://admin:secret@localhost:3000",
    "https://user:password@crm.addp.vn",
  ];

  for (const url of disallowedUrls) {
    assert.throws(
      () => validateHost(url),
      (err) => err.message.includes("[SAFETY_VIOLATION]"),
      `Phải chặn URL không an toàn hoặc có credentials: ${url}`
    );
  }

  // Các host hợp lệ phải được chấp nhận theo target tương ứng
  assert.strictEqual(validateHost("http://localhost:3000", "local"), "http://localhost:3000");
  assert.strictEqual(validateHost("http://127.0.0.1:3000", "local"), "http://127.0.0.1:3000");
  assert.strictEqual(validateHost("https://crm.addp.vn", "production"), "https://crm.addp.vn");
  assert.strictEqual(validateHost("https://staging-crm.addp.vn", "staging"), "https://staging-crm.addp.vn");
});

test("QA Agent Safety: 3. Rào chắn Allowlist tuyệt đối không cho phép phương thức POST/PUT/DELETE", () => {
  // Các lệnh đột biến dữ liệu phải bị chặn
  const disallowedCalls = [
    { method: "POST", path: "/api/channels/zalo/send" },
    { method: "POST", path: "/api/orders/kiotviet/sync" },
    { method: "POST", path: "/api/channels/tiktok/sync-messages" },
    { method: "POST", path: "/api/webhooks/kiotviet" },
    { method: "POST", path: "/api/broadcast/send" },
    { method: "DELETE", path: "/api/customers/123" },
    { method: "PUT", path: "/api/customers/123" },
  ];

  for (const call of disallowedCalls) {
    const res = isEndpointAllowed(call.method, call.path, "local");
    assert.strictEqual(res.allowed, false, `Phải chặn lệnh đột biến: ${call.method} ${call.path}`);
  }

  // Endpoint đọc an toàn phải được chấp nhận
  const allowedCall = isEndpointAllowed("GET", "/api/health", "local");
  assert.strictEqual(allowedCall.allowed, true, "GET /api/health phải được cho phép");
});

test("QA Agent Masker: 4. Che giấu bí mật (Secrets) và Thông tin cá nhân (PII)", () => {
  assert.strictEqual(maskPhone("0912345678"), "0912***678");
  assert.strictEqual(maskPhone("0904637007"), "0904***007");
  assert.strictEqual(maskEmail("admin@addp.vn"), "a***n@addp.vn");
  assert.strictEqual(maskSecret("super_secret_token_12345"), "sup***345");

  const dirtyPayload = {
    app_secret: "secret_value_xyz",
    clientSecret: "kiot_secret_123",
    customerPhone: "0912345678",
    userEmail: "contact@addp.vn",
    pathology: "Tiểu đường tuýp 2, men gan cao",
    bloodSugar: 7.2,
    safeField: "Thông tin hiển thị công khai",
  };

  const clean = sanitizePayload(dirtyPayload);
  assert.strictEqual(clean.app_secret, "[REDACTED_SECRET]");
  assert.strictEqual(clean.clientSecret, "[REDACTED_SECRET]");
  assert.strictEqual(clean.customerPhone, "0912***678");
  assert.strictEqual(clean.userEmail, "c***t@addp.vn");
  assert.strictEqual(clean.pathology, "[HEALTH_DATA_MASKED]");
  assert.strictEqual(clean.safeField, "Thông tin hiển thị công khai");
});

test("QA Agent Execution: 5. Chạy kịch bản hoàn chỉnh trên Mock Server cục bộ & sinh báo cáo", async () => {
  // 1. Khởi tạo một HTTP Mock Server cục bộ trên cổng tạm thời
  const mockServer = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, status: "healthy", timestamp: Date.now() }));
    } else if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html><body>ADDP CRM Home</body></html>");
    } else if (url.pathname === "/login") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html><body>Login Page</body></html>");
    } else if (url.pathname === "/api/channels") {
      // Giả lập từ chối truy cập không có token (401 Unauthorized)
      const cookie = req.headers["cookie"] || "";
      if (cookie.includes("addp_crm_session=")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, channels: [] }));
      } else {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Unauthorized" }));
      }
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    }
  });

  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const address = mockServer.address();
  const mockBaseUrl = `http://127.0.0.1:${address.port}`;

  const tempReportDir = path.join(process.cwd(), "reports", "qa_test_tmp");

  try {
    const outcome = await runQaAgent({
      target: "local",
      baseUrl: mockBaseUrl,
      group: "health",
      reportDir: tempReportDir,
    });

    assert.ok(outcome.summary, "Phải có bảng tổng hợp kết quả");
    assert.strictEqual(outcome.summary.FAIL, 0, "Trên mock server chuẩn bị, không có bài test FAIL");
    assert.ok(outcome.summary.PASS >= 2, "Tối thiểu 2 bài test PASS trên mock server");
    assert.ok(fs.existsSync(outcome.savedFiles.markdownFile), "Phải tạo tệp báo cáo Markdown");
    assert.ok(fs.existsSync(outcome.savedFiles.jsonFile), "Phải tạo tệp báo cáo JSON");

    const mdContent = fs.readFileSync(outcome.savedFiles.markdownFile, "utf8");
    assert.ok(mdContent.includes("HLT-01"), "Báo cáo phải chứa mã bài kiểm tra HLT-01");
  } finally {
    // Đóng mock server và dọn dẹp thư mục tạm
    await new Promise((resolve) => mockServer.close(resolve));
    try {
      fs.rmSync(tempReportDir, { recursive: true, force: true });
    } catch {}
  }
});

test("QA Agent Masker: 6. Che giấu đệ quy lồng sâu & bảo vệ tham chiếu vòng (Circular Reference)", () => {
  const circularObj = {
    level1: {
      secret_token: "jwt_token_12345",
      phone: "0912345678",
      nested: {
        apiKey: "ak_live_abcdef123456",
        patient: {
          pathology: "Tiểu đường",
        },
      },
    },
  };
  // Tạo tham chiếu vòng
  circularObj.level1.circular = circularObj;

  const sanitized = sanitizePayload(circularObj);
  assert.strictEqual(sanitized.level1.secret_token, "[REDACTED_SECRET]");
  assert.strictEqual(sanitized.level1.phone, "0912***678");
  assert.strictEqual(sanitized.level1.nested.apiKey, "[REDACTED_SECRET]");
  assert.strictEqual(sanitized.level1.nested.patient.pathology, "[HEALTH_DATA_MASKED]");
  assert.strictEqual(sanitized.level1.circular, "[CIRCULAR_REFERENCE]");
});

test("QA Agent Fetcher: 7. Xác minh isAuthProbe ẩn toàn bộ response body khi probe 401/403", async () => {
  const mockServer = http.createServer((req, res) => {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized", internalSecretLeak: "SUPER_SECRET_123" }));
  });

  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const address = mockServer.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const fetcher = createSafeFetcher({ baseUrl, target: "local" });
    const res = await fetcher.request("/api/auth/me", { isAuthProbe: true });

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.rawBody, "[AUTH_CHECK_BODY_OMITTED]");
    assert.strictEqual(res.json, null);
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
  }
});

test("QA Agent Fetcher: 8. Chặn chuyển hướng (Redirect) ra ngoài máy chủ ban đầu", async () => {
  const mockServer = http.createServer((req, res) => {
    // Trả về redirect sang host ngoài danh sách cho phép
    res.writeHead(302, { Location: "http://malicious-external-site.com/steal-token" });
    res.end();
  });

  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const address = mockServer.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const fetcher = createSafeFetcher({ baseUrl, target: "local" });
    const res = await fetcher.request("/api/health");

    assert.strictEqual(res.status, 302);
    assert.strictEqual(res.crossHostRedirectBlocked, true);
    assert.ok(res.redirectLocation.includes("malicious-external-site.com"));
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
  }
});

test("QA Agent Config: 9. Nạp biến môi trường .env.qa và bảo vệ không rò rỉ vào log/report", () => {
  const qaEnvPath = path.join(process.cwd(), ".env.qa.test_tmp");
  try {
    fs.writeFileSync(
      qaEnvPath,
      "QA_TEST_VARIABLE_SAFE=loaded_successfully_123\nQA_SECRET_LEAK_TEST=secret_key_999\n",
      "utf8"
    );

    // Nạp env
    const { loadQaEnv } = require("../config");
    loadQaEnv(qaEnvPath);

    assert.strictEqual(process.env.QA_TEST_VARIABLE_SAFE, "loaded_successfully_123");
    assert.strictEqual(process.env.QA_SECRET_LEAK_TEST, "secret_key_999");

    // Kiểm tra masker không để lộ secret khi xử lý env object
    const maskedObj = sanitizePayload({
      envVar: process.env.QA_SECRET_LEAK_TEST,
      keyName: "QA_SECRET_LEAK_TEST",
    });
    // Do tên key chứa SECRET, masker phải redact
    assert.strictEqual(maskedObj.envVar, "secret_key_999");
    assert.strictEqual(
      sanitizePayload({ QA_SECRET_LEAK_TEST: process.env.QA_SECRET_LEAK_TEST }).QA_SECRET_LEAK_TEST,
      "[REDACTED_SECRET]"
    );
  } finally {
    delete process.env.QA_TEST_VARIABLE_SAFE;
    delete process.env.QA_SECRET_LEAK_TEST;
    try {
      fs.unlinkSync(qaEnvPath);
    } catch {}
  }
});
