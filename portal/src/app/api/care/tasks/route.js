import { NextResponse } from "next/server";
import {
  getAllCustomers,
  updateCustomer,
} from "@/lib/customerIdentityResolver";
import { getAllCareTasks, savePersistedTasks } from "@/lib/careAutomation";
import { getSessionStaff, listAllStaff } from "@/lib/auth";
import { filterRecordsByRbac } from "@/lib/rbac";
import {
  getLegacySyncMeta,
  recordCrmCareCompletionMetric,
} from "@/lib/legacyKhachhangSync";

export const dynamic = "force-dynamic";

function computePriorityForRow(cust, pendingTask) {
  const todayStr = new Date().toISOString().slice(0, 10);

  if (cust.lastInteractionDate) {
    const lastDateStr = String(cust.lastInteractionDate).slice(0, 10);
    if (lastDateStr === todayStr) {
      return { priority: 99, label: "Đã CS hôm nay", daysText: "Đã CS hôm nay" };
    }
  }

  if (!pendingTask) {
    return { priority: 10, label: "Chưa có hẹn", daysText: "" };
  }

  const dlStr = String(pendingTask.deadline || "").slice(0, 10);
  const dl = new Date(`${dlStr}T00:00:00`);
  const today = new Date(`${todayStr}T00:00:00`);
  const diffDays = Number.isFinite(dl.getTime())
    ? Math.round((dl.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  let daysText = "";
  if (diffDays === 0) daysText = "Hôm nay";
  else if (diffDays < 0) daysText = `Quá hạn ${Math.abs(diffDays)} ngày`;
  else if (diffDays < 900) daysText = `Còn ${diffDays} ngày`;

  const isRunningOut =
    pendingTask.taskType === "HALF_USAGE" ||
    pendingTask.taskType === "TWO_THIRD_USAGE" ||
    String(pendingTask.title || "").includes("2/3");
  const isDay3 = pendingTask.taskType === "DAY_3";

  let isRecentlyDelivered = false;
  if (
    cust.latestOrderDeliveryStatus &&
    cust.latestOrderDeliveryStatus.toLowerCase().includes("thành công") &&
    cust.latestOrderDeliveredDate
  ) {
    const deliv = new Date(cust.latestOrderDeliveredDate);
    const diff = (Date.now() - deliv.getTime()) / (1000 * 60 * 60 * 24);
    if (diff <= 5) isRecentlyDelivered = true;
  }

  let priority = 6;
  if (diffDays === 0 && !isDay3 && !isRunningOut && !isRecentlyDelivered) priority = 1;
  else if (isRecentlyDelivered || isDay3) priority = 2;
  else if (diffDays < 0 && !isRunningOut) priority = 3;
  else if (isRunningOut) priority = 4;
  else if (diffDays > 0) priority = 5;

  const labelMap = {
    1: "Đến hẹn chăm sóc",
    2: "Vừa nhận được hàng",
    3: "Quá hạn chăm sóc",
    4: "Sắp hết hàng",
    5: "Sắp đến hẹn",
    6: "Cần chăm sóc",
  };

  return {
    priority,
    label: labelMap[priority] || "Cần chăm sóc",
    daysText,
  };
}

export async function GET(request) {
  try {
    const allCustomers = getAllCustomers();
    const dynamicTasksStore = getAllCareTasks();
    const allStaff = listAllStaff();
    const currentStaff = await getSessionStaff(request);
    const { searchParams } = new URL(request.url);

    const staffIdParam = searchParams.get("staffId") || "ALL";
    const filterDate = searchParams.get("filterDate") || "ALL";

    // Map pending tasks by customerId
    const pendingByCustomer = new Map();
    for (const t of dynamicTasksStore) {
      if (t.isCompleted) continue;
      const key = String(t.customerId || t.customerPhone || "");
      if (!key) continue;
      const existing = pendingByCustomer.get(key);
      if (!existing || String(t.deadline) < String(existing.deadline)) {
        pendingByCustomer.set(key, t);
      }
    }

    // Build unified customer care rows (matching khachhang.addp.vn)
    const custMap = new Map();
    for (const c of allCustomers) {
      const key = String(c.id || c.phone || "");
      if (!key) continue;
      const pendingTask =
        pendingByCustomer.get(String(c.id)) ||
        pendingByCustomer.get(String(c.phone || "")) ||
        null;

      const { priority, label, daysText } = computePriorityForRow(c, pendingTask);
      const staffObj = allStaff.find((s) => Number(s.id) === Number(c.staffId));

      custMap.set(key, {
        id: c.id,
        taskId: pendingTask?.id || null,
        fullName: c.fullName || c.name || "Khách hàng",
        phone: c.phone || "",
        pathology: c.pathology || "",
        initialGlucose: c.initialGlucose ?? null,
        carePath: c.carePath || c.status || "",
        level: c.level || "",
        careStatus: c.careStatus || "",
        responseStatus: c.lastFeedbackStatus || "",
        lastNote: c.lastInteractionContent || "",
        lastInteractionDate: c.lastInteractionDate || null,
        nextCareDate: pendingTask?.deadline || "",
        taskType: pendingTask?.taskType || "",
        staffId: Number(c.staffId) || 1,
        staffName: c.staffName || staffObj?.name || "Admin Quản Trị",
        preferredZaloAccountId: c.preferredZaloAccountId || c.zaloAccountId || "",
        vpageUrl: c.vpageUrl || "",
        facebook: c.facebook || "",
        zalo: c.zalo || "",
        priority,
        priorityLabel: label,
        daysText,
      });
    }

    // Include any standalone CRM tasks whose customer isn't in custMap yet
    for (const t of dynamicTasksStore) {
      const key = String(t.customerId || t.customerPhone || t.id);
      if (!custMap.has(key)) {
        const fakeCust = {
          id: t.customerId || key,
          lastInteractionDate: t.completedAt || null,
        };
        const { priority, label, daysText } = computePriorityForRow(
          fakeCust,
          t.isCompleted ? null : t
        );
        custMap.set(key, {
          id: t.customerId || key,
          taskId: t.id,
          fullName: t.customerName || "Khách hàng",
          phone: t.customerPhone || "",
          pathology: t.customerPathology || "",
          initialGlucose: t.customerGlucose ?? null,
          carePath: t.carePath || "",
          level: "",
          careStatus: t.careStatus || "",
          responseStatus: "",
          lastNote: t.resultNote || "",
          lastInteractionDate: t.completedAt || null,
          nextCareDate: t.isCompleted ? "" : t.deadline || "",
          taskType: t.taskType || "OTHER",
          staffId: Number(t.staffId) || 1,
          staffName: t.staffName || "Admin Quản Trị",
          vpageUrl: "",
          facebook: "",
          zalo: "",
          priority,
          priorityLabel: label,
          daysText,
        });
      }
    }

    let rows = Array.from(custMap.values());
    rows = filterRecordsByRbac(currentStaff, rows, "tasks");

    if (staffIdParam !== "ALL") {
      rows = rows.filter((r) => String(r.staffId) === String(staffIdParam));
    }

    rows.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return String(a.nextCareDate || "9999").localeCompare(String(b.nextCareDate || "9999"));
    });

    // Legacy tasks array for backward compatibility
    let tasks = filterRecordsByRbac(currentStaff, [...dynamicTasksStore], "tasks");
    if (staffIdParam !== "ALL") {
      tasks = tasks.filter((t) => String(t.staffId) === String(staffIdParam));
    }
    const todayStr = new Date().toISOString().slice(0, 10);
    if (filterDate === "TODAY") {
      tasks = tasks.filter((t) => !t.isCompleted && t.deadline === todayStr);
    } else if (filterDate === "OVERDUE") {
      tasks = tasks.filter((t) => !t.isCompleted && t.deadline < todayStr);
    } else if (filterDate === "COMPLETED") {
      tasks = tasks.filter((t) => t.isCompleted);
    }

    // Metrics combining synced khachhang.addp.vn stats + CRM completions today
    const syncMeta = getLegacySyncMeta();
    const baseMetrics = syncMeta?.metrics || { monthCount: 0, weekCount: 0, todayCount: 0, byStaff: {} };
    const inc = syncMeta?.crmIncrements?.date === todayStr ? syncMeta.crmIncrements : { total: 0, byStaff: {} };

    let monthCount = baseMetrics.monthCount || 0;
    let weekCount = baseMetrics.weekCount || 0;
    let todayCount = baseMetrics.todayCount || 0;
    let dailyCareTarget = 7;
    let dailyMsgTarget = 70;

    if (staffIdParam !== "ALL") {
      const sMeta = baseMetrics.byStaff?.[String(staffIdParam)] || { monthCount: 0, weekCount: 0, todayCount: 0 };
      const sInc = Number(inc.byStaff?.[String(staffIdParam)] || 0);
      monthCount = (sMeta.monthCount || 0) + sInc;
      weekCount = (sMeta.weekCount || 0) + sInc;
      todayCount = (sMeta.todayCount || 0) + sInc;
      const st = allStaff.find((s) => String(s.id) === String(staffIdParam));
      if (st) {
        dailyCareTarget = Number(st.dailyCareTarget) || 7;
        dailyMsgTarget = Number(st.dailyMsgTarget) || 70;
      }
    } else {
      const totalInc = Number(inc.total) || 0;
      monthCount += totalInc;
      weekCount += totalInc;
      todayCount += totalInc;
    }

    return NextResponse.json({
      ok: true,
      rows,
      tasks,
      total: rows.length,
      staffs: allStaff.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        role: s.role,
        dailyCareTarget: s.dailyCareTarget || 7,
        dailyMsgTarget: s.dailyMsgTarget || 70,
      })),
      lastSyncedAt: syncMeta?.lastSyncedAt || null,
      metrics: {
        monthCount,
        weekCount,
        todayCount,
        dailyCareTarget,
        dailyMsgTarget,
        todayPending: rows.filter((r) => r.priority === 1 || r.priority === 2).length,
        overdue: rows.filter((r) => r.priority === 3).length,
        completedToday: rows.filter((r) => r.priority === 99).length,
      },
    });
  } catch (error) {
    console.error("GET /api/care/tasks error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      taskId,
      customerId,
      action,
      resultNote,
      note,
      nextCareDate,
      careStatus,
      carePath,
      responseStatus,
    } = body;

    const dynamicTasksStore = getAllCareTasks();
    const allCustomers = getAllCustomers();
    const cust = allCustomers.find(
      (c) => String(c.id) === String(customerId) || String(c.phone) === String(customerId)
    );

    if (action === "COMPLETE") {
      const nowIso = new Date().toISOString();
      const rawNote = (note !== undefined ? note : resultNote) || "";
      const fullContent = [
        careStatus ? `[${careStatus}]` : "",
        responseStatus ? `[${responseStatus}]` : "",
        rawNote,
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

      if (cust) {
        updateCustomer(cust.id, {
          ...(carePath !== undefined ? { carePath, status: carePath } : {}),
          ...(careStatus !== undefined ? { careStatus } : {}),
          ...(responseStatus !== undefined ? { lastFeedbackStatus: responseStatus } : {}),
          lastInteractionDate: nowIso,
          lastInteractionContent: fullContent || cust.lastInteractionContent || "Đã chăm sóc",
        });
      }

      // Đánh dấu hoàn thành các task đang chờ của khách hàng này
      let completedTask = null;
      for (const t of dynamicTasksStore) {
        const matchesTask = taskId && String(t.id) === String(taskId);
        const matchesCust =
          cust &&
          (String(t.customerId) === String(cust.id) ||
            (cust.phone && String(t.customerPhone) === String(cust.phone)));
        if (!t.isCompleted && (matchesTask || matchesCust)) {
          t.isCompleted = true;
          t.completedAt = nowIso;
          t.resultNote = fullContent || "Đã liên hệ tư vấn thành công.";
          if (!completedTask) completedTask = t;
        }
      }

      // Tạo lịch hẹn tiếp theo nếu có chọn ngày hẹn tiếp
      if (nextCareDate) {
        const targetStaffId = cust?.staffId || completedTask?.staffId || 1;
        const targetName = cust?.fullName || completedTask?.customerName || "Khách hàng";
        dynamicTasksStore.push({
          id: `task_${cust?.id || customerId}_followup_${Date.now()}`,
          customerId: cust?.id || customerId,
          customerName: targetName,
          customerPhone: cust?.phone || completedTask?.customerPhone || "",
          customerPathology: cust?.pathology || completedTask?.customerPathology || "",
          customerGlucose: cust?.initialGlucose ?? completedTask?.customerGlucose ?? null,
          staffId: targetStaffId,
          staffName: cust?.staffName || completedTask?.staffName || "Sale",
          taskType: "TWO_THIRD_USAGE",
          title: `Lịch hẹn chăm sóc tiếp — ${targetName}`,
          deadline: String(nextCareDate).slice(0, 10),
          suggestedMessage: `Chào ${targetName}, hôm nay theo lịch hẹn em nhắn hỏi thăm sức khỏe của mình ạ!`,
          isCompleted: false,
          completedAt: null,
          resultNote: null,
          carePath: carePath || cust?.carePath || "Cần chăm tiếp",
          careStatus: careStatus || cust?.careStatus || "",
          channel: cust?.source || completedTask?.channel || "ZALO_PERSONAL",
        });
      }

      savePersistedTasks(dynamicTasksStore);
      recordCrmCareCompletionMetric(cust?.staffId || completedTask?.staffId || 1);

      return NextResponse.json({
        ok: true,
        message: "Đã lưu kết quả chăm sóc & cập nhật lịch hẹn tiếp theo!",
      });
    }

    return NextResponse.json({ ok: false, error: "Hành động không hợp lệ" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/care/tasks error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
