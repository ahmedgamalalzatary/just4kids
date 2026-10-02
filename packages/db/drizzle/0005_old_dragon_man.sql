CREATE TABLE `booking_visit_events` (
	`id` varchar(36) NOT NULL,
	`booking_id` varchar(36) NOT NULL,
	`version` int NOT NULL,
	`from_status` enum('booked','arrived','completed','cancelled','no_show'),
	`to_status` enum('booked','arrived','completed','cancelled','no_show') NOT NULL,
	`actor_type` enum('admin','employee','client','system') NOT NULL,
	`actor_account_id` varchar(36),
	`actor_client_id` varchar(36),
	`reason` varchar(1000),
	`correction` boolean NOT NULL DEFAULT false,
	`previous_invoice_status` enum('issued','cancelled'),
	`invoice_status` enum('issued','cancelled') NOT NULL,
	`occurred_at` datetime(3) NOT NULL,
	CONSTRAINT `booking_visit_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `visit_event_booking_version_unique` UNIQUE(`booking_id`,`version`),
	CONSTRAINT `visit_event_actor_valid` CHECK((`booking_visit_events`.`actor_type` = 'client' AND `booking_visit_events`.`actor_client_id` IS NOT NULL AND `booking_visit_events`.`actor_account_id` IS NULL) OR (`booking_visit_events`.`actor_type` IN ('admin', 'employee') AND `booking_visit_events`.`actor_account_id` IS NOT NULL AND `booking_visit_events`.`actor_client_id` IS NULL) OR (`booking_visit_events`.`actor_type` = 'system' AND `booking_visit_events`.`actor_account_id` IS NULL AND `booking_visit_events`.`actor_client_id` IS NULL)),
	CONSTRAINT `visit_event_version_valid` CHECK(`booking_visit_events`.`version` >= 0),
	CONSTRAINT `visit_event_correction_reason` CHECK(`booking_visit_events`.`correction` = false OR CHAR_LENGTH(TRIM(`booking_visit_events`.`reason`)) > 0 AND `booking_visit_events`.`reason` IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE `bookings` ADD `visit_version` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `booking_visit_events` ADD CONSTRAINT `booking_visit_events_booking_id_bookings_id_fk` FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `booking_visit_events` ADD CONSTRAINT `booking_visit_events_actor_account_id_accounts_id_fk` FOREIGN KEY (`actor_account_id`) REFERENCES `accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `booking_visit_events` ADD CONSTRAINT `booking_visit_events_actor_client_id_clients_id_fk` FOREIGN KEY (`actor_client_id`) REFERENCES `clients`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
INSERT INTO `booking_visit_events` (`id`, `booking_id`, `version`, `from_status`, `to_status`, `actor_type`, `reason`, `correction`, `invoice_status`, `occurred_at`)
SELECT UUID(), b.id, 0, NULL, b.visit_status, 'system', 'الحالة المسجلة عند ترقية النظام؛ تفاصيل التغييرات السابقة غير متوفرة', false, i.status, CURRENT_TIMESTAMP(3)
FROM bookings b INNER JOIN invoices i ON i.booking_id = b.id
WHERE NOT EXISTS (SELECT 1 FROM booking_visit_events e WHERE e.booking_id = b.id);
