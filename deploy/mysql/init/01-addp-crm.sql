-- Chạy MỘT LẦN khi volume MySQL còn trống (docker-entrypoint-initdb.d). WBS-01.
-- Bảng nghiệp vụ do migration tạo ở WBS-03 / WBS-04 (database/), không tạo ở đây.
ALTER DATABASE addp_crm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CSDL tạm để chứa bản dump của 3 hệ thống cũ khi di chuyển dữ liệu (WBS-49)
CREATE DATABASE IF NOT EXISTS legacy_quanlykh   CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS legacy_khohang    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS legacy_adstiktok  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON legacy_quanlykh.*  TO 'addp_crm'@'%';
GRANT ALL PRIVILEGES ON legacy_khohang.*   TO 'addp_crm'@'%';
GRANT ALL PRIVILEGES ON legacy_adstiktok.* TO 'addp_crm'@'%';
FLUSH PRIVILEGES;
