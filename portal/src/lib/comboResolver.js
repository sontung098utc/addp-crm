/**
 * Bộ giải mã công thức Combo & Quy đổi SKU đa sàn (WBS-04)
 * Kế thừa trực tiếp từ C:\AH-Trabi\quan-ly-kho\index.php (resolve_single_code_formula & resolve_all_formulas)
 */

/**
 * Phân rã một mã SKU / Combo bất kỳ (VD: "XANH03+2GOI_GLUCARE") thành danh sách mã hàng gốc và số lượng
 * @param {string} rawCode Mã SKU hoặc mã Combo trên đơn hàng
 * @param {Record<string, string>} customFormulas Bảng công thức tùy chỉnh từ DB (Product.comboFormula)
 * @returns {Record<string, number>} Đối tượng chứa { MA_HANG_GOC: so_luong }
 */
export function resolveComboFormula(rawCode, customFormulas = {}) {
  if (!rawCode) return {};
  const codeUpper = String(rawCode).trim().toUpperCase();
  if (!codeUpper) return {};

  // 1. Kiểm tra nếu đã có công thức khai báo sẵn trong bảng Product
  if (customFormulas[codeUpper]) {
    return parseFormulaString(customFormulas[codeUpper]);
  }

  // 2. Bảo vệ các cụm GLUCARE có dấu gạch dưới trước khi tách theo dấu '+'
  let normCode = codeUpper
    .replace(/(\d+)?GOI_GLUCARE/gi, "$1GOIGLU")
    .replace(/(\d+)?HOP_GLUCARE/gi, "$1HOPGLU")
    .replace(/(\d+)?LON_GLUCARE/gi, "$1LONGLU");

  const parts = normCode.split("+");
  const result = {};

  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) continue;

    const resolvedSingle = resolveSingleToken(part, customFormulas);
    for (const [compCode, qty] of Object.entries(resolvedSingle)) {
      result[compCode] = (result[compCode] || 0) + qty;
    }
  }

  return result;
}

function resolveSingleToken(token, customFormulas) {
  if (customFormulas[token]) {
    return parseFormulaString(customFormulas[token]);
  }

  let m;
  // A. Mát gan (Xanh)
  if ((m = token.match(/^(?:(\d+)\s*X\s*)?XANH(\d*)$/i))) {
    const q1 = m[1] ? parseInt(m[1], 10) : 1;
    const q2 = m[2] ? parseInt(m[2], 10) : 1;
    return { "MÁTGAN": q1 * q2 };
  }
  if ((m = token.match(/^(\d+)\s*XANH$/i))) {
    return { "MÁTGAN": parseInt(m[1], 10) };
  }
  // B. Cam
  if ((m = token.match(/^(?:(\d+)\s*X\s*)?CAM(\d*)$/i))) {
    const q1 = m[1] ? parseInt(m[1], 10) : 1;
    const q2 = m[2] ? parseInt(m[2], 10) : 1;
    return { CAM: q1 * q2 };
  }
  if ((m = token.match(/^(\d+)\s*CAM$/i))) {
    return { CAM: parseInt(m[1], 10) };
  }
  // C. Chanh leo / Tím
  if ((m = token.match(/^(?:(\d+)\s*X\s*)?(?:TIM|CHANHLEO)(\d*)$/i))) {
    const q1 = m[1] ? parseInt(m[1], 10) : 1;
    const q2 = m[2] ? parseInt(m[2], 10) : 1;
    return { CHANHLEO: q1 * q2 };
  }
  // D. Glucare Gói / Hộp / Lon
  if ((m = token.match(/^(?:(\d+)\s*X\s*)?(\d+)?\s*(?:GOIGLUCARE|GÓIGLUCARE|GOIGLU|GOI)$/i))) {
    const q1 = m[1] ? parseInt(m[1], 10) : 1;
    const q2 = m[2] ? parseInt(m[2], 10) : 1;
    return { "GÓIGLUCARE": q1 * q2 };
  }
  if ((m = token.match(/^(?:(\d+)\s*X\s*)?(\d+)?\s*(?:HOPGLUCARE|HỘPGLUCARE|HOPGLU|HOP)$/i))) {
    const q1 = m[1] ? parseInt(m[1], 10) : 1;
    const q2 = m[2] ? parseInt(m[2], 10) : 1;
    return { "HỘPGLUCARE": q1 * q2 };
  }
  if ((m = token.match(/^(?:(\d+)\s*X\s*)?(\d+)?\s*(?:LONGLUCARE|LONGLU|LON)$/i))) {
    const q1 = m[1] ? parseInt(m[1], 10) : 1;
    const q2 = m[2] ? parseInt(m[2], 10) : 1;
    return { LONGLUCARE: q1 * q2 };
  }
  // E. VAD (Viên An Đường), An Thảo, Ba Vì, Nano
  if ((m = token.match(/^(?:(\d+)\s*X\s*)?(VAD|ANTHAO|BAVI|NANO)(\d*)$/i))) {
    const q1 = m[1] ? parseInt(m[1], 10) : 1;
    const brand = m[2].toUpperCase();
    const q2 = m[3] ? parseInt(m[3], 10) : 1;
    return { [brand]: q1 * q2 };
  }

  return { [token]: 1 };
}

function parseFormulaString(formulaStr) {
  const res = {};
  if (!formulaStr) return res;
  for (const part of String(formulaStr).split(",")) {
    const [code, qtyStr] = part.split(":").map((s) => s.trim());
    if (code) {
      res[code.toUpperCase()] = (res[code.toUpperCase()] || 0) + (parseFloat(qtyStr) || 1);
    }
  }
  return res;
}

const PRODUCT_CATALOG_META = {
  "MÁTGAN": { name: "Trà Mát Gan Giải Độc ADDP", unit: "Hộp" },
  CAM: { name: "Viên Sủi Vitamin Cam ADDP", unit: "Tuýp" },
  CHANHLEO: { name: "Trà Thảo Mộc Chanh Leo ADDP", unit: "Hộp" },
  "GÓIGLUCARE": { name: "Sữa Hạt Tiểu Đường Glucare Plus (Gói lẻ)", unit: "Gói" },
  "HỘPGLUCARE": { name: "Sữa Hạt Tiểu Đường Glucare Plus (Hộp 20 gói)", unit: "Hộp" },
  LONGLUCARE: { name: "Sữa Hạt Tiểu Đường Glucare Plus (Lon 850g)", unit: "Lon" },
  VAD: { name: "Viên An Đường ADDP (Hộp 60 viên)", unit: "Hộp" },
  ANTHAO: { name: "Trà An Thảo Dưỡng Tâm ADDP", unit: "Hộp" },
  BAVI: { name: "Thảo Dược Xương Khớp Ba Vì", unit: "Hộp" },
  NANO: { name: " Tinh Nghệ Nano Curcumin ADDP", unit: "Hộp" },
};

/**
 * Trả về mảng danh sách sản phẩm gốc đã nhân với số lượng đơn hàng để hiển thị trên UI hoặc phiếu xuất kho
 */
export function resolveComboFormulaList(rawCode, orderQty = 1, customFormulas = {}) {
  const map = resolveComboFormula(rawCode, customFormulas);
  const multiplier = Math.max(1, Number(orderQty) || 1);
  return Object.entries(map).map(([sku, qty]) => {
    const meta = PRODUCT_CATALOG_META[sku] || { name: `Sản phẩm gốc (${sku})`, unit: "Đơn vị" };
    return {
      sku,
      name: meta.name,
      unit: meta.unit,
      quantity: qty * multiplier,
    };
  });
}
