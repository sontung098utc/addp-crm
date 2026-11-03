import { NextResponse } from "next/server";
import { getInventoryData, linkSkuMapping, saveInventoryData } from "../../../../lib/inventoryStore.js";

/**
 * ADDP Omnichannel AI CRM — API Ánh Xạ SKU Đa Sàn & Cảnh Báo Chưa Liên Kết (WBS-42)
 * Kế thừa logic từ C:\AH-Trabi\quan-ly-kho\channels_view.php
 */

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform");

    const inv = getInventoryData();
    let mappings = inv.skuMappings || [];
    let unmapped = inv.unmappedSkus || [];

    if (platform && platform !== "ALL") {
      mappings = mappings.filter((m) => m.platform === platform);
      unmapped = unmapped.filter((u) => u.platform === platform);
    }

    return NextResponse.json({
      ok: true,
      totalLinked: mappings.length,
      totalUnmapped: unmapped.length,
      mappings,
      unmapped,
    });
  } catch (error) {
    console.error("[SKU_MAPPINGS_GET_ERROR]", error);
    return NextResponse.json({ error: "Lỗi nạp danh sách ánh xạ SKU." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { platform, platformSkuId, sellerSku, localItemCode, shopName, platformProductName } = body;

    if (!platform || !platformSkuId || !localItemCode) {
      return NextResponse.json({ error: "Vui lòng nhập đầy đủ: Sàn (platform), Mã SKU sàn và Mã nội bộ (localItemCode)." }, { status: 400 });
    }

    const result = linkSkuMapping({
      platform,
      platformSkuId,
      sellerSku,
      localItemCode,
      shopName,
      platformProductName,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[SKU_MAPPINGS_POST_ERROR]", error);
    return NextResponse.json({ error: "Lỗi tạo liên kết SKU." }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Thiếu id ánh xạ SKU." }, { status: 400 });
    }

    const inv = getInventoryData();
    inv.skuMappings = (inv.skuMappings || []).filter((m) => m.id !== id);
    saveInventoryData(inv);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[SKU_MAPPINGS_DELETE_ERROR]", error);
    return NextResponse.json({ error: "Lỗi xóa ánh xạ SKU." }, { status: 500 });
  }
}
