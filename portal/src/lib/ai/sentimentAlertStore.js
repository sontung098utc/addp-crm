import fs from "fs";
import path from "path";
import { analyzeCustomerSentiment } from "./sentimentDetector.js";
import { setBotModeForCustomer, triggerHumanTakeover } from "../botControlStore.js";

/**
 * ADDP CRM — Sentiment Alert & Auto-Handover Store
 * Quản lý kho dữ liệu cảnh báo khách hàng cáu gắt, khiếu nại nghiêm trọng,
 * và tự động chuyển giao bot AI sang nhân viên trực (Auto-Handover).
 */

function resolveDataDir() {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, "portal", "package.json"))) {
    return path.join(cwd, "portal", ".data");
  }
  return path.join(cwd, ".data");
}

function getAlertsFilePath() {
  try {
    const dataDir = resolveDataDir();
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    return path.join(dataDir, "sentiment_alerts.json");
  } catch (err) {
    console.error("[SENTIMENT_ALERT_DIR_ERR]", err.message);
    return null;
  }
}

function loadAlertsFromDisk() {
  try {
    const filePath = getAlertsFilePath();
    if (filePath && fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      if (parsed && Array.isArray(parsed.alerts)) {
        return parsed.alerts;
      }
    }
  } catch (err) {
    console.error("[SENTIMENT_ALERTS_LOAD_ERR]", err.message);
  }
  return [];
}

function saveAlertsToDisk(alerts) {
  try {
    const filePath = getAlertsFilePath();
    if (!filePath) return;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(alerts, null, 2), "utf8");
  } catch (err) {
    console.error("[SENTIMENT_ALERTS_SAVE_ERR]", err.message);
  }
}

function getStore() {
  if (!globalThis.__addpSentimentAlerts) {
    globalThis.__addpSentimentAlerts = loadAlertsFromDisk();
  }
  return globalThis.__addpSentimentAlerts;
}

/**
 * Xác định mức độ nghiêm trọng (Severity) dựa trên phân tích sắc thái
 */
function determineSeverity(sentimentResult) {
  if (sentimentResult.status === "ANGRY" || sentimentResult.score >= 0.85) {
    return "CRITICAL";
  }
  if (sentimentResult.status === "COMPLAINT" || sentimentResult.score >= 0.65) {
    return "HIGH";
  }
  if (sentimentResult.status === "NEGATIVE") {
    return "MEDIUM";
  }
  return "LOW";
}

/**
 * Ghi nhận một cảnh báo sắc thái (Sentiment Alert) vào hệ thống
 * và tự động tắt bot AI / chuyển giao nhân viên nếu phát hiện cáu gắt.
 *
 * @param {object} param0
 * @param {string} param0.customerId
 * @param {string} [param0.customerName]
 * @param {string} [param0.customerPhone]
 * @param {string} [param0.channelId]
 * @param {string} [param0.threadId]
 * @param {string} [param0.messageId]
 * @param {string} param0.messageText
 * @param {object} param0.sentimentResult - Kết quả từ analyzeCustomerSentiment()
 * @param {string} [param0.staffId]
 * @param {boolean} [param0.autoHandover=true]
 * @returns {{ alert: object, handoverTriggered: boolean, handoverResult: object|null }}
 */
