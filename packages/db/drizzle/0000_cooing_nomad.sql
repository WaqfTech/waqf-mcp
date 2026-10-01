CREATE TABLE `mcp_cache` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`response_payload_json` text NOT NULL,
	`hit_count` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_cache_provider_tool` ON `mcp_cache` (`provider_id`,`tool_name`);--> statement-breakpoint
CREATE INDEX `idx_cache_expires_at` ON `mcp_cache` (`expires_at`);--> statement-breakpoint
CREATE TABLE `mcp_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` text NOT NULL,
	`client_ip_hash` text NOT NULL,
	`country` text,
	`city` text,
	`region` text,
	`asn` integer,
	`colo` text,
	`user_agent` text,
	`transport_type` text NOT NULL,
	`client_app` text,
	`method` text NOT NULL,
	`tool_name` text,
	`tool_arguments_json` text,
	`upstream_provider` text,
	`is_cache_hit` integer DEFAULT false NOT NULL,
	`status_code` integer NOT NULL,
	`latency_ms` integer NOT NULL,
	`error_message` text,
	`response_size_bytes` integer
);
--> statement-breakpoint
CREATE INDEX `idx_logs_timestamp` ON `mcp_logs` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_logs_tool_name` ON `mcp_logs` (`tool_name`);--> statement-breakpoint
CREATE INDEX `idx_logs_client_app` ON `mcp_logs` (`client_app`);--> statement-breakpoint
CREATE INDEX `idx_logs_country` ON `mcp_logs` (`country`);--> statement-breakpoint
CREATE TABLE `mcp_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`submitter_name` text NOT NULL,
	`submitter_email` text NOT NULL,
	`server_name` text NOT NULL,
	`server_url` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_submissions_status` ON `mcp_submissions` (`status`);