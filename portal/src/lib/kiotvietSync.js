import fs from "fs";
import path from "path";
import { normalizePhone } from "./phone.js";
import { resolveComboFormulaList } from "./comboResolver.js";
import { getStoredOrders, upsertStoredOrders } from "./ordersStore.js";
import {
  getOrCreateCustomerByPhone,
  updateCustomer,
} from "./customerIdentityResolver.js";
import { broadcastMessage } from "./unifiedMessageRouter.js";
import { getKiotVietConfig, saveKiotVietConfig } from "./kiotvietConnector.js";

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
  const clientId =
    cfg.clientId || process.env.KIOTVIET_CLIENT_ID || "51ddde69-20f9-4cf0-9163-8ff9dc94cae1";
  const clientSecret =
    cfg.clientSecret ||
    process.env.KIOTVIET_CLIENT_SECRET ||
    "7D6E216C1F4348FD3033D6A11565E13B4CB80F33";
  const retailer = cfg.retailer || process.env.KIOTVIET_RETAILER || "0904637007";

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

  // Ánh xạ trạng thái
  let status = "CONFIRMED";
  let deliveryStatus = "CHỜ_ĐÓNG_GÓI";
  if (type === "INVOICE") {
    // Invoice status: 1: Hoàn thành / Giao thành công, 2: Đã hủy
    if (item.status === 1 || item.statusValue === "Hoàn thành") {
      status = "DELIVERED";
      deliveryStatus = "GIAO_THÀNH_CÔNG";
    } else if (item.status === 2 || item.statusValue === "Đã hủy") {
      status = "CANCELLED";
      deliveryStatus = "ĐÃ_HỦY";
    }
  } else {
    // Order status: 1: Phiếu tạm / Chưa xử lý, 2: Đang giao, 3: Hoàn thành, 4: Đã hủy
    if (item.status === 3 || item.statusValue === "Đã giao hàng" || item.statusValue === "Hoàn thành") {
      status = "DELIVERED";
      deliveryStatus = "GIAO_THÀNH_CÔNG";
    } else if (item.status === 2 || item.statusValue === "Đang giao") {
      status = "SHIPPING";
      deliveryStatus = "ĐANG_VẬN_CHUYỂN";
    } else if (item.status === 4 || item.statusValue === "Đã hủy") {
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
 * Cập nhật số liệu chi tiêu & số đơn của Khách Hàng 360
 */
async function updateCustomer360ForOrder(order) {
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

      const prevOrders = Number(cust.totalOrders) || 0;
      const prevSpent = Number(cust.totalSpent) || 0;

      updateCustomer(cust.id, {
        fullName: order.customerName || cust.fullName,
        address: order.address || cust.address,
        totalOrders: Math.max(prevOrders + 1, 1),
        totalSpent: prevSpent + order.finalAmount,
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

    // 4. Cập nhật hồ sơ khách hàng 360 cho các đơn mới (chạy nền)
    setTimeout(() => {
      for (const o of mappedOrders) {
        updateCustomer360ForOrder(o);
      }
    }, 100);

    // 5. Cập nhật thời điểm đồng bộ
    const nowIso = new Date().toISOString();
    syncCache.lastSyncTime = Date.now();
    saveKiotVietConfig({
      lastSyncedAt: nowIso,
    });

    // 6. Phát SSE cập nhật giao diện thời gian thực
    broadcastMessage({
      type: "KIOTVIET_SYNC_SUCCESS",
      count: mappedOrders.length,
      syncedInvoicesCount,
      syncedOrdersCount,
      timestamp: nowIso,
    });

    return {
      ok: true,
      syncedCount: mappedOrders.length,
      syncedInvoicesCount,
      syncedOrdersCount,
      totalOrders: allStored.length,
      durationMs: Date.now() - startTime,
      message: `Đã đồng bộ thành công ${mappedOrders.length} đơn hàng & hóa đơn từ KiotViet (${syncedInvoicesCount} hóa đơn, ${syncedOrdersCount} đơn đặt hàng)!`,
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
export async function registerKiotVietWebhooks(targetUrl = "https://crm.addp.vn/api/webhooks/kiotviet") {
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
            Url: targetUrl,
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

  return { ok: true, webhooks: results };
}
