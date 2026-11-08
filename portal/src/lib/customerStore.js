/**
 * ADDP Omnichannel AI CRM — Bộ Bóc Tách Thực Thể Y Khoa & Đồng Bộ Hồ Sơ Khách Hàng 360 (Customer Store & General Entity Extractor)
 * Chuyển đổi từ Rule-based/Keyword tĩnh sang State-Tracking & Autonomous Entity Extraction áp dụng cho TOÀN BỘ KHÁCH HÀNG.
 *
 * Chức năng chính:
 * 1. `extractMedicalEntities(text, currentMedicalRecord)`: Bóc tách tự động:
 *    - `bloodSugar`: Số liệu đường huyết ("X chấm", "X phẩy", "đường X", "chỉ số X", "hơn X mmol", "X.Y")
 *    - `duration`: Thời gian mắc bệnh ("X tháng", "X năm", "mới phát hiện", "lâu năm")
 *    - `symptoms`: Mảng triệu chứng ("tê bì", "chuột rút", "mất ngủ", "tiểu đêm", "khô miệng", "mệt mỏi", "sụt cân", "sút cân", "teo cơ", "huyết áp", "mỡ máu", "tim mạch", "men gan")
 *    - `goals`: Mảng nhu cầu cốt lõi ("tăng cân", "bồi bổ", "hạ đường", "ổn đường", "giảm tiểu đêm", "ngủ ngon")
 * 2. `upsertCustomerMedicalState(...)`: Tự động định danh khách hàng qua `threadId`, `senderName`, `senderPhone`,
 *    phân tích giới tính (MALE/FEMALE) & đại từ (anh/chị), lưu trực tiếp vào `.data/customers.json` và sinh Tags tự động (`#TieuDuong`, `#DuongHuyet_7.0`, `#SutCan`...).
 */

import {
  getAllCustomers,
  resolveCustomerIdentity,
  updateCustomer,
  upsertCustomerByThreadOrPhone,
  normalizePhone,
  extractPhoneNumbersFromText,
} from "./customerIdentityResolver.js";

const FEMALE_NAME_KEYWORDS = new Set([
  "thị", "quyên", "hằng", "ý", "thảo", "trang", "nga", "mai", "lan", "vy",
  "linh", "dung", "loan", "huệ", "hoa", "yến", "ngọc", "phương", "oanh", "giang",
  "hương", "thúy", "thuý", "thủy", "thuỷ", "tiên", "nhung", "hạnh", "ngân", "trâm",
  "quỳnh", "nhi", "trinh", "diệp", "tuyết", "cúc", "đào", "liễu", "huyền", "my",
  "thư", "châu", "hiền", "lệ", "bích", "kiều", "diễm", "thắm", "hồng", "tâm",
  "vân", "nhàn", "phụng", "xuyến", "nguyệt", "thơ", "tươi", "xoan", "nương", "sương",
  "nhài", "trà", "ly", "hà", "thu",
]);

const MALE_NAME_KEYWORDS = new Set([
  "văn", "hùng", "dũng", "tùng", "tuấn", "cường", "thắng", "hoàng", "minh", "đức",
  "long", "nam", "hải", "sơn", "thành", "phúc", "trung", "trọng", "hiếu", "huy",
  "quân", "kiên", "khánh", "bình", "tài", "đạt", "lộc", "vinh", "khải", "hưng",
  "thịnh", "phát", "nghĩa", "bảo", "khang", "khoa", "phong", "vũ", "toàn",
  "hào", "luân", "tiến", "lâm", "tân", "nhật", "dương", "công", "quyết", "chiến",
]);

/**
 * Nhận diện giới tính ("FEMALE" | "MALE" | "UNKNOWN") và đại từ xưng hô ("chị" | "anh" | "mình") từ họ tên tiếng Việt
 */
