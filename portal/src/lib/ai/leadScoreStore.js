/**
 * ADDP Omnichannel AI CRM — Lead Score Store & MariaDB/JSON Persistence
 * Tuân thủ Điều 2, Điều 3 & Điều 5 AGENTS.md.
 *
 * Chức năng:
 * 1. Bộ nhớ đệm (Memory Cache) & Ghi đĩa (.data/lead_scores.json) đảm bảo tốc độ phản hồi 0ms.
 * 2. Đồng bộ tự động với Hồ sơ Khách Hàng 360 (customerStore / customerIdentityResolver).
 * 3. Hỗ trợ MariaDB persistence nếu cấu hình (graceful fallback sang JSON nếu MariaDB offline).
 * 4. Tự động tính toán lại điểm số khi nhận tin nhắn mới và cập nhật Tag phân hạng (#Lead_HOT, #Lead_WARM, #Lead_COLD).
 */

import fs from "fs";
import path from "path";
import { evaluateLeadScore, LEAD_TIERS, LEAD_ACTIONS } from "./leadScorer.js";
import {
  getCustomerById,
  updateCustomer,
  getAllCustomers,
  normalizePhone,
} from "../customerIdentityResolver.js";
import { runMariaDbSql, sqlEscape } from "../mariadbClient.js";

function resolveDataDir() {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, "portal", "package.json"))) {
    return path.join(cwd, "portal", ".data");
  }
  return path.join(cwd, ".data");
}

function getLeadScoresFilePath() {
  try {
    const dataDir = resolveDataDir();
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    return path.join(dataDir, "lead_scores.json");
  } catch {
    return null;
  }
}

function loadPersistedLeadScores() {
  const filePath = getLeadScoresFilePath();
  if (!filePath || !fs.existsSync(filePath)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (err) {
    console.error("[LEAD_SCORE_STORE_LOAD_ERR]", err.message);
  }
  return {};
}

function savePersistedLeadScores(store) {
  const filePath = getLeadScoresFilePath();
  if (!filePath) return false;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(store, null, 2), "utf8");
    return true;
  } catch (err) {
    console.error("[LEAD_SCORE_STORE_SAVE_ERR]", err.message);
    return false;
  }
}

// In-memory cache for ultra-fast access
let memoryScoresCache = loadPersistedLeadScores();

// Flag kiểm tra khởi tạo MariaDB schema
let mariaDbTableChecked = false;

