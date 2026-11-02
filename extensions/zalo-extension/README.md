# ADDP CRM — Zalo Multi-Account Bridge Extension (WBS-14)

Tiện ích mở rộng kết nối trực tiếp tài khoản Zalo Cá Nhân chạy trên trình duyệt (`chat.zalo.me`) với Hệ thống CRM `https://crm.addp.vn`.
Được sử dụng làm **phương án dự phòng linh hoạt** cho nhân viên Sale khi quét QR trên Server bị hạn chế IP hoặc khi nhân viên muốn gửi tin nhắn chăm sóc khách hàng trực tiếp từ máy cá nhân.

---

## 1. Tính Năng Nổi Bật

1. **Tuân thủ Luật Anti-Ban (Điều 4 AGENTS.md):**
   - Tự động áp dụng giãn cách ngẫu nhiên **45 – 120 giây** giữa 2 tin nhắn liên tiếp.
   - Giới hạn định mức tối đa **70 tin chủ động/ngày/tài khoản**.
2. **Tự động hóa tìm kiếm và mở hội thoại:**
   - Tìm kiếm khách hàng theo Số điện thoại chuẩn 10 số (`normalizePhone`).
   - Tự động điền nội dung cá nhân hóa `{fullName}`, `{productName}` và nhấn gửi.
3. **Cập nhật tiến độ hai chiều theo thời gian thực:**
   - Báo cáo số tin gửi thành công/thất bại về giao diện CRM (`crm.addp.vn/broadcast`).

---

## 2. Hướng Dẫn Cài Đặt Cho Nhân Viên Sale (Chrome / Cốc Cốc / Edge)

1. Mở trình duyệt Chrome hoặc Cốc Cốc, truy cập đường dẫn: `chrome://extensions/`
2. Bật công tắc **Chế độ dành cho nhà phát triển (Developer mode)** ở góc trên bên phải.
3. Bấm nút **Tải tiện ích đã giải nén (Load unpacked)**.
4. Chọn thư mục: `c:\addp-crm\extensions\zalo-extension`.
5. Đăng nhập sẵn tài khoản Zalo cá nhân tại: `https://chat.zalo.me/`.
6. Mở hệ thống CRM tại `https://crm.addp.vn/` (hoặc `http://localhost:3005/` khi dev) để bắt đầu sử dụng.
