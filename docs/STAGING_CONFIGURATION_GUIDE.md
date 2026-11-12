# HƯỚNG DẪN THIẾT LẬP VÀ CẤU HÌNH MÔI TRƯỜNG STAGING / PILOT NỘI BỘ (ADDP CRM)

> **Mục tiêu:** Vận hành môi trường kiểm thử (Staging) và thử nghiệm nội bộ (Pilot) độc lập 100% với Production (`https://crm.addp.vn`), bảo đảm an toàn dữ liệu khách hàng, không gửi tin nhắn thật và không làm sai lệch tồn kho thực tế.

---

## 1. THÔNG SỐ CÁCH LY HẠ TẦNG

| Thành Phần | Production (`crm.addp.vn`) | Staging / Pilot (`staging-crm.addp.vn`) | Ghi Chú Cách Ly |
| :--- | :--- | :--- | :--- |
| **Domain / URL** | `https://crm.addp.vn` | `https://staging-crm.addp.vn` | Host whitelist riêng biệt |
| **Cổng Dịch vụ (Next.js)** | `3005` (hoặc `3000`) | `3006` | Tránh xung đột socket |
| **Tên Tiến trình PM2** | `addp-crm-portal` | `addp-crm-staging` | Quản lý độc lập |
| **Kho Dữ liệu Cục bộ** | `portal/.data/` | `portal/.data_staging/` | Biến `DATA_DIR=.data_staging` |
| **Cơ sở dữ liệu MySQL** | `addp_crm` | `addp_crm_staging` | Database và user riêng |
| **Thư mục Logs** | `logs/` | `logs_staging/` | Không ghi đè log lỗi |
| **Chế độ Vận hành** | `PILOT_SAFE_MODE=false` | `PILOT_SAFE_MODE=true` | Khóa gửi tin thật & mock tồn kho |
| **Đồng bộ Tự động API** | Cho phép | `QA_DISABLE_AUTO_SYNC=true` | Không gọi Meta/TikTok/Zalo background |

---

## 2. BIẾN MÔI TRƯỜNG BẮT BUỘC CHO STAGING (`.env.staging`)

Tạo file `portal/.env.staging` (tuyệt đối không commit lên Git repository):

```bash
# ==============================================================================
# ADDP CRM — STAGING ENVIRONMENT CONFIGURATION
# ==============================================================================
# QUY TẮC NEXT.JS BẮT BUỘC:
# Next.js App Router yêu cầu NODE_ENV=production để kích hoạt trình tối ưu hóa.
# Phân biệt môi trường bằng biến riêng APP_ENV=staging.
NODE_ENV=production
APP_ENV=staging
NEXT_PUBLIC_CRM_DOMAIN=staging-crm.addp.vn
PORT=3006

# 1. Thư mục dữ liệu và CSDL cách ly
DATA_DIR=.data_staging
DATABASE_URL="mysql://addp_staging_user:StagingPass2026!@127.0.0.1:3306/addp_crm_staging"

# 2. Khóa bảo mật phiên làm việc và mã hóa (Tạo ngẫu nhiên bằng openssl rand -hex 32)
CRM_JWT_SECRET="staging_jwt_secret_64chars_long_unique_key_never_share_prod_2026"
INITIAL_ADMIN_PASSWORD="Admin@Staging2026!"

# 3. Chế độ an toàn Pilot & QA (BẮT BUỘC BẬT TRÊN STAGING)
PILOT_SAFE_MODE=true
QA_DISABLE_AUTO_SYNC=true
DAILY_ZALO_MSG_LIMIT=70

# 4. KiotViet Sandbox / Staging Webhook
KIOTVIET_RETAILER="addp_staging"
KIOTVIET_CLIENT_ID="staging-kiotviet-client-id"
KIOTVIET_CLIENT_SECRET="staging-kiotviet-client-secret"
KIOTVIET_WEBHOOK_SECRET="staging_kiotviet_webhook_token_999"

# 5. TikTok Shop Partner Sandbox
TIKTOK_APP_KEY="staging_tt_app_key"
TIKTOK_APP_SECRET="staging_tt_app_secret"
TIKTOK_SHOP_CIPHER="ROW_ZYiTiAAAAAAKQIKT19iz-hy3D_kGFVJk"

# 6. Meta / Facebook Webhook Staging
FB_APP_ID="staging_fb_app_id"
FB_APP_SECRET="staging_fb_app_secret"
FB_VERIFY_TOKEN="staging_fb_webhook_verify_token_2026"

# 7. Magento 2.4.8 Connector Staging
MAGENTO_BASE_URL="https://staging.addp.vn"
MAGENTO_API_ENDPOINT="https://staging.addp.vn/rest/V1"
MAGENTO_WEBHOOK_SECRET="staging_magento_webhook_secret_2026"
```

---

## 3. CƠ CHẾ BẢO VỆ "FAIL CLOSED" KHI THIẾU BÍ MẬT

Hệ thống đã loại bỏ 100% các chuỗi secret hard-code/fallback trong mã nguồn. Nếu khởi động hoặc nhận request mà thiếu biến môi trường:
1. **Thiếu `CRM_JWT_SECRET`:** Mọi thao tác cấp token, xác thực cookie hoặc giải mã kênh bị từ chối ngay lập tức (`500 Server Config Error` hoặc `401 Unauthorized`).
2. **Thiếu `KIOTVIET_WEBHOOK_SECRET`:** Webhook KiotViet từ chối tiếp nhận (`500` / `401`).
3. **Thiếu `TIKTOK_APP_SECRET`:** Các thao tác ký HMAC SHA-256 bị ném ngoại lệ dừng request.
4. **Thiếu `FB_VERIFY_TOKEN`:** Webhook Meta handshake trả về `500`.