export function analyzeVietnameseGenderAndPronoun(customerName = "", genderHint = "") {
  const rawName = String(customerName || "").trim();
  const normalizedGender = String(genderHint || "").toLowerCase().trim();

  const isGenericName =
    !rawName ||
    /^(khách|khách hàng|khách zalo|khách fb|bạn bè|anh\/chị|cô\/chú|user|unknown)/i.test(rawName);

  const cleanTokens = isGenericName
    ? []
    : rawName
        .replace(/[()[\].,-]/g, " ")
        .split(/\s+/)
        .map((t) => t.trim())
        .filter(Boolean);

  const shortName = cleanTokens.length > 0 ? cleanTokens[cleanTokens.length - 1] : "";
  const lowerTokens = cleanTokens.map((t) => t.toLowerCase());
  const firstToken = lowerTokens[0] || "";

  let gender = "UNKNOWN";

  if (["female", "nữ", "nu", "f", "chị", "chi", "cô", "co"].includes(normalizedGender)) {
    gender = "FEMALE";
  } else if (["male", "nam", "m", "anh", "chú", "chu"].includes(normalizedGender)) {
    gender = "MALE";
  } else if (firstToken === "chị" || firstToken === "cô") {
    gender = "FEMALE";
  } else if (firstToken === "anh" || firstToken === "chú") {
    gender = "MALE";
  } else if (lowerTokens.length > 0) {
    const givenNameLower = lowerTokens[lowerTokens.length - 1];
    if (FEMALE_NAME_KEYWORDS.has(givenNameLower)) {
      gender = "FEMALE";
    } else if (MALE_NAME_KEYWORDS.has(givenNameLower)) {
      gender = "MALE";
    } else {
      for (const token of lowerTokens) {
        if (FEMALE_NAME_KEYWORDS.has(token)) {
          gender = "FEMALE";
          break;
        }
        if (MALE_NAME_KEYWORDS.has(token)) {
          gender = "MALE";
          break;
        }
      }
    }
  }

  const pronoun = gender === "FEMALE" ? "chị" : gender === "MALE" ? "anh" : "mình";
  const capitalizedPronoun = pronoun.charAt(0).toUpperCase() + pronoun.slice(1);

  let addressWithName = pronoun;
  if (shortName) {
    if (gender === "FEMALE") {
      addressWithName = `chị ${shortName}`;
    } else if (gender === "MALE") {
      addressWithName = `anh ${shortName}`;
    } else {
      addressWithName = `mình`;
    }
  }

  const capitalizedAddressWithName =
    addressWithName.charAt(0).toUpperCase() + addressWithName.slice(1);

  return {
    gender,
    pronoun,
    shortName,
    addressWithName,
    capitalizedPronoun,
    capitalizedAddressWithName,
  };
}

const SYMPTOM_PATTERNS = [
  { label: "tê bì", regex: /(tê\s*bì|tê\s*tay|tê\s*chân|châm\s*chích|\btê\b)/i, tag: "#TeBiChanTay" },
  { label: "đau nhức xương khớp", regex: /(nhức|đau\s*lưng|mỏi\s*lưng|đau\s*xương|đau\s*khớp|xương\s*khớp)/i, tag: "#DauNhucXuongKhop" },
  { label: "chuột rút", regex: /(chuột\s*rút|co\s*cơ)/i, tag: "#ChuotRut" },
  { label: "mất ngủ", regex: /(mất\s*ngủ|khó\s*ngủ|ngủ\s*không\s*sâu|trằn\s*trọc|ngủ\s*kém)/i, tag: "#MatNgu" },
  { label: "tiểu đêm", regex: /(tiểu\s*đêm|đi\s*tiểu\s*nhiều|đái\s*đêm)/i, tag: "#TieuDem" },
  { label: "khô miệng", regex: /(khô\s*miệng|khát\s*nước|khô\s*cổ)/i, tag: "#KhoMieng" },
  { label: "thèm ngọt", regex: /(thèm\s*ngọt|thèm\s*ăn|đói\s*thèm|hay\s*đói|lúc\s*nào\s*cũng\s*đói|lk\s*nào\s*cx\s*đói|đói\s*cồn\s*cào|đói\s*lả|đói\s*bụng)/i, tag: "#ThemNgotDoiLa" },
  { label: "mệt mỏi", regex: /(mệt\s*mỏi|mệt|hụt\s*hơi|uể\s*oải|suy\s*nhược|kiệt\s*sức|suy\s*tư)/i, tag: "#MetMoi" },
  { label: "sụt cân", regex: /(sụt\s*cân|sút\s*cân|tụt\s*cân|(?:sụt|sút|tụt|giảm)\s*\d+\s*(?:cân|kg|ký)|gầy|ốm\s*đi)/i, tag: "#SutCan" },
  { label: "teo cơ", regex: /(teo\s*cơ|mất\s*cơ|nhão\s*cơ)/i, tag: "#TeoCo" },
  { label: "huyết áp", regex: /(huyết\s*áp|cao\s*huyết\s*áp|tăng\s*huyết\s*áp)/i, tag: "#HuyetAp" },
  { label: "mỡ máu", regex: /(mỡ\s*máu|cholesterol|máu\s*nhiễm\s*mỡ)/i, tag: "#MoMau" },
  { label: "tim mạch", regex: /(tim\s*mạch|nhịp\s*tim|đau\s*tức\s*ngực)/i, tag: "#TimMach" },
  { label: "men gan", regex: /(men\s*gan|gan\s*nhiễm\s*mỡ|nóng\s*gan|mẩn\s*ngứa)/i, tag: "#MenGan" },
];

