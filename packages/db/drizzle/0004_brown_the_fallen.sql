CREATE TABLE `bookings` (
	`id` varchar(36) NOT NULL,
	`reference` varchar(40) NOT NULL,
	`client_id` varchar(36) NOT NULL,
	`address_id` varchar(36) NOT NULL,
	`employee_id` varchar(36) NOT NULL,
	`branch_id` varchar(36) NOT NULL,
	`created_by` varchar(36) NOT NULL,
	`date` date NOT NULL,
	`start_time` varchar(5) NOT NULL,
	`end_time` varchar(5) NOT NULL,
	`adult_count` int NOT NULL,
	`child_count` int NOT NULL,
	`source` enum('manual','ai') NOT NULL,
	`visit_status` enum('booked','arrived','completed','cancelled','no_show') NOT NULL DEFAULT 'booked',
	`client_snapshot` json NOT NULL,
	`address_snapshot` json NOT NULL,
	`employee_snapshot` json NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `bookings_id` PRIMARY KEY(`id`),
	CONSTRAINT `bookings_reference_unique` UNIQUE(`reference`),
	CONSTRAINT `bookings_counts_valid` CHECK(`bookings`.`adult_count` >= 0 AND `bookings`.`child_count` >= 0 AND (`bookings`.`adult_count` > 0 OR `bookings`.`child_count` > 0)),
	CONSTRAINT `bookings_window_bounds` CHECK(TIME_TO_SEC(CONCAT(`bookings`.`end_time`, ':00')) - TIME_TO_SEC(CONCAT(`bookings`.`start_time`, ':00')) BETWEEN 1200 AND 14400)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` varchar(36) NOT NULL,
	`booking_id` varchar(36) NOT NULL,
	`adult_unit_price` decimal(12,3) NOT NULL,
	`child_unit_price` decimal(12,3) NOT NULL,
	`adult_amount` decimal(24,3) NOT NULL,
	`child_amount` decimal(24,3) NOT NULL,
	`total` decimal(24,3) NOT NULL,
	`status` enum('issued','cancelled') NOT NULL DEFAULT 'issued',
	`payment_status` enum('unpaid','paid') NOT NULL DEFAULT 'unpaid',
	`issued_at` datetime(3) NOT NULL,
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `invoices_booking_unique` UNIQUE(`booking_id`),
	CONSTRAINT `invoice_amounts_valid` CHECK(`invoices`.`adult_unit_price` >= 0 AND `invoices`.`child_unit_price` >= 0 AND `invoices`.`adult_amount` >= 0 AND `invoices`.`child_amount` >= 0 AND `invoices`.`total` = `invoices`.`adult_amount` + `invoices`.`child_amount`)
);
--> statement-breakpoint
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_address_id_client_addresses_id_fk` FOREIGN KEY (`address_id`) REFERENCES `client_addresses`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_employee_id_employees_account_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`account_id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_created_by_accounts_id_fk` FOREIGN KEY (`created_by`) REFERENCES `accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_booking_id_bookings_id_fk` FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `bookings_employee_date_index` ON `bookings` (`employee_id`,`date`);--> statement-breakpoint
CREATE INDEX `bookings_client_index` ON `bookings` (`client_id`);