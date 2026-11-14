import fs from "fs";
import path from "path";
import { normalizePhone } from "./phone.js";
import { resolveComboFormulaList } from "./comboResolver.js";
import { getStoredOrders, upsertStoredOrders } from "./ordersStore.js";
import {
  getAllCustomers,
  getOrCreateCustomerByPhone,
  updateCustomer,
} from "./customerIdentityResolver.js";
import { getAllCareTasks, appendOrderCareTasks } from "./careAutomation.js";
import { broadcastMessage } from "./unifiedMessageRouter.js";
import { getKiotVietConfig, saveKiotVietConfig } from "./kiotvietConnector.js";
import { isSafePilotMode, isAutoSyncAllowed } from "./pilotConfig.js";

/**
 * ADDP Omnichannel AI CRM — KiotViet 2-Way Sync Engine (WBS-39 & WBS-40)
 * Đồng bộ toàn bộ Đơn Đặt Hàng (Orders) & Hóa Đơn (Invoices) từ KiotViet về CRM.
 * Tự động đăng ký Webhook và cập nhật Hồ Sơ Khách Hàng 360.
 */

const KIOTVIET_TOKEN_URL = "https://id.kiotviet.vn/connect/token";
const KIOTVIET_API_BASE = "https://public.kiotapi.com";

// Cache in-memory cho token và tra cứu SĐT khách hàng
if (!globalThis.__KIOTVIET_SYNC_CACHE__) {
  globalThis.__KIOTVIET_SYNC_CACHE__ = {
    token: null,
    expiresAt: 0,
    customerPhoneMap: new Map(),
    isSyncing: false,
    lastSyncTime: 0,
  };
}

const syncCache = globalThis.__KIOTVIET_SYNC_CACHE__;

export async function getKiotVietSyncToken(forceRefresh = false) {
  const now = Date.now();
  if (
    !forceRefresh &&
    syncCache.token &&
    syncCache.expiresAt - now > 5 * 60 * 1000
  ) {
    return { ok: true, token: syncCache.token };
  }

  const cfg = getKiotVietConfig();
  const clientId = cfg.clientId || process.env.KIOTVIET_CLIENT_ID || "";
  const clientSecret = cfg.clientSecret || process.env.KIOTVIET_CLIENT_SECRET || "";
  const retailer = cfg.retailer || process.env.KIOTVIET_RETAILER || "";

  if (!clientId || !clientSecret || !retailer) {
    return {
      ok: false,
      error: "[SECURITY_CONFIG_ERROR] Chưa cấu hình KiotViet Client ID, Client Secret hoặc Retailer trong biến môi trường (Fail closed).",
    };
  }

  try {
    const params = new URLSearchParams({
      scopes: "PublicApi.Access",
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    });

    const res = await fetch(KIOTVIET_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "ADDP-CRM/1.0",
      },
      body: params.toString(),
      signal: AbortSignal.timeout(12000),
    });

    const data = await res.json();
    if (!res.ok || !data.access_token) {
      return {
        ok: false,
        error: data.error_description || data.error || `Lỗi token KiotViet (${res.status})`,
      };
    }

    const expiresIn = Number(data.expires_in) || 86400;
    syncCache.token = data.access_token;
    syncCache.expiresAt = now + expiresIn * 1000;

    saveKiotVietConfig({
      clientId,
      clientSecret,
      retailer,
      accessToken: data.access_token,
      tokenExpiresAt: syncCache.expiresAt,
    });

    return { ok: true, token: data.access_token, retailer };
  } catch (err) {
    return { ok: false, error: `Kết nối KiotViet thất bại: ${err.message}` };
  }
}

/**
 * Tra cứu số điện thoại khách hàng từ KiotViet nếu payload đơn hàng bị khuyết
 */