function ensureMariaDbTable() {
  if (mariaDbTableChecked) return;
  mariaDbTableChecked = true;
  try {
    const ddl = `
      CREATE TABLE IF NOT EXISTS customer_lead_scores (
        customer_id VARCHAR(64) PRIMARY KEY,
        score INT NOT NULL DEFAULT 0,
        tier VARCHAR(16) NOT NULL DEFAULT 'COLD',
        factors TEXT,
        suggested_action VARCHAR(255),
        breakdown TEXT,
        customer_name VARCHAR(255),
        phone VARCHAR(32),
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    runMariaDbSql(ddl);
  } catch {}
}

/**
 * Lấy điểm số tiềm năng của một khách hàng
 * @param {string|number} customerId
 * @returns {object | null}
 */
export function getLeadScore(customerId) {
  if (!customerId) return null;
  const key = String(customerId).trim();
  const cached = memoryScoresCache[key];
  if (cached) return cached;

  // Nếu trong memory chưa có, thử tìm trong hồ sơ khách hàng
  const customer = getCustomerById(customerId);
  if (customer && customer.leadScore !== undefined) {
    const scoreItem = {
      customerId: key,
      score: Number(customer.leadScore) || 0,
      tier: customer.leadTier || (customer.leadScore >= 80 ? LEAD_TIERS.HOT : customer.leadScore >= 50 ? LEAD_TIERS.WARM : LEAD_TIERS.COLD),
      factors: Array.isArray(customer.leadFactors) ? customer.leadFactors : [],
      suggestedAction: customer.leadSuggestedAction || (customer.leadScore >= 80 ? LEAD_ACTIONS.HOT : customer.leadScore >= 50 ? LEAD_ACTIONS.WARM : LEAD_ACTIONS.COLD),
      customerName: customer.fullName || "",
      phone: customer.phone || "",
      updatedAt: customer.leadScoreUpdatedAt || new Date().toISOString(),
    };
    memoryScoresCache[key] = scoreItem;
    return scoreItem;
  }

  return null;
}

/**
 * Lưu và đồng bộ điểm số tiềm năng cho khách hàng
 * @param {string|number} customerId
 * @param {object} scoreData
 * @param {object} [metadata]
 * @returns {object}
 */
export function saveLeadScore(customerId, scoreData = {}, metadata = {}) {
  if (!customerId) {
    throw new Error("customerId là bắt buộc để lưu điểm tiềm năng.");
  }

  const key = String(customerId).trim();
  const score = Number(scoreData.score) || 0;
  const tier = scoreData.tier || (score >= 80 ? LEAD_TIERS.HOT : score >= 50 ? LEAD_TIERS.WARM : LEAD_TIERS.COLD);
  const suggestedAction = scoreData.suggestedAction || (score >= 80 ? LEAD_ACTIONS.HOT : score >= 50 ? LEAD_ACTIONS.WARM : LEAD_ACTIONS.COLD);
  const factors = Array.isArray(scoreData.factors) ? scoreData.factors : [];
  const breakdown = scoreData.breakdown || {};
  const evaluatedAt = scoreData.evaluatedAt || new Date().toISOString();

  const customerName = metadata.customerName || metadata.fullName || "";
  const phone = normalizePhone(metadata.phone || "") || "";

  const record = {
    customerId: key,
    score,
    tier,
    factors,
    suggestedAction,
    breakdown,
    customerName,
    phone,
    updatedAt: evaluatedAt,
  };

  // 1. Cập nhật Memory Cache
  memoryScoresCache[key] = record;

  // 2. Persist ra file JSON
  savePersistedLeadScores(memoryScoresCache);

  // 3. Đồng bộ vào Customer Store
  try {
    const customer = getCustomerById(customerId);
    if (customer) {
      const currentTags = Array.isArray(customer.tags) ? [...customer.tags] : [];
      // Xóa tag lead cũ và thêm tag lead mới
      const cleanTags = currentTags.filter((t) => !/^#Lead_(HOT|WARM|COLD)$/i.test(String(t)));
      cleanTags.push(`#Lead_${tier}`);

      updateCustomer(customerId, {
        leadScore: score,
        leadTier: tier,
        leadFactors: factors,
        leadSuggestedAction: suggestedAction,
        leadScoreUpdatedAt: evaluatedAt,
        tags: cleanTags,
      });

      if (!record.customerName && customer.fullName) {
        record.customerName = customer.fullName;
      }
      if (!record.phone && customer.phone) {
        record.phone = customer.phone;
      }
    }
  } catch (err) {
    console.error("[LEAD_SCORE_CUSTOMER_SYNC_WARN]", err.message);
  }

  // 4. Đồng bộ MariaDB nếu có
  try {
    ensureMariaDbTable();
    const sql = `
      INSERT INTO customer_lead_scores (customer_id, score, tier, factors, suggested_action, breakdown, customer_name, phone, updated_at)
      VALUES (${sqlEscape(key)}, ${score}, ${sqlEscape(tier)}, ${sqlEscape(JSON.stringify(factors))}, ${sqlEscape(suggestedAction)}, ${sqlEscape(JSON.stringify(breakdown))}, ${sqlEscape(record.customerName)}, ${sqlEscape(record.phone)}, NOW())
      ON DUPLICATE KEY UPDATE
        score = VALUES(score),
        tier = VALUES(tier),
        factors = VALUES(factors),
        suggested_action = VALUES(suggested_action),
        breakdown = VALUES(breakdown),
        customer_name = VALUES(customer_name),
        phone = VALUES(phone),
        updated_at = NOW();
    `;
    runMariaDbSql(sql);
  } catch {}

  return record;
}

/**
 * Tính toán lại và lưu Lead Score cho một khách hàng dựa trên lịch sử tin nhắn và hồ sơ
 * @param {string|number|object} customerOrId
 * @param {Array<object|string>|string} messages
 * @returns {object} Kết quả tính toán và lưu trữ
 */
export function recalculateAndSaveLeadScore(customerOrId, messages = []) {
  let customer = null;
  let customerId = null;

  if (customerOrId && typeof customerOrId === "object") {
    customer = customerOrId;
    customerId = customer.id || customer.code || customer.customerId;
  } else if (customerOrId) {
    customerId = customerOrId;
    customer = getCustomerById(customerId);
  }

  if (!customerId) {
    throw new Error("Không xác định được customerId để tính điểm.");
  }

  const scoreResult = evaluateLeadScore({
    messages,
    customer,
  });

  const savedRecord = saveLeadScore(customerId, scoreResult, {
    customerName: customer?.fullName || "",
    phone: customer?.phone || "",
  });

  return {
    ok: true,
    leadScore: savedRecord,
  };
}

