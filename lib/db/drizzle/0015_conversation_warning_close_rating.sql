ALTER TABLE "agent_conversation_settings"
  ADD COLUMN "warning_after_minutes" integer NOT NULL DEFAULT 0,
  ADD COLUMN "warning_message" text NOT NULL DEFAULT '',
  ADD COLUMN "auto_close_after_minutes" integer NOT NULL DEFAULT 60,
  ADD COLUMN "auto_close_message" text NOT NULL DEFAULT '';

UPDATE "agent_conversation_settings"
SET "warning_after_minutes" =
  CASE
    WHEN (("auto_close_days" * 24 * 60) +
          ("auto_close_hours" * 60) +
          "auto_close_minutes") > 1
    THEN ((("auto_close_days" * 24 * 60) +
           ("auto_close_hours" * 60) +
           "auto_close_minutes") / 2)
    ELSE 0
  END,
  "warning_message" = '',
  "auto_close_after_minutes" =
    ("auto_close_days" * 24 * 60) +
    ("auto_close_hours" * 60) +
    "auto_close_minutes",
  "auto_close_message" = "closing_message";

ALTER TABLE "agent_conversation_settings"
  DROP COLUMN "auto_close_days",
  DROP COLUMN "auto_close_hours",
  DROP COLUMN "auto_close_minutes",
  DROP COLUMN "closing_message";

ALTER TABLE "conversations"
  ADD COLUMN "conversation_rating" text,
  ADD COLUMN "conversation_rating_at" timestamp with time zone;
