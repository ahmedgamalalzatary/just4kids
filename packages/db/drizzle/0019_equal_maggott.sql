ALTER TABLE `employees` MODIFY COLUMN `branch_id` varchar(36);
--> statement-breakpoint
ALTER TABLE `bookings` MODIFY COLUMN `branch_id` varchar(36);
--> statement-breakpoint
ALTER TABLE `invoices` DROP CHECK `invoice_amounts_valid`;
--> statement-breakpoint
ALTER TABLE `invoices` DROP COLUMN `adult_unit_price`;
--> statement-breakpoint
ALTER TABLE `invoices` DROP COLUMN `child_unit_price`;
--> statement-breakpoint
ALTER TABLE `invoices` DROP COLUMN `adult_amount`;
--> statement-breakpoint
ALTER TABLE `invoices` DROP COLUMN `child_amount`;
--> statement-breakpoint
ALTER TABLE `invoices` ADD COLUMN `amount_cash` decimal(24,3) NOT NULL;
--> statement-breakpoint
ALTER TABLE `invoices` ADD COLUMN `amount_link` decimal(24,3) NOT NULL;
--> statement-breakpoint
UPDATE `invoices` SET `amount_cash` = `total`, `amount_link` = '0.000';
--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoice_amounts_valid` CHECK (`invoices`.`amount_cash` >= 0 AND `invoices`.`amount_link` >= 0 AND `invoices`.`total` = `invoices`.`amount_cash` + `invoices`.`amount_link`);
