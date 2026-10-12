CREATE TABLE `barber_collection_events` (
	`id` varchar(36) NOT NULL,
	`entry_id` varchar(36) NOT NULL,
	`actor_account_id` varchar(36) NOT NULL,
	`occurred_at` datetime(3) NOT NULL,
	`before` json,
	`after` json NOT NULL,
	CONSTRAINT `barber_collection_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `barber_collections` (
	`id` varchar(36) NOT NULL,
	`employee_id` varchar(36) NOT NULL,
	`date` date NOT NULL,
	`normal_children` int NOT NULL DEFAULT 0,
	`special_children` int NOT NULL DEFAULT 0,
	`cash` decimal(24,3) NOT NULL DEFAULT '0.000',
	`link` decimal(24,3) NOT NULL DEFAULT '0.000',
	`knet` decimal(24,3) NOT NULL DEFAULT '0.000',
	`total` decimal(24,3) NOT NULL DEFAULT '0.000',
	`version` int NOT NULL DEFAULT 0,
	`entered_by` varchar(36) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `barber_collections_id` PRIMARY KEY(`id`),
	CONSTRAINT `barber_collections_employee_date_unique` UNIQUE(`employee_id`,`date`),
	CONSTRAINT `barber_collection_amounts_valid` CHECK(`barber_collections`.`normal_children` >= 0 AND `barber_collections`.`special_children` >= 0 AND `barber_collections`.`cash` >= 0 AND `barber_collections`.`link` >= 0 AND `barber_collections`.`knet` >= 0),
	CONSTRAINT `barber_collection_total_valid` CHECK(`barber_collections`.`total` = `barber_collections`.`cash` + `barber_collections`.`link` + `barber_collections`.`knet`)
);
--> statement-breakpoint
ALTER TABLE `barber_collection_events` ADD CONSTRAINT `barber_collection_event_entry_fk` FOREIGN KEY (`entry_id`) REFERENCES `barber_collections`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `barber_collection_events` ADD CONSTRAINT `barber_collection_event_actor_fk` FOREIGN KEY (`actor_account_id`) REFERENCES `accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `barber_collections` ADD CONSTRAINT `barber_collection_employee_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`account_id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `barber_collections` ADD CONSTRAINT `barber_collection_entered_by_fk` FOREIGN KEY (`entered_by`) REFERENCES `accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `barber_collection_events_entry_index` ON `barber_collection_events` (`entry_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `barber_collections_date_index` ON `barber_collections` (`date`);