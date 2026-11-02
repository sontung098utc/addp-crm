# TASKS.md — BẢNG NHIỆM VỤ CHI TIẾT DỰ ÁN ADDP OMNICHANNEL AI CRM (`crm.addp.vn`)

> **QUY CHUẨN TÍNH GIỜ CÔNG & NGÀY CÔNG:**
> - **1 Ngày công** = **8 giờ làm việc**
> - **1 Tuần làm việc** = **6 ngày (Thứ 2 $\rightarrow$ Thứ 7, nghỉ Chủ Nhật)** = **48 giờ / 1 Developer**
> - **Tổng công suất 2 Developer (+ AI hỗ trợ)** = **96 giờ công / tuần (12 ngày công / tuần)**
> - **Tổng khối lượng toàn dự án:** **50 đầu việc (`WBS-01` $\rightarrow$ `WBS-50`)** = **480 giờ công (60 ngày công)** $\rightarrow$ Hoàn thành trong **5 Tuần (30 ngày lịch làm việc)**.
> - **Google Sheets đồng bộ trực tuyến:** `https://docs.google.com/spreadsheets/d/1_LmLZHT4TDbyBW5fAxY-OAcv5X89hNobuFwUo2nfjMA/edit`

**Ký hiệu trạng thái cho AI đọc và cập nhật:**
- `[ ]` Chưa làm
- `[/]` Đang làm
- `[x]` Hoàn thành

---

## GIAI ĐOẠN 1 (TUẦN 1): HẠ TẦNG `crm.addp.vn`, DATABASE MYSQL HỢP NHẤT & PHÂN QUYỀN RBAC
*(Tổng: 96 giờ công = 12.0 ngày công | Dev 1: 48h (6 ngày) | Dev 2: 48h (6 ngày))*

