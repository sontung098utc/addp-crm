import { NextResponse } from "next/server";
import { getAllCustomers, updateCustomer } from "@/lib/customerIdentityResolver";
import { getAllCareTasks, savePersistedTasks } from "@/lib/careAutomation";
import { getSessionStaff } from "@/lib/auth";
import { filterRecordsByRbac } from "@/lib/rbac";

export async function GET(request) {
  try {
    const allCustomers = getAllCustomers();
    const dynamicTasksStore = getAllCareTasks(allCustomers);

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
    const allCustomers = getAllCustomers();
    const dynamicTasksStore = getAllCareTasks(allCustomers);
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
      savePersistedTasks(dynamicTasksStore);
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
