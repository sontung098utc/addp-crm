-- ============================================================================
-- ADDP OMNICHANNEL AI CRM & ERP — MIGRATION 002: PILOT CORE HARDENING
-- Bổ sung bảng Idempotency, ràng buộc khóa duy nhất & hỗ trợ chuyển dịch JSON -> MySQL
-- Database: addp_crm / addp_crm_staging (utf8mb4 / utf8mb4_unicode_ci)
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Bảng Kiểm Soát Tính Bảo Toàn & Chống Trùng Lặp Webhook (webhook_idempotency)
CREATE TABLE IF NOT EXISTS `webhook_idempotency` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `idempotencyKey` VARCHAR(191) NOT NULL,
  `sourcePlatform` VARCHAR(64) NOT NULL,
  `eventType` VARCHAR(64) NOT NULL DEFAULT 'invoice.update',
  `payloadHash` VARCHAR(64) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'PROCESSED',
  `orderCode` VARCHAR(128) NULL,
  `responseBody` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expiresAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_webhook_idempotency_key` (`idempotencyKey`),
  KEY `idx_webhook_source_platform` (`sourcePlatform`),
  KEY `idx_webhook_order_code` (`orderCode`),
  KEY `idx_webhook_created_at` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Đảm bảo ràng buộc tính duy nhất trên Mã Đơn Hàng (orders.orderCode)
-- Giúp Database tự động từ chối nếu có 2 transaction cùng cố gắng tạo đơn trùng mã
ALTER TABLE `orders`
  ADD UNIQUE KEY `uq_orders_order_code` (`orderCode`);

-- 3. Đảm bảo ràng buộc tính duy nhất trên Số Điện Thoại Chuẩn Hóa của Khách Hàng
-- Tuân thủ Điều 3 AGENTS.md: 1 số điện thoại chuẩn = 1 hồ sơ duy nhất
ALTER TABLE `customers`
  ADD UNIQUE KEY `uq_customers_normalized_phone` (`phone`);

-- 4. Bảng Ghi Nhận Lịch Chăm Sóc CarePlan Đơn Hàng Chi Tiết (care_tasks)
CREATE TABLE IF NOT EXISTS `care_tasks` (
  `id` VARCHAR(128) NOT NULL,
  `orderCode` VARCHAR(128) NULL,
  `customerId` VARCHAR(128) NULL,
  `customerName` VARCHAR(255) NOT NULL,
  `customerPhone` VARCHAR(32) NOT NULL,
  `customerPathology` TEXT NULL,
  `customerGlucose` DECIMAL(4, 1) NULL,
  `staffId` INT NOT NULL DEFAULT 1,
  `staffName` VARCHAR(191) NOT NULL,
  `taskType` VARCHAR(64) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `deadline` DATE NOT NULL,
  `suggestedMessage` TEXT NULL,
  `isCompleted` TINYINT(1) NOT NULL DEFAULT 0,
  `completedAt` DATETIME(3) NULL,
  `resultNote` TEXT NULL,
  `carePath` VARCHAR(64) NOT NULL DEFAULT 'Đang chăm sóc',
  `channel` VARCHAR(64) NOT NULL DEFAULT 'ZALO_PERSONAL',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_care_tasks_order_code` (`orderCode`),
  KEY `idx_care_tasks_phone` (`customerPhone`),
  KEY `idx_care_tasks_staff_deadline` (`staffId`, `deadline`, `isCompleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
