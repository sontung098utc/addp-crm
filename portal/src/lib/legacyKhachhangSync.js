import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import {
  getCustomersFilePath,
  getAllCustomers,
  normalizePhone,
} from "./customerIdentityResolver.js";
import { getAllCareTasks, savePersistedTasks } from "./careAutomation.js";
import { listAllStaff, createStaffRecord, updateStaffRecord } from "./auth.js";

/**
 * ADDP Omnichannel AI CRM — Đồng bộ dữ liệu từ hệ thống cũ khachhang.addp.vn (MySQL addp_khachhang)
 * Đọc trực tiếp từ MySQL trên cùng server (qua LEGACY_KHACHHANG_DATABASE_URL hoặc .env của khachhang.addp.vn)
 * để đồng bộ 100% Nhân sự, Khách hàng, Lịch hẹn chăm sóc, Lịch sử tương tác & Chỉ số KPI.
 */

function getDataFilePath(fileName) {
  const dataDir =
    process.env.DATA_DIR ||
    (fs.existsSync(path.join(process.cwd(), "portal", "package.json"))
      ? "portal/.data"
      : ".data");
  return path.isAbsolute(dataDir)
    ? path.join(dataDir, fileName)
    : path.join(process.cwd(), dataDir, fileName);
}

export function getLegacySyncMeta() {
  try {
    const filePath = getDataFilePath("legacy_sync_meta.json");
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
    }
  } catch {}
  return {
    lastSyncedAt: null,
    metrics: {
      monthCount: 0,
      weekCount: 0,
      todayCount: 0,
      byStaff: {},
    },
    crmIncrements: {
      date: new Date().toISOString().slice(0, 10),
      month: new Date().toISOString().slice(0, 7),
      total: 0,
      byStaff: {},
    },
  };
}

export function saveLegacySyncMeta(meta) {
  try {
    const filePath = getDataFilePath("legacy_sync_meta.json");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(meta, null, 2), "utf8");
  } catch {}
}

export function recordCrmCareCompletionMetric(staffId) {
  const meta = getLegacySyncMeta();
  const todayStr = new Date().toISOString().slice(0, 10);
  const monthStr = todayStr.slice(0, 7);

  if (!meta.crmIncrements || meta.crmIncrements.date !== todayStr) {
    meta.crmIncrements = {
      date: todayStr,
      month: monthStr,
      total: 0,
      byStaff: {},
    };
  }
  meta.crmIncrements.total = (Number(meta.crmIncrements.total) || 0) + 1;
  const sid = String(staffId || "1");
  meta.crmIncrements.byStaff[sid] = (Number(meta.crmIncrements.byStaff[sid]) || 0) + 1;
  saveLegacySyncMeta(meta);
}

function resolveLegacyDatabaseUrl() {
  if (process.env.LEGACY_KHACHHANG_DATABASE_URL) {
    return process.env.LEGACY_KHACHHANG_DATABASE_URL.trim();
  }
  const envCandidates = [
    "/home/addp/domains/khachhang.addp.vn/public_html/.env",
    "/home/addp/domains/khachhang.addp.vn/.env",
    path.resolve("C:\\QuanlyKH\\.env"),
  ];
  for (const envPath of envCandidates) {
    try {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, "utf8");
        const match = content.match(/DATABASE_URL\s*=\s*["']?([^"'\r\n]+)["']?/);
        if (match && match[1]) {
          return match[1].trim();
        }
      }
    } catch {}
  }
  return "";
}

