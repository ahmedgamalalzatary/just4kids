ALTER TABLE `employees` DROP FOREIGN KEY `employees_branch_id_branches_id_fk`;
--> statement-breakpoint
ALTER TABLE `bookings` DROP FOREIGN KEY `bookings_branch_id_branches_id_fk`;
--> statement-breakpoint
DROP INDEX `employees_branch_index` ON `employees`;--> statement-breakpoint
ALTER TABLE `employees` DROP COLUMN `branch_id`;--> statement-breakpoint
ALTER TABLE `bookings` DROP COLUMN `branch_id`;--> statement-breakpoint
UPDATE `bookings` SET `employee_snapshot` = JSON_REMOVE(`employee_snapshot`, '$.branchId', '$.branchName', '$.branchLocation');
