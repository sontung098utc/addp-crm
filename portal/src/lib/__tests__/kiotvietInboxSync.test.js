import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolate DATA_DIR in a temp directory so tests never mutate portal/.data
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kiotviet-inbox-sync-test-"));
process.env.DATA_DIR = tmpDir;
process.env.NODE_ENV = "test";
process.env.PILOT_SAFE_MODE = "true";

const {
  calculateOrderSummaryForPhone,
  triggerCareScheduleForDeliveredOrders,
  syncKiotVietOrdersByPhone,
} = await import("../kiotvietSync.js");
const { upsertStoredOrders } = await import("../ordersStore.js");
const { getAllCareTasks } = await import("../careAutomation.js");

test("calculateOrderSummaryForPhone normalizes phone and computes totals & deliveryRate", () => {
  const orders = [
    {
      id: "ord_1",
      orderCode: "HD001",
      phone: "84912345678",
      status: "DELIVERED",
      finalAmount: 550000,
    },
    {
      id: "ord_2",
      orderCode: "HD002",
      phone: "+84 912 345 678",
      status: "SHIPPING",
      finalAmount: 300000,
    },
    {
      id: "ord_3",
      orderCode: "HD003",
      phone: "0912345678",
      status: "CANCELLED",
      finalAmount: 200000,
    },
    {
      id: "ord_other",
      orderCode: "HD999",
      phone: "0988888888",
      status: "DELIVERED",
      finalAmount: 999000,
    },
  ];

  const summary = calculateOrderSummaryForPhone(orders, "0912345678");
  assert.equal(summary.totalOrders, 2);
  assert.equal(summary.totalSpent, 850000);
  assert.equal(summary.deliveredCount, 1);
  assert.equal(summary.cancelledCount, 1);
  assert.equal(summary.deliveryRate, "50%");
});

test("triggerCareScheduleForDeliveredOrders creates care tasks only for DELIVERED orders and is idempotent", () => {
  const orders = [
    {
      id: "kiot_HD100",
      orderCode: "HD100",
      kiotVietOrderCode: "HD100",
      customerName: "Cô Lan",
      phone: "0912345678",
      channel: "KIOTVIET",
      status: "DELIVERED",
      finalAmount: 650000,
      items: [{ sku: "GLUCARE-01", name: "Sữa hạt Glucare Plus", quantity: 1 }],
      createdAt: "2026-11-10T08:00:00.000Z",
    },
    {
      id: "kiot_HD101",
      orderCode: "HD101",
      kiotVietOrderCode: "HD101",
      customerName: "Cô Lan",
      phone: "0912345678",
      channel: "KIOTVIET",
      status: "SHIPPING",
      finalAmount: 650000,
      items: [{ sku: "GLUCARE-01", name: "Sữa hạt Glucare Plus", quantity: 1 }],
      createdAt: "2026-11-12T08:00:00.000Z",
    },
  ];

  const createdFirst = triggerCareScheduleForDeliveredOrders(orders);
  assert.equal(createdFirst, 7);

  const tasks = getAllCareTasks();
  const hd100Tasks = tasks.filter((t) => t.orderCode === "HD100");
  const hd101Tasks = tasks.filter((t) => t.orderCode === "HD101");
  assert.equal(hd100Tasks.length, 7);
  assert.equal(hd101Tasks.length, 0);

  const taskTypes = new Set(hd100Tasks.map((t) => t.taskType));
  for (const expected of ["DAY_1", "DAY_3", "DAY_7", "DAY_14", "DAY_21", "HALF_USAGE", "TWO_THIRD_USAGE"]) {
    assert.ok(taskTypes.has(expected), `Missing milestone ${expected}`);
  }

  // Idempotent on second run
  const createdSecond = triggerCareScheduleForDeliveredOrders(orders);
  assert.equal(createdSecond, 0);
});

test("syncKiotVietOrdersByPhone normalizes phone, reconciles local orders and triggers care tasks", async () => {
  upsertStoredOrders([
    {
      id: "kiot_HD200",
      orderCode: "HD200",
      kiotVietOrderCode: "HD200",
      customerName: "Chú Minh",
      phone: "0977112233",
      channel: "KIOTVIET",
      syncedKiotViet: true,
      status: "DELIVERED",
      finalAmount: 1200000,
      items: [{ sku: "DOVITAL-01", name: "Dovital", quantity: 2 }],
      createdAt: "2026-11-11T08:00:00.000Z",
    },
  ]);

  const res = await syncKiotVietOrdersByPhone("+84 977 112 233");
  assert.equal(res.ok, true);
  assert.equal(res.phone, "0977112233");
  assert.equal(res.orders.length, 1);
  assert.equal(res.summary.totalOrders, 1);
  assert.equal(res.summary.totalSpent, 1200000);
  assert.equal(res.summary.deliveryRate, "100%");
  assert.equal(res.careTasksCreated, 7);
});
