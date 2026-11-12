import { normalizePhone } from "../../../../lib/phone.js";
import { resolveComboFormulaList } from "../../../../lib/comboResolver.js";
import { appendOrderCareTasks } from "../../../../lib/careAutomation.js";
import { createOrder } from "../../../../lib/ordersStore.js";
import { getOrCreateCustomerByPhone } from "../../../../lib/customerIdentityResolver.js";
import {
  isIdempotencyKeyProcessed,
  reserveIdempotencyKey,
  releaseIdempotencyReservation,
  markIdempotencyKeyProcessed,
} from "../../../../lib/idempotency.js";

/**
 * ADDP Omnichannel AI CRM — KiotViet Webhook Gateway (WBS-20 & WBS-39 & WBS-40)
 * Tiếp nhận hóa đơn / đơn đặt hàng thời gian thực từ KiotViet:
 * 1. Xác thực Webhook chính thức: Chữ ký HMAC-SHA256 trên raw request body (Header X-Hub-Signature) & retailerId trong payload (Fail closed).
 * 2. Cơ chế Webhook Retry theo Tài liệu KiotViet Chính Thức:
 *    - KiotViet tự động kích hoạt cơ chế gửi lại (Retry với exponential backoff qua 24-48h) khi:
 *      + Server subscriber trả về mã lỗi 5xx (500, 502, 503, 504 - báo hiệu lỗi hệ thống tạm thời).
 *      + Hoặc kết nối bị timeout / ngắt quãng không phản hồi trong 5-10 giây.
 *    - Hành vi đối với Lỗi Nội Bộ (5xx):
 *      + Khi gặp lỗi ngoại lệ hệ thống không mong muốn (lỗi parse, lỗi lưu trữ DB), route BẮT BUỘC trả về HTTP 500
 *        để KiotViet nhận diện đây là sự cố tạm thời và TIẾP TỤC RETRY lại sau đó, tránh làm mất dữ liệu đơn hàng.
 *    - Hành vi đối với Trùng lặp (Idempotent Retry):
 *      + Khi nhận lại webhook hóa đơn đã được xử lý thành công trước đó (do retry hoặc mạng chập chờn), route BẮT BUỘC
 *        trả về HTTP 200 OK với status "SKIPPED_DUPLICATE" để KiotViet xác nhận đã giao thành công và DỪNG RETRY.
 *    - Hành vi đối với Xác thực Không Hợp Lệ (401/403):
 *      + Chữ ký HMAC không khớp hoặc thiếu: Trả về HTTP 401 Unauthorized.
 *      + Gian hàng retailerId không khớp: Trả về HTTP 403 Forbidden.
 * 3. Chuẩn hóa SĐT khách hàng 10 số (Điều 3 AGENTS.md) & gộp Hồ sơ Khách hàng 360.
 * 4. Tự động bóc tách công thức Combo (`resolveComboFormulaList`) và trừ tồn kho.
 * 5. Lưu đơn hàng vào `ordersStore` & kích hoạt lộ trình chăm sóc tự động 7 mốc (`appendOrderCareTasks`).
 */

import crypto from "crypto";

/**
 * Hàm so sánh chuỗi an toàn chống tấn công độ trễ thời gian (Timing-safe comparison)
 */
function timingSafeCompare(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Xác thực Webhook KiotViet theo chuẩn chính thức:
 * 1. Cơ chế Chữ ký: KiotViet ký raw request body bằng HMAC-SHA256 với Webhook Secret (hoặc Client Secret)
 *    và gửi trong Header 'X-Hub-Signature' (hoặc 'X-Hub-Signature-256') dưới dạng 'sha256=<hex>' hoặc '<hex>'.
 * 2. Bảo mật:
 *    - TUYỆT ĐỐI KHÔNG nhận secret qua query string (?token= / ?secret=).
 *    - Nếu thiếu chữ ký hoặc chữ ký không khớp: Trả về HTTP 401 Unauthorized (Fail closed).
 */
export function validateKiotVietWebhookSignature(rawBody, signatureHeader, configuredSecret) {
  if (!configuredSecret) {
    return {
      ok: false,
      status: 500,
      error: "Server Configuration Error: KIOTVIET_WEBHOOK_SECRET chưa được thiết lập.",
    };
  }

  if (!signatureHeader || typeof signatureHeader !== "string") {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized: Thiếu header chữ ký X-Hub-Signature từ KiotViet.",
    };
  }

  const sigTrimmed = signatureHeader.trim();
  let algorithm = "sha256";
  let receivedHash = sigTrimmed;

  if (sigTrimmed.toLowerCase().startsWith("sha256=")) {
    algorithm = "sha256";
    receivedHash = sigTrimmed.slice(7).trim();
  } else if (sigTrimmed.toLowerCase().startsWith("sha1=")) {
    algorithm = "sha1";
    receivedHash = sigTrimmed.slice(5).trim();
  }

  const bodyStr = typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody || {});
  const computedHash = crypto
    .createHmac(algorithm, configuredSecret)
    .update(bodyStr)
    .digest("hex");

  if (!timingSafeCompare(receivedHash.toLowerCase(), computedHash.toLowerCase())) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized: Chữ ký X-Hub-Signature không hợp lệ (HMAC không khớp).",
    };
  }

  return { ok: true };
}

