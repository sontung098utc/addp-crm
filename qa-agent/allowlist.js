/**
 * ADDP AI CRM — QA AGENT ENDPOINT ALLOWLIST & SAFETY CONTRACT
 * 
 * NGUYÊN TẮC BẢO VỆ:
 * 1. Chỉ chấp nhận phương thức GET hoặc HEAD. Tuyệt đối không cho phép POST/PUT/DELETE/PATCH trong allowlist read-only.
 * 2. Mỗi endpoint đều có căn cứ an toàn (safetyRationale) chứng minh không làm biến đổi trạng thái hệ thống.
 * 3. Bất kỳ request nào nhắm tới endpoint ngoài danh sách này sẽ bị chặn (BLOCKED) ngay trước khi gửi.
 */

const ENDPOINT_ALLOWLIST = [
  // Nhóm 1: Health & Connectivity
  {
    path: "/api/health",
    method: "GET",
    group: "health",
    allowedTargets: ["local", "staging", "production"],
    safetyRationale: "Endpoint kiểm tra tình trạng sống của ứng dụng, không đọc/ghi dữ liệu nghiệp vụ.",
  },
  {
    path: "/",
    method: "GET",
    group: "health",
    allowedTargets: ["local", "staging", "production"],
    safetyRationale: "Trang chủ hoặc redirect tới login, an toàn chỉ đọc.",
  },

  // Nhóm 2: Auth & Role Boundaries (Read-only verification)
  {
    path: "/login",
    method: "GET",
    group: "auth",
    allowedTargets: ["local", "staging", "production"],
    safetyRationale: "Trang đăng nhập công khai, chỉ hiển thị form nhập liệu.",
  },
  {
    path: "/api/auth/me",
    method: "GET",
    group: "auth",
    allowedTargets: ["local", "staging", "production"],
    safetyRationale: "Đọc thông tin phiên làm việc của user hiện tại, không thay đổi quyền hoặc token.",
  },
  {
    path: "/api/channels",
    method: "GET",
    group: "auth",
    allowedTargets: ["local", "staging", "production"],
    safetyRationale: "Kiểm tra quyền truy cập danh sách kênh. Nếu không có session phải nhận 401/403.",
  },
  {
    path: "/api/staff",
    method: "GET",
    group: "auth",
    allowedTargets: ["local", "staging", "production"],
    safetyRationale: "Kiểm tra quyền xem nhân sự theo RBAC. Nếu chưa đăng nhập phải nhận 401/403.",
  },

  // Nhóm 3: UI Readonly Check
  {
    path: "/channels",
    method: "GET",
    group: "ui-readonly",
    allowedTargets: ["local", "staging", "production"],
    safetyRationale: "Giao diện quản lý kết nối kênh, kiểm tra mã HTTP phản hồi hoặc điều hướng an toàn.",
  },
  {
    path: "/inbox",
    method: "GET",
    group: "ui-readonly",
    allowedTargets: ["local", "staging", "production"],
    safetyRationale: "Giao diện hộp thư, kiểm tra không bị lỗi biên dịch hoặc sập server 500.",
  },
  {
    path: "/orders",
    method: "GET",
    group: "ui-readonly",
    allowedTargets: ["local", "staging", "production"],
    safetyRationale: "Giao diện đơn hàng, kiểm tra tính sẵn sàng hiển thị.",
  },
  {
    path: "/customers",
    method: "GET",
    group: "ui-readonly",
    allowedTargets: ["local", "staging", "production"],
    safetyRationale: "Giao diện khách hàng 360, kiểm tra hiển thị không lỗi biên dịch.",
  },
  {
    path: "/inventory",
    method: "GET",
    group: "ui-readonly",
    allowedTargets: ["local", "staging", "production"],
    safetyRationale: "Giao diện kho và combo, kiểm tra render an toàn.",
  },
  {
    path: "/settings",
    method: "GET",
    group: "ui-readonly",
    allowedTargets: ["local", "staging", "production"],
    safetyRationale: "Giao diện cài đặt và phân quyền RBAC.",
  },

  // Nhóm 4: Integrations Readonly (Kiểm tra trạng thái cấu hình không đột biến)
  {
    path: "/api/sidebar-stats",
    method: "GET",
    group: "integrations-readonly",
    allowedTargets: ["local", "staging", "production"],
    safetyRationale: "Chỉ đọc số liệu tổng hợp (badges) số kênh và trạng thái, không thay đổi dữ liệu.",
  },
  {
    path: "/api/tags",
    method: "GET",
    group: "integrations-readonly",
    allowedTargets: ["local", "staging", "production"],
    safetyRationale: "Đọc danh mục thẻ tag phân loại y tế & nguồn khách, chỉ đọc.",
  },

  // Nhóm 5: Security Safe Checks
  {
    path: "/api/reports/financial",
    method: "GET",
    group: "security-safe",
    allowedTargets: ["local", "staging", "production"],
    safetyRationale: "Kiểm tra ranh giới bảo mật RBAC: endpoint tài chính phải từ chối truy cập không có quyền ADMIN.",
  },
  {
    path: "/api/settings/channel-permissions",
    method: "GET",
    group: "security-safe",
    allowedTargets: ["local", "staging", "production"],
    safetyRationale: "Kiểm tra bảo vệ phân quyền kênh kết nối.",
  },
];

