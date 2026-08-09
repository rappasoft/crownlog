CREATE TABLE `brand_discoveries` (
	`id` text PRIMARY KEY NOT NULL,
	`brand_id` text NOT NULL,
	`name` text NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`image_url` text DEFAULT '' NOT NULL,
	`price_cents` integer,
	`currency` text DEFAULT 'USD' NOT NULL,
	`source_url` text NOT NULL,
	`canonical_url` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_brand_discoveries_brand` ON `brand_discoveries` (`brand_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_brand_discoveries_brand_url` ON `brand_discoveries` (`brand_id`,`canonical_url`);