---

## 4. QUY TRÌNH TRIỂN KHAI VÀ KIỂM TRA MÔI TRƯỜNG STAGING

### Bước 1: Khởi tạo CSDL Staging và Thư mục dữ liệu
> **NGUYÊN TẮC BẢO MẬT BẮT BUỘC:** Tuyệt đối KHÔNG truyền mật khẩu CSDL trực tiếp trên tham số dòng lệnh (`-pPassword` hoặc `--db-pass=...`) để tránh rò rỉ trong danh sách tiến trình hệ thống (`ps aux`, `tasklist`) và lịch sử lệnh shell. Luôn sử dụng prompt nhập mật khẩu an toàn (`-p`) hoặc biến môi trường `MYSQL_PWD` / `DATABASE_URL`.

```bash
# 1. Khởi tạo Database và User trên MySQL (Nhập mật khẩu an toàn qua prompt ẩn):
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS addp_crm_staging CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Cấp quyền cho user Staging (Nhập mật khẩu an toàn qua prompt hoặc biến môi trường):
mysql -u root -p -e "GRANT ALL PRIVILEGES ON addp_crm_staging.* TO 'addp_staging_user'@'localhost' IDENTIFIED BY 'StagingPass2026!';"

# Nạp migration cấu trúc bảng vào CSDL Staging:
mysql -u root -p addp_crm_staging < database/migrations/001_init_addp_crm.sql
mysql -u root -p addp_crm_staging < database/migrations/002_pilot_core_hardening.sql

# 2. Khởi tạo thư mục dữ liệu tổng hợp (synthetic/mock) cách ly
mkdir -p portal/.data_staging
mkdir -p logs_staging
```

### Bước 2: Nạp Biến Môi Trường & Khởi Động Tiến Trình Staging Qua PM2
> **QUY TẮC NEXT.JS & PM2:** Next.js App Router yêu cầu bắt buộc `NODE_ENV=production` để biên dịch và chạy tối ưu hóa. Biến `APP_ENV=staging` phân biệt môi trường kiểm thử.

PM2 hỗ trợ nạp cấu hình Staging theo các phương thức an toàn sau:

**Cách 1: Nạp trực tiếp qua profile `env_staging` trong `ecosystem.config.js` (Khuyên dùng)**
```bash
# Biên dịch Portal với cấu hình production tối ưu
cd portal
npm run build
cd ..

# Khởi động app Staging độc lập với cờ --env staging
pm2 start ecosystem.config.js --only addp-crm-staging --env staging
pm2 save
```

**Cách 2: Nạp file cấu hình `.env.staging` qua Node.js Flag (Node 20.6+)**
```bash
NODE_OPTIONS="--env-file=portal/.env.staging" pm2 start ecosystem.config.js --only addp-crm-staging
```

**Cách 3: Export biến môi trường bảo mật trước khi khởi chạy**
```bash
set -a
source portal/.env.staging
set +a
pm2 start ecosystem.config.js --only addp-crm-staging
```

### Bước 3: Chạy QA Agent để kiểm tra xác thực trước khi bàn giao Pilot
```bash
# Chạy bộ test an toàn chỉ đọc trên Staging
node qa-agent --target=staging --group=health
node qa-agent --target=staging --group=auth
node qa-agent --target=staging --group=audit-claims
```

---

## 5. TIÊU CHÍ NGHIỆM THU AN TOÀN CHO PILOT NỘI BỘ (PILOT ACCEPTANCE CRITERIA)

Một phiên bản chỉ được phép đưa vào Pilot nội bộ cho nhân viên khi đạt đủ 6 tiêu chí:
1. **100% Endpoint nhạy cảm được bảo vệ bằng RBAC:** Khách chưa đăng nhập không thể đọc `/api/channels`, `/api/staff`, `/api/settings/channel-permissions` hoặc ghi vào `POST /api/customers`.
2. **Webhook KiotViet có xác thực & Idempotency:** Gửi hóa đơn lặp lại không làm tăng số lượng đơn, không trừ kho lần 2 và không sinh duplicate CarePlan tasks.
3. **Không rò rỉ thông tin mật khẩu:** Không có mật khẩu mặc định `"123456"` trên UI; tạo nhân viên mới bắt buộc nhập mật khẩu riêng mạnh (≥ 8 ký tự, gồm chữ và số).
4. **Chế độ Pilot Safe Mode hoạt động chuẩn:** Thử gửi tin nhắn đa kênh từ Hộp thư `/inbox` hoặc Chiến dịch Broadcast ghi log mock an toàn, không kích hoạt tin thật tới điện thoại của khách hàng.
5. **Định mức gửi tin thống nhất:** Toàn bộ hệ thống áp dụng duy nhất định mức cấu hình từ server (`70 tin/ngày/nick`).
6. **Không rò rỉ secret trong response:** API `/api/channels` trả về cấu hình kênh đã che giấu các khóa bí mật (`[CONFIGURED]`, `[TOKEN_PROTECTED]`).
