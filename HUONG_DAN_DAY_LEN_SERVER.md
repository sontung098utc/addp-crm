# HƯỚNG DẪN TRIỂN KHAI HỆ THỐNG ADDP CRM LÊN SERVER CÔNG TY (https://crm.addp.vn)

> **Tài liệu hướng dẫn kỹ thuật bàn giao cho Quản trị viên máy chủ (SysAdmin / DevOps / Developer)**  
> **Phiên bản:** ADDP CRM v1.0.0 Production  
> **Tên miền hoạt động:** `https://crm.addp.vn`  
> **Địa điểm máy chủ:** Máy chủ vật lý / Cloud VPS nội bộ của Công ty Dược phẩm ADDP  

---

## 1. YÊU CẦU PHẦN CỨNG & HẠ TẦNG MÁY CHỦ

| Thành phần | Cấu hình tối thiểu | Cấu hình khuyên dùng | Ghi chú |
| :--- | :--- | :--- | :--- |
| **Hệ điều hành** | Ubuntu 22.04 LTS / Debian 12 | Ubuntu 24.04 LTS | Hoặc Linux tương thích |
| **CPU** | 2 Cores | 4 Cores | Xử lý đa luồng AI & WebSocket |
| **RAM** | 4 GB | 8 GB | Chạy MySQL 8, Redis, Next.js, Python FastAPI |
| **Ổ cứng** | 30 GB SSD | 50 GB NVMe SSD | Chứa CSDL, file đính kèm Zalo, log hệ thống |
| **Mạng & Cổng** | Mở Port **80** (HTTP) và **443** (HTTPS) | Băng thông >= 100 Mbps | Đã trỏ bản ghi DNS: `crm.addp.vn` $\rightarrow$ IP máy chủ |

---

## 2. PHƯƠNG ÁN 1: TRIỂN KHAI BẰNG DOCKER COMPOSE (KHUYÊN DÙNG - 100% TỰ ĐỘNG & BẢO MẬT)

Đây là phương án chuẩn hóa tốt nhất, đóng gói sẵn toàn bộ môi trường (Nginx, SSL Certbot, MySQL 8, Redis, Python FastAPI, Next.js Portal), không gây xung đột với các ứng dụng khác đang chạy trên máy chủ.

### Bước 1: Chuẩn bị môi trường trên máy chủ Ubuntu/Debian
Nếu máy chủ chưa có Docker, chạy các lệnh sau:
```bash
# Cập nhật hệ thống
sudo apt update && sudo apt upgrade -y

# Cài đặt Docker & Docker Compose plugin
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Kiểm tra phiên bản
docker --version
docker compose version
```

### Bước 2: Tải file nén lên server và giải nén
1. Dùng WinSCP / FileZilla / SCP đẩy file `addp-crm-production.zip` lên máy chủ vào thư mục `/opt`:
```bash
sudo mkdir -p /opt/addp-crm
sudo chown -R $USER:$USER /opt/addp-crm
cd /opt/addp-crm

# Giải nén mã nguồn
unzip addp-crm-production.zip
```

### Bước 3: Cấu hình biến môi trường Production
Copy file mẫu cấu hình môi trường:
```bash
cd /opt/addp-crm/deploy
cp .env.example .env
nano .env
```
Điền các thông tin mật khẩu bảo mật của công ty:
```env
# 1. Tên miền & Mạng
DOMAIN=crm.addp.vn
CERTBOT_EMAIL=admin@addp.vn

# 2. Cơ sở dữ liệu MySQL 8.0
MYSQL_ROOT_PASSWORD=ADDP_StrongRootPass_2026!
MYSQL_DATABASE=addp_crm
MYSQL_USER=addp_crm_user
MYSQL_PASSWORD=ADDP_UserSecret_2026!

# 3. Redis Queue
REDIS_PASSWORD=ADDP_RedisSecret_2026!

# 4. Next.js Portal & JWT
NEXTAUTH_SECRET=addp_super_secret_jwt_key_2026_xyz
NEXT_PUBLIC_APP_URL=https://crm.addp.vn
PORT=3000
```
> **Lưu ý bảo mật (Điều 5 AGENTS.md):** Tuyệt đối không để mật khẩu mặc định. Đặt mật khẩu có chữ hoa, chữ thường, số và ký tự đặc biệt.

