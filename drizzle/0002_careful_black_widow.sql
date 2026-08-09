CREATE TABLE `price_history` (
	`id` text PRIMARY KEY NOT NULL,
	`watch_id` text NOT NULL,
	`price_cents` integer NOT NULL,
	`recorded_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`watch_id`) REFERENCES `watches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_price_history_watch_id` ON `price_history` (`watch_id`);--> statement-breakpoint
ALTER TABLE `watches` ADD `grail_score` integer DEFAULT 3 NOT NULL;