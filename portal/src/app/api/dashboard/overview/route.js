import { NextResponse } from "next/server";
import { getSessionStaff, listAllStaff } from "@/lib/auth";
import {
  filterRecordsByRbac,
  filterChannelsForStaff,
  isConversationAllowedForStaff,
} from "@/lib/rbac";
import { getStoredOrders } from "@/lib/ordersStore";
import { classifyOrderOutcome } from "@/lib/financialEngine";
import { getAllCustomers } from "@/lib/customerIdentityResolver";
import { getAllCareTasks } from "@/lib/careAutomation";
import { listAllChannels } from "@/lib/connectionHub";
import { getOmnichannelConversations } from "@/lib/unifiedMessageRouter";
import { getAllBroadcastCampaigns } from "@/lib/broadcastEngine";
import { getKiotVietConfig } from "@/lib/kiotvietConnector";
import { DEFAULT_DAILY_ZALO_MSG_LIMIT } from "@/lib/pilotConfig";

export const dynamic = "force-dynamic";

const CHANNEL_GROUPS = [
  { key: "KIOTVIET", name: "KiotViet POS", color: "#10b981" },
  { key: "TIKTOK_SHOP", name: "TikTok Shop", color: "#ec4899" },
  { key: "SHOPEE", name: "Shopee", color: "#f59e0b" },
  { key: "WEBSITE_MAGENTO", name: "Website Magento", color: "#f97316" },
  { key: "ZALO_FB", name: "Zalo / Facebook", color: "#3b82f6" },
];

const SEVEN_PLATFORMS = [
  { id: "ZALO_PERSONAL", name: "Zalo Cá Nhân (Multi-QR)" },
  { id: "ZALO_OA", name: "Zalo Official Account" },
  { id: "FACEBOOK", name: "Fanpage Facebook" },
  { id: "TIKTOK_SHOP", name: "TikTok Shop" },
  { id: "SHOPEE", name: "Shopee Open API" },
  { id: "KIOTVIET", name: "KiotViet POS & Kho" },
  { id: "MAGENTO", name: "Website Magento 2.4.8" },
];

const MILESTONE_LABELS = {
  DAY_1: "Ngày 1",
  DAY_3: "Ngày 3",
  DAY_7: "Ngày 7",
  DAY_14: "Ngày 14",
  DAY_21: "Ngày 21",
  HALF_USAGE: "Dùng 1/2",
  TWO_THIRD_USAGE: "Dùng 2/3",
  OTHER: "Lịch hẹn",
};

function toVnDateStr(dateInput) {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (!Number.isFinite(d.getTime())) return "";
  // Chuyển sang múi giờ Việt Nam (UTC+7)
  const vnTime = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return vnTime.toISOString().slice(0, 10);
}