/**
 * Xác thực mã định danh gian hàng (retailerId) trong payload JSON của KiotViet
 * LƯU Ý KỸ THUẬT:
 * - KiotViet KHÔNG gửi header 'Retailer' trong inbound webhook POST.
 * - Trường định danh gian hàng được gửi bên trong nội dung JSON payload (ví dụ: payload.RetailerId,
 *   payload.retailerId hoặc notification.RetailerId).
 * - Nếu không khớp với cấu hình KIOTVIET_RETAILER: Trả về HTTP 403 Forbidden.
 */
export function validatePayloadRetailer(payload, configuredRetailer) {
  if (!configuredRetailer) return { ok: true };

  const payloadRetailerId =
    payload?.RetailerId ??
    payload?.retailerId ??
    payload?.Retailer ??
    payload?.Notifications?.[0]?.RetailerId ??
    payload?.Notifications?.[0]?.retailerId ??
    payload?.Notifications?.[0]?.Data?.[0]?.RetailerId ??
    payload?.Notifications?.[0]?.Data?.[0]?.retailerId;

  if (payloadRetailerId === undefined || payloadRetailerId === null || payloadRetailerId === "") {
    return {
      ok: false,
      status: 403,
      error: "Forbidden: Thiếu trường retailerId trong webhook payload từ KiotViet.",
    };
  }

  if (String(payloadRetailerId).toLowerCase() !== String(configuredRetailer).toLowerCase()) {
    return {
      ok: false,
      status: 403,
      error: `Forbidden: retailerId '${payloadRetailerId}' trong payload không khớp gian hàng được cấu hình.`,
    };
  }

  return { ok: true };
}

/**
 * Hàm tương thích ngược (Deprecated adapter)
 */
export function validateWebhookToken(request, configuredSecret, configuredRetailer) {
  return {
    ok: false,
    status: 401,
    error: "Vui lòng sử dụng validateKiotVietWebhookSignature trên rawBody và validatePayloadRetailer.",
  };
}

