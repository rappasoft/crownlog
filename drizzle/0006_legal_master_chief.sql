ALTER TABLE `watches` ADD `movement` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `watches` ADD `case_size` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `watches` ADD `case_material` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `watches` ADD `dial_color` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `watches` ADD `water_resistance` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `watches` ADD `tags` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `watches` ADD `purchase_price_cents` integer;--> statement-breakpoint
ALTER TABLE `watches` ADD `purchase_date` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `watches` ADD `last_service_date` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `watches` ADD `next_service_date` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `watches` ADD `wear_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `watches` ADD `last_worn_at` text;