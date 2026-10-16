DROP TABLE `cash_payment_events`;--> statement-breakpoint
DROP TABLE `cash_payments`;--> statement-breakpoint
DROP TABLE `invoices`;--> statement-breakpoint
ALTER TABLE `booking_visit_events` DROP COLUMN `previous_invoice_status`;--> statement-breakpoint
ALTER TABLE `booking_visit_events` DROP COLUMN `invoice_status`;
