CREATE TABLE `employee_locations` (
	`employee_id` varchar(36) NOT NULL,
	`latitude` decimal(9,6) NOT NULL,
	`longitude` decimal(9,6) NOT NULL,
	`accuracy` int NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `employee_locations_employee_id` PRIMARY KEY(`employee_id`)
);
--> statement-breakpoint
ALTER TABLE `employee_locations` ADD CONSTRAINT `employee_locations_employee_id_employees_account_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`account_id`) ON DELETE cascade ON UPDATE no action;