import { normalizePhone } from "./phone.js";
import { resolveComboFormulaList } from "./comboResolver.js";
import { buildCareSchedule } from "./careAutomation.js";
import { listAllStaff, listChannelAccounts } from "./auth.js";
import { filterRecordsByRbac } from "./rbac.js";

/**
 * Bộ Dữ liệu Mẫu Hợp Nhất 7 Kênh & Kiểm Thử Nghiệm Thu Giai Đoạn 1 (WBS-10)
 * Kế thừa C:\QuanlyKH\src\app\api\seed\route.js + C:\AH-Trabi\quan-ly-kho + C:\AdsTiktok
 */

const INITIAL_CUSTOMERS = [
  {
    id: 1001,
    code: "KH001",
    fullName: "Nguyễn Văn Tuấn",
    phone: normalizePhone("+84901234567"),
    age: 54,
    province: "Hà Nội",
    pathology: "Tiểu đường tuýp 2 (5 năm), tê bì chân tay",
    initialGlucose: 8.5,
    currentGlucose: 6.8,
    weeklyFeedback: "Tuần 1 giảm tiểu đêm từ 4 lần xuống 1 lần, ngủ sâu giấc hơn.",
    sourceChannel: "FACEBOOK",
    tags: ["Tiểu đường Tuýp 2", "Khách VIP", "Đang dùng Liệu trình"],
    staffId: 3, // S002 - Trần Thu Hà
    staffCode: "S002",
    teamName: "Team Sale 01",
    totalOrders: 3,
    totalSpent: 2850000,
  },
  {
    id: 1002,
    code: "KH002",
    fullName: "Trần Thị Cúc",
    phone: normalizePhone("84987111222"),
    age: 48,
    province: "Hải Phòng",
    pathology: "Mỡ máu cao, men gan tăng nhẹ",
    initialGlucose: 6.4,
    currentGlucose: 5.9,
    weeklyFeedback: "Dùng trà Mát gan + Sữa hạt Glucare thấy nhẹ bụng, dễ tiêu.",
    sourceChannel: "ZALO_PERSONAL",
    tags: ["Mỡ máu & Gan", "Tái mua lần 2"],
    staffId: 3, // S002 - Trần Thu Hà
    staffCode: "S002",
    teamName: "Team Sale 01",
    totalOrders: 2,
    totalSpent: 1680000,
  },
  {
    id: 1003,
    code: "KH003",
    fullName: "Lê Hoàng Phúc",
    phone: normalizePhone("0933.444.555"),
    age: 62,
    province: "TP. Hồ Chí Minh",
    pathology: "Tiểu đường tuýp 2 + Huyết áp cao",
    initialGlucose: 10.8,
    currentGlucose: 7.9,
    weeklyFeedback: "Đường huyết sáng lúc đói hạ ổn định, cần nhắc tái mua ngày thứ 20.",
    sourceChannel: "MAGENTO",
    tags: ["Tiểu đường Tuýp 2", "Đang dùng Combo", "Cần CSKH Đặc biệt"],
    staffId: 2, // S001 - Nguyễn Minh Tuấn (Leader)
    staffCode: "S001",
    teamName: "Team Sale 01",
    totalOrders: 4,
    totalSpent: 4200000,
  },
  {
    id: 1004,
    code: "KH004",
    fullName: "Phạm Thị Ngọc Ánh",
    phone: normalizePhone("0915 888 999"),
    age: 57,
    province: "Đà Nẵng",
    pathology: "Tiền tiểu đường, mất ngủ kinh niên",
    initialGlucose: 7.3,
    currentGlucose: 6.2,
    weeklyFeedback: "Khách đặt qua TikTok Shop, đã kết bạn Zalo CSKH 02 để theo dõi.",
    sourceChannel: "TIKTOK_SHOP",
    tags: ["Khách Mới", "TikTok GMV Max"],
    staffId: 4, // CS01 - Lê Thị Mai
    staffCode: "CS01",
    teamName: "Team Sale 01",
    totalOrders: 1,
    totalSpent: 950000,
  },
  {
    id: 1005,
    code: "KH005",
    fullName: "Đỗ Văn Bình",
    phone: normalizePhone("0972666777"),
    age: 65,
    province: "Bắc Ninh",
    pathology: "Tiểu đường tuýp 2 lâu năm, đang dùng kèm thuốc Tây",
    initialGlucose: 11.4,
    currentGlucose: 8.6,
    weeklyFeedback: "Mua tại quầy KiotViet, đồng bộ tự động về CRM để nhắc lịch đo đường huyết.",
    sourceChannel: "KIOTVIET",
    tags: ["Khách VIP", "KiotViet POS"],
    staffId: 4, // CS01 - Lê Thị Mai
    staffCode: "CS01",
    teamName: "Team Sale 01",
    totalOrders: 5,
    totalSpent: 5400000,
  },
  {
    id: 1006,
    code: "KH006",
    fullName: "Vũ Thị Thanh Hương",
    phone: normalizePhone("0948222333"),
    age: 51,
    province: "Đồng Nai",
    pathology: "Nóng trong, gan nhiễm mỡ độ 1",
    initialGlucose: 5.8,
    currentGlucose: 5.5,
    weeklyFeedback: "Đặt Combo Shopee Mall, giao thành công SPX.",
    sourceChannel: "SHOPEE",
    tags: ["Mỡ máu & Gan", "Shopee Mall"],
    staffId: 2, // S001
    staffCode: "S001",
    teamName: "Team Sale 01",
    totalOrders: 1,
    totalSpent: 790000,
  },
];

