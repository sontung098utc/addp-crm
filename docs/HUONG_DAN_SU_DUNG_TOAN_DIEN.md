# TÀI LIỆU HƯỚNG DẪN SỬ DỤNG & VẬN HÀNH HỆ THỐNG ADDP OMNICHANNEL AI CRM & ERP

> **TÀI LIỆU CHÍNH THỨC CỦA DỰ ÁN ADDP CRM**  
> **Áp dụng cho:** Toàn thể Cán bộ - Nhân viên Công ty Cổ phần Dược Phẩm ADDP  
> **Địa chỉ truy cập hệ thống:** `https://crm.addp.vn` (Mạng nội bộ hoặc VPN công ty)  
> **Phiên bản hệ thống:** 1.0.0-PROD (Chính thức Go-Live)

---

## MỤC LỤC TÀI LIỆU

1. [Tổng quan hệ thống & Kiến trúc hợp nhất 7 kênh](#1-tổng-quan-hệ-thống)
2. [Hướng dẫn Đăng nhập & Bảng phân quyền 6 cấp (RBAC)](#2-hướng-dẫn-đăng-nhập--phân-quyền)
3. [Hướng dẫn Kết nối & Cấu hình 7 Kênh Bán Hàng](#3-hướng-dẫn-kết-nối--cấu-hình-7-kênh)
4. [Hướng dẫn Sử dụng Hộp Thư Hợp Nhất 3 Cột & Trợ Lý AI](#4-hướng-dẫn-hộp-thư-hợp-nhất--ai-trợ-lý)
5. [Hướng dẫn Lộ trình Chăm sóc Khách hàng 7 Mốc (WorkTracking)](#5-hướng-dẫn-lịch-chăm-sóc-7-mốc)
6. [Hướng dẫn Chiến dịch Gửi tin Hàng loạt (Smart Broadcast) & Anti-Ban](#6-hướng-dẫn-gửi-tin-hàng-loạt)
7. [Hướng dẫn Kho Combo, Tồn kho, Đối soát Tài chính & Thuế VAT](#7-hướng-dẫn-kho-tài-chính--thuế)

---

## 1. TỔNG QUAN HỆ THỐNG

Hệ thống **ADDP Omnichannel AI CRM & ERP** được thiết kế để giải quyết bài toán phân mảnh dữ liệu khách hàng, tin nhắn và đơn hàng từ 7 nền tảng:
- **Zalo Cá Nhân:** Kết nối nhiều tài khoản nhân viên qua quét mã QR an toàn.
- **Zalo Official Account (OA):** Open API v3 & Tin nhắn thông báo ZNS.
- **Fanpage Facebook:** Webhook Meta, tự động ẩn số điện thoại bình luận chống cướp khách.
- **TikTok Shop:** Đồng bộ đơn hàng đa gian hàng, phân tích chi phí Ads GMV Max.
- **Shopee:** Quản lý đơn hàng đa shop, tự động đồng bộ trạng thái giao vận.
- **Website Magento 2.4.8 (ADDP.vn):** Tiếp nhận đơn hàng, giỏ hàng bỏ quên và form lead `Addp_CustomForm`.
- **KiotViet POS:** Đồng bộ đơn hàng tại quầy thuốc và tồn kho vật lý.

---

## 2. HƯỚNG DẪN ĐĂNG NHẬP & PHÂN QUYỀN

### 2.1. Địa chỉ đăng nhập
- Truy cập trình duyệt Chrome: `https://crm.addp.vn/login` (hoặc `http://localhost:3005/login`).

### 2.2. Danh sách tài khoản mẫu theo vai trò (RBAC)

| Họ và Tên | Username | Mật khẩu mặc định | Vai trò (Role) | Chức năng & Dữ liệu được phép xem |
| :--- | :---: | :---: | :---: | :--- |
| **Quản trị viên tối cao** | `admin` | `admin123` | `ADMIN` | Xem toàn bộ hệ thống, báo cáo lãi/lỗ, phân quyền tài khoản |
| **Nguyễn Văn Quyết** | `sale_lead` | `lead123` | `SALE_LEADER` | Xem khách hàng và đơn của toàn nhóm Sale, chia lead tự động |
| **Trần Thu Hà** | `sale_ha` | `sale123` | `SALE` | Trực chat Zalo/FB được phân công, chỉ xem khách của mình |
| **Lê Thị Mai** | `cskh_mai` | `cskh123` | `CSKH` | Xử lý bảng nhắc việc CSKH Ngày 1-3-7-14-21, ghi nhận đường huyết |
| **Phạm Văn Trường** | `kho_truong` | `kho123` | `KHO` | Quản lý đóng sẵn, xuất nhập tồn, tách công thức combo |
| **Hoàng Thị Lan** | `ketoan_lan` | `ketoan123` | `KE_TOAN` | Đối soát doanh thu, giá vốn COGS, phí sàn và xuất báo cáo Thuế |

> [!NOTE]
> Mọi nhân viên sau khi đăng nhập lần đầu tiên phải vào mục **Cài đặt tài khoản** để đổi mật khẩu cá nhân.

---

## 3. HƯỚNG DẪN KẾT NỐI & CẤU HÌNH 7 KÊNH

Truy cập menu **Kết nối 7 Kênh (`/channels`)**:

### 3.1. Kết nối Zalo Cá Nhân qua QR Code
1. Nhấn nút **+ Thêm Tài Khoản Zalo Mới**.
2. Mở app Zalo trên điện thoại của nhân viên $\rightarrow$ Bấm quét mã QR.
3. Bấm **Đăng nhập trên máy tính** trên điện thoại.
4. Hệ thống lưu trữ Session an toàn và đồng bộ toàn bộ danh bạ.

### 3.2. Cấu hình Webhook Facebook Developers
1. Truy cập `developers.facebook.com` $\rightarrow$ Ứng dụng ADDP CRM.
2. Mục **Webhooks** $\rightarrow$ Chọn đối tượng **Page**:
   - **URL gọi lại (Callback URL):** `https://crm.addp.vn/api/channels/facebook/webhook`
   - **Mã xác minh (Verify Token):** `ADDP_FB_VERIFY_TOKEN_2026`
3. Đăng ký các trường sự kiện: `messages`, `messaging_postbacks`, `feed`.

### 3.3. Kết nối TikTok Shop & Shopee
1. Nhấn **+ Kết Nối Shop Mới**.
2. Nhập `App Key`, `App Secret`, `Shop ID` được cấp từ Partner Portal.
3. Bấm **Ủy quyền OAuth2** để hệ thống tự động kéo đơn hàng về CRM.

### 3.4. Cấu hình Magento 2.4.8 (ADDP.vn)
- Webhook gửi dữ liệu đơn hàng và form lead về:
  `POST https://crm.addp.vn/api/webhooks/magento`

---

## 4. HƯỚNG DẪN HỘP THƯ HỢP NHẤT & AI TRỢ LÝ

Truy cập menu **Hộp thư Đa kênh (`/inbox`)**:

### 4.1. Cột 1 — Danh sách hội thoại
- **Tìm kiếm:** Gõ tên, SĐT hoặc mã khách hàng.
- **Bộ lọc 2 tầng:**
  - Lọc theo Kênh: Zalo Cá Nhân, Zalo OA, Facebook.
  - Lọc theo Trạng thái: *Chưa đọc*, *Cần người hỗ trợ*, *AI đang trực*.

### 4.2. Cột 2 — Khung Chat & 3 Chế độ AI
- **Chế độ trực kênh (Góc trên bên phải):**
  - 👤 **Nhân viên trực:** Sale tự soạn tin nhắn gửi cho khách.
  - 📝 **A.I. Soạn nháp:** AI tự động gợi ý câu trả lời vào ô chat để Sale duyệt trước khi gửi.
  - 🤖 **A.I. Tự động 24/7:** AI tự động trả lời khách sau 3 giây.
- **Cách sử dụng nút `✨ A.I. Soạn`:**
  - Gõ vào ô chat: `Bác 62 tuổi tiểu đường 7.8 đang uống thuốc tây tư vấn ngày 2 ly`
  - Bấm nút **✨ A.I. Soạn**.
  - AI đối chiếu Kho tri thức Second Brain Wiki và viết thành lời tư vấn chu đáo chuẩn Dược sĩ ADDP.

### 4.3. Cột 3 — Hồ sơ 360 & Lên Đơn Nhanh
- Xem nhanh: Bệnh lý nền, Đường huyết ban đầu, Đường huyết hiện tại, Thẻ Tags.
- Bấm **🛒 Lên Đơn Hàng Nhanh** $\rightarrow$ Chọn sản phẩm $\rightarrow$ Hệ thống tự đẩy đơn sang KiotViet và tính doanh số cho Sale.

---

## 5. HƯỚNG DẪN LỊCH CHĂM SÓC 7 MỐC (WORKTRACKING)

Truy cập menu **Lịch Chăm sóc (`/work-tracking`)**:
- **Ngày 1 (Nhận hàng):** Hướng dẫn cách pha nước ấm 45-50°C, uống 1 muỗng gạt.
- **Ngày 3 (Kiểm tra phản ứng):** Kiểm tra tiêu hóa, vị giác của khách.
- **Ngày 7 (Đo đường huyết tuần):** Nhắc khách bấm que đo buổi sáng lúc đói.
- **Ngày 14 & 21 (Đánh giá liệu trình):** Kiểm tra độ ổn định đường huyết và giấc ngủ.
- **Dùng 1/2 Hộp:** Tư vấn dinh dưỡng và vận động nhẹ.
- **Dùng 2/3 Hộp (Chốt Re-order):** Nhắc khách đặt đợt mới để không bị gián đoạn.

**Thao tác:** Bấm **Mở Chat** $\rightarrow$ Gửi tin theo kịch bản $\rightarrow$ Cập nhật chỉ số đường huyết $\rightarrow$ Bấm **✓ Đánh dấu Hoàn thành**.

---

## 6. HƯỚNG DẪN CHIẾN DỊCH GỬI TIN HÀNG LOẠT (SMART BROADCAST)

Truy cập menu **AI & Gửi Hàng loạt (`/broadcast`)**:
1. Bấm **+ Tạo Chiến Dịch Mới**.
2. Chọn kênh gửi: Nick Zalo cá nhân phụ trách.
3. Lọc tệp nhận tin: Theo Thẻ Tag (`Tiểu đường`, `Cao huyết áp`), Số ngày chưa mua.
4. Soạn tin nhắn có biến cá nhân hóa: `Chào {fullName}, Dược sĩ ADDP nhắn gửi...`.
5. Bật tùy chọn **AI Paraphrase**: AI tự viết lại câu chào để chống trùng lặp văn bản.
6. Hàng đợi tự động gửi tin cách nhau 45 - 120 giây ngẫu nhiên (chống khóa nick Zalo).

---

## 7. HƯỚNG DẪN KHO, TÀI CHÍNH & THUẾ

### 7.1. Kho Combo đệ quy (`/inventory`)
- Tự động bóc tách combo khi có đơn xuất kho:
  - 1 Combo `COMBO-2GLU-1DOV` $\rightarrow$ Trừ tồn kho 2 Lon Glucare Plus + 1 Sủi Dovital.
- Ánh xạ mã SKU sàn (TikTok Shop, Shopee) sang mã sản phẩm KiotViet.

### 7.2. Đối soát Doanh số, Lợi nhuận & Thuế (`/reports`)
- **Doanh thu thực nhận:** GMV trừ đơn hủy trước xuất kho và đơn hoàn.
- **Loss Engine:** Phân tích chi phí thất thoát do bom hàng (32.000 đ/đơn hoàn TikTok).
- **TikTok Ads & Khung giờ vàng:** Phân bổ ngân sách GMV Max vào khung giờ đỉnh 19:00 - 23:00.
- **Thống kê Thuế VAT 8%:** Bấm **Xuất Bảng Kê Thuế (Excel/CSV)** để tải file đối soát doanh thu tính thuế và tiền thuế GTGT đã nộp.
