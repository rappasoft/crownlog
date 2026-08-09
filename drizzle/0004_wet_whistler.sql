ALTER TABLE `watches` ADD `currency` text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE `watches` ADD `last_price_check_at` text;--> statement-breakpoint
ALTER TABLE `watches` ADD `last_price_check_status` text DEFAULT '' NOT NULL;