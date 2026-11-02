# QUY TRÌNH GITHUB & PHỐI HỢP ĐA TÁC NHÂN (2 DEVELOPER + NHIỀU AI AGENTS)

Tài liệu này quy định cách thức lưu trữ mã nguồn trên GitHub, phân nhánh, sử dụng **Git Worktree** để chạy nhiều AI cùng lúc và quy trình đồng bộ code hàng ngày cho dự án **`crm.addp.vn`**.

---

## 1. CẤU TRÚC THƯ MỤC DỰ ÁN (MONOREPO)

Dự án được tổ chức theo cấu trúc Monorepo để AI dễ dàng đọc ngữ cảnh toàn hệ thống:

```text
addp-crm/
├── AGENTS.md                  # Điều luật bắt buộc cho mọi AI & Developer (ĐỌC ĐẦU TIÊN)
├── TASKS.md                   # Bảng phân công 50 đầu việc (theo Giờ công & Ngày công)
├── GITHUB_WORKFLOW.md         # Quy trình GitHub & làm việc nhóm với AI
├── reports/
│   ├── DAILY_REPORT_TEMPLATE.md
│   └── daily/                 # Lưu báo cáo tiến độ từng ngày (YYYY-MM-DD.md)
├── server/                    # [Dev 1] Omnichannel & AI Gateway (Python FastAPI - Javis OS)
├── connectors/                # [Dev 1] Đồng bộ Shopee, TikTok, Magento 2.4.8, KiotViet, Kho Combo
├── portal/                    # [Dev 2] Giao diện Web CRM, Inbox 3 cột, Báo cáo BI (Next.js/React)
├── extensions/                # [Dev 2] Chrome Extensions (Zalo Bridge, Vpage, TikTok/Shopee SĐT)
├── database/                  # Schema MySQL hợp nhất (schema.prisma / migrations)
└── docker-compose.yml         # Cấu hình chạy toàn bộ hệ thống trên Server crm.addp.vn
```

---

## 2. CHIẾN LƯỢC PHÂN NHÁNH GIT (BRANCHING STRATEGY)

1. **`main`**: Nhánh Production đang chạy thật tại `https://crm.addp.vn`. Chỉ merge từ `develop` sau khi đã nghiệm thu cuối tuần.
2. **`develop`**: Nhánh tích hợp chung của cả 2 Developer. Cuối mỗi ngày (trước 17:30), các nhánh tính năng đã hoàn thành sẽ được merge vào `develop`.
3. **Nhánh tính năng theo mã WBS (`feat/<dev>-<wbs>-<mo-ta>`)**:
   - Ví dụ cho **Dev 1**: `feat/dev1-wbs02-unified-mysql-schema`, `feat/dev1-wbs07-zalo-qr-multi`
   - Ví dụ cho **Dev 2**: `feat/dev2-wbs05-crm-portal-layout`, `feat/dev2-wbs18-inbox-3col-ui`

---

## 3. CÁCH CHẠY NHIỀU AI CÙNG LÚC TRÊN 1 MÁY BẰNG `GIT WORKTREE` (KHÔNG ĐỤNG FILE)

Khi 1 Developer mở 2–3 cửa sổ AI (ví dụ: Antigravity + Claude Code + Codex) để làm song song 2 đầu việc khác nhau, **tuyệt đối không chạy chung trên 1 thư mục** vì các AI sẽ sửa đè file của nhau. Hãy dùng `git worktree`:

```powershell
# Từ thư mục gốc c:\addp-crm (đang ở nhánh develop)
# Mở nhánh làm việc thứ nhất cho AI số 1:
git worktree add ../addp-crm-wbs07 -b feat/dev1-wbs07-zalo-qr

# Mở nhánh làm việc thứ hai cho AI số 2:
git worktree add ../addp-crm-wbs09 -b feat/dev1-wbs09-fanpage-webhook
```
- Mở cửa sổ AI 1 tại thư mục `c:\addp-crm-wbs07` và ra lệnh: *"Đọc AGENTS.md và TASKS.md, thực hiện đầu việc WBS-07"*.
- Mở cửa sổ AI 2 tại thư mục `c:\addp-crm-wbs09` và ra lệnh: *"Đọc AGENTS.md và TASKS.md, thực hiện đầu việc WBS-09"*.
- Sau khi xong và merge vào `develop`, xóa worktree phụ: `git worktree remove ../addp-crm-wbs07`.

---

## 4. QUY ƯỚC COMMIT MESSAGE (ĐỂ TỰ ĐỘNG HÓA BÁO CÁO NGÀY)

Mọi commit từ Developer hoặc AI phải ghi rõ **Mã WBS** ở đầu để cuối ngày AI quét lịch sử Git và tự động lập báo cáo tiến độ chính xác 100%:

```text
[WBS-XX][Dev1/Dev2] Mô tả ngắn gọn kết quả đã làm (Số giờ: Xh)
```
**Ví dụ:**
- `[WBS-02][Dev1] Khởi tạo schema MySQL hợp nhất Khách hàng, Đơn hàng, Kho (4h)`
- `[WBS-18][Dev2] Hoàn thiện giao diện Hộp thư đa kênh 3 cột realtime (8h)`

---

## 5. QUY TRÌNH LÀM VIỆC HÀNG NGÀY (8 TIẾNG/NGÀY - 6 NGÀY/TUẦN)

| Khung giờ | Hoạt động của Developer & AI |
| :---: | :--- |
| **08:00 – 08:15** | Pull nhánh `develop` mới nhất (`git pull origin develop`). Mở AI và yêu cầu: *"Đọc `AGENTS.md` và `TASKS.md`, bắt đầu đầu việc `WBS-XX` được phân công hôm nay"*. |
| **08:15 – 12:00** | Ca sáng (3.75h – 4h): Phối hợp cùng AI triển khai code, kiểm thử từng hàm/giao diện, commit theo từng mốc nhỏ. |
| **13:30 – 17:15** | Ca chiều (3.75h – 4h): Tiếp tục hoàn thiện đầu việc trong ngày, chạy test tích hợp giữa Backend (Dev 1) và Frontend (Dev 2). |
| **17:15 – 17:30** | Yêu cầu AI chạy lệnh **Tổng hợp Báo cáo Cuối ngày**: AI tự đọc `git log --since="today"`, cập nhật `TASKS.md`, xuất file `reports/daily/YYYY-MM-DD.md`, cập nhật lên **Google Sheets** và push lên GitHub. |