| Trạng thái | Mã WBS | Lịch (Tuần - Thứ) | Phụ trách | Giờ công | Ngày công | Đầu việc chi tiết | Nguồn kế thừa / File tham chiếu |
| :---: | :---: | :---: | :---: | :---: | :---: | :--- | :--- |
| `[x]` | **WBS-01** | Tuần 1 - Thứ 2 | Dev 1 + AI | **8h** | **1.0 ngày** | Cấu hình Server công ty, trỏ domain `crm.addp.vn`, cài đặt Nginx Reverse Proxy + SSL HTTPS, Docker Compose (MySQL 8, Redis, FastAPI, Next.js) | `c:\addp-crm\docker-compose.yml` |
| `[x]` | **WBS-02** | Tuần 1 - Thứ 2 | Dev 2 + AI | **8h** | **1.0 ngày** | Khởi tạo GitHub Monorepo (`addp-crm`), thiết lập nhánh `main`/`develop`, cấu trúc thư mục `portal/`, `server/`, `connectors/` và cấu hình bộ khung Next.js | `C:\QuanlyKH` + `GITHUB_WORKFLOW.md` |
| `[ ]` | **WBS-03** | Tuần 1 - Thứ 3, 4 | Dev 1 + AI | **12h** | **1.5 ngày** | Thiết kế & Migrate Database MySQL hợp nhất (`addp_crm`) phần 1: Bảng `Staff`, `Role`, `Permission`, `ChannelAccount`, `Customer`, `CustomerTag`, `CarePlan`, `Interaction`, `Task` | `C:\QuanlyKH\prisma\schema.prisma` |
| `[ ]` | **WBS-04** | Tuần 1 - Thứ 4, 5 | Dev 1 + AI | **12h** | **1.5 ngày** | Thiết kế & Migrate Database MySQL hợp nhất (`addp_crm`) phần 2: Bảng `Order`, `OrderItem`, `Product`, `SkuMapping`, `ComboFormula`, `InventoryLog`, `Conversation`, `Message` | `C:\AH-Trabi\quan-ly-kho\index.php` + `C:\AdsTiktok` |
| `[ ]` | **WBS-05** | Tuần 1 - Thứ 3, 4 | Dev 2 + AI | **12h** | **1.5 ngày** | Xây dựng UI Layout tổng thể của `crm.addp.vn`: Sidebar điều hướng đa phân hệ, Header thông báo thời gian thực, Giao diện Đăng nhập & Đổi mật khẩu | `C:\QuanlyKH\src\app\components\Sidebar.js` |
| `[ ]` | **WBS-06** | Tuần 1 - Thứ 5 | Dev 1 + AI | **8h** | **1.0 ngày** | Xây dựng Backend Middleware Phân quyền đa cấp (RBAC): `ADMIN`, `SALE_LEADER`, `SALE`, `CSKH`, `KHO`, `KE_TOAN` và lọc dữ liệu theo `staffId` | `C:\AH-Trabi\quan-ly-kho\users_management_view.php` |
| `[ ]` | **WBS-07** | Tuần 1 - Thứ 4, 5 | Dev 2 + AI | **12h** | **1.5 ngày** | Xây dựng Giao diện Quản lý Nhân sự & Phân quyền: Tạo/sửa tài khoản nhân viên, gắn Role, cài đặt chỉ tiêu KPI (`kpi`, `dailyCareTarget`, `dailyMsgTarget`) | `C:\QuanlyKH\src\app\settings\StaffManager.js` |
| `[ ]` | **WBS-08** | Tuần 1 - Thứ 6 | Dev 2 + AI | **8h** | **1.0 ngày** | Xây dựng Giao diện Ma trận Phân quyền Kênh: Gán nhân viên Sale nào được phép xem/trả lời Fanpage nào, nick Zalo nào, gian hàng Shopee/TikTok nào | Mới + `C:\QuanlyKH\src\app\settings` |
| `[ ]` | **WBS-09** | Tuần 1 - Thứ 7 | Dev 1 + AI | **8h** | **1.0 ngày** | Xây dựng Cầu nối xác thực SSO/JWT giữa Next.js Portal (`portal/`) và Javis OS FastAPI (`server/`) để dùng chung phiên đăng nhập trên `crm.addp.vn` | `c:\addp-crm\server\main.py` |
| `[ ]` | **WBS-10** | Tuần 1 - Thứ 7 | Dev 2 + AI | **8h** | **1.0 ngày** | Kiểm thử tích hợp Giai đoạn 1 (Auth, RBAC, MySQL Schema), viết script Seed dữ liệu mẫu và nghiệm thu Tuần 1 | `C:\QuanlyKH\src\app\api\seed\route.js` |

---

## GIAI ĐOẠN 2 (TUẦN 2): CỔNG KẾT NỐI ĐA KÊNH & ĐĂNG NHẬP NHIỀU TÀI KHOẢN (MULTI-ACCOUNT HUB)
*(Tổng: 96 giờ công = 12.0 ngày công | Dev 1: 48h (6 ngày) | Dev 2: 48h (6 ngày))*

