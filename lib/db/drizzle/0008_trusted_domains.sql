ALTER TABLE "agents" ADD COLUMN "trusted_domains" jsonb NOT NULL DEFAULT '[]'::jsonb;
