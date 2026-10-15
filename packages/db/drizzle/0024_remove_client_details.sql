ALTER TABLE `client_addresses` DROP CONSTRAINT `client_address_coordinates_pair`;--> statement-breakpoint
ALTER TABLE `client_addresses` DROP CONSTRAINT `client_address_latitude_range`;--> statement-breakpoint
ALTER TABLE `client_addresses` DROP CONSTRAINT `client_address_longitude_range`;--> statement-breakpoint
ALTER TABLE `client_addresses` DROP COLUMN `instructions`;--> statement-breakpoint
ALTER TABLE `client_addresses` DROP COLUMN `latitude`;--> statement-breakpoint
ALTER TABLE `client_addresses` DROP COLUMN `longitude`;--> statement-breakpoint
ALTER TABLE `clients` DROP COLUMN `name`;--> statement-breakpoint
UPDATE `bookings` SET `client_snapshot` = JSON_REMOVE(`client_snapshot`, '$.name'), `address_snapshot` = JSON_REMOVE(`address_snapshot`, '$.instructions', '$.latitude', '$.longitude');--> statement-breakpoint
UPDATE `booking_revisions` SET
  `before` = JSON_REMOVE(`before`, '$.client.name', '$.address.instructions', '$.address.latitude', '$.address.longitude', '$.invoice.client.name', '$.invoice.address.instructions', '$.invoice.address.latitude', '$.invoice.address.longitude'),
  `after` = JSON_REMOVE(`after`, '$.client.name', '$.address.instructions', '$.address.latitude', '$.address.longitude', '$.invoice.client.name', '$.invoice.address.instructions', '$.invoice.address.latitude', '$.invoice.address.longitude');
