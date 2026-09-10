UPDATE "escalations" SET "priority" = 'none' WHERE "priority" = 'normal';--> statement-breakpoint
ALTER TABLE "escalations" ALTER COLUMN "priority" SET DEFAULT 'none';
