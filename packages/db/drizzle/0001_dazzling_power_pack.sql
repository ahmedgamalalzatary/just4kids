CREATE TABLE `branches` (
	`id` varchar(36) NOT NULL,
	`name` varchar(120) NOT NULL,
	`location` varchar(500) NOT NULL,
	`adult_price` decimal(12,3) NOT NULL,
	`child_price` decimal(12,3) NOT NULL,
	`adult_duration_minutes` int NOT NULL,
	`child_duration_minutes` int NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `branches_id` PRIMARY KEY(`id`),
	CONSTRAINT `branches_adult_price_nonnegative` CHECK(`branches`.`adult_price` >= 0),
	CONSTRAINT `branches_child_price_nonnegative` CHECK(`branches`.`child_price` >= 0),
	CONSTRAINT `branches_adult_duration_positive` CHECK(`branches`.`adult_duration_minutes` > 0),
	CONSTRAINT `branches_child_duration_positive` CHECK(`branches`.`child_duration_minutes` > 0)
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`account_id` varchar(36) NOT NULL,
	`branch_id` varchar(36) NOT NULL,
	`display_name` varchar(120) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `employees_account_id` PRIMARY KEY(`account_id`)
);
--> statement-breakpoint
ALTER TABLE `employees` ADD CONSTRAINT `employees_account_id_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employees` ADD CONSTRAINT `employees_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `employees_branch_index` ON `employees` (`branch_id`);