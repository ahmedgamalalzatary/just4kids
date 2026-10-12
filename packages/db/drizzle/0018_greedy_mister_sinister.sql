CREATE TABLE `booking_messages` (
	`id` varchar(36) NOT NULL,
	`booking_id` varchar(36) NOT NULL,
	`kind` enum('sent_to_barber') NOT NULL,
	`actor_account_id` varchar(36) NOT NULL,
	`occurred_at` datetime(3) NOT NULL,
	CONSTRAINT `booking_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `booking_messages` ADD CONSTRAINT `booking_messages_booking_id_bookings_id_fk` FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `booking_messages` ADD CONSTRAINT `booking_messages_actor_account_id_accounts_id_fk` FOREIGN KEY (`actor_account_id`) REFERENCES `accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `booking_messages_booking_index` ON `booking_messages` (`booking_id`,`occurred_at`);