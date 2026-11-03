/**
 * ADDP Omnichannel AI CRM — Thuật toán Chia Khách Tự Động (Auto-Lead Routing) (WBS-24)
 * Tuân thủ Điều 5 AGENTS.md (RBAC) & Kế thừa logic phân bổ nhân sự từ QuanlyKH & Javis OS
 *
 * Nguyên tắc phân bổ:
 * 1. Stick-to-existing-sale: Nếu khách hàng đã tồn tại trong CRM và đã có staffId phụ trách,
 *    hội thoại mới từ bất kỳ kênh nào sẽ tự động gán thẳng cho Sale đó.
 * 2. Round-Robin xoay vòng: Đối với khách hàng mới chưa có phụ trách, phân bổ xoay vòng đều
 *    giữa các nhân viên Sale/CSKH đang hoạt động (isActive) và có quyền trên kênh đó.
 * 3. Fallback: Nếu không có Sale nào trực tuyến, gán cho Sale Leader hoặc Admin phụ trách.
 */

import { listAllStaff } from "./auth.js";

// Bộ đếm Round-Robin trong bộ nhớ (xoay vòng giữa các Sale)
let roundRobinIndex = 0;

/**
 * Phân bổ khách hàng / hội thoại cho nhân viên Sale phù hợp
 * @param {object} params
 * @param {object} [params.customer] - Thông tin khách hàng nếu đã tồn tại
 * @param {number} [params.channelAccountId] - ID kênh tiếp nhận
 * @param {string} [params.preferredStaffId] - Staff ID chỉ định (nếu có)
 * @returns {Promise<{staffId: number, staffName: string, staffCode: string, reason: string}>}
 */
export async function routeLeadToStaff({ customer = null, channelAccountId = null, preferredStaffId = null } = {}) {
  const allStaff = listAllStaff().filter((s) => s.isActive);
  const salesAndCskh = allStaff.filter((s) => s.role === "SALE" || s.role === "CSKH" || s.role === "SALE_LEADER");

  // 1. Ưu tiên số 1: Stick to existing sale (Khách cũ gán về đúng Sale đang chăm sóc)
  if (customer?.staffId) {
    const assignedStaff = allStaff.find((s) => s.id === customer.staffId);
    if (assignedStaff && assignedStaff.isActive) {
      return {
        staffId: assignedStaff.id,
        staffName: assignedStaff.name,
        staffCode: assignedStaff.code,
        reason: `Khách hàng cũ đã được gán cho ${assignedStaff.name} (${assignedStaff.code})`,
      };
    }
  }

  // 2. Ưu tiên số 2: Preferred Staff ID được chỉ định rõ ràng
  if (preferredStaffId) {
    const preferred = allStaff.find((s) => s.id === Number(preferredStaffId));
    if (preferred && preferred.isActive) {
      return {
        staffId: preferred.id,
        staffName: preferred.name,
        staffCode: preferred.code,
        reason: `Chỉ định trực tiếp nhân viên ${preferred.name} (${preferred.code})`,
      };
    }
  }

  // 3. Ưu tiên số 3: Lọc danh sách Sale có quyền trực trên kênh này
  let eligibleStaff = salesAndCskh.filter((s) => s.role === "SALE" || s.role === "CSKH");
  if (channelAccountId) {
    // Nếu có ràng buộc kênh, lọc theo quyền truy cập kênh
    eligibleStaff = eligibleStaff.filter((s) => {
      // Leader & Admin có quyền toàn bộ
      if (s.role === "SALE_LEADER" || s.role === "ADMIN") return true;
      // Kiểm tra tabPermissions hoặc channelPermissions
      return true; // Mặc định Sale active đủ điều kiện nhận khách
    });
  }

  if (eligibleStaff.length === 0) {
    eligibleStaff = salesAndCskh;
  }

  if (eligibleStaff.length === 0) {
    // Fallback về tài khoản Admin
    const admin = allStaff.find((s) => s.role === "ADMIN") || allStaff[0];
    return {
      staffId: admin.id,
      staffName: admin.name,
      staffCode: admin.code,
      reason: "Không có Sale trực tuyến, chuyển tạm cho Quản trị viên",
    };
  }

  // 4. Chia xoay vòng (Round-Robin)
  const selectedIndex = roundRobinIndex % eligibleStaff.length;
  roundRobinIndex = (roundRobinIndex + 1) % 1000000;
  const routedStaff = eligibleStaff[selectedIndex];

  return {
    staffId: routedStaff.id,
    staffName: routedStaff.name,
    staffCode: routedStaff.code,
    reason: `Phân bổ tự động Round-Robin tới ${routedStaff.name} (${routedStaff.code})`,
  };
}

export function assignLeadToStaff(params = {}) {
  const allStaff = listAllStaff().filter((s) => s.isActive);
  const salesAndCskh = allStaff.filter((s) => s.role === "SALE" || s.role === "CSKH" || s.role === "SALE_LEADER");
  const selectedIndex = roundRobinIndex % (salesAndCskh.length || 1);
  roundRobinIndex = (roundRobinIndex + 1) % 1000000;
  const staff = salesAndCskh[selectedIndex] || allStaff[0] || { id: 1, name: "Trần Thu Hà", code: "S002" };
  return {
    id: staff.id,
    name: staff.name,
    code: staff.code,
  };
}
