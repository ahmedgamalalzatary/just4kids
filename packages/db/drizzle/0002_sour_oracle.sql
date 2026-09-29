CREATE TABLE `employee_exception_intervals` (
	`exception_id` varchar(36) NOT NULL,
	`start_time` varchar(5) NOT NULL,
	`end_time` varchar(5) NOT NULL,
	CONSTRAINT `employee_exception_intervals_exception_id_start_time_pk` PRIMARY KEY(`exception_id`,`start_time`),
	CONSTRAINT `exception_time_order` CHECK(`employee_exception_intervals`.`start_time` < `employee_exception_intervals`.`end_time`)
);
--> statement-breakpoint
CREATE TABLE `employee_schedule_exceptions` (
	`id` varchar(36) NOT NULL,
	`employee_id` varchar(36) NOT NULL,
	`date` date NOT NULL,
	CONSTRAINT `employee_schedule_exceptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `employee_exception_date_unique` UNIQUE(`employee_id`,`date`)
);
--> statement-breakpoint
CREATE TABLE `employee_work_intervals` (
	`employee_id` varchar(36) NOT NULL,
	`day_of_week` int NOT NULL,
	`start_time` varchar(5) NOT NULL,
	`end_time` varchar(5) NOT NULL,
	CONSTRAINT `employee_work_intervals_employee_id_day_of_week_start_time_pk` PRIMARY KEY(`employee_id`,`day_of_week`,`start_time`),
	CONSTRAINT `work_day_range` CHECK(`employee_work_intervals`.`day_of_week` BETWEEN 0 AND 6),
	CONSTRAINT `work_time_order` CHECK(`employee_work_intervals`.`start_time` < `employee_work_intervals`.`end_time`)
);
--> statement-breakpoint
ALTER TABLE `employee_exception_intervals` ADD CONSTRAINT `exception_interval_fk` FOREIGN KEY (`exception_id`) REFERENCES `employee_schedule_exceptions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employee_schedule_exceptions` ADD CONSTRAINT `exception_employee_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`account_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employee_work_intervals` ADD CONSTRAINT `work_employee_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`account_id`) ON DELETE cascade ON UPDATE no action;
