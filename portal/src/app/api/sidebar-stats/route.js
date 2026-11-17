import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getSessionStaff } from "@/lib/auth";
import {
  filterRecordsByRbac,
  filterChannelsForStaff,
  isConversationAllowedForStaff,
} from "@/lib/rbac";
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

if (!globalThis.__ADDP_SIDEBAR_STATS_CACHE__) {
  globalThis.__ADDP_SIDEBAR_STATS_CACHE__ = new Map();
}

export async function GET(request) {
  try {
    const currentStaff = await getSessionStaff(request);
    if (!currentStaff) {
      return NextResponse.json(
        { ok: false, inboxUnreadCount: 0, careTasksCount: 0, channelsCount: 0, dailyZaloMsgLimit: DEFAULT_DAILY_ZALO_MSG_LIMIT },
        { status: 401 }
      );
    }

    const cacheKey = String(currentStaff.id || currentStaff.code || "staff");
    const cached = globalThis.__ADDP_SIDEBAR_STATS_CACHE__.get(cacheKey);
    if (cached && Date.now() - cached.ts < 20000) {
      return NextResponse.json(cached.payload);
    }

    // 1. Đếm số kênh thực tế đang ở trạng thái Connected / Active
    const allChannels = listAllChannels();
    const activeChannels = allChannels.filter((c) => {
      const st = String(c.status || "").toUpperCase();
      return st !== "DISCONNECTED" && st !== "DELETED" && st !== "INACTIVE";
    });

    const visibleChannels = filterChannelsForStaff(currentStaff, activeChannels);
    const channelsCount = visibleChannels.length;

    // 2. Đếm số khách hàng có lịch chăm sóc đến hạn / quá hạn thực tế của nhân viên hiện tại (khử trùng theo khách hàng)
    const memoryTasks = getAllCareTasks();
    const rawTasks = memoryTasks.length > 0 ? memoryTasks : readPersistedTasksFallback();
    const scopedTasks = filterRecordsByRbac(currentStaff, rawTasks, "tasks");
    const todayStr = new Date().toISOString().slice(0, 10);
    const dueCustomerKeys = new Set();
    for (const t of scopedTasks) {
      if (!t || t.isCompleted) continue;
      const dl = t.deadline ? String(t.deadline).slice(0, 10) : todayStr;
      if (dl <= todayStr) {
        const custKey = String(t.customerId || t.customerPhone || t.id || "").trim();
        if (custKey) dueCustomerKeys.add(custKey);
      }
    }
    const careTasksCount = dueCustomerKeys.size;

    // 3. Đếm số hội thoại có tin nhắn chưa đọc thực tế trên các kênh được phân quyền
    let inboxUnreadCount = 0;
    if (visibleChannels.length > 0) {
      try {
        const omnichannelConvs = await Promise.race([
          getOmnichannelConversations(false),
          new Promise((resolve) => setTimeout(() => resolve([]), 1500)),
        ]);
        inboxUnreadCount = (omnichannelConvs || []).filter((c) => {
          const unread = Number(c.unreadCount || c.unread || 0);
          if (unread <= 0) return false;
          return isConversationAllowedForStaff(currentStaff, c, activeChannels);
        }).length;
      } catch {
        inboxUnreadCount = 0;
      }
    }

    const payload = {
      ok: true,
      inboxUnreadCount,
      careTasksCount,
      channelsCount,
      dailyZaloMsgLimit: DEFAULT_DAILY_ZALO_MSG_LIMIT,
    };
    globalThis.__ADDP_SIDEBAR_STATS_CACHE__.set(cacheKey, {
      ts: Date.now(),
      payload,
    });
    return NextResponse.json(payload);
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
