# database/ — CSDL trung tâm MySQL 8.0 `addp_crm` (Vùng code của Dev 1)

- `schema/` — Schema Prisma hợp nhất (nguồn sự thật duy nhất cho cả Portal và Connectors).
  - Phần 1 (WBS-03): `Staff`, `Role`, `Permission`, `ChannelAccount`, `Customer`, `CustomerTag`, `CarePlan`, `Interaction`, `Task` — kế thừa `C:\QuanlyKH\prisma\schema.prisma`.
  - Phần 2 (WBS-04): `Order`, `OrderItem`, `Product`, `SkuMapping`, `ComboFormula`, `InventoryLog`, `Conversation`, `Message` — kế thừa `quan-ly-kho` & `AdsTiktok`.
- `migrations/` — Migration sinh bởi `prisma migrate`, commit kèm mỗi thay đổi schema.
- `seed/` — Dữ liệu mẫu cho kiểm thử (WBS-10).
- `legacy/` — Script di chuyển dữ liệu từ 3 hệ thống cũ (WBS-49).

> File dùng chung: trước khi sửa schema phải `git pull origin develop` và commit ngay sau khi sửa (AGENTS.md Điều 7).
