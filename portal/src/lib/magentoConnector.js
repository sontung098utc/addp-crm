import { normalizePhone, resolveCustomerIdentity } from "./customerIdentityResolver.js";
import { assignLeadToStaff } from "./leadRouting.js";
import { createOrder } from "./ordersStore.js";

/**
 * ADDP CRM — Connector Website Magento 2.4.8 (WBS-37)
 * Kế thừa cấu trúc từ C:\ADDP\CustomForm & C:\ADDP Minigame
 * Chuẩn hóa số điện thoại theo Điều 3 AGENTS.md
 */

// Cấu hình Magento 2.4.8 (Có thể override qua biến môi trường)
export const MAGENTO_CONFIG = {
  baseUrl: process.env.MAGENTO_BASE_URL || "",
  apiEndpoint: process.env.MAGENTO_API_ENDPOINT || "",
  webhookSecret: process.env.MAGENTO_WEBHOOK_SECRET || "",
  storeCode: process.env.MAGENTO_STORE_CODE || "default",
};

/**
 * Xử lý Form Lead từ module Addp_CustomForm (C:\ADDP\CustomForm)
 * Nhận: { name, phone, email, service/category, message/notes, form_id }
 */
export async function processMagentoFormSubmission(payload) {
  const rawPhone = payload.phone || payload.telephone || payload.customer_phone;
  if (!rawPhone) {
    throw new Error("Form phản hồi từ Magento thiếu số điện thoại!");
  }

  const cleanPhone = normalizePhone(rawPhone);
  const fullName = payload.name || payload.fullname || payload.customer_name || "Khách đăng ký Form Web";
  const note = payload.message || payload.notes || payload.content || "";
  const category = payload.category || payload.service || "Tư vấn dinh dưỡng tiểu đường";

  // 1. Phân bổ Sale phụ trách tự động (Lead Routing - WBS-24)
  const assignedStaff = assignLeadToStaff({
    phone: cleanPhone,
    channel: "MAGENTO_FORM",
    customerName: fullName,
  });

  // 2. Gộp & định danh Khách Hàng 360 (CustomerIdentityResolver - WBS-25)
  const customerResult = await resolveCustomerIdentity({
    phone: cleanPhone,
    fullName,
    name: fullName,
    email: payload.email || "",
    channel: "WEBSITE_MAGENTO",
    channelIdentity: `mgn_form_${Date.now()}`,
    source: `Form Website: ${category}`,
    staffId: assignedStaff?.id || 1,
    assignedStaffId: assignedStaff?.id || 1,
    assignedStaffName: assignedStaff?.name || "Trần Thu Hà",
    pathology:
      note.toLowerCase().includes("tiểu đường") || category.toLowerCase().includes("tiểu đường")
        ? "Tiểu đường tuýp 2"
        : category || "Cần tư vấn bệnh lý",
    notes: `Đăng ký từ Form ADDP.vn (${category}): "${note}"`,
  });

  return {
    success: true,
    type: "FORM_SUBMISSION",
    customer: customerResult.customer || customerResult,
    isNewCustomer: customerResult.isNew,
    assignedStaff: {
      id: customerResult.customer?.staffId || assignedStaff?.id,
      name: customerResult.customer?.staffName || assignedStaff?.name,
      code: customerResult.customer?.staffCode || assignedStaff?.code,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Xử lý Đơn Hàng mới phát sinh từ Website Magento 2.4.8
 * Nhận: { entity_id, increment_id, customer_name, customer_email, telephone, shipping_address, items, grand_total, discount_amount }
 */
export async function processMagentoOrderWebhook(payload) {
  const rawPhone =
    payload.billing_address?.telephone ||
    payload.shipping_address?.telephone ||
    payload.telephone ||
    payload.phone;

  if (!rawPhone) {
    throw new Error("Đơn hàng Magento thiếu số điện thoại khách!");
  }

  const cleanPhone = normalizePhone(rawPhone);
  const fullName =
    payload.customer_name ||
    `${payload.customer_firstname || ""} ${payload.customer_lastname || ""}`.trim() ||
    payload.shipping_address?.firstname ||
    "Khách Web Magento";

  const address =
    payload.shipping_address?.street ||
    payload.shipping_address?.full_address ||
    payload.address ||
    "";

  // Phân bổ Sale
  const assignedStaff = assignLeadToStaff({
    phone: cleanPhone,
    channel: "MAGENTO_ORDER",
    customerName: fullName,
  });

  // Chuyển đổi danh sách sản phẩm từ Magento Order Items
  const items = (payload.items || []).map((item) => ({
    id: String(item.product_id || item.item_id || item.sku),
    name: item.name || item.sku,
    sku: item.sku,
    price: Number(item.price || item.row_total || 0),
    quantity: Number(item.qty_ordered || item.qty || 1),
    subtotal: Number(item.row_total || item.price * (item.qty_ordered || 1) || 0),
  }));

  // Tạo đơn hàng tập trung trong CRM
  const totalAmount = Number(payload.subtotal || payload.grand_total || 0);
  const discount = Number(payload.discount_amount || 0);
  const finalAmount = Number(payload.grand_total || totalAmount - discount);

  const newOrder = createOrder({
    customerName: fullName,
    phone: cleanPhone,
    address,
    channel: "WEBSITE_MAGENTO",
    items: items.length > 0 ? items : [{ name: "Đơn hàng Website ADDP.vn", price: finalAmount, quantity: 1, subtotal: finalAmount }],
    totalAmount,
    discount,
    finalAmount,
    staffId: assignedStaff?.id || 1,
    staffName: assignedStaff?.name || "Trần Thu Hà",
    note: `Đơn hàng Magento: #${payload.increment_id || payload.entity_id || ""}`,
    targetPlatform: "MAGENTO",
  });

  return {
    success: true,
    type: "ORDER_CREATED",
    order: newOrder,
    assignedStaff,
    timestamp: new Date().toISOString(),
  };
}