const INITIAL_ORDERS = [
  {
    id: 5001,
    orderCode: "MGT-20261102-01",
    platform: "MAGENTO",
    channelAccountId: 101,
    customerId: 1003,
    customerName: "Lê Hoàng Phúc",
    customerPhone: "0933444555",
    staffId: 2,
    staffCode: "S001",
    rawSku: "2VAD+2LON_GLUCARE",
    resolvedItems: resolveComboFormulaList("2VAD+2LON_GLUCARE", 1),
    grossAmount: 1850000,
    platformFee: 0,
    adsCostAllocated: 180000,
    cogsAmount: 740000,
    netProfit: 930000,
    status: "DELIVERED",
  },
  {
    id: 5002,
    orderCode: "FB-20261102-02",
    platform: "FACEBOOK",
    channelAccountId: 102,
    customerId: 1001,
    customerName: "Nguyễn Văn Tuấn",
    customerPhone: "0901234567",
    staffId: 3,
    staffCode: "S002",
    rawSku: "XANH03+2GOI_GLUCARE",
    resolvedItems: resolveComboFormulaList("XANH03+2GOI_GLUCARE", 1),
    grossAmount: 950000,
    platformFee: 0,
    adsCostAllocated: 140000,
    cogsAmount: 380000,
    netProfit: 430000,
    status: "DELIVERED",
  },
  {
    id: 5003,
    orderCode: "TTS-20261102-03",
    platform: "TIKTOK_SHOP",
    channelAccountId: 107,
    customerId: 1004,
    customerName: "Phạm Thị Ngọc Ánh",
    customerPhone: "0915888999",
    staffId: 4,
    staffCode: "CS01",
    rawSku: "HOP_GLUCARE+CHANHLEO",
    resolvedItems: resolveComboFormulaList("HOP_GLUCARE+CHANHLEO", 1),
    grossAmount: 950000,
    platformFee: 85500,
    adsCostAllocated: 150000,
    cogsAmount: 390000,
    netProfit: 324500,
    status: "DELIVERED",
  },
  {
    id: 5004,
    orderCode: "SPX-20261102-04",
    platform: "SHOPEE",
    channelAccountId: 108,
    customerId: 1006,
    customerName: "Vũ Thị Thanh Hương",
    customerPhone: "0948222333",
    staffId: 2,
    staffCode: "S001",
    rawSku: "2XANH+1CAM",
    resolvedItems: resolveComboFormulaList("2XANH+1CAM", 1),
    grossAmount: 790000,
    platformFee: 71100,
    adsCostAllocated: 95000,
    cogsAmount: 310000,
    netProfit: 313900,
    status: "SHIPPING",
  },
  {
    id: 5005,
    orderCode: "KV-20261102-05",
    platform: "KIOTVIET",
    channelAccountId: 109,
    customerId: 1005,
    customerName: "Đỗ Văn Bình",
    customerPhone: "0972666777",
    staffId: 4,
    staffCode: "CS01",
    rawSku: "3VAD+1LON_GLUCARE",
    resolvedItems: resolveComboFormulaList("3VAD+1LON_GLUCARE", 1),
    grossAmount: 1650000,
    platformFee: 0,
    adsCostAllocated: 0,
    cogsAmount: 680000,
    netProfit: 970000,
    status: "DELIVERED",
  },
];

