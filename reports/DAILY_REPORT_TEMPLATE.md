# MẪU BÁO CÁO TIẾN ĐỘ HÀNG NGÀY (DAILY PROGRESS REPORT)

> **HƯỚNG DẪN DÀNH CHO DEVELOPER & AI AGENT:**
> Vào lúc **17:15 – 17:30 mỗi ngày (Thứ 2 $\rightarrow$ Thứ 7)**, Developer chỉ cần gõ câu lệnh sau cho AI (Antigravity / Claude Code):
>
> *"Hãy đọc `AGENTS.md`, `TASKS.md` và lịch sử `git log` hôm nay để tạo báo cáo ngày tại `reports/daily/YYYY-MM-DD.md` theo đúng mẫu `reports/DAILY_REPORT_TEMPLATE.md`, đồng thời cập nhật tiến độ lên file Google Sheets của dự án."*

---

## BÁO CÁO TIẾN ĐỘ NGÀY: `YYYY-MM-DD` (Thứ ..., Tuần ...)

### 1. TỔNG QUAN GIỜ CÔNG TRONG NGÀY (QUY CHUẨN: 8 GIỜ / NGÀY / DEV)

| Nhân sự | Giờ công kế hoạch | Giờ công thực tế | Số ngày công quy đổi | Các mã WBS thực hiện trong ngày | Tỷ lệ hoàn thành mục tiêu ngày |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Developer 1 (+ AI)** | 8.0h | ...h | ... ngày | `WBS-...` | ...% |
| **Developer 2 (+ AI)** | 8.0h | ...h | ... ngày | `WBS-...` | ...% |
| **TỔNG CỘNG ĐỘI DỰ ÁN** | **16.0h** | **...h** | **... ngày** | | **...%** |

---

### 2. CHI TIẾT KẾT QUẢ CÔNG VIỆC ĐÃ HOÀN THÀNH HÔM NAY

| Mã WBS | Đầu mục công việc | Phụ trách | Giờ đã làm | Trạng thái mới | Nhánh Git / Mã Commit | Kết quả kiểm thử / Link nghiệm thu |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| `WBS-XX` | Mô tả công việc đã thực hiện... | Dev 1 + AI | 8.0h | `[x]` Hoàn thành | `feat/dev1-wbs-xx` (`abc1234`) | Đã test API & UI hoạt động đúng |
| `WBS-YY` | Mô tả công việc đã thực hiện... | Dev 2 + AI | 8.0h | `[/]` Đang làm (70%) | `feat/dev2-wbs-yy` (`def5678`) | Đã xong giao diện, chờ nối API sáng mai |

---

### 3. VƯỚNG MẮC PHÁT SINH & ĐỀ XUẤT GIẢI PHÁP (BLOCKERS & RISKS)

- **Vướng mắc kỹ thuật / nghiệp vụ (nếu có):**
  - *[Ghi rõ: Không có / Hoặc mô tả lỗi phát sinh, thiếu quyền truy cập API, chờ duyệt tài khoản...]*
- **Cách AI & Developer đã xử lý / Cần Quản lý hỗ trợ:**
  - *[Ghi rõ phương án đã giải quyết hoặc đề xuất cần Quản lý phê duyệt]*

---

### 4. KẾ HOẠCH NGÀY MAI (CA LÀM VIỆC 8 TIẾNG TIẾP THEO)

- **Developer 1 (+ AI):** Thực hiện mã `WBS-...` (Dự kiến: `8.0h` = `1.0 ngày công`).
- **Developer 2 (+ AI):** Thực hiện mã `WBS-...` (Dự kiến: `8.0h` = `1.0 ngày công`).
