ALTER TABLE `whatsapp_messages` MODIFY COLUMN `media` enum('price_list','salon_price_list','barber_photo');--> statement-breakpoint
ALTER TABLE `clients` ADD `favorite_barber_id` varchar(36);--> statement-breakpoint
ALTER TABLE `whatsapp_messages` ADD `media_barber_id` varchar(36);--> statement-breakpoint
ALTER TABLE `clients` ADD CONSTRAINT `client_favorite_barber_fk` FOREIGN KEY (`favorite_barber_id`) REFERENCES `employees`(`account_id`) ON DELETE set null ON UPDATE no action;