const GOAL_PATTERNS = [
  { label: "tăng cân", regex: /(tăng\s*cân|lên\s*cân|béo\s*lên|tăng\s*\d+\s*(?:kg|cân))/i, tag: "#MuonTangCan" },
  { label: "bồi bổ", regex: /(bồi\s*bổ|tăng\s*sức\s*đề\s*kháng|phục\s*hồi\s*sức\s*khỏe|bổ\s*sung\s*dinh\s*dưỡng|đủ\s*chất)/i, tag: "#BoiBoTheTrang" },
  { label: "hạ đường", regex: /(hạ\s*đường|giảm\s*đường|hạ\s*chỉ\s*số)/i, tag: "#HaDuongHuyet" },
  { label: "ổn đường", regex: /(ổn\s*đường|ổn\s*định\s*đường|bình\s*ổn\s*đường|kiểm\s*soát\s*đường)/i, tag: "#OnDinhDuongHuyet" },
  { label: "giảm tiểu đêm", regex: /(giảm\s*tiểu\s*đêm|hết\s*tiểu\s*đêm|đỡ\s*tiểu\s*đêm)/i, tag: "#GiamTieuDem" },
  { label: "ngủ ngon", regex: /(ngủ\s*ngon|ngủ\s*sâu|dễ\s*ngủ|cải\s*thiện\s*giấc\s*ngủ)/i, tag: "#NguNgon" },
];

/**
 * 1. Hàm Bóc Tách Thực Thể Đa Năng Cho Mọi Khách Hàng (General Entity Extractor)
 * Phân tích linh hoạt từ ngữ tự nhiên của người Việt để trích xuất và chuẩn hóa:
 * - `bloodSugar`: "X chấm", "X phẩy", "đường X", "chỉ số X", "hơn X mmol", "X.Y"
 * - `duration`: "X tháng", "X năm", "mới phát hiện", "lâu năm"
 * - `symptoms`: Mảng triệu chứng
 * - `goals`: Mảng nhu cầu cốt lõi
 * - Kết hợp dữ liệu cũ: Trường nào chưa có thì bổ sung, trường nào khách vừa cập nhật chỉ số mới thì ghi đè.
 *
 * @param {string} text
 * @param {object} [currentMedicalRecord={}]
 * @returns {{
 *   bloodSugar: string | null,
 *   bloodSugarNumeric: number | null,
 *   duration: string | null,
 *   symptoms: string[],
 *   goals: string[],
 *   desiredWeightGain: string | null,
 *   newlyExtracted: {
 *     bloodSugar: string | null,
 *     duration: string | null,
 *     symptoms: string[],
 *     goals: string[],
 *   },
 *   autoTags: string[]
 * }}
 */
