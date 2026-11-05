-- ============================================================================
-- ADDP OMNICHANNEL AI CRM & ERP — MIGRATION 001: UNIFIED MYSQL 8.0 SCHEMA
-- WBS-03 (Phần 1: CRM Core, RBAC, Đa Tài Khoản, Khách Hàng 360, Lộ Trình CSKH)
-- WBS-04 (Phần 2: Sản Phẩm, Kho Combo, Đơn Hàng 7 Kênh, Lãi/Lỗ, Inbox & Broadcast)
-- Database: addp_crm (utf8mb4 / utf8mb4_unicode_ci)
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Bảng Nhân viên & Phân quyền (staff)
CREATE TABLE IF NOT EXISTS `staff` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NULL,
  `phone` VARCHAR(32) NULL,
  `password` VARCHAR(255) NULL,
  `role` ENUM('ADMIN', 'SALE_LEADER', 'SALE', 'CSKH', 'KHO', 'KE_TOAN') NOT NULL DEFAULT 'SALE',
  `teamName` VARCHAR(100) NULL,
  `tabPermissions` JSON NULL,
  `kpi` BIGINT NOT NULL DEFAULT 0,
  `dailyCareTarget` INT NOT NULL DEFAULT 7,
  `dailyMsgTarget` INT NOT NULL DEFAULT 70,
  `isActive` TINYINT(1) NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `staff_code_key` (`code`),
  KEY `staff_role_isActive_idx` (`role`, `isActive`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Bảng Tài khoản Kênh Đa Nền tảng (channel_accounts)
CREATE TABLE IF NOT EXISTS `channel_accounts` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `platform` ENUM('ZALO_PERSONAL', 'ZALO_OA', 'FACEBOOK', 'TIKTOK_SHOP', 'SHOPEE', 'KIOTVIET', 'MAGENTO', 'CALL', 'SMS', 'OTHER') NOT NULL,
  `accountKey` VARCHAR(128) NOT NULL,
  `accountName` VARCHAR(255) NOT NULL,
  `shopId` VARCHAR(128) NULL,
  `shopCipher` VARCHAR(255) NULL,
  `appKey` VARCHAR(128) NULL,
  `appSecretEncrypted` TEXT NULL,
  `accessToken` TEXT NULL,
  `refreshToken` TEXT NULL,
  `tokenExpiresAt` DATETIME(3) NULL,
  `refreshExpiresAt` DATETIME(3) NULL,
  `webhookVerifyToken` VARCHAR(255) NULL,
  `sessionDir` VARCHAR(255) NULL,
  `defaultAiMode` ENUM('AUTO_REPLY', 'DRAFT_ONLY', 'HUMAN_ONLY', 'OFF') NOT NULL DEFAULT 'DRAFT_ONLY',
  `aiAgentSlug` VARCHAR(128) NULL,
  `dailyMsgLimit` INT NOT NULL DEFAULT 70,
  `sentTodayCount` INT NOT NULL DEFAULT 0,
  `status` VARCHAR(32) NOT NULL DEFAULT 'CONNECTED',
  `lastErrorMessage` TEXT NULL,
  `lastSyncAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_platform_account_key` (`platform`, `accountKey`),
  KEY `channel_accounts_platform_status_idx` (`platform`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Bảng Ma trận Phân quyền Nhân viên <-> Tài khoản Kênh (staff_channel_permissions)
CREATE TABLE IF NOT EXISTS `staff_channel_permissions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `staffId` INT NOT NULL,
  `channelAccountId` INT NOT NULL,
  `canView` TINYINT(1) NOT NULL DEFAULT 1,
  `canReply` TINYINT(1) NOT NULL DEFAULT 1,
  `canManage` TINYINT(1) NOT NULL DEFAULT 0,
  `isAutoAssignEligible` TINYINT(1) NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_staff_channel` (`staffId`, `channelAccountId`),
  KEY `staff_channel_permissions_channelAccountId_idx` (`channelAccountId`),
  CONSTRAINT `fk_scp_staff` FOREIGN KEY (`staffId`) REFERENCES `staff` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_scp_channel` FOREIGN KEY (`channelAccountId`) REFERENCES `channel_accounts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Bảng Hồ sơ Khách hàng 360 (customers)
CREATE TABLE IF NOT EXISTS `customers` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(64) NOT NULL,
  `fullName` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(32) NOT NULL,
  `secondaryPhones` VARCHAR(255) NULL,
  `email` VARCHAR(191) NULL,
  `address` TEXT NULL,
  `province` VARCHAR(100) NULL,
  `district` VARCHAR(100) NULL,
  `ward` VARCHAR(100) NULL,
  `age` INT NULL,
  `gender` VARCHAR(16) NULL,
  `pathology` TEXT NULL,
  `initialGlucose` DOUBLE NULL,
  `currentGlucose` DOUBLE NULL,
  `status` VARCHAR(64) NULL DEFAULT 'Khách Mới',
  `vipLevel` ENUM('NEW', 'REPEAT_2', 'LOYAL_3', 'VIP_5') NOT NULL DEFAULT 'NEW',
  `careStatus` VARCHAR(64) NULL DEFAULT 'Đang chăm sóc',
  `source` ENUM('ZALO_PERSONAL', 'ZALO_OA', 'FACEBOOK', 'TIKTOK_SHOP', 'SHOPEE', 'KIOTVIET', 'MAGENTO', 'CALL', 'SMS', 'OTHER') NULL DEFAULT 'OTHER',
  `staffId` INT NULL,
  `totalOrders` INT NOT NULL DEFAULT 0,
  `totalSpent` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `lastOrderDate` DATETIME(3) NULL,
  `facebookUrl` VARCHAR(255) NULL,
  `zaloUid` VARCHAR(128) NULL,
  `vpageUrl` VARCHAR(255) NULL,
  `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `customers_code_key` (`code`),
  UNIQUE KEY `customers_phone_key` (`phone`),
  KEY `customers_staffId_idx` (`staffId`),
  KEY `customers_source_idx` (`source`),
  KEY `customers_vipLevel_idx` (`vipLevel`),
  KEY `customers_lastOrderDate_idx` (`lastOrderDate`),
  CONSTRAINT `fk_customers_staff` FOREIGN KEY (`staffId`) REFERENCES `staff` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Bảng Thẻ phân loại Khách hàng (tags & customer_tags)
CREATE TABLE IF NOT EXISTS `tags` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `slug` VARCHAR(100) NOT NULL,
  `color` VARCHAR(32) NOT NULL DEFAULT '#2563eb',
  `description` VARCHAR(255) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `tags_name_key` (`name`),
  UNIQUE KEY `tags_slug_key` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `customer_tags` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `customerId` INT NOT NULL,
  `tagId` INT NOT NULL,
  `assignedByAi` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_customer_tag` (`customerId`, `tagId`),
  KEY `customer_tags_tagId_idx` (`tagId`),
  CONSTRAINT `fk_ct_customer` FOREIGN KEY (`customerId`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ct_tag` FOREIGN KEY (`tagId`) REFERENCES `tags` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Bảng Lộ trình Chăm sóc (care_plans)
CREATE TABLE IF NOT EXISTS `care_plans` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `customerId` INT NOT NULL,
  `productName` VARCHAR(255) NOT NULL,
  `startDate` DATETIME(3) NOT NULL,
  `usageDays` INT NOT NULL DEFAULT 15,
  `historyChanges` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `care_plans_customerId_idx` (`customerId`),
  CONSTRAINT `fk_careplan_customer` FOREIGN KEY (`customerId`) REFERENCES `customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Bảng Lịch sử Tương tác & Sức khỏe Hàng tuần (interactions)
CREATE TABLE IF NOT EXISTS `interactions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `customerId` INT NOT NULL,
  `staffId` INT NULL,
  `interactionDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `channel` ENUM('ZALO_PERSONAL', 'ZALO_OA', 'FACEBOOK', 'TIKTOK_SHOP', 'SHOPEE', 'KIOTVIET', 'MAGENTO', 'CALL', 'SMS', 'OTHER') NOT NULL DEFAULT 'CALL',
  `interactionStatus` ENUM('SUCCESS', 'NO_ANSWER', 'UNREACHABLE', 'BUSY') NOT NULL DEFAULT 'SUCCESS',
  `content` TEXT NOT NULL,
  `weeklyFeedback` TEXT NULL,
  `healthIndexRaw` VARCHAR(255) NULL,
  `feedbackRating` ENUM('GOOD', 'BAD', 'NONE') NOT NULL DEFAULT 'NONE',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `interactions_customerId_interactionDate_idx` (`customerId`, `interactionDate`),
  KEY `interactions_staffId_idx` (`staffId`),
  CONSTRAINT `fk_interaction_customer` FOREIGN KEY (`customerId`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_interaction_staff` FOREIGN KEY (`staffId`) REFERENCES `staff` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Bảng Lịch Nhắc việc Chăm sóc Tự động Ngày 1-3-7-14-21 (tasks)
CREATE TABLE IF NOT EXISTS `tasks` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `customerId` INT NOT NULL,
  `staffId` INT NOT NULL,
  `orderId` INT NULL,
  `deadline` DATETIME(3) NOT NULL,
  `taskType` ENUM('DAY_1', 'DAY_3', 'DAY_7', 'DAY_14', 'DAY_21', 'HALF_USAGE', 'TWO_THIRD_USAGE', 'OTHER') NOT NULL DEFAULT 'DAY_3',
  `title` VARCHAR(255) NULL,
  `priority` ENUM('HIGH', 'MEDIUM', 'LOW') NOT NULL DEFAULT 'MEDIUM',
  `channel` ENUM('ZALO_PERSONAL', 'ZALO_OA', 'FACEBOOK', 'TIKTOK_SHOP', 'SHOPEE', 'KIOTVIET', 'MAGENTO', 'CALL', 'SMS', 'OTHER') NULL DEFAULT 'ZALO_PERSONAL',
  `isCompleted` TINYINT(1) NOT NULL DEFAULT 0,
  `completedAt` DATETIME(3) NULL,
  `resultNote` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `tasks_staffId_isCompleted_deadline_idx` (`staffId`, `isCompleted`, `deadline`),
  KEY `tasks_customerId_idx` (`customerId`),
  CONSTRAINT `fk_task_customer` FOREIGN KEY (`customerId`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_task_staff` FOREIGN KEY (`staffId`) REFERENCES `staff` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Bảng Sản phẩm, Giá vốn & Công thức Combo (products)
CREATE TABLE IF NOT EXISTS `products` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(128) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `unit` VARCHAR(32) NOT NULL DEFAULT 'Hộp',
  `retailPrice` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `costPrice` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `usageDaysPerUnit` INT NOT NULL DEFAULT 15,
  `comboFormula` TEXT NULL,
  `stockQuantity` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `prepackedQuantity` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `isActive` TINYINT(1) NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `products_code_key` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Bảng Ánh xạ SKU Đa Sàn (sku_mappings)
CREATE TABLE IF NOT EXISTS `sku_mappings` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `platform` ENUM('ZALO_PERSONAL', 'ZALO_OA', 'FACEBOOK', 'TIKTOK_SHOP', 'SHOPEE', 'KIOTVIET', 'MAGENTO', 'CALL', 'SMS', 'OTHER') NOT NULL,
  `shopId` VARCHAR(128) NULL,
  `platformProductId` VARCHAR(128) NOT NULL,
  `platformProductName` VARCHAR(255) NULL,
  `platformSkuId` VARCHAR(128) NOT NULL,
  `platformSkuName` VARCHAR(255) NULL,
  `sellerSku` VARCHAR(128) NULL,
  `localItemCode` VARCHAR(128) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_platform_product_sku` (`platform`, `platformProductId`, `platformSkuId`),
  KEY `sku_mappings_localItemCode_idx` (`localItemCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. Bảng Đơn hàng Hợp nhất 7 Kênh (orders)
CREATE TABLE IF NOT EXISTS `orders` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(128) NOT NULL,
  `platform` ENUM('ZALO_PERSONAL', 'ZALO_OA', 'FACEBOOK', 'TIKTOK_SHOP', 'SHOPEE', 'KIOTVIET', 'MAGENTO', 'CALL', 'SMS', 'OTHER') NOT NULL DEFAULT 'KIOTVIET',
  `channelAccountId` INT NULL,
  `platformOrderId` VARCHAR(128) NULL,
  `customerId` INT NOT NULL,
  `staffId` INT NULL,
  `orderDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deliveredDate` DATETIME(3) NULL,
  `status` VARCHAR(64) NOT NULL DEFAULT 'Đang xử lý',
  `platformStatus` VARCHAR(64) NULL,
  `deliveryStatus` VARCHAR(64) NULL,
  `shippingProvider` VARCHAR(100) NULL,
  `trackingNumber` VARCHAR(100) NULL,
  `productsJson` TEXT NOT NULL,
  `grossAmount` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `subTotal` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `shippingFee` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `sellerDiscount` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `platformDiscount` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `platformFee` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `affiliateCommission` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `adsCostAllocated` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `cogsAmount` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `netProfit` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `buyerPayment` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `isInventoryDeducted` TINYINT(1) NOT NULL DEFAULT 0,
  `careTasksGenerated` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `orders_code_key` (`code`),
  KEY `orders_platform_orderDate_idx` (`platform`, `orderDate`),
  KEY `orders_customerId_idx` (`customerId`),
  KEY `orders_staffId_idx` (`staffId`),
  KEY `orders_status_deliveryStatus_idx` (`status`, `deliveryStatus`),
  CONSTRAINT `fk_order_customer` FOREIGN KEY (`customerId`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_order_staff` FOREIGN KEY (`staffId`) REFERENCES `staff` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_order_channel` FOREIGN KEY (`channelAccountId`) REFERENCES `channel_accounts` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. Bảng Chi tiết Dòng hàng trong Đơn (order_items)
CREATE TABLE IF NOT EXISTS `order_items` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `orderId` INT NOT NULL,
  `platformLineItemId` VARCHAR(128) NULL,
  `productCode` VARCHAR(128) NOT NULL,
  `productName` VARCHAR(255) NOT NULL,
  `skuId` VARCHAR(128) NULL,
  `skuName` VARCHAR(255) NULL,
  `quantity` INT NOT NULL DEFAULT 1,
  `salePrice` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `costPrice` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `resolvedComboJson` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `order_items_orderId_idx` (`orderId`),
  KEY `order_items_productCode_idx` (`productCode`),
  CONSTRAINT `fk_orderitem_order` FOREIGN KEY (`orderId`) REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. Bảng Nhật ký Xuất/Nhập Kho & Kiểm kê (inventory_logs & stock_takes)
CREATE TABLE IF NOT EXISTS `inventory_logs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `logDate` DATE NOT NULL,
  `logType` VARCHAR(32) NOT NULL DEFAULT 'OUT',
  `salesChannel` VARCHAR(100) NOT NULL DEFAULT 'Khác',
  `shippingUnit` VARCHAR(100) NOT NULL DEFAULT 'Khác',
  `batchNumber` INT NOT NULL DEFAULT 1,
  `itemCode` VARCHAR(128) NOT NULL,
  `quantity` DECIMAL(15, 2) NOT NULL,
  `externalOrderId` VARCHAR(128) NULL,
  `note` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `inventory_logs_logDate_salesChannel_idx` (`logDate`, `salesChannel`),
  KEY `inventory_logs_itemCode_idx` (`itemCode`),
  KEY `inventory_logs_externalOrderId_idx` (`externalOrderId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `stock_takes` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `balanceDate` DATE NOT NULL,
  `itemCode` VARCHAR(128) NOT NULL,
  `quantity` DECIMAL(15, 2) NOT NULL,
  `note` VARCHAR(255) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_balance_date_item` (`balanceDate`, `itemCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. Bảng Hội thoại & Tin nhắn Hộp thư Hợp nhất (conversations & messages)
CREATE TABLE IF NOT EXISTS `conversations` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `channelAccountId` INT NOT NULL,
  `platform` ENUM('ZALO_PERSONAL', 'ZALO_OA', 'FACEBOOK', 'TIKTOK_SHOP', 'SHOPEE', 'KIOTVIET', 'MAGENTO', 'CALL', 'SMS', 'OTHER') NOT NULL,
  `externalThreadId` VARCHAR(191) NOT NULL,
  `threadName` VARCHAR(255) NOT NULL,
  `avatarUrl` VARCHAR(512) NULL,
  `isGroup` TINYINT(1) NOT NULL DEFAULT 0,
  `customerId` INT NULL,
  `assignedStaffId` INT NULL,
  `handlerState` ENUM('NEED_HUMAN', 'AI_HANDLING', 'HUMAN_HANDLING', 'LOG_ONLY') NOT NULL DEFAULT 'NEED_HUMAN',
  `aiMode` ENUM('AUTO_REPLY', 'DRAFT_ONLY', 'HUMAN_ONLY', 'OFF') NOT NULL DEFAULT 'DRAFT_ONLY',
  `unreadCount` INT NOT NULL DEFAULT 0,
  `totalMessages` INT NOT NULL DEFAULT 0,
  `lastMessageAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastMessagePreview` TEXT NULL,
  `lastSenderType` VARCHAR(32) NOT NULL DEFAULT 'CUSTOMER',
  `aiDraftText` TEXT NULL,
  `tagsJson` JSON NULL,
  `isPinned` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_channel_thread` (`channelAccountId`, `externalThreadId`),
  KEY `conversations_handlerState_lastMessageAt_idx` (`handlerState`, `lastMessageAt`),
  KEY `conversations_assignedStaffId_lastMessageAt_idx` (`assignedStaffId`, `lastMessageAt`),
  KEY `conversations_customerId_idx` (`customerId`),
  CONSTRAINT `fk_conv_channel` FOREIGN KEY (`channelAccountId`) REFERENCES `channel_accounts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_conv_customer` FOREIGN KEY (`customerId`) REFERENCES `customers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_conv_staff` FOREIGN KEY (`assignedStaffId`) REFERENCES `staff` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `messages` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `conversationId` INT NOT NULL,
  `externalMessageId` VARCHAR(191) NULL,
  `senderType` VARCHAR(32) NOT NULL DEFAULT 'CUSTOMER',
  `senderName` VARCHAR(191) NULL,
  `staffId` INT NULL,
  `content` TEXT NOT NULL,
  `attachmentsJson` JSON NULL,
  `isRead` TINYINT(1) NOT NULL DEFAULT 0,
  `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `messages_conversationId_sentAt_idx` (`conversationId`, `sentAt`),
  CONSTRAINT `fk_msg_conv` FOREIGN KEY (`conversationId`) REFERENCES `conversations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 15. Bảng Chiến dịch Gửi tin Hàng loạt & Smart Queue chống khóa Zalo (broadcast_campaigns)
CREATE TABLE IF NOT EXISTS `broadcast_campaigns` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `platform` ENUM('ZALO_PERSONAL', 'ZALO_OA', 'FACEBOOK', 'TIKTOK_SHOP', 'SHOPEE', 'KIOTVIET', 'MAGENTO', 'CALL', 'SMS', 'OTHER') NOT NULL DEFAULT 'ZALO_PERSONAL',
  `channelAccountId` INT NULL,
  `filterCriteriaJson` JSON NULL,
  `templateContent` TEXT NOT NULL,
  `useAiRewrite` TINYINT(1) NOT NULL DEFAULT 1,
  `minDelaySec` INT NOT NULL DEFAULT 45,
  `maxDelaySec` INT NOT NULL DEFAULT 120,
  `status` VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  `totalTargets` INT NOT NULL DEFAULT 0,
  `sentCount` INT NOT NULL DEFAULT 0,
  `failedCount` INT NOT NULL DEFAULT 0,
  `scheduledAt` DATETIME(3) NULL,
  `createdByStaffId` INT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `broadcast_campaigns_status_scheduledAt_idx` (`status`, `scheduledAt`),
  CONSTRAINT `fk_bc_channel` FOREIGN KEY (`channelAccountId`) REFERENCES `channel_accounts` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- DỮ LIỆU KHỞI TẠO MẶC ĐỊNH (SEED DATA CHO ADDP CRM)
-- ============================================================================

INSERT IGNORE INTO `staff` (`code`, `name`, `role`, `kpi`, `dailyCareTarget`, `dailyMsgTarget`) VALUES
  ('ADMIN', 'Quản Trị Viên ADDP', 'ADMIN', 0, 0, 200),
  ('S001', 'Trưởng Nhóm Sale ADDP', 'SALE_LEADER', 200000000, 10, 70),
  ('S002', 'Nhân Viên Sale & CSKH 01', 'SALE', 100000000, 7, 70),
  ('KHO01', 'Quản Lý Kho & Điều Phối Đơn', 'KHO', 0, 0, 0);

INSERT IGNORE INTO `tags` (`name`, `slug`, `color`, `description`) VALUES
  ('Tiểu đường Tuýp 2', 'tieu-duong-tuyp-2', '#ef4444', 'Khách hàng có bệnh lý tiểu đường đang theo dõi chỉ số đường huyết'),
  ('Mỡ máu / Huyết áp', 'mo-mau-huyet-ap', '#f97316', 'Khách hàng có bệnh lý nền mỡ máu cao hoặc huyết áp'),
  ('Khách VIP (>=5 đơn)', 'khach-vip', '#8b5cf6', 'Khách hàng trung thành đã mua từ 5 đơn trở lên'),
  ('Sắp hết liệu trình', 'sap-het-lieu-trinh', '#eab308', 'Đã dùng 2/3 liệu trình, cần Sale liên hệ tư vấn tái mua'),
  ('Quan tâm Combo', 'quan-tam-combo', '#10b981', 'Khách đang hỏi giá Combo ưu đãi trên Zalo/Fanpage');

INSERT IGNORE INTO `products` (`code`, `name`, `unit`, `retailPrice`, `costPrice`, `usageDaysPerUnit`, `comboFormula`, `sortOrder`) VALUES
  ('VAD', 'ADDP Viên An Đường', 'Hộp', 450000, 145000, 15, 'VAD:1', 1),
  ('HỘPGLUCARE', 'Sữa Hạt Tiểu Đường Glucare Plus (Hộp)', 'Hộp', 550000, 185000, 5, 'HỘPGLUCARE:1', 2),
  ('GÓIGLUCARE', 'Sữa Hạt Tiểu Đường Glucare Plus (Gói lẻ)', 'Gói', 45000, 15000, 1, 'GÓIGLUCARE:1', 3),
  ('LONGLUCARE', 'Sữa Hạt Tiểu Đường Glucare Plus (Lon)', 'Lon', 650000, 210000, 10, 'LONGLUCARE:1', 4),
  ('MÁTGAN', 'Viên Sủi Mát Gan (Ống Xanh)', 'Ống', 65000, 18000, 10, 'MÁTGAN:1', 5),
  ('CAM', 'Viên Sủi Vitamin C Hương Cam', 'Ống', 55000, 15000, 10, 'CAM:1', 6),
  ('CHANHLEO', 'Viên Sủi Hương Chanh Leo (Ống Tím)', 'Ống', 55000, 15000, 10, 'CHANHLEO:1', 7),
  ('ANTHAO', 'Trà An Thảo ADDP', 'Hộp', 250000, 75000, 15, 'ANTHAO:1', 8),
  ('XANH03+GLUCARE01', 'Combo 3 Ống Mát Gan + 1 Hộp Glucare', 'Combo', 690000, 239000, 15, 'MÁTGAN:3,HỘPGLUCARE:1', 9);

SET FOREIGN_KEY_CHECKS = 1;
