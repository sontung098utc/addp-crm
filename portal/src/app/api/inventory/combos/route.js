import { NextResponse } from "next/server";
import { getInventoryData, saveInventoryData } from "../../../../lib/inventoryStore.js";

/**
 * ADDP Omnichannel AI CRM — API Quản Lý Công Thức Combo & Sản Phẩm (WBS-41)
 */

export async function GET() {
  try {
    const inv = getInventoryData();
    return NextResponse.json({
      ok: true,
      products: inv.products || [],
      combos: (inv.products || []).filter((p) => p.isCombo),
      totalProducts: (inv.products || []).length,
    });
  } catch (error) {
    console.error("[INVENTORY_COMBOS_GET_ERROR]", error);
    return NextResponse.json({ error: "Lỗi nạp danh sách combo." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { code, name, unit = "Combo", retailPrice = 0, costPrice = 0, comboFormula, stockQuantity = 0, prepackedQuantity = 0 } = body;

    if (!code || !name) {
      return NextResponse.json({ error: "Vui lòng nhập đầy đủ Mã và Tên sản phẩm/combo." }, { status: 400 });
    }

    const inv = getInventoryData();
    const cleanCode = code.trim().toUpperCase();
    const existingIdx = inv.products.findIndex((p) => p.code.toUpperCase() === cleanCode);

    const isCombo = Boolean(comboFormula && comboFormula.trim());
    const productItem = {
      id: existingIdx >= 0 ? inv.products[existingIdx].id : `prod_${Date.now()}`,
      code: cleanCode,
      name: name.trim(),
      unit: unit.trim() || (isCombo ? "Combo" : "Hộp"),
      retailPrice: Number(retailPrice) || 0,
      costPrice: Number(costPrice) || 0,
      stockQuantity: Number(stockQuantity) || 0,
      prepackedQuantity: Number(prepackedQuantity) || 0,
      isCombo,
      comboFormula: isCombo ? comboFormula.trim() : null,
      updatedAt: new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      inv.products[existingIdx] = { ...inv.products[existingIdx], ...productItem };
    } else {
      inv.products.push(productItem);
    }

    saveInventoryData(inv);
    return NextResponse.json({ ok: true, product: productItem });
  } catch (error) {
    console.error("[INVENTORY_COMBOS_POST_ERROR]", error);
    return NextResponse.json({ error: "Lỗi lưu công thức combo." }, { status: 500 });
  }
}
