import fs from "fs";
import path from "path";
import { resolveComboFormula, PRODUCT_CATALOG_META } from "./comboResolver.js";

const INVENTORY_FILE = path.join(process.cwd(), ".data", "inventory.json");

function ensureStorage() {
  const dir = path.dirname(INVENTORY_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Khởi tạo danh mục sản phẩm, combo và ánh xạ SKU ban đầu kế thừa từ C:\AH-Trabi\quan-ly-kho
function getDefaultInventory() {
  return {
    products: [
      {
        id: "p1",
        code: "GLUCARE-LON-800",
        name: "Sữa hạt Glucare Plus (Lon 800g)",
        unit: "Lon",
        retailPrice: 259000,
        costPrice: 165000,
        stockQuantity: 450,
        prepackedQuantity: 60,
        isCombo: false,
        comboFormula: null,
      },
      {
        id: "p2",
        code: "GLUCARE-HOP-400",
        name: "Sữa hạt Glucare Plus (Hộp 400g)",
        unit: "Hộp",
        retailPrice: 259000,
        costPrice: 155000,
        stockQuantity: 320,
        prepackedQuantity: 40,
        isCombo: false,
        comboFormula: null,
      },
      {
        id: "p3",
        code: "ADDP-VAD-60",
        name: "Addp Viên An Đường (Hộp 60 viên)",
        unit: "Hộp",
        retailPrice: 485000,
        costPrice: 280000,
        stockQuantity: 210,
        prepackedQuantity: 30,
        isCombo: false,
        comboFormula: null,
      },
      {
        id: "p4",
        code: "GLUSURE-LON-850",
        name: "Sữa tiểu đường Glusure (Lon 850g)",
        unit: "Lon",
        retailPrice: 450000,
        costPrice: 260000,
        stockQuantity: 180,
        prepackedQuantity: 20,
        isCombo: false,
        comboFormula: null,
      },
      {
        id: "p5",
        code: "CANXI-TDUONG-900",
        name: "Sữa Canxi tiểu đường (Hộp 900g)",
        unit: "Hộp",
        retailPrice: 450000,
        costPrice: 250000,
        stockQuantity: 140,
        prepackedQuantity: 15,
        isCombo: false,
        comboFormula: null,
      },
      {
        id: "p6",
        code: "GLUSURE-GOLD-800",
        name: "Sữa Non Glusure Gold (Lon 800g)",
        unit: "Lon",
        retailPrice: 595000,
        costPrice: 340000,
        stockQuantity: 95,
        prepackedQuantity: 10,
        isCombo: false,
        comboFormula: null,
      },
      {
        id: "p7",
        code: "DOVITAL-SUI",
        name: "Sủi mát gan thanh nhiệt Dovital",
        unit: "Tuýp",
        retailPrice: 65000,
        costPrice: 35000,
        stockQuantity: 620,
        prepackedQuantity: 80,
        isCombo: false,
        comboFormula: null,
      },
      {
        id: "p8",
        code: "MÁTGAN",
        name: "Trà Mát Gan Giải Độc ADDP",
        unit: "Hộp",
        retailPrice: 85000,
        costPrice: 45000,
        stockQuantity: 580,
        prepackedQuantity: 50,
        isCombo: false,
        comboFormula: null,
      },
      {
        id: "p9",
        code: "CAM",
        name: "Viên Sủi Vitamin Cam ADDP",
        unit: "Tuýp",
        retailPrice: 60000,
        costPrice: 30000,
        stockQuantity: 410,
        prepackedQuantity: 45,
        isCombo: false,
        comboFormula: null,
      },
      // Các Combo chuẩn hóa
      {
        id: "cb1",
        code: "COMBO-2GLU-1DOV",
        name: "Combo 2 Lon Glucare Plus + 1 Sủi Dovital",
        unit: "Combo",
        retailPrice: 518000,
        costPrice: 365000,
        stockQuantity: 0,
        prepackedQuantity: 28, // Đã đóng sẵn 28 combo
        isCombo: true,
        comboFormula: "GLUCARE-LON-800:2,DOVITAL-SUI:1",
      },
      {
        id: "cb2",
        code: "COMBO-LT3M-GLU-VAD",
        name: "Combo Liệu Trình 3 Tháng (4 Lon Glucare + 2 Viên An Đường)",
        unit: "Combo",
        retailPrice: 1850000,
        costPrice: 1220000,
        stockQuantity: 0,
        prepackedQuantity: 12,
        isCombo: true,
        comboFormula: "GLUCARE-LON-800:4,ADDP-VAD-60:2",
      },
      {
        id: "cb3",
        code: "COMBO-XANH-CAM",
        name: "Combo Thanh Nhiệt (2 Mát Gan + 1 Cam)",
        unit: "Combo",
        retailPrice: 210000,
        costPrice: 120000,
        stockQuantity: 0,
        prepackedQuantity: 35,
        isCombo: true,
        comboFormula: "MÁTGAN:2,CAM:1",
      },
    ],
    skuMappings: [
      {
        id: "map_1",
        platform: "TIKTOK_SHOP",
        shopName: "Dược Phẩm ADDP Official",
        platformProductId: "172948291048",
        platformProductName: "Sữa hạt tiểu đường Glucare Plus 800g",
        platformSkuId: "sku_tt_glucare_800",
        platformSkuName: "Lon 800g",
        sellerSku: "TTS-GLU-800",
        localItemCode: "GLUCARE-LON-800",
        status: "LINKED",
      },
      {
        id: "map_2",
        platform: "TIKTOK_SHOP",
        shopName: "Dược Phẩm ADDP Official",
        platformProductId: "172948291049",
        platformProductName: "Combo 2 Lon Glucare Plus Tặng Sủi",
        platformSkuId: "sku_tt_combo_2glu",
        platformSkuName: "2 Lon + Quà",
        sellerSku: "TTS-CB-2GLU",
        localItemCode: "COMBO-2GLU-1DOV",
        status: "LINKED",
      },
      {
        id: "map_3",
        platform: "SHOPEE",
        shopName: "ADDP Mall",
        platformProductId: "2910481029",
        platformProductName: "Sữa Hạt Tiểu Đường Glucare Plus Lon 800g",
        platformSkuId: "shopee_sku_800",
        platformSkuName: "Lon 800g",
        sellerSku: "SP-GLUCARE-800",
        localItemCode: "GLUCARE-LON-800",
        status: "LINKED",
      },
      {
        id: "map_4",
        platform: "WEBSITE_MAGENTO",
        shopName: "Website ADDP.vn",
        platformProductId: "mag_prod_101",
        platformProductName: "Sữa Hạt Tiểu Đường Glucare Plus",
        platformSkuId: "mag_sku_lon_800",
        platformSkuName: "Lon 800g",
        sellerSku: "MAG-GLU-800",
        localItemCode: "GLUCARE-LON-800",
        status: "LINKED",
      },
      {
        id: "map_5",
        platform: "KIOTVIET",
        shopName: "Kho Tổng ADDP KiotViet",
        platformProductId: "kv_prod_501",
        platformProductName: "Sữa Glucare Plus 800g",
        platformSkuId: "kv_sku_501",
        platformSkuName: "Lon 800g",
        sellerSku: "SP000001",
        localItemCode: "GLUCARE-LON-800",
        status: "LINKED",
      },
    ],
    // Danh sách các mã SKU sàn phát sinh từ đơn hàng nhưng chưa được liên kết (WBS-42)
    unmappedSkus: [
      {
        id: "unmap_1",
        platform: "TIKTOK_SHOP",
        shopName: "Dược Phẩm ADDP Official",
        platformProductId: "172948291055",
        platformProductName: "Set Dùng Thử 5 Gói Sữa Glucare",
        platformSkuId: "sku_tt_trial_5p",
        sellerSku: "TTS-SET5-TRIAL",
        orderCount: 14,
        lastSeenAt: "2026-11-03 14:20:00",
      },
      {
        id: "unmap_2",
        platform: "SHOPEE",
        shopName: "ADDP Mall",
        platformProductId: "2910489999",
        platformProductName: "Trà Mát Gan Mẫu Mới 2026 Hộp 20 Túi",
        platformSkuId: "sp_matgan_2026",
        sellerSku: "SP-MATGAN-NEW",
        orderCount: 8,
        lastSeenAt: "2026-11-03 11:35:00",
      },
      {
        id: "unmap_3",
        platform: "WEBSITE_MAGENTO",
        shopName: "Website ADDP.vn",
        platformProductId: "mag_flash_99",
        platformProductName: "Flash Sale Sủi Vitamin Cam Tuýp 20 viên",
        platformSkuId: "mag_sui_cam_sale",
        sellerSku: "MAG-CAM-SALE",
        orderCount: 22,
        lastSeenAt: "2026-11-03 15:10:00",
      },
    ],
    inventoryLogs: [
      {
        id: "log_1",
        date: "2026-11-03",
        type: "PREPACK",
        itemCode: "COMBO-2GLU-1DOV",
        quantity: 20,
        batchNumber: 1,
        note: "Đóng sẵn ca sáng ngày 03/11",
      },
      {
        id: "log_2",
        date: "2026-11-03",
        type: "OUT",
        itemCode: "GLUCARE-LON-800",
        quantity: 14,
        batchNumber: 1,
        note: "Xuất theo đơn giao TikTok Shop & Shopee",
      },
    ],
  };
}

export function getInventoryData() {
  ensureStorage();
  try {
    if (fs.existsSync(INVENTORY_FILE)) {
      const content = fs.readFileSync(INVENTORY_FILE, "utf8");
      return JSON.parse(content);
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
