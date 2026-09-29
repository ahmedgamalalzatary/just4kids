CREATE TABLE `client_addresses` (
	`id` varchar(36) NOT NULL,
	`client_id` varchar(36) NOT NULL,
	`area` varchar(120) NOT NULL,
	`block` varchar(120) NOT NULL,
	`street` varchar(200) NOT NULL,
	`house_number` varchar(120),
	`building_name` varchar(120),
	`floor` varchar(120),
	`apartment` varchar(120),
	`instructions` varchar(1000),
	`maps_url` varchar(2048),
	`latitude` decimal(10,7),
	`longitude` decimal(10,7),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `client_addresses_id` PRIMARY KEY(`id`),
	CONSTRAINT `client_address_has_property` CHECK(`client_addresses`.`house_number` IS NOT NULL OR `client_addresses`.`building_name` IS NOT NULL),
	CONSTRAINT `client_address_coordinates_pair` CHECK((`client_addresses`.`latitude` IS NULL AND `client_addresses`.`longitude` IS NULL) OR (`client_addresses`.`latitude` IS NOT NULL AND `client_addresses`.`longitude` IS NOT NULL)),
	CONSTRAINT `client_address_latitude_range` CHECK(`client_addresses`.`latitude` IS NULL OR `client_addresses`.`latitude` BETWEEN -90 AND 90),
	CONSTRAINT `client_address_longitude_range` CHECK(`client_addresses`.`longitude` IS NULL OR `client_addresses`.`longitude` BETWEEN -180 AND 180)
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` varchar(36) NOT NULL,
	`name` varchar(120) NOT NULL,
	`phone` varchar(16) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `clients_id` PRIMARY KEY(`id`),
	CONSTRAINT `clients_phone_unique` UNIQUE(`phone`)
);
--> statement-breakpoint
ALTER TABLE `client_addresses` ADD CONSTRAINT `client_address_client_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `client_addresses_client_index` ON `client_addresses` (`client_id`);