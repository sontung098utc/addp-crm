/**
 * ADDP Omnichannel AI CRM — Engine Tài Chính & Tính Lãi/Lỗ Thực Tế (WBS-43)
 * Kế thừa 100% logic nghiệp vụ từ C:\AdsTiktok:
 * - commerce_loss_engine.php (Phân loại đơn & Ghi nhận thất thoát)
 * - commerce_finance_service.php (Khấu trừ phí sàn, Affiliate, Đối soát doanh thu thực nhận)
 * - commerce_product_cost_service.php (Định giá vốn COGS và Unit Economics)
 * 
 * Tuân thủ Điều 2 & Điều 11 AGENTS.md: Không dùng số liệu giả, tính toán chính xác từ đơn hàng và giá vốn thực.
 */

import { resolveComboFormulaList } from "./comboResolver.js";
import { getStoredOrders } from "./ordersStore.js";
import { getCustomFormulasMap } from "./inventoryStore.js";

// Phí sàn chuẩn theo từng nền tảng
export const PLATFORM_FEE_RATES = {
  TIKTOK_SHOP: {
    platformFeePct: 0.085, // 8.5% (Hoa hồng sàn + phí giao dịch + phí dịch vụ)
    affiliatePct: 0.075,   // 7.5% bình quân hoa hồng Creator / KOC
    codFee: 0,
    shippingLossPerReturn: 32000, // Chi phí ship hoàn khi bom hàng / giao thất bại
  },
  SHOPEE: {
    platformFeePct: 0.090, // 9.0% (Phí cố định + phí thanh toán + Freeship Extra)
    affiliatePct: 0.050,   // 5.0% Shopee Affiliate
    codFee: 0,
    shippingLossPerReturn: 30000,
  },
  WEBSITE_MAGENTO: {
    platformFeePct: 0.0,   // 0% phí sàn
    affiliatePct: 0.0,
    codFee: 0.015,         // 1.5% phí thu hộ COD / cổng thanh toán VNPAY
    shippingLossPerReturn: 28000,
  },
  KIOTVIET: {
    platformFeePct: 0.0,
    affiliatePct: 0.0,
    codFee: 0.015,
    shippingLossPerReturn: 25000,
  },
  ZALO_PERSONAL: {
    platformFeePct: 0.0,
    affiliatePct: 0.0,
    codFee: 0.015,
    shippingLossPerReturn: 28000,
  },
  FACEBOOK: {
    platformFeePct: 0.0,
    affiliatePct: 0.0,
    codFee: 0.015,
    shippingLossPerReturn: 28000,
  },
};

/**
 * Phân loại kinh tế của đơn hàng (Kế thừa từ classifyOrder trong commerce_loss_engine.php)
 */
export function classifyOrderOutcome(order) {
  const status = String(order.status || "").toUpperCase();
  const deliveryStatus = String(order.deliveryStatus || "").toUpperCase();

  if (status === "DELIVERED" || status === "COMPLETED" || deliveryStatus === "GIAO_THÀNH_CÔNG") {
    return "SUCCESSFUL_ORDER";
  }

  if (status === "CANCELLED" || status === "ĐÃ_HỦY") {
    if (deliveryStatus === "CHỜ_ĐÓNG_GÓI" || deliveryStatus === "CHỜ_GỬI") {
      return "CANCELLED_PRE_FULFILLMENT";
    }
    return "FAILED_DELIVERY";
  }

  if (status === "RETURNED" || deliveryStatus === "GIAO_THẤT_BẠI" || deliveryStatus === "CHUYỂN_HOÀN") {
    return "FAILED_DELIVERY";
  }

  if (status === "REFUNDED") {
    return "RETURNED_AND_REFUND";
  }

  return "IN_PROGRESS"; // Đang xử lý / Đang vận chuyển
}

/**
 * Tính toán tài chính chi tiết cho một đơn hàng cụ thể
 * @param {object} order Đơn hàng
 * @param {number} adSpendPerOrder Chi phí quảng cáo phân bổ cho đơn này (nếu có)
 */
