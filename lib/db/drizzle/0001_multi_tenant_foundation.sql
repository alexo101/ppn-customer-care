CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_by_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  role text NOT NULL DEFAULT 'owner',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  product_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

CREATE TABLE IF NOT EXISTS team_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);

CREATE TABLE IF NOT EXISTS organization_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  metadata jsonb NOT NULL DEFAULT '{}',
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  encryption_key_version text NOT NULL DEFAULT '1',
  created_by_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES organization_connections(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, connection_id)
);

CREATE TABLE IF NOT EXISTS team_source_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, source_id)
);

CREATE TABLE IF NOT EXISTS team_connector_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  connector_id uuid NOT NULL REFERENCES api_connectors(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, connector_id)
);

CREATE TABLE IF NOT EXISTS agent_source_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, source_id)
);

CREATE TABLE IF NOT EXISTS agent_connector_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  connector_id uuid NOT NULL REFERENCES api_connectors(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, connector_id)
);

CREATE TABLE IF NOT EXISTS agent_settings (
  agent_id uuid PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  prompt text NOT NULL DEFAULT '',
  target_audience text NOT NULL DEFAULT '',
  llm_provider text NOT NULL DEFAULT 'openai',
  llm_model text NOT NULL DEFAULT '',
  temperature text NOT NULL DEFAULT '0.2',
  configuration jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  token_prefix text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

ALTER TABLE agents ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE api_connectors ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE api_connectors ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE api_connectors ADD COLUMN IF NOT EXISTS connection_id uuid REFERENCES organization_connections(id) ON DELETE SET NULL;
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE intent_categories ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE intent_categories ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE orchestrator_rules ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE orchestrator_rules ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE audience_targets ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE audience_targets ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE training_questions ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE training_questions ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE appearance_settings ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE appearance_settings ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES teams(id) ON DELETE CASCADE;

-- Backfill one isolated organization/team per existing Clerk owner.
INSERT INTO organizations (name, slug, created_by_user_id)
SELECT 'Workspace', 'workspace-' || md5(user_id), user_id
FROM (SELECT DISTINCT user_id FROM agents WHERE user_id IS NOT NULL) owners
ON CONFLICT (slug) DO NOTHING;

INSERT INTO organization_memberships (organization_id, user_id, role)
SELECT id, created_by_user_id, 'owner' FROM organizations
ON CONFLICT (organization_id, user_id) DO NOTHING;

INSERT INTO teams (organization_id, name, slug, product_name)
SELECT id, 'Default team', 'default', 'Support'
FROM organizations
ON CONFLICT (organization_id, slug) DO NOTHING;

INSERT INTO team_memberships (team_id, user_id, role)
SELECT t.id, o.created_by_user_id, 'owner'
FROM teams t JOIN organizations o ON o.id = t.organization_id
ON CONFLICT (team_id, user_id) DO NOTHING;

UPDATE agents a
SET team_id = t.id
FROM teams t JOIN organizations o ON o.id = t.organization_id
WHERE a.team_id IS NULL AND o.created_by_user_id = a.user_id;

-- A legacy installation may contain one shared seed owner (NULL user_id).
-- It is safe to attach those rows only when exactly one organization exists;
-- multi-owner installations must be reviewed instead of silently merged.
DO $$
BEGIN
  IF (SELECT count(*) FROM organizations) = 1 THEN
    UPDATE knowledge_sources s
    SET organization_id = o.id, team_id = t.id
    FROM organizations o JOIN teams t ON t.organization_id = o.id
    WHERE s.team_id IS NULL AND s.user_id IS NULL AND t.slug = 'default';
    UPDATE api_connectors c
    SET organization_id = o.id, team_id = t.id
    FROM organizations o JOIN teams t ON t.organization_id = o.id
    WHERE c.team_id IS NULL AND c.user_id IS NULL AND t.slug = 'default';
  ELSIF EXISTS (SELECT 1 FROM knowledge_sources WHERE user_id IS NULL AND team_id IS NULL)
     OR EXISTS (SELECT 1 FROM api_connectors WHERE user_id IS NULL AND team_id IS NULL) THEN
    RAISE EXCEPTION 'Tenant migration incomplete: shared resources need an explicit organization owner';
  END IF;
END $$;

UPDATE conversations c
SET organization_id = t.organization_id, team_id = a.team_id
FROM agents a JOIN teams t ON t.id = a.team_id
WHERE c.agent_id = a.id AND (c.team_id IS NULL OR c.organization_id IS NULL);

UPDATE knowledge_sources s
SET organization_id = t.organization_id, team_id = a.team_id
FROM agents a JOIN teams t ON t.id = a.team_id
WHERE s.agent_id = a.id AND (s.team_id IS NULL OR s.organization_id IS NULL);

UPDATE api_connectors c
SET organization_id = t.organization_id, team_id = a.team_id
FROM agents a JOIN teams t ON t.id = a.team_id
WHERE c.agent_id = a.id AND (c.team_id IS NULL OR c.organization_id IS NULL);

UPDATE intent_categories c
SET organization_id = t.organization_id, team_id = a.team_id
FROM agents a JOIN teams t ON t.id = a.team_id
WHERE c.agent_id = a.id AND (c.team_id IS NULL OR c.organization_id IS NULL);

UPDATE orchestrator_rules r
SET organization_id = t.organization_id, team_id = a.team_id
FROM agents a JOIN teams t ON t.id = a.team_id
WHERE r.agent_id = a.id AND (r.team_id IS NULL OR r.organization_id IS NULL);

UPDATE audience_targets target
SET organization_id = t.organization_id, team_id = a.team_id
FROM agents a JOIN teams t ON t.id = a.team_id
WHERE target.agent_id = a.id AND (target.team_id IS NULL OR target.organization_id IS NULL);

UPDATE training_questions q
SET organization_id = t.organization_id, team_id = a.team_id
FROM agents a JOIN teams t ON t.id = a.team_id
WHERE q.agent_id = a.id AND (q.team_id IS NULL OR q.organization_id IS NULL);

UPDATE appearance_settings s
SET organization_id = t.organization_id, team_id = a.team_id
FROM agents a JOIN teams t ON t.id = a.team_id
WHERE s.agent_id = a.id AND (s.team_id IS NULL OR s.organization_id IS NULL);

-- Preserve existing Replit connection identities as organization connections.
-- Their external credentials remain outside the database until an admin
-- completes the managed OAuth connection flow.
INSERT INTO organization_connections (
  organization_id, name, provider, status, metadata, created_by_user_id
)
SELECT DISTINCT
  s.organization_id,
  coalesce(s.connection_config->>'connectorName', s.source_type) || ' migrated connection',
  s.source_type,
  'pending',
  jsonb_build_object('legacyConnectionId', s.connection_config->>'connectionId'),
  coalesce(s.user_id, o.created_by_user_id)
FROM knowledge_sources s
JOIN organizations o ON o.id = s.organization_id
WHERE s.organization_id IS NOT NULL
  AND s.source_type IN ('notion', 'confluence')
  AND s.connection_config->>'connectionId' IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM organization_connections c
    WHERE c.organization_id = s.organization_id
      AND c.provider = s.source_type
      AND c.metadata->>'legacyConnectionId' = s.connection_config->>'connectionId'
  );

