# AGENTS.md — ĐIỀU LUẬT & QUY CHUẨN THỰC THI CHO AI VÀ DEVELOPER (DỰ ÁN CRM.ADDP.VN)

> **TÀI LIỆU BẮT BUỘC ĐỌC ĐẦU TIÊN:** Mọi AI Agent (Antigravity, Claude Code, Codex, Javis) và Developer (Dev 1, Dev 2) trước khi viết bất kỳ dòng code nào trong dự án này **BẮT BUỘC** phải đọc kỹ file `AGENTS.md` này và kiểm tra trạng thái công việc trong file `TASKS.md`.

---

## 1. THÔNG TIN CỐT LÕI CỦA DỰ ÁN

- **Tên hệ thống:** ADDP Omnichannel AI CRM & ERP
- **Tên miền triển khai:** `https://crm.addp.vn` (Đặt trên Server nội bộ của Công ty)
- **Kiến trúc kỹ thuật (Phương án A - Hybrid Micro-Modular):**
  1. **Omnichannel & AI Gateway (`server/` - Python FastAPI từ Javis OS):** Xử lý kết nối thời gian thực đa tài khoản Zalo cá nhân (`zca-js`/QR), Zalo OA, Facebook Messenger, Telegram, Kho tri thức AI (Second Brain), Bộ phán xử AI (Judge) và Hàng đợi gửi tin hàng loạt (Smart Broadcast Queue).
  2. **CRM Portal & Quản trị Khách hàng (`portal/` - Next.js / React + Prisma kế thừa từ `C:\QuanlyKH` & `C:\AdsTiktok`):** Giao diện quản trị phân quyền RBAC, Hộp thư hợp nhất, Hồ sơ khách hàng 360 (Thẻ Tag, Nguồn, Bệnh lý, Chỉ số đường huyết), Lộ trình chăm sóc tự động (Ngày 1, 3, 7, 14, 21, Dùng 1/2, 2/3) và Báo cáo BI.
  3. **Commerce & Inventory Connectors (`connectors/` - PHP/Python Services kế thừa từ `C:\AH-Trabi\quan-ly-kho`, `C:\AdsTiktok`, `C:\ADDP`):** Đồng bộ đơn hàng, ánh xạ SKU, tách công thức Combo (`resolve_all_formulas`), tính lãi/lỗ đơn hàng và kết nối Website **Magento 2.4.8**, **TikTok Shop**, **Shopee**, **KiotViet**.
  4. **Cơ sở dữ liệu Trung tâm:** **MySQL 8.0 (`addp_crm`)** + **Redis** (Quản lý Queue gửi tin nhắn hàng loạt, Rate-limit chống khóa tài khoản & Cache).

---

## 2. 10 ĐIỀU LUẬT BẮT BUỘC CHO AI AGENT (AI EXECUTION RULES)

### Điều 1: Quy trình Nhận việc & Khóa nhiệm vụ (Task Locking)
1. Trước khi bắt đầu code, AI phải đọc file `TASKS.md` để xác định mã công việc (`WBS-01` $\rightarrow$ `WBS-50`) đang được giao cho nhân sự hiện tại (**Dev 1** hoặc **Dev 2**).
2. Không bao giờ tự ý làm sang đầu việc của Dev khác đang ở trạng thái `[/] Đang làm` để tránh xung đột code (Merge Conflict).
3. Khi bắt đầu một mã `WBS-XX`, phải đổi trạng thái trong `TASKS.md` sang `[/] Đang làm` và tạo nhánh Git đúng quy chuẩn: `feat/dev1-wbs-xx-ten-ngan` hoặc `feat/dev2-wbs-xx-ten-ngan`.

### Điều 2: Tận dụng tối đa Code từ 5 Dự án Cũ (Không viết lại từ đầu)
Trước khi viết tính năng mới, AI **bắt buộc** phải kiểm tra và kế thừa logic đã chạy ổn định từ các thư mục dự án gốc:
- Nghiệp vụ Khách hàng, Bệnh lý, Lịch chăm sóc Ngày 1-3-7-14-21, KiotViet Webhook $\rightarrow$ Lấy từ `C:\QuanlyKH`.
- Đồng bộ Shopee, TikTok Shop, tách mã Combo (`resolve_all_formulas`), gộp KH, báo cáo Thuế, phân quyền $\rightarrow$ Lấy từ `C:\AH-Trabi\quan-ly-kho`.
- Đối soát Tài chính, Giá vốn, Lãi/Lỗ đơn hàng (`commerce_loss_engine.php`), Ads TikTok GMV Max $\rightarrow$ Lấy từ `C:\AdsTiktok`.
- Form thu thập Lead trên Website Magento 2.4.8 $\rightarrow$ Lấy từ `C:\ADDP\CustomForm` & `C:\ADDP Minigame`.
- Đa tài khoản Zalo QR, Zalo OA, Fanpage Messenger, AI Chatbot 3 chế độ $\rightarrow$ Lấy trực tiếp từ `c:\addp-crm\server`.

### Điều 3: Chuẩn hóa Số Điện Thoại (Khóa Định Danh Khách Hàng 360)
- Mọi số điện thoại từ Magento 2.4.8, KiotViet, TikTok Shop, Shopee, Fanpage, Zalo khi lưu vào DB hoặc tìm kiếm **BẮT BUỘC** phải qua hàm chuẩn hóa `normalizePhone()` về định dạng chuẩn Việt Nam 10 chữ số bắt đầu bằng số `0` (ví dụ: `+84912345678` hoặc `84912345678` $\rightarrow$ `0912345678`).
- Luôn kiểm tra tồn tại theo SĐT trước khi tạo mới khách hàng để gộp lịch sử đơn hàng và hội thoại của 7 kênh về **1 hồ sơ khách hàng duy nhất**.

