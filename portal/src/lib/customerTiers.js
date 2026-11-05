/**
 * ADDP Omnichannel AI CRM — Phân Hạng VIP & Thẻ Khách Hàng (WBS-26)
 * Kế thừa logic tính hạng từ C:\AH-Trabi\quan-ly-kho\khach_hang_view.php & C:\QuanlyKH
 *
 * Tiêu chí phân hạng VIP tự động:
 * - 0 đơn hàng (Chưa mua): TIỀM NĂNG (POTENTIAL)
 * - 1 đơn hàng: KHÁCH MỚI (NEW)
 * - 2 đơn hàng: TÁI MUA LẦN 2 (REPEAT_2)
 * - 3 - 4 đơn hàng: KHÁCH THÂN THIẾT (LOYAL_3)
 * - >= 5 đơn hàng HOẶC Doanh thu tích lũy >= 10,000,000đ: KHÁCH VIP (VIP_5)
 */

export const VIP_LEVELS = {
  POTENTIAL: {
    code: "POTENTIAL",
    label: "Tiềm năng",
    badgeColor: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    minOrders: 0,
    minSpend: 0,
  },
  NEW: {
    code: "NEW",
    label: "Khách Mới",
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/60 dark:text-blue-300 dark:border-blue-700/60",
    minOrders: 1,
    minSpend: 0,
  },
  REPEAT_2: {
    code: "REPEAT_2",
    label: "Tái Mua Lần 2",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/60 dark:text-emerald-300 dark:border-emerald-700/60",
    minOrders: 2,
    minSpend: 0,
  },
  LOYAL_3: {
    code: "LOYAL_3",
    label: "Khách Thân Thiết",
    badgeColor: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/60 dark:text-purple-300 dark:border-purple-700/60",
    minOrders: 3,
    minSpend: 0,
  },
  VIP_5: {
    code: "VIP_5",
    label: "Khách VIP",
    badgeColor: "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-900/60 dark:text-amber-300 dark:border-amber-600/70",
    minOrders: 5,
    minSpend: 10000000,
  },
};

/**
 * Tính thứ hạng VIP dựa trên số đơn và tổng chi tiêu
 * @param {number} totalOrders
 * @param {number} totalSpent
 * @returns {typeof VIP_LEVELS[keyof typeof VIP_LEVELS]}
 */
export function calculateVipLevel(totalOrders = 0, totalSpent = 0) {
  const orders = Number(totalOrders) || 0;
  const spent = Number(totalSpent) || 0;

  if (orders >= 5 || spent >= 10000000) {
    return VIP_LEVELS.VIP_5;
  }
  if (orders >= 3 || spent >= 5000000) {
    return VIP_LEVELS.LOYAL_3;
  }
  if (orders >= 2) {
    return VIP_LEVELS.REPEAT_2;
  }
  if (orders >= 1) {
    return VIP_LEVELS.NEW;
  }
  return VIP_LEVELS.POTENTIAL;
}

/**
 * Danh sách Thẻ Nhãn (Tags) Mặc Định Phân Loại Khách Hàng
 */
export const DEFAULT_CUSTOMER_TAGS = [
  { id: 1, name: "Tiểu đường Tuýp 2", color: "bg-rose-500/20 text-rose-300 border-rose-500/40" },
  { id: 2, name: "Tiền tiểu đường", color: "bg-amber-500/20 text-amber-300 border-amber-500/40" },
  { id: 3, name: "Mỡ máu & Gan", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
  { id: 4, name: "Khách VIP", color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40" },
  { id: 5, name: "Đang dùng Combo", color: "bg-blue-500/20 text-blue-300 border-blue-500/40" },
  { id: 6, name: "Cần CSKH Đặc biệt", color: "bg-purple-500/20 text-purple-300 border-purple-500/40" },
  { id: 7, name: "Tái mua lần 2", color: "bg-teal-500/20 text-teal-300 border-teal-500/40" },
];
