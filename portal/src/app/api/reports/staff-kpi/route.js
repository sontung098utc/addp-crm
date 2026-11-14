import { NextResponse } from "next/server";
import { getAllCustomers } from "@/lib/customerIdentityResolver";
import { getStoredOrders } from "@/lib/ordersStore";
import { listAllStaff } from "@/lib/auth";
import { getAllCareTasks } from "@/lib/careAutomation";

export const dynamic = "force-dynamic";

const CANCELLED_STATUSES = new Set(["CANCELLED", "ĐÃ_HỦY", "DA_HUY", "REFUNDED", "HOÀN_TIỀN"]);
const DELIVERED_STATUSES = new Set(["DELIVERED", "GIAO_THÀNH_CÔNG", "COMPLETED", "HOÀN_TẤT"]);

/**
 * Chuyển Date/ISO string sang chuỗi YYYY-MM-DD theo múi giờ Việt Nam (UTC+7)
 */
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

/**
 * Tính khoảng ngày [startDate, endDate] theo kỳ báo cáo (UTC+7)
 */
function getPeriodBounds(period = "all") {
  const todayVN = toVNDateStr(new Date());
  const [yStr, mStr, dStr] = todayVN.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);

  if (period === "today") {
    return { period: "today", startDate: todayVN, endDate: todayVN, periodDays: 1, todayVN };
  }

  if (period === "week") {
    const vnMidnightUtc = Date.UTC(y, m - 1, d);
    const dow = new Date(vnMidnightUtc).getUTCDay(); // 0=CN, 1=T2..6=T7
    const offsetFromMonday = dow === 0 ? 6 : dow - 1;
    const mondayDate = new Date(vnMidnightUtc - offsetFromMonday * 86400000);
    const startDate = `${mondayDate.getUTCFullYear()}-${String(mondayDate.getUTCMonth() + 1).padStart(2, "0")}-${String(mondayDate.getUTCDate()).padStart(2, "0")}`;
    return {
      period: "week",
      startDate,
      endDate: todayVN,
      periodDays: offsetFromMonday + 1,
      todayVN,
    };
  }

  if (period === "month") {
    const startDate = `${yStr}-${mStr}-01`;
    return {
      period: "month",
      startDate,
      endDate: todayVN,
      periodDays: Math.max(1, d),
      todayVN,
    };
  }

  return {
    period: "all",
    startDate: null,
    endDate: null,
    periodDays: 30,
    todayVN,
  };
}

function isDateInRange(dateStr, startDate, endDate) {
  if (!startDate && !endDate) return true;
  if (!dateStr) return false;
  if (startDate && dateStr < startDate) return false;
  if (endDate && dateStr > endDate) return false;
  return true;
}

function isPositiveFeedback(text) {
  if (!text) return false;
  const norm = String(text).trim().toUpperCase();
  if (!norm || norm === "NONE" || norm === "CHƯA PHẢN HỒI") return false;
  return (
    norm.includes("TÍCH CỰC") ||
    norm.includes("TICH CUC") ||
    norm.includes("TỐT") ||
    norm.includes("HÀI LÒNG") ||
    norm.includes("POSITIVE") ||
    norm.includes("GOOD") ||
    norm.includes("THÀNH CÔNG") ||
    norm.includes("ỔN ĐỊNH") ||
    norm.includes("GIẢM") ||
    norm.includes("CẢI THIỆN") ||
    norm.includes("OK")
  );
}

function hasRecordedFeedback(text) {
  if (!text) return false;
  const norm = String(text).trim().toUpperCase();
  return Boolean(norm && norm !== "NONE" && norm !== "CHƯA PHẢN HỒI" && norm !== "CHUA PHAN HOI");
}

