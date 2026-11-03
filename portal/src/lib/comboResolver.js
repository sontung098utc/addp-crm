/**
 * ADDP Omnichannel AI CRM — Bộ giải mã công thức Combo & Quy đổi SKU Đa Sàn (WBS-41)
 * Kế thừa 100% thuật toán đệ quy từ C:\AH-Trabi\quan-ly-kho\index.php (resolve_all_formulas)
 * Tuân thủ Điều 2 & Điều 11 AGENTS.md.
 */

// Danh mục định danh sản phẩm gốc và đơn vị tính
export const PRODUCT_CATALOG_META = {
  "GLUCARE-LON-800": { name: "Sữa hạt Glucare Plus (Lon 800g)", unit: "Lon", defaultCost: 165000 },
  "GLUCARE-HOP-400": { name: "Sữa hạt Glucare Plus (Hộp 400g)", unit: "Hộp", defaultCost: 155000 },
  "ADDP-VAD-60": { name: "Addp Viên An Đường (Hộp 60 viên)", unit: "Hộp", defaultCost: 280000 },
  "GLUSURE-LON-850": { name: "Sữa tiểu đường Glusure (Lon 850g)", unit: "Lon", defaultCost: 260000 },
  "CANXI-TDUONG-900": { name: "Sữa Canxi tiểu đường (Hộp 900g)", unit: "Hộp", defaultCost: 250000 },
  "GLUSURE-GOLD-800": { name: "Sữa Non Glusure Gold (Lon 800g)", unit: "Lon", defaultCost: 340000 },
  "DTHT-TAYTANG": { name: "Đông trùng hạ thảo Tây Tạng", unit: "Hộp", defaultCost: 550000 },
  "DOVITAL-SUI": { name: "Sủi mát gan thanh nhiệt Dovital", unit: "Tuýp", defaultCost: 35000 },
  "DD-HAICHAU": { name: "Viên dinh dưỡng Hải Châu", unit: "Hộp", defaultCost: 55000 },
  "VIT-3B": { name: "Vitamin 3B Bổ Thần Kinh", unit: "Hộp", defaultCost: 140000 },
  "MÁTGAN": { name: "Trà Mát Gan Giải Độc ADDP", unit: "Hộp", defaultCost: 45000 },
  "CAM": { name: "Viên Sủi Vitamin Cam ADDP", unit: "Tuýp", defaultCost: 30000 },
  "CHANHLEO": { name: "Trà Thảo Mộc Chanh Leo ADDP", unit: "Hộp", defaultCost: 45000 },
  "GÓIGLUCARE": { name: "Sữa Hạt Tiểu Đường Glucare Plus (Gói lẻ)", unit: "Gói", defaultCost: 12000 },
  "HỘPGLUCARE": { name: "Sữa Hạt Tiểu Đường Glucare Plus (Hộp 20 gói)", unit: "Hộp", defaultCost: 155000 },
  "LONGLUCARE": { name: "Sữa Hạt Tiểu Đường Glucare Plus (Lon 850g)", unit: "Lon", defaultCost: 260000 },
  "VAD": { name: "Viên An Đường ADDP (Hộp 60 viên)", unit: "Hộp", defaultCost: 280000 },
};

/**
 * Phân tích chuỗi công thức dạng "SKU1:qty1,SKU2:qty2" thành object
 */
export function parseFormulaString(formulaStr) {
  const res = {};
  if (!formulaStr) return res;
  for (const part of String(formulaStr).split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [code, qtyStr] = trimmed.split(":").map((s) => s.trim());
    if (code) {
      const upper = code.toUpperCase();
      res[upper] = (res[upper] || 0) + (parseFloat(qtyStr) || 1);
    }
  }
  return res;
}

/**
 * Định dạng ngược từ Object { SKU: qty } thành chuỗi "SKU1:qty1,SKU2:qty2"
 */
export function formatFormulaString(map) {
  return Object.entries(map)
    .filter(([_, q]) => q > 0)
    .map(([sku, q]) => `${sku}:${q}`)
    .join(",");
}

/**
 * Xử lý từng token đơn lẻ (quy đổi các mẫu viết tắt phổ biến)
 */