function getDateRangeBounds(rangeParam) {
  const todayStr = toVnDateStr(new Date());
  const todayDate = new Date(`${todayStr}T00:00:00Z`);

  let startDate;
  if (rangeParam === "7d") {
    startDate = new Date(todayDate);
    startDate.setUTCDate(startDate.getUTCDate() - 6);
  } else if (rangeParam === "month") {
    startDate = new Date(`${todayStr.slice(0, 7)}-01T00:00:00Z`);
  } else {
    // Mặc định 30d
    startDate = new Date(todayDate);
    startDate.setUTCDate(startDate.getUTCDate() - 29);
  }

  const startStr = startDate.toISOString().slice(0, 10);
  const dates = [];
  const cursor = new Date(startDate);
  while (cursor <= todayDate) {
    const iso = cursor.toISOString().slice(0, 10);
    dates.push({
      date: iso,
      label: `${iso.slice(8, 10)}/${iso.slice(5, 7)}`,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return { startStr, endStr: todayStr, dates };
}

function mapOrderToChannelGroup(rawChannel) {
  const c = String(rawChannel || "").trim().toUpperCase();
  if (c === "KIOTVIET") return "KIOTVIET";
  if (c === "TIKTOK_SHOP" || c === "TIKTOK") return "TIKTOK_SHOP";
  if (c === "SHOPEE") return "SHOPEE";
  if (c === "WEBSITE_MAGENTO" || c === "MAGENTO" || c === "WEBSITE") return "WEBSITE_MAGENTO";
  return "ZALO_FB";
}

function normalizePlatformId(rawPlatform) {
  const p = String(rawPlatform || "").trim().toUpperCase();
  if (p === "WEBSITE_MAGENTO" || p === "MAGENTO") return "MAGENTO";
  if (p === "TIKTOK" || p === "TIKTOK_SHOP") return "TIKTOK_SHOP";
  return p;
}

export async function GET(request) {
  try {
    const staff = await getSessionStaff(request);
    if (!staff) {
      return NextResponse.json(
        { ok: false, error: "Phiên đăng nhập đã hết hạn hoặc không hợp lệ." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const rawRange = searchParams.get("range") || "30d";
    const range = ["7d", "30d", "month"].includes(rawRange) ? rawRange : "30d";

    const { startStr, endStr, dates } = getDateRangeBounds(range);
    const todayStr = endStr;

    // 1. Đơn hàng & Doanh số thực tế (tuân thủ RBAC & Điều 11)
    const allOrders = getStoredOrders();
    const scopedOrders = filterRecordsByRbac(staff, allOrders, "orders");

    const channelAgg = new Map(
      CHANNEL_GROUPS.map((g) => [
        g.key,
        { key: g.key, name: g.name, color: g.color, revenue: 0, orders: 0, validOrders: 0 },
      ])
    );

    const dailyMap = new Map(
      dates.map((d) => [
        d.date,
        {
          date: d.date,
          label: d.label,
          revenue: 0,
          orders: 0,
          byChannel: {
            KIOTVIET: 0,
            TIKTOK_SHOP: 0,
            SHOPEE: 0,
            WEBSITE_MAGENTO: 0,
            ZALO_FB: 0,
          },
        },
      ])
    );

    let totalRevenue = 0;
    let totalOrders = 0;
    let validOrdersCount = 0;
    let cancelledOrFailedCount = 0;

    for (const o of scopedOrders) {
      const orderDateStr = toVnDateStr(o.createdAt || o.createdDate || o.orderDate);
      if (!orderDateStr || orderDateStr < startStr || orderDateStr > endStr) {
        continue;
      }

      const outcome = classifyOrderOutcome(o);
      const isCancelledOrFailed =
        outcome === "CANCELLED_PRE_FULFILLMENT" ||
        outcome === "FAILED_DELIVERY" ||
        outcome === "RETURNED_AND_REFUND";

      const amount = Number(o.finalAmount ?? o.totalAmount ?? o.grossAmount ?? 0) || 0;
      const realized = isCancelledOrFailed ? 0 : amount;
      const chKey = mapOrderToChannelGroup(o.channel || o.platform);

      totalOrders += 1;
      if (isCancelledOrFailed) {
        cancelledOrFailedCount += 1;
      } else {
        validOrdersCount += 1;
      }
      totalRevenue += realized;

      const chEntry = channelAgg.get(chKey);
      if (chEntry) {
        chEntry.orders += 1;
        if (!isCancelledOrFailed) chEntry.validOrders += 1;
        chEntry.revenue += realized;
      }

      const dayEntry = dailyMap.get(orderDateStr);
      if (dayEntry) {
        dayEntry.orders += 1;
        dayEntry.revenue += realized;
        dayEntry.byChannel[chKey] = (dayEntry.byChannel[chKey] || 0) + realized;
      }
    }

    const aov = validOrdersCount > 0 ? Math.round(totalRevenue / validOrdersCount) : 0;

    const channelBreakdown = Array.from(channelAgg.values()).map((c) => ({
      ...c,
      percentage: totalRevenue > 0 ? parseFloat(((c.revenue / totalRevenue) * 100).toFixed(1)) : 0,
    }));

    const dailySeries = Array.from(dailyMap.values());

    // 2. Khách hàng 360 & Lịch chăm sóc ưu tiên (7 mốc vàng)
    const allCustomers = getAllCustomers();
    const scopedCustomers = filterRecordsByRbac(staff, allCustomers, "customers");
    const customerById = new Map();
    const customerByPhone = new Map();
    for (const c of scopedCustomers) {
      if (c.id !== undefined && c.id !== null) customerById.set(String(c.id), c);
      if (c.phone) customerByPhone.set(String(c.phone), c);
    }

    const allStaff = listAllStaff();
    const staffNameById = new Map(allStaff.map((s) => [Number(s.id), s.name]));

    const rawTasks = getAllCareTasks();
    const scopedTasks = filterRecordsByRbac(staff, rawTasks, "tasks");

    const pendingByCustomer = new Map();
    const completedTodayCustKeys = new Set();

    for (const c of scopedCustomers) {
      if (c.lastInteractionDate && String(c.lastInteractionDate).slice(0, 10) === todayStr) {
        completedTodayCustKeys.add(String(c.id || c.phone));
      }
    }

    for (const t of scopedTasks) {
      if (!t) continue;
      const custKey = String(t.customerId || t.customerPhone || t.id || "").trim();
      if (!custKey) continue;

      if (t.isCompleted) {
        if (t.completedAt && String(t.completedAt).slice(0, 10) === todayStr) {
          completedTodayCustKeys.add(custKey);
        }
        continue;
      }

      const existing = pendingByCustomer.get(custKey);
      const dl = String(t.deadline || "9999-12-31").slice(0, 10);
      if (!existing || dl < String(existing.deadline || "9999-12-31").slice(0, 10)) {
        pendingByCustomer.set(custKey, t);
      }
    }

    let dueTodayCount = 0;
    let overdueCount = 0;
    const priorityCandidates = [];

    const todayMs = new Date(`${todayStr}T00:00:00Z`).getTime();

    for (const [custKey, task] of pendingByCustomer.entries()) {
      const dl = String(task.deadline || "").slice(0, 10);
      if (!dl) continue;

      const dlMs = new Date(`${dl}T00:00:00Z`).getTime();
      const diffDays = Number.isFinite(dlMs)
        ? Math.round((dlMs - todayMs) / (1000 * 60 * 60 * 24))
        : 999;

      const isOverdue = diffDays < 0;
      const isToday = diffDays === 0;

      if (isOverdue) overdueCount += 1;
      else if (isToday) dueTodayCount += 1;

      if (diffDays <= 3) {
        const cust =
          customerById.get(String(task.customerId || "")) ||
          customerByPhone.get(String(task.customerPhone || "")) ||
          null;

        let daysText = "Hôm nay";
        if (diffDays < 0) daysText = `Quá hạn ${Math.abs(diffDays)} ngày`;
        else if (diffDays > 0) daysText = `Còn ${diffDays} ngày`;

        priorityCandidates.push({
          id: cust?.id || task.customerId || custKey,
          customerId: cust?.id || task.customerId || null,
          taskId: task.id,
          fullName: cust?.fullName || cust?.name || task.customerName || "Khách hàng",
          phone: cust?.phone || task.customerPhone || "",
          milestone: task.taskType || "OTHER",
          milestoneLabel: MILESTONE_LABELS[task.taskType] || "Lịch hẹn",
          title: task.title || "Chăm sóc khách hàng",
          deadline: dl,
          diffDays,
          daysText,
          isOverdue,
          isToday,
          pathology: cust?.pathology || task.customerPathology || "",
          staffName:
            cust?.staffName ||
            task.staffName ||
            staffNameById.get(Number(task.staffId || cust?.staffId)) ||
            "Chưa phân công",
        });
      }
    }

    priorityCandidates.sort((a, b) => {
      if (a.diffDays !== b.diffDays) return a.diffDays - b.diffDays;
      return String(a.fullName).localeCompare(String(b.fullName));
    });

    const priorityCareList = priorityCandidates.slice(0, 12);
    const dueAndOverdueTotal = dueTodayCount + overdueCount;
    const completedTodayCount = completedTodayCustKeys.size;
    const totalCareDenominator = dueAndOverdueTotal + completedTodayCount;
    const careCompletionRatePct =
      totalCareDenominator > 0
        ? Math.round((completedTodayCount / totalCareDenominator) * 100)
        : 0;

    // 3. Kênh kết nối & Hội thoại chưa đọc
    const allChannels = listAllChannels();
    const visibleChannels = filterChannelsForStaff(staff, allChannels);
    const activeChannels = allChannels.filter((c) => {
      const st = String(c.status || "").toUpperCase();
      return st !== "DISCONNECTED" && st !== "DELETED" && st !== "INACTIVE";
    });
    const visibleActiveChannels = filterChannelsForStaff(staff, activeChannels);

    let unreadConversations = 0;
    if (visibleActiveChannels.length > 0) {
      try {
        const omnichannelConvs = await Promise.race([
          getOmnichannelConversations(false),
          new Promise((resolve) => setTimeout(() => resolve([]), 1500)),
        ]);
        unreadConversations = (omnichannelConvs || []).filter((c) => {
          const unread = Number(c.unreadCount || c.unread || 0);
          if (unread <= 0) return false;
          return isConversationAllowedForStaff(staff, c, activeChannels);
        }).length;
      } catch {
        unreadConversations = 0;
      }
    }

    // 4. Trạng thái 7 nền tảng, Broadcast Queue & KiotViet Sync
    const kiotCfg = getKiotVietConfig();
    const kiotSyncCache = globalThis.__KIOTVIET_SYNC_CACHE__ || {};
    const kiotConnectedByCfg = Boolean(
      kiotCfg?.retailer && kiotCfg?.clientId && kiotCfg?.clientSecret
    );

    const platformStatuses = SEVEN_PLATFORMS.map((plat) => {
      const matching = visibleChannels.filter(
        (ch) => normalizePlatformId(ch.platform) === plat.id
      );
      const connected = matching.filter((ch) => {
        const st = String(ch.status || "").toUpperCase();
        return st !== "DISCONNECTED" && st !== "DELETED" && st !== "INACTIVE";
      });

      let connectedCount = connected.length;
      let totalCount = matching.length;
      let lastSyncAt =
        matching
          .map((m) => m.lastSyncAt || m.updatedAt)
          .filter(Boolean)
          .sort()
          .pop() || null;

      if (plat.id === "KIOTVIET" && connectedCount === 0 && kiotConnectedByCfg) {
        connectedCount = 1;
        totalCount = Math.max(1, totalCount);
        lastSyncAt = kiotSyncCache.lastSyncTime || kiotCfg.lastSyncedAt || lastSyncAt;
      }

      return {
        id: plat.id,
        name: plat.name,
        connectedAccounts: connectedCount,
        totalAccounts: totalCount,
        status: connectedCount > 0 ? "CONNECTED" : "DISCONNECTED",
        lastSyncAt,
      };
    });

    const connectedPlatformsCount = platformStatuses.filter(
      (p) => p.status === "CONNECTED"
    ).length;

    let campaigns = [];
    try {
      campaigns = getAllBroadcastCampaigns();
    } catch {
      campaigns = [];
    }

    const activeCampaigns = campaigns.filter((c) => {
      const st = String(c.status || "").toUpperCase();
      return st === "RUNNING" || st === "SCHEDULED" || st === "QUEUED";
    });

    return NextResponse.json({
      ok: true,
      range,
      period: { startDate: startStr, endDate: endStr },
      generatedAt: new Date().toISOString(),
      kpi: {
        totalRevenue,
        totalOrders,
        validOrders: validOrdersCount,
        cancelledOrFailedOrders: cancelledOrFailedCount,
        aov,
        totalCustomers: scopedCustomers.length,
        careDueToday: dueTodayCount,
        careOverdue: overdueCount,
        careCompletedToday: completedTodayCount,
        unreadConversations,
        connectedChannelsCount: visibleActiveChannels.length,
        connectedPlatformsCount,
        totalPlatformsCount: SEVEN_PLATFORMS.length,
      },
      channelBreakdown,
      dailySeries,
      priorityCareList,
      careProgress: {
        dueToday: dueTodayCount,
        overdue: overdueCount,
        dueAndOverdue: dueAndOverdueTotal,
        completedToday: completedTodayCount,
        totalPending: pendingByCustomer.size,
        completionRatePct: careCompletionRatePct,
      },
      systemStatus: {
        platforms: platformStatuses,
        antiBan: {
          minDelaySec: 45,
          maxDelaySec: 120,
          dailyMsgLimit: DEFAULT_DAILY_ZALO_MSG_LIMIT,
        },
        broadcast: {
          totalCampaigns: campaigns.length,
          runningCount: activeCampaigns.length,
          activeCampaigns: activeCampaigns.slice(0, 3).map((c) => ({
            id: c.id,
            name: c.name,
            status: c.status,
            sentCount: Number(c.sentCount) || 0,
            totalRecipients: Number(c.totalRecipients) || 0,
            progressPercent: Number(c.progressPercent) || 0,
          })),
        },
        kiotvietSync: {
          connected: kiotConnectedByCfg || connectedPlatformsCount > 0,
          isSyncing: Boolean(kiotSyncCache.isSyncing),
          lastSyncTime: kiotSyncCache.lastSyncTime || kiotCfg.lastSyncedAt || null,
        },
      },
    });
  } catch (error) {
    console.error("[GET /api/dashboard/overview ERROR]", error);
    return NextResponse.json(
      { ok: false, error: "Không thể tải dữ liệu tổng quan Trung Tâm Điều Hành." },
      { status: 500 }
    );
  }
}
