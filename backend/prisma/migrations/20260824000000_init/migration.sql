-- CreateTable
CREATE TABLE `cities` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `state` VARCHAR(100) NOT NULL,
    `slug` VARCHAR(120) NOT NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_cities_slug`(`slug`),
    UNIQUE INDEX `uq_cities_name_state`(`name`, `state`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `areas` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `city_id` INTEGER UNSIGNED NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `slug` VARCHAR(120) NOT NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_areas_city`(`city_id`),
    UNIQUE INDEX `uq_areas_city_name`(`city_id`, `name`),
    UNIQUE INDEX `uq_areas_city_slug`(`city_id`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `colleges` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `area_id` INTEGER UNSIGNED NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `short_name` VARCHAR(60) NOT NULL,
    `slug` VARCHAR(220) NOT NULL,
    `description` VARCHAR(1000) NULL,
    `image_url` VARCHAR(500) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_colleges_slug`(`slug`),
    INDEX `idx_colleges_area`(`area_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `mobile` VARCHAR(15) NOT NULL,
    `password` VARCHAR(255) NOT NULL,
    `college_id` INTEGER UNSIGNED NULL,
    `role` ENUM('user', 'moderator', 'admin', 'super_admin') NOT NULL DEFAULT 'user',
    `status` ENUM('active', 'blocked') NOT NULL DEFAULT 'active',
    `last_login_at` TIMESTAMP(0) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_users_email`(`email`),
    INDEX `idx_users_college`(`college_id`),
    INDEX `idx_users_role`(`role`),
    INDEX `idx_users_status`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `items` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER UNSIGNED NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `description` TEXT NOT NULL,
    `category` VARCHAR(60) NOT NULL,
    `item_condition` VARCHAR(60) NOT NULL,
    `location` VARCHAR(150) NOT NULL,
    `college_id` INTEGER UNSIGNED NULL,
    `image_url` VARCHAR(500) NULL,
    `status` ENUM('Available', 'Reserved', 'Unavailable') NOT NULL DEFAULT 'Available',
    `moderation_status` ENUM('Pending', 'Approved', 'Rejected', 'Hidden') NOT NULL DEFAULT 'Approved',
    `moderated_by` INTEGER UNSIGNED NULL,
    `moderated_at` TIMESTAMP(0) NULL,
    `moderation_reason` VARCHAR(500) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_items_moderator`(`moderated_by`),
    INDEX `idx_items_category`(`category`),
    INDEX `idx_items_college_status_created`(`college_id`, `status`, `created_at`),
    INDEX `idx_items_created`(`created_at`),
    INDEX `idx_items_moderation`(`moderation_status`),
    INDEX `idx_items_status`(`status`),
    INDEX `idx_items_user`(`user_id`),
    FULLTEXT INDEX `ft_items_search`(`name`, `description`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `requests` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `item_id` INTEGER UNSIGNED NOT NULL,
    `requester_id` INTEGER UNSIGNED NOT NULL,
    `message` VARCHAR(500) NULL,
    `status` ENUM('Pending', 'Accepted', 'Rejected') NOT NULL DEFAULT 'Pending',
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_requests_item`(`item_id`),
    INDEX `idx_requests_requester`(`requester_id`),
    INDEX `idx_requests_status`(`status`),
    UNIQUE INDEX `uq_requests_item_requester`(`item_id`, `requester_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reports` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `reporter_id` INTEGER UNSIGNED NOT NULL,
    `reported_item_id` INTEGER UNSIGNED NULL,
    `reported_user_id` INTEGER UNSIGNED NULL,
    `reason` ENUM('Spam', 'Inappropriate', 'Fraud', 'Duplicate', 'Wrong Category', 'Other') NOT NULL,
    `details` VARCHAR(1000) NULL,
    `status` ENUM('Open', 'Under Review', 'Resolved', 'Rejected') NOT NULL DEFAULT 'Open',
    `reviewed_by` INTEGER UNSIGNED NULL,
    `reviewed_at` TIMESTAMP(0) NULL,
    `resolution_note` VARCHAR(500) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_reports_reviewer`(`reviewed_by`),
    INDEX `idx_reports_created`(`created_at`),
    INDEX `idx_reports_reporter`(`reporter_id`),
    INDEX `idx_reports_status`(`status`),
    UNIQUE INDEX `uq_reports_item_reporter`(`reported_item_id`, `reporter_id`),
    UNIQUE INDEX `uq_reports_user_reporter`(`reported_user_id`, `reporter_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `admin_id` INTEGER UNSIGNED NULL,
    `admin_email` VARCHAR(255) NOT NULL,
    `action` VARCHAR(60) NOT NULL,
    `target_type` ENUM('user', 'item', 'college', 'city', 'area', 'report', 'setting', 'category', 'condition', 'content') NOT NULL,
    `target_id` INTEGER UNSIGNED NULL,
    `description` VARCHAR(500) NOT NULL,
    `changes` JSON NULL,
    `ip_address` VARCHAR(45) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_audit_action`(`action`),
    INDEX `idx_audit_admin`(`admin_id`),
    INDEX `idx_audit_created`(`created_at`),
    INDEX `idx_audit_target`(`target_type`, `target_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_settings` (
    `setting_key` VARCHAR(60) NOT NULL,
    `setting_value` TEXT NULL,
    `value_type` ENUM('string', 'number', 'boolean', 'json', 'color') NOT NULL DEFAULT 'string',
    `label` VARCHAR(120) NOT NULL,
    `description` VARCHAR(300) NULL,
    `category` ENUM('general', 'branding', 'theme', 'content', 'contact', 'users', 'items', 'moderation', 'seo') NOT NULL DEFAULT 'general',
    `is_editable` BOOLEAN NOT NULL DEFAULT true,
    `updated_by` INTEGER UNSIGNED NULL,
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_settings_updated_by`(`updated_by`),
    INDEX `idx_settings_category`(`category`),
    PRIMARY KEY (`setting_key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(60) NOT NULL,
    `label` VARCHAR(60) NOT NULL,
    `glyph` VARCHAR(16) NOT NULL DEFAULT '',
    `tint` VARCHAR(30) NOT NULL DEFAULT 'other',
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_categories_slug`(`slug`),
    INDEX `idx_categories_active_order`(`is_active`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conditions` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(60) NOT NULL,
    `label` VARCHAR(60) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_conditions_slug`(`slug`),
    INDEX `idx_conditions_active_order`(`is_active`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `nav_links` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `label` VARCHAR(60) NOT NULL,
    `href` VARCHAR(200) NOT NULL,
    `placement` ENUM('header', 'footer') NOT NULL DEFAULT 'header',
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_nav_placement_order`(`placement`, `is_active`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `social_links` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `platform` VARCHAR(40) NOT NULL,
    `url` VARCHAR(200) NOT NULL,
    `icon` VARCHAR(30) NOT NULL DEFAULT 'link',
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_social_active_order`(`is_active`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `areas` ADD CONSTRAINT `fk_areas_city` FOREIGN KEY (`city_id`) REFERENCES `cities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `colleges` ADD CONSTRAINT `fk_colleges_area` FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `fk_users_college` FOREIGN KEY (`college_id`) REFERENCES `colleges`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `items` ADD CONSTRAINT `fk_items_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `items` ADD CONSTRAINT `fk_items_moderator` FOREIGN KEY (`moderated_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `items` ADD CONSTRAINT `fk_items_college` FOREIGN KEY (`college_id`) REFERENCES `colleges`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `requests` ADD CONSTRAINT `fk_requests_item` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `requests` ADD CONSTRAINT `fk_requests_requester` FOREIGN KEY (`requester_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reports` ADD CONSTRAINT `fk_reports_item` FOREIGN KEY (`reported_item_id`) REFERENCES `items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reports` ADD CONSTRAINT `fk_reports_reporter` FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reports` ADD CONSTRAINT `fk_reports_user` FOREIGN KEY (`reported_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reports` ADD CONSTRAINT `fk_reports_reviewer` FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `fk_audit_admin` FOREIGN KEY (`admin_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `platform_settings` ADD CONSTRAINT `fk_settings_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