function parseMysqlUrl(dbUrl) {
  const cleaned = dbUrl.replace(/^mysql:\/\//i, "");
  const [authPart, rest] = cleaned.split("@");
  if (!authPart || !rest) throw new Error("Định dạng DATABASE_URL không hợp lệ.");
  const colonIdx = authPart.indexOf(":");
  const user = decodeURIComponent(colonIdx >= 0 ? authPart.slice(0, colonIdx) : authPart);
  const password = decodeURIComponent(colonIdx >= 0 ? authPart.slice(colonIdx + 1) : "");
  const [hostPort, dbAndQuery] = rest.split("/");
  const [host, portStr] = hostPort.split(":");
  const database = (dbAndQuery || "").split("?")[0];
  return {
    host: host || "localhost",
    port: portStr || "3306",
    user,
    password,
    database,
  };
}

function queryMysqlJsonRows(conn, sql) {
  const args = [
    `-h${conn.host}`,
    `-P${conn.port}`,
    `-u${conn.user}`,
    ...(conn.password ? [`-p${conn.password}`] : []),
    "--default-character-set=utf8mb4",
    "-B",
    "-N",
    "-r",
    conn.database,
    "-e",
    sql,
  ];
  const output = execFileSync("mysql", args, {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    timeout: 30000,
  });
  return String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function extractFeedbackStatus(content = "") {
  const text = String(content || "");
  if (text.includes("Đã phản hồi")) return "Đã phản hồi";
  if (text.includes("Chưa phản hồi")) return "Chưa phản hồi";
  return "";
}

export async function syncFromLegacyKhachhang() {
  const dbUrl = resolveLegacyDatabaseUrl();
  if (!dbUrl) {
    return {
      ok: false,
      error:
        "Không tìm thấy cấu hình kết nối MySQL của khachhang.addp.vn (LEGACY_KHACHHANG_DATABASE_URL hoặc /home/addp/domains/khachhang.addp.vn/public_html/.env).",
    };
  }

  let conn;
  try {
    conn = parseMysqlUrl(dbUrl);
  } catch (err) {
    return { ok: false, error: err.message };
  }

  try {
    // 1. Đồng bộ Nhân sự (staff)
    const legacyStaffRows = queryMysqlJsonRows(
      conn,
      `SELECT JSON_OBJECT(
        'id', id,
        'code', code,
        'name', name,
        'role', role,
        'kpi', kpi,
        'dailyCareTarget', dailyCareTarget,
        'dailyMsgTarget', dailyMsgTarget
      ) FROM staff;`
    );

    const existingStaff = listAllStaff();
    const legacyToCrmStaffId = new Map();
    const crmStaffById = new Map();
    let staffSynced = 0;

    for (const ls of legacyStaffRows) {
      const codeUpper = String(ls.code || "").trim().toUpperCase();
      if (!codeUpper) continue;
      let matched = existingStaff.find((s) => String(s.code || "").toUpperCase() === codeUpper);
      if (!matched) {
        const created = createStaffRecord({
          code: codeUpper,
          name: ls.name || codeUpper,
          role: ls.role === "ADMIN" ? "ADMIN" : "SALE",
          dailyCareTarget: Number(ls.dailyCareTarget) || 7,
          dailyMsgTarget: Number(ls.dailyMsgTarget) || 70,
          kpiTarget: Number(ls.kpi) || 0,
        });
        if (created?.ok && created.staff) {
          matched = created.staff;
          existingStaff.push(matched);
        }
      } else {
        const updated = updateStaffRecord(matched.id, {
          name: ls.name || matched.name,
          dailyCareTarget: Number(ls.dailyCareTarget) || matched.dailyCareTarget || 7,
          dailyMsgTarget: Number(ls.dailyMsgTarget) || matched.dailyMsgTarget || 70,
        });
        if (updated?.ok && updated.staff) {
          matched = updated.staff;
        }
      }
      if (matched) {
        legacyToCrmStaffId.set(Number(ls.id), Number(matched.id));
        crmStaffById.set(Number(matched.id), matched);
        staffSynced++;
      }
    }

    // 2. Đồng bộ Khách hàng + Lịch sử CS mới nhất + Đơn hàng mới nhất
    const legacyCustomers = queryMysqlJsonRows(
      conn,
      `SELECT JSON_OBJECT(
        'id', c.id,
        'code', c.code,
        'fullName', c.fullName,
        'phone', c.phone,
        'address', c.address,
        'pathology', c.pathology,
        'initialGlucose', c.initialGlucose,
        'status', c.status,
        'level', c.level,
        'careStatus', c.careStatus,
        'staffId', c.staffId,
        'facebook', c.facebook,
        'zalo', c.zalo,
        'vpageUrl', c.vpageUrl,
        'createdAt', DATE_FORMAT(c.createdAt, '%Y-%m-%dT%H:%i:%sZ'),
        'lastInteractionDate', (SELECT DATE_FORMAT(i.interactionDate, '%Y-%m-%dT%H:%i:%sZ') FROM interaction i WHERE i.customerId = c.id ORDER BY i.interactionDate DESC LIMIT 1),
        'lastInteractionContent', (SELECT i.content FROM interaction i WHERE i.customerId = c.id ORDER BY i.interactionDate DESC LIMIT 1),
        'latestDeliveryStatus', (SELECT o.deliveryStatus FROM \`order\` o WHERE o.customerId = c.id ORDER BY o.orderDate DESC LIMIT 1),
        'latestDeliveredDate', (SELECT DATE_FORMAT(o.deliveredDate, '%Y-%m-%d') FROM \`order\` o WHERE o.customerId = c.id ORDER BY o.orderDate DESC LIMIT 1)
      ) FROM customer c;`
    );

    const existingCustomers = getAllCustomers();
    const byPhone = new Map();
    const byLegacyId = new Map();
    existingCustomers.forEach((c, idx) => {
      const p = normalizePhone(c.phone || "");
      if (p) byPhone.set(p, idx);
      if (c.legacyCustomerId) byLegacyId.set(Number(c.legacyCustomerId), idx);
    });

    const legacyCustToCrmCust = new Map();
    let customersSynced = 0;

    for (const lc of legacyCustomers) {
      const cleanPhone = normalizePhone(lc.phone || "");
      const crmStaffId = lc.staffId
        ? legacyToCrmStaffId.get(Number(lc.staffId)) || Number(lc.staffId)
        : 1;
      const staffObj = crmStaffById.get(crmStaffId);

      let idx = byLegacyId.get(Number(lc.id));
      if (idx === undefined && cleanPhone) {
        idx = byPhone.get(cleanPhone);
      }

      const lastFeedback = extractFeedbackStatus(lc.lastInteractionContent || "");
      const legacyFields = {
        legacyCustomerId: Number(lc.id),
        legacyCode: lc.code || null,
        fullName: lc.fullName || "Khách hàng ADDP",
        phone: cleanPhone || lc.phone || "",
        address: lc.address || "",
        pathology: lc.pathology || "",
        initialGlucose: lc.initialGlucose !== null ? Number(lc.initialGlucose) : null,
        carePath: lc.status || "",
        level: lc.level || "",
        careStatus: lc.careStatus || "",
        staffId: crmStaffId,
        staffName: staffObj?.name || `Sale #${crmStaffId}`,
        facebook: lc.facebook || "",
        zalo: lc.zalo || "",
        vpageUrl: lc.vpageUrl || "",
        lastInteractionDate: lc.lastInteractionDate || null,
        lastInteractionContent: lc.lastInteractionContent || "",
        lastFeedbackStatus: lastFeedback,
        latestOrderDeliveryStatus: lc.latestDeliveryStatus || "",
        latestOrderDeliveredDate: lc.latestDeliveredDate || null,
      };

      if (idx !== undefined) {
        const prev = existingCustomers[idx];
        existingCustomers[idx] = {
          ...prev,
          ...legacyFields,
          tags: Array.isArray(prev.tags) ? prev.tags : [],
          updatedAt: new Date().toISOString(),
        };
        legacyCustToCrmCust.set(Number(lc.id), existingCustomers[idx]);
      } else {
        const newCust = {
          id: `cust_legacy_${lc.id}`,
          ...legacyFields,
          source: lc.vpageUrl ? "FANPAGE_FB" : "ZALO_PERSONAL",
          tags: lc.status ? [lc.status] : [],
          totalOrders: 0,
          totalSpent: 0,
          createdAt: lc.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        existingCustomers.push(newCust);
        const newIdx = existingCustomers.length - 1;
        if (cleanPhone) byPhone.set(cleanPhone, newIdx);
        byLegacyId.set(Number(lc.id), newIdx);
        legacyCustToCrmCust.set(Number(lc.id), newCust);
      }
      customersSynced++;
    }

    const custFile = getCustomersFilePath();
    fs.mkdirSync(path.dirname(custFile), { recursive: true });
    fs.writeFileSync(custFile, JSON.stringify(existingCustomers, null, 2), "utf8");

    // 3. Đồng bộ Lịch hẹn chăm sóc (task)
    const legacyTasks = queryMysqlJsonRows(
      conn,
      `SELECT JSON_OBJECT(
        'id', t.id,
        'customerId', t.customerId,
        'staffId', t.staffId,
        'deadline', DATE_FORMAT(t.deadline, '%Y-%m-%d'),
        'taskType', t.taskType,
        'priority', t.priority,
        'channel', t.channel,
        'isCompleted', t.isCompleted,
        'createdAt', DATE_FORMAT(t.createdAt, '%Y-%m-%dT%H:%i:%sZ')
      ) FROM task t ORDER BY t.deadline ASC;`
    );

    const currentTasks = getAllCareTasks().filter(
      (t) => !String(t.id || "").startsWith("legacy_task_")
    );
    let tasksSynced = 0;

    for (const lt of legacyTasks) {
      const cust = legacyCustToCrmCust.get(Number(lt.customerId));
      if (!cust) continue;
      const crmStaffId = legacyToCrmStaffId.get(Number(lt.staffId)) || cust.staffId || 1;
      const staffObj = crmStaffById.get(crmStaffId);

      currentTasks.push({
        id: `legacy_task_${lt.id}`,
        legacyTaskId: Number(lt.id),
        customerId: cust.id,
        legacyCustomerId: Number(lt.customerId),
        customerName: cust.fullName,
        customerPhone: cust.phone,
        customerPathology: cust.pathology || "",
        customerGlucose: cust.initialGlucose,
        staffId: crmStaffId,
        staffName: staffObj?.name || cust.staffName || `Sale #${crmStaffId}`,
        taskType: lt.taskType || "OTHER",
        title: `Chăm sóc (${lt.taskType || "Hẹn"}) — ${cust.fullName}`,
        deadline: lt.deadline || new Date().toISOString().slice(0, 10),
        suggestedMessage: `Chào ${cust.fullName}, em nhắn hỏi thăm tình hình sức khỏe và việc sử dụng sản phẩm của mình ạ!`,
        isCompleted: Boolean(lt.isCompleted),
        completedAt: lt.isCompleted ? lt.createdAt : null,
        resultNote: cust.lastInteractionContent || "",
        carePath: cust.carePath || "",
        careStatus: cust.careStatus || "",
        channel: lt.channel || "ZALO_PERSONAL",
        createdAt: lt.createdAt || new Date().toISOString(),
      });
      tasksSynced++;
    }

    savePersistedTasks(currentTasks);

    // 4. Đồng bộ Thống kê Tương tác (Tháng này / Tuần này / Hôm nay theo từng nhân viên)
    const metricRows = queryMysqlJsonRows(
      conn,
      `SELECT JSON_OBJECT(
        'staffId', c.staffId,
        'monthCount', SUM(CASE WHEN YEAR(i.interactionDate) = YEAR(CURDATE()) AND MONTH(i.interactionDate) = MONTH(CURDATE()) THEN 1 ELSE 0 END),
        'weekCount', SUM(CASE WHEN YEARWEEK(i.interactionDate, 1) = YEARWEEK(CURDATE(), 1) THEN 1 ELSE 0 END),
        'todayCount', SUM(CASE WHEN DATE(i.interactionDate) = CURDATE() THEN 1 ELSE 0 END)
      ) FROM interaction i
      JOIN customer c ON i.customerId = c.id
      WHERE i.interactionDate >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
      GROUP BY c.staffId;`
    );

    let monthCount = 0;
    let weekCount = 0;
    let todayCount = 0;
    const byStaff = {};

    for (const mr of metricRows) {
      const m = Number(mr.monthCount) || 0;
      const w = Number(mr.weekCount) || 0;
      const d = Number(mr.todayCount) || 0;
      monthCount += m;
      weekCount += w;
      todayCount += d;
      const crmSid = String(legacyToCrmStaffId.get(Number(mr.staffId)) || mr.staffId || "0");
      if (!byStaff[crmSid]) byStaff[crmSid] = { monthCount: 0, weekCount: 0, todayCount: 0 };
      byStaff[crmSid].monthCount += m;
      byStaff[crmSid].weekCount += w;
      byStaff[crmSid].todayCount += d;
    }

    const meta = {
      lastSyncedAt: new Date().toISOString(),
      counts: {
        staffSynced,
        customersSynced,
        tasksSynced,
      },
      metrics: {
        monthCount,
        weekCount,
        todayCount,
        byStaff,
      },
      crmIncrements: {
        date: new Date().toISOString().slice(0, 10),
        month: new Date().toISOString().slice(0, 7),
        total: 0,
        byStaff: {},
      },
    };
    saveLegacySyncMeta(meta);

    return {
      ok: true,
      message: `Đã đồng bộ thành công từ khachhang.addp.vn: ${customersSynced} khách hàng, ${tasksSynced} lịch hẹn, ${staffSynced} nhân viên!`,
      ...meta.counts,
      metrics: meta.metrics,
      lastSyncedAt: meta.lastSyncedAt,
    };
  } catch (err) {
    console.error("[LEGACY_SYNC_ERR]", err);
    return {
      ok: false,
      error: `Lỗi truy vấn MySQL khachhang.addp.vn: ${err.message}`,
    };
  }
}
