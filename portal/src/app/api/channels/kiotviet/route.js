import { NextResponse } from "next/server";
import {
  getKiotVietConfig,
  saveKiotVietConfig,
  getKiotVietAccessToken,
  fetchKiotVietProducts,
  fetchKiotVietBranches,
  getLocalProductsInventory,
  createKiotVietOrder,
} from "@/lib/kiotvietConnector.js";
import { getStoredOrders, updateOrderStatus } from "@/lib/ordersStore.js";

/**
 * ADDP Omnichannel AI CRM — API Quản Lý Kết Nối, Đồng Bộ Tồn Kho & Đẩy Đơn KiotViet (WBS-20, WBS-39, WBS-40)
 * GET  /api/channels/kiotviet -> Lấy cấu hình KiotViet, danh sách chi nhánh và danh mục sản phẩm kèm tồn kho
 * POST /api/channels/kiotviet -> Lưu cấu hình OAuth2, đồng bộ tồn kho (SYNC_PRODUCTS) hoặc đẩy đơn sang KiotViet (PUSH_ORDER)
 */

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const forceSync = searchParams.get("sync") === "1";

    const cfg = getKiotVietConfig();
    const branchRes = await fetchKiotVietBranches();
    const prodRes = forceSync
      ? await fetchKiotVietProducts()
      : {
          ok: true,
          source: cfg.lastSyncedAt ? "KIOTVIET_CACHE" : "LOCAL_CATALOG",
          products: getLocalProductsInventory(),
        };

    return NextResponse.json({
      ok: true,
      config: {
        retailer: cfg.retailer || "",
        clientId: cfg.clientId || "",
        hasClientSecret: Boolean(cfg.clientSecret),
        branchId: cfg.branchId || 1,
        branchName: cfg.branchName || "Kho Tổng Dược Phẩm ADDP",
        autoSync: cfg.autoSync !== false,
        lastSyncedAt: cfg.lastSyncedAt || null,
        connected: Boolean(cfg.retailer && cfg.clientId && cfg.clientSecret),
      },
      branches: branchRes.branches || [],
      products: prodRes.products || [],
      productSource: prodRes.source,
    });
  } catch (error) {
    console.error("[GET /api/channels/kiotviet ERROR]", error);
    return NextResponse.json(
      { ok: false, error: "Không thể tải thông tin cấu hình KiotViet." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action = "SAVE_CONFIG" } = body || {};

    // 1. Lưu cấu hình OAuth2 KiotViet & Kiểm tra lấy Bearer Token
    if (action === "SAVE_CONFIG") {
      const current = getKiotVietConfig();
      const updated = saveKiotVietConfig({
        retailer: body.retailer !== undefined ? String(body.retailer).trim() : current.retailer,
        clientId: body.clientId !== undefined ? String(body.clientId).trim() : current.clientId,
        clientSecret:
          body.clientSecret && body.clientSecret !== "********"
            ? String(body.clientSecret).trim()
            : current.clientSecret,
        branchId: Number(body.branchId || current.branchId || 1),
        branchName: body.branchName || current.branchName || "Kho Tổng Dược Phẩm ADDP",
        autoSync: typeof body.autoSync === "boolean" ? body.autoSync : current.autoSync,
      });

      let tokenStatus = { ok: false, message: "Đã lưu cấu hình cục bộ." };
      if (updated.clientId && updated.clientSecret) {
        const tokenRes = await getKiotVietAccessToken(updated);
        tokenStatus = tokenRes.ok
          ? { ok: true, message: "Xác thực KiotViet OAuth2 Bearer Token thành công!" }
          : { ok: false, message: tokenRes.error };
      }

      const branchRes = await fetchKiotVietBranches();
      return NextResponse.json({
        ok: true,
        config: {
          retailer: updated.retailer,
          clientId: updated.clientId,
          hasClientSecret: Boolean(updated.clientSecret),
          branchId: updated.branchId,
          branchName: updated.branchName,
          autoSync: updated.autoSync,
          connected: Boolean(updated.retailer && updated.clientId && updated.clientSecret),
        },
        tokenStatus,
        branches: branchRes.branches || [],
        message: tokenStatus.message,
      });
    }

    // 2. Đồng bộ danh mục sản phẩm & tồn kho thực tế từ KiotViet
    if (action === "SYNC_PRODUCTS") {
      const syncRes = await fetchKiotVietProducts();
      return NextResponse.json({
        ok: syncRes.ok,
        source: syncRes.source,
        products: syncRes.products || [],
        total: (syncRes.products || []).length,
        error: syncRes.error || null,
        message: syncRes.ok
          ? `Đã đồng bộ ${(syncRes.products || []).length} sản phẩm & tồn kho từ KiotViet!`
          : syncRes.error,
      });
    }

    // 3. Đẩy đơn hàng CRM sang KiotViet POS
    if (action === "PUSH_ORDER") {
      const orders = getStoredOrders();
      const targetOrder = body.orderId
        ? orders.find((o) => o.id === body.orderId || o.orderCode === body.orderId)
        : body.order;

      if (!targetOrder) {
        return NextResponse.json(
          { ok: false, error: "Không tìm thấy đơn hàng cần đẩy sang KiotViet." },
          { status: 404 }
        );
      }

      const pushRes = await createKiotVietOrder({
        branchId: body.branchId || targetOrder.branchId,
        customerName: targetOrder.customerName,
        phone: targetOrder.phone,
        address: targetOrder.address,
        items: targetOrder.items,
        method: targetOrder.paymentMethod || "Cash",
        channel: targetOrder.channel,
        note: targetOrder.note,
      });

      if (pushRes.ok && targetOrder.id) {
        updateOrderStatus(targetOrder.id, {
          syncedKiotViet: true,
          kiotVietOrderCode: pushRes.kiotOrderCode,
          kiotVietSyncMode: pushRes.mode,
        });
      }

      return NextResponse.json({
        ok: pushRes.ok,
        kiotOrderCode: pushRes.kiotOrderCode,
        mode: pushRes.mode,
        payload: pushRes.payload,
        message: pushRes.message || pushRes.error,
        error: pushRes.error || null,
      });
    }

    return NextResponse.json({ ok: false, error: "Action không hợp lệ." }, { status: 400 });
  } catch (error) {
    console.error("[POST /api/channels/kiotviet ERROR]", error);
    return NextResponse.json(
      { ok: false, error: "Lỗi xử lý yêu cầu KiotViet API." },
      { status: 500 }
    );
  }
}
