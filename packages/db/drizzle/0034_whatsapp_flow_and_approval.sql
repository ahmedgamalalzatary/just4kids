ALTER TABLE `whatsapp_conversations` ADD `flow` json;--> statement-breakpoint
ALTER TABLE `whatsapp_conversations` ADD `ai_paused` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `whatsapp_requests` ADD `status` enum('pending','approved','rejected') DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `whatsapp_requests` ADD `booking_id` varchar(36);--> statement-breakpoint
ALTER TABLE `whatsapp_requests` ADD `decided_at` datetime(3);