CREATE TABLE `employee_time_blocks` (
	`id` varchar(36) NOT NULL,
	`employee_id` varchar(36) NOT NULL,
	`date` date NOT NULL,
	`start_time` varchar(5) NOT NULL,
	`end_time` varchar(5) NOT NULL,
	`reason` varchar(500),
	`created_by` varchar(36) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `employee_time_blocks_id` PRIMARY KEY(`id`),
	CONSTRAINT `time_block_employee_date_start_unique` UNIQUE(`employee_id`,`date`,`start_time`),
	CONSTRAINT `time_block_time_order` CHECK(`employee_time_blocks`.`start_time` < `employee_time_blocks`.`end_time`)
);
--> statement-breakpoint
ALTER TABLE `employee_time_blocks` ADD CONSTRAINT `time_block_employee_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`account_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employee_time_blocks` ADD CONSTRAINT `time_block_creator_fk` FOREIGN KEY (`created_by`) REFERENCES `accounts`(`id`) ON DELETE restrict ON UPDATE no action;