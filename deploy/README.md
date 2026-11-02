# HƯỚNG DẪN TRIỂN KHAI `https://crm.addp.vn` TRÊN SERVER CÔNG TY (WBS-01)

## 1. Yêu cầu server
| Hạng mục | Tối thiểu | Khuyến nghị |
|---|---|---|
| CPU / RAM / Ổ cứng | 4 vCPU / 8 GB / 100 GB SSD | 8 vCPU / 16 GB / 200 GB SSD |
| Hệ điều hành | Ubuntu 22.04/24.04 LTS (hoặc Linux bất kỳ có Docker) | Ubuntu 24.04 LTS |
| Phần mềm | Docker Engine 24+ và Docker Compose v2 | |
| Mạng | IP public tĩnh; mở cổng **80** và **443** trên firewall/router (NAT về server) | |

## 2. Cấu hình DNS (làm trước, chờ 5–30 phút)
Tại nơi quản lý tên miền `addp.vn`, thêm bản ghi:

| Loại | Tên | Giá trị | TTL |
|---|---|---|---|
| A | `crm` | `<IP public của server công ty>` | 300 |

Kiểm tra: `nslookup crm.addp.vn` phải ra đúng IP server.
> Nếu dùng Cloudflare: để **DNS only (mây xám)** khi xin chứng chỉ lần đầu, sau đó mới bật Proxy.

## 3. Cài đặt lần đầu
```bash
sudo mkdir -p /opt && cd /opt
sudo git clone -b develop https://github.com/sontung098utc/addp-crm.git
cd /opt/addp-crm/deploy
cp .env.example .env && nano .env        # điền mật khẩu thật (openssl rand -base64 32)
bash scripts/init-ssl.sh                 # xin SSL Let's Encrypt cho crm.addp.vn
docker compose up -d --build             # bật toàn bộ: nginx, certbot, mysql, redis, javis, portal
docker compose ps                        # tất cả phải ở trạng thái running / healthy
```

## 4. Kiểm tra sau khi bật (Definition of Done WBS-01)
| Kiểm tra | Lệnh / thao tác | Kết quả đúng |
|---|---|---|
| HTTPS hợp lệ | Mở `https://crm.addp.vn` | Ổ khóa xanh, trang Portal hiện |
| Portal sống | `curl -s https://crm.addp.vn/api/health` | `{"status":"ok",...}` |
| Javis Gateway sống | `curl -s https://crm.addp.vn/gw/health` | `{"status":"ok",...}` |
| Webhook Meta tới được Javis | `curl -s "https://crm.addp.vn/messenger/webhook?hub.mode=subscribe"` | Javis trả lời (403/400 là đúng khi thiếu token) |
| MySQL | `docker exec -it crm-mysql mysql -uaddp_crm -p addp_crm -e "SELECT 1"` | `1` |
| Redis | `docker exec crm-redis redis-cli -a "$REDIS_PASSWORD" ping` | `PONG` |
| Tự gia hạn SSL | `docker compose run --rm certbot renew --dry-run` | `Congratulations, all simulated renewals succeeded` |

## 5. Quản trị
- **Dashboard Javis (đăng nhập Zalo QR, cấu hình AI):** chỉ mở trong server, truy cập từ máy quản trị qua SSH tunnel:
  `ssh -L 7777:127.0.0.1:7777 user@<ip-server>` rồi mở `http://localhost:7777`.
- **Đăng nhập bộ não Claude cho Javis (1 lần):** `docker compose run --rm javis claude auth login --claudeai`
- **Cập nhật code:** `cd /opt/addp-crm && git pull && cd deploy && docker compose up -d --build`
- **Sao lưu CSDL hằng ngày (2:30 sáng):** thêm vào `crontab -e`:
  `30 2 * * * cd /opt/addp-crm/deploy && bash scripts/backup-mysql.sh >> backups/backup.log 2>&1`
- **Xem log:** `docker compose logs -f --tail=200 javis portal nginx`

## 6. Bảng định tuyến trên `crm.addp.vn`
| Đường dẫn | Đi tới | Dùng cho |
|---|---|---|
| `/` | `portal:3000` | Giao diện CRM (Next.js) |
| `/gw/*` | `javis:7777` | API Omnichannel & AI cho Portal (sau SSO - WBS-09) |
| `/messenger/webhook` | `javis` | Webhook Fanpage Facebook (WBS-16) |
| `/zalo-oa/webhook`, `/zalo-oa/site-verification`, `/zalo_verifier*.html` | `javis` | Zalo OA & xác thực tên miền (WBS-15) |
| `/connect/oauth/callback` | `javis` | OAuth các dịch vụ kết nối |