export function recordSentimentAlert({
  customerId = "",
  customerName = "",
  customerPhone = "",
  channelId = "DEFAULT",
  threadId = "",
  messageId = "",
  messageText = "",
  sentimentResult = null,
  staffId = null,
  autoHandover = true,
} = {}) {
  const store = getStore();
  const sentiment = sentimentResult || analyzeCustomerSentiment(messageText);
  const now = Date.now();
  const alertId = `alert_${now}_${Math.random().toString(36).substring(2, 8)}`;
  const effectiveThreadId = threadId || customerId || "";
  const severity = determineSeverity(sentiment);

  // Kiểm tra điều kiện tự động chuyển giao (Auto-Handover):
  // 1. sentiment.requiresHandover === true
  // 2. Hoặc status là ANGRY
  // 3. Hoặc COMPLAINT với score >= 0.70
  let handoverTriggered = false;
  let handoverResult = null;

  const shouldHandover =
    autoHandover &&
    (sentiment.requiresHandover ||
      sentiment.status === "ANGRY" ||
      (sentiment.status === "COMPLAINT" && sentiment.score >= 0.7));

  if (shouldHandover) {
    try {
      // 1. Khóa bot cấp hội thoại / khách hàng qua setBotModeForCustomer
      if (typeof setBotModeForCustomer === "function" && (customerId || effectiveThreadId)) {
        handoverResult = setBotModeForCustomer(
          channelId,
          customerId || effectiveThreadId,
          "HUMAN",
          `SENTIMENT_ALERT_${sentiment.status}_SCORE_${sentiment.score}`,
          staffId || "AUTO_SENTIMENT_GUARD"
        );
      }

      // 2. Khóa bot cho threadId nếu có
      if (effectiveThreadId && typeof triggerHumanTakeover === "function") {
        triggerHumanTakeover(effectiveThreadId, staffId || "AUTO_SENTIMENT_GUARD", 1440); // Tạm dừng 24h
      }

      handoverTriggered = true;
      console.log(
        `[SENTIMENT_AUTO_HANDOVER] Brand protected! Switched bot to HUMAN for customer=${customerId || effectiveThreadId}, reason=${sentiment.reasons.join("; ")}`
      );
    } catch (err) {
      console.error("[SENTIMENT_AUTO_HANDOVER_ERR]", err.message);
    }
  }

  const alertRecord = {
    id: alertId,
    customerId: String(customerId || "").trim(),
    customerName: String(customerName || "").trim(),
    customerPhone: String(customerPhone || "").trim(),
    channelId: String(channelId || "DEFAULT").trim(),
    threadId: String(effectiveThreadId || "").trim(),
    messageId: String(messageId || "").trim(),
    messageText: String(messageText || "").trim(),
    sentiment: {
      status: sentiment.status,
      score: sentiment.score,
      polarity: sentiment.polarity,
      confidence: sentiment.confidence,
      requiresHandover: sentiment.requiresHandover,
      isMedicalSymptomOnly: Boolean(sentiment.isMedicalSymptomOnly),
      matchedCategories: sentiment.matchedCategories || [],
      matchedKeywords: sentiment.matchedKeywords || [],
      reasons: sentiment.reasons || [],
      detectedSymptoms: sentiment.detectedSymptoms || [],
    },
    severity,
    status: "ACTIVE", // ACTIVE | ACKNOWLEDGED | RESOLVED
    autoHandoverTriggered: handoverTriggered,
    handoverResult: handoverResult ? { mode: handoverResult.mode, pausedUntil: handoverResult.pausedUntil } : null,
    staffId: staffId || null,
    note: null,
    createdAt: now,
    updatedAt: now,
    acknowledgedAt: null,
    acknowledgedBy: null,
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null,
  };

  store.unshift(alertRecord);
  // Giới hạn lưu trữ 1000 alerts gần nhất
  if (store.length > 1000) {
    store.splice(1000);
  }
  saveAlertsToDisk(store);

  return {
    alert: alertRecord,
    handoverTriggered,
    handoverResult,
  };
}

/**
 * Xử lý trực tiếp tin nhắn khách hàng: Phân tích sắc thái,
 * nếu phát hiện cáu gắt / khiếu nại gay gắt thì tự động ghi nhận cảnh báo và ngắt bot.
 *
 * @param {object} param0
 * @returns {{ sentiment: object, alert: object|null, handoverTriggered: boolean }}
 */
export function processMessageForSentimentAlert({
  messageText = "",
  customerId = "",
  customerName = "",
  customerPhone = "",
  channelId = "DEFAULT",
  threadId = "",
  messageId = "",
  staffId = null,
} = {}) {
  const sentiment = analyzeCustomerSentiment(messageText);

  // Chỉ ghi nhận alert và ngắt bot khi cần chuyển giao hoặc có tín hiệu tiêu cực đáng lưu tâm
  if (
    sentiment.requiresHandover ||
    sentiment.status === "ANGRY" ||
    (sentiment.status === "COMPLAINT" && sentiment.score >= 0.65)
  ) {
    const recordRes = recordSentimentAlert({
      customerId,
      customerName,
      customerPhone,
      channelId,
      threadId,
      messageId,
      messageText,
      sentimentResult: sentiment,
      staffId,
      autoHandover: true,
    });

    return {
      sentiment,
      alert: recordRes.alert,
      handoverTriggered: recordRes.handoverTriggered,
    };
  }

  return {
    sentiment,
    alert: null,
    handoverTriggered: false,
  };
}