export async function POST(request) {
  try {
    const configuredSecret = process.env.KIOTVIET_WEBHOOK_SECRET || "";
    const configuredRetailer = process.env.KIOTVIET_RETAILER_ID || process.env.KIOTVIET_RETAILER || "";

    // 1. Kiểm tra Query String: Từ chối hoàn toàn nếu truyền secret/token qua URL
    const url = new URL(request.url);
    if (url.searchParams.has("secret") || url.searchParams.has("token")) {
      return Response.json(
        { ok: false, error: "Unauthorized: Cấm nhận webhook secret qua query string để chống rò rỉ URL." },
        { status: 401 }
      );
    }

    // 2. Đọc raw body & header chữ ký X-Hub-Signature từ KiotViet
    const rawBody = typeof request.text === "function" ? await request.text() : JSON.stringify(await request.json());
    const signatureHeader =
      request.headers.get("x-hub-signature") ||
      request.headers.get("x-hub-signature-256") ||
      request.headers.get("x-kiotviet-signature") ||
      "";

    // 3. Xác thực chữ ký HMAC-SHA256 trên raw request body (Fail closed)
    const sigResult = validateKiotVietWebhookSignature(rawBody, signatureHeader, configuredSecret);
    if (!sigResult.ok) {
      if (sigResult.status === 500) {
        console.error("[KIOTVIET_WEBHOOK_CONFIG_ERROR]", sigResult.error);
      } else {
        console.warn("[KIOTVIET_WEBHOOK_SIG_FAIL]", sigResult.error);
      }
      return Response.json(
        { ok: false, error: sigResult.error },
        { status: sigResult.status }
      );
    }

    // 4. Parse JSON payload
    let body;
    try {
      body = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;
    } catch {
      return Response.json(
        { ok: false, error: "Payload KiotViet không đúng định dạng JSON hợp lệ" },
        { status: 400 }
      );
    }

    // 5. Xác thực retailerId trong payload (Không tự giả định KiotViet gửi Header Retailer)
    const retailerResult = validatePayloadRetailer(body, configuredRetailer);
    if (!retailerResult.ok) {
      console.warn("[KIOTVIET_WEBHOOK_RETAILER_MISMATCH]", retailerResult.error);
      return Response.json(
        { ok: false, error: retailerResult.error },
        { status: retailerResult.status }
      );
    }

    if (!body.Notifications || !Array.isArray(body.Notifications)) {
      return Response.json(
        { ok: false, message: "Payload KiotViet không đúng định dạng Notifications" },
        { status: 400 }
      );
    }

    const processedOrders = [];

    for (const notification of body.Notifications) {
      const action = notification.Action;
      const dataList = notification.Data || [];

      for (const invoice of dataList) {
        const orderCode = invoice.Code;
        const customerName = invoice.CustomerName || "Khách Hàng KiotViet";
        const rawPhone = invoice.ContactNumber;

        if (!orderCode || !rawPhone) continue;

        const cleanPhone = normalizePhone(rawPhone);
        if (!cleanPhone) continue;

        const totalAmount = Number(invoice.Total || invoice.TotalPayment || 0);

        // 3. Kiểm tra Idempotency nguyên tử: Tránh xử lý lặp lại và race condition khi webhook đến đồng thời
        const idempotencyKey = `kiotviet_invoice_${cleanPhone}_${orderCode}`;
        const reserveResult = reserveIdempotencyKey(idempotencyKey);
        if (!reserveResult.reserved) {
          processedOrders.push({
            orderCode,
            customerName,
            phone: cleanPhone,
            totalAmount,
            action,
            status: "SKIPPED_DUPLICATE",
            duplicate: true,
            message: `Hóa đơn #${orderCode} đã được xử lý hoặc đang được xử lý song song (Idempotent: ${reserveResult.status}).`,
          });
          continue;
        }

        const invoiceDetails = invoice.InvoiceDetails || invoice.OrderDetails || [];
        const items = [];

        for (const item of invoiceDetails) {
          const sku = item.ProductCode || item.Code || "GLUCARE-900G";
          const qty = Number(item.Quantity || 1);
          const price = Number(item.Price || 0);
          const resolvedParts = resolveComboFormulaList(sku, qty);
          items.push({
            sku,
            name: item.ProductName || sku,
            quantity: qty,
            price,
            subtotal: price * qty,
            resolvedParts,
          });
        }

        // 4. Gộp / Tạo mới Hồ sơ Khách hàng 360
        try {
          await getOrCreateCustomerByPhone({
            phone: cleanPhone,
            fullName: customerName,
            address: invoice.Address || "",
            source: "KIOTVIET",
            note: `Đồng bộ hóa đơn KiotViet #${orderCode}`,
          });
        } catch {}

        // 5. Tạo đơn hàng trong ordersStore (tự động trừ kho & sinh 7 mốc CarePlan)
        const savedOrder = createOrder({
          orderCode,
          customerName,
          phone: cleanPhone,
          address: invoice.Address || "",
          channel: "KIOTVIET",
          items,
          totalAmount,
          discount: Number(invoice.Discount || 0),
          finalAmount: totalAmount,
          targetPlatform: "KIOTVIET",
          kiotVietOrderCode: orderCode,
          kiotVietSyncMode: "WEBHOOK_INBOUND",
          note: `Đồng bộ từ KiotViet Webhook (${action || "invoice.update"})`,
        });

        const careTasks = appendOrderCareTasks(savedOrder);

        // 6. Đánh dấu đã xử lý thành công vào kho Idempotency
        markIdempotencyKeyProcessed(idempotencyKey, {
          orderCode,
          totalAmount,
          action,
        });

        processedOrders.push({
          orderCode: savedOrder.orderCode,
          customerName,
          phone: cleanPhone,
          totalAmount,
          action,
          items,
          careTasksCount: careTasks.length || 7,
          status: "SUCCESS",
          duplicate: false,
        });
      }
    }

    return Response.json({
      ok: true,
      message: `Đã xử lý ${processedOrders.length} hóa đơn từ KiotViet thành công!`,
      orders: processedOrders,
    });
  } catch (error) {
    console.error("[KIOTVIET_WEBHOOK_ERROR]", error);
    return Response.json(
      { error: "Lỗi hệ thống khi xử lý KiotViet Webhook." },
      { status: 500 }
    );
  }
}
