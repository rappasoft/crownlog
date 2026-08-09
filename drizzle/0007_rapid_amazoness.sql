ALTER TABLE `watches` ADD `market_provider` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `watches` ADD `market_model_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `watches` ADD `market_model_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `watches` ADD `market_price_cents` integer;--> statement-breakpoint
ALTER TABLE `watches` ADD `market_low_cents` integer;--> statement-breakpoint
ALTER TABLE `watches` ADD `market_high_cents` integer;--> statement-breakpoint
ALTER TABLE `watches` ADD `market_sample_size` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `watches` ADD `market_confidence` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `watches` ADD `market_currency` text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE `watches` ADD `market_checked_at` text;--> statement-breakpoint
ALTER TABLE `watches` ADD `market_check_status` text DEFAULT '' NOT NULL;