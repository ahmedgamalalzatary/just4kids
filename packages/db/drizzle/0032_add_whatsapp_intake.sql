CREATE TABLE `whatsapp_conversations` (
	`id` varchar(36) NOT NULL,
	`phone` varchar(16) NOT NULL,
	`chat_id` varchar(255) NOT NULL,
	`lease_until` datetime(3),
	`retry_at` datetime(3),
	`failures` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `whatsapp_conversations_id` PRIMARY KEY(`id`),
	CONSTRAINT `whatsapp_conversations_phone_unique` UNIQUE(`phone`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_messages` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`conversation_id` varchar(36) NOT NULL,
	`direction` enum('inbound','outbound') NOT NULL,
	`audience` enum('client','staff') NOT NULL,
	`body` text NOT NULL,
	`status` enum('pending','done','failed') NOT NULL,
	`idempotency_key` varchar(255) NOT NULL,
	`chat_id` varchar(255) NOT NULL,
	`turn_id` varchar(36),
	`action` json,
	`request_number` int,
	`attempts` int NOT NULL DEFAULT 0,
	`error` varchar(500),
	`openwa_message_id` varchar(255),
	`created_at` datetime(3) NOT NULL,
	`completed_at` datetime(3),
	CONSTRAINT `whatsapp_messages_id` PRIMARY KEY(`id`),
	CONSTRAINT `whatsapp_messages_idempotency_unique` UNIQUE(`idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_requests` (
	`number` int AUTO_INCREMENT NOT NULL,
	`conversation_id` varchar(36) NOT NULL,
	`details` json NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `whatsapp_requests_number` PRIMARY KEY(`number`)
);
--> statement-breakpoint
ALTER TABLE `whatsapp_messages` ADD CONSTRAINT `whatsapp_message_conversation_fk` FOREIGN KEY (`conversation_id`) REFERENCES `whatsapp_conversations`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `whatsapp_messages` ADD CONSTRAINT `whatsapp_message_request_fk` FOREIGN KEY (`request_number`) REFERENCES `whatsapp_requests`(`number`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `whatsapp_requests` ADD CONSTRAINT `whatsapp_request_conversation_fk` FOREIGN KEY (`conversation_id`) REFERENCES `whatsapp_conversations`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `whatsapp_messages_work_index` ON `whatsapp_messages` (`conversation_id`,`status`,`id`);--> statement-breakpoint
CREATE INDEX `whatsapp_requests_conversation_index` ON `whatsapp_requests` (`conversation_id`);