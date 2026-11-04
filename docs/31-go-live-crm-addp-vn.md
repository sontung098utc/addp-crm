# HƯỚNG DẪN TRIỂN KHAI & GO-LIVE HỆ THỐNG ADDP CRM (WBS-50)

> **TÊN MIỀN TRIỂN KHAI:** `https://crm.addp.vn`  
> **MÔ HÌNH VẬN HÀNH:** Hybrid Micro-Modular (FastAPI AI Gateway + Next.js Portal + MySQL 8.0 + Redis)  
> **MỤC TIÊU NGHIỆM THU:** Bàn giao chính thức toàn bộ 50 mã WBS (480 giờ công = 100% dự án).

---

## 1. CẤU HÌNH NGINX REVERSE PROXY CHO DOMAIN `crm.addp.vn`

Tệp cấu hình tại `/etc/nginx/sites-available/crm.addp.vn`:

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
    ssl_ciphers HIGH:!aNULL:!MD5;

    # 1. Giao diện Next.js Portal
    location / {
        proxy_pass http://127.0.0.1:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # 2. Omnichannel SSE Stream & WebSockets
    location /api/inbox/stream {
        proxy_pass http://127.0.0.1:3005;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
    }

    # 3. AI Gateway (FastAPI Python)
    location /api/ai/gateway/ {
        proxy_pass http://127.0.0.1:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 2. QUẢN LÝ TIẾN TRÌNH VỚI PM2

Khởi chạy hệ thống nền tảng tự khởi động lại khi reboot:

```bash
# Khởi chạy Next.js Portal
cd /var/www/addp-crm/portal
pm2 start npm --name "addp-crm-portal" -- run start -- -p 3005

# Khởi chạy Python AI Gateway & Zalo QR Runner
cd /var/www/addp-crm/server
pm2 start "python main.py" --name "addp-ai-gateway"

# Khởi chạy Cron sao lưu tự động hàng ngày (02:00 sáng)
pm2 start "node src/scripts/backup_database_cron.js" --name "addp-backup-daily" --cron "0 2 * * *"

pm2 save
```

---

## 3. CHECKLIST KIỂM THỬ UAT TOÀN DIỆN TRƯỚC KHI BÀN GIAO

- [x] Đăng nhập SSO / JWT phân quyền RBAC 6 cấp (`ADMIN`, `SALE_LEADER`, `SALE`, `CSKH`, `KHO`, `KE_TOAN`).
- [x] Đa kênh 7 nền tảng: Zalo QR, Zalo OA, Fanpage Facebook, TikTok Shop, Shopee, KiotViet, Magento 2.4.8.
- [x] Hộp thư hợp nhất 3 cột chuẩn Zalo / Messenger, tốc độ tải tin <500ms.
- [x] Trực kênh AI 3 chế độ + Bộ phán xử y tế (Judge) bảo vệ an toàn tư vấn.
- [x] SmartBroadcastQueue gửi tin giãn cách 45-120s ngẫu nhiên chống khóa tài khoản Zalo.
- [x] Bóc tách công thức Combo đệ quy (`resolve_all_formulas`) trừ kho chính xác 100%.
- [x] Loss Engine tính toán chi phí giao thất bại, bom hàng và lợi nhuận ròng.
- [x] Báo cáo TikTok Ads GMV Max, Khung giờ vàng và Thống kê Thuế xuất file Excel.
- [x] Bảng xếp hạng KPI nhân viên Sale và Phân tích tỷ lệ mua lại (Retention).
- [x] Script tự động sao lưu dữ liệu hàng ngày vào `.data/backups/`.
