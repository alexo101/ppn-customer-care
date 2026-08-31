ALTER TABLE "escalations" ADD COLUMN "priority" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "escalations" ADD COLUMN "assignee_member_id" uuid;--> statement-breakpoint
ALTER TABLE "escalations" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_assignee_member_id_workspace_members_id_fk" FOREIGN KEY ("assignee_member_id") REFERENCES "public"."workspace_members"("id") ON DELETE set null ON UPDATE no action;
