ALTER TABLE "orchestrator_rules" ADD COLUMN "http_method" text DEFAULT 'GET' NOT NULL;--> statement-breakpoint
ALTER TABLE "orchestrator_rules" ADD COLUMN "endpoint_url" text DEFAULT '' NOT NULL;