// Tạo danh sách Tasks 3 màu (Đỏ - Quá hạn, Vàng - Hôm nay, Xanh - Sắp tới) giống QuanlyKH
function generateSeededCareTasks() {
  const tasks = [
    {
      id: 9001,
      customerId: 1001,
      customerName: "Nguyễn Văn Tuấn",
      customerPhone: "0901234567",
      staffId: 3,
      staffCode: "S002",
      taskType: "DAY_7",
      urgencyColor: "RED",
      urgencyLabel: "🔴 Quá hạn 2 ngày (Ưu tiên cao)",
      title: "CS Ngày 7: Đo & ghi nhận chỉ số đường huyết tuần 1 — Nguyễn Văn Tuấn",
      dueDate: "2026-10-31",
      status: "PENDING",
    },
    {
      id: 9002,
      customerId: 1002,
      customerName: "Trần Thị Cúc",
      customerPhone: "0987111222",
      staffId: 3,
      staffCode: "S002",
      taskType: "DAY_3",
      urgencyColor: "YELLOW",
      urgencyLabel: "🟡 Đến hạn hôm nay",
      title: "CS Ngày 3: Kiểm tra cảm nhận ban đầu & thói quen uống — Trần Thị Cúc",
      dueDate: "2026-11-02",
      status: "PENDING",
    },
    {
      id: 9003,
      customerId: 1003,
      customerName: "Lê Hoàng Phúc",
      customerPhone: "0933444555",
      staffId: 2,
      staffCode: "S001",
      taskType: "TWO_THIRD_USAGE",
      urgencyColor: "YELLOW",
      urgencyLabel: "🟡 Đến hạn hôm nay (Nhắc tái mua)",
      title: "CS Dùng 2/3 Liệu Trình & Nhắc Tái Mua (Ngày 20) — Lê Hoàng Phúc",
      dueDate: "2026-11-02",
      status: "PENDING",
    },
    {
      id: 9004,
      customerId: 1004,
      customerName: "Phạm Thị Ngọc Ánh",
      customerPhone: "0915888999",
      staffId: 4,
      staffCode: "CS01",
      taskType: "DAY_14",
      urgencyColor: "GREEN",
      urgencyLabel: "🟢 Lịch tuần tới",
      title: "CS Ngày 14: Đánh giá cải thiện 2 tuần & tư vấn chế độ ăn — Phạm Thị Ngọc Ánh",
      dueDate: "2026-11-09",
      status: "PENDING",
    },
    {
      id: 9005,
      customerId: 1005,
      customerName: "Đỗ Văn Bình",
      customerPhone: "0972666777",
      staffId: 4,
      staffCode: "CS01",
      taskType: "HALF_USAGE",
      urgencyColor: "GREEN",
      urgencyLabel: "🟢 Lịch tuần tới",
      title: "CS Dùng 1/2 Liệu Trình (Ngày 15) — Đỗ Văn Bình",
      dueDate: "2026-11-10",
      status: "PENDING",
    },
  ];
  return tasks;
}

let runtimeSeedState = {
  seededAt: new Date().toISOString(),
  seedCount: 1,
  customers: [...INITIAL_CUSTOMERS],
  orders: [...INITIAL_ORDERS],
  tasks: generateSeededCareTasks(),
};

export function runStage1Seed() {
  runtimeSeedState = {
    seededAt: new Date().toISOString(),
    seedCount: (runtimeSeedState.seedCount || 0) + 1,
    customers: [...INITIAL_CUSTOMERS],
    orders: [...INITIAL_ORDERS],
    tasks: generateSeededCareTasks(),
  };
  return getSeedSummary();
}

export function getSeedSummary(forStaff = null) {
  const allStaff = listAllStaff();
  const channels = listChannelAccounts();

  const visibleCustomers = forStaff
    ? filterRecordsByRbac(forStaff, runtimeSeedState.customers, "customers")
    : runtimeSeedState.customers;
  const visibleOrders = forStaff
    ? filterRecordsByRbac(forStaff, runtimeSeedState.orders, "orders")
    : runtimeSeedState.orders;
  const visibleTasks = forStaff
    ? filterRecordsByRbac(forStaff, runtimeSeedState.tasks, "tasks")
    : runtimeSeedState.tasks;

  const sampleAutoSchedule = buildCareSchedule({
    customerName: "Nguyễn Văn Tuấn",
    productName: "Combo Sữa hạt Glucare Plus + Viên An Đường",
    durationDays: 30,
  });

  return {
    seededAt: runtimeSeedState.seededAt,
    seedCount: runtimeSeedState.seedCount,
    counts: {
      staff: allStaff.length,
      channels: channels.length,
      customersTotal: runtimeSeedState.customers.length,
      customersVisible: visibleCustomers.length,
      ordersTotal: runtimeSeedState.orders.length,
      ordersVisible: visibleOrders.length,
      tasksTotal: runtimeSeedState.tasks.length,
      tasksVisible: visibleTasks.length,
      autoCareMilestonesPerOrder: sampleAutoSchedule.length,
    },
    customers: visibleCustomers,
    orders: visibleOrders,
    tasks: visibleTasks,
  };
}
