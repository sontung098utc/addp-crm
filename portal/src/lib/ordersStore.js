import fs from "fs";
import path from "path";
import { normalizePhone } from "./customerIdentityResolver.js";
import { generateCareTasks } from "./careAutomation.js";

const ORDERS_FILE_PATH = path.join(process.cwd(), ".data", "orders.json");

// Đảm bảo thư mục lưu trữ tồn tại
function ensureStorage() {
  const dir = path.dirname(ORDERS_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Đọc danh sách đơn hàng đã lưu thực tế
export function getStoredOrders() {
  ensureStorage();
  try {
    if (fs.existsSync(ORDERS_FILE_PATH)) {
      const data = fs.readFileSync(ORDERS_FILE_PATH, "utf8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Lỗi đọc file orders.json:", err);
  }
  return [];
}

// Lưu danh sách đơn hàng thực tế
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
 * Tạo mới đơn hàng thực tế từ Chat / Webhook / KiotViet
 */
export function createOrder({
  customerName,
  phone,
  address = "",
  channel = "ZALO_PERSONAL",
  items = [],
  totalAmount = 0,
  discount = 0,
  finalAmount = 0,
  staffId = 1,
  staffName = "Trần Thu Hà",
  note = "",
  targetPlatform = "KIOTVIET",
}) {
  const cleanPhone = normalizePhone(phone);
  const now = new Date();
  const dateStr = now.toISOString().slice(2, 10).replace(/-/g, "");
  const randNum = Math.floor(1000 + Math.random() * 9000);
  const orderCode = `DH-${dateStr}-${randNum}`;

  const newOrder = {
    id: `ord_${Date.now()}_${randNum}`,
    orderCode,
    customerName: customerName ? customerName.trim() : "Khách hàng",
    phone: cleanPhone,
    address: address.trim(),
    channel,
    items,
    totalAmount: Number(totalAmount) || 0,
    discount: Number(discount) || 0,
    finalAmount: Number(finalAmount) || Number(totalAmount) - (Number(discount) || 0),
    status: "CONFIRMED", // Mặc định vừa chốt
    deliveryStatus: "CHỜ_ĐÓNG_GÓI",
    paymentStatus: "COD",
    staffId: Number(staffId) || 1,
    staffName,
    note,
    targetPlatform,
    syncedKiotViet: targetPlatform === "KIOTVIET" || targetPlatform === "ALL",
    syncedMagento: targetPlatform === "MAGENTO" || targetPlatform === "ALL",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  const orders = getStoredOrders();
  orders.unshift(newOrder);
  saveStoredOrders(orders);

  // Kích hoạt Engine tạo Lịch chăm sóc tự động (WBS-28)
  try {
    generateCareTasks({
      id: newOrder.id,
      customerName: newOrder.customerName,
      phone: newOrder.phone,
      staffId: newOrder.staffId,
      orderCode: newOrder.orderCode,
      createdAt: newOrder.createdAt,
    });
  } catch (e) {
    console.error("Lỗi sinh care tasks cho đơn hàng:", e);
  }

  return newOrder;
}

/**
 * Cập nhật trạng thái đơn hàng (Giao thành công, Hủy, ...)
 */
export function updateOrderStatus(orderId, statusUpdate) {
  const orders = getStoredOrders();
  const idx = orders.findIndex((o) => o.id === orderId || o.orderCode === orderId);
  if (idx === -1) return null;

  orders[idx] = {
    ...orders[idx],
    ...statusUpdate,
    updatedAt: new Date().toISOString(),
  };

  saveStoredOrders(orders);
  return orders[idx];
}
