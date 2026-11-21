CREATE TABLE IF NOT EXISTS `mcp_stats_daily` (
	`day` text NOT NULL,
	`dimension` text NOT NULL,
	`value` text NOT NULL,
	`calls` integer DEFAULT 0 NOT NULL,
	`errors` integer DEFAULT 0 NOT NULL,
	`cache_hits` integer DEFAULT 0 NOT NULL,
	`latency_sum_ms` integer DEFAULT 0 NOT NULL,
	`latency_max_ms` integer DEFAULT 0 NOT NULL,
	`response_bytes` integer DEFAULT 0 NOT NULL,
	`unique_clients` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`day`, `dimension`, `value`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_mcp_stats_daily_dimension` ON `mcp_stats_daily` (`dimension`,`day`);