| Trạng thái | Mã WBS | Lịch (Tuần - Thứ) | Phụ trách | Giờ công | Ngày công | Đầu việc chi tiết | Nguồn kế thừa / File tham chiếu |
| :---: | :---: | :---: | :---: | :---: | :---: | :--- | :--- |
| `[ ]` | **WBS-11** | Tuần 2 - Thứ 2 | Dev 1 + AI | **8h** | **1.0 ngày** | Xây dựng API Quản lý Đa Tài Khoản (`ConnectionHub`): Lưu trữ mã hóa Token/Session của không giới hạn tài khoản thuộc 7 nền tảng, kiểm tra trạng thái sống/chết của kết nối | `c:\addp-crm\server\channels` |
| `[ ]` | **WBS-12** | Tuần 2 - Thứ 2, 3 | Dev 2 + AI | **12h** | **1.5 ngày** | Xây dựng Giao diện Trung tâm Kết nối Đa Kênh trên `crm.addp.vn`: Thẻ trạng thái từng tài khoản, nút Thêm tài khoản mới, nút Kiểm tra & Sửa lỗi tự động | `c:\addp-crm\dashboard` + `C:\AH-Trabi\quan-ly-kho\channels_view.php` |
| `[ ]` | **WBS-13** | Tuần 2 - Thứ 3, 4 | Dev 1 + AI | **12h** | **1.5 ngày** | Tích hợp Đăng nhập NHIỀU tài khoản **Zalo Cá Nhân** bằng mã QR trên Server (`javis-zalo` / `zca-js`): Mỗi nick 1 thư mục session riêng, tự giữ kết nối & kéo tin nhắn 2 tuần gần nhất | `c:\addp-crm\server\channels\zalo_personal.py` |
| `[ ]` | **WBS-14** | Tuần 2 - Thứ 4 | Dev 2 + AI | **8h** | **1.0 ngày** | Xây dựng Modal Quét mã QR Zalo Cá Nhân thời gian thực trên Web + Nâng cấp Chrome Extension `zalo-extension` trỏ về `https://crm.addp.vn` làm phương án dự phòng | `C:\QuanlyKH\zalo-extension` + `c:\addp-crm\server\zalo_login.py` |
| `[ ]` | **WBS-15** | Tuần 2 - Thứ 4, 5 | Dev 1 + AI | **8h** | **1.0 ngày** | Tích hợp kết nối NHIỀU tài khoản **Zalo Official Account (Zalo OA Open API v3 & ZNS)**: Xác thực domain `crm.addp.vn`, nhận Webhook `user_send_*` và tự động xoay vòng Refresh Token | `c:\addp-crm\server\channels\zalo_oa.py` |
| `[ ]` | **WBS-16** | Tuần 2 - Thứ 5, 6 | Dev 1 + AI | **10h** | **1.25 ngày** | Tích hợp kết nối NHIỀU **Fanpage Facebook (Messenger & Comment)**: Tự động đổi Long-lived Page Token, đăng ký Webhook nhận tin nhắn + bình luận bài viết/Livestream, tự ẩn comment chứa SĐT | `c:\addp-crm\server\channels\messenger.py` |
| `[ ]` | **WBS-17** | Tuần 2 - Thứ 4, 5 | Dev 2 + AI | **10h** | **1.25 ngày** | Xây dựng Giao diện cài đặt Fanpage FB & Zalo OA: Hướng dẫn lấy Token trực quan, cấu hình tự động ẩn comment có SĐT và tự động nhắn tin riêng khi khách bình luận | `c:\addp-crm\docs\31-messenger.md` + `35-zalo-oa.md` |
| `[ ]` | **WBS-18** | Tuần 2 - Thứ 6, 7 | Dev 1 + AI | **10h** | **1.25 ngày** | Nâng cấp OAuth2 & Webhook Đa Gian Hàng (Multi-Shop) cho **TikTok Shop Open API** và **Shopee Open API v2**, tự động làm mới token định kỳ bằng Cronjob | `C:\AH-Trabi\quan-ly-kho\tiktok_functions.php` + `shopee_functions.php` |
| `[ ]` | **WBS-19** | Tuần 2 - Thứ 6 | Dev 2 + AI | **10h** | **1.25 ngày** | Xây dựng Giao diện quản lý đa gian hàng TikTok Shop & Shopee + Tích hợp UserScript/Extension tự động đồng bộ SĐT & Địa chỉ thật của khách hàng về CRM | `C:\AH-Trabi\quan-ly-kho\khach_hang_view.php` + `C:\AdsTiktok\public\extension` |
| `[ ]` | **WBS-20** | Tuần 2 - Thứ 7 | Dev 2 + AI | **8h** | **1.0 ngày** | Cấu hình cổng kết nối **KiotViet** (Webhook + API) và **Website Magento 2.4.8** (API Token + Webhook); Kiểm thử kết nối đồng thời cả 7 nền tảng | `C:\QuanlyKH\src\app\api\kiotviet\route.js` + `C:\ADDP` |

---

## GIAI ĐOẠN 3 (TUẦN 3): HỘP THƯ HỢP NHẤT 3 CỘT (OMNICHANNEL INBOX) & KHÁCH HÀNG 360 (RA MẮT MVP)
*(Tổng: 96 giờ công = 12.0 ngày công | Dev 1: 48h (6 ngày) | Dev 2: 48h (6 ngày))*

