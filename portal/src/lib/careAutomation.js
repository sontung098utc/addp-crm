/**
 * ADDP Omnichannel AI CRM - Care Plan Automation Helper (WBS-03 & WBS-28)
 * Kế thừa từ C:\QuanlyKH\src\lib\automation.js
 * Tự động tạo lộ trình chăm sóc sau mua hàng:
 * - DAY_1, DAY_3, DAY_7, DAY_14, DAY_21
 * - HALF_USAGE (Dùng được 1/2 liệu trình), TWO_THIRD_USAGE (Dùng được 2/3 liệu trình - nhắc tái mua)
 */

function getServerFs() {
  if (typeof window !== "undefined") return null;
  try {
    return { fs: eval("require")("fs"), path: eval("require")("path") };
  } catch {
    return null;
  }
}

function getCareTasksFilePath() {
  const mods = getServerFs();
  if (!mods) return null;
  const { fs, path } = mods;
  const dataDir =
    process.env.DATA_DIR ||
    (fs.existsSync(path.join(process.cwd(), "portal", "package.json"))
      ? "portal/.data"
      : ".data");
  return path.isAbsolute(dataDir)
    ? path.join(dataDir, "care_tasks.json")
    : path.join(process.cwd(), dataDir, "care_tasks.json");
}

export const CARE_MILESTONES = [
  {
    type: "DAY_1",
    offsetDays: 1,
    title: "CS Ngày 1: Xác nhận nhận hàng & hướng dẫn sử dụng chuẩn",
    script:
      "Chào {fullName}, đơn hàng {productName} đã giao thành công. Em xin phép hướng dẫn anh/chị cách dùng đúng liều lượng để đạt hiệu quả tốt nhất ạ.",
  },
  {
    type: "DAY_3",
    offsetDays: 3,
    title: "CS Ngày 3: Kiểm tra cảm nhận ban đầu & thói quen uống",
    script:
      "Chào {fullName}, sau 3 ngày sử dụng {productName}, cơ thể mình có dễ chịu và ngủ ngon hơn không ạ? Anh/chị nhớ duy trì uống đúng giờ nhé!",
  },
  {
    type: "DAY_7",
    offsetDays: 7,
    title: "CS Ngày 7: Đo & ghi nhận chỉ số đường huyết tuần 1",
    script:
      "Chào {fullName}, tròn 1 tuần mình dùng {productName} rồi ạ. Sáng nay anh/chị đo đường huyết lúc đói được bao nhiêu mmol/L để em cập nhật vào hồ sơ theo dõi cho mình nhé!",
  },
  {
    type: "DAY_14",
    offsetDays: 14,
    title: "CS Ngày 14: Đánh giá cải thiện 2 tuần & tư vấn chế độ ăn",
    script:
      "Chào {fullName}, qua 2 tuần dùng {productName}, chỉ số đường huyết và tình trạng tiểu đêm/mệt mỏi của mình đã giảm rõ rệt chưa ạ?",
  },
  {
    type: "DAY_21",
    offsetDays: 21,
    title: "CS Ngày 21: Kiểm tra tuân thủ liệu trình 3 tuần",
    script:
      "Chào {fullName}, anh/chị đã đi được 3 tuần liệu trình {productName}. Giai đoạn này rất quan trọng để ổn định bền vững, mình cố gắng dùng đều đặn mỗi ngày nhé!",
  },
];

/**
 * Ước lượng số ngày sử dụng theo tên sản phẩm / SKU và số lượng.
 * - Sữa hạt Glucare Plus lon 800g/850g/900g ~ 15 ngày/lon
 * - Sữa hạt Glucare Plus hộp 400g ~ 8 ngày/hộp
 * - Viên An Đường ~ 30 ngày/hộp
 * - Sủi Dovital ~ 20 ngày/tuýp (Dovital hộp 60 viên ~ 30 ngày/hộp)
 */
export function estimateUsageDays(productName = "", quantity = 1) {
  const qty = Math.max(1, Number(quantity) || 1);
  const raw = String(productName || "").toLowerCase();

  // Sủi Dovital
  if (raw.includes("dovital") || raw.includes("dov")) {
    if (raw.includes("60v") || raw.includes("60 viên") || (raw.includes("hộp") && !raw.includes("sủi"))) {
      return 30 * qty;
    }
    return 20 * qty;
  }

  // Viên An Đường
  if (raw.includes("an đường") || raw.includes("an duong") || raw.includes("vad")) {
    return 30 * qty;
  }

  // Sữa hạt Glucare Plus / Glusure
  if (raw.includes("glucare") || raw.includes("glusure") || raw.includes("glu")) {
    if (raw.includes("400g") || raw.includes("400 g") || (raw.includes("hộp") && !raw.includes("800") && !raw.includes("850") && !raw.includes("900"))) {
      return 8 * qty;
    }
    if (raw.includes("gói lẻ") || raw.includes("goiglucare")) {
      return Math.max(1, qty);
    }
    return 15 * qty;
  }

  return 30 * qty;
}

