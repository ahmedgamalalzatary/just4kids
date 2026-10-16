CREATE TABLE `employee_work_days` (
	`employee_id` varchar(36) NOT NULL,
	`day_of_week` int NOT NULL,
	`active` boolean NOT NULL,
	CONSTRAINT `employee_work_days_employee_id_day_of_week_pk` PRIMARY KEY(`employee_id`,`day_of_week`),
	CONSTRAINT `work_day_active_range` CHECK(`employee_work_days`.`day_of_week` BETWEEN 0 AND 6)
);
--> statement-breakpoint
ALTER TABLE `employee_work_days` ADD CONSTRAINT `work_day_employee_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`account_id`) ON DELETE cascade ON UPDATE no action;