export function extractMedicalEntities(text = "", currentMedicalRecord = {}) {
  const raw = String(text || "").trim();
  const normalized = raw.toLowerCase();

  const prev = currentMedicalRecord || {};
  let newBloodSugar = null;
  let newBloodSugarNumeric = null;
  let newDuration = null;
  let newDesiredWeightGain = null;
  const newSymptoms = [];
  const newGoals = [];

  if (normalized) {
    // A. Trích xuất chỉ số đường huyết (bloodSugar)
    // Loại trừ các cụm chỉ thời gian như "6 tháng", "3 năm", "2 ngày", "5 cân", "3 kg"
    const bsPatterns = [
      // "7 chấm 5", "8 phẩy 2" -> 7.5, 8.2
      /(?:đường\s*huyết|đường|chỉ\s*số|mức|đo\s*được|khoảng|hơn|tầm|ở\s*mức)?\s*\b(\d{1,2})\s*(?:chấm|phẩy)\s*(\d{1,2})\b/i,
      // "7 chấm", "8 phẩy", "7.5 mmol", "8,5 mmol"
      /\b(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:chấm|phẩy|mmol\/l|mmol)\b/i,
      // "đường huyết anh 8.5", "đường Quyên 7", "chỉ số 6.8", "hơn 8"
      /(?:đường\s*huyết|đường|chỉ\s*số|lúc\s*đói)(?:\s+(?:của\s+)?(?:anh|chị|em|cô|chú|bác|tôi|mình|[a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+))?\s*(?:là|đang|khoảng|tầm|hơn|ở\s*mức|đo\s*được)?\s*\b(\d{1,2}(?:[.,]\d{1,2})?)\b(?!\s*(?:tháng|năm|ngày|tuần|cân|kg|ký|hộp|lon|gói|tuổi|lần|viên|ly))/i,
      // Số thập phân đứng độc lập trong câu ngắn kiểu "6.5", "8.5 bị 3 năm"
      /\b(\d{1,2}[.,]\d{1,2})\b(?!\s*(?:tháng|năm|triệu|nghìn|ngàn|k\b|đ\b|vnđ|cân|kg))/i,
    ];

    for (const pattern of bsPatterns) {
      const match = normalized.match(pattern);
      if (match) {
        let numericVal = null;
        if (match[2] !== undefined && /^\d+$/.test(match[1]) && /^\d+$/.test(match[2])) {
          numericVal = parseFloat(`${match[1]}.${match[2]}`);
        } else if (match[1]) {
          numericVal = parseFloat(String(match[1]).replace(",", "."));
        }

        // Ngưỡng đường huyết sinh lý hợp lý (3.0 -> 35.0 mmol/L)
        if (numericVal !== null && !Number.isNaN(numericVal) && numericVal >= 3.0 && numericVal <= 35.0) {
          newBloodSugarNumeric = Number(numericVal.toFixed(1));
          newBloodSugar = Number.isInteger(newBloodSugarNumeric)
            ? `${newBloodSugarNumeric}.0`
            : `${newBloodSugarNumeric}`;
          break;
        }
      }
    }

    // B. Trích xuất thời gian mắc bệnh (duration): "X tháng", "X năm", "mới phát hiện", "lâu năm"
    const durationRegex =
      /(?:mới\s*(?:bị|phát\s*hiện)?\s*)?(\d{1,2}\s*(?:tháng|năm|tuần))(?:\s*nay|\s*rồi|\s*r)?|(mới\s*phát\s*hiện|mới\s*bị|lâu\s*năm|nhiều\s*năm)/i;
    const durMatch = normalized.match(durationRegex);
    if (durMatch) {
      const rawDur = (durMatch[1] || durMatch[2] || "").trim().replace(/\s+/g, " ");
      if (rawDur) {
        if (normalized.includes("mới") && !rawDur.startsWith("mới")) {
          newDuration = `mới ${rawDur}`;
        } else {
          newDuration = rawDur;
        }
      }
    }

    // C. Trích xuất số cân muốn tăng hoặc bị sụt ("tăng 3 cân", "tụt 3 cân", "sụt 4kg")
    const weightGainMatch = normalized.match(/(?:tăng|lên|thêm)\s*(?:khoảng|tầm)?\s*(\d{1,2})\s*(?:cân|kg|ký)/i);
    if (weightGainMatch && weightGainMatch[1]) {
      newDesiredWeightGain = `${weightGainMatch[1]} kg`;
    }
    const weightLossMatch = normalized.match(/(?:sụt|sút|tụt|giảm)\s*(?:khoảng|tầm|mất)?\s*(\d{1,2})\s*(?:cân|kg|ký)/i);
    if (weightLossMatch && weightLossMatch[1] && !newDesiredWeightGain) {
      newDesiredWeightGain = `${weightLossMatch[1]} kg`;
    }

    // D. Trích xuất triệu chứng (symptoms), loại trừ các triệu chứng khách phủ định ("không tiểu đêm", "k tiểu đêm", "ko tê bì")
    for (const item of SYMPTOM_PATTERNS) {
      const m = normalized.match(item.regex);
      if (m) {
        const matchIndex = m.index || 0;
        const prefixSlice = normalized.slice(Math.max(0, matchIndex - 12), matchIndex);
        const isNegated = /(?:không|ko|k|chưa|chẳng)\s*(?:bị|có|hay)?\s*$/i.test(prefixSlice);
        if (!isNegated) {
          newSymptoms.push(item.label);
        }
      }
    }

    // E. Trích xuất nhu cầu cốt lõi (goals)
    for (const item of GOAL_PATTERNS) {
      if (item.regex.test(normalized)) {
        newGoals.push(item.label);
      }
    }
  }

  // Kết hợp với currentMedicalRecord (Ghi đè chỉ số mới nếu có, gộp mảng triệu chứng & nhu cầu)
  const mergedBloodSugar = newBloodSugar || prev.bloodSugar || null;
  const mergedBloodSugarNumeric =
    newBloodSugarNumeric ??
    (prev.bloodSugarNumeric !== undefined
      ? prev.bloodSugarNumeric
      : mergedBloodSugar
      ? parseFloat(mergedBloodSugar)
      : null);
  const mergedDuration = newDuration || prev.duration || null;
  const mergedDesiredWeightGain = newDesiredWeightGain || prev.desiredWeightGain || null;

  const mergedSymptoms = Array.from(
    new Set([...(Array.isArray(prev.symptoms) ? prev.symptoms : []), ...newSymptoms])
  );
  const mergedGoals = Array.from(
    new Set([...(Array.isArray(prev.goals) ? prev.goals : []), ...newGoals])
  );

  // Sinh danh sách Auto Tags cho Cột 3 CRM (#TieuDuong, #DuongHuyet_7.0, #SutCan...)
  const autoTags = new Set();
  if (
    mergedBloodSugar ||
    mergedDuration ||
    normalized.includes("tiểu đường") ||
    normalized.includes("đường huyết")
  ) {
    autoTags.add("#TieuDuong");
  }
  if (mergedBloodSugar) {
    autoTags.add(`#DuongHuyet_${mergedBloodSugar}`);
  }
  if (mergedDuration) {
    const cleanDurTag = mergedDuration
      .replace(/^mới\s+/i, "")
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gi, "");
    if (cleanDurTag) {
      autoTags.add(`#ThoiGian_${cleanDurTag}`);
    }
  }
  for (const sym of mergedSymptoms) {
    const found = SYMPTOM_PATTERNS.find((p) => p.label === sym);
    if (found?.tag) autoTags.add(found.tag);
  }
  for (const goal of mergedGoals) {
    const found = GOAL_PATTERNS.find((p) => p.label === goal);
    if (found?.tag) autoTags.add(found.tag);
  }

  return {
    bloodSugar: mergedBloodSugar,
    bloodSugarNumeric: mergedBloodSugarNumeric,
    duration: mergedDuration,
    symptoms: mergedSymptoms,
    goals: mergedGoals,
    desiredWeightGain: mergedDesiredWeightGain,
    updatedAt: new Date().toISOString(),
    newlyExtracted: {
      bloodSugar: newBloodSugar,
      duration: newDuration,
      symptoms: newSymptoms,
      goals: newGoals,
      desiredWeightGain: newDesiredWeightGain,
    },
    autoTags: Array.from(autoTags),
  };
}

