ALTER TABLE "agent_conversation_settings" DROP COLUMN "ask_if_resolved";--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "nps_score" integer;
