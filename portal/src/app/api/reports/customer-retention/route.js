import { NextResponse } from "next/server";
import { getAllCustomers } from "@/lib/customerIdentityResolver";
import { getStoredOrders } from "@/lib/ordersStore";
import { getAllCareTasks } from "@/lib/careAutomation";

export const dynamic = "force-dynamic";

function toVNDateStr(input = new Date()) {
  if (!input) return "";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) {
    const raw = String(input).trim();
    return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : "";
  }
  const vn = new Date(d.getTime() + 7 * 3600 * 1000);
  const y = vn.getUTCFullYear();
  const m = String(vn.getUTCMonth() + 1).padStart(2, "0");
  const day = String(vn.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const FUNNEL_STAGES = [
  { type: "DAY_1", label: "Ngày 1 (Nhận hàng)", shortLabel: "Ngày 1" },
  { type: "DAY_3", label: "Ngày 3 (Cảm nhận đầu)", shortLabel: "Ngày 3" },
  { type: "DAY_7", label: "Ngày 7 (Đo đường huyết)", shortLabel: "Ngày 7" },
  { type: "DAY_14", label: "Ngày 14 (Đánh giá 2 tuần)", shortLabel: "Ngày 14" },
  { type: "DAY_21", label: "Ngày 21 (Chuẩn bị tái mua)", shortLabel: "Ngày 21" },
];

export async function GET() {
  try {
    const customers = getAllCustomers();
    const allOrders = getStoredOrders();
    const allCareTasks = getAllCareTasks();
    const todayVN = toVNDateStr(new Date());
    const todayMs = new Date(`${todayVN}T00:00:00Z`).getTime();

    const total = customers.length;

    // 1. Phân loại số lần mua hàng & Tỷ lệ tái mua (Re-purchase Rate)
    let firstTimeBuyers = 0;
    let secondTimeBuyers = 0;
    let loyalBuyers = 0;
    let noOrderLeads = 0;

    // Map đơn hàng mới nhất theo SĐT để hỗ trợ tính Churn Proxy
    const latestOrderDateByPhone = new Map();
    const orderCountByPhone = new Map();
    for (const o of allOrders) {
      const status = String(o.status || "").toUpperCase();
      if (status === "CANCELLED" || status === "ĐÃ_HỦY" || status === "REFUNDED") continue;
      const phone = String(o.phone || "").trim();
      if (!phone) continue;
      orderCountByPhone.set(phone, (orderCountByPhone.get(phone) || 0) + 1);
      const oDate = toVNDateStr(o.createdAt || o.purchaseDate || o.updatedAt);
      if (oDate) {
        const prev = latestOrderDateByPhone.get(phone);
        if (!prev || oDate > prev) latestOrderDateByPhone.set(phone, oDate);
      }
    }

    for (const c of customers) {
      const phone = String(c.phone || "").trim();
      const ordersCount = Math.max(
        Number(c.totalOrders ?? c.ordersCount) || 0,
        phone ? orderCountByPhone.get(phone) || 0 : 0
      );
      if (ordersCount === 0) noOrderLeads += 1;
      else if (ordersCount === 1) firstTimeBuyers += 1;
      else if (ordersCount === 2) secondTimeBuyers += 1;
      else loyalBuyers += 1;
    }

    const repeatCustomers = secondTimeBuyers + loyalBuyers;
    const customersWithOrders = firstTimeBuyers + repeatCustomers;
    const repurchaseRate =
      customersWithOrders > 0 ? Math.round((repeatCustomers / customersWithOrders) * 100) : 0;

    // 2. Cơ cấu theo Nguồn khách hàng, Bệnh lý, Hạng VIP
    const sourcesBreakdown = {};
    const pathologiesBreakdown = {};
    const tiersBreakdown = { DONG: 0, BAC: 0, VANG: 0, KIM_CUONG: 0 };

    for (const c of customers) {
      const src = c.sourceChannel || c.source || "ZALO_PERSONAL";
      sourcesBreakdown[src] = (sourcesBreakdown[src] || 0) + 1;

      const p = c.pathology || "Chưa phân loại";
      pathologiesBreakdown[p] = (pathologiesBreakdown[p] || 0) + 1;

      const tier = c.vipLevel || "DONG";
      tiersBreakdown[tier] = (tiersBreakdown[tier] || 0) + 1;
    }

    // 3. Phễu giữ chân CSKH (Ngày 1 -> Ngày 3 -> Ngày 7 -> Ngày 14 -> Ngày 21)
    const careFunnel = FUNNEL_STAGES.map((stage) => {
      const stageTasks = allCareTasks.filter((t) => t.taskType === stage.type);
      const completedTasks = stageTasks.filter((t) => t.isCompleted).length;
      const overdueTasks = stageTasks.filter(
        (t) => !t.isCompleted && t.deadline && String(t.deadline).slice(0, 10) < todayVN
      ).length;
      const pendingTasks = stageTasks.length - completedTasks - overdueTasks;
      const completionRate =
        stageTasks.length > 0 ? Math.round((completedTasks / stageTasks.length) * 100) : 0;

      return {
        stage: stage.type,
        label: stage.label,
        shortLabel: stage.shortLabel,
        totalTasks: stageTasks.length,
        completedTasks,
        overdueTasks,
        pendingTasks: Math.max(0, pendingTasks),
        completionRate,
      };
    });

    const funnelBase =
      careFunnel[0]?.totalTasks > 0 ? careFunnel[0].totalTasks : Math.max(1, customersWithOrders);
    for (const step of careFunnel) {
      step.funnelPct =
        step.totalTasks > 0
          ? Math.min(100, Math.round((step.completedTasks / funnelBase) * 100))
          : 0;
      step.reachPct =
        step.totalTasks > 0
          ? Math.min(100, Math.round((step.totalTasks / funnelBase) * 100))
          : 0;
    }

    // 4. Cảnh báo rời bỏ (Churn Proxy)
    const overdueTasksByCustomer = new Map();
    for (const t of allCareTasks) {
      if (t.isCompleted) continue;
      if (t.deadline && String(t.deadline).slice(0, 10) < todayVN) {
        const key = String(t.customerId || t.customerPhone || "");
        if (key) overdueTasksByCustomer.set(key, (overdueTasksByCustomer.get(key) || 0) + 1);
      }
    }

    let inactiveOver45Days = 0;
    let overdueCareCustomers = 0;
    const churnRiskList = [];

    for (const c of customers) {
      const phone = String(c.phone || "").trim();
      const ordersCount = Math.max(
        Number(c.totalOrders ?? c.ordersCount) || 0,
        phone ? orderCountByPhone.get(phone) || 0 : 0
      );
      const lastOrderStr = toVNDateStr(c.lastOrderDate) || (phone ? latestOrderDateByPhone.get(phone) : "");
      let daysSinceLastOrder = null;
      if (lastOrderStr) {
        const lastMs = new Date(`${lastOrderStr}T00:00:00Z`).getTime();
        if (Number.isFinite(lastMs)) {
          daysSinceLastOrder = Math.max(0, Math.round((todayMs - lastMs) / 86400000));
        }
      }

      const overdueCount =
        overdueTasksByCustomer.get(String(c.id)) ||
        (phone ? overdueTasksByCustomer.get(phone) : 0) ||
        0;

      const isStoppedTag =
        Array.isArray(c.tags) &&
        c.tags.some((tg) => String(tg).toLowerCase().includes("dừng chăm sóc") || String(tg).toLowerCase().includes("khiếu nại"));
      const isInactive = ordersCount >= 1 && daysSinceLastOrder !== null && daysSinceLastOrder > 45;
      const hasOverdue = overdueCount > 0;

      if (isInactive) inactiveOver45Days += 1;
      if (hasOverdue) overdueCareCustomers += 1;

      if (isInactive || hasOverdue || isStoppedTag) {
        const reasons = [];
        if (isInactive) reasons.push(`Quá ${daysSinceLastOrder} ngày chưa tái mua`);
        if (hasOverdue) reasons.push(`${overdueCount} lịch CS quá hạn`);
        if (isStoppedTag) reasons.push("Có tag Dừng CS / Khiếu nại");

        churnRiskList.push({
          customerId: c.id,
          fullName: c.fullName || c.name || "Khách hàng",
          phone: c.phone || "",
          ordersCount,
          daysSinceLastOrder,
          overdueTasksCount: overdueCount,
          reason: reasons.join(" • "),
        });
      }
    }

    churnRiskList.sort((a, b) => {
      if (b.overdueTasksCount !== a.overdueTasksCount) return b.overdueTasksCount - a.overdueTasksCount;
      return (b.daysSinceLastOrder || 0) - (a.daysSinceLastOrder || 0);
    });

    const churnRiskCount = churnRiskList.length;
    const churnBase = customersWithOrders > 0 ? customersWithOrders : Math.max(1, total);
    const churnRate = total > 0 ? Math.min(100, Math.round((churnRiskCount / churnBase) * 100)) : 0;

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      todayVN,
      report: {
        totalCustomers: total,
        customersWithOrders,
        noOrderLeads,
        firstTimeBuyers,
        repeatCustomers,
        loyalBuyers,
        retentionRate: repurchaseRate,
        repurchaseRate,
        sourcesBreakdown,
        pathologiesBreakdown,
        tiersBreakdown,
        careFunnel,
        churnProxy: {
          churnRiskCount,
          churnRate,
          overdueCareCustomers,
          inactiveOver45Days,
          topAtRiskCustomers: churnRiskList.slice(0, 10),
        },
      },
    });
  } catch (error) {
    console.error("[CUSTOMER_RETENTION_ERROR]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
