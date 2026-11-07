# BÁO CÁO KIỂM THỬ TỰ ĐỘNG & NGHIỆM THU HỆ THỐNG (QA AUTOMATION BUG REPORT)
**Dự án:** Hệ thống Quản trị Khách hàng & Đa kênh ADDP CRM (`https://crm.addp.vn`)  
**Ngày thực hiện:** `2026-11-07`  
**Người thực hiện:** QA Automation Tester (Antigravity AI Agent — Playwright Headless Chromium)  
**Tài liệu đối chiếu:** [`AGENTS.md`](file:///c:/addp-crm/AGENTS.md) (11 Điều luật thực thi) & [`TASKS.md`](file:///c:/addp-crm/TASKS.md) (`WBS-01` → `WBS-50`)  
**Thư mục ảnh chụp màn hình bằng chứng:** [`reports/qa_screenshots/`](file:///c:/addp-crm/reports/qa_screenshots/)

---

## I. TỔNG QUAN KẾT QUẢ KIỂM THỬ & NGHIỆM THU SAU KHI SỬA LỖI (EXECUTIVE SUMMARY)

| Hạng mục nghiệm thu | Trạng thái Ban đầu | Trạng thái Sau khi sửa | Kết quả nghiệm thu Playwright (`qa_verify_fixed_results.json`) |
| :--- | :---: | :---: | :--- |
| **0. Console Errors & Network 4xx/5xx trên toàn bộ 12 Route** | **PASS (0 lỗi)** | **✅ PASS (0 lỗi)** | Không phát sinh bất kỳ lỗi cú pháp JS (`pageerror`), lỗi Console hay lỗi HTTP 5xx nào khi duyệt qua toàn bộ 12 trang trong `portal/`. |
| **1. Đăng nhập, Phân quyền RBAC, Khung Portal & Thông báo Realtime** | **CẦN SỬA (4 lỗi)** | **✅ PASS (4/4 đã sửa)** | Chưa đăng nhập trả về `401` và tự động redirect về `/login`; `SALE` và `KHO` bị chặn `403` ở cả API và giao diện (`AppShell.js`); Chuông thông báo nối dữ liệu thực & sự kiện Realtime; Nhân sự lưu bền vững vào `.data/staff.json`. |
| **2. Kết nối Đa kênh (Zalo QR, Zalo OA, Fanpage FB, TikTok, Shopee, KiotViet, Magento)** | **PASS** | **✅ PASS** | Hiển thị đầy đủ 7 nền tảng, tab lọc theo kênh, nút kiểm tra kết nối (Health Check) và Modal quét mã QR Zalo Cá nhân (`zca-js`) hoạt động ổn định. |
| **3. Hộp thư đa kênh 3 cột (Omnichannel Inbox): Hội thoại, Tin nhắn, AI gợi ý & Bắt SĐT** | **CẦN SỬA (3 lỗi)** | **✅ PASS (3/3 đã sửa)** | `✨ A.I. Soạn` nhận đúng `customerMessage`/`draftIdea` và sinh câu tư vấn chuẩn xác; tự động quét SĐT từ nội dung chat (`extractChatPhoneNumbers`) để khớp Hồ sơ 360 ở Cột 3 và điền sẵn vào `QuickOrderModal`. |
| **4. Quản lý Khách hàng 360, Chuẩn hóa SĐT 10 số, Hồ sơ bệnh lý & Lộ trình CarePlan** | **CẦN SỬA (2 lỗi)** | **✅ PASS (2/2 đã sửa)** | Đã xóa bỏ hoàn toàn hàm sinh SĐT ngẫu nhiên `Math.random()`, bắt buộc SĐT chuẩn 10 số Việt Nam (`03, 05, 07, 08, 09`); tạo đơn hàng hoặc bấm Giao thành công (`DELIVERED`) tự động đẩy 7 mốc CarePlan vào `/work-tracking`. |
| **5. Đơn hàng, Kho Combo (`resolve_all_formulas`), Đồng bộ Magento & Báo cáo Lãi/Lỗ Ads TikTok** | **CẦN SỬA (3 lỗi)** | **✅ PASS (3/3 đã sửa)** | Webhook Magento bảo toàn 100% `fullName`, `pathology`, `staffId`; nút `+ Tạo Đơn Hàng Mới` tại `/orders` cho phép nhập tay Tên & SĐT khách; Engine Tài chính truyền `getCustomFormulasMap()` vào `resolveComboFormulaList` tính đúng giá vốn (`COGS = 365.000đ`). |

---

## II. KẾT QUẢ DUYỆT TỰ ĐỘNG QUA TOÀN BỘ CÁC ROUTE (`portal/`)

Kịch bản Playwright đã truy cập vào `http://crm.addp.vn/` (tự động chuyển hướng `301` sang `https://crm.addp.vn/`), đăng nhập với tài khoản `ADMIN` / `123456` và tuần tự click qua toàn bộ các mục trên Sidebar:

| STT | Route | Tiêu đề trang | HTTP Status | Console / Page Error | Ảnh chụp màn hình nghiệm thu |
| :-: | :--- | :--- | :-: | :-: | :--- |
| 1 | `/login` | ADDP CRM — Đăng nhập Hệ thống | `200 OK` | `0` | [`01_login_page.png`](file:///c:/addp-crm/reports/qa_screenshots/01_login_page.png) |
| 2 | `/` | Trung Tâm Điều Hành ADDP CRM | `200 OK` | `0` | [`02_dashboard_after_login.png`](file:///c:/addp-crm/reports/qa_screenshots/02_dashboard_after_login.png), [`03_dashboard.png`](file:///c:/addp-crm/reports/qa_screenshots/03_dashboard.png) |
| 3 | `/inbox` | Hộp thư Đa kênh 3 cột (Omnichannel Inbox) | `200 OK` | `0` | [`04_inbox.png`](file:///c:/addp-crm/reports/qa_screenshots/04_inbox.png), [`04b_inbox_ai_compose.png`](file:///c:/addp-crm/reports/qa_screenshots/04b_inbox_ai_compose.png) |
| 4 | `/customers` | Quản lý Khách hàng 360 | `200 OK` | `0` | [`05_customers.png`](file:///c:/addp-crm/reports/qa_screenshots/05_customers.png) |
| 5 | `/customers/1001` | Chi tiết Hồ sơ Sức khỏe & Lộ trình CarePlan | `200 OK` | `0` | [`05b_customer_detail_360.png`](file:///c:/addp-crm/reports/qa_screenshots/05b_customer_detail_360.png) |
| 6 | `/work-tracking` | Lịch Chăm sóc Hàng ngày (`WorkTracking`) | `200 OK` | `0` | [`06_work_tracking.png`](file:///c:/addp-crm/reports/qa_screenshots/06_work_tracking.png) |
| 7 | `/broadcast` | Chiến dịch AI & Gửi tin Hàng loạt (`SmartBroadcastQueue`) | `200 OK` | `0` | [`07_broadcast.png`](file:///c:/addp-crm/reports/qa_screenshots/07_broadcast.png) |
| 8 | `/orders` | Quản lý Đơn hàng Đa nền tảng | `200 OK` | `0` | [`08_orders.png`](file:///c:/addp-crm/reports/qa_screenshots/08_orders.png) |
| 9 | `/inventory` | Kho Combo, Hàng đóng sẵn & Ánh xạ SKU | `200 OK` | `0` | [`09_inventory.png`](file:///c:/addp-crm/reports/qa_screenshots/09_inventory.png), [`09b_inventory_combo_resolved.png`](file:///c:/addp-crm/reports/qa_screenshots/09b_inventory_combo_resolved.png), [`09c_inventory_tab_1.png`](file:///c:/addp-crm/reports/qa_screenshots/09c_inventory_tab_1.png), [`09c_inventory_tab_2.png`](file:///c:/addp-crm/reports/qa_screenshots/09c_inventory_tab_2.png) |
| 10 | `/channels` | Trung tâm Kết nối 7 Kênh | `200 OK` | `0` | [`10_channels.png`](file:///c:/addp-crm/reports/qa_screenshots/10_channels.png), [`10b_channels_zalo_qr_modal.png`](file:///c:/addp-crm/reports/qa_screenshots/10b_channels_zalo_qr_modal.png) |
| 11 | `/reports` | Báo cáo Doanh số, Lãi/Lỗ, Ads GMV Max, Thuế & KPI | `200 OK` | `0` | [`11_reports.png`](file:///c:/addp-crm/reports/qa_screenshots/11_reports.png), [`11_loss_report.png`](file:///c:/addp-crm/reports/qa_screenshots/11_loss_report.png), [`11_tax_report.png`](file:///c:/addp-crm/reports/qa_screenshots/11_tax_report.png) |
| 12 | `/settings` | Quản trị Nhân sự, Phân quyền 7 Kênh & SSO | `200 OK` | `0` | [`12_settings.png`](file:///c:/addp-crm/reports/qa_screenshots/12_settings.png) |
| 13 | `/guide` | Sổ tay Hướng dẫn Sử dụng | `200 OK` | `0` | [`13_guide.png`](file:///c:/addp-crm/reports/qa_screenshots/13_guide.png) |

---

## III. DANH SÁCH LỖI PHÁT HIỆN & VỊ TRÍ FILE CODE CẦN SỬA CHI TIẾT

### Nhóm 1: Đăng nhập, Phân quyền RBAC, Giao diện Khung Portal & Thông báo Realtime

#### 🔴 [BUG-01] Mức độ: Cao (Critical Security) — Chưa đăng nhập vẫn vào thẳng hệ thống với toàn quyền `ADMIN`
- **Hiện tượng:** Khi mở trình duyệt mới hoàn toàn (chưa có cookie `addp_crm_session`) và truy cập `http://crm.addp.vn/`, hệ thống **không chuyển hướng** về `/login` mà mở thẳng trang chủ `/` dưới quyền `Quản Trị Viên ADDP (ADMIN)` (Bằng chứng: [`00_unauth_home.png`](file:///c:/addp-crm/reports/qa_screenshots/00_unauth_home.png)).
- **Nguyên nhân gốc:**
  1. Dự án chưa có file `middleware.js` của Next.js để kiểm tra phiên đăng nhập ở tầng Edge/Routing.
  2. Trong API xác thực phiên hiện tại và hàm `getSessionStaff`, khi không tìm thấy cookie hợp lệ, code tự động fallback gán mặc định tài khoản `"ADMIN"`.
- **Vị trí file code cần sửa:**
  - [`portal/src/app/api/auth/me/route.js`](file:///c:/addp-crm/portal/src/app/api/auth/me/route.js#L10-L15): Đang viết `if (!user) { user = getStaffByIdOrCode("ADMIN"); }` và trả về `authenticated: true`. Cần trả về `{ authenticated: false, user: null }` với HTTP `401`.
  - [`portal/src/lib/auth.js`](file:///c:/addp-crm/portal/src/lib/auth.js#L576-L592): Hàm `getSessionStaff` đang fallback về `getStaffByIdOrCode("ADMIN")` khi không có cookie.
  - [`portal/src/app/components/AppShell.js`](file:///c:/addp-crm/portal/src/app/components/AppShell.js#L13-L31): State khởi tạo `currentUser` mặc định là `ADMIN` và khi `/api/auth/me` trả về chưa đăng nhập chưa gọi `router.replace("/login")`.

#### 🔴 [BUG-02] Mức độ: Cao (RBAC Violation — Vi phạm Điều 5 `AGENTS.md`) — Nhân viên `SALE` và `KHO` vẫn truy cập được trang và API trái thẩm quyền
- **Hiện tượng:**
  1. Khi đăng nhập bằng tài khoản `S002` (Vai trò: `SALE`), thanh Sidebar đã ẩn mục **Báo cáo BI & Lãi/Lỗ** và **Nhân sự & Phân quyền**, nhưng nếu gõ trực tiếp URL `https://crm.addp.vn/reports` hoặc `https://crm.addp.vn/settings`, hệ thống vẫn hiển thị toàn bộ Giá vốn (`COGS`), Lợi nhuận ròng (`netProfit`) và Ma trận phân quyền (Bằng chứng: [`14_rbac_sale_access_settings.png`](file:///c:/addp-crm/reports/qa_screenshots/14_rbac_sale_access_settings.png), [`15_rbac_sale_access_reports.png`](file:///c:/addp-crm/reports/qa_screenshots/15_rbac_sale_access_reports.png)).
  2. API `/api/reports/financial` trả về `200 OK` kèm đầy đủ `netProfit` khi gọi dưới phiên của `SALE` (`S002`).
  3. Khi đăng nhập bằng tài khoản `KHO01` (Vai trò: `KHO`), gọi `/api/channels/zalo/conversations` vẫn trả về `200 OK` với toàn bộ 443 cuộc hội thoại của khách hàng (vi phạm Điều 5: *"KHO / KE_TOAN: Chỉ truy cập module Đơn hàng, Tồn kho, Combo, Đối soát và Thống kê Thuế"*).
- **Vị trí file code cần sửa:**
  - [`portal/src/app/components/AppShell.js`](file:///c:/addp-crm/portal/src/app/components/AppShell.js#L21-L35): Bổ sung kiểm tra `canAccessModule(currentUser.role, currentModuleKey)` để chặn và hiển thị thông báo từ chối truy cập nếu nhân viên gõ thẳng URL trên trình duyệt.
  - [`portal/src/app/api/reports/financial/route.js`](file:///c:/addp-crm/portal/src/app/api/reports/financial/route.js#L9-L26) & [`portal/src/app/reports/page.js`](file:///c:/addp-crm/portal/src/app/reports/page.js#L9-L28): Bổ sung kiểm tra `guardApiRequest` chỉ cho phép `["ADMIN", "SALE_LEADER", "KE_TOAN"]` (và ẩn `cogsAmount`, `netProfit` đối với `SALE_LEADER` theo Điều 5).
  - [`portal/src/app/api/channels/zalo/conversations/route.js`](file:///c:/addp-crm/portal/src/app/api/channels/zalo/conversations/route.js#L139-L155): Gọi `guardApiRequest` với `moduleKey: "inbox"` và `filterRecordsByRbac(staff, conversations, "conversations")` để chặn `KHO`/`KE_TOAN` và lọc theo kênh được phân quyền của `SALE`.

#### 🟡 [BUG-03] Mức độ: Trung bình (Vi phạm Điều 11 `AGENTS.md`) — Chuông thông báo thời gian thực trên Header đang dùng mảng tĩnh `SAMPLE_NOTIFICATIONS`
- **Hiện tượng:** Nút chuông thông báo trên thanh Header luôn hiển thị số `2` cố định và 3 dòng thông báo mẫu tĩnh, chưa lắng nghe luồng SSE `/api/inbox/stream` khi có tin nhắn mới hoặc đơn hàng Webhook mới đổ về.
- **Vị trí file code cần sửa:**
  - [`portal/src/app/components/Header.js`](file:///c:/addp-crm/portal/src/app/components/Header.js#L21-L43): Thay thế hằng số `SAMPLE_NOTIFICATIONS` bằng state kết nối tới `EventSource("/api/inbox/stream")` và dữ liệu sự kiện thực tế từ hệ thống.

#### 🟡 [BUG-04] Mức độ: Trung bình — Dữ liệu đổi mật khẩu và tạo nhân viên lưu trên RAM (`runtimeStaffStore`), bị mất khi khởi động lại tiến trình
- **Hiện tượng:** Khi đổi mật khẩu qua `/api/staff/change-password` hoặc thêm nhân sự mới tại `/settings`, dữ liệu chỉ cập nhật vào `Map` trong bộ nhớ Node.js (`runtimeStaffStore`), chưa lưu bền vững xuống file `.data/staff.json` hoặc bảng `staff` trong MySQL.
- **Vị trí file code cần sửa:**
  - [`portal/src/lib/auth.js`](file:///c:/addp-crm/portal/src/lib/auth.js#L69-L190) và [`portal/src/app/api/staff/change-password/route.js`](file:///c:/addp-crm/portal/src/app/api/staff/change-password/route.js#L1-L40): Đồng bộ đọc/ghi xuống `.data/staff.json` hoặc CSDL tương tự như `inventoryStore.js` và `ordersStore.js`.

---

### Nhóm 2 & 3: Kết nối Đa kênh & Hộp thư Đa kênh 3 cột (Omnichannel Inbox)

#### 🔴 [BUG-05] Mức độ: Cao (Functional Bug — WBS-33) — Nút `✨ A.I. Soạn` trong Hộp thư luôn trả về câu chào mặc định do lệch tên trường JSON giữa Frontend và API
- **Hiện tượng:** Tại trang `/inbox`, khi khách nhắn câu hỏi (ví dụ: *"Sữa tiểu đường Glucare giá bao nhiêu tiền?"*) hoặc khi Sale gõ ý chính vào ô nhập chat rồi bấm nút **`✨ A.I. Soạn`**, AI không tư vấn theo nội dung tin nhắn mà luôn trả về câu chào mở đầu chung chung, kèm lý do Judge: `"Tin nhắn rỗng"` (Bằng chứng trong `qa_results.json`: `judgeReason: "Tin nhắn rỗng"`).
- **Nguyên nhân gốc:**
  - Frontend gửi body JSON gồm `{ customerMessage, draftIdea, customerName, mode, channel }`.
  - Nhưng API Route `/api/ai/compose` lại bóc tách `const { message, customerName, mode } = body;` (`message` luôn là `undefined`), dẫn đến truyền chuỗi rỗng `""` vào `judgeCustomerMessage("")` và `generateAiDraftResponse({ customerMessage: "" })`.
- **Vị trí file code cần sửa:**
  - [`portal/src/app/api/ai/compose/route.js`](file:///c:/addp-crm/portal/src/app/api/ai/compose/route.js#L6-L16):
    ```javascript
    // Hiện tại (LỖI):
    const { message, customerName, mode } = body;
    // Cần sửa thành:
    const rawMsg = body.draftIdea?.trim() || body.customerMessage?.trim() || body.message?.trim() || "";
    ```
  - [`portal/src/app/inbox/LiveZaloInbox.js`](file:///c:/addp-crm/portal/src/app/inbox/LiveZaloInbox.js#L514-L539): Hiển thị thêm thẻ Tag phát hiện được (`data.tags`) và số điện thoại bắt được (`data.detectedPhone`) lên Cột 3 (Hồ sơ 360).

#### 🟠 [BUG-06] Mức độ: Cao (Functional Bug — WBS-25 & WBS-34) — Chưa tự động trích xuất SĐT từ nội dung tin nhắn chat để liên kết Hồ sơ Khách hàng 360 ở Cột 3
- **Hiện tượng:** Khi khách hàng nhắn số điện thoại trong nội dung hội thoại Zalo hoặc Fanpage Facebook (nhưng đối tượng `activeConv.phone` ban đầu đang rỗng), Cột 3 của `/inbox` chỉ tìm kiếm theo `activeConv.phone || activeConv.name` chứ chưa quét mảng `messages` qua hàm `extractPhoneNumbersFromText()` để tự động bắt SĐT và khớp nối với Hồ sơ Khách hàng 360.
- **Vị trí file code cần sửa:**
  - [`portal/src/app/inbox/LiveZaloInbox.js`](file:///c:/addp-crm/portal/src/app/inbox/LiveZaloInbox.js#L395-L432): Quét `messages` bằng regex bắt SĐT Việt Nam (hoặc `extractPhoneNumbersFromText`) khi `activeConv.phone` chưa có, tự động hiển thị SĐT bắt được ở Header/Cột 3 và gọi `/api/customers?search=<detectedPhone>`.

#### 🟠 [BUG-07] Mức độ: Trung bình (Functional Bug — WBS-39) — Modal "Lên Đơn Hàng Nhanh" trong Inbox lấy `activeConv.id` (Zalo Thread ID / Facebook PSID) làm Số điện thoại khách hàng
- **Hiện tượng:** Khi mở Modal **Lên Đơn Hàng Nhanh** từ một hội thoại Zalo hoặc Fanpage chưa có `customer.phone`, component `QuickOrderModal` gán `phone: customer?.phone || customer?.id || ""` và hiển thị chuỗi ID dài (VD: `1781287338457243967` hoặc `t_123456`) làm Số điện thoại định danh, đồng thời không có ô `input` để Sale nhập hoặc sửa SĐT khách hàng.
- **Vị trí file code cần sửa:**
  - [`portal/src/app/components/QuickOrderModal.js`](file:///c:/addp-crm/portal/src/app/components/QuickOrderModal.js#L67-L82) và [`QuickOrderModal.js`](file:///c:/addp-crm/portal/src/app/components/QuickOrderModal.js#L130-L141): Bổ sung state `customerName` và `phone` có ô `<input>` cho phép Sale nhập/chỉnh sửa, tuyệt đối không lấy `customer.id` (Thread ID) gán vào trường `phone` và kiểm tra `isValidVietnamPhone(phone)` trước khi lưu đơn.

---

### Nhóm 4: Quản lý Khách hàng 360, Chuẩn hóa SĐT 10 số, Hồ sơ Bệnh lý & Lộ trình CarePlan

#### 🔴 [BUG-08] Mức độ: Cao (Vi phạm Điều 3 & Điều 11 `AGENTS.md`) — Tự động sinh số điện thoại ngẫu nhiên ảo nếu tạo khách hàng thiếu SĐT
- **Hiện tượng:** Trong `resolveCustomerIdentity`, nếu đầu vào không có số điện thoại hợp lệ (`normalizedPhone` rỗng), hàm tự động tạo SĐT giả bằng `Math.random()`: ``phone: normalizedPhone || `09${Math.floor(10000000 + Math.random() * 90000000)}` ``. Điều này vi phạm trực tiếp **Điều 3** (Khóa định danh SĐT 10 số chuẩn) và **Điều 11** (*"TUYỆT ĐỐI KHÔNG TỰ TẠO SỐ LIỆU GIẢ, SỐ LIỆU ẢO"*).
- **Vị trí file code cần sửa:**
  - [`portal/src/lib/customerIdentityResolver.js`](file:///c:/addp-crm/portal/src/lib/customerIdentityResolver.js#L113): Loại bỏ đoạn sinh SĐT ngẫu nhiên; yêu cầu bắt buộc phải có SĐT hợp lệ qua `isValidVietnamPhone()` hoặc để trống `""` chờ cập nhật khi khách chỉ mới tương tác qua UID.
  - [`portal/src/app/api/customers/route.js`](file:///c:/addp-crm/portal/src/app/api/customers/route.js#L62-L76): Kiểm tra `isValidVietnamPhone(body.phone)` trong `POST /api/customers`, trả về lỗi `400` tiếng Việt rõ ràng nếu SĐT không đúng chuẩn 10 số Việt Nam.

#### 🟠 [BUG-09] Mức độ: Cao (Functional Bug — WBS-28 & WBS-29) — Tạo đơn hàng mới có gọi `generateCareTasks` nhưng không lưu vào danh sách công việc `/work-tracking`
- **Hiện tượng:** Khi tạo đơn hàng mới qua `POST /api/orders` (mã đơn kiểm thử `DH-261107-3634`), hàm `createOrder` trong `ordersStore.js` có gọi `generateCareTasks({...})`, nhưng:
  1. Hàm `generateCareTasks` trong `careAutomation.js` chỉ là hàm thuần (`pure function`) trả về mảng 7 mốc chăm sóc chứ **không ghi vào kho lưu trữ công việc** (`dynamicTasksStore`).
  2. Bộ lọc tại `/api/care/tasks` chỉ khởi tạo 1 lần duy nhất (`if (dynamicTasksStore.length > 0) return;`), nên tổng số công việc trước và sau khi lên đơn hàng mới vẫn giữ nguyên là `42` task (`tasks_before_count: 42`, `tasks_after_count: 42`).
  3. Ngoài ra theo `TASKS.md` (**WBS-28**), lịch chăm sóc Ngày 1, 3, 7, 14, 21, 1/2, 2/3 được sinh khi đơn hàng chuyển sang trạng thái **Giao thành công (`DELIVERED`)**, nhưng hiện tại trang `/orders` chưa có nút đổi trạng thái đơn hàng sang `DELIVERED`.
- **Vị trí file code cần sửa:**
  - [`portal/src/lib/ordersStore.js`](file:///c:/addp-crm/portal/src/lib/ordersStore.js#L93-L106) & [`portal/src/app/api/care/tasks/route.js`](file:///c:/addp-crm/portal/src/app/api/care/tasks/route.js#L10-L60): Tách `tasksStore` ra thư mục `portal/src/lib/` để khi tạo đơn hoặc khi đơn hàng chuyển sang `DELIVERED`, 7 mốc công việc chăm sóc được đẩy thực tế vào danh sách hiển thị trên trang `/work-tracking`.
  - [`portal/src/app/orders/OrdersClient.js`](file:///c:/addp-crm/portal/src/app/orders/OrdersClient.js#L241-L273): Bổ sung thao tác cập nhật trạng thái đơn hàng (VD: chuyển sang `DELIVERED` / Giao thành công) để kích hoạt lộ trình CarePlan.

---

### Nhóm 5: Đơn hàng, Kho Combo, Đồng bộ Magento 2.4.8 & Báo cáo Lãi/Lỗ Ads TikTok

#### 🔴 [BUG-10] Mức độ: Cao (Functional Bug — WBS-37) — Webhook Magento 2.4.8 truyền lệch tên trường vào `resolveCustomerIdentity`, làm mất Họ tên, Bệnh lý và Sale phụ trách
- **Hiện tượng:** Khi gửi POST Webhook Form Lead tới `/api/webhooks/magento` với dữ liệu `{ name: "Nguyễn Thị Kiểm Thử Magento", phone: "+84 918 765 432", category: "Tư vấn tiểu đường tuýp 2" }`:
  - Số điện thoại được chuẩn hóa đúng thành `0918765432`.
  - Nhưng hồ sơ khách hàng tạo ra lại bị lưu thành:
    - `fullName: "Khách hàng mới"` (mất tên thật của khách).
    - `pathology: "Cần tư vấn bệnh lý"` (mất bệnh lý `"Tiểu đường tuýp 2"`).
    - `staffId: 4` (`CS01`), lệch với `assignedStaff` đã chia trước đó là `id: 2` (`S001`).
- **Nguyên nhân gốc:**
  - Trong `magentoConnector.js`, hàm `processMagentoFormSubmission` gọi `resolveCustomerIdentity({ name: fullName, assignedStaffId: assignedStaff?.id, initialPathology: ... })`.
  - Trong khi đó, hàm `resolveCustomerIdentity` trong `customerIdentityResolver.js` lại đọc các trường `input.fullName`, `input.staffId`, và `input.pathology`.
- **Vị trí file code cần sửa:**
  - [`portal/src/lib/magentoConnector.js`](file:///c:/addp-crm/portal/src/lib/magentoConnector.js#L42-L53): Đổi tên các tham số truyền vào `resolveCustomerIdentity` thành `fullName`, `staffId`, `pathology` (và hỗ trợ cả alias `name`, `assignedStaffId`, `initialPathology` bên trong [`portal/src/lib/customerIdentityResolver.js`](file:///c:/addp-crm/portal/src/lib/customerIdentityResolver.js#L76-L140)).

#### 🟠 [BUG-11] Mức độ: Trung bình (Functional Bug — WBS-40) — Nút "+ Tạo Đơn Hàng Mới" trên trang `/orders` truyền `customer={null}` khiến không thể nhập Tên và SĐT khách
- **Hiện tượng:** Trên trang `/orders`, khi bấm nút **"+ Tạo Đơn Hàng Mới"**, hệ thống mở `QuickOrderModal` với prop `customer={null}`. Do `QuickOrderModal` chỉ hiển thị text tĩnh `Khách Zalo` và `Chưa có SĐT` (không có ô input nhập Tên và SĐT), khi bấm xác nhận tạo đơn, API `/api/orders` trả về lỗi `400: "Vui lòng nhập số điện thoại khách hàng"`, khiến người dùng không thể tạo đơn hàng mới từ trang `/orders`.
- **Vị trí file code cần sửa:**
  - [`portal/src/app/orders/OrdersClient.js`](file:///c:/addp-crm/portal/src/app/orders/OrdersClient.js#L281-L290) và [`portal/src/app/components/QuickOrderModal.js`](file:///c:/addp-crm/portal/src/app/components/QuickOrderModal.js#L130-L152): Cho phép nhập `Họ tên khách hàng` và `Số điện thoại` ngay trong `QuickOrderModal` khi `customer` là `null` hoặc chưa có SĐT.

#### 🟡 [BUG-12] Mức độ: Trung bình (Data Sync — WBS-41 & WBS-43) — Công thức Combo tạo mới trên UI chưa được truyền vào Engine tính giá vốn (COGS) của Báo cáo Tài chính
- **Hiện tượng:** Tại trang `/inventory`, khi người dùng thêm mới một mã Combo tùy chỉnh vào kho (`inventory.json`), API kiểm thử `/api/inventory/resolve-combo` có đọc `getCustomFormulasMap()` nên phân rã đúng. Tuy nhiên trong `financialEngine.js` (hàm `computeOrderFinancials`), khi tính giá vốn `totalCogs` cho các đơn hàng, hàm gọi `resolveComboFormulaList(sku, qty)` mà **không truyền tham số thứ 3 (`customFormulas`)**, khiến các mã Combo mới tạo trên giao diện không được phân rã hết về sản phẩm gốc khi lên báo cáo Lãi/Lỗ.
- **Vị trí file code cần sửa:**
  - [`portal/src/lib/financialEngine.js`](file:///c:/addp-crm/portal/src/lib/financialEngine.js#L11-L12) và [`financialEngine.js`](file:///c:/addp-crm/portal/src/lib/financialEngine.js#L95-L108): Import `getCustomFormulasMap` từ `./inventoryStore.js` và truyền vào `resolveComboFormulaList(sku, qty, customFormulas)`.

---

## IV. KẾT QUẢ NGHIỆM THU SAU KHI KHẮC PHỤC (12/12 PASS — 100%)

Bộ kiểm thử tự động Playwright ([`qa_verify_fixed_results.json`](file:///c:/addp-crm/reports/qa_screenshots/qa_verify_fixed_results.json)) đã chạy lại toàn diện trên bản build production của `portal/` và xác nhận **12/12 lỗi đã được khắc phục hoàn toàn (`ALL_PASSED = True`, `0` Console Errors, `0` Page Errors)**:

| Mã lỗi | Trạng thái | File đã chỉnh sửa | Bằng chứng nghiệm thu thực tế (Playwright Automated Verification) | Ảnh chụp nghiệm thu |
| :---: | :---: | :--- | :--- | :--- |
| **BUG-01** | ✅ **PASS** | [`portal/src/app/api/auth/me/route.js`](file:///c:/addp-crm/portal/src/app/api/auth/me/route.js), [`portal/src/lib/auth.js`](file:///c:/addp-crm/portal/src/lib/auth.js), [`portal/src/app/components/AppShell.js`](file:///c:/addp-crm/portal/src/app/components/AppShell.js) | Truy cập khi chưa có cookie trả về HTTP `401` (`authenticated: false`) và tự động chuyển hướng về `/login`. | [`verify_01_unauth_redirect_login.png`](file:///c:/addp-crm/reports/qa_screenshots/verify_01_unauth_redirect_login.png) |
| **BUG-02** | ✅ **PASS** | [`portal/src/app/components/AppShell.js`](file:///c:/addp-crm/portal/src/app/components/AppShell.js), [`portal/src/app/api/reports/financial/route.js`](file:///c:/addp-crm/portal/src/app/api/reports/financial/route.js), [`portal/src/app/reports/page.js`](file:///c:/addp-crm/portal/src/app/reports/page.js), [`portal/src/app/api/channels/zalo/conversations/route.js`](file:///c:/addp-crm/portal/src/app/api/channels/zalo/conversations/route.js) | `SALE` (`S002`) gọi `/api/reports/financial` bị chặn `403`, truy cập `/settings` & `/reports` bị chặn bởi màn hình RBAC Security; `KHO` (`KHO01`) gọi `/api/channels/zalo/conversations` bị chặn `403` và chặn UI `/inbox`. | [`verify_02a_sale_blocked_settings.png`](file:///c:/addp-crm/reports/qa_screenshots/verify_02a_sale_blocked_settings.png), [`verify_02b_sale_blocked_reports.png`](file:///c:/addp-crm/reports/qa_screenshots/verify_02b_sale_blocked_reports.png), [`verify_02c_kho_blocked_inbox.png`](file:///c:/addp-crm/reports/qa_screenshots/verify_02c_kho_blocked_inbox.png) |
| **BUG-03** | ✅ **PASS** | [`portal/src/app/components/Header.js`](file:///c:/addp-crm/portal/src/app/components/Header.js), [`portal/src/app/inbox/LiveZaloInbox.js`](file:///c:/addp-crm/portal/src/app/inbox/LiveZaloInbox.js) | Chuông thông báo nạp dữ liệu thực từ `/api/orders` & `/api/care/tasks` và nhận sự kiện thời gian thực (`addp:realtime-event`). | [`verify_03_header_notifications.png`](file:///c:/addp-crm/reports/qa_screenshots/verify_03_header_notifications.png) |
| **BUG-04** | ✅ **PASS** | [`portal/src/lib/auth.js`](file:///c:/addp-crm/portal/src/lib/auth.js) | Tạo nhân sự mới (`QA99`) và đổi mật khẩu được ghi bền vững xuống `.data/staff.json`, giữ nguyên sau khi khởi động lại server. | Đã xác thực qua `/api/staff` |
| **BUG-05** | ✅ **PASS** | [`portal/src/app/api/ai/compose/route.js`](file:///c:/addp-crm/portal/src/app/api/ai/compose/route.js), [`portal/src/app/inbox/LiveZaloInbox.js`](file:///c:/addp-crm/portal/src/app/inbox/LiveZaloInbox.js) | API nhận linh hoạt `draftIdea \|\| customerMessage \|\| message`, trả về `200 OK` kèm câu tư vấn chính xác: *"Dạ em chào Chú Hùng! Dạ dòng Sữa Hạt Tiểu Đường Glucare Plus bên em hiện có giá niêm yết là 590.000đ/hộp 800g..."* | [`04b_inbox_ai_compose.png`](file:///c:/addp-crm/reports/qa_screenshots/04b_inbox_ai_compose.png) |
| **BUG-06** | ✅ **PASS** | [`portal/src/app/inbox/LiveZaloInbox.js`](file:///c:/addp-crm/portal/src/app/inbox/LiveZaloInbox.js), [`portal/src/lib/zaloRunner.js`](file:///c:/addp-crm/portal/src/lib/zaloRunner.js) | Hàm `extractChatPhoneNumbers(messages)` tự động bắt SĐT `0912345678` trong nội dung chat, hiển thị trên Header/Cột 3 và khớp nối với Hồ sơ Khách hàng 360 (`KH008`). | [`verify_06_inbox_phone_detect.png`](file:///c:/addp-crm/reports/qa_screenshots/verify_06_inbox_phone_detect.png) |
| **BUG-07** | ✅ **PASS** | [`portal/src/app/components/QuickOrderModal.js`](file:///c:/addp-crm/portal/src/app/components/QuickOrderModal.js) | Xóa bỏ fallback lấy `customer.id` làm SĐT; bổ sung ô input nhập/sửa Họ tên và SĐT khách hàng (tự động điền SĐT bắt được `0912345678`), kiểm tra `isValidVietnamPhone()` trước khi lưu. | [`verify_07_quick_order_modal.png`](file:///c:/addp-crm/reports/qa_screenshots/verify_07_quick_order_modal.png) |
| **BUG-08** | ✅ **PASS** | [`portal/src/lib/customerIdentityResolver.js`](file:///c:/addp-crm/portal/src/lib/customerIdentityResolver.js), [`portal/src/app/api/customers/route.js`](file:///c:/addp-crm/portal/src/app/api/customers/route.js), [`portal/src/app/api/customers/[id]/route.js`](file:///c:/addp-crm/portal/src/app/api/customers/[id]/route.js) | Xóa hoàn toàn hàm `Math.random()` sinh SĐT ảo; SĐT sai (`"12345"`) bị chặn với HTTP `400`, SĐT `"+84 912 345 678"` được chuẩn hóa thành `"0912345678"`. | Đã xác thực qua `/api/customers` |
| **BUG-09** | ✅ **PASS** | [`portal/src/lib/careAutomation.js`](file:///c:/addp-crm/portal/src/lib/careAutomation.js), [`portal/src/lib/ordersStore.js`](file:///c:/addp-crm/portal/src/lib/ordersStore.js), [`portal/src/app/api/care/tasks/route.js`](file:///c:/addp-crm/portal/src/app/api/care/tasks/route.js), [`portal/src/app/api/orders/route.js`](file:///c:/addp-crm/portal/src/app/api/orders/route.js), [`portal/src/app/orders/OrdersClient.js`](file:///c:/addp-crm/portal/src/app/orders/OrdersClient.js) | Khi tạo đơn mới (`DH-261107-6983`) hoặc bấm nút `Giao thành công` (`DELIVERED`), 7 mốc chăm sóc (Ngày 1, 3, 7, 14, 21, 1/2, 2/3) lập tức đồng bộ vào `/api/care/tasks` (`tasks_before: 42` → `tasks_after: 49`, `+7 tasks`). | Đã xác thực qua `/api/orders` & `/api/care/tasks` |
| **BUG-10** | ✅ **PASS** | [`portal/src/lib/magentoConnector.js`](file:///c:/addp-crm/portal/src/lib/magentoConnector.js), [`portal/src/lib/customerIdentityResolver.js`](file:///c:/addp-crm/portal/src/lib/customerIdentityResolver.js) | Webhook Magento (`/api/webhooks/magento`) bảo toàn chính xác `fullName: "Nguyễn Thị Kiểm Thử Magento"`, `phone: "0914044866"` và `pathology: "Tiểu đường tuýp 2"`. | Đã xác thực qua `/api/webhooks/magento` |
| **BUG-11** | ✅ **PASS** | [`portal/src/app/orders/OrdersClient.js`](file:///c:/addp-crm/portal/src/app/orders/OrdersClient.js), [`portal/src/app/components/QuickOrderModal.js`](file:///c:/addp-crm/portal/src/app/components/QuickOrderModal.js) | Nút `+ Tạo Đơn Hàng Mới` trên trang `/orders` mở `QuickOrderModal` với các ô input cho phép nhập tay Họ tên và SĐT khách hàng. | [`verify_11_orders_create_modal.png`](file:///c:/addp-crm/reports/qa_screenshots/verify_11_orders_create_modal.png) |
| **BUG-12** | ✅ **PASS** | [`portal/src/lib/financialEngine.js`](file:///c:/addp-crm/portal/src/lib/financialEngine.js) | Hàm `computeOrderFinancials` đã truyền `getCustomFormulasMap()` vào `resolveComboFormulaList(sku, qty, customFormulas)`, tính chính xác giá vốn `COGS = 365.000đ` cho mã `COMBO-QA-TEST` (`2*GLUCARE-LON-800 + 1*DOVITAL-SUI`). | Đã xác thực qua `/api/reports/financial` |