| Trạng thái | Mã WBS | Lịch (Tuần - Thứ) | Phụ trách | Giờ công | Ngày công | Đầu việc chi tiết | Nguồn kế thừa / File tham chiếu |
| :---: | :---: | :---: | :---: | :---: | :---: | :--- | :--- |
| `[ ]` | **WBS-21** | Tuần 3 - Thứ 2, 3 | Dev 1 + AI | **12h** | **1.5 ngày** | Xây dựng Unified Message Router & WebSocket/SSE: Gom mọi tin nhắn từ Zalo cá nhân, Zalo OA, Fanpage FB, Web LiveChat về 1 chuẩn dữ liệu duy nhất và đẩy realtime lên trình duyệt | `c:\addp-crm\server\main.py` |
| `[ ]` | **WBS-22** | Tuần 3 - Thứ 2, 3 | Dev 2 + AI | **16h** | **2.0 ngày** | Xây dựng Giao diện Hộp thư Hợp nhất 3 cột (Omnichannel Inbox): Cột 1 Danh sách hội thoại kèm logo kênh/nick, Cột 2 Khung chat đa phương tiện (ảnh, file, ghi âm), Cột 3 Hồ sơ KH & Đơn hàng | `c:\addp-crm\docs\28-hoi-thoai-khach.md` |
| `[ ]` | **WBS-23** | Tuần 3 - Thứ 4 | Dev 2 + AI | **8h** | **1.0 ngày** | Xây dựng Bộ lọc Hội thoại thông minh: Lọc theo Kênh, Tài khoản đích, Thẻ Tag, Trạng thái (`Cần bạn`, `A.I. đang xử lý`, `Bạn đang xử lý`, `Chưa đọc`), tìm kiếm nhanh theo SĐT/Nội dung | `c:\addp-crm` (Bộ lọc 2 tầng) |
| `[ ]` | **WBS-24** | Tuần 3 - Thứ 3, 4 | Dev 1 + AI | **8h** | **1.0 ngày** | Xây dựng Thuật toán Chia khách tự động (Auto-Lead Routing): Chia xoay vòng (Round-Robin) cho Sale đang trực hoặc ưu tiên gán về đúng Sale đang chăm sóc khách cũ đó | Tham khảo `chatwoot` routing |
| `[ ]` | **WBS-25** | Tuần 3 - Thứ 4, 5 | Dev 1 + AI | **10h** | **1.25 ngày** | Xây dựng Engine Gộp Khách Hàng 360 (`CustomerIdentityResolver`): Tự động bắt SĐT trong tin nhắn chat và đơn hàng để hợp nhất khách từ 7 kênh về 1 hồ sơ duy nhất | `C:\AH-Trabi\quan-ly-kho\khach_hang_view.php` + `QuanlyKH` |
| `[ ]` | **WBS-26** | Tuần 3 - Thứ 5 | Dev 2 + AI | **8h** | **1.0 ngày** | Xây dựng Hệ thống Phân loại Khách hàng: Quản lý Thẻ khách hàng (Tag màu tùy chỉnh), Nguồn khách hàng, Nhân viên chăm sóc và tự động xếp hạng VIP (`>=1, >=2, >=3, >=5 đơn`) | `C:\AH-Trabi\quan-ly-kho` + `c:\addp-crm` |
| `[ ]` | **WBS-27** | Tuần 3 - Thứ 6 | Dev 2 + AI | **8h** | **1.0 ngày** | Xây dựng Giao diện Hồ sơ Sức khỏe & Bệnh lý chuyên sâu: Lưu bệnh lý (`pathology`), chỉ số đường huyết ban đầu (`initialGlucose`), phản hồi hàng tuần (`weeklyFeedback`), đánh giá Tốt/Xấu | `C:\QuanlyKH\src\app\customers\[id]\page.js` |
| `[ ]` | **WBS-28** | Tuần 3 - Thứ 5, 6 | Dev 1 + AI | **10h** | **1.25 ngày** | Tích hợp Engine Tự động sinh Lịch chăm sóc sau bán (`generateCareTasks`): Tự tạo công việc nhắc Sale vào Ngày 1, 3, 7, 14, 21, Dùng 1/2 và 2/3 liệu trình ngay khi đơn hàng Giao thành công | `C:\QuanlyKH\src\lib\automation.js` |
| `[ ]` | **WBS-29** | Tuần 3 - Thứ 7 | Dev 2 + AI | **8h** | **1.0 ngày** | Xây dựng Bảng Theo dõi Công việc Chăm sóc Hàng ngày (`WorkTracking`): Danh sách khách đến hạn cần gọi/nhắn tin trong ngày cho từng Sale, tích hoàn thành và ghi nhận kết quả tương tác | `C:\QuanlyKH\src\app\work-tracking\WorkTrackingClient.js` |
| `[ ]` | **WBS-30** | Tuần 3 - Thứ 7 | Dev 1 + AI | **8h** | **1.0 ngày** | Đóng gói & Bàn giao bản **MVP (Giai đoạn 1–3)** lên `https://crm.addp.vn` để đội Sale bắt đầu đăng nhập đa kênh và quản lý khách hàng thực tế | `crm.addp.vn` |

