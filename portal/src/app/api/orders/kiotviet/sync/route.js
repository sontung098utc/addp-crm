import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { guardApiRequest } from "@/lib/rbac.js";
import {
  syncAllKiotVietOrders,
  syncKiotVietOrdersByPhone,
  registerKiotVietWebhooks,
} from "@/lib/kiotvietSync.js";
import { getStoredOrders } from "@/lib/ordersStore.js";
import { getKiotVietConfig } from "@/lib/kiotvietConnector.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/orders/kiotviet/sync
 * Lấy trạng thái đồng bộ đơn hàng KiotViet
 */
export async function GET() {
  const syncCache = globalThis.__KIOTVIET_SYNC_CACHE__ || {};
  const cfg = getKiotVietConfig();
  const orders = getStoredOrders();
  const kiotOrders = orders.filter(
    (o) => o.platform === "KIOTVIET" || o.source === "KIOTVIET"
  );

  return NextResponse.json({
    ok: true,
    isSyncing: Boolean(syncCache.isSyncing),
    progress: syncCache.progress || null,
    lastResult: syncCache.lastResult || null,
    lastError: syncCache.lastError || null,
    lastSyncTime: syncCache.lastSyncTime || null,
    lastSyncedAt: cfg.lastSyncedAt || null,
    totalOrders: orders.length,
    kiotOrdersCount: kiotOrders.length,
    autoSync: cfg.autoSync,
    retailer: cfg.retailer,
    branchName: cfg.branchName,
  });
}

/**
 * POST /api/orders/kiotviet/sync
 * Kích hoạt đồng bộ hóa đơn & đơn đặt hàng từ KiotViet về CRM
 */
export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const reqHeaders = await headers();
    const guard = guardApiRequest(cookieStore, reqHeaders, {
      allowedRoles: ["ADMIN", "SALE_LEADER", "SALE", "CSKH", "KHO", "KE_TOAN"],
      moduleKey: "orders",
    });
    const currentToken = cookieStore.get("addp_crm_session")?.value;
    if (currentToken && !guard.ok) {
      return guard.response;
    }

    const body = await request.json().catch(() => ({}));

    // Nếu truyền phone cụ thể (từ Inbox / Hồ sơ 360), chỉ đồng bộ cho khách hàng đó
    if (body?.phone) {
      const phoneResult = await syncKiotVietOrdersByPhone(body.phone);
      return NextResponse.json(phoneResult, { status: phoneResult.ok ? 200 : 400 });
    }

    const mode = body?.mode || "incremental"; // "incremental" | "full"
    const fromDate = body?.fromDate ? String(body.fromDate).slice(0, 10) : null;
    const toDate = body?.toDate ? String(body.toDate).slice(0, 10) : null;
    const lastModifiedFrom = body?.lastModifiedFrom || null;
    const includeCustomers =
      body?.includeCustomers !== undefined
        ? Boolean(body.includeCustomers)
        : Boolean(fromDate || toDate || mode === "full");
    const maxPages = Number(
      body?.maxPages || (fromDate || toDate || mode === "full" ? 300 : 15)
    );
    const registerWebhooksFlag = Boolean(body?.registerWebhooks);

    if (registerWebhooksFlag) {
      const webhookUrl =
        body?.webhookUrl ||
        (process.env.NEXT_PUBLIC_APP_URL
          ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/kiotviet`
          : "https://crm.addp.vn/api/webhooks/kiotviet");
      registerKiotVietWebhooks(webhookUrl).catch((err) =>
        console.warn("[KIOTVIET_WEBHOOK_REG_WARN]", err.message)
      );
    }

    const runBackground =
      body?.async !== undefined
        ? Boolean(body.async)
        : Boolean(fromDate || toDate || mode === "full");

    if (runBackground) {
      const syncCache = globalThis.__KIOTVIET_SYNC_CACHE__ || {};
      if (!syncCache.isSyncing) {
        syncAllKiotVietOrders({
          mode,
          fromDate,
          toDate,
          lastModifiedFrom,
          maxPages,
          pageSize: 100,
          includeCustomers,
        }).catch((err) => {
          console.error("[KIOTVIET_BG_SYNC_ERR]", err);
        });
      }
      return NextResponse.json({
        ok: true,
        started: true,
        isSyncing: true,
        message: `Đang đồng bộ KiotViet (${fromDate || "..."} → ${toDate || "nay"}) dưới nền, vui lòng chờ trong giây lát...`,
      });
    }

    const result = await syncAllKiotVietOrders({
      mode,
      fromDate,
      toDate,
      lastModifiedFrom,
      maxPages,
      pageSize: 100,
      includeCustomers,
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    console.error("[KIOTVIET_SYNC_ROUTE_ERR]", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Lỗi đồng bộ KiotViet." },
      { status: 500 }
    );
  }
}
