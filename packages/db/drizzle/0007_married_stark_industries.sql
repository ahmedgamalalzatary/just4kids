CREATE TABLE `cash_payment_events` (
	`id` varchar(36) NOT NULL,
	`booking_id` varchar(36) NOT NULL,
	`payment_id` varchar(36) NOT NULL,
	`version` int NOT NULL,
	`revision_id` varchar(36),
	`kind` enum('recorded','voided','extra_cash','refund') NOT NULL,
	`amount` decimal(24,3) NOT NULL,
	`actor_account_id` varchar(36) NOT NULL,
	`reason` varchar(1000),
	`occurred_at` datetime(3) NOT NULL,
	`before` json,
	`after` json NOT NULL,
	CONSTRAINT `cash_payment_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `cash_event_booking_version_unique` UNIQUE(`booking_id`,`version`),
	CONSTRAINT `cash_event_values_valid` CHECK(`cash_payment_events`.`version` > 0 AND `cash_payment_events`.`amount` >= 0),
	CONSTRAINT `cash_event_reason_required` CHECK(`cash_payment_events`.`kind` = 'recorded' OR (`cash_payment_events`.`reason` IS NOT NULL AND CHAR_LENGTH(TRIM(`cash_payment_events`.`reason`)) > 0)),
	CONSTRAINT `cash_event_revision_valid` CHECK((`cash_payment_events`.`kind` IN ('recorded', 'voided') AND `cash_payment_events`.`revision_id` IS NULL) OR (`cash_payment_events`.`kind` IN ('extra_cash', 'refund') AND `cash_payment_events`.`revision_id` IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `cash_payments` (
	`id` varchar(36) NOT NULL,
	`booking_id` varchar(36) NOT NULL,
	`invoice_id` varchar(36) NOT NULL,
	`original_amount` decimal(24,3) NOT NULL,
	`amount` decimal(24,3) NOT NULL,
	`status` enum('active','voided') NOT NULL DEFAULT 'active',
	`active_invoice_id` varchar(36) GENERATED ALWAYS AS (CASE WHEN status = 'active' THEN invoice_id ELSE NULL END) STORED,
	`recorded_by` varchar(36) NOT NULL,
	`recorded_at` datetime(3) NOT NULL,
	`booking_at_receipt` json NOT NULL,
	CONSTRAINT `cash_payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `cash_payment_active_invoice_unique` UNIQUE(`active_invoice_id`),
	CONSTRAINT `cash_payment_amounts_valid` CHECK(`cash_payments`.`original_amount` >= 0 AND `cash_payments`.`amount` >= 0)
);
--> statement-breakpoint
ALTER TABLE `cash_payment_events` ADD CONSTRAINT `cash_payment_events_booking_id_bookings_id_fk` FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_payment_events` ADD CONSTRAINT `cash_payment_events_payment_id_cash_payments_id_fk` FOREIGN KEY (`payment_id`) REFERENCES `cash_payments`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_payment_events` ADD CONSTRAINT `cash_payment_events_revision_id_booking_revisions_id_fk` FOREIGN KEY (`revision_id`) REFERENCES `booking_revisions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_payment_events` ADD CONSTRAINT `cash_payment_events_actor_account_id_accounts_id_fk` FOREIGN KEY (`actor_account_id`) REFERENCES `accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_payments` ADD CONSTRAINT `cash_payments_booking_id_bookings_id_fk` FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_payments` ADD CONSTRAINT `cash_payments_invoice_id_invoices_id_fk` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_payments` ADD CONSTRAINT `cash_payments_recorded_by_accounts_id_fk` FOREIGN KEY (`recorded_by`) REFERENCES `accounts`(`id`) ON DELETE restrict ON UPDATE no action;