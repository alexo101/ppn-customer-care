UPDATE "agent_conversation_settings"
SET "auto_close_after_minutes" = "warning_after_minutes",
    "auto_close_message" = "warning_message",
    "warning_after_minutes" =
      CASE
        WHEN "warning_after_minutes" > 1
        THEN FLOOR("warning_after_minutes" / 2.0)::integer
        ELSE 0
      END,
    "warning_message" = ''
WHERE "auto_close_after_minutes" = 0
  AND "warning_after_minutes" > 0;
