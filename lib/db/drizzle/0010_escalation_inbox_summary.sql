ALTER TABLE "escalations" ADD COLUMN "ai_summary" text;--> statement-breakpoint
ALTER TABLE "escalations" ADD COLUMN "ai_summary_generated_at" timestamp with time zone;
