-- CreateTable
CREATE TABLE `cards` (
    `cid` INTEGER NOT NULL,
    `password` VARCHAR(12) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `sc_name` VARCHAR(100) NULL,
    `jp_name` VARCHAR(100) NULL,
    `en_name` VARCHAR(100) NULL,
    `types` TEXT NULL,
    `description` TEXT NULL,
    `weight` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `cards_password_key`(`password`),
    PRIMARY KEY (`cid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `card_images` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `card_cid` INTEGER NOT NULL,
    `variant` VARCHAR(16) NOT NULL,
    `source_url` VARCHAR(512) NOT NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `checksum` CHAR(64) NULL,
    `status` ENUM('UNKNOWN', 'READY', 'MISSING', 'INVALID') NOT NULL DEFAULT 'UNKNOWN',
    `checked_at` DATETIME(3) NULL,

    INDEX `card_images_status_checked_at_idx`(`status`, `checked_at`),
    UNIQUE INDEX `card_images_card_cid_variant_key`(`card_cid`, `variant`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `print_projects` (
    `id` CHAR(36) NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `revision` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `print_projects_token_hash_key`(`token_hash`),
    INDEX `print_projects_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `print_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_id` CHAR(36) NOT NULL,
    `card_cid` INTEGER NOT NULL,
    `variant` VARCHAR(16) NOT NULL,
    `quantity` TINYINT NOT NULL,
    `position` INTEGER NOT NULL,

    INDEX `print_items_project_id_position_idx`(`project_id`, `position`),
    UNIQUE INDEX `print_items_project_id_card_cid_variant_key`(`project_id`, `card_cid`, `variant`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `export_jobs` (
    `id` CHAR(36) NOT NULL,
    `project_id` CHAR(36) NOT NULL,
    `status` ENUM('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'QUEUED',
    `items_snapshot` JSON NOT NULL,
    `total` INTEGER NOT NULL,
    `page_count` INTEGER NOT NULL,
    `file_name` VARCHAR(255) NULL,
    `file_key` VARCHAR(255) NULL,
    `error` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,

    INDEX `export_jobs_status_expires_at_idx`(`status`, `expires_at`),
    INDEX `export_jobs_project_id_created_at_idx`(`project_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `card_images` ADD CONSTRAINT `card_images_card_cid_fkey` FOREIGN KEY (`card_cid`) REFERENCES `cards`(`cid`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `print_items` ADD CONSTRAINT `print_items_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `print_projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `print_items` ADD CONSTRAINT `print_items_card_cid_fkey` FOREIGN KEY (`card_cid`) REFERENCES `cards`(`cid`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `export_jobs` ADD CONSTRAINT `export_jobs_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `print_projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
