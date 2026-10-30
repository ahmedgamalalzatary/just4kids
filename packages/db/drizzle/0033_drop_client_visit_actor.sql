ALTER TABLE `booking_visit_events` DROP CONSTRAINT `visit_event_actor_valid`;--> statement-breakpoint
ALTER TABLE `booking_visit_events` DROP FOREIGN KEY `booking_visit_events_actor_client_id_clients_id_fk`;
--> statement-breakpoint
ALTER TABLE `booking_visit_events` MODIFY COLUMN `actor_type` enum('admin','employee','system') NOT NULL;--> statement-breakpoint
ALTER TABLE `booking_visit_events` ADD CONSTRAINT `visit_event_actor_valid` CHECK ((`booking_visit_events`.`actor_type` IN ('admin', 'employee') AND `booking_visit_events`.`actor_account_id` IS NOT NULL) OR (`booking_visit_events`.`actor_type` = 'system' AND `booking_visit_events`.`actor_account_id` IS NULL));--> statement-breakpoint
ALTER TABLE `booking_visit_events` DROP COLUMN `actor_client_id`;