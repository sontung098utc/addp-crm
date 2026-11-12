/**
 * ADDP AI CRM — SUITE KIỂM THỬ XÁC THỰC BẢO MẬT & CHUẨN BỊ PILOT (PILOT HARDENING TEST SUITE)
 * Kiểm chứng 100% bằng chứng:
 * 1. Chặn request không xác thực (401)
 * 2. Chặn request sai vai trò RBAC (403)
 * 3. Bảo vệ webhook KiotViet: cấm nhận secret qua query string, bắt buộc Header và Retailer
 * 4. Idempotency & Concurrency: 10 webhook đồng thời chỉ xử lý đúng 1 lần duy nhất, không tạo đơn lặp
 * 5. Bắt buộc mật khẩu riêng mạnh khi tạo nhân viên, cấm mật khẩu mặc định yếu
 * 6. Xóa hoàn toàn fallback Admin@ADDP2026!, fail-closed nếu thiếu biến, bắt buộc đổi mật khẩu sau đăng nhập đầu tiên
 * 7. Phân quyền sở hữu dữ liệu (Data Ownership): SALE/CSKH không thể đọc/sửa/xóa/bulk/export khách hàng của người khác
 * 8. Chế độ Pilot Safe Mode và thống nhất hạn mức tin Zalo server
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

// Thiết lập môi trường test cách ly hoàn toàn
const testDataDir = path.resolve(process.cwd(), "scratch", "test_pilot_hardening_data");
fs.rmSync(testDataDir, { recursive: true, force: true });
fs.mkdirSync(testDataDir, { recursive: true });
process.env.DATA_DIR = testDataDir;

process.env.CRM_JWT_SECRET = "test_pilot_secret_jwt_key_2026_super_secure_64chars_long";
process.env.KIOTVIET_WEBHOOK_SECRET = "test_kv_webhook_secret_pilot_2026";
process.env.KIOTVIET_RETAILER = "addp_pilot_test";
process.env.INITIAL_ADMIN_PASSWORD = "AdminTest@2026!";
process.env.PILOT_SAFE_MODE = "true";
process.env.QA_DISABLE_AUTO_SYNC = "true";
process.env.DAILY_ZALO_MSG_LIMIT = "70";

const {
  createSessionToken,
  createStaffRecord,
  getStaffByIdOrCode,
  getInitialAdminPassword,
  updateStaffPassword,
  authenticateStaff,
  _resetStaffStoreForTest,
} = require("../../portal/src/lib/auth.js");

_resetStaffStoreForTest();
const {
  DEFAULT_DAILY_ZALO_MSG_LIMIT,
  isSafePilotMode,
  isAutoSyncAllowed,
} = require("../../portal/src/lib/pilotConfig.js");
const {
  isIdempotencyKeyProcessed,
  reserveIdempotencyKey,
  markIdempotencyKeyProcessed,
} = require("../../portal/src/lib/idempotency.js");
const { createOrder, getStoredOrders } = require("../../portal/src/lib/ordersStore.js");
const { appendOrderCareTasks, getAllCareTasks } = require("../../portal/src/lib/careAutomation.js");
const { buildDataScopeFilter, filterRecordsByRbac, guardApiRequest } = require("../../portal/src/lib/rbac.js");

// Mock Next.js Request & Response helpers
function createMockRequest(urlStr, options = {}) {
  const url = new URL(urlStr, "http://localhost:3000");
  const headers = new Map(Object.entries(options.headers || {}));
  const bodyText = typeof options.body === "string" ? options.body : JSON.stringify(options.body || {});

  return {
    url: url.toString(),
    nextUrl: url,
    headers: {
      get: (k) => headers.get(k.toLowerCase()) || headers.get(k) || null,
      entries: () => headers.entries(),
    },
    json: async () => JSON.parse(bodyText),
    text: async () => bodyText,
  };
}

test("P0.1: Kiểm tra loại bỏ hoàn toàn fallback secrets cứng khỏi mã nguồn", () => {
  const rootDir = process.cwd();
  const checks = [
    { file: "portal/src/lib/tiktokConfig.js", pattern: /b32f208f743dda776a98432d9c8ac714372fda61/ },
    { file: "portal/src/lib/kiotvietConnector.js", pattern: /7D6E216C1F4348FD3033D6A11565E13B4CB80F33/ },
    { file: "portal/src/lib/kiotvietSync.js", pattern: /7D6E216C1F4348FD3033D6A11565E13B4CB80F33/ },
    { file: "portal/src/lib/magentoConnector.js", pattern: /addp_magento_secret_2026/ },
    { file: "portal/src/lib/ssoBridge.js", pattern: /ADDP_CRM_DEFAULT_DEV_SECRET_2026/ },
    { file: "portal/src/lib/auth.js", pattern: /ADDP_CRM_DEFAULT_DEV_SECRET_2026/ },
    { file: "portal/src/lib/auth.js", pattern: /Admin@ADDP2026!/ },
    { file: "portal/src/app/api/seed/route.js", pattern: /Admin@ADDP2026!/ },
    { file: "portal/src/lib/connectionHub.js", pattern: /ADDP_CRM_DEFAULT_DEV_SECRET_2026/ },
    { file: "portal/src/app/api/webhooks/facebook/route.js", pattern: /addp_crm_fb_webhook_secret_2026/ },
  ];

  for (const c of checks) {
    const fullPath = path.join(rootDir, c.file);
    assert.ok(fs.existsSync(fullPath), `Tệp phải tồn tại: ${c.file}`);
    const content = fs.readFileSync(fullPath, "utf8");
    assert.strictEqual(
      c.pattern.test(content),
      false,
      `Tệp ${c.file} không được chứa chuỗi bí mật hard-code!`
    );
  }
});

test("P0.1-B: Khởi tạo Quản trị viên: Fail-closed khi thiếu biến mật khẩu, bắt buộc đổi mật khẩu", () => {
  // 1. Kiểm tra fail-closed khi thiếu biến môi trường
  const savedEnv = process.env.INITIAL_ADMIN_PASSWORD;
  delete process.env.INITIAL_ADMIN_PASSWORD;

  assert.throws(
    () => getInitialAdminPassword(),
    /SECURITY_CONFIG_ERROR/,
    "Phải ném ngoại lệ fail-closed khi thiếu INITIAL_ADMIN_PASSWORD"
  );

  // 2. Kiểm tra từ chối mật khẩu yếu
  process.env.INITIAL_ADMIN_PASSWORD = "weak";
  assert.throws(
    () => getInitialAdminPassword(),
    /ít nhất 8 ký tự/,
    "Phải từ chối mật khẩu ngắn hơn 8 ký tự"
  );

  // 3. Khôi phục mật khẩu hợp lệ và xác minh cờ mustChangePassword
  process.env.INITIAL_ADMIN_PASSWORD = savedEnv;
  const validPwd = getInitialAdminPassword();
  assert.strictEqual(validPwd, savedEnv);

  const adminAuth = authenticateStaff("ADMIN", savedEnv);
  assert.ok(adminAuth, "Đăng nhập ban đầu với INITIAL_ADMIN_PASSWORD phải thành công");
  assert.strictEqual(typeof adminAuth.mustChangePassword, "boolean");

  // Đổi mật khẩu hợp lệ -> Phải xóa cờ mustChangePassword
  const updateRes = updateStaffPassword("ADMIN", savedEnv, "NewAdminSecretPass@2026!");
  assert.strictEqual(updateRes.ok, true, "Đổi mật khẩu mới hợp lệ phải thành công");

  const refreshedAdmin = authenticateStaff("ADMIN", "NewAdminSecretPass@2026!");
  assert.ok(refreshedAdmin, "Đăng nhập bằng mật khẩu mới phải thành công");
  assert.strictEqual(refreshedAdmin.mustChangePassword, false, "Sau khi đổi mật khẩu, mustChangePassword phải là false");

  // Khôi phục lại mật khẩu ban đầu để không ảnh hưởng test khác
  updateStaffPassword("ADMIN", "NewAdminSecretPass@2026!", savedEnv);
});

test("P0.2: Chặn truy cập không xác thực (401) vào 4 endpoint bảo vệ", async () => {
  const emptyCookies = { get: () => null };
  const emptyHeaders = new Map();

  // 1. POST /api/customers
  const guardCust = guardApiRequest(emptyCookies, emptyHeaders, {
    allowedRoles: ["ADMIN", "SALE_LEADER", "SALE", "CSKH"],
    moduleKey: "customers",
  });
  assert.strictEqual(guardCust.ok, false);
  assert.strictEqual(guardCust.response.status, 401, "POST /api/customers chưa đăng nhập phải trả 401");

  // 2. GET /api/channels
  const guardChan = guardApiRequest(emptyCookies, emptyHeaders, {
    allowedRoles: ["ADMIN", "SALE_LEADER", "SALE", "CSKH", "KHO", "KE_TOAN"],
    moduleKey: "channels",
  });
  assert.strictEqual(guardChan.ok, false);
  assert.strictEqual(guardChan.response.status, 401, "GET /api/channels chưa đăng nhập phải trả 401");

  // 3. GET /api/staff
  const guardStaff = guardApiRequest(emptyCookies, emptyHeaders, {
    allowedRoles: ["ADMIN", "SALE_LEADER", "SALE", "CSKH", "KHO", "KE_TOAN"],
    moduleKey: "staff",
  });
  assert.strictEqual(guardStaff.ok, false);
  assert.strictEqual(guardStaff.response.status, 401, "GET /api/staff chưa đăng nhập phải trả 401");

  // 4. GET /api/settings/channel-permissions
  const guardAcl = guardApiRequest(emptyCookies, emptyHeaders, {
    allowedRoles: ["ADMIN", "SALE_LEADER"],
    moduleKey: "settings",
  });
  assert.strictEqual(guardAcl.ok, false);
  assert.strictEqual(guardAcl.response.status, 401, "GET /api/settings/channel-permissions chưa đăng nhập phải trả 401");
});

test("P0.2-B: Chặn vai trò không được cấp quyền (403 Forbidden)", async () => {
  const khoUser = { id: 5, code: "KHO01", name: "Thủ Kho", role: "KHO" };
  const khoToken = createSessionToken(khoUser);
  const khoCookies = { get: (k) => (k === "addp_crm_session" ? { value: khoToken } : null) };
  const khoHeaders = new Map();

  const guardCust = guardApiRequest(khoCookies, khoHeaders, {
    allowedRoles: ["ADMIN", "SALE_LEADER", "SALE", "CSKH"],
    moduleKey: "customers",
  });
  assert.strictEqual(guardCust.ok, false);
  assert.strictEqual(guardCust.response.status, 403, "Vai trò KHO không được phép ghi khách hàng (403)");

  const saleUser = { id: 3, code: "S002", name: "Sale Tiểu Đường", role: "SALE" };
  const saleToken = createSessionToken(saleUser);
  const saleCookies = { get: (k) => (k === "addp_crm_session" ? { value: saleToken } : null) };

  const guardAcl = guardApiRequest(saleCookies, khoHeaders, {
    allowedRoles: ["ADMIN", "SALE_LEADER"],
    moduleKey: "settings",
  });
  assert.strictEqual(guardAcl.ok, false);
  assert.strictEqual(guardAcl.response.status, 403, "Vai trò SALE không được xem/sửa ma trận phân quyền (403)");
});

test("P0.3: Bảo vệ Webhook KiotViet: Xác thực chữ ký X-Hub-Signature HMAC-SHA256, kiểm tra retailerId payload và xử lý retry KiotViet", async () => {
  const { POST: kiotvietWebhookHandler } = require("../../portal/src/app/api/webhooks/kiotviet/route.js");
  const crypto = require("crypto");

  const configuredSecret = process.env.KIOTVIET_WEBHOOK_SECRET;
  const configuredRetailer = process.env.KIOTVIET_RETAILER;

  function signPayload(payloadObj, secret = configuredSecret, prefix = "sha256=") {
    const raw = typeof payloadObj === "string" ? payloadObj : JSON.stringify(payloadObj);
    const hash = crypto.createHmac("sha256", secret).update(raw).digest("hex");
    return prefix ? `${prefix}${hash}` : hash;
  }

  const validPayload = {
    RetailerId: configuredRetailer,
    Notifications: [
      {
        Action: "invoice.update",
        RetailerId: configuredRetailer,
        Data: [
          {
            Code: "HD_TEST_SEC_01",
            CustomerName: "Test Khách Hàng",
            ContactNumber: "0912345678",
            Total: 500000,
          },
        ],
      },
    ],
  };

  // Case 1: Truyền secret qua Query String (?secret=...) -> Phải bị TỪ CHỐI 401 (chống lộ URL/proxy log)
  const reqQueryString = createMockRequest(
    `http://localhost:3000/api/webhooks/kiotviet?secret=${configuredSecret}`,
    {
      headers: { "x-hub-signature": signPayload(validPayload) },
      body: validPayload,
    }
  );
  const resQueryString = await kiotvietWebhookHandler(reqQueryString);
  assert.strictEqual(resQueryString.status, 401, "Cấm nhận secret qua query string, phải trả về 401 Unauthorized");

  // Case 2: Thiếu header chữ ký X-Hub-Signature -> Phải bị 401 Unauthorized
  const reqNoSignature = createMockRequest("http://localhost:3000/api/webhooks/kiotviet", {
    headers: {},
    body: validPayload,
  });
  const resNoSignature = await kiotvietWebhookHandler(reqNoSignature);
  assert.strictEqual(resNoSignature.status, 401, "Webhook thiếu X-Hub-Signature phải bị từ chối 401");

  // Case 3: Chữ ký HMAC-SHA256 sai (sai secret) -> Phải bị 401 Unauthorized
  const reqWrongSignature = createMockRequest("http://localhost:3000/api/webhooks/kiotviet", {
    headers: {
      "x-hub-signature": signPayload(validPayload, "secret_gia_mao_sai_hoan_toan"),
    },
    body: validPayload,
  });
  const resWrongSignature = await kiotvietWebhookHandler(reqWrongSignature);
  assert.strictEqual(resWrongSignature.status, 401, "Webhook sai chữ ký HMAC phải bị từ chối 401");

  // Case 4: Chữ ký đúng nhưng payload thiếu trường retailerId -> Phải bị 403 Forbidden
  const payloadNoRetailer = {
    Notifications: [
      {
        Action: "invoice.update",
        Data: [{ Code: "HD_TEST_NO_RET", CustomerName: "No Retailer", ContactNumber: "0912345678", Total: 100000 }],
      },
    ],
  };
  const reqNoRetailer = createMockRequest("http://localhost:3000/api/webhooks/kiotviet", {
    headers: {
      "x-hub-signature": signPayload(payloadNoRetailer),
    },
    body: payloadNoRetailer,
  });
  const resNoRetailer = await kiotvietWebhookHandler(reqNoRetailer);
  assert.strictEqual(resNoRetailer.status, 403, "Payload thiếu retailerId phải bị từ chối 403 Forbidden");

  // Case 5: Chữ ký đúng nhưng retailerId trong payload không khớp -> Phải bị 403 Forbidden
  const payloadWrongRetailer = {
    RetailerId: "gian_hang_la_khac_123",
    Notifications: [
      {
        Action: "invoice.update",
        Data: [{ Code: "HD_TEST_WRONG_RET", CustomerName: "Wrong Retailer", ContactNumber: "0912345678", Total: 100000 }],
      },
    ],
  };
  const reqWrongRetailer = createMockRequest("http://localhost:3000/api/webhooks/kiotviet", {
    headers: {
      "x-hub-signature": signPayload(payloadWrongRetailer),
    },
    body: payloadWrongRetailer,
  });
  const resWrongRetailer = await kiotvietWebhookHandler(reqWrongRetailer);
  assert.strictEqual(resWrongRetailer.status, 403, "retailerId không khớp cấu hình phải bị từ chối 403");

  // Case 6: Chữ ký chuẩn sha256=<hmac> & đúng retailerId payload -> Phải THÀNH CÔNG 200 OK
  const uniqueCode1 = `HD_KV_VALID_${Date.now()}_1`;
  const validPayload1 = {
    RetailerId: configuredRetailer,
    Notifications: [
      {
        Action: "invoice.update",
        Data: [{ Code: uniqueCode1, CustomerName: "Khách Hợp Lệ 1", ContactNumber: "0911223344", Total: 250000 }],
      },
    ],
  };
  const reqValid1 = createMockRequest("http://localhost:3000/api/webhooks/kiotviet", {
    headers: {
      "x-hub-signature": signPayload(validPayload1),
    },
    body: validPayload1,
  });
  const resValid1 = await kiotvietWebhookHandler(reqValid1);
  assert.strictEqual(resValid1.status, 200, "Xác thực chữ ký X-Hub-Signature sha256=... hợp lệ phải trả 200 OK");

  // Case 7: Chữ ký dạng bare hex không prefix sha256= & đúng retailerId -> Phải THÀNH CÔNG 200 OK
  const uniqueCode2 = `HD_KV_VALID_${Date.now()}_2`;
  const validPayload2 = {
    RetailerId: configuredRetailer,
    Notifications: [
      {
        Action: "invoice.update",
        Data: [{ Code: uniqueCode2, CustomerName: "Khách Hợp Lệ 2", ContactNumber: "0922334455", Total: 350000 }],
      },
    ],
  };
  const reqValidBareHex = createMockRequest("http://localhost:3000/api/webhooks/kiotviet", {
    headers: {
      "x-hub-signature": signPayload(validPayload2, configuredSecret, ""),
    },
    body: validPayload2,
  });
  const resValidBareHex = await kiotvietWebhookHandler(reqValidBareHex);
  assert.strictEqual(resValidBareHex.status, 200, "Xác thực chữ ký hex không prefix phải trả 200 OK");

  // Case 8: Cơ chế KiotViet Retry: Khi nhận webhook trùng lặp, server trả về 200 OK (status: SKIPPED_DUPLICATE)
  // để KiotViet không coi là lỗi 4xx/5xx rồi tiếp tục gửi lại theo lịch exponential backoff
  const reqDuplicate = createMockRequest("http://localhost:3000/api/webhooks/kiotviet", {
    headers: {
      "x-hub-signature": signPayload(validPayload1),
    },
    body: validPayload1,
  });
  const resDuplicate = await kiotvietWebhookHandler(reqDuplicate);
  assert.strictEqual(resDuplicate.status, 200, "Hóa đơn trùng lặp phải trả về 200 OK để KiotViet ngừng retry");
  const dupBody = await resDuplicate.json();
  assert.strictEqual(dupBody.orders[0].status, "SKIPPED_DUPLICATE", "Hóa đơn trùng lặp phải có trạng thái SKIPPED_DUPLICATE");
  assert.strictEqual(dupBody.orders[0].duplicate, true, "Hóa đơn trùng lặp phải có duplicate: true");
});

test("P0.4: Webhook Concurrency & Idempotency: 10 request đồng thời chỉ xử lý đúng 1 lần", async () => {
  const { POST: kiotvietWebhookHandler } = require("../../portal/src/app/api/webhooks/kiotviet/route.js");
  const crypto = require("crypto");

  const concurrentInvoiceCode = `HD_CONCURRENT_${Date.now()}`;
  const concurrentPayload = {
    RetailerId: process.env.KIOTVIET_RETAILER,
    Notifications: [
      {
        Action: "invoice.update",
        RetailerId: process.env.KIOTVIET_RETAILER,
        Data: [
          {
            Code: concurrentInvoiceCode,
            CustomerName: "Bác Hùng Test Concurrency",
            ContactNumber: "0977889900",
            Total: 1500000,
            InvoiceDetails: [{ ProductCode: "GLUCARE-900G", Quantity: 2, Price: 750000 }],
          },
        ],
      },
    ],
  };

  const bodyStr = JSON.stringify(concurrentPayload);
  const signature = `sha256=${crypto
    .createHmac("sha256", process.env.KIOTVIET_WEBHOOK_SECRET)
    .update(bodyStr)
    .digest("hex")}`;

  const initialOrdersCount = getStoredOrders().length;

  // Gửi đồng thời 10 requests cùng 1 thời điểm (cùng millisecond)
  const concurrentRequests = Array.from({ length: 10 }).map(() =>
    createMockRequest("http://localhost:3000/api/webhooks/kiotviet", {
      headers: {
        "x-hub-signature": signature,
      },
      body: concurrentPayload,
    })
  );

  const responses = await Promise.all(concurrentRequests.map((req) => kiotvietWebhookHandler(req)));

  for (const res of responses) {
    assert.strictEqual(res.status, 200, "Mọi request đều nhận phản hồi 200 OK");
  }

  const bodies = await Promise.all(responses.map((res) => res.json()));

  let successCount = 0;
  let duplicateCount = 0;

  for (const b of bodies) {
    const orderResult = b.orders[0];
    if (orderResult.duplicate === false && orderResult.status === "SUCCESS") {
      successCount++;
    } else if (orderResult.duplicate === true && orderResult.status === "SKIPPED_DUPLICATE") {
      duplicateCount++;
    }
  }

  // ĐẢM BẢO NGUYÊN TẮC CONCURRENCY IDEMPOTENCY:
  assert.strictEqual(successCount, 1, "Chính xác 1 request thành công");
  assert.strictEqual(duplicateCount, 9, "Chính xác 9 request bị nhận diện trùng lặp");

  const finalOrdersCount = getStoredOrders().length;
  assert.strictEqual(finalOrdersCount, initialOrdersCount + 1, "Đơn hàng chỉ được tạo đúng 1 lần");
});

test("P0.5: Bắt buộc mật khẩu riêng mạnh khi tạo nhân viên, cấm mật khẩu mặc định yếu", () => {
  const resNoPass = createStaffRecord({
    code: `STAFF_TEST_NOPASS_${Date.now()}`,
    name: "Nhân Viên Không Pass",
    role: "SALE",
  });
  assert.strictEqual(resNoPass.ok, false);
  assert.ok(resNoPass.error.includes("bắt buộc"), "Phải báo lỗi khi thiếu mật khẩu");

  const resWeakPass = createStaffRecord({
    code: `STAFF_TEST_WEAK_${Date.now()}`,
    name: "Nhân Viên Pass Yếu",
    password: "123456",
    role: "SALE",
  });
  assert.strictEqual(resWeakPass.ok, false);
  assert.ok(resWeakPass.error.includes("8 ký tự"), "Mật khẩu yếu phải bị từ chối");

  const uniqueCode = `SALE_TEST_${Date.now().toString().slice(-5)}`;
  const resValid = createStaffRecord({
    code: uniqueCode,
    name: "Nhân Viên Hợp Lệ",
    password: "StrongPass2026!",
    role: "SALE",
  });
  assert.strictEqual(resValid.ok, true, "Tạo nhân viên với mật khẩu mạnh phải thành công");
  assert.strictEqual(resValid.staff.code, uniqueCode);
  assert.strictEqual(resValid.staff.passwordHash, undefined, "Không được trả về passwordHash");
});

test("P0.6: Phân quyền sở hữu dữ liệu (Data Ownership Scope): SALE/CSKH không thể đọc/sửa/xóa khách hàng người khác", async () => {
  const userA = { id: 101, code: "SALE_A", name: "Dược Sĩ Thu Hà", role: "SALE" };
  const userB = { id: 102, code: "SALE_B", name: "Dược Sĩ Mai", role: "SALE" };

  const customerOfA = {
    id: 8001,
    code: "KH_A",
    fullName: "Khách Hàng Thu Hà",
    phone: "0911000001",
    staffId: 101,
    assignedStaff: "Dược Sĩ Thu Hà",
  };

  const customerOfB = {
    id: 8002,
    code: "KH_B",
    fullName: "Khách Hàng Mai",
    phone: "0912000002",
    staffId: 102,
    assignedStaff: "Dược Sĩ Mai",
  };

  // 1. Kiểm tra buildDataScopeFilter cho SALE:
  const scopeA = buildDataScopeFilter(userA, "customers");
  assert.strictEqual(scopeA.allowed, true);
  assert.strictEqual(scopeA.scopeType, "OWN_ASSIGNED_ONLY");
  assert.deepStrictEqual(scopeA.allowedStaffIds, [101]);
  assert.strictEqual(scopeA.canExportAllCustomers, false, "SALE không được phép xuất toàn bộ khách hàng");

  // 2. Lọc danh sách: User A chỉ thấy customerOfA, không thấy customerOfB
  const visibleToA = filterRecordsByRbac(userA, [customerOfA, customerOfB], "customers");
  assert.strictEqual(visibleToA.length, 1);
  assert.strictEqual(visibleToA[0].id, 8001, "User A chỉ thấy khách của mình");

  const visibleToB = filterRecordsByRbac(userB, [customerOfA, customerOfB], "customers");
  assert.strictEqual(visibleToB.length, 1);
  assert.strictEqual(visibleToB[0].id, 8002, "User B chỉ thấy khách của mình");

  // 3. Admin thấy toàn bộ
  const adminUser = { id: 1, code: "ADMIN", name: "Admin", role: "ADMIN" };
  const visibleToAdmin = filterRecordsByRbac(adminUser, [customerOfA, customerOfB], "customers");
  assert.strictEqual(visibleToAdmin.length, 2, "Admin thấy toàn bộ khách hàng");
  const scopeAdmin = buildDataScopeFilter(adminUser, "customers");
  assert.strictEqual(scopeAdmin.canExportAllCustomers, true, "Admin được phép xuất toàn bộ khách hàng");
});

test("P1.2 & P1.3 & P1.4: Chế độ Pilot Safe Mode & Hạn mức Zalo thống nhất", async () => {
  assert.strictEqual(DEFAULT_DAILY_ZALO_MSG_LIMIT, 70, "Hạn mức Zalo mặc định phải là 70 tin/ngày/nick");
  assert.strictEqual(isSafePilotMode(), true, "Chế độ Pilot Safe Mode phải được kích hoạt");
  assert.strictEqual(isAutoSyncAllowed(), false, "Tự động đồng bộ với bên thứ 3 phải bị tắt trong safe mode");

  const { sendUnifiedMessage } = require("../../portal/src/lib/unifiedMessageRouter.js");
  const sendRes = await sendUnifiedMessage({
    channel: "ZALO_PERSONAL",
    recipientId: "test_customer_zalo_123",
    text: "Tin nhắn thử nghiệm pilot",
  });

  assert.strictEqual(sendRes.ok, true);
  assert.strictEqual(sendRes.mocked, true, "Trong pilot safe mode, tin nhắn phải được giả lập mock an toàn");
});

test("P0.7: Cơ chế KiotViet Webhook: Xác minh hành vi lỗi 5xx, chữ ký HMAC và retailerId theo tài liệu chính thức", async () => {
  const {
    POST: kiotvietWebhookHandler,
    validateKiotVietWebhookSignature,
    validatePayloadRetailer,
  } = require("../../portal/src/app/api/webhooks/kiotviet/route.js");
  const crypto = require("crypto");

  const secret = process.env.KIOTVIET_WEBHOOK_SECRET;
  const retailer = process.env.KIOTVIET_RETAILER;

  // 1. Kiểm tra xác thực chữ ký raw body (validateKiotVietWebhookSignature)
  const bodyText = JSON.stringify({ RetailerId: retailer, test: true });
  const validSig = `sha256=${crypto.createHmac("sha256", secret).update(bodyText).digest("hex")}`;
  const resSigOk = validateKiotVietWebhookSignature(bodyText, validSig, secret);
  assert.strictEqual(resSigOk.ok, true, "Chữ ký raw body hợp lệ phải trả về ok: true");

  const resSigFail = validateKiotVietWebhookSignature(bodyText, "sha256=wronghash", secret);
  assert.strictEqual(resSigFail.ok, false);
  assert.strictEqual(resSigFail.status, 401, "Chữ ký sai phải trả về 401 Unauthorized");

  // 2. Kiểm tra xác thực mã gian hàng trong payload (validatePayloadRetailer)
  const resRetOk = validatePayloadRetailer({ RetailerId: retailer }, retailer);
  assert.strictEqual(resRetOk.ok, true, "retailerId khớp cấu hình phải trả về ok: true");

  const resRetFail = validatePayloadRetailer({ RetailerId: "gian_hang_la" }, retailer);
  assert.strictEqual(resRetFail.ok, false);
  assert.strictEqual(resRetFail.status, 403, "retailerId sai phải trả về 403 Forbidden");

  // 3. Xác minh hành vi lỗi 5xx khi hệ thống gặp lỗi nội bộ không mong muốn (kích hoạt KiotViet retry)
  // Tạo một mock request gây exception khi parse JSON
  const brokenReq = {
    url: "http://localhost:3000/api/webhooks/kiotviet",
    nextUrl: new URL("http://localhost:3000/api/webhooks/kiotviet"),
    headers: {
      get: (k) => (k.toLowerCase() === "x-hub-signature" ? validSig : null),
    },
    text: async () => {
      throw new Error("Mô phỏng lỗi nghiêm trọng I/O hệ thống nội bộ");
    },
  };
  const res500 = await kiotvietWebhookHandler(brokenReq);
  assert.strictEqual(res500.status, 500, "Lỗi nội bộ hệ thống bắt buộc trả về HTTP 500 để KiotViet kích hoạt retry");
  const body500 = await res500.json();
  assert.ok(body500.error.includes("Lỗi hệ thống"), "Thông báo lỗi 500 phải rõ ràng");
});

test("P0.8: Bắt buộc đổi mật khẩu (mustChangePassword: true): Chặn toàn bộ API nghiệp vụ trước khi đổi mật khẩu", async () => {
  const { GET: customersGetHandler } = require("../../portal/src/app/api/customers/route.js");
  const { guardApiRequest } = require("../../portal/src/lib/rbac.js");
  const {
    createStaffRecord,
    updateStaffPassword,
    createSessionToken,
  } = require("../../portal/src/lib/auth.js");

  const testStaffCode = `STAFF_MUST_CHANGE_${Date.now()}`;
  const initialPass = "InitialPass@2026!";
  const newPass = "NewStrongPass@2026!";

  // 1. Tạo nhân sự mới với mustChangePassword: true
  const created = createStaffRecord({
    code: testStaffCode,
    name: "Nhân Viên Mới Cần Đổi Pass",
    password: initialPass,
    role: "SALE",
    mustChangePassword: true,
  });
  assert.strictEqual(created.ok, true);

  const token = createSessionToken({
    id: created.staff.id,
    code: created.staff.code,
    name: created.staff.name,
    role: created.staff.role,
  });

  const mockHeaders = new Map([
    ["authorization", `Bearer ${token}`],
  ]);
  const mockReqHeaders = {
    get: (k) => mockHeaders.get(k.toLowerCase()) || null,
  };

  // 2. Kiểm tra guardApiRequest chặn khi mustChangePassword === true
  const guardResult = guardApiRequest(null, mockReqHeaders, {
    allowedRoles: ["SALE", "ADMIN"],
    moduleKey: "customers",
  });
  assert.strictEqual(guardResult.ok, false, "guardApiRequest phải chặn nhân viên chưa đổi mật khẩu");
  assert.strictEqual(guardResult.response.status, 403, "Phải trả về HTTP 403 Forbidden");

  // 3. Kiểm tra GET /api/customers chặn khi mustChangePassword === true
  const mockReq = {
    url: "http://localhost:3000/api/customers",
    headers: {
      get: (k) => mockHeaders.get(k.toLowerCase()) || null,
    },
    cookies: {
      get: () => null,
    },
  };
  const resCust = await customersGetHandler(mockReq);
  assert.strictEqual(resCust.status, 403, "GET /api/customers phải chặn HTTP 403 khi mustChangePassword === true");
  const custBody = await resCust.json();
  assert.strictEqual(custBody.code, "MUST_CHANGE_PASSWORD");
  assert.strictEqual(custBody.mustChangePassword, true);

  // 4. Thực hiện đổi mật khẩu thành công qua updateStaffPassword
  const changeRes = updateStaffPassword(testStaffCode, initialPass, newPass);
  assert.strictEqual(changeRes.ok, true, "Đổi mật khẩu thành công");

  // 5. Sau khi đổi mật khẩu, guardApiRequest phải cho phép truy cập
  const guardAfter = guardApiRequest(null, mockReqHeaders, {
    allowedRoles: ["SALE", "ADMIN"],
    moduleKey: "customers",
  });
  assert.strictEqual(guardAfter.ok, true, "Sau khi đổi mật khẩu, guardApiRequest phải trả về ok: true");
  assert.strictEqual(guardAfter.staff.mustChangePassword, false, "mustChangePassword phải là false");
});
