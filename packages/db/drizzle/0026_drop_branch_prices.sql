ALTER TABLE `branches` DROP CONSTRAINT `branches_adult_price_nonnegative`;--> statement-breakpoint
ALTER TABLE `branches` DROP CONSTRAINT `branches_child_price_nonnegative`;--> statement-breakpoint
ALTER TABLE `branches` DROP CONSTRAINT `branches_adult_duration_positive`;--> statement-breakpoint
ALTER TABLE `branches` DROP CONSTRAINT `branches_child_duration_positive`;--> statement-breakpoint
ALTER TABLE `branches` DROP COLUMN `adult_price`;--> statement-breakpoint
ALTER TABLE `branches` DROP COLUMN `child_price`;--> statement-breakpoint
ALTER TABLE `branches` DROP COLUMN `adult_duration_minutes`;--> statement-breakpoint
ALTER TABLE `branches` DROP COLUMN `child_duration_minutes`;