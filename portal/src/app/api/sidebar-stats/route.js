import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getSessionStaff } from "@/lib/auth";
import { filterRecordsByRbac } from "@/lib/rbac";
import { listAllChannels } from "@/lib/connectionHub";
import { getAllCareTasks } from "@/lib/careAutomation";
import { getOmnichannelConversations } from "@/lib/unifiedMessageRouter";

function readPersistedTasksFallback() {
  try {
    const filePath = path.join(process.cwd(), ".data", "tasks.json");
    if (!fs.existsSync(filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

import { DEFAULT_DAILY_ZALO_MSG_LIMIT } from "@/lib/pilotConfig.js";

export async function GET(request) {
  try {
    const currentStaff = await getSessionStaff(request);
    if (!currentStaff) {
      return NextResponse.json(
        { ok: false, inboxUnreadCount: 0, careTasksCount: 0, channelsCount: 0, dailyZaloMsgLimit: DEFAULT_DAILY_ZALO_MSG_LIMIT },
        { status: 401 }
      );
    }

    // 1. Đếm số kênh thực tế đang ở trạng thái Connected / Active
    const allChannels = listAllChannels();
    const activeChannels = allChannels.filter((c) => {
      const st = String(c.status || "").toUpperCase();
      return st !== "DISCONNECTED" && st !== "DELETED" && st !== "INACTIVE";
    });

    const isZaloPersonal = (c) =>
      c.platform === "ZALO_PERSONAL" ||
      c.type === "zalo_personal" ||
      c.channel_type === "zalo_personal" ||
      c.type === "zalo";

    let visibleChannels = activeChannels;
    if (
      currentStaff.role !== "ADMIN" &&
      Array.isArray(currentStaff.assignedChannels)
    ) {
      const allowedSet = new Set(currentStaff.assignedChannels.map(String));
      visibleChannels = activeChannels.filter((c) => {
        if (!isZaloPersonal(c)) return true;
        const ownId = String(c.config?.ownId || c.externalId || c.id || "");
        return ownId && allowedSet.has(ownId);
      });
    }
    const channelsCount = visibleChannels.length;

    // 2. Đếm số lịch chăm sóc đến hạn / quá hạn thực tế của nhân viên hiện tại
    const memoryTasks = getAllCareTasks();
    const rawTasks = memoryTasks.length > 0 ? memoryTasks : readPersistedTasksFallback();
    const scopedTasks = filterRecordsByRbac(currentStaff, rawTasks, "tasks");
    const todayStr = new Date().toISOString().slice(0, 10);
    const careTasksCount = scopedTasks.filter(
      (t) => !t.isCompleted && (!t.deadline || String(t.deadline).slice(0, 10) <= todayStr)
    ).length;

    // 3. Đếm số hội thoại có tin nhắn chưa đọc thực tế trên các kênh đang kết nối
    let inboxUnreadCount = 0;
    if (visibleChannels.length > 0) {
      try {
        const omnichannelConvs = await Promise.race([
          getOmnichannelConversations(false),
          new Promise((resolve) => setTimeout(() => resolve([]), 1500)),
        ]);
        const activeNonZaloTypes = new Set(
          visibleChannels.filter((c) => !isZaloPersonal(c)).map((c) => c.platform)
        );
        inboxUnreadCount = (omnichannelConvs || []).filter((c) => {
          const unread = Number(c.unreadCount || c.unread || 0);
          if (unread <= 0) return false;
          if (c.channel === "FACEBOOK") return activeNonZaloTypes.has("FACEBOOK");
          return true;
        }).length;
      } catch {
        inboxUnreadCount = 0;
      }
    }

    return NextResponse.json({
      ok: true,
      inboxUnreadCount,
      careTasksCount,
      channelsCount,
      dailyZaloMsgLimit: DEFAULT_DAILY_ZALO_MSG_LIMIT,
    });
  } catch (error) {
    console.error("GET /api/sidebar-stats error:", error);
    return NextResponse.json({
      ok: true,
      inboxUnreadCount: 0,
      careTasksCount: 0,
      channelsCount: 0,
      dailyZaloMsgLimit: DEFAULT_DAILY_ZALO_MSG_LIMIT,
    });
  }
}