/**
 * Tóm tắt chuỗi bệnh lý hiển thị trên Hồ sơ 360 từ `medicalRecord`
 */
export function formatPathologySummaryFromRecord(medicalRecord = {}, fallbackPathology = "") {
  const parts = [];
  if (medicalRecord.bloodSugar) {
    parts.push(`Đường huyết: ${medicalRecord.bloodSugar} mmol/L`);
  }
  if (medicalRecord.duration) {
    parts.push(`Thời gian mắc: ${medicalRecord.duration}`);
  }
  if (Array.isArray(medicalRecord.symptoms) && medicalRecord.symptoms.length > 0) {
    parts.push(`Triệu chứng: ${medicalRecord.symptoms.join(", ")}`);
  }
  if (Array.isArray(medicalRecord.goals) && medicalRecord.goals.length > 0) {
    parts.push(`Mục tiêu: ${medicalRecord.goals.join(", ")}`);
  }
  if (parts.length === 0) {
    return fallbackPathology || "Đang tư vấn dinh dưỡng tiểu đường";
  }
  return parts.join(" • ");
}

/**
 * 2. Tự Động Định Danh & Đồng Bộ Hồ Sơ Khách Hàng 360 (Universal Upsert)
 * Nhận diện khách hàng qua `threadId`, `senderName`, `senderPhone` (nếu có),
 * tự động tạo mới hoặc lấy `medicalRecord` hiện tại, chạy `extractMedicalEntities` và lưu vào `.data/customers.json`.
 */