INSERT INTO team_connections (team_id, connection_id, enabled)
SELECT s.team_id, c.id, false
FROM knowledge_sources s
JOIN organization_connections c
  ON c.organization_id = s.organization_id
 AND c.provider = s.source_type
 AND c.metadata->>'legacyConnectionId' = s.connection_config->>'connectionId'
WHERE s.team_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Existing agent-bound resources become explicit team grants/assignments.
INSERT INTO team_source_grants (team_id, source_id)
SELECT s.team_id, s.id FROM knowledge_sources s
WHERE s.team_id IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO team_connector_grants (team_id, connector_id)
SELECT c.team_id, c.id FROM api_connectors c
WHERE c.team_id IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO agent_source_assignments (agent_id, source_id)
SELECT s.agent_id, s.id FROM knowledge_sources s
WHERE s.agent_id IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO agent_connector_assignments (agent_id, connector_id)
SELECT c.agent_id, c.id FROM api_connectors c
WHERE c.agent_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO agent_settings (agent_id)
SELECT id FROM agents
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM agents WHERE team_id IS NULL) THEN
    RAISE EXCEPTION 'Tenant migration incomplete: one or more agents have no team';
  END IF;
  IF EXISTS (SELECT 1 FROM knowledge_sources WHERE user_id IS NOT NULL AND team_id IS NULL) THEN
    RAISE EXCEPTION 'Tenant migration incomplete: one or more sources have no team';
  END IF;
  IF EXISTS (SELECT 1 FROM api_connectors WHERE user_id IS NOT NULL AND team_id IS NULL) THEN
    RAISE EXCEPTION 'Tenant migration incomplete: one or more connectors have no team';
  END IF;
  IF EXISTS (SELECT 1 FROM intent_categories WHERE agent_id IS NOT NULL AND team_id IS NULL)
     OR EXISTS (SELECT 1 FROM orchestrator_rules WHERE agent_id IS NOT NULL AND team_id IS NULL)
     OR EXISTS (SELECT 1 FROM audience_targets WHERE agent_id IS NOT NULL AND team_id IS NULL)
     OR EXISTS (SELECT 1 FROM training_questions WHERE agent_id IS NOT NULL AND team_id IS NULL)
     OR EXISTS (SELECT 1 FROM appearance_settings WHERE agent_id IS NOT NULL AND team_id IS NULL) THEN
    RAISE EXCEPTION 'Tenant migration incomplete: one or more agent resources have no team';
  END IF;
END $$;

UPDATE knowledge_chunks c
SET organization_id = s.organization_id, team_id = s.team_id
FROM knowledge_sources s
WHERE c.source_id = s.id AND (c.team_id IS NULL OR c.organization_id IS NULL);

CREATE INDEX IF NOT EXISTS organization_memberships_user_idx ON organization_memberships(user_id);
CREATE INDEX IF NOT EXISTS teams_organization_idx ON teams(organization_id);
CREATE INDEX IF NOT EXISTS team_memberships_user_idx ON team_memberships(user_id);
CREATE INDEX IF NOT EXISTS agents_team_idx ON agents(team_id);
CREATE INDEX IF NOT EXISTS conversations_team_idx ON conversations(team_id);
CREATE INDEX IF NOT EXISTS knowledge_sources_team_idx ON knowledge_sources(team_id);
CREATE INDEX IF NOT EXISTS api_connectors_team_idx ON api_connectors(team_id);
CREATE INDEX IF NOT EXISTS knowledge_chunks_team_idx ON knowledge_chunks(team_id);
