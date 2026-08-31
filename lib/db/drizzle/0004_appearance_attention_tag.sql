ALTER TABLE "appearance_settings" ADD COLUMN "tag_text" text;--> statement-breakpoint
ALTER TABLE "appearance_settings" ADD COLUMN "tag_style" text DEFAULT 'solid' NOT NULL;