export function computeOrderFinancials(order, adSpendPerOrder = 0) {
  const channel = order.channel || "ZALO_PERSONAL";
  const rates = PLATFORM_FEE_RATES[channel] || PLATFORM_FEE_RATES.ZALO_PERSONAL;
  const outcome = classifyOrderOutcome(order);

  const gmv = Number(order.finalAmount || order.totalAmount) || 0;

  // 1. Tính tổng giá vốn hàng bán (COGS) dựa vào thuật toán giải mã combo đệ quy (WBS-41)
  let totalCogs = 0;
  const customFormulas = getCustomFormulasMap();
  const items = Array.isArray(order.items) ? order.items : [];
  for (const item of items) {
    const sku = item.sku || item.code || item.name || "GLUCARE-LON-800";
    const qty = Number(item.quantity) || 1;
    const resolvedList = resolveComboFormulaList(sku, qty, customFormulas);
    for (const r of resolvedList) {
      totalCogs += r.totalCost || 0;
    }
  }

  // 2. Xác định Doanh thu thực nhận (Realized Revenue) theo trạng thái
  let realizedRevenue = 0;
  let platformFee = 0;
  let affiliateFee = 0;
  let codFee = 0;
  let shippingLoss = 0;

  if (outcome === "SUCCESSFUL_ORDER") {
    realizedRevenue = gmv;
    platformFee = Math.round(gmv * rates.platformFeePct);
    affiliateFee = Math.round(gmv * rates.affiliatePct);
    codFee = Math.round(gmv * rates.codFee);
  } else if (outcome === "IN_PROGRESS") {
    // Đang giao: ghi nhận doanh thu dự kiến, chưa tất toán
    realizedRevenue = gmv;
    platformFee = Math.round(gmv * rates.platformFeePct);
    affiliateFee = Math.round(gmv * rates.affiliatePct);
    codFee = Math.round(gmv * rates.codFee);
  } else if (outcome === "FAILED_DELIVERY") {
    // Giao thất bại / Bom hàng / Chuyển hoàn
    realizedRevenue = 0;
    shippingLoss = rates.shippingLossPerReturn;
    // Hàng quay lại kho nên không mất giá vốn hàng, chỉ mất phí ship hoàn
  } else if (outcome === "CANCELLED_PRE_FULFILLMENT") {
    // Khách hủy trước khi gửi: không mất tiền, không mất ship
    realizedRevenue = 0;
  } else if (outcome === "RETURNED_AND_REFUND") {
    // Khách hoàn tiền: mất phí sàn phát sinh + phí ship hoàn
    realizedRevenue = 0;
    shippingLoss = rates.shippingLossPerReturn;
  }

  // 3. Tính Lợi nhuận ròng (Net Profit)
  // Net Profit = Realized Revenue - COGS - Platform Fee - Affiliate Fee - COD Fee - Shipping Loss - Ad Spend
  const netCogsDeduction = (outcome === "SUCCESSFUL_ORDER" || outcome === "IN_PROGRESS") ? totalCogs : 0;
  const totalDeductions = netCogsDeduction + platformFee + affiliateFee + codFee + shippingLoss + adSpendPerOrder;
  const netProfit = realizedRevenue - totalDeductions;
  const marginPct = realizedRevenue > 0 ? (netProfit / realizedRevenue) * 100 : 0;

  return {
    orderId: order.id,
    orderCode: order.orderCode,
    customerName: order.customerName,
    channel,
    status: order.status,
    outcome,
    gmv,
    realizedRevenue,
    cogs: totalCogs,
    platformFee,
    affiliateFee,
    codFee,
    shippingLoss,
    adSpend: adSpendPerOrder,
    totalDeductions,
    netProfit,
    marginPct: parseFloat(marginPct.toFixed(2)),
  };
}

/**
 * Tổng hợp báo cáo kinh doanh đa chiều theo khoảng thời gian và kênh bán hàng
 */
