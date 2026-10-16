ALTER TABLE `branches` ADD `address` varchar(500) NOT NULL;--> statement-breakpoint
UPDATE `branches` SET `address` = `location`;