export function buildCareSchedule({
  customerName = "Anh/Chị",
  productName = "Sữa hạt tiểu đường Glucare Plus",
  quantity = 1,
  startDate = new Date(),
  durationDays,
} = {}) {
  const baseDate = new Date(startDate);
  const resolvedDuration =
    durationDays !== undefined && durationDays !== null && durationDays !== ""
      ? Number(durationDays)
      : estimateUsageDays(productName, quantity);
  const totalDays = Math.max(7, Number(resolvedDuration) || 30);

  const addDays = (days) => {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const formatMsg = (tpl) =>
    tpl
      .replace(/\{fullName\}/g, customerName)
      .replace(/\{productName\}/g, productName);

  const tasks = CARE_MILESTONES.filter((m) => m.offsetDays <= totalDays).map((m) => ({
    type: m.type,
    title: `${m.title} — ${customerName}`,
    offsetDays: m.offsetDays,
    dueDate: addDays(m.offsetDays),
    suggestedMessage: formatMsg(m.script),
  }));

  const halfDay = Math.round(totalDays / 2);
  if (halfDay > 3 && !tasks.some((t) => t.offsetDays === halfDay)) {
    tasks.push({
      type: "HALF_USAGE",
      title: `CS Dùng 1/2 Liệu Trình (Ngày ${halfDay}) — ${customerName}`,
      offsetDays: halfDay,
      dueDate: addDays(halfDay),
      suggestedMessage: formatMsg(
        "Chào {fullName}, mình đã dùng được khoảng 1/2 liệu trình {productName}. Em nhắn hỏi thăm xem lượng sản phẩm còn lại có khớp với số ngày dùng không ạ?"
      ),
    });
  }

  const twoThirdDay = Math.round((totalDays * 2) / 3);
  if (twoThirdDay > 5) {
    tasks.push({
      type: "TWO_THIRD_USAGE",
      title: `CS Dùng 2/3 Liệu Trình & Nhắc Tái Mua (Ngày ${twoThirdDay}) — ${customerName}`,
      offsetDays: twoThirdDay,
      dueDate: addDays(twoThirdDay),
      suggestedMessage: formatMsg(
        "Chào {fullName}, liệu trình {productName} của mình đã dùng được 2/3 chặng đường rồi ạ. Để không bị ngắt quãng hiệu quả ổn định đường huyết, em hỗ trợ anh/chị đặt trước liệu trình tiếp theo kèm ưu đãi khách thân thiết nhé!"
      ),
    });
  }

  return tasks.sort((a, b) => a.offsetDays - b.offsetDays);
}

function loadCareTasksFromDisk() {
  try {
    const mods = getServerFs();
    const filePath = getCareTasksFilePath();
    if (mods && filePath && mods.fs.existsSync(filePath)) {
      const parsed = JSON.parse(mods.fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function writeCareTasksToDisk(tasks) {
  try {
    const mods = getServerFs();
    const filePath = getCareTasksFilePath();
    if (!mods || !filePath) return;
    mods.fs.mkdirSync(mods.path.dirname(filePath), { recursive: true });
    mods.fs.writeFileSync(filePath, JSON.stringify(tasks, null, 2), "utf8");
  } catch {}
}

export function getAllCareTasks() {
  if (!globalThis.__addpCareTasksLoaded) {
    globalThis.__addpCareTasksStore = loadCareTasksFromDisk();
    globalThis.__addpCareTasksLoaded = true;
  }
  return globalThis.__addpCareTasksStore || [];
}

export function savePersistedTasks(tasks) {
  globalThis.__addpCareTasksStore = Array.isArray(tasks) ? tasks : [];
  globalThis.__addpCareTasksLoaded = true;
  writeCareTasksToDisk(globalThis.__addpCareTasksStore);
  return true;
}

export function appendOrderCareTasks(order = {}) {
  const store = getAllCareTasks();
  if (order?.isDuplicate) {
    return store.filter((t) => t.orderCode === order.orderCode);
  }
  const firstItem = Array.isArray(order.items) && order.items[0] ? order.items[0] : null;
  const totalEstimatedDays =
    Array.isArray(order.items) && order.items.length > 0
      ? order.items.reduce(
          (sum, it) =>
            sum + estimateUsageDays(it.name || it.sku || "", it.quantity || 1),
          0
        )
      : undefined;

  const schedule = buildCareSchedule({
    customerName: order.customerName || "Anh/Chị",
    productName: firstItem?.name || "Sữa hạt Glucare Plus",
    quantity: firstItem?.quantity || 1,
    startDate: order.createdAt || new Date(),
    ...(order.durationDays !== undefined && order.durationDays !== null
      ? { durationDays: order.durationDays }
      : totalEstimatedDays !== undefined
      ? { durationDays: totalEstimatedDays }
      : {}),
  });

  const orderTag = order.orderCode || order.id || Date.now();
  const createdTasks = [];

  schedule.forEach((item, idx) => {
    const taskId = `task_${orderTag}_${item.type}`;
    if (store.some((t) => t.id === taskId)) return;

    const deadlineStr =
      idx === 0 ? new Date().toISOString().slice(0, 10) : item.dueDate;

    const newTask = {
      id: taskId,
      customerId: order.customerId || order.phone || orderTag,
      customerName: order.customerName || "Khách hàng",
      customerPhone: order.phone || "",
      customerPathology:
        order.pathology || "Đơn hàng mới: " + (order.orderCode || ""),
      customerGlucose: null,
      staffId: Number(order.staffId) || 1,
      staffName: order.staffName || "Admin Quản Trị",
      taskType: item.type,
      title: item.title,
      deadline: deadlineStr,
      suggestedMessage: item.suggestedMessage,
      isCompleted: false,
      completedAt: null,
      resultNote: null,
      carePath: "Đang chăm sóc",
      channel: order.channel || "ZALO_PERSONAL",
      orderCode: order.orderCode || null,
    };

    store.unshift(newTask);
    createdTasks.push(newTask);
  });

  if (createdTasks.length > 0) {
    writeCareTasksToDisk(store);
  }
  return createdTasks;
}

export function generateCareTasks(params = {}) {
  if (params && (params.orderCode || params.id)) {
    appendOrderCareTasks(params);
  }
  return buildCareSchedule(params);
}
