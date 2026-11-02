import { NextResponse } from "next/server";
import { getAllCustomers, getCustomerById } from "@/lib/customerIdentityResolver";
import { buildCareSchedule } from "@/lib/careAutomation";
import { getSessionStaff } from "@/lib/auth";
import { filterRecordsByRbac } from "@/lib/rbac";

// Bộ nhớ động lưu trữ trạng thái các công việc chăm sóc hàng ngày
let dynamicTasksStore = [];

function initializeTasksIfNeeded() {
  if (dynamicTasksStore.length > 0) return;

  const customers = getAllCustomers();
  const today = new Date();

  customers.forEach((c) => {
    const schedule = buildCareSchedule({
      customerName: c.fullName,
      productName: "Sữa hạt Glucare Plus",
      startDate: c.lastOrderDate || today,
      durationDays: 30,
    });

    schedule.forEach((item, idx) => {
      // Phân bổ một số task vào hôm nay, một số task quá hạn, một số task sắp tới
      const dueDate = new Date();
      if (idx === 0) {
        dueDate.setDate(dueDate.getDate() - 1); // Quá hạn 1 ngày
      } else if (idx === 1) {
        // Hôm nay
      } else {
        dueDate.setDate(dueDate.getDate() + (idx * 2));
      }

      dynamicTasksStore.push({
        id: `task_${c.id}_${item.type}`,
        customerId: c.id,
        customerName: c.fullName,
        customerPhone: c.phone,
        customerPathology: c.pathology,
        customerGlucose: c.currentGlucose || c.initialGlucose,
        staffId: c.staffId,
        staffName: c.staffName,
        taskType: item.type,
        title: item.title,
        deadline: dueDate.toISOString().slice(0, 10),
        suggestedMessage: item.suggestedMessage,
        isCompleted: false,
        completedAt: null,
        resultNote: null,
        carePath: c.status || "Đang chăm sóc",
        channel: c.source || "ZALO_PERSONAL",
      });
    });
  });
}

export async function GET(request) {
  try {
    initializeTasksIfNeeded();

    const currentStaff = await getSessionStaff(request);
    const { searchParams } = new URL(request.url);

    const filterDate = searchParams.get("filterDate") || "TODAY"; // 'TODAY' | 'OVERDUE' | 'ALL' | 'COMPLETED'
    const staffIdParam = searchParams.get("staffId") || "ALL";

    let tasks = [...dynamicTasksStore];

    // RBAC filter
    tasks = filterRecordsByRbac(currentStaff, tasks, "tasks");

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
    } else if (filterDate === "PENDING") {
      tasks = tasks.filter((t) => !t.isCompleted);
    }

    return NextResponse.json({
      ok: true,
      tasks,
      total: tasks.length,
      metrics: {
        todayPending: dynamicTasksStore.filter((t) => !t.isCompleted && t.deadline === todayStr).length,
        overdue: dynamicTasksStore.filter((t) => !t.isCompleted && t.deadline < todayStr).length,
        completedToday: dynamicTasksStore.filter((t) => t.isCompleted).length,
      },
    });
  } catch (error) {
    console.error("GET /api/care/tasks error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    initializeTasksIfNeeded();
    const body = await request.json();
    const { taskId, action, resultNote, nextCareDate, careStatus } = body;

    const taskIndex = dynamicTasksStore.findIndex((t) => t.id === taskId);
    if (taskIndex === -1) {
      return NextResponse.json({ ok: false, error: "Không tìm thấy công việc chăm sóc" }, { status: 404 });
    }

    if (action === "COMPLETE") {
      dynamicTasksStore[taskIndex].isCompleted = true;
      dynamicTasksStore[taskIndex].completedAt = new Date().toISOString();
      dynamicTasksStore[taskIndex].resultNote = resultNote || "Đã liên hệ tư vấn thành công.";

      // Nếu có hẹn ngày chăm tiếp theo, tạo thêm task mới
      if (nextCareDate) {
        const currentTask = dynamicTasksStore[taskIndex];
        dynamicTasksStore.push({
          id: `task_${currentTask.customerId}_followup_${Date.now()}`,
          customerId: currentTask.customerId,
          customerName: currentTask.customerName,
          customerPhone: currentTask.customerPhone,
          customerPathology: currentTask.customerPathology,
          customerGlucose: currentTask.customerGlucose,
          staffId: currentTask.staffId,
          staffName: currentTask.staffName,
          taskType: "OTHER",
          title: `Lịch hẹn tái khám/nhắc đo đường huyết — ${currentTask.customerName}`,
          deadline: nextCareDate,
          suggestedMessage: `Chào ${currentTask.customerName}, hôm nay theo lịch hẹn em nhắn hỏi thăm chỉ số đường huyết của mình ạ!`,
          isCompleted: false,
          completedAt: null,
          resultNote: null,
          carePath: careStatus || "Cần chăm tiếp",
          channel: currentTask.channel,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      task: dynamicTasksStore[taskIndex],
      message: "Cập nhật tiến độ chăm sóc thành công",
    });
  } catch (error) {
    console.error("POST /api/care/tasks error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
