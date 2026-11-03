import { NextResponse } from "next/server";
import { updateStockOrPrepack, getInventoryData } from "../../../../lib/inventoryStore.js";

/**
 * ADDP Omnichannel AI CRM — API Quản Lý Hàng Đóng Sẵn & Tồn Kho (WBS-42)
 * Kế thừa logic từ C:\AH-Trabi\quan-ly-kho\dong_san_view.php
 */

export async function GET() {
  try {
    const inv = getInventoryData();
    return NextResponse.json({
      ok: true,
      products: inv.products || [],
      logs: inv.inventoryLogs || [],
    });
  } catch (error) {
    console.error("[PREPACK_GET_ERROR]", error);
    return NextResponse.json({ error: "Lỗi nạp danh sách đóng sẵn." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { itemCode, stockDelta = 0, prepackDelta = 0, note = "" } = body;

    if (!itemCode) {
      return NextResponse.json({ error: "Thiếu mã sản phẩm (itemCode)." }, { status: 400 });
    }

    const result = updateStockOrPrepack(itemCode, {
      stockDelta: Number(stockDelta) || 0,
      prepackDelta: Number(prepackDelta) || 0,
      note,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[PREPACK_POST_ERROR]", error);
    return NextResponse.json({ error: "Lỗi cập nhật số lượng đóng sẵn." }, { status: 500 });
  }
}
