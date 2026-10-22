-- CreateTable
CREATE TABLE `Brand` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `logo` VARCHAR(191) NOT NULL DEFAULT '',
    `banner` VARCHAR(191) NOT NULL DEFAULT '',
    `description` VARCHAR(191) NOT NULL DEFAULT '',
    `tagline` VARCHAR(191) NOT NULL DEFAULT '',
    `color` VARCHAR(191) NOT NULL DEFAULT '#111111',
    `erpNames` VARCHAR(191) NOT NULL DEFAULT '[]',
    `storefrontLayout` INTEGER NOT NULL DEFAULT 1,
    `storefrontConfig` VARCHAR(191) NOT NULL DEFAULT '{}',
    `isFeatured` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Brand_name_key`(`name`),
    UNIQUE INDEX `Brand_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TopCategory` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `emoji` VARCHAR(191) NOT NULL DEFAULT '🧺',
    `image` VARCHAR(191) NOT NULL DEFAULT '',
    `color` VARCHAR(191) NOT NULL DEFAULT '#facc15',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `TopCategory_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MidCategory` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `topId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `MidCategory_topId_name_key`(`topId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EndCategory` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `midId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `EndCategory_midId_name_key`(`midId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Product` (
    `id` VARCHAR(191) NOT NULL,
    `sku` VARCHAR(191) NOT NULL,
    `legacySku` VARCHAR(191) NOT NULL DEFAULT '',
    `erpId` VARCHAR(191) NOT NULL DEFAULT '',
    `slug` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `brandId` VARCHAR(191) NOT NULL,
    `topId` VARCHAR(191) NOT NULL,
    `midId` VARCHAR(191) NOT NULL,
    `endId` VARCHAR(191) NOT NULL,
    `unit` VARCHAR(191) NOT NULL DEFAULT 'Pcs',
    `packQty` INTEGER NOT NULL DEFAULT 1,
    `piecesPerBox` INTEGER NOT NULL DEFAULT 0,
    `purchaseCost` DOUBLE NOT NULL DEFAULT 0,
    `dealerPrice` DOUBLE NOT NULL,
    `basePrice` DOUBLE NOT NULL DEFAULT 0,
    `mrp` DOUBLE NOT NULL,
    `tier1` DOUBLE NOT NULL DEFAULT 0,
    `tier2` DOUBLE NOT NULL DEFAULT 0,
    `tier3` DOUBLE NOT NULL DEFAULT 0,
    `tier4` DOUBLE NOT NULL DEFAULT 0,
    `tier5` DOUBLE NOT NULL DEFAULT 0,
    `packPrice` DOUBLE NOT NULL DEFAULT 0,
    `packDiscountPct` DOUBLE NOT NULL DEFAULT 0,
    `dealPrice` DOUBLE NOT NULL DEFAULT 0,
    `stock` DOUBLE NOT NULL DEFAULT 0,
    `damagedStock` DOUBLE NOT NULL DEFAULT 0,
    `reservedQty` DOUBLE NOT NULL DEFAULT 0,
    `lowStockThreshold` INTEGER NOT NULL DEFAULT 10,
    `barcode` VARCHAR(191) NOT NULL DEFAULT '',
    `hsn` VARCHAR(191) NOT NULL DEFAULT '',
    `gst` DOUBLE NOT NULL DEFAULT 18,
    `weightGrams` DOUBLE NOT NULL DEFAULT 0,
    `image` VARCHAR(191) NOT NULL DEFAULT '',
    `gallery` VARCHAR(191) NOT NULL DEFAULT '[]',
    `description` VARCHAR(191) NOT NULL DEFAULT '',
    `seoTitle` VARCHAR(191) NOT NULL DEFAULT '',
    `seoDesc` VARCHAR(191) NOT NULL DEFAULT '',
    `keywords` VARCHAR(191) NOT NULL DEFAULT '',
    `rating` DOUBLE NOT NULL DEFAULT 4.5,
    `reviewCount` INTEGER NOT NULL DEFAULT 0,
    `isHot` BOOLEAN NOT NULL DEFAULT false,
    `isTop` BOOLEAN NOT NULL DEFAULT false,
    `isFeatured` BOOLEAN NOT NULL DEFAULT false,
    `isDeal` BOOLEAN NOT NULL DEFAULT false,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `activeSource` VARCHAR(191) NOT NULL DEFAULT 'ERP',
    `syncSource` VARCHAR(191) NOT NULL DEFAULT 'LOCAL',
    `lastSyncedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Product_sku_key`(`sku`),
    UNIQUE INDEX `Product_slug_key`(`slug`),
    INDEX `Product_name_idx`(`name`),
    INDEX `Product_brandId_idx`(`brandId`),
    INDEX `Product_isFeatured_idx`(`isFeatured`),
    INDEX `Product_isDeal_idx`(`isDeal`),
    INDEX `Product_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Customer` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `shopName` VARCHAR(191) NOT NULL DEFAULT '',
    `phone` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL DEFAULT '',
    `password` VARCHAR(191) NOT NULL DEFAULT '',
    `gstin` VARCHAR(191) NOT NULL DEFAULT '',
    `address` VARCHAR(191) NOT NULL DEFAULT '',
    `city` VARCHAR(191) NOT NULL DEFAULT '',
    `pincode` VARCHAR(191) NOT NULL DEFAULT '',
    `customerType` VARCHAR(191) NOT NULL DEFAULT 'RETAILER',
    `tier` VARCHAR(191) NOT NULL DEFAULT 'tier4',
    `creditLimit` DOUBLE NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `source` VARCHAR(191) NOT NULL DEFAULT 'WEB',
    `erpId` VARCHAR(191) NOT NULL DEFAULT '',
    `orders` INTEGER NOT NULL DEFAULT 0,
    `totalSpent` DOUBLE NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Customer_phone_key`(`phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Order` (
    `id` VARCHAR(191) NOT NULL,
    `invoiceNo` VARCHAR(191) NOT NULL DEFAULT '',
    `otp` VARCHAR(191) NOT NULL DEFAULT '',
    `otpSentAt` DATETIME(3) NULL,
    `totalCases` INTEGER NOT NULL DEFAULT 0,
    `totalUnits` INTEGER NOT NULL DEFAULT 0,
    `itemTotal` DOUBLE NOT NULL,
    `gstAmount` DOUBLE NOT NULL DEFAULT 0,
    `deliveryFee` DOUBLE NOT NULL DEFAULT 0,
    `discount` DOUBLE NOT NULL DEFAULT 0,
    `couponCode` VARCHAR(191) NOT NULL DEFAULT '',
    `offerId` VARCHAR(191) NOT NULL DEFAULT '',
    `grandTotal` DOUBLE NOT NULL,
    `totalSavings` DOUBLE NOT NULL DEFAULT 0,
    `customerId` VARCHAR(191) NOT NULL DEFAULT '',
    `customerName` VARCHAR(191) NOT NULL,
    `customerType` VARCHAR(191) NOT NULL DEFAULT 'GUEST',
    `priceTier` VARCHAR(191) NOT NULL DEFAULT 'tier4',
    `phone` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL DEFAULT '',
    `addressLine` VARCHAR(191) NOT NULL,
    `city` VARCHAR(191) NOT NULL,
    `pincode` VARCHAR(191) NOT NULL,
    `zone` VARCHAR(191) NOT NULL DEFAULT '',
    `slot` VARCHAR(191) NOT NULL DEFAULT 'Express 2-hour',
    `paymentMethod` VARCHAR(191) NOT NULL DEFAULT 'UPI',
    `paymentStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `waOptIn` BOOLEAN NOT NULL DEFAULT false,
    `shippingStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `source` VARCHAR(191) NOT NULL DEFAULT 'WEB',
    `storeId` VARCHAR(191) NOT NULL DEFAULT '',
    `salesPerson` VARCHAR(191) NOT NULL DEFAULT '',
    `deliveryMan` VARCHAR(191) NOT NULL DEFAULT '',
    `note` VARCHAR(191) NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderItem` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `sku` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `image` VARCHAR(191) NOT NULL DEFAULT '',
    `unitType` VARCHAR(191) NOT NULL DEFAULT 'SINGLE',
    `packQty` INTEGER NOT NULL DEFAULT 1,
    `qty` DOUBLE NOT NULL,
    `pieces` DOUBLE NOT NULL,
    `unitPrice` DOUBLE NOT NULL,
    `discount` DOUBLE NOT NULL DEFAULT 0,
    `gst` DOUBLE NOT NULL DEFAULT 18,
    `hsn` VARCHAR(191) NOT NULL DEFAULT '',
    `total` DOUBLE NOT NULL,
    `barcode` VARCHAR(191) NOT NULL DEFAULT '',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Offer` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'MEGA_SALE',
    `headline` VARCHAR(191) NOT NULL DEFAULT '',
    `subText` VARCHAR(191) NOT NULL DEFAULT '',
    `ctaText` VARCHAR(191) NOT NULL DEFAULT 'Shop Now',
    `ctaUrl` VARCHAR(191) NOT NULL DEFAULT '#deals',
    `bannerImage` VARCHAR(191) NOT NULL DEFAULT '',
    `bgColor` VARCHAR(191) NOT NULL DEFAULT '#111111',
    `textColor` VARCHAR(191) NOT NULL DEFAULT '#facc15',
    `heroSlot` BOOLEAN NOT NULL DEFAULT true,
    `startAt` DATETIME(3) NULL,
    `endAt` DATETIME(3) NULL,
    `scopeType` VARCHAR(191) NOT NULL DEFAULT 'ALL',
    `scopeIds` VARCHAR(191) NOT NULL DEFAULT '[]',
    `discountType` VARCHAR(191) NOT NULL DEFAULT 'PERCENT',
    `discountValue` DOUBLE NOT NULL DEFAULT 0,
    `minOrder` DOUBLE NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Offer_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Coupon` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `headline` VARCHAR(191) NOT NULL DEFAULT '',
    `subText` VARCHAR(191) NOT NULL DEFAULT '',
    `type` VARCHAR(191) NOT NULL DEFAULT 'PERCENT',
    `value` DOUBLE NOT NULL,
    `minOrder` DOUBLE NOT NULL DEFAULT 0,
    `maxDiscount` DOUBLE NOT NULL DEFAULT 0,
    `bgColor` VARCHAR(191) NOT NULL DEFAULT '#111111',
    `textColor` VARCHAR(191) NOT NULL DEFAULT '#facc15',
    `scopeType` VARCHAR(191) NOT NULL DEFAULT 'ALL',
    `scopeIds` VARCHAR(191) NOT NULL DEFAULT '[]',
    `usageLimit` INTEGER NOT NULL DEFAULT 0,
    `usedCount` INTEGER NOT NULL DEFAULT 0,
    `showOnHome` BOOLEAN NOT NULL DEFAULT true,
    `startAt` DATETIME(3) NULL,
    `endAt` DATETIME(3) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Coupon_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Page` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'CUSTOM',
    `blocks` VARCHAR(191) NOT NULL DEFAULT '[]',
    `metaTitle` VARCHAR(191) NOT NULL DEFAULT '',
    `metaDescription` VARCHAR(191) NOT NULL DEFAULT '',
    `keywords` VARCHAR(191) NOT NULL DEFAULT '',
    `ogImage` VARCHAR(191) NOT NULL DEFAULT '',
    `inFooter` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Page_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SeoMeta` (
    `path` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL DEFAULT '',
    `description` VARCHAR(191) NOT NULL DEFAULT '',
    `keywords` VARCHAR(191) NOT NULL DEFAULT '',
    `ogImage` VARCHAR(191) NOT NULL DEFAULT '',
    `noindex` BOOLEAN NOT NULL DEFAULT false,
    `extraHead` VARCHAR(191) NOT NULL DEFAULT '',

    PRIMARY KEY (`path`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SyncEvent` (
    `id` VARCHAR(191) NOT NULL,
    `direction` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'OK',
    `message` VARCHAR(191) NOT NULL DEFAULT '',
    `productsSeen` INTEGER NOT NULL DEFAULT 0,
    `created` INTEGER NOT NULL DEFAULT 0,
    `updated` INTEGER NOT NULL DEFAULT 0,
    `skipped` INTEGER NOT NULL DEFAULT 0,
    `durationMs` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PriceChangeLog` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `sku` VARCHAR(191) NOT NULL DEFAULT '',
    `name` VARCHAR(191) NOT NULL DEFAULT '',
    `field` VARCHAR(191) NOT NULL,
    `oldVal` DOUBLE NOT NULL,
    `newVal` DOUBLE NOT NULL,
    `basis` VARCHAR(191) NOT NULL DEFAULT '',
    `user` VARCHAR(191) NOT NULL DEFAULT 'Super Admin',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Store` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `manager` VARCHAR(191) NOT NULL DEFAULT '',
    `phone` VARCHAR(191) NOT NULL DEFAULT '',
    `email` VARCHAR(191) NOT NULL DEFAULT '',
    `zone` VARCHAR(191) NOT NULL DEFAULT 'West',
    `city` VARCHAR(191) NOT NULL DEFAULT '',
    `area` VARCHAR(191) NOT NULL DEFAULT '',
    `status` VARCHAR(191) NOT NULL DEFAULT 'APPROVED',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Zone` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Zone_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PriceSlab` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `minQty` INTEGER NOT NULL DEFAULT 0,
    `discountPct` DOUBLE NOT NULL DEFAULT 0,
    `note` VARCHAR(191) NOT NULL DEFAULT '',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Slider` (
    `id` VARCHAR(191) NOT NULL,
    `heading` VARCHAR(191) NOT NULL,
    `content` VARCHAR(191) NOT NULL DEFAULT '',
    `buttonText` VARCHAR(191) NOT NULL DEFAULT 'Shop Now',
    `buttonUrl` VARCHAR(191) NOT NULL DEFAULT '#deals',
    `image` VARCHAR(191) NOT NULL DEFAULT '',
    `position` VARCHAR(191) NOT NULL DEFAULT 'LEFT',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Ad` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `link` VARCHAR(191) NOT NULL DEFAULT '#',
    `image` VARCHAR(191) NOT NULL DEFAULT '',
    `brandId` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SalesPerson` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `mobile` VARCHAR(191) NOT NULL,
    `historyAccess` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `SalesPerson_mobile_key`(`mobile`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DeliveryMan` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL DEFAULT '',
    `phone` VARCHAR(191) NOT NULL DEFAULT '',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `DeliveryMan_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdminUser` (
    `id` VARCHAR(191) NOT NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'COMPANY_ADMIN',
    `permissions` VARCHAR(191) NOT NULL DEFAULT '[]',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AdminUser_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActivityLog` (
    `id` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `entity` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NOT NULL DEFAULT '',
    `detail` VARCHAR(191) NOT NULL DEFAULT '',
    `user` VARCHAR(191) NOT NULL DEFAULT 'Super Admin',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Purchase` (
    `id` VARCHAR(191) NOT NULL,
    `ref` VARCHAR(191) NOT NULL DEFAULT '',
    `company` VARCHAR(191) NOT NULL,
    `product` VARCHAR(191) NOT NULL,
    `qty` INTEGER NOT NULL,
    `rate` DOUBLE NOT NULL,
    `amount` DOUBLE NOT NULL,
    `note` VARCHAR(191) NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReturnRequest` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `product` VARCHAR(191) NOT NULL,
    `qty` INTEGER NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'REQUESTED',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Setting` (
    `key` VARCHAR(191) NOT NULL,
    `value` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Size` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Size_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Color` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `hex` VARCHAR(191) NOT NULL DEFAULT '#000000',

    UNIQUE INDEX `Color_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OtpCode` (
    `id` VARCHAR(191) NOT NULL,
    `identifier` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `purpose` VARCHAR(191) NOT NULL DEFAULT 'LOGIN',
    `expiresAt` DATETIME(3) NOT NULL,
    `consumed` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OtpCode_identifier_purpose_idx`(`identifier`, `purpose`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MidCategory` ADD CONSTRAINT `MidCategory_topId_fkey` FOREIGN KEY (`topId`) REFERENCES `TopCategory`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EndCategory` ADD CONSTRAINT `EndCategory_midId_fkey` FOREIGN KEY (`midId`) REFERENCES `MidCategory`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_brandId_fkey` FOREIGN KEY (`brandId`) REFERENCES `Brand`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_topId_fkey` FOREIGN KEY (`topId`) REFERENCES `TopCategory`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_midId_fkey` FOREIGN KEY (`midId`) REFERENCES `MidCategory`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_endId_fkey` FOREIGN KEY (`endId`) REFERENCES `EndCategory`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ad` ADD CONSTRAINT `Ad_brandId_fkey` FOREIGN KEY (`brandId`) REFERENCES `Brand`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

