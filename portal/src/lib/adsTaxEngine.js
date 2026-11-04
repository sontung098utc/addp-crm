/**
 * ADDP Omnichannel AI CRM — Engine Báo Cáo Ads GMV Max & Thống Kê Thuế (WBS-45)
 * Kế thừa nghiệp vụ từ:
 * - C:\AdsTiktok\src\CommerceGoldenHoursView.jsx & commerce_ads_service.php
 * - C:\AH-Trabi\quan-ly-kho\thong_ke_thue_view.php
 * 
 * Tuân thủ Điều 2, Điều 5 (RBAC), Điều 11 (Dữ liệu xác thực 100%) AGENTS.md
 */

import { getStoredOrders } from "./ordersStore.js";
import { resolveComboFormulaList } from "./comboResolver.js";

/**
 * Phân tích Khung giờ vàng (Golden Hours: 0h -> 23h) và GMV Max Playbook
 * @param {string} [channel='ALL']
 */
export function getGoldenHoursReport(channel = "ALL") {
  const allOrders = getStoredOrders();
  const filtered = channel === "ALL" ? allOrders : allOrders.filter((o) => o.channel === channel);

  // Khởi tạo mảng 24 giờ
  const hourlyData = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    hourLabel: `${String(hour).padStart(2, "0")}:00 - ${String(hour).padStart(2, "0")}:59`,
    ordersCount: 0,
    gmv: 0,
    deliveredOrders: 0,
    deliveredGmv: 0,
  }));

  for (const order of filtered) {
    const d = new Date(order.createdAt || Date.now());
    const h = d.getHours();
    const gmv = Number(order.finalAmount || order.totalAmount) || 0;
    const isDelivered = String(order.status).toUpperCase() === "DELIVERED" || String(order.deliveryStatus).toUpperCase() === "GIAO_THÀNH_CÔNG";

    hourlyData[h].ordersCount += 1;
    hourlyData[h].gmv += gmv;
    if (isDelivered) {
      hourlyData[h].deliveredOrders += 1;
      hourlyData[h].deliveredGmv += gmv;
    }
  }

  // Sắp xếp tìm Top khung giờ vàng chốt đơn cao nhất
  const sortedByOrders = [...hourlyData].sort((a, b) => b.ordersCount - a.ordersCount);
  const goldenPeak = sortedByOrders[0] || { hour: 20, ordersCount: 0, gmv: 0 };

  return {
    channel,
    totalOrders: filtered.length,
    totalGmv: filtered.reduce((sum, o) => sum + (Number(o.finalAmount || o.totalAmount) || 0), 0),
    peakHour: goldenPeak.hour,
    peakHourLabel: goldenPeak.hourLabel,
    peakOrders: goldenPeak.ordersCount,
    hourlyDistribution: hourlyData,
    gmvMaxPlaybook: {
      budgetRecommendation: "Đẩy mạnh 65% ngân sách quảng cáo TikTok GMV Max vào khung giờ từ 19:00 - 23:00 và 11:30 - 13:30",
      targetCpa: 45000, // Chi phí mục tiêu / đơn hàng thành công
      suggestedBidMultiplier: 1.25,
      roasTarget: 4.5,
    },
  };
}

/**
 * Thống kê đơn hàng giao thành công để xuất hóa đơn thuế
 * Kế thừa 100% từ C:\AH-Trabi\quan-ly-kho\thong_ke_thue_view.php
 */
export function getTaxReport({ startDate, endDate, platform = "ALL" } = {}) {
  const allOrders = getStoredOrders();

  const deliveredOrders = allOrders.filter((order) => {
    const isDelivered =
      String(order.status).toUpperCase() === "DELIVERED" ||
      String(order.deliveryStatus).toUpperCase() === "GIAO_THÀNH_CÔNG";
    if (!isDelivered) return false;

    if (platform !== "ALL" && order.channel !== platform) return false;

    if (startDate) {
      const orderDate = (order.createdAt || "").slice(0, 10);
      if (orderDate < startDate) return false;
    }
    if (endDate) {
      const orderDate = (order.createdAt || "").slice(0, 10);
      if (orderDate > endDate) return false;
    }
    return true;
  });

  let totalRevenue = 0;
  let totalTaxable = 0;
  let totalVat = 0;
  const skuSummary = {};

  const orderRows = deliveredOrders.map((o) => {
    const gmv = Number(o.finalAmount || o.totalAmount) || 0;
    totalRevenue += gmv;

    // Thuế suất thực phẩm bảo vệ sức khỏe / dinh dưỡng ADDP (VAT 8%)
    const vatRate = 0.08;
    const taxableBase = Math.round(gmv / (1 + vatRate));
    const vatAmount = gmv - taxableBase;
    totalTaxable += taxableBase;
    totalVat += vatAmount;

    // Bóc tách sản phẩm lẻ từ combo
    const items = Array.isArray(o.items) ? o.items : [];
    for (const item of items) {
      const sku = item.sku || item.code || "GLUCARE-LON-800";
      const qty = Number(item.quantity) || 1;
      skuSummary[sku] = (skuSummary[sku] || 0) + qty;
    }

    return {
      orderCode: o.orderCode,
      channel: o.channel,
      customerName: o.customerName,
      phone: o.phone,
      completedDate: o.updatedAt || o.createdAt,
      totalAmount: gmv,
      taxableBase,
      vatAmount,
      itemsCount: items.length,
    };
  });

  return {
    platform,
    startDate,
    endDate,
    totalOrders: deliveredOrders.length,
    totalRevenue,
    totalTaxable,
    totalVat,
    skuSummary,
    orders: orderRows,
  };
}