---

## GIAI ĐOẠN 4 (TUẦN 4): AI CHĂM SÓC TỰ ĐỘNG, GỬI TIN HÀNG LOẠT & ĐỒNG BỘ ĐƠN HÀNG / MAGENTO 2.4.8
*(Tổng: 96 giờ công = 12.0 ngày công | Dev 1: 48h (6 ngày) | Dev 2: 48h (6 ngày))*

| Trạng thái | Mã WBS | Lịch (Tuần - Thứ) | Phụ trách | Giờ công | Ngày công | Đầu việc chi tiết | Nguồn kế thừa / File tham chiếu |
| :---: | :---: | :---: | :---: | :---: | :---: | :--- | :--- |
| `[ ]` | **WBS-31** | Tuần 4 - Thứ 2 | Dev 1 + AI | **8h** | **1.0 ngày** | Thiết lập Kho Tri Thức AI (Second Brain Wiki) riêng cho CSKH: Nhập tài liệu sản phẩm, giá bán, combo, hướng dẫn sử dụng theo bệnh lý và kịch bản xử lý từ chối | `c:\addp-crm\docs\13-second-brain-bo-nho-wiki.md` |
| `[ ]` | **WBS-32** | Tuần 4 - Thứ 2, 3 | Dev 1 + AI | **10h** | **1.25 ngày** | Tích hợp 3 chế độ AI trực hội thoại (`A.I. trả lời 24/7`, `A.I. soạn nháp chờ duyệt`, `Sale tiếp quản - Takeover`) + Bộ phán xử (Judge) tự chuyển người thật khi gặp câu hỏi khó | `c:\addp-crm\docs\25-chatbot.md` + `28-hoi-thoai-khach.md` |
| `[ ]` | **WBS-33** | Tuần 4 - Thứ 2 | Dev 2 + AI | **8h** | **1.0 ngày** | Tích hợp Thanh điều khiển AI & Nút `✨ A.I. soạn` ngay trong khung nhập chat của Sale (Sale gõ ý chính $\rightarrow$ AI viết thành câu tư vấn lịch sự hoàn chỉnh) | `c:\addp-crm\dashboard` |
| `[ ]` | **WBS-34** | Tuần 4 - Thứ 3 | Dev 1 + AI | **6h** | **0.75 ngày** | Xây dựng AI Auto-Tagging & Tóm tắt hội thoại: AI tự đọc tin nhắn khách để trích xuất SĐT, địa chỉ, bệnh lý, tự gắn Thẻ Tag màu và ghi chú tóm tắt cho Sale | `c:\addp-crm\docs\superpowers\specs\2026-09-30-bot-zalo-tu-tag-design.md` |
| `[ ]` | **WBS-35** | Tuần 4 - Thứ 4, 5 | Dev 1 + AI | **12h** | **1.5 ngày** | Xây dựng Backend Chiến dịch Gửi tin nhắn hàng loạt (`SmartBroadcastQueue`): Lọc khách theo Tag/Nguồn/Đơn hàng/Lịch chăm sóc, giãn cách 45–120s/tin, AI biến thiên câu chữ chống khóa Zalo | Redis Queue + `c:\addp-crm` |
| `[ ]` | **WBS-36** | Tuần 4 - Thứ 3, 4 | Dev 2 + AI | **12h** | **1.5 ngày** | Xây dựng Giao diện Quản lý Chiến dịch Gửi tin hàng loạt (Broadcast UI): Chọn tệp khách hàng, soạn mẫu tin cá nhân hóa, hẹn giờ gửi, theo dõi tiến độ đã gửi/thất bại/phản hồi | Mới + Bộ lọc `C:\QuanlyKH` |
| `[ ]` | **WBS-37** | Tuần 4 - Thứ 5, 6 | Dev 1 + AI | **12h** | **1.5 ngày** | Xây dựng Connector **Website Magento 2.4.8**: Đồng bộ realtime Đơn hàng, Khách hàng, Giỏ hàng bỏ quên + Nối Webhook từ module `Addp_CustomForm` và `ADDP Minigame` về thẳng CRM | `C:\ADDP\CustomForm` + `C:\ADDP Minigame` |
| `[ ]` | **WBS-38** | Tuần 4 - Thứ 5 | Dev 2 + AI | **8h** | **1.0 ngày** | Xây dựng & Nhúng Widget LiveChat AI lên Website Magento 2.4.8 (`ADDP.vn`), đổ toàn bộ hội thoại khách trên web về Hộp thư hợp nhất `crm.addp.vn` | Widget JS + `c:\addp-crm` |
| `[ ]` | **WBS-39** | Tuần 4 - Thứ 6 | Dev 2 + AI | **10h** | **1.25 ngày** | Xây dựng tính năng **Lên đơn hàng nhanh ngay trong khung Chat** (Cột phải Inbox) và đẩy đơn trực tiếp sang **KiotViet** / **Magento 2.4.8** | `C:\QuanlyKH\src\app\customers\[id]\AddOrderForm.js` + KiotViet API |
| `[ ]` | **WBS-40** | Tuần 4 - Thứ 7 | Dev 2 + AI | **10h** | **1.25 ngày** | Xây dựng Giao diện Quản lý Đơn hàng Đa nền tảng tập trung: Xem, lọc, tìm kiếm toàn bộ đơn từ Magento, KiotViet, TikTok Shop, Shopee, FB, Zalo trên 1 bảng duy nhất | `C:\QuanlyKH\src\app\orders\page.js` + `quan-ly-kho` |