function getKpiRating(score) {
  if (score >= 85) return "Xuất sắc";
  if (score >= 65) return "Đạt";
  return "Cần cải thiện";
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const periodParam = searchParams.get("period") || "all";
    const { period, startDate, endDate, periodDays, todayVN } = getPeriodBounds(periodParam);

    const allOrders = getStoredOrders();
    const allCustomers = getAllCustomers();
    const allCareTasks = getAllCareTasks();
    const allStaff = typeof listAllStaff === "function" ? listAllStaff() : [];

    const staffList = allStaff.filter(
      (u) => u && u.isActive !== false && (u.role === "SALE" || u.role === "CSKH" || u.role === "SALE_LEADER")
    );

    const staffRankings = staffList.map((staff) => {
      const staffIdStr = String(staff.id);
      const staffCodeStr = String(staff.code || staff.username || "").toUpperCase();

      const matchesStaff = (record) => {
        if (!record) return false;
        if (record.staffId !== undefined && record.staffId !== null && String(record.staffId) === staffIdStr) {
          return true;
        }
        if (staffCodeStr && record.staffCode && String(record.staffCode).toUpperCase() === staffCodeStr) {
          return true;
        }
        return false;
      };

      // 1. Chỉ tiêu cá nhân từ cấu hình nhân sự (auth.js / staff.json)
      const monthlyRevenueTarget = Math.max(0, Number(staff.kpiRevenue ?? staff.revenueTarget ?? 0));
      const monthlyOrderTarget = Math.max(0, Number(staff.kpiOrders ?? staff.kpi ?? 0));
      const dailyCareTarget = Math.max(0, Number(staff.dailyCareTarget ?? 10));
      const dailyMsgTarget = Math.max(0, Number(staff.dailyMsgTarget ?? 70));

      // Quy đổi chỉ tiêu theo kỳ (hôm nay / tuần / tháng / toàn thời gian)
      const scaleFactor = period === "all" || period === "month" ? 1 : Math.min(1, periodDays / 30);
      const targetRevenue = monthlyRevenueTarget > 0 ? Math.round(monthlyRevenueTarget * scaleFactor) : 0;
      const targetOrders = monthlyOrderTarget > 0 ? Math.max(1, Math.round(monthlyOrderTarget * scaleFactor)) : 0;
      const periodCareTarget = dailyCareTarget * periodDays;

      // 2. Mảng SALE: Đơn hàng & Doanh thu trong kỳ
      const allStaffOrders = allOrders.filter(matchesStaff);
      const validOrdersInPeriod = allStaffOrders.filter((o) => {
        const status = String(o.status || "").toUpperCase();
        if (CANCELLED_STATUSES.has(status)) return false;
        const orderDate = toVNDateStr(o.createdAt || o.purchaseDate || o.updatedAt);
        return isDateInRange(orderDate, startDate, endDate);
      });

      const revenue = validOrdersInPeriod.reduce(
        (sum, o) => sum + (Number(o.finalAmount ?? o.totalAmount) || 0),
        0
      );
      const successfulOrders = validOrdersInPeriod.filter(
        (o) =>
          DELIVERED_STATUSES.has(String(o.status || "").toUpperCase()) ||
          DELIVERED_STATUSES.has(String(o.deliveryStatus || "").toUpperCase())
      ).length;

      const assignedCustomers = allCustomers.filter(matchesStaff);
      const orderPhonesInPeriod = new Set(
        validOrdersInPeriod.map((o) => String(o.phone || "").trim()).filter(Boolean)
      );

      const closedCustomersCount = assignedCustomers.filter(
        (c) => (Number(c.totalOrders ?? c.ordersCount) || 0) > 0 || orderPhonesInPeriod.has(String(c.phone || "").trim())
      ).length;
      const closingRate =
        assignedCustomers.length > 0
          ? Math.round((closedCustomersCount / assignedCustomers.length) * 100)
          : 0;

      // Tỷ lệ khách cũ tái mua (>= 2 đơn trên tổng số khách đã từng mua)
      const buyers = assignedCustomers.filter((c) => (Number(c.totalOrders ?? c.ordersCount) || 0) >= 1);
      const repeatBuyers = buyers.filter((c) => (Number(c.totalOrders ?? c.ordersCount) || 0) >= 2);
      const repeatPurchaseRate =
        buyers.length > 0 ? Math.round((repeatBuyers.length / buyers.length) * 100) : 0;

      // 3. Mảng CSKH: Nhiệm vụ chăm sóc, Quá hạn tồn đọng, Phản hồi tích cực
      const staffTasks = allCareTasks.filter(matchesStaff);
      const completedTasksInPeriod = staffTasks.filter((t) => {
        if (!t.isCompleted) return false;
        const doneDate = toVNDateStr(t.completedAt || t.deadline);
        return isDateInRange(doneDate, startDate, endDate);
      });

      const completedCustomerKeys = new Set(
        completedTasksInPeriod.map((t) => String(t.customerId || t.customerPhone || t.id))
      );
      let careCompleted = completedCustomerKeys.size;
      if (careCompleted === 0 && staffTasks.length === 0) {
        // Fallback từ hồ sơ khách hàng có tương tác CSKH trong kỳ nếu chưa có care_tasks
        careCompleted = assignedCustomers.filter((c) => {
          if (c.lastInteractionDate) {
            return isDateInRange(toVNDateStr(c.lastInteractionDate), startDate, endDate);
          }
          return c.careStatus === "Hoàn thành";
        }).length;
      }

      const careTargetPct =
        periodCareTarget > 0
          ? Math.min(100, Math.round((careCompleted / periodCareTarget) * 100))
          : careCompleted > 0
          ? 100
          : 0;

      const overdueTasks = staffTasks.filter(
        (t) => !t.isCompleted && t.deadline && String(t.deadline).slice(0, 10) < todayVN
      );
      const overdueCustomersCount = new Set(
        overdueTasks.map((t) => String(t.customerId || t.customerPhone || t.id))
      ).size;

      // Tỷ lệ phản hồi tích cực từ dữ liệu thật (care_tasks + customers)
      let feedbackTotal = 0;
      let feedbackPositive = 0;
      for (const c of assignedCustomers) {
        const fb = c.lastFeedbackStatus || c.feedbackRating;
        if (hasRecordedFeedback(fb)) {
          feedbackTotal += 1;
          if (isPositiveFeedback(fb)) feedbackPositive += 1;
        }
      }
      for (const t of completedTasksInPeriod) {
        if (hasRecordedFeedback(t.resultNote)) {
          feedbackTotal += 1;
          if (isPositiveFeedback(t.resultNote)) feedbackPositive += 1;
        }
      }
      const positiveResponseRate =
        feedbackTotal > 0 ? Math.round((feedbackPositive / feedbackTotal) * 1000) / 10 : 0;

      // 4. Tính Điểm KPI Tổng Hợp (0-100) & Xếp loại
      const revenuePct =
        targetRevenue > 0
          ? Math.min(100, Math.round((revenue / targetRevenue) * 100))
          : targetOrders > 0
          ? Math.min(100, Math.round((validOrdersInPeriod.length / targetOrders) * 100))
          : closingRate;

      const saleSubScore = Math.min(
        100,
        revenuePct * 0.6 + closingRate * 0.25 + repeatPurchaseRate * 0.15
      );
      const overdueScore = Math.max(0, 100 - Math.min(40, overdueCustomersCount * 5));
      const feedbackComponent = feedbackTotal > 0 ? positiveResponseRate : careTargetPct;
      const careSubScore = Math.min(
        100,
        careTargetPct * 0.6 + feedbackComponent * 0.25 + overdueScore * 0.15
      );

      const saleWeight = staff.role === "CSKH" ? 0.3 : 0.6;
      const careWeight = 1 - saleWeight;
      const kpiScore = Math.round(Math.max(0, Math.min(100, saleSubScore * saleWeight + careSubScore * careWeight)));
      const rating = getKpiRating(kpiScore);

      return {
        staffId: staff.id,
        code: staff.code || staff.username || `NV${staff.id}`,
        name: staff.name || staff.fullName || "Nhân viên",
        username: staff.username || staff.code || "",
        role: staff.role,
        teamName: staff.teamName || "Team Sale 01",
        channels: staff.assignedChannels || staff.channels || ["ZALO_PERSONAL", "FACEBOOK"],
        // Chỉ tiêu cấu hình
        targetRevenue,
        monthlyRevenueTarget,
        targetOrders,
        monthlyOrderTarget,
        dailyCareTarget,
        periodCareTarget,
        dailyMsgTarget,
        // Kết quả Sale
        totalOrders: validOrdersInPeriod.length,
        successfulOrders,
        revenue,
        assignedCustomersCount: assignedCustomers.length,
        closingRate,
        repeatPurchaseRate,
        revenueCompletionPct: revenuePct,
        // Kết quả CSKH
        careCompleted,
        careTargetPct,
        overdueCareCount: overdueCustomersCount,
        positiveResponseRate,
        feedbackSampleCount: feedbackTotal,
        // Tổng hợp KPI
        kpiScore,
        kpiCompletionPct: kpiScore,
        rating,
      };
    });

    staffRankings.sort((a, b) => {
      if (b.kpiScore !== a.kpiScore) return b.kpiScore - a.kpiScore;
      return b.revenue - a.revenue;
    });

    const totalRevenue = staffRankings.reduce((sum, s) => sum + s.revenue, 0);
    const totalOrders = staffRankings.reduce((sum, s) => sum + s.totalOrders, 0);
    const totalCareCompleted = staffRankings.reduce((sum, s) => sum + s.careCompleted, 0);
    const totalOverdueCare = staffRankings.reduce((sum, s) => sum + s.overdueCareCount, 0);
    const avgClosingRate =
      staffRankings.length > 0
        ? Math.round(staffRankings.reduce((sum, s) => sum + s.closingRate, 0) / staffRankings.length)
        : 0;
    const avgRepeatRate =
      staffRankings.length > 0
        ? Math.round(staffRankings.reduce((sum, s) => sum + s.repeatPurchaseRate, 0) / staffRankings.length)
        : 0;
    const avgKpiScore =
      staffRankings.length > 0
        ? Math.round(staffRankings.reduce((sum, s) => sum + s.kpiScore, 0) / staffRankings.length)
        : 0;
    const staffsWithFeedback = staffRankings.filter((s) => s.feedbackSampleCount > 0);
    const avgPositiveResponseRate =
      staffsWithFeedback.length > 0
        ? Math.round(
            (staffsWithFeedback.reduce((sum, s) => sum + s.positiveResponseRate, 0) /
              staffsWithFeedback.length) *
              10
          ) / 10
        : 0;

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      period,
      startDate,
      endDate,
      todayVN,
      report: {
        period,
        startDate,
        endDate,
        totalStaff: staffRankings.length,
        staffRankings,
        teamSummary: {
          totalRevenue,
          totalOrders,
          totalCareCompleted,
          totalOverdueCare,
          avgClosingRate,
          avgRepeatRate,
          avgKpiScore,
          avgResponseRate: avgPositiveResponseRate,
          excellentCount: staffRankings.filter((s) => s.rating === "Xuất sắc").length,
          achievedCount: staffRankings.filter((s) => s.rating === "Đạt").length,
          needsImprovementCount: staffRankings.filter((s) => s.rating === "Cần cải thiện").length,
        },
      },
    });
  } catch (error) {
    console.error("[STAFF_KPI_ERROR]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
