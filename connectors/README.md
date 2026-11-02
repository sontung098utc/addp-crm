# connectors/ — Đồng bộ Thương mại & Kho (Vùng code của Dev 1 — AGENTS.md Điều 7)

Các dịch vụ đồng bộ đơn hàng / sản phẩm / tồn kho từ các nền tảng bán hàng về CSDL `addp_crm`.

| Thư mục | Nền tảng | Kế thừa từ | Mã WBS |
|---|---|---|---|
| `tiktok/` | TikTok Shop Open API (đa gian hàng) + TikTok Ads GMV Max | `C:\AH-Trabi\quan-ly-kho\tiktok_functions.php`, `C:\AdsTiktok\public\api\` | WBS-18, WBS-45 |
| `shopee/` | Shopee Open API v2 (đa gian hàng) | `C:\AH-Trabi\quan-ly-kho\shopee_functions.php`, `shopee_webhook.php` | WBS-18 |
| `kiotviet/` | KiotViet Public API + Webhook hóa đơn | `C:\QuanlyKH\src\app\api\kiotviet\route.js` | WBS-20, WBS-39 |
| `magento/` | Magento 2.4.8 REST + Webhook `Addp_CustomForm`, Minigame | `C:\ADDP\CustomForm`, `C:\ADDP Minigame` | WBS-20, WBS-37 |
| `inventory/` | Ánh xạ SKU + tách công thức Combo `resolve_all_formulas` | `C:\AH-Trabi\quan-ly-kho\index.php` | WBS-41 |
| `finance/` | Lãi/Lỗ đơn hàng, giá vốn, phí sàn | `C:\AdsTiktok\public\api\commerce_loss_engine.php` | WBS-43 |

## Luật bắt buộc
- SĐT luôn qua `normalizePhone()` trước khi lưu/tìm (AGENTS.md Điều 3).
- Kết nối Magento 2.4.8 chỉ bất đồng bộ (Webhook/Queue), không làm chậm website (Điều 6).
- Token/secret chỉ đọc từ biến môi trường hoặc bảng `ChannelAccount` đã mã hóa — không ghi cứng vào code.