---

## GIAI ĐOẠN 5 (TUẦN 5): KHO COMBO, BÁO CÁO ĐA CHIỀU (DOANH SỐ, LÃI/LỖ, ADS, KPI) & GO-LIVE
*(Tổng: 96 giờ công = 12.0 ngày công | Dev 1: 48h (6 ngày) | Dev 2: 48h (6 ngày))*

| Trạng thái | Mã WBS | Lịch (Tuần - Thứ) | Phụ trách | Giờ công | Ngày công | Đầu việc chi tiết | Nguồn kế thừa / File tham chiếu |
| :---: | :---: | :---: | :---: | :---: | :---: | :--- | :--- |
| `[ ]` | **WBS-41** | Tuần 5 - Thứ 2, 3 | Dev 1 + AI | **12h** | **1.5 ngày** | Tích hợp Bộ giải mã công thức Combo (`resolve_all_formulas`) & Ánh xạ SKU đa sàn từ `quan-ly-kho`: Tự động quy đổi mã gộp/combo ra sản phẩm lẻ để trừ tồn kho chính xác | `C:\AH-Trabi\quan-ly-kho\index.php` + `channels_view.php` |
| `[ ]` | **WBS-42** | Tuần 5 - Thứ 2 | Dev 2 + AI | **8h** | **1.0 ngày** | Xây dựng Giao diện Quản lý Tồn kho, Hàng đóng sẵn & Cảnh báo mã SKU chưa liên kết giữa TikTok/Shopee/KiotViet/Magento | `C:\AH-Trabi\quan-ly-kho\dong_san_view.php` + `channels_view.php` |
| `[ ]` | **WBS-43** | Tuần 5 - Thứ 3, 4 | Dev 1 + AI | **12h** | **1.5 ngày** | Tích hợp Engine Tài chính & Lãi/Lỗ thực (`commerce_finance_service`, `commerce_loss_engine`, `commerce_product_cost_service`): Khấu trừ phí sàn, Affiliate, giá vốn (COGS), hoàn/hủy | `C:\AdsTiktok\public\api\commerce_finance_service.php` + `commerce_loss_engine.php` |
| `[ ]` | **WBS-44** | Tuần 5 - Thứ 3, 4 | Dev 2 + AI | **12h** | **1.5 ngày** | Xây dựng Dashboard Báo cáo Doanh số, Đơn hàng & Lợi nhuận ròng theo từng Nền tảng (7 kênh), theo Gian hàng và theo Ngày/Tuần/Tháng/Năm | `C:\AdsTiktok\src\CommerceDashboardView.jsx` + `CommerceReportView.jsx` |
| `[ ]` | **WBS-45** | Tuần 5 - Thứ 5 | Dev 1 + AI | **8h** | **1.0 ngày** | Tích hợp API Báo cáo Hiệu quả Quảng cáo TikTok Ads (GMV Max Playbook, Khung giờ vàng Golden Hours, Live Analytics) và Thống kê Thuế | `C:\AdsTiktok\public\api\commerce_ads_service.php` + `thong_ke_thue_view.php` |
| `[ ]` | **WBS-46** | Tuần 5 - Thứ 5 | Dev 2 + AI | **8h** | **1.0 ngày** | Xây dựng Giao diện Báo cáo Ads GMV Max, Khung giờ vàng & Xuất bảng kê Thống kê Thuế chuẩn ra file Excel | `C:\AdsTiktok\src\CommerceGoldenHoursView.jsx` + `quan-ly-kho` |
| `[ ]` | **WBS-47** | Tuần 5 - Thứ 6 | Dev 2 + AI | **10h** | **1.25 ngày** | Xây dựng Báo cáo Chỉ số & Bảng xếp hạng KPI Nhân viên Sale: Doanh thu theo Sale, tỷ lệ chốt đơn, số khách đã chăm sóc, số tin nhắn gửi, tốc độ phản hồi khách trung bình | `C:\QuanlyKH\src\app\reports\ReportsClient.js` + `c:\addp-crm` |
| `[ ]` | **WBS-48** | Tuần 5 - Thứ 6 | Dev 1 + AI | **8h** | **1.0 ngày** | Xây dựng Báo cáo Phân tích Khách hàng: Tỷ lệ mua lại (Retention lần 2, 3, VIP), doanh thu theo Nguồn khách hàng, thống kê theo nhóm Bệnh lý | `C:\AH-Trabi\quan-ly-kho\khach_hang_view.php` + `QuanlyKH` |
| `[ ]` | **WBS-49** | Tuần 5 - Thứ 7 | Dev 1 + AI | **8h** | **1.0 ngày** | Viết và chạy Script Di chuyển toàn bộ dữ liệu lịch sử (Data Migration) từ DB `QuanlyKH`, `addp_khohang` (`quan-ly-kho`), `AdsTiktok` sang Database hợp nhất trên `crm.addp.vn` | `C:\AH-Trabi\quan-ly-kho\migrate_to_mysql.php` + `QuanlyKH` |
| `[ ]` | **WBS-50** | Tuần 5 - Thứ 7 | Dev 2 + AI | **10h** | **1.25 ngày** | Kiểm thử toàn diện (UAT), tối ưu hiệu năng, thiết lập sao lưu Database tự động hàng ngày và bàn giao vận hành chính thức trên `https://crm.addp.vn` | `c:\addp-crm\docs\18-sao-luu-github.md` |
