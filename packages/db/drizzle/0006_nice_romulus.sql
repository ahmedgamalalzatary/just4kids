CREATE TABLE `booking_revisions` (
	`id` varchar(36) NOT NULL,
	`booking_id` varchar(36) NOT NULL,
	`version` int NOT NULL,
	`actor_account_id` varchar(36) NOT NULL,
	`reason` varchar(1000),
	`occurred_at` datetime(3) NOT NULL,
	`before` json NOT NULL,
	`after` json NOT NULL,
	CONSTRAINT `booking_revisions_id` PRIMARY KEY(`id`),
	CONSTRAINT `booking_revision_version_unique` UNIQUE(`booking_id`,`version`),
	CONSTRAINT `booking_revision_version_valid` CHECK(`booking_revisions`.`version` > 0)
);
--> statement-breakpoint
ALTER TABLE `booking_revisions` ADD CONSTRAINT `booking_revisions_booking_id_bookings_id_fk` FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `booking_revisions` ADD CONSTRAINT `booking_revisions_actor_account_id_accounts_id_fk` FOREIGN KEY (`actor_account_id`) REFERENCES `accounts`(`id`) ON DELETE restrict ON UPDATE no action;