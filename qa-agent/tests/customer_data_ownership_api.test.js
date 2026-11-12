/**
 * ADDP AI CRM — KIỂM THỬ XÁC THỰC PHÂN QUYỀN SỞ HỮU DỮ LIỆU KHÁCH HÀNG (ITEM 4)
 * Trực tiếp kiểm tra các API routes:
 * 1. GET /api/customers (Lọc theo danh sách phân bổ)
 * 2. GET /api/customers/[id] (Chặn xem khách hàng của user khác - 403)
 * 3. PUT /api/customers/[id] (Chặn sửa khách hàng của user khác - 403)
 * 4. DELETE /api/customers/[id] (Chặn xóa khách hàng của user khác - 403)
 * 5. POST /api/customers/bulk (Chặn thao tác hàng loạt trên khách hàng của user khác - 403)
 * 6. POST /api/customers (Chặn thăm dò / ghi đè khách hàng của user khác qua SĐT - 403)
 * 7. Kiểm tra quyền xuất dữ liệu (canExportAllCustomers)
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const testDataDir = path.resolve(process.cwd(), "scratch", "test_rbac_api_data");
fs.rmSync(testDataDir, { recursive: true, force: true });
fs.mkdirSync(testDataDir, { recursive: true });
process.env.DATA_DIR = testDataDir;

process.env.CRM_JWT_SECRET = "test_rbac_secret_jwt_key_2026_super_secure_64chars_long";
process.env.INITIAL_ADMIN_PASSWORD = "AdminRbacTest@2026!";

const { createSessionToken, createStaffRecord, updateStaffPassword, _resetStaffStoreForTest } = require("../../portal/src/lib/auth.js");
_resetStaffStoreForTest();
updateStaffPassword("ADMIN", process.env.INITIAL_ADMIN_PASSWORD || "AdminRbacTest@2026!", "AdminNewStrongPass@2026!");
const { buildDataScopeFilter } = require("../../portal/src/lib/rbac.js");

// Nạp các handler API
const { GET: getCustomerDetailHandler, PUT: putCustomerDetailHandler, DELETE: deleteCustomerDetailHandler } = require("../../portal/src/app/api/customers/[id]/route.js");
const { POST: bulkCustomersHandler } = require("../../portal/src/app/api/customers/bulk/route.js");
const { GET: getCustomersHandler, POST: createCustomerHandler } = require("../../portal/src/app/api/customers/route.js");

// Khởi tạo 2 users SALE độc lập trong staffStore để routeLeadToStaff nhận diện chính xác
const resStaffA = createStaffRecord({
  code: "SALE_TEST_A",
  name: "Dược Sĩ A",
  fullName: "Dược Sĩ A",
  role: "SALE",
  password: "PasswordSaleA@2026!",
});
const userSaleA = resStaffA.staff;

const resStaffB = createStaffRecord({
  code: "SALE_TEST_B",
  name: "Dược Sĩ B",
  fullName: "Dược Sĩ B",
  role: "SALE",
  password: "PasswordSaleB@2026!",
});
const userSaleB = resStaffB.staff;
const userAdmin = { id: 1, code: "ADMIN", name: "Quản Trị Viên", fullName: "Quản Trị Viên", role: "ADMIN" };

const tokenA = createSessionToken(userSaleA);
const tokenB = createSessionToken(userSaleB);
const tokenAdmin = createSessionToken(userAdmin);

// Seed 2 khách hàng vào bộ nhớ của customerIdentityResolver
const {
  getOrCreateCustomerByPhone,
  getCustomerById,
  _resetCustomersStoreForTest,
} = require("../../portal/src/lib/customerIdentityResolver.js");
_resetCustomersStoreForTest();

// Mock Request helper
function makeApiRequest(urlStr, options = {}) {
  const url = new URL(urlStr, "http://localhost:3000");
  const headers = new Map();
  if (options.token) {
    headers.set("cookie", `addp_crm_session=${options.token}`);
    headers.set("authorization", `Bearer ${options.token}`);
  }
  if (options.headers) {
    for (const [k, v] of Object.entries(options.headers)) {
      headers.set(k.toLowerCase(), v);
    }
  }

  const bodyText = typeof options.body === "string" ? options.body : JSON.stringify(options.body || {});

  return {
    url: url.toString(),
    nextUrl: url,
    headers: {
      get: (k) => headers.get(k.toLowerCase()) || null,
      entries: () => headers.entries(),
    },
    json: async () => JSON.parse(bodyText),
    text: async () => bodyText,
  };
}

test("ITEM 4.1: Kiểm tra quyền xuất dữ liệu (Export) theo Điều 5 AGENTS.md", () => {
  const scopeA = buildDataScopeFilter(userSaleA, "customers");
  assert.strictEqual(scopeA.canExportAllCustomers, false, "Nhân sự SALE không có quyền xuất toàn bộ khách hàng");

  const scopeAdmin = buildDataScopeFilter(userAdmin, "customers");
  assert.strictEqual(scopeAdmin.canExportAllCustomers, true, "Quản trị viên ADMIN có quyền xuất toàn bộ khách hàng");
});

test("ITEM 4.2: SALE A không thể đọc chi tiết khách hàng của SALE B (GET /api/customers/[id])", async () => {
  // Tạo khách hàng B thuộc SALE B
  const custB = await getOrCreateCustomerByPhone({
    phone: "0922000002",
    fullName: "Bác Tuấn (Khách của Sale B)",
    staffId: userSaleB.id,
    assignedStaff: userSaleB.name,
  });
  assert.ok(custB.id, "Khách hàng B phải được tạo");

  // SALE A cố tình đọc khách hàng của SALE B
  const reqRead = makeApiRequest(`http://localhost:3000/api/customers/${custB.id}`, { token: tokenA });
  const resRead = await getCustomerDetailHandler(reqRead, { params: Promise.resolve({ id: String(custB.id) }) });

  assert.strictEqual(resRead.status, 403, "SALE A đọc khách hàng của SALE B phải trả về 403 Forbidden");
  const body = await resRead.json();
  assert.strictEqual(body.ok, false);
  assert.ok(body.error.includes("Từ chối truy cập"), "Thông báo lỗi phải rõ ràng tiếng Việt");
});

test("ITEM 4.3: SALE A không thể cập nhật khách hàng của SALE B (PUT /api/customers/[id])", async () => {
  const custB = await getOrCreateCustomerByPhone({
    phone: "0922000002",
    fullName: "Bác Tuấn (Khách của Sale B)",
    staffId: userSaleB.id,
    assignedStaff: userSaleB.name,
  });

  // SALE A cố tình sửa thông tin của khách hàng B
  const reqEdit = makeApiRequest(`http://localhost:3000/api/customers/${custB.id}`, {
    token: tokenA,
    body: { fullName: "Bác Tuấn Đã Bị Đổi Tên", assignedStaff: "Dược Sĩ A" },
  });
  const resEdit = await putCustomerDetailHandler(reqEdit, { params: Promise.resolve({ id: String(custB.id) }) });

  assert.strictEqual(resEdit.status, 403, "SALE A sửa khách hàng của SALE B phải bị 403 Forbidden");
  const body = await resEdit.json();
  assert.strictEqual(body.ok, false);
  assert.ok(body.error.includes("Từ chối quyền sửa"), "Phải báo từ chối quyền sửa");
});

test("ITEM 4.4: SALE A không thể xóa khách hàng của SALE B (DELETE /api/customers/[id])", async () => {
  const custB = await getOrCreateCustomerByPhone({
    phone: "0922000002",
    fullName: "Bác Tuấn (Khách của Sale B)",
    staffId: userSaleB.id,
    assignedStaff: userSaleB.name,
  });

  // SALE A cố tình xóa khách hàng của SALE B
  const reqDelete = makeApiRequest(`http://localhost:3000/api/customers/${custB.id}`, { token: tokenA });
  const resDelete = await deleteCustomerDetailHandler(reqDelete, { params: Promise.resolve({ id: String(custB.id) }) });

  assert.strictEqual(resDelete.status, 403, "SALE A xóa khách hàng của SALE B phải bị 403 Forbidden");
  const body = await resDelete.json();
  assert.strictEqual(body.ok, false);
  assert.ok(body.error.includes("Từ chối quyền xóa"), "Phải báo từ chối quyền xóa");
});

test("ITEM 4.5: SALE A không thể thao tác hàng loạt trên khách hàng của SALE B (POST /api/customers/bulk)", async () => {
  const custB = await getOrCreateCustomerByPhone({
    phone: "0922000002",
    fullName: "Bác Tuấn (Khách của Sale B)",
    staffId: userSaleB.id,
    assignedStaff: userSaleB.name,
  });

  // SALE A cố tình gắn tag hoặc xóa bulk khách hàng của SALE B
  const reqBulk = makeApiRequest("http://localhost:3000/api/customers/bulk", {
    token: tokenA,
    body: {
      action: "delete",
      customerIds: [String(custB.id)],
    },
  });
  const resBulk = await bulkCustomersHandler(reqBulk);

  assert.strictEqual(resBulk.status, 403, "SALE A bulk-thao tác khách của SALE B phải bị 403 Forbidden");
  const body = await resBulk.json();
  assert.strictEqual(body.ok, false);
  assert.ok(body.error.includes("Từ chối truy cập"), "Phải từ chối bulk thao tác");
});

test("ITEM 4.6: SALE A không thể thăm dò hoặc ghi đè khách hàng của SALE B qua POST /api/customers", async () => {
  // SALE A gửi POST /api/customers với SĐT của khách hàng B
  const reqProbe = makeApiRequest("http://localhost:3000/api/customers", {
    token: tokenA,
    body: {
      phone: "0922000002",
      fullName: "Cố tình ghi đè khách của B",
    },
  });
  const resProbe = await createCustomerHandler(reqProbe);

  assert.strictEqual(resProbe.status, 403, "SALE A thăm dò khách của SALE B qua POST phải bị 403 Forbidden");
  const body = await resProbe.json();
  assert.strictEqual(body.ok, false);
  assert.ok(body.error.includes("Từ chối truy cập"), "Phải trả về lỗi từ chối truy cập rõ ràng");
});

test("ITEM 4.7: Trực tiếp kiểm tra API xuất khách hàng với hai user SALE thử nghiệm (GET /api/customers)", async () => {
  // Đảm bảo có cả khách hàng của SALE A và khách hàng của SALE B trong hệ thống
  const custA = await getOrCreateCustomerByPhone({
    phone: "0911000001",
    fullName: "Bác Lan (Khách của Sale A)",
    staffId: userSaleA.id,
    assignedStaff: userSaleA.name,
  });
  const custB = await getOrCreateCustomerByPhone({
    phone: "0922000002",
    fullName: "Bác Tuấn (Khách của Sale B)",
    staffId: userSaleB.id,
    assignedStaff: userSaleB.name,
  });

  // 1. SALE A gọi API lấy / xuất danh sách khách hàng
  const reqSaleA = makeApiRequest("http://localhost:3000/api/customers?format=export", { token: tokenA });
  const resSaleA = await getCustomersHandler(reqSaleA);
  assert.strictEqual(resSaleA.status, 200, "SALE A gọi API khách hàng phải trả về 200");
  const dataSaleA = await resSaleA.json();

  assert.strictEqual(dataSaleA.currentStaff.canExportAllCustomers, false, "SALE A không có quyền xuất toàn công ty");
  const phonesSaleA = dataSaleA.customers.map((c) => c.phone);
  assert.ok(phonesSaleA.includes(custA.phone), "SALE A phải thấy khách hàng của mình (Bác Lan)");
  assert.strictEqual(phonesSaleA.includes(custB.phone), false, "SALE A tuyệt đối KHÔNG ĐƯỢC thấy khách của SALE B (Bác Tuấn)");
  for (const c of dataSaleA.customers) {
    assert.strictEqual(Number(c.staffId), userSaleA.id, `Mọi khách hàng trả về cho SALE A đều phải có staffId == ${userSaleA.id}`);
  }

  // 2. SALE B gọi API lấy / xuất danh sách khách hàng
  const reqSaleB = makeApiRequest("http://localhost:3000/api/customers?format=export", { token: tokenB });
  const resSaleB = await getCustomersHandler(reqSaleB);
  assert.strictEqual(resSaleB.status, 200, "SALE B gọi API khách hàng phải trả về 200");
  const dataSaleB = await resSaleB.json();

  assert.strictEqual(dataSaleB.currentStaff.canExportAllCustomers, false, "SALE B không có quyền xuất toàn công ty");
  const phonesSaleB = dataSaleB.customers.map((c) => c.phone);
  assert.ok(phonesSaleB.includes(custB.phone), "SALE B phải thấy khách hàng của mình (Bác Tuấn)");
  assert.strictEqual(phonesSaleB.includes(custA.phone), false, "SALE B tuyệt đối KHÔNG ĐƯỢC thấy khách của SALE A (Bác Lan)");
  for (const c of dataSaleB.customers) {
    assert.strictEqual(Number(c.staffId), userSaleB.id, `Mọi khách hàng trả về cho SALE B đều phải có staffId == ${userSaleB.id}`);
  }

  // 3. SALE A cố tình xuất toàn bộ danh sách khách hàng công ty (?exportAll=true) -> Bị chặn 403 Forbidden
  const reqSaleAExportAll = makeApiRequest("http://localhost:3000/api/customers?exportAll=true", { token: tokenA });
  const resSaleAExportAll = await getCustomersHandler(reqSaleAExportAll);
  assert.strictEqual(resSaleAExportAll.status, 403, "SALE A cố tình exportAll=true phải bị trả về 403 Forbidden");
  const errBodyA = await resSaleAExportAll.json();
  assert.ok(errBodyA.error.includes("không có quyền xuất toàn bộ danh sách khách hàng"), "Lỗi phân quyền exportAll rõ ràng");

  // 4. SALE B cố tình xuất toàn bộ danh sách khách hàng công ty (?export=all) -> Bị chặn 403 Forbidden
  const reqSaleBExportAll = makeApiRequest("http://localhost:3000/api/customers?export=all", { token: tokenB });
  const resSaleBExportAll = await getCustomersHandler(reqSaleBExportAll);
  assert.strictEqual(resSaleBExportAll.status, 403, "SALE B cố tình export=all phải bị trả về 403 Forbidden");

  // 5. Quản trị viên ADMIN gọi exportAll=true -> Thành công 200 và thấy toàn bộ khách hàng
  const reqAdmin = makeApiRequest("http://localhost:3000/api/customers?exportAll=true", { token: tokenAdmin });
  const resAdmin = await getCustomersHandler(reqAdmin);
  assert.strictEqual(resAdmin.status, 200, "ADMIN gọi exportAll=true phải trả về 200 OK");
  const dataAdmin = await resAdmin.json();
  assert.strictEqual(dataAdmin.currentStaff.canExportAllCustomers, true, "ADMIN có canExportAllCustomers == true");
  const phonesAdmin = dataAdmin.customers.map((c) => c.phone);
  assert.ok(phonesAdmin.includes(custA.phone), "ADMIN phải thấy khách của SALE A");
  assert.ok(phonesAdmin.includes(custB.phone), "ADMIN phải thấy khách của SALE B");
});
