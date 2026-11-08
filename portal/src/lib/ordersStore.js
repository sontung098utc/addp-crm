import fs from "fs";
import path from "path";
import {
  normalizePhone,
  getAllCustomers,
  getOrCreateCustomerByPhone,
  updateCustomer,
} from "./customerIdentityResolver.js";
import { getAllCareTasks, appendOrderCareTasks } from "./careAutomation.js";
import { broadcastMessage } from "./unifiedMessageRouter.js";
import {
  createKiotVietOrder,
  deductInventoryForOrderItems,
} from "./kiotvietConnector.js";
import { resolveComboFormulaList } from "./comboResolver.js";

const ORDERS_FILE_PATH = fs.existsSync(path.join(process.cwd(), ".data"))
  ? path.join(process.cwd(), ".data", "orders.json")
  : path.join(process.cwd(), "portal", ".data", "orders.json");

function ensureStorage() {
  const dir = path.dirname(ORDERS_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function getStoredOrders() {
  ensureStorage();
  try {
    if (fs.existsSync(ORDERS_FILE_PATH)) {
      const data = fs.readFileSync(ORDERS_FILE_PATH, "utf8").replace(/^\uFEFF/, "");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.error("Lỗi đọc file orders.json:", err);
  }
  return [];
}

export function saveStoredOrders(orders) {
  ensureStorage();
  try {
    fs.writeFileSync(ORDERS_FILE_PATH, JSON.stringify(orders, null, 2), "utf8");
    return true;
  } catch (err) {
    console.error("Lỗi lưu file orders.json:", err);
    return false;
  }
}

/**
 * Tạo mới đơn hàng thực tế từ Chat (`/inbox`), màn hình Đơn hàng (`/orders`) hoặc Webhook KiotViet:
 * 1. Chuẩn hóa SĐT 10 số & Gộp/Cập nhật Hồ sơ Khách hàng 360 (Tăng totalOrders, totalSpent, gắn thẻ Đã Mua).
 * 2. Bóc tách công thức Combo (`resolveComboFormulaList`) và trừ tồn kho tự động (`deductInventoryForOrderItems`).
 * 3. Tự động sinh 7 mốc chăm sóc sau bán CarePlan (`appendOrderCareTasks`).
 */
export function createOrder({
  orderCode: customOrderCode = null,
  customerName,
  phone,
  address = "",
  channel = "ZALO_PERSONAL",
  items = [],
  totalAmount = 0,
  discount = 0,
  finalAmount = 0,
  staffId = 1,
  staffName = "Admin Quản Trị",
  note = "",
  targetPlatform = "KIOTVIET",
  branchId = 1,
  paymentMethod = "Cash",
  kiotVietOrderCode = null,
  kiotVietSyncMode = null,
  kiotVietPayload = null,
}) {
  const cleanPhone = normalizePhone(phone);
  const now = new Date();
  const dateStr = now.toISOString().slice(2, 10).replace(/-/g, "");
  const randNum = Math.floor(1000 + Math.random() * 9000);
  const orderCode = customOrderCode || `DH-${dateStr}-${randNum}`;

  // Bóc tách chi tiết Combo cho từng dòng sản phẩm
  const enrichedItems = (Array.isArray(items) ? items : []).map((it) => {
    const sku = String(it.sku || it.productCode || "");
    const qty = Math.max(1, Number(it.quantity) || 1);
    const resolvedParts = resolveComboFormulaList(sku, qty);
    return {
      ...it,
      sku,
      quantity: qty,
      resolvedParts,
    };
  });

  // Trừ tồn kho thực tế trong kiotviet_products.json
  const inventoryResult = deductInventoryForOrderItems(enrichedItems);

  const calcTotal = Number(totalAmount) || 0;
  const calcDiscount = Number(discount) || 0;
  const calcFinal =
    Number(finalAmount) || Math.max(0, calcTotal - calcDiscount);

  const newOrder = {
    id: `ord_${Date.now()}_${randNum}`,
    orderCode,
    customerName: customerName ? customerName.trim() : "Khách hàng",
    phone: cleanPhone,
    address: address.trim(),
    channel,
    items: enrichedItems,
    inventoryDeductions: inventoryResult.deductions,
    totalAmount: calcTotal,
    discount: calcDiscount,
    finalAmount: calcFinal,
    status: "CONFIRMED",
    deliveryStatus: "CHỜ_ĐÓNG_GÓI",
    paymentStatus: paymentMethod === "Cash" ? "COD" : paymentMethod,
    paymentMethod,
    branchId: Number(branchId) || 1,
    staffId: Number(staffId) || 1,
    staffName,
    note,
    targetPlatform,
    syncedKiotViet:
      Boolean(kiotVietOrderCode) ||
      targetPlatform === "KIOTVIET" ||
      targetPlatform === "ALL",
    kiotVietOrderCode: kiotVietOrderCode || null,
    kiotVietSyncMode: kiotVietSyncMode || null,
    kiotVietPayload: kiotVietPayload || null,
    syncedMagento: targetPlatform === "MAGENTO" || targetPlatform === "ALL",
    careTasksCount: 7,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  const orders = getStoredOrders();
  orders.unshift(newOrder);
  saveStoredOrders(orders);

  // Kích hoạt Engine tạo Lịch chăm sóc tự động 7 mốc (WBS-28)
  try {
    getAllCareTasks(getAllCustomers());
    const careTasks = appendOrderCareTasks(newOrder);
    newOrder.careTasksCount = careTasks.length || 7;
    broadcastMessage({
      type: "NEW_ORDER",
      order: newOrder,
      channel: newOrder.channel,
      text: `Đơn ${newOrder.orderCode} (${newOrder.customerName} - ${newOrder.phone}) đã tạo thành công & tự sinh 7 mốc chăm sóc`,
    });
  } catch (e) {
    console.error("Lỗi sinh care tasks cho đơn hàng:", e);
  }

  return newOrder;
}

/**
 * Tạo đơn hàng kèm đẩy trực tiếp sang KiotViet Open API & cập nhật Hồ sơ Khách hàng 360
 */
export async function createOrderWithKiotVietSync(input = {}) {
  const cleanPhone = normalizePhone(input.phone);

  // 1. Đồng bộ & cập nhật Hồ sơ Khách hàng 360
  if (cleanPhone) {
    try {
      const cust = await getOrCreateCustomerByPhone({
        phone: cleanPhone,
        fullName: input.customerName || "Khách hàng ADDP",
        address: input.address || "",
        source: input.channel || "ZALO_PERSONAL",
        staffId: input.staffId || 1,
      });

      if (cust && cust.id) {
        const currentTags = new Set(Array.isArray(cust.tags) ? cust.tags : []);
        for (const item of input.items || []) {
          const skuUpper = String(item.sku || item.name || "").toUpperCase();
          if (skuUpper.includes("GLUCARE") || skuUpper.includes("GLU")) {
            currentTags.add("Đã Mua Glucare Plus");
          }
          if (skuUpper.includes("DOVITAL") || skuUpper.includes("DOV")) {
            currentTags.add("Đã Mua Dovital");
          }
        }
        const finalAmt =
          Number(input.finalAmount) ||
          Math.max(0, (Number(input.totalAmount) || 0) - (Number(input.discount) || 0));

        updateCustomer(cust.id, {
          fullName: input.customerName || cust.fullName,
          address: input.address || cust.address,
          totalOrders: (Number(cust.totalOrders) || 0) + 1,
          totalSpent: (Number(cust.totalSpent) || 0) + finalAmt,
          lastOrderDate: new Date().toISOString().slice(0, 10),
          tags: Array.from(currentTags),
        });
      }
    } catch (err) {
      console.error("[ORDER_CUSTOMER_360_SYNC_ERR]", err.message);
    }
  }

  // 2. Nếu chọn đẩy sang KiotViet (KIOTVIET hoặc ALL), gọi KiotViet Connector
  let kiotResult = null;
  const targetPlatform = input.targetPlatform || "KIOTVIET";
  if (targetPlatform === "KIOTVIET" || targetPlatform === "ALL") {
    kiotResult = await createKiotVietOrder({
      branchId: input.branchId || 1,
      customer: {
        name: input.customerName || "Khách hàng ADDP",
        contactNumber: cleanPhone,
        address: input.address || "",
      },
      orderDetail: (input.items || []).map((it, idx) => ({
        productId: Number(it.kiotProductId || it.productId || 98765 + idx),
        productCode: it.sku || it.productCode || `SP-${idx + 1}`,
        quantity: Number(it.quantity) || 1,
        price: Number(it.price) || 0,
      })),
      status: 1,
      method: input.paymentMethod || "Cash",
      description:
        input.note ||
        `Đơn hàng tạo từ ADDP CRM qua ${input.channel || "Zalo/Fanpage"}`,
    });
  }

  const order = createOrder({
    ...input,
    phone: cleanPhone,
    kiotVietOrderCode: kiotResult?.kiotOrderCode || null,
    kiotVietSyncMode: kiotResult?.mode || null,
    kiotVietPayload: kiotResult?.payload || null,
  });

  return {
    order,
    kiotViet: kiotResult,
  };
}

/**
 * Cập nhật trạng thái đơn hàng (Giao thành công, Hủy, ...)
 */
export function updateOrderStatus(orderId, statusUpdate) {
  const orders = getStoredOrders();
  const idx = orders.findIndex(
    (o) => o.id === orderId || o.orderCode === orderId
  );
  if (idx === -1) return null;

  orders[idx] = {
    ...orders[idx],
    ...statusUpdate,
    updatedAt: new Date().toISOString(),
  };

  saveStoredOrders(orders);

  if (orders[idx].status === "DELIVERED") {
    try {
      getAllCareTasks(getAllCustomers());
      appendOrderCareTasks(orders[idx]);
    } catch {}
  }

  return orders[idx];
}