### Điều 4: Luật Bảo vệ Tài khoản Zalo Cá nhân & Đa kênh (Anti-Ban Rule)
- **TUYỆT ĐỐI KHÔNG** dùng vòng lặp `for` bắn tin nhắn Zalo cá nhân liên tiếp không có độ trễ.
- Mọi tính năng gửi tin nhắn hàng loạt (Broadcast) hoặc nhắc lịch chăm sóc tự động qua Zalo cá nhân **bắt buộc** phải đẩy qua `SmartBroadcastQueue`:
  - Giãn cách ngẫu nhiên **45 – 120 giây** giữa 2 tin nhắn trên cùng 1 tài khoản Zalo.
  - Kiểm tra hạn mức `dailyMsgTarget` (mặc định tối đa 70 tin chủ động/ngày/nick).
  - Cá nhân hóa nội dung bằng biến `{fullName}`, `{productName}` hoặc dùng AI viết lại câu chào để không trùng lặp văn bản 100%.

### Điều 5: Luật Phân quyền & Bảo mật Dữ liệu (RBAC Security)
- Mọi API trả về danh sách Khách hàng, Hội thoại, Đơn hàng đều phải kiểm tra `role` và `staffId` của người đăng nhập:
  - `ADMIN`: Xem và thao tác toàn bộ hệ thống, xem được báo cáo lãi/lỗ và chi phí giá vốn.
  - `SALE_LEADER`: Xem dữ liệu của nhóm mình quản lý.
  - `SALE` / `CSKH`: Chỉ xem và nhận tin nhắn từ các Kênh/Tài khoản được phân quyền và các Khách hàng do mình phụ trách (`staffId == currentUser.id`). Không được phép xuất toàn bộ danh sách khách hàng của công ty nếu không được cấp quyền.
  - `KHO` / `KE_TOAN`: Chỉ truy cập module Đơn hàng, Tồn kho, Combo, Đối soát và Thống kê Thuế.
- Tuyệt đối không commit file `.env`, Token Fanpage, Refresh Token Zalo OA, Session Zalo QR hoặc mật khẩu DB lên GitHub.

### Điều 6: Luật Tương thích Website Magento 2.4.8
- Mọi kết nối tới Website Magento 2.4.8 phải thực hiện bất đồng bộ (Webhook / Queue / REST API), không được làm chậm thời gian phản hồi (TTFB) của trang đặt hàng hoặc trang điền form trên website chính.

### Điều 7: Quy tắc Phân tách Vùng Code cho 2 Developer & Nhiều AI
Để 2 nhân viên và nhiều AI chạy song song không ghi đè file của nhau:
- **Vùng của Dev 1 (+ AI của Dev 1):** `server/` (Python FastAPI, Channels, AI, Queue), `connectors/` (Shopee, TikTok, Magento, KiotViet), `database/migrations/`.
- **Vùng của Dev 2 (+ AI của Dev 2):** `portal/` (Next.js Frontend, Inbox UI, CRM Views, Reports UI), `extensions/` (Zalo & Vpage Chrome Extensions).
- Nếu cần sửa file dùng chung (`schema.prisma`, `TASKS.md`, `docker-compose.yml`), phải pull nhánh `develop` mới nhất trước khi sửa và commit ngay.

### Điều 8: Kiểm thử bắt buộc trước khi đánh dấu Hoàn thành (Definition of Done)
Một đầu việc `WBS-XX` chỉ được chuyển sang trạng thái `[x] Hoàn thành` khi:
1. Code chạy không lỗi cú pháp, vượt qua bài test hoặc kiểm tra thực tế trên trình duyệt/API.
2. Đã xử lý ngoại lệ (try/catch, thông báo lỗi tiếng Việt rõ ràng cho người dùng cuối, ghi log lỗi vào `server/logs/`).
3. Đã cập nhật trạng thái trong `TASKS.md` và ghi vào báo cáo ngày.

### Điều 9: Ngôn ngữ Giao diện & Comment Code
- Toàn bộ giao diện người dùng (UI), thông báo lỗi, tên trường hiển thị và báo cáo phải bằng **Tiếng Việt chuẩn, rõ ràng, dễ hiểu cho nhân viên Sale & Kho**.
- Giữ nguyên các comment giải thích nghiệp vụ có sẵn trong code; bổ sung docstring ngắn gọn cho các hàm mới.

### Điều 10: Báo cáo Tiến độ Hàng ngày Tự động (Daily Reporting Rule)
- Cuối mỗi ngày làm việc (17:30, từ Thứ 2 đến Thứ 7), Developer yêu cầu AI chạy quy trình tổng hợp báo cáo ngày theo mẫu tại `reports/DAILY_REPORT_TEMPLATE.md`:
  1. Tạo file báo cáo ngày tại `reports/daily/YYYY-MM-DD.md`.
  2. Cập nhật trạng thái và số giờ thực tế vào file `TASKS.md` và bảng **Google Sheets** theo dõi dự án.
  3. Commit và push lên GitHub để Quản lý kiểm tra.
