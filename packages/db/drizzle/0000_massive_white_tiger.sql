CREATE TABLE `accounts` (
	`id` varchar(36) NOT NULL,
	`phone` varchar(16) NOT NULL,
	`role` enum('admin','employee') NOT NULL,
	`admin_slot` int GENERATED ALWAYS AS (CASE WHEN role = 'admin' THEN 1 ELSE NULL END) STORED,
	`password_hash` varchar(256) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `accounts_phone_unique` UNIQUE(`phone`),
	CONSTRAINT `accounts_sole_admin_unique` UNIQUE(`admin_slot`)
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`key_hash` varchar(64) NOT NULL,
	`attempts` int NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	CONSTRAINT `login_attempts_key_hash` PRIMARY KEY(`key_hash`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` varchar(64) NOT NULL,
	`account_id` varchar(36) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	CONSTRAINT `sessions_token_hash` PRIMARY KEY(`token_hash`)
);
--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_account_id_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `login_attempts_expiry_index` ON `login_attempts` (`expires_at`);--> statement-breakpoint
CREATE INDEX `sessions_account_index` ON `sessions` (`account_id`);--> statement-breakpoint
CREATE INDEX `sessions_expiry_index` ON `sessions` (`expires_at`);