/**
 * Danh sách các endpoint đột biến (Mutating / Unsafe) bị CẤM GỌI ở chế độ Read-only.
 * QA Agent sẽ đánh dấu trạng thái "BLOCKED" kèm giải thích nếu có kịch bản nhắc tới.
 */
const BLOCKED_MUTATING_ENDPOINTS = [
  {
    path: "/api/channels/tiktok/sync-messages",
    reason: "Endpoint kích hoạt kéo tin nhắn thật từ TikTok Shop Open API về cơ sở dữ liệu.",
  },
  {
    path: "/api/channels/tiktok/refresh",
    reason: "Endpoint đổi OAuth2 Refresh Token thật sang Access Token mới.",
  },
  {
    path: "/api/channels/zalo/send",
    reason: "Endpoint gửi tin nhắn Zalo thật tới người dùng.",
  },
  {
    path: "/api/orders/kiotviet/sync",
    reason: "Endpoint kích hoạt đồng bộ đơn hàng thật từ KiotViet POS và ghi vào orders.json.",
  },
  {
    path: "/api/webhooks/kiotviet",
    reason: "Endpoint Webhook tiếp nhận đơn hàng, kích hoạt trừ tồn kho và sinh CarePlan.",
  },
  {
    path: "/api/webhooks/tiktok",
    reason: "Endpoint Webhook tiếp nhận sự kiện đơn hàng/tin nhắn sàn TikTok Shop.",
  },
  {
    path: "/api/broadcast/send",
    reason: "Endpoint kích hoạt hàng đợi phát tin nhắn hàng loạt ra kênh Zalo.",
  },
  {
    path: "/api/customers",
    method: "POST",
    reason: "Endpoint tạo mới/ghi đè hồ sơ khách hàng 360.",
  },
];

/**
 * Kiểm tra xem một yêu cầu HTTP có thuộc Allowlist an toàn hay không
 */
function isEndpointAllowed(method, path, target = "local") {
  const normMethod = String(method || "GET").toUpperCase();
  const cleanPath = String(path || "").split("?")[0].trim();

  // 1. Tuyệt đối từ chối nếu không phải GET hoặc HEAD
  if (normMethod !== "GET" && normMethod !== "HEAD") {
    return {
      allowed: false,
      reason: `Phương thức ${normMethod} không được phép trong chế độ Read-only an toàn.`,
    };
  }

  // 2. Kiểm tra trong danh sách cấm
  const blockedMatch = BLOCKED_MUTATING_ENDPOINTS.find((b) => b.path === cleanPath);
  if (blockedMatch) {
    return {
      allowed: false,
      reason: blockedMatch.reason,
      isBlockedCategory: true,
    };
  }

  // 3. Đối chiếu trong Allowlist
  const match = ENDPOINT_ALLOWLIST.find(
    (e) => e.path === cleanPath && (e.method === normMethod || normMethod === "HEAD")
  );

  if (!match) {
    return {
      allowed: false,
      reason: `Endpoint "${cleanPath}" không nằm trong Allowlist được phê duyệt an toàn.`,
    };
  }

  if (!match.allowedTargets.includes(target)) {
    return {
      allowed: false,
      reason: `Endpoint "${cleanPath}" không được phép chạy trên môi trường mục tiêu "${target}".`,
    };
  }

  return {
    allowed: true,
    entry: match,
  };
}

module.exports = {
  ENDPOINT_ALLOWLIST,
  BLOCKED_MUTATING_ENDPOINTS,
  isEndpointAllowed,
};