function resolveSingleToken(token, customFormulas = {}) {
  const upper = token.toUpperCase();
  if (customFormulas[upper]) {
    return parseFormulaString(customFormulas[upper]);
  }

  let m;
  // A. Mát gan (Xanh) - VD: XANH02, 2XANH, 3 X XANH
  if ((m = upper.match(/^(?:(\d+)\s*X\s*)?XANH(\d*)$/i))) {
    const q1 = m[1] ? parseInt(m[1], 10) : 1;
    const q2 = m[2] ? parseInt(m[2], 10) : 1;
    return { MÁTGAN: q1 * q2 };
  }
  if ((m = upper.match(/^(\d+)\s*XANH$/i))) {
    return { MÁTGAN: parseInt(m[1], 10) };
  }

  // B. Cam - VD: CAM01, 2CAM
  if ((m = upper.match(/^(?:(\d+)\s*X\s*)?CAM(\d*)$/i))) {
    const q1 = m[1] ? parseInt(m[1], 10) : 1;
    const q2 = m[2] ? parseInt(m[2], 10) : 1;
    return { CAM: q1 * q2 };
  }
  if ((m = upper.match(/^(\d+)\s*CAM$/i))) {
    return { CAM: parseInt(m[1], 10) };
  }

  // C. Chanh leo / Tím
  if ((m = upper.match(/^(?:(\d+)\s*X\s*)?(?:TIM|CHANHLEO)(\d*)$/i))) {
    const q1 = m[1] ? parseInt(m[1], 10) : 1;
    const q2 = m[2] ? parseInt(m[2], 10) : 1;
    return { CHANHLEO: q1 * q2 };
  }

  // D. Glucare Gói / Hộp / Lon
  if ((m = upper.match(/^(?:(\d+)\s*X\s*)?(\d+)?\s*(?:GOIGLUCARE|GÓIGLUCARE|GOIGLU|GOI)$/i))) {
    const q1 = m[1] ? parseInt(m[1], 10) : 1;
    const q2 = m[2] ? parseInt(m[2], 10) : 1;
    return { GÓIGLUCARE: q1 * q2 };
  }
  if ((m = upper.match(/^(?:(\d+)\s*X\s*)?(\d+)?\s*(?:HOPGLUCARE|HỘPGLUCARE|HOPGLU|HOP)$/i))) {
    const q1 = m[1] ? parseInt(m[1], 10) : 1;
    const q2 = m[2] ? parseInt(m[2], 10) : 1;
    return { HỘPGLUCARE: q1 * q2 };
  }
  if ((m = upper.match(/^(?:(\d+)\s*X\s*)?(\d+)?\s*(?:LONGLUCARE|LONGLU|LON)$/i))) {
    const q1 = m[1] ? parseInt(m[1], 10) : 1;
    const q2 = m[2] ? parseInt(m[2], 10) : 1;
    return { LONGLUCARE: q1 * q2 };
  }

  // E. VAD, Dovital, Viên An Đường
  if ((m = upper.match(/^(?:(\d+)\s*X\s*)?(VAD|ANTHAO|BAVI|NANO)(\d*)$/i))) {
    const q1 = m[1] ? parseInt(m[1], 10) : 1;
    const brand = m[2];
    const q2 = m[3] ? parseInt(m[3], 10) : 1;
    return { [brand]: q1 * q2 };
  }

  return { [upper]: 1 };
}

/**
 * Thuật toán Đệ quy tách công thức Combo (resolve_all_formulas)
 * Hỗ trợ phân rã đa cấp (tối đa 5 cấp đệ quy) theo đúng chuẩn PHP gốc
 */
export function resolveComboFormula(rawCode, customFormulas = {}) {
  if (!rawCode) return {};
  const codeUpper = String(rawCode).trim().toUpperCase();
  if (!codeUpper) return {};

  // Bước 1: Khởi tạo phân tách cấp 1 theo dấu '+'
  let normCode = codeUpper
    .replace(/(\d+)?GOI_GLUCARE/gi, "$1GOIGLU")
    .replace(/(\d+)?HOP_GLUCARE/gi, "$1HOPGLU")
    .replace(/(\d+)?LON_GLUCARE/gi, "$1LONGLU");

  let currentMap = {};
  if (customFormulas[codeUpper]) {
    currentMap = parseFormulaString(customFormulas[codeUpper]);
  } else {
    const parts = normCode.split("+");
    for (const rawPart of parts) {
      const part = rawPart.trim();
      if (!part) continue;
      const sub = resolveSingleToken(part, customFormulas);
      for (const [k, v] of Object.entries(sub)) {
        currentMap[k] = (currentMap[k] || 0) + v;
      }
    }
  }

  // Bước 2: Đệ quy mở rộng các mã con nằm trong công thức (tối đa 5 lượt)
  for (let depth = 0; depth < 5; depth++) {
    let changed = false;
    const nextMap = {};

    for (const [sku, qty] of Object.entries(currentMap)) {
      if (customFormulas[sku] && customFormulas[sku] !== `${sku}:1`) {
        changed = true;
        const subMap = parseFormulaString(customFormulas[sku]);
        for (const [subSku, subQty] of Object.entries(subMap)) {
          nextMap[subSku] = (nextMap[subSku] || 0) + subQty * qty;
        }
      } else {
        nextMap[sku] = (nextMap[sku] || 0) + qty;
      }
    }

    currentMap = nextMap;
    if (!changed) break;
  }

  return currentMap;
}

/**
 * Trả về mảng chi tiết sản phẩm gốc kèm tên, số lượng thực xuất và đơn vị tính
 */
export function resolveComboFormulaList(rawCode, orderQty = 1, customFormulas = {}) {
  const map = resolveComboFormula(rawCode, customFormulas);
  const multiplier = Math.max(1, Number(orderQty) || 1);

  return Object.entries(map).map(([sku, qty]) => {
    const upperSku = sku.toUpperCase();
    const meta = PRODUCT_CATALOG_META[upperSku] || PRODUCT_CATALOG_META[sku] || {
      name: `Sản phẩm gốc (${sku})`,
      unit: "Hộp",
      defaultCost: 0,
    };
    const totalQty = qty * multiplier;
    return {
      sku: upperSku,
      name: meta.name,
      unit: meta.unit,
      quantityPerUnit: qty,
      totalQuantity: totalQty,
      costPrice: meta.defaultCost || 0,
      totalCost: (meta.defaultCost || 0) * totalQty,
    };
  });
}