/**
 * Lấy danh sách toàn bộ điểm tiềm năng với bộ lọc
 * @param {object} [filters]
 * @param {'HOT'|'WARM'|'COLD'} [filters.tier]
 * @param {string} [filters.search]
 * @param {number} [filters.minScore]
 * @param {number} [filters.maxScore]
 * @param {number} [filters.limit]
 * @param {number} [filters.offset]
 */
export function getAllLeadScores(filters = {}) {
  // Đồng bộ memory cache từ đĩa nếu cần
  if (Object.keys(memoryScoresCache).length === 0) {
    memoryScoresCache = loadPersistedLeadScores();
  }

  let list = Object.values(memoryScoresCache);

  // Nếu store trống, quét từ customers.json để populate
  if (list.length === 0) {
    try {
      const allCustomers = getAllCustomers();
      for (const c of allCustomers) {
        if (c.leadScore !== undefined || c.leadTier) {
          const score = Number(c.leadScore) || 0;
          const tier = c.leadTier || (score >= 80 ? LEAD_TIERS.HOT : score >= 50 ? LEAD_TIERS.WARM : LEAD_TIERS.COLD);
          const item = {
            customerId: String(c.id),
            score,
            tier,
            factors: Array.isArray(c.leadFactors) ? c.leadFactors : [],
            suggestedAction: c.leadSuggestedAction || (score >= 80 ? LEAD_ACTIONS.HOT : score >= 50 ? LEAD_ACTIONS.WARM : LEAD_ACTIONS.COLD),
            customerName: c.fullName || "",
            phone: c.phone || "",
            updatedAt: c.leadScoreUpdatedAt || c.updatedAt || new Date().toISOString(),
          };
          memoryScoresCache[String(c.id)] = item;
        }
      }
      list = Object.values(memoryScoresCache);
    } catch {}
  }

  if (filters.tier) {
    const targetTier = String(filters.tier).toUpperCase().trim();
    list = list.filter((item) => String(item.tier).toUpperCase() === targetTier);
  }

  if (filters.minScore !== undefined && !Number.isNaN(Number(filters.minScore))) {
    list = list.filter((item) => item.score >= Number(filters.minScore));
  }

  if (filters.maxScore !== undefined && !Number.isNaN(Number(filters.maxScore))) {
    list = list.filter((item) => item.score <= Number(filters.maxScore));
  }

  if (filters.search) {
    const q = String(filters.search).toLowerCase().trim();
    list = list.filter(
      (item) =>
        String(item.customerId || "").toLowerCase().includes(q) ||
        String(item.customerName || "").toLowerCase().includes(q) ||
        String(item.phone || "").includes(q)
    );
  }

  // Sắp xếp theo score giảm dần, sau đó theo thời gian cập nhật
  list.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
  });

  const total = list.length;
  const offset = Number(filters.offset) || 0;
  const limit = Number(filters.limit) || 100;
  const paginated = list.slice(offset, offset + limit);

  return {
    scores: paginated,
    total,
    summary: getLeadScoresSummary(),
  };
}

/**
 * Thống kê tổng hợp số lượng khách hàng theo từng Tier
 */
export function getLeadScoresSummary() {
  const all = Object.values(memoryScoresCache);
  let hotCount = 0;
  let warmCount = 0;
  let coldCount = 0;
  let totalScoreSum = 0;

  for (const item of all) {
    totalScoreSum += item.score || 0;
    if (item.tier === LEAD_TIERS.HOT) hotCount++;
    else if (item.tier === LEAD_TIERS.WARM) warmCount++;
    else coldCount++;
  }

  const count = all.length;
  const avgScore = count > 0 ? Math.round((totalScoreSum / count) * 10) / 10 : 0;

  return {
    totalCount: count,
    hotCount,
    warmCount,
    coldCount,
    avgScore,
  };
}

/**
 * Xóa điểm số khách hàng (phục vụ test)
 */
export function _resetLeadScoresStoreForTest() {
  memoryScoresCache = {};
  savePersistedLeadScores({});
  return memoryScoresCache;
}