export async function syncCustomerMedicalStateFromMessage({
  threadId = "",
  senderName = "",
  senderPhone = "",
  messageText = "",
  source = "ZALO_PERSONAL",
  avatarUrl = "",
} = {}) {
  const detectedPhones = extractPhoneNumbersFromText(messageText);
  const effectivePhone = normalizePhone(senderPhone || detectedPhones[0] || "");
  const genderInfo = analyzeVietnameseGenderAndPronoun(senderName);

  // Tìm hoặc khởi tạo hồ sơ khách hàng trong store (.data/customers.json)
  const existingOrCreated = await upsertCustomerByThreadOrPhone({
    threadId: String(threadId || "").trim(),
    phone: effectivePhone,
    fullName: senderName || "Khách Zalo",
    gender: genderInfo.gender,
    pronoun: genderInfo.pronoun,
    source,
    avatar: avatarUrl,
  });

  const currentRecord = existingOrCreated?.medicalRecord || {
    bloodSugar: existingOrCreated?.currentGlucose
      ? String(existingOrCreated.currentGlucose)
      : existingOrCreated?.initialGlucose
      ? String(existingOrCreated.initialGlucose)
      : null,
    duration: null,
    symptoms: [],
    goals: [],
  };

  const extracted = extractMedicalEntities(messageText, currentRecord);
  const pathologySummary = formatPathologySummaryFromRecord(
    extracted,
    existingOrCreated?.pathology
  );

  const mergedTags = Array.from(
    new Set([
      ...(Array.isArray(existingOrCreated?.tags) ? existingOrCreated.tags : []),
      ...extracted.autoTags,
    ])
  );

  const updatedCustomer = updateCustomer(existingOrCreated.id, {
    fullName:
      senderName &&
      !["khách", "khách zalo", "khách hàng"].includes(senderName.toLowerCase().trim())
        ? senderName
        : existingOrCreated.fullName,
    phone: effectivePhone || existingOrCreated.phone || "",
    gender:
      genderInfo.gender !== "UNKNOWN"
        ? genderInfo.gender
        : existingOrCreated.gender || "UNKNOWN",
    pronoun:
      genderInfo.pronoun !== "mình"
        ? genderInfo.pronoun
        : existingOrCreated.pronoun || "mình",
    zaloUid:
      source === "ZALO_PERSONAL" && threadId
        ? String(threadId)
        : existingOrCreated.zaloUid,
    initialGlucose:
      existingOrCreated.initialGlucose ||
      extracted.bloodSugarNumeric ||
      null,
    currentGlucose:
      extracted.bloodSugarNumeric ||
      existingOrCreated.currentGlucose ||
      null,
    pathology: pathologySummary,
    medicalRecord: {
      bloodSugar: extracted.bloodSugar,
      bloodSugarNumeric: extracted.bloodSugarNumeric,
      duration: extracted.duration,
      symptoms: extracted.symptoms,
      goals: extracted.goals,
      desiredWeightGain: extracted.desiredWeightGain,
      updatedAt: extracted.updatedAt,
    },
    tags: mergedTags,
  });

  return {
    customer: updatedCustomer || existingOrCreated,
    medicalRecord: updatedCustomer?.medicalRecord || extracted,
    extracted,
    genderInfo,
  };
}

export {
  getAllCustomers,
  resolveCustomerIdentity,
  updateCustomer,
  upsertCustomerByThreadOrPhone,
};