/**
 * Lấy danh sách các cảnh báo sắc thái theo bộ lọc
 *
 * @param {object} [filters={}]
 * @param {string} [filters.channelId]
 * @param {string} [filters.customerId]
 * @param {'ACTIVE'|'ACKNOWLEDGED'|'RESOLVED'|'ALL'} [filters.status='ACTIVE']
 * @param {string} [filters.severity]
 * @param {number} [filters.limit=50]
 * @param {number} [filters.offset=0]
 * @returns {object[]}
 */
export function getSentimentAlerts({
  channelId = "",
  customerId = "",
  status = "ACTIVE",
  severity = "",
  limit = 50,
  offset = 0,
} = {}) {
  const store = getStore();
  let results = [...store];

  if (channelId) {
    const cid = String(channelId).trim().toLowerCase();
    results = results.filter((a) => String(a.channelId || "").toLowerCase() === cid);
  }

  if (customerId) {
    const uid = String(customerId).trim().toLowerCase();
    results = results.filter(
      (a) =>
        String(a.customerId || "").toLowerCase() === uid ||
        String(a.threadId || "").toLowerCase() === uid ||
        String(a.customerPhone || "").includes(uid)
    );
  }

  if (status && status !== "ALL") {
    const st = String(status).trim().toUpperCase();
    results = results.filter((a) => a.status === st);
  }

  if (severity) {
    const sev = String(severity).trim().toUpperCase();
    results = results.filter((a) => a.severity === sev);
  }

  // Sắp xếp mới nhất lên đầu
  results.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const safeOffset = Math.max(0, Number(offset) || 0);
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));

  return results.slice(safeOffset, safeOffset + safeLimit);
}

/**
 * Nhân viên xác nhận đã tiếp nhận xử lý cảnh báo (Acknowledge)
 */
export function acknowledgeSentimentAlert(alertId, staffId = "STAFF", note = "") {
  const store = getStore();
  const alert = store.find((a) => a.id === alertId);
  if (!alert) {
    return { ok: false, error: "Alert not found" };
  }

  const now = Date.now();
  alert.status = "ACKNOWLEDGED";
  alert.acknowledgedAt = now;
  alert.acknowledgedBy = String(staffId || "STAFF");
  if (note) alert.note = String(note);
  alert.updatedAt = now;

  saveAlertsToDisk(store);
  return { ok: true, alert };
}

/**
 * Nhân viên đánh dấu đã giải quyết xong sự vụ (Resolve)
 */
export function resolveSentimentAlert(alertId, staffId = "STAFF", resolutionNote = "") {
  const store = getStore();
  const alert = store.find((a) => a.id === alertId);
  if (!alert) {
    return { ok: false, error: "Alert not found" };
  }

  const now = Date.now();
  alert.status = "RESOLVED";
  alert.resolvedAt = now;
  alert.resolvedBy = String(staffId || "STAFF");
  alert.resolutionNote = String(resolutionNote || "Đã giải quyết xong sự vụ");
  alert.updatedAt = now;

  saveAlertsToDisk(store);
  return { ok: true, alert };
}

/**
 * Lấy số liệu thống kê cảnh báo sắc thái
 */
export function getSentimentAlertStats() {
  const store = getStore();
  const total = store.length;
  let active = 0;
  let acknowledged = 0;
  let resolved = 0;
  let criticalCount = 0;
  let angryCount = 0;
  let complaintCount = 0;
  let todayCount = 0;

  const startOfToday = new Date().setHours(0, 0, 0, 0);

  for (const a of store) {
    if (a.status === "ACTIVE") active++;
    else if (a.status === "ACKNOWLEDGED") acknowledged++;
    else if (a.status === "RESOLVED") resolved++;

    if (a.severity === "CRITICAL") criticalCount++;
    if (a.sentiment?.status === "ANGRY") angryCount++;
    if (a.sentiment?.status === "COMPLAINT") complaintCount++;

    if (a.createdAt >= startOfToday) todayCount++;
  }

  return {
    total,
    active,
    acknowledged,
    resolved,
    criticalCount,
    angryCount,
    complaintCount,
    todayCount,
    lastAlertAt: store[0]?.createdAt || null,
  };
}

/**
 * Xóa dữ liệu phục vụ kiểm thử (Test only)
 */
export function _clearAlertsForTesting() {
  globalThis.__addpSentimentAlerts = [];
  saveAlertsToDisk([]);
}
