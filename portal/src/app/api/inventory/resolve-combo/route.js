import { NextResponse } from "next/server";
import { resolveComboFormulaList } from "../../../../lib/comboResolver.js";
import { getCustomFormulasMap } from "../../../../lib/inventoryStore.js";

/**
 * ADDP Omnichannel AI CRM — API Giải Mã Công Thức Combo & Ánh Xạ SKU (WBS-41)
 * Nhận mã SKU/Combo + số lượng, trả về mảng chi tiết các sản phẩm gốc đã phân rã
 */

export async function POST(request) {
  try {
    const body = await request.json();
    const { sku, quantity = 1, customFormula = null } = body;

    if (!sku || typeof sku !== "string" || !sku.trim()) {
      return NextResponse.json({ error: "Thiếu mã sản phẩm hoặc mã combo (sku)." }, { status: 400 });
    }

    const cleanSku = sku.trim();
    const cleanQty = Math.max(1, Number(quantity) || 1);

    // Lấy công thức tùy chỉnh từ hệ thống kho kết hợp với công thức truyền vào (nếu có)
    const customMap = getCustomFormulasMap();
    if (customFormula) {
      customMap[cleanSku.toUpperCase()] = customFormula;
    }

    const resolvedItems = resolveComboFormulaList(cleanSku, cleanQty, customMap);
    const totalCost = resolvedItems.reduce((acc, item) => acc + (item.totalCost || 0), 0);

    return NextResponse.json({
      ok: true,
      originalSku: cleanSku,
      orderQty: cleanQty,
      itemCount: resolvedItems.length,
      resolvedItems,
      totalCost,
    });
  } catch (error) {
    console.error("[RESOLVE_COMBO_EXCEPTION]", error);
    return NextResponse.json({ error: "Lỗi khi giải mã công thức combo." }, { status: 500 });
  }
}