export async function resolveKiotVietCustomerPhone(customerId, token, retailer) {
  if (!customerId) return "";
  const strId = String(customerId);
  if (syncCache.customerPhoneMap.has(strId)) {
    return syncCache.customerPhoneMap.get(strId);
  }

  try {
    const res = await fetch(`${KIOTVIET_API_BASE}/customers/${strId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Retailer: retailer,
        "User-Agent": "ADDP-CRM/1.0",
      },
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    const phone = normalizePhone(data?.contactNumber || data?.mobilePhone || "");
    if (phone) {
      syncCache.customerPhoneMap.set(strId, phone);
      return phone;
    }
  } catch {}

  syncCache.customerPhoneMap.set(strId, "");
  return "";
}

/**
 * Map hóa đơn hoặc đơn hàng từ KiotViet sang chuẩn Order của CRM
 */
function mapKiotVietItemToCrmOrder(item, type = "INVOICE", resolvedPhone = "") {
  const code = String(item.code || "");
  const rawPhone =
    item.contactNumber ||
    item.orderDelivery?.contactNumber ||
    item.invoiceDelivery?.contactNumber ||
    item.customer?.contactNumber ||
    resolvedPhone ||
    "";
  const phone = normalizePhone(rawPhone);

  const rawDetails = item.invoiceDetails || item.orderDetails || [];
  const items = rawDetails.map((d, idx) => {
    const sku = String(d.productCode || d.code || `SP-${idx + 1}`).trim();
    const qty = Math.max(1, Number(d.quantity) || 1);
    const price = Number(d.price) || 0;
    const subtotal = Number(d.subTotal) || price * qty;
    const resolvedParts = resolveComboFormulaList(sku, qty);
    return {
      sku,
      productCode: sku,
      name: d.productName || sku,
      quantity: qty,
      price,
      subtotal,
      discount: Number(d.discount) || 0,
      resolvedParts,
    };
  });

  const totalAmount = Number(item.total || item.totalPayment || 0);
  const discount = Number(item.discount || 0);
  const finalAmount = Number(item.totalPayment || totalAmount - discount || 0);

  // Ánh xạ trạng thái chuẩn CRM (Đang xử lý / Đang giao hàng / Hoàn thành / Đã hủy)
  let status = "CONFIRMED";
  let deliveryStatus = "CHỜ_ĐÓNG_GÓI";
  const statusVal = String(item.statusValue || "").trim().toLowerCase();
  if (type === "INVOICE") {
    // Invoice status: 1: Hoàn thành / Giao thành công, 2: Đã hủy, 3: Đang xử lý
    if (item.status === 1 || statusVal === "hoàn thành" || statusVal === "đã giao") {
      status = "DELIVERED";
      deliveryStatus = "GIAO_THÀNH_CÔNG";
    } else if (item.status === 2 || statusVal === "đã hủy") {
      status = "CANCELLED";
      deliveryStatus = "ĐÃ_HỦY";
    } else if (item.status === 3 || statusVal.includes("đang xử lý")) {
      status = "CONFIRMED";
      deliveryStatus = "ĐANG_XỬ_LÝ";
    }
  } else {
    // Order status: 1: Phiếu tạm / Chưa xử lý, 2: Đang giao, 3: Hoàn thành, 4: Đã hủy
    if (
      item.status === 3 ||
      statusVal === "đã giao hàng" ||
      statusVal === "đã giao" ||
      statusVal === "hoàn thành"
    ) {
      status = "DELIVERED";
      deliveryStatus = "GIAO_THÀNH_CÔNG";
    } else if (
      item.status === 2 ||
      statusVal === "đang giao" ||
      statusVal === "đang giao hàng"
    ) {
      status = "SHIPPING";
      deliveryStatus = "ĐANG_VẬN_CHUYỂN";
    } else if (item.status === 4 || statusVal === "đã hủy") {
      status = "CANCELLED";
      deliveryStatus = "ĐÃ_HỦY";
    }
  }

  // Bổ sung đối chiếu trạng thái giao vận (orderDelivery / invoiceDelivery) nếu chưa hoàn tất/hủy
  const deliveryObj = item.invoiceDelivery || item.orderDelivery;
  if (deliveryObj && status !== "DELIVERED" && status !== "CANCELLED") {
    const delivVal = String(deliveryObj.statusValue || "").trim().toLowerCase();
    if (deliveryObj.status === 3 || delivVal.includes("đã giao") || delivVal.includes("hoàn thành")) {
      status = "DELIVERED";
      deliveryStatus = "GIAO_THÀNH_CÔNG";
    } else if (deliveryObj.status === 2 || delivVal.includes("đang giao")) {
      status = "SHIPPING";
      deliveryStatus = "ĐANG_VẬN_CHUYỂN";
    } else if (deliveryObj.status === 4 || deliveryObj.status === 5 || delivVal.includes("hủy") || delivVal.includes("chuyển hoàn")) {
      status = "CANCELLED";
      deliveryStatus = "ĐÃ_HỦY";
    }
  }

  const paymentMethod =
    Array.isArray(item.payments) && item.payments.length > 0
      ? item.payments[0].method || "Tiền mặt"
      : "Tiền mặt";

  const address =
    item.invoiceDelivery?.address ||
    item.orderDelivery?.address ||
    item.customer?.address ||
    item.customerAddress ||
    "";

  const createdAt = item.createdDate || item.purchaseDate || new Date().toISOString();
  const updatedAt = item.modifiedDate || createdAt;

  return {
    id: `kiot_${code}`,
    orderCode: code,
    kiotVietOrderCode: code,
    kiotVietId: item.id,
    kiotType: type,
    customerName: String(item.customerName || "Khách Hàng KiotViet").trim(),
    customerCode: item.customerCode || "",
    phone,
    address,
    channel: "KIOTVIET",
    items,
    totalAmount,
    discount,
    finalAmount,
    status,
    deliveryStatus,
    paymentStatus: status === "DELIVERED" ? "PAID" : "COD",
    paymentMethod,
    branchId: Number(item.branchId || 272142),
    branchName: item.branchName || "Chi nhánh trung tâm",
    soldByName: item.soldByName || "Nhân viên KiotViet",
    saleChannelName: item.saleChannelName || "Bán trực tiếp KiotViet",
    note: item.description || "",
    syncedKiotViet: true,
    kiotVietPayload: item,
    careTasksCount: 7,
    createdAt,
    updatedAt,
  };
}

/**
 * Tính toán tổng hợp đơn hàng (Tổng chi tiêu, Số đơn, Tỷ lệ nhận hàng) theo SĐT chuẩn hóa
 */
export function calculateOrderSummaryForPhone(orders = [], rawPhone = "") {
  const normPhone = normalizePhone(rawPhone);
  const matched = normPhone
    ? (Array.isArray(orders) ? orders : []).filter(
        (o) => normalizePhone(o.phone) === normPhone
      )
    : Array.isArray(orders)
    ? orders
    : [];

  const activeOrders = matched.filter((o) => o.status !== "CANCELLED");
  const totalOrders = activeOrders.length;
  const totalSpent = activeOrders.reduce(
    (sum, o) => sum + Number(o.finalAmount ?? o.totalAmount ?? 0),
    0
  );
  const deliveredCount = matched.filter((o) => o.status === "DELIVERED").length;
  const cancelledCount = matched.filter((o) => o.status === "CANCELLED").length;
  const terminalCount = deliveredCount + cancelledCount;
  const deliveryRate =
    matched.length === 0
      ? "0%"
      : terminalCount === 0
      ? "100%"
      : `${Math.round((deliveredCount / terminalCount) * 100)}%`;

  return {
    totalOrders,
    totalSpent,
    deliveredCount,
    cancelledCount,
    deliveryRate,
  };
}

/**
 * Tự động sinh Lịch Chăm Sóc (Ngày 1, 3, 7, 14, 21, 1/2, 2/3) cho các đơn hàng đã Hoàn thành / Đã giao
 */
export function triggerCareScheduleForDeliveredOrders(orders = []) {
  let createdCount = 0;
  try {
    getAllCareTasks(getAllCustomers());
    for (const order of orders) {
      if (order && order.status === "DELIVERED") {
        const created = appendOrderCareTasks({
          ...order,
          channel: order.channel || "KIOTVIET",
        });
        if (Array.isArray(created)) {
          createdCount += created.length;
        }
      }
    }
  } catch (err) {
    console.warn("[KIOTVIET_CARE_SCHEDULE_WARN]", err?.message || err);
  }
  return createdCount;
}

/**
 * Cập nhật số liệu chi tiêu & số đơn của Khách Hàng 360 (không cộng dồn trùng lặp)
 */
async function updateCustomer360ForOrder(order, allOrders = null) {
  if (!order.phone) return;
  try {
    const cust = await getOrCreateCustomerByPhone({
      phone: order.phone,
      fullName: order.customerName,
      address: order.address,
      source: "KIOTVIET",
      note: `Khách hàng KiotViet (Đơn ${order.orderCode})`,
    });

    if (cust && cust.id) {
      const currentTags = new Set(Array.isArray(cust.tags) ? cust.tags : []);
      currentTags.add("Đã Mua");
      currentTags.add("KiotViet");

      for (const it of order.items || []) {
        const skuUpper = String(it.sku || it.name || "").toUpperCase();
        if (skuUpper.includes("GLUCARE") || skuUpper.includes("GLU")) {
          currentTags.add("Đã Mua Glucare Plus");
        }
        if (skuUpper.includes("DOVITAL") || skuUpper.includes("DOV")) {
          currentTags.add("Đã Mua Dovital");
        }
      }

      const ordersSource = Array.isArray(allOrders) ? allOrders : getStoredOrders();
      const summary = calculateOrderSummaryForPhone(ordersSource, order.phone);

      updateCustomer(cust.id, {
        fullName: order.customerName || cust.fullName,
        address: order.address || cust.address,
        totalOrders: Math.max(summary.totalOrders, 1),
        totalSpent: summary.totalSpent,
        deliveryRate: summary.deliveryRate,
        lastOrderDate: (order.createdAt || new Date().toISOString()).slice(0, 10),
        tags: Array.from(currentTags),
      });
    }
  } catch (err) {
    console.warn("[CUSTOMER_360_UPDATE_WARN]", err.message);
  }
}

/**
 * Kéo toàn bộ hoặc đơn mới từ KiotViet Open API
 */
export async function syncAllKiotVietOrders({
  mode = "all",
  lastModifiedFrom = null,
  maxPages = 30, // Tối đa 30 trang x 100 = 3000 đơn mỗi lần chạy để đảm bảo tốc độ
} = {}) {
  if (isSafePilotMode() || !isAutoSyncAllowed()) {
    return {
      ok: false,
      error: "[PILOT_SAFE_MODE] Đã chặn đồng bộ trực tiếp KiotViet trong môi trường safe-mode / staging.",
    };
  }

  if (syncCache.isSyncing) {
    return { ok: false, error: "Đang có tiến trình đồng bộ KiotViet chạy nền. Vui lòng chờ..." };
  }

  syncCache.isSyncing = true;
  const startTime = Date.now();

  try {
    const tokenRes = await getKiotVietSyncToken();
    if (!tokenRes.ok) {
      syncCache.isSyncing = false;
      return { ok: false, error: tokenRes.error };
    }

    const token = tokenRes.token;
    const cfg = getKiotVietConfig();
    const retailer = cfg.retailer || "0904637007";

    const mappedOrders = [];
    let syncedInvoicesCount = 0;
    let syncedOrdersCount = 0;

    // 1. Kéo HÓA ĐƠN (Invoices - Bán lẻ thực tế)
    let currentItem = 0;
    const pageSize = 100;
    let hasMore = true;
    let pageCount = 0;

    while (hasMore && pageCount < maxPages) {
      pageCount++;
      let url = `${KIOTVIET_API_BASE}/invoices?pageSize=${pageSize}&currentItem=${currentItem}&orderBy=createdDate&orderDirection=Desc&includeInvoiceDelivery=true`;
      if (lastModifiedFrom) {
        url += `&lastModifiedFrom=${encodeURIComponent(lastModifiedFrom)}`;
      }

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Retailer: retailer,
          "User-Agent": "ADDP-CRM/1.0",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) break;
      const data = await res.json();
      const list = data?.data || [];
      if (list.length === 0) break;

      for (const inv of list) {
        let phone =
          inv.contactNumber ||
          inv.invoiceDelivery?.contactNumber ||
          inv.customer?.contactNumber ||
          "";
        if (!phone && inv.customerId && pageCount <= 5) {
          phone = await resolveKiotVietCustomerPhone(inv.customerId, token, retailer);
        }
        const mapped = mapKiotVietItemToCrmOrder(inv, "INVOICE", phone);
        mappedOrders.push(mapped);
        syncedInvoicesCount++;
      }

      currentItem += pageSize;
      if (list.length < pageSize || (data.total && currentItem >= data.total)) {
        hasMore = false;
      }
    }

    // 2. Kéo ĐƠN ĐẶT HÀNG (Orders - Đặt hàng trước)
    currentItem = 0;
    hasMore = true;
    pageCount = 0;

    while (hasMore && pageCount < maxPages) {
      pageCount++;
      let url = `${KIOTVIET_API_BASE}/orders?pageSize=${pageSize}&currentItem=${currentItem}&orderBy=createdDate&orderDirection=Desc&includeOrderDelivery=true`;
      if (lastModifiedFrom) {
        url += `&lastModifiedFrom=${encodeURIComponent(lastModifiedFrom)}`;
      }

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Retailer: retailer,
          "User-Agent": "ADDP-CRM/1.0",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) break;
      const data = await res.json();
      const list = data?.data || [];
      if (list.length === 0) break;

      for (const ord of list) {
        let phone =
          ord.contactNumber ||
          ord.orderDelivery?.contactNumber ||
          ord.customer?.contactNumber ||
          "";
        if (!phone && ord.customerId && pageCount <= 5) {
          phone = await resolveKiotVietCustomerPhone(ord.customerId, token, retailer);
        }
        const mapped = mapKiotVietItemToCrmOrder(ord, "ORDER", phone);
        mappedOrders.push(mapped);
        syncedOrdersCount++;
      }

      currentItem += pageSize;
      if (list.length < pageSize || (data.total && currentItem >= data.total)) {
        hasMore = false;
      }
    }

    // 3. Upsert vào bộ nhớ và file orders.json
    const allStored = upsertStoredOrders(mappedOrders);

    // 4. Tự động sinh Lịch Chăm Sóc (Ngày 1, 3, 7, 14, 21) cho đơn Hoàn thành / Đã giao
    const careTasksCreated = triggerCareScheduleForDeliveredOrders(mappedOrders);

    // 5. Cập nhật hồ sơ khách hàng 360 cho các đơn mới (chạy nền)
    setTimeout(() => {
      for (const o of mappedOrders) {
        updateCustomer360ForOrder(o, allStored);
      }
    }, 100);

    // 6. Cập nhật thời điểm đồng bộ
    const nowIso = new Date().toISOString();
    syncCache.lastSyncTime = Date.now();
    saveKiotVietConfig({
      lastSyncedAt: nowIso,
    });

    // 7. Phát SSE cập nhật giao diện thời gian thực
    broadcastMessage({
      type: "KIOTVIET_SYNC_SUCCESS",
      count: mappedOrders.length,
      syncedInvoicesCount,
      syncedOrdersCount,
      careTasksCreated,
      timestamp: nowIso,
    });

    return {
      ok: true,
      syncedCount: mappedOrders.length,
      syncedInvoicesCount,
      syncedOrdersCount,
      careTasksCreated,
      totalOrders: allStored.length,
      durationMs: Date.now() - startTime,
      message: `Đã đồng bộ thành công ${mappedOrders.length} đơn hàng & hóa đơn từ KiotViet (${syncedInvoicesCount} hóa đơn, ${syncedOrdersCount} đơn đặt hàng)${careTasksCreated > 0 ? `, tạo ${careTasksCreated} lịch chăm sóc mới` : ""}!`,
    };
  } catch (err) {
    console.error("[KIOTVIET_SYNC_EXCEPTION]", err);
    return { ok: false, error: `Lỗi đồng bộ KiotViet: ${err.message}` };
  } finally {
    syncCache.isSyncing = false;
  }
}

/**
 * Đăng ký Webhook KiotViet tự động cho order.update, invoice.add, invoice.update
 */
export async function registerKiotVietWebhooks(targetUrl = null) {
  const defaultBase =
    process.env.APP_URL ||
    (process.env.APP_ENV === "staging"
      ? `http://localhost:${process.env.PORT || 3006}`
      : (process.env.NEXT_PUBLIC_SITE_URL || "https://crm.addp.vn"));
  const finalUrl = targetUrl || `${defaultBase.replace(/\/$/, "")}/api/webhooks/kiotviet`;

  if (isSafePilotMode() || !isAutoSyncAllowed()) {
    return {
      ok: true,
      disabled: true,
      targetUrl: finalUrl,
      message: "[PILOT_SAFE_MODE] Đã chặn đăng ký webhook KiotViet ra ngoài trong môi trường safe-mode / staging.",
    };
  }

  const tokenRes = await getKiotVietSyncToken();
  if (!tokenRes.ok) return { ok: false, error: tokenRes.error };

  const token = tokenRes.token;
  const cfg = getKiotVietConfig();
  const retailer = cfg.retailer || "0904637007";

  const eventTypes = ["order.update", "invoice.add", "invoice.update"];
  const results = [];

  for (const type of eventTypes) {
    try {
      const res = await fetch(`${KIOTVIET_API_BASE}/webhooks`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Retailer: retailer,
          "Content-Type": "application/json",
          "User-Agent": "ADDP-CRM/1.0",
        },
        body: JSON.stringify({
          Webhook: {
            Url: finalUrl,
            IsActive: true,
            Type: type,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      results.push({ type, status: res.status, data });
    } catch (err) {
      results.push({ type, error: err.message });
    }
  }

  return { ok: true, webhooks: results, targetUrl: finalUrl };
}

/**
 * Đồng bộ đơn hàng & hóa đơn KiotViet theo SĐT khách hàng cụ thể (dùng cho nút "Đồng bộ KiotViet" ở Inbox / Hồ sơ 360)
 * - Chuẩn hóa SĐT 10 số qua normalizePhone()
 * - Kéo đơn mới nhất từ KiotViet (nếu có cấu hình & ngoài safe-mode) hoặc đối soát đơn đã lưu
 * - Tự động tạo/cập nhật Lịch Chăm Sóc (Ngày 1, 3, 7, 14, 21) cho đơn Hoàn thành / Đã giao
 * - Cập nhật Tổng chi tiêu, Số đơn, Tỷ lệ nhận hàng vào Hồ sơ Khách hàng 360
 */
export async function syncKiotVietOrdersByPhone(rawPhone) {
  const cleanPhone = normalizePhone(rawPhone);
  if (!cleanPhone) {
    return { ok: false, error: "Số điện thoại khách hàng không hợp lệ để đồng bộ KiotViet." };
  }

  const getMatchedLocal = (ordersList) =>
    (Array.isArray(ordersList) ? ordersList : [])
      .filter((o) => normalizePhone(o.phone) === cleanPhone)
      .sort(
        (a, b) =>
          new Date(b.createdAt || b.createdDate || 0).getTime() -
          new Date(a.createdAt || a.createdDate || 0).getTime()
      );

  // Nếu đang ở safe-mode hoặc chưa cấu hình KiotViet API, vẫn đồng bộ trạng thái & lịch chăm sóc từ dữ liệu nội bộ
  const canCallRemote = !isSafePilotMode() && isAutoSyncAllowed();
  const tokenRes = canCallRemote ? await getKiotVietSyncToken() : { ok: false, error: "PILOT_SAFE_MODE" };

  if (!canCallRemote || !tokenRes.ok) {
    const existingOrders = getMatchedLocal(getStoredOrders());
    const careTasksCreated = triggerCareScheduleForDeliveredOrders(existingOrders);
    const summary = calculateOrderSummaryForPhone(existingOrders, cleanPhone);
    if (existingOrders.length > 0) {
      await updateCustomer360ForOrder(existingOrders[0], existingOrders);
    }
    return {
      ok: true,
      mode: "local",
      phone: cleanPhone,
      syncedCount: 0,
      orders: existingOrders,
      summary,
      careTasksCreated,
      warning: !canCallRemote
        ? "Đang ở chế độ an toàn (Safe Mode) — đã đối soát đơn hàng CRM hiện có."
        : tokenRes.error || "Chưa kết nối KiotViet API — đã đối soát đơn hàng CRM hiện có.",
      message: `Đã đối soát ${existingOrders.length} đơn hàng cho SĐT ${cleanPhone}${careTasksCreated > 0 ? ` và tạo ${careTasksCreated} lịch chăm sóc mới` : ""}.`,
    };
  }

  try {
    const token = tokenRes.token;
    const cfg = getKiotVietConfig();
    const retailer = cfg.retailer || process.env.KIOTVIET_RETAILER || "0904637007";

    // 1. Tìm khách hàng trên KiotViet theo SĐT
    const custRes = await fetch(
      `${KIOTVIET_API_BASE}/customers?contactNumber=${encodeURIComponent(cleanPhone)}&pageSize=20`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Retailer: retailer,
          "User-Agent": "ADDP-CRM/1.0",
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    const matchedCustomerIds = [];
    if (custRes.ok) {
      const custData = await custRes.json().catch(() => ({}));
      const list = Array.isArray(custData?.data) ? custData.data : [];
      for (const c of list) {
        const cPhone = normalizePhone(c.contactNumber || c.mobilePhone || "");
        if (cPhone === cleanPhone && c.id) {
          matchedCustomerIds.push(c.id);
        }
      }
    }

    const mappedOrders = [];
    for (const kvCustId of matchedCustomerIds) {
      // Kéo Hóa đơn (Invoices) của khách hàng
      try {
        const invRes = await fetch(
          `${KIOTVIET_API_BASE}/invoices?customerIds=${kvCustId}&pageSize=100&orderBy=createdDate&orderDirection=Desc&includeInvoiceDelivery=true`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Retailer: retailer,
              "User-Agent": "ADDP-CRM/1.0",
            },
            signal: AbortSignal.timeout(12000),
          }
        );
        if (invRes.ok) {
          const invData = await invRes.json().catch(() => ({}));
          for (const inv of invData?.data || []) {
            mappedOrders.push(mapKiotVietItemToCrmOrder(inv, "INVOICE", cleanPhone));
          }
        }
      } catch (e) {
        console.warn("[KIOTVIET_PHONE_INVOICE_WARN]", e.message);
      }

      // Kéo Đơn đặt hàng (Orders) của khách hàng
      try {
        const ordRes = await fetch(
          `${KIOTVIET_API_BASE}/orders?customerIds=${kvCustId}&pageSize=100&orderBy=createdDate&orderDirection=Desc&includeOrderDelivery=true`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Retailer: retailer,
              "User-Agent": "ADDP-CRM/1.0",
            },
            signal: AbortSignal.timeout(12000),
          }
        );
        if (ordRes.ok) {
          const ordData = await ordRes.json().catch(() => ({}));
          for (const ord of ordData?.data || []) {
            mappedOrders.push(mapKiotVietItemToCrmOrder(ord, "ORDER", cleanPhone));
          }
        }
      } catch (e) {
        console.warn("[KIOTVIET_PHONE_ORDER_WARN]", e.message);
      }
    }

    const allStored =
      mappedOrders.length > 0 ? upsertStoredOrders(mappedOrders) : getStoredOrders();
    const matchedOrders = getMatchedLocal(allStored);
    const careTasksCreated = triggerCareScheduleForDeliveredOrders(matchedOrders);
    const summary = calculateOrderSummaryForPhone(matchedOrders, cleanPhone);

    if (matchedOrders.length > 0) {
      await updateCustomer360ForOrder(matchedOrders[0], matchedOrders);
    }

    if (mappedOrders.length > 0) {
      broadcastMessage({
        type: "KIOTVIET_SYNC_SUCCESS",
        phone: cleanPhone,
        count: mappedOrders.length,
        careTasksCreated,
        timestamp: new Date().toISOString(),
      });
    }

    return {
      ok: true,
      mode: "kiotviet_api",
      phone: cleanPhone,
      syncedCount: mappedOrders.length,
      orders: matchedOrders,
      summary,
      careTasksCreated,
      message:
        mappedOrders.length > 0
          ? `Đã đồng bộ ${mappedOrders.length} đơn từ KiotViet cho ${cleanPhone}${careTasksCreated > 0 ? ` (tạo ${careTasksCreated} lịch chăm sóc)` : ""}!`
          : `Không có đơn mới trên KiotViet cho ${cleanPhone} (hiển thị ${matchedOrders.length} đơn CRM).`,
    };
  } catch (err) {
    console.error("[KIOTVIET_SYNC_PHONE_ERR]", err);
    return {
      ok: false,
      error: `Lỗi đồng bộ KiotViet cho SĐT ${cleanPhone}: ${err.message}`,
    };
  }
}