### Bước 4: Khởi tạo chứng chỉ SSL HTTPS miễn phí (Let's Encrypt)
Chạy script cấp phát chứng chỉ SSL tự động (Let's Encrypt tự gia hạn 90 ngày/lần):
```bash
bash scripts/init-ssl.sh
```

### Bước 5: Khởi động toàn bộ cụm dịch vụ ADDP CRM
Chạy lệnh khởi động ngầm:
```bash
docker compose up -d --build
```
Kiểm tra trạng thái các container:
```bash
docker compose ps
```
Kết quả hiển thị `crm-nginx`, `crm-portal`, `crm-javis`, `crm-mysql`, `crm-redis`, `crm-certbot` đều ở trạng thái `Up (healthy)`.

### Bước 6: Khởi tạo Database Schema & Seed dữ liệu mẫu (Lần đầu)
```bash
docker compose exec portal npx prisma migrate deploy
docker compose exec portal node src/scripts/migrate_all_legacy_data.js
```

---

## 3. PHƯƠNG ÁN 2: TRIỂN KHAI TRỰC TIẾP (BARE METAL VỚI PM2 & NGINX)

Dành cho máy chủ đã cài sẵn MySQL 8.0, Redis và Node.js 22 LTS / Python 3.12.

### Bước 1: Cài đặt Node.js 22 & Python 3.12
```bash
# Cài đặt Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs python3 python3-pip python3-venv git
sudo npm install -g pm2
```

### Bước 2: Cài đặt Dependencies & Build Frontend Portal
```bash
cd /opt/addp-crm/portal
npm install
npx prisma generate
npx prisma migrate deploy
npm run build
```

### Bước 3: Cài đặt Dependencies Backend FastAPI
```bash
cd /opt/addp-crm/server
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
deactivate
```

### Bước 4: Khởi động các tiến trình bằng PM2
Từ thư mục gốc `/opt/addp-crm`:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Bước 5: Cấu hình Nginx Reverse Proxy
Tạo file cấu hình Nginx:
```bash
sudo nano /etc/nginx/sites-available/crm.addp.vn
```
Dán cấu hình sau:
```nginx
server {
    listen 80;
    server_name crm.addp.vn;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name crm.addp.vn;

    ssl_certificate /etc/letsencrypt/live/crm.addp.vn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/crm.addp.vn/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # Portal Next.js Frontend & API
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Gateway Python FastAPI & Zalo WebSocket
    location /api/gateway/ {
        proxy_pass http://127.0.0.1:8000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```
Kích hoạt site và reload Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/crm.addp.vn /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 4. BƯỚC ĐẦU ĐĂNG NHẬP & CẤU HÌNH KẾT NỐI HỆ THỐNG

Sau khi triển khai thành công, truy cập trình duyệt tại địa chỉ: `https://crm.addp.vn`

### 1. Tài khoản Quản Trị Viên khởi tạo mặc định:
- **Tên đăng nhập:** `admin` (hoặc email `admin@addp.vn`)
- **Mật khẩu khởi tạo:** `addp@2026`
- **Vai trò:** Quản trị viên tối cao (Toàn quyền hệ thống)
> ⚠️ **BẮT BUỘC:** Bấm vào nút **"Đổi MK"** ở góc phải thanh tiêu đề Header để đổi ngay mật khẩu quản trị sau lần đăng nhập đầu tiên.

### 2. Các tài khoản nhân sự mẫu (Sẵn sàng bàn giao):
- **Trưởng nhóm Sale (Leader):** `tranhai` / `123456`
- **Nhân viên Sale (Dược sĩ):** `tuantm` / `123456`, `hath` / `123456`
- **Chăm sóc khách hàng (CSKH):** `maipt` / `123456`
- **Kế toán & Thủ kho:** `kho01` / `123456`

### 3. Kết nối 7 Kênh Vận Hành Thực Tế:
Truy cập menu **"Kết nối 7 Kênh"** (`/channels`):
1. **Zalo Cá Nhân:** Bấm **"Quét Mã QR Zalo Cá Nhân"**, dùng app Zalo trên điện thoại quét để đồng bộ tin nhắn 2 chiều.
2. **Fanpage Facebook:** Bấm **"Kết Nối Fanpage 1-Click"**, điền Page ID và Page Access Token.
3. **KiotViet POS:** Điền Client ID và Client Secret từ KiotViet để đồng bộ tự động tồn kho và đơn hàng.
4. **Website Magento 2.4.8:** Điền Webhook URL `https://crm.addp.vn/api/webhooks/magento` vào Magento admin để nhận đơn đặt hàng tức thì.
5. **TikTok Shop & Shopee:** Kết nối App Key sàn thương mại điện tử.

---

## 5. CƠ CHẾ SAO LƯU DỰ PHÒNG & BẢO TRÌ ĐỊNH KỲ (WBS-50)

### 1. Tự động sao lưu hàng ngày (Cron Job)
Hệ thống đã tích hợp sẵn script tự động sao lưu toàn bộ Database MySQL `addp_crm` vào lúc **02:00 sáng mỗi ngày** tại thư mục `/opt/addp-crm/backups/`. File backup được nén `.sql.gz` và tự động giữ lại bản sao lưu của 30 ngày gần nhất.

### 2. Lệnh sao lưu thủ công tức thì:
```bash
# Đối với Docker Compose:
docker compose exec mysql mysqldump -u addp_crm_user -pADDP_UserSecret_2026! addp_crm | gzip > /opt/addp-crm/backups/manual_backup_$(date +%Y%m%d_%H%M%S).sql.gz

# Đối với máy chủ trực tiếp:
node /opt/addp-crm/portal/src/scripts/backup_database_cron.js
```

### 3. Lệnh phục hồi Database từ bản sao lưu:
```bash
gunzip < /opt/addp-crm/backups/ten_file_backup.sql.gz | docker compose exec -T mysql mysql -u addp_crm_user -pADDP_UserSecret_2026! addp_crm
```

### 4. Kiểm tra Log hệ thống khi cần hỗ trợ:
```bash
# Xem log Docker trực tiếp:
docker compose logs -f --tail=100 portal
docker compose logs -f --tail=100 javis

# Xem log PM2:
pm2 logs addp-crm-portal
```

---

## 6. THÔNG TIN HỖ TRỢ KỸ THUẬT

- **Đơn vị phát triển:** Ban Dự Án Công Nghệ & AI - Công ty Dược phẩm ADDP
- **Kênh mã nguồn:** `https://github.com/sontung098utc/addp-crm.git` (Nhánh `main` & `develop`)
- **Tài liệu hướng dẫn sử dụng chi tiết:** Xem tại `/guide` trên giao diện web hoặc file `docs/HUONG_DAN_SU_DUNG_TOAN_DIEN.md`.
