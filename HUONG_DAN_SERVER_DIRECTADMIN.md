# HƯỚNG DẪN TRIỂN KHAI ADDP CRM LÊN DIRECTADMIN (crm.addp.vn)

> **Dành riêng cho máy chủ DirectAdmin của bạn:**  
> - **Đường dẫn thư mục:** `/home/addp/domains/crm.addp.vn/public_html`  
> - **Database:** `addp_crmadmin`  
> - **Username:** `addp_crmadmin`  
> - **Password:** `kdmfwWpG7`  
> - **Host:** `localhost` (Cổng 3306)  
> - **Domain:** `https://crm.addp.vn`  

---

## ⚡ TÓM TẮT CÁC BƯỚC THỰC HIỆN (CHỈ MẤT 3 - 5 PHÚT)

1. **Bước 1:** Nhập database bằng phpMyAdmin (Chọn file `database_import_addp_crmadmin.sql` $\rightarrow$ bấm Import).
2. **Bước 2:** Upload file `addp-crm-production.zip` lên `/home/addp/domains/crm.addp.vn/public_html` và bấm Giải nén (Extract).
3. **Bước 3:** Khởi chạy ứng dụng (Qua tính năng **Setup Node.js App** trên giao diện DirectAdmin hoặc qua lệnh **SSH Terminal**).
4. **Bước 4:** Truy cập `https://crm.addp.vn` và đăng nhập quản trị.

---

## CHI TIẾT TỪNG BƯỚC

### BƯỚC 1: KHỞI TẠO CƠ SỞ DỮ LIỆU QUA PHPMYADMIN (1 Click)
1. Đăng nhập vào bảng điều khiển **DirectAdmin** của bạn.
2. Tìm và bấm vào biểu tượng **phpMyAdmin** (hoặc truy cập qua đường link phpMyAdmin của hosting).
3. Đăng nhập bằng tài khoản:
   - **Tên người dùng:** `addp_crmadmin`
   - **Mật khẩu:** `kdmfwWpG7`
4. Ở cột danh sách bên trái, bấm chọn database **`addp_crmadmin`**.
5. Bấm vào tab **Import** (Nhập) ở thanh menu trên cùng.
6. Bấm nút **Choose File** (Chọn tệp) $\rightarrow$ Tìm và chọn file **`database_import_addp_crmadmin.sql`** (đã chuẩn bị sẵn trong file zip).
7. Cuộn xuống cuối trang và bấm nút **Import** (Thực hiện).
   - *Hệ thống sẽ tự động tạo đủ 15 bảng chuẩn MySQL 8.0, cấu trúc Combo sản phẩm, tài khoản Admin và dữ liệu mẫu.*

---

### BƯỚC 2: TẢI MÃ NGUỒN LÊN SERVER VÀ GIẢI NÉN
1. Trong DirectAdmin, mở công cụ **File Manager** (Quản lý tệp tin) hoặc dùng phần mềm FTP (FileZilla / WinSCP).
2. Di chuyển vào đúng thư mục:
   ```
   /home/addp/domains/crm.addp.vn/public_html
   ```
3. Upload file **`addp-crm-production.zip`** lên thư mục này.
4. Bấm chuột phải vào file `addp-crm-production.zip` $\rightarrow$ chọn **Extract** (Giải nén) vào chính thư mục `public_html`.
5. Sau khi giải nén, kiểm tra các file quan trọng đã nằm sẵn trong `public_html`:
   - `.env` *(Đã cấu hình sẵn chuỗi kết nối tới `addp_crmadmin`)*
   - `.htaccess` *(Đã cấu hình sẵn Reverse Proxy cổng 3005)*
   - `server.js` *(File chạy máy chủ)*
   - `package.json`, thư mục `src/`, `public/`, `prisma/`

---

### BƯỚC 3: KHỞI CHẠY ỨNG DỤNG (CHỌN 1 TRONG 2 CÁCH)

#### 👉 CÁCH 3A: DÙNG GIAO DIỆN "SETUP NODE.JS APP" (Dễ nhất - Không cần gõ lệnh)
Nếu DirectAdmin của bạn có mục **"Setup Node.js App"** (hoặc NodeJS Selector):
1. Trong DirectAdmin, bấm vào **Setup Node.js App** $\rightarrow$ Bấm nút **Create Application** (Tạo ứng dụng).
2. Điền các trường như sau:
   - **Node.js version:** Chọn phiên bản `20.x` hoặc `22.x`
   - **Application mode:** `Production`
   - **Application root:** `domains/crm.addp.vn/public_html` (hoặc `/home/addp/domains/crm.addp.vn/public_html`)
   - **Application URL:** `crm.addp.vn`
   - **Application startup file:** `server.js`
3. Bấm **Create** (Tạo).
4. Sau khi tạo xong, bấm vào nút **"Run NPM Install"** trên giao diện để hệ thống tự tải thư viện.
5. Chạy build ứng dụng bằng cách bấm **Run JS script** $\rightarrow$ chọn `build` (hoặc mở Terminal gõ `npm run build`).
6. Bấm nút **Restart** (Khởi động lại ứng dụng).

---

#### 👉 CÁCH 3B: CHẠY BẰNG SSH TERMINAL (Khuyên dùng - Cực kỳ ổn định với PM2)
Nếu bạn có quyền SSH vào máy chủ (hoặc qua tính năng **Terminal** tích hợp sẵn trong DirectAdmin):
```bash
# 1. Đi vào thư mục chứa code
cd /home/addp/domains/crm.addp.vn/public_html

# 2. Cài đặt các thư viện (chỉ chạy lần đầu)
npm install

# 3. Tạo Prisma Client
npx prisma generate

# 4. Build giao diện tối ưu cho Production
npm run build

# 5. Khởi động tiến trình chạy ngầm bằng PM2 ở cổng 3005
pm2 start server.js --name "addp-crm" -- -p 3005

# 6. Lưu trạng thái để server tự bật lại khi restart máy chủ
pm2 save
```

*(Lưu ý: File `.htaccess` trong thư mục `public_html` sẽ tự động chuyển hướng toàn bộ lượt truy cập từ domain `https://crm.addp.vn` vào cổng 3005 này)*.

---

### BƯỚC 4: TRUY CẬP VÀ ĐĂNG NHẬP HỆ THỐNG

1. Mở trình duyệt và truy cập:
   👉 **`https://crm.addp.vn`**

2. Thông tin đăng nhập mặc định:
   - **Tài khoản:** `admin` (hoặc `admin@addp.vn`)
   - **Mật khẩu:** `123456` (hoặc `addp@2026`)
   - **Vai trò:** Quản trị viên tối cao (Toàn quyền quản trị)

3. **Việc cần làm ngay sau khi đăng nhập:**
   - Bấm vào nút **"Đổi MK"** ở góc phải thanh tiêu đề Header để đổi mật khẩu quản trị cá nhân của bạn.
   - Vào menu **"Kết nối 7 Kênh"** (`/channels`) để:
     - Bấm **"Quét mã QR Zalo Cá Nhân"** kết nối tài khoản Zalo của bạn.
     - Bấm **"Kết nối Fanpage 1-Click"** kết nối Fanpage Facebook.
