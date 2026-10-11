CREATE TABLE `salon_entries` (
	`id` varchar(36) NOT NULL,
	`branch_id` varchar(36) NOT NULL,
	`date` date NOT NULL,
	`child_count` int NOT NULL DEFAULT 0,
	`cash` decimal(24,3) NOT NULL DEFAULT '0.000',
	`link` decimal(24,3) NOT NULL DEFAULT '0.000',
	`knet` decimal(24,3) NOT NULL DEFAULT '0.000',
	`total` decimal(24,3) NOT NULL DEFAULT '0.000',
	`entered_by` varchar(36) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `salon_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `salon_entries_branch_date_unique` UNIQUE(`branch_id`,`date`),
	CONSTRAINT `salon_entry_amounts_valid` CHECK(`salon_entries`.`child_count` >= 0 AND `salon_entries`.`cash` >= 0 AND `salon_entries`.`link` >= 0 AND `salon_entries`.`knet` >= 0),
	CONSTRAINT `salon_entry_total_valid` CHECK(`salon_entries`.`total` = `salon_entries`.`cash` + `salon_entries`.`link` + `salon_entries`.`knet`)
);
--> statement-breakpoint
CREATE TABLE `salon_entry_events` (
	`id` varchar(36) NOT NULL,
	`entry_id` varchar(36) NOT NULL,
	`actor_account_id` varchar(36) NOT NULL,
	`occurred_at` datetime(3) NOT NULL,
	`before` json,
	`after` json NOT NULL,
	CONSTRAINT `salon_entry_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `salon_entries` ADD CONSTRAINT `salon_entry_branch_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `salon_entries` ADD CONSTRAINT `salon_entry_entered_by_fk` FOREIGN KEY (`entered_by`) REFERENCES `accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `salon_entry_events` ADD CONSTRAINT `salon_entry_event_entry_fk` FOREIGN KEY (`entry_id`) REFERENCES `salon_entries`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `salon_entry_events` ADD CONSTRAINT `salon_entry_event_actor_fk` FOREIGN KEY (`actor_account_id`) REFERENCES `accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `salon_entries_date_index` ON `salon_entries` (`date`);--> statement-breakpoint
CREATE INDEX `salon_entry_events_entry_index` ON `salon_entry_events` (`entry_id`,`occurred_at`);