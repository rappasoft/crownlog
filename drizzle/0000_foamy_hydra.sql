CREATE TABLE `watches` (
	`id` text PRIMARY KEY NOT NULL,
	`brand` text NOT NULL,
	`model` text NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'wishlist' NOT NULL,
	`current_price_cents` integer,
	`target_price_cents` integer,
	`listing_url` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_watches_brand` ON `watches` (`brand`);--> statement-breakpoint
CREATE INDEX `idx_watches_status` ON `watches` (`status`);