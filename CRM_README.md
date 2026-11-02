# ADDP Omnichannel AI CRM — `https://crm.addp.vn`

> **AI Agent & Developer: đọc [AGENTS.md](AGENTS.md) và [TASKS.md](TASKS.md) TRƯỚC KHI viết code.**
> Quy trình Git / chạy nhiều AI song song: [GITHUB_WORKFLOW.md](GITHUB_WORKFLOW.md).

Repo này dựng trên lõi **Javis OS** (MIT, upstream `github.com/blogminhquy/javis-os`) cho phần Omnichannel & AI,
bổ sung các phân hệ CRM của ADDP.

| Thư mục | Vai trò | Phụ trách |
|---|---|---|
| `server/`, `dashboard/` | Omnichannel & AI Gateway (Javis OS - Python FastAPI) | Dev 1 |
| `connectors/` | Đồng bộ TikTok Shop, Shopee, KiotViet, Magento 2.4.8, Kho Combo, Lãi/Lỗ | Dev 1 |
| `database/` | Schema MySQL `addp_crm`, migrations, seed | Dev 1 |
| `portal/` | CRM Portal (Next.js) - Hộp thư, Khách hàng 360, Đơn hàng, Báo cáo | Dev 2 |
| `extensions/` | Chrome Extensions (Zalo bridge, lấy SĐT sàn) | Dev 2 |
| `deploy/` | Docker Compose + Nginx + SSL cho server công ty | Dev 1 |
| `reports/daily/` | Báo cáo tiến độ hằng ngày | Cả hai |

Tài liệu gốc của Javis OS: [README.md](README.md) · Triển khai CRM: [deploy/README.md](deploy/README.md)

## Lấy bản cập nhật của Javis OS (upstream)
```bash
git remote add upstream https://github.com/blogminhquy/javis-os.git   # 1 lần
git fetch upstream && git checkout -b chore/sync-javis-upstream develop
git merge upstream/main     # giải quyết xung đột nếu có, rồi mở PR vào develop
```