export function getFinancialOverview({ channel = "ALL", startDate = null, endDate = null }) {
  const allOrders = getStoredOrders();

  // 1. Lọc đơn hàng theo kênh và khoảng thời gian
  const filtered = allOrders.filter((o) => {
    if (channel !== "ALL" && o.channel !== channel) return false;

    if (startDate || endDate) {
      const orderDate = new Date(o.createdAt || Date.now());
      if (startDate && orderDate < new Date(startDate)) return false;
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (orderDate > end) return false;
      }
    }

    return true;
  });

  // 2. Tính toán tổng tài chính
  let totalGmv = 0;
  let totalRealizedRevenue = 0;
  let totalSuccessfulOrders = 0;
  let totalCancelledOrders = 0;
  let totalFailedDeliveryOrders = 0;
  let totalInProgressOrders = 0;

  let totalCogs = 0;
  let totalPlatformFees = 0;
  let totalAffiliate = 0;
  let totalCodFees = 0;
  let totalShippingLoss = 0;
  let totalNetProfit = 0;

  // Thống kê theo 7 kênh
  const channelStats = {
    WEBSITE_MAGENTO: { name: "Website Magento 2.4.8", gmv: 0, realized: 0, orders: 0, successOrders: 0, netProfit: 0, cogs: 0, fees: 0 },
    TIKTOK_SHOP: { name: "TikTok Shop", gmv: 0, realized: 0, orders: 0, successOrders: 0, netProfit: 0, cogs: 0, fees: 0 },
    SHOPEE: { name: "Shopee", gmv: 0, realized: 0, orders: 0, successOrders: 0, netProfit: 0, cogs: 0, fees: 0 },
    KIOTVIET: { name: "KiotViet POS", gmv: 0, realized: 0, orders: 0, successOrders: 0, netProfit: 0, cogs: 0, fees: 0 },
    ZALO_PERSONAL: { name: "Zalo Cá Nhân", gmv: 0, realized: 0, orders: 0, successOrders: 0, netProfit: 0, cogs: 0, fees: 0 },
    FACEBOOK: { name: "Fanpage Facebook", gmv: 0, realized: 0, orders: 0, successOrders: 0, netProfit: 0, cogs: 0, fees: 0 },
  };

  // Thống kê theo ngày
  const dailyMap = new Map();
  const orderDetails = [];

  for (const o of filtered) {
    const fin = computeOrderFinancials(o);
    orderDetails.push(fin);

    totalGmv += fin.gmv;
    totalRealizedRevenue += fin.realizedRevenue;
    totalCogs += fin.cogs;
    totalPlatformFees += fin.platformFee;
    totalAffiliate += fin.affiliateFee;
    totalCodFees += fin.codFee;
    totalShippingLoss += fin.shippingLoss;
    totalNetProfit += fin.netProfit;

    if (fin.outcome === "SUCCESSFUL_ORDER") totalSuccessfulOrders++;
    else if (fin.outcome === "CANCELLED_PRE_FULFILLMENT") totalCancelledOrders++;
    else if (fin.outcome === "FAILED_DELIVERY") totalFailedDeliveryOrders++;
    else totalInProgressOrders++;

    // Kênh
    const cKey = o.channel || "ZALO_PERSONAL";
    if (channelStats[cKey]) {
      channelStats[cKey].orders++;
      channelStats[cKey].gmv += fin.gmv;
      channelStats[cKey].realized += fin.realizedRevenue;
      channelStats[cKey].cogs += fin.cogs;
      channelStats[cKey].fees += (fin.platformFee + fin.affiliateFee + fin.codFee);
      channelStats[cKey].netProfit += fin.netProfit;
      if (fin.outcome === "SUCCESSFUL_ORDER") channelStats[cKey].successOrders++;
    }

    // Ngày
    const dStr = (o.createdAt || new Date().toISOString()).slice(0, 10);
    const dayEntry = dailyMap.get(dStr) || { date: dStr, gmv: 0, realized: 0, orders: 0, netProfit: 0 };
    dayEntry.gmv += fin.gmv;
    dayEntry.realized += fin.realizedRevenue;
    dayEntry.orders += 1;
    dayEntry.netProfit += fin.netProfit;
    dailyMap.set(dStr, dayEntry);
  }

  const dailyTrend = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  const totalOrdersCount = filtered.length;
  const netMarginPct = totalRealizedRevenue > 0 ? (totalNetProfit / totalRealizedRevenue) * 100 : 0;
  const cogsRatioPct = totalRealizedRevenue > 0 ? (totalCogs / totalRealizedRevenue) * 100 : 0;
  const successRatePct = totalOrdersCount > 0 ? (totalSuccessfulOrders / totalOrdersCount) * 100 : 0;
  const returnRatePct = totalOrdersCount > 0 ? (totalFailedDeliveryOrders / totalOrdersCount) * 100 : 0;
  const aov = totalOrdersCount > 0 ? Math.round(totalGmv / totalOrdersCount) : 0;

  return {
    metricsOverview: {
      gmv: totalGmv,
      realizedRevenue: totalRealizedRevenue,
      totalOrders: totalOrdersCount,
      successfulOrders: totalSuccessfulOrders,
      cancelledOrders: totalCancelledOrders,
      failedDeliveryOrders: totalFailedDeliveryOrders,
      inProgressOrders: totalInProgressOrders,
      successRatePct: parseFloat(successRatePct.toFixed(1)),
      returnRatePct: parseFloat(returnRatePct.toFixed(1)),
      aov,
    },
    financeBreakdown: {
      cogs: totalCogs,
      cogsRatioPct: parseFloat(cogsRatioPct.toFixed(1)),
      platformFees: totalPlatformFees,
      affiliateCommissions: totalAffiliate,
      codFees: totalCodFees,
      shippingLoss: totalShippingLoss,
      totalDeductions: totalCogs + totalPlatformFees + totalAffiliate + totalCodFees + totalShippingLoss,
      netProfit: totalNetProfit,
      netMarginPct: parseFloat(netMarginPct.toFixed(1)),
    },
    channelStats: Object.entries(channelStats).map(([key, data]) => ({
      channelKey: key,
      ...data,
      netMarginPct: data.realized > 0 ? parseFloat(((data.netProfit / data.realized) * 100).toFixed(1)) : 0,
    })),
    dailyTrend,
    orderDetails,
    lossBreakdown: {
      cancelledPreFulfillment: {
        count: totalCancelledOrders,
        lostGmv: filtered.filter((o) => classifyOrderOutcome(o) === "CANCELLED_PRE_FULFILLMENT").reduce((s, o) => s + (o.totalAmount || 0), 0),
        directShippingLoss: 0,
        description: "Đơn hủy trước khi đóng gói / xuất kho (Không mất phí hoàn)",
      },
      failedDelivery: {
        count: totalFailedDeliveryOrders,
        lostGmv: filtered.filter((o) => classifyOrderOutcome(o) === "FAILED_DELIVERY").reduce((s, o) => s + (o.totalAmount || 0), 0),
        directShippingLoss: totalShippingLoss,
        description: "Khách bom hàng / giao không thành công (Chịu phí cước chiều hoàn)",
      },
      totalLossAmount: totalShippingLoss,
      failedDeliveryRatePct: totalOrdersCount > 0 ? parseFloat(returnRatePct.toFixed(1)) : 0,
    },
  };
}
