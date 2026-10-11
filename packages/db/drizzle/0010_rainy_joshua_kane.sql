CREATE TABLE `client_status_events` (
	`id` varchar(36) NOT NULL,
	`client_id` varchar(36) NOT NULL,
	`enabled` boolean NOT NULL,
	`previous_enabled` boolean NOT NULL,
	`reason` varchar(1000) NOT NULL,
	`actor_account_id` varchar(36) NOT NULL,
	`occurred_at` datetime(3) NOT NULL,
	CONSTRAINT `client_status_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `client_status_event_changed` CHECK(`client_status_events`.`enabled` <> `client_status_events`.`previous_enabled`)
);
--> statement-breakpoint
ALTER TABLE `clients` ADD `enabled` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `client_status_events` ADD CONSTRAINT `client_status_event_client_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_status_events` ADD CONSTRAINT `client_status_event_actor_fk` FOREIGN KEY (`actor_account_id`) REFERENCES `accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `client_status_events_client_index` ON `client_status_events` (`client_id`,`occurred_at`);