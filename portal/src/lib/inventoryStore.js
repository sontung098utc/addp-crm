import fs from "fs";
import path from "path";

const INVENTORY_FILE = path.join(process.cwd(), ".data", "inventory.json");

function ensureStorage() {
  const dir = path.dirname(INVENTORY_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Khởi tạo kho rỗng sạch hoàn toàn, chờ đồng bộ mã hàng thật từ KiotViet API (Điều 11 AGENTS.md)
function getDefaultInventory() {
  return {
    products: [],
    skuMappings: [],
    unmappedSkus: [],
    inventoryLogs: [],
  };
}

export function getInventoryData() {
  ensureStorage();
  try {
    if (fs.existsSync(INVENTORY_FILE)) {
      const content = fs.readFileSync(INVENTORY_FILE, "utf8");
      const parsed = JSON.parse(content);
      return {
        products: Array.isArray(parsed?.products) ? parsed.products : [],
        skuMappings: Array.isArray(parsed?.skuMappings) ? parsed.skuMappings : [],
        unmappedSkus: Array.isArray(parsed?.unmappedSkus) ? parsed.unmappedSkus : [],
        inventoryLogs: Array.isArray(parsed?.inventoryLogs) ? parsed.inventoryLogs : [],
      };
    }
  } catch (err) {
    console.error("Lỗi đọc inventory.json:", err);
  }
  const defaults = getDefaultInventory();
  saveInventoryData(defaults);
  return defaults;
}

export function saveInventoryData(data) {
  ensureStorage();
  try {
    fs.writeFileSync(INVENTORY_FILE, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (err) {
    console.error("Lỗi ghi inventory.json:", err);
    return false;
  }
}

/**
 * Đồng bộ danh sách sản phẩm thật từ KiotViet Public API vào kho CRM (inventory.json)
 */
export function syncKiotVietProductsToInventory(kiotProducts = []) {
  const inv = getInventoryData();
  const existingByCode = new Map();
  for (const p of inv.products || []) {
    if (p?.code) existingByCode.set(String(p.code).trim().toUpperCase(), p);
  }

  for (const kp of kiotProducts) {
    const code = String(kp.code || kp.sku || "").trim().toUpperCase();
    if (!code) continue;
    const prev = existingByCode.get(code);
    const merged = {
      id: prev?.id || kp.id || `kv_${kp.kiotProductId || code}`,
      kiotProductId: kp.kiotProductId || prev?.kiotProductId || null,
      code,
      name: kp.name || prev?.name || code,
      unit: kp.unit || prev?.unit || "Hộp",
      retailPrice: Number(kp.price ?? kp.retailPrice ?? prev?.retailPrice ?? 0),
      costPrice: Number(prev?.costPrice ?? 0),
      stockQuantity: Number(kp.onHand ?? kp.stockQuantity ?? prev?.stockQuantity ?? 0),
      prepackedQuantity: Number(prev?.prepackedQuantity ?? 0),
      isCombo: Boolean(kp.isCombo ?? prev?.isCombo),
      comboFormula: prev?.comboFormula || "",
      source: "KIOTVIET",
      syncedAt: new Date().toISOString(),
    };
    existingByCode.set(code, merged);
  }

  inv.products = Array.from(existingByCode.values());
  saveInventoryData(inv);
  return inv.products;
}

/**
 * Trả về từ điển công thức tùy chỉnh để nạp cho comboResolver
 */
export function getCustomFormulasMap() {
  const inv = getInventoryData();
  const map = {};
  for (const p of inv.products || []) {
    if (p.comboFormula) {
      map[p.code.toUpperCase()] = p.comboFormula;
    }
  }
  return map;
}

/**
 * Cập nhật số lượng đóng sẵn hoặc tồn kho
 */
export function updateStockOrPrepack(itemCode, { stockDelta = 0, prepackDelta = 0, note = "" }) {
  const inv = getInventoryData();
  const prod = inv.products.find((p) => p.code.toUpperCase() === itemCode.toUpperCase());
  if (!prod) return { ok: false, error: "Không tìm thấy mã sản phẩm." };

  prod.stockQuantity = Math.max(0, (prod.stockQuantity || 0) + stockDelta);
  prod.prepackedQuantity = Math.max(0, (prod.prepackedQuantity || 0) + prepackDelta);

  inv.inventoryLogs.unshift({
    id: `log_${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    type: prepackDelta !== 0 ? "PREPACK" : stockDelta > 0 ? "IN" : "OUT",
    itemCode: prod.code,
    quantity: Math.abs(prepackDelta || stockDelta),
    batchNumber: 1,
    note: note || "Điều chỉnh thủ công từ CRM",
  });

  saveInventoryData(inv);
  return { ok: true, product: prod };
}

/**
 * Tạo mới liên kết SKU từ sàn về sản phẩm nội bộ (WBS-41 & WBS-42)
 */
export function linkSkuMapping({ platform, platformSkuId, sellerSku, localItemCode, shopName, platformProductName }) {
  const inv = getInventoryData();

  // Xóa khỏi unmapped nếu có
  inv.unmappedSkus = inv.unmappedSkus.filter(
    (u) => !(u.platform === platform && (u.platformSkuId === platformSkuId || u.sellerSku === sellerSku))
  );

  // Cập nhật hoặc thêm mới trong skuMappings
  const existingIdx = inv.skuMappings.findIndex(
    (m) => m.platform === platform && m.platformSkuId === platformSkuId
  );

  const newMapping = {
    id: `map_${Date.now()}`,
    platform,
    shopName: shopName || "Gian hàng chính thức",
    platformProductId: platformSkuId,
    platformProductName: platformProductName || "Sản phẩm trên sàn",
    platformSkuId,
    platformSkuName: sellerSku || platformSkuId,
    sellerSku: sellerSku || platformSkuId,
    localItemCode: localItemCode.toUpperCase(),
    status: "LINKED",
    updatedAt: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    inv.skuMappings[existingIdx] = newMapping;
  } else {
    inv.skuMappings.push(newMapping);
  }

  saveInventoryData(inv);
  return { ok: true, mapping: newMapping };
}
