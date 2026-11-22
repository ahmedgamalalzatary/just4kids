CREATE TABLE `whatsapp_reminders` (
	`booking_id` varchar(36) NOT NULL,
	`conversation_id` varchar(36) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `whatsapp_reminders_booking_id` PRIMARY KEY(`booking_id`)
);
--> statement-breakpoint
ALTER TABLE `whatsapp_reminders` ADD CONSTRAINT `whatsapp_reminder_booking_fk` FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `whatsapp_reminders` ADD CONSTRAINT `whatsapp_reminder_conversation_fk` FOREIGN KEY (`conversation_id`) REFERENCES `whatsapp_conversations`(`id`) ON DELETE cascade ON UPDATE no action;