import { Router, type IRouter } from "express";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  organizationConnectionsTable,
  organizationMembershipsTable,
  organizationsTable,
  teamConnectionsTable,
  teamMembershipsTable,
  teamsTable,
  knowledgeSourcesTable,
  teamSourceGrantsTable,
  agentSourceAssignmentsTable,
  agentsTable,
} from "@workspace/db";
import { requireAuth, requireTenant } from "../middlewares/requireAuth";
import { canManage, ensureDefaultTenant, getTenantContext } from "../lib/tenant";
import { decryptSecret, encryptSecret } from "../lib/connection-secrets";

const router: IRouter = Router();
const uuid = z.string().uuid();
const connectionBody = z.object({
  name: z.string().trim().min(1).max(120),
  provider: z.string().trim().min(1).max(50),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  tokenExpiresAt: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

async function organizationForUser(userId: string, organizationId: string) {
  const [row] = await db
    .select({ organization: organizationsTable, role: organizationMembershipsTable.role })
    .from(organizationMembershipsTable)
    .innerJoin(organizationsTable, eq(organizationsTable.id, organizationMembershipsTable.organizationId))
    .where(and(eq(organizationMembershipsTable.userId, userId), eq(organizationsTable.id, organizationId)))
    .limit(1);
  return row;
}

async function connectionForUser(userId: string, connectionId: string) {
  const [row] = await db
    .select({ connection: organizationConnectionsTable, role: organizationMembershipsTable.role })
    .from(organizationConnectionsTable)
    .innerJoin(
      organizationMembershipsTable,
      and(
        eq(organizationMembershipsTable.organizationId, organizationConnectionsTable.organizationId),
        eq(organizationMembershipsTable.userId, userId),
      ),
    )
    .where(eq(organizationConnectionsTable.id, connectionId))
    .limit(1);
  return row;
}

function safeConnection(row: typeof organizationConnectionsTable.$inferSelect) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    provider: row.provider,
    status: row.status,
    metadata: row.metadata,
    tokenExpiresAt: row.tokenExpiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

router.get("/organizations", requireAuth, async (req, res): Promise<void> => {
  await ensureDefaultTenant(req.userId);
  const rows = await db
    .select({ organization: organizationsTable, role: organizationMembershipsTable.role })
    .from(organizationMembershipsTable)
    .innerJoin(organizationsTable, eq(organizationsTable.id, organizationMembershipsTable.organizationId))
    .where(eq(organizationMembershipsTable.userId, req.userId))
    .orderBy(desc(organizationsTable.createdAt));
  res.json(rows.map(({ organization, role }) => ({ ...organization, role })));
});

router.post("/organizations", requireAuth, async (req, res): Promise<void> => {
  const parsed = z.object({ name: z.string().trim().min(1).max(120), slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [organization] = await db.insert(organizationsTable).values({
    name: parsed.data.name,
    slug: parsed.data.slug,
    createdByUserId: req.userId,
  }).returning();
  await db.insert(organizationMembershipsTable).values({
    organizationId: organization.id,
    userId: req.userId,
    role: "owner",
  });
  res.status(201).json({ ...organization, role: "owner" });
});

router.get("/organizations/:organizationId/teams", requireAuth, async (req, res): Promise<void> => {
  const organizationId = uuid.safeParse(req.params.organizationId);
  if (!organizationId.success) {
    res.status(400).json({ error: "Invalid organization ID" });
    return;
  }
  if (!(await organizationForUser(req.userId, organizationId.data))) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }
  const rows = await db.select().from(teamsTable)
    .where(eq(teamsTable.organizationId, organizationId.data))
    .orderBy(teamsTable.name);
  res.json(rows);
});

router.post("/organizations/:organizationId/teams", requireAuth, async (req, res): Promise<void> => {
  const organizationId = uuid.safeParse(req.params.organizationId);
  const parsed = z.object({
    name: z.string().trim().min(1).max(120),
    slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/),
    productName: z.string().trim().max(120).optional(),
  }).safeParse(req.body);
  if (!organizationId.success || !parsed.success) {
    res.status(400).json({ error: "Invalid organization or team data" });
    return;
  }
  const membership = await organizationForUser(req.userId, organizationId.data);
  if (!membership || !canManage(membership.role)) {
    res.status(403).json({ error: "Organization admin access required" });
    return;
  }
  const [team] = await db.insert(teamsTable).values({
    organizationId: organizationId.data,
    name: parsed.data.name,
    slug: parsed.data.slug,
    productName: parsed.data.productName ?? "",
  }).returning();
  await db.insert(teamMembershipsTable).values({ teamId: team.id, userId: req.userId, role: "owner" });
  res.status(201).json(team);
});

router.get("/teams/:teamId", requireAuth, requireTenant, async (req, res): Promise<void> => {
  const teamId = uuid.safeParse(req.params.teamId);
  if (!teamId.success || req.tenant?.teamId !== teamId.data) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId.data)).limit(1);
  res.json(team);
});

router.patch("/teams/:teamId", requireAuth, requireTenant, async (req, res): Promise<void> => {
  const teamId = uuid.safeParse(req.params.teamId);
  const tenant = req.tenant;
  if (!teamId.success || !tenant || tenant.teamId !== teamId.data || !canManage(tenant.teamRole)) {
    res.status(403).json({ error: "Team admin access required" });
    return;
  }
  const parsed = z.object({ name: z.string().trim().min(1).max(120).optional(), productName: z.string().trim().max(120).optional() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [team] = await db.update(teamsTable).set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(teamsTable.id, teamId.data)).returning();
  res.json(team);
});

router.get("/organizations/:organizationId/connections", requireAuth, async (req, res): Promise<void> => {
  const organizationId = uuid.safeParse(req.params.organizationId);
  if (!organizationId.success || !(await organizationForUser(req.userId, organizationId.data))) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }
  const rows = await db.select().from(organizationConnectionsTable)
    .where(eq(organizationConnectionsTable.organizationId, organizationId.data))
    .orderBy(organizationConnectionsTable.name);
  res.json(rows.map(safeConnection));
});

router.post("/organizations/:organizationId/connections", requireAuth, async (req, res): Promise<void> => {
  const organizationId = uuid.safeParse(req.params.organizationId);
  const parsed = connectionBody.safeParse(req.body);
  if (!organizationId.success || !parsed.success) {
    res.status(400).json({ error: "Invalid connection data" });
    return;
  }
  const membership = await organizationForUser(req.userId, organizationId.data);
  if (!membership || !canManage(membership.role)) {
    res.status(403).json({ error: "Organization admin access required" });
    return;
  }
  if (!parsed.data.accessToken && !parsed.data.refreshToken) {
    res.status(400).json({ error: "A provider access or refresh token is required" });
    return;
  }
  const [row] = await db.insert(organizationConnectionsTable).values({
    organizationId: organizationId.data,
    name: parsed.data.name,
    provider: parsed.data.provider,
    status: "connected",
    metadata: parsed.data.metadata ?? {},
    encryptedAccessToken: parsed.data.accessToken ? encryptSecret(parsed.data.accessToken) : null,
    encryptedRefreshToken: parsed.data.refreshToken ? encryptSecret(parsed.data.refreshToken) : null,
    tokenExpiresAt: parsed.data.tokenExpiresAt ? new Date(parsed.data.tokenExpiresAt) : null,
    createdByUserId: req.userId,
  }).returning();
  res.status(201).json(safeConnection(row));
});

router.post("/organizations/:organizationId/connections/oauth/start", requireAuth, async (req, res): Promise<void> => {
  const organizationId = uuid.safeParse(req.params.organizationId);
  const parsed = z.object({ provider: z.enum(["notion", "confluence"]), teamId: uuid.optional() }).safeParse(req.body);
  if (!organizationId.success || !parsed.success) {
    res.status(400).json({ error: "Invalid OAuth request" });
    return;
  }
  const membership = await organizationForUser(req.userId, organizationId.data);
  if (!membership || !canManage(membership.role)) {
    res.status(403).json({ error: "Organization admin access required" });
    return;
  }
  const clientId = process.env[`${parsed.data.provider.toUpperCase()}_OAUTH_CLIENT_ID`];
  const authorizeUrl = process.env[`${parsed.data.provider.toUpperCase()}_OAUTH_AUTHORIZE_URL`];
  const redirectUri = process.env[`${parsed.data.provider.toUpperCase()}_OAUTH_REDIRECT_URI`];
  if (!clientId || !authorizeUrl || !redirectUri) {
    res.status(503).json({ error: `${parsed.data.provider} OAuth is not configured` });
    return;
  }
  if (!stateSecret()) {
    res.status(503).json({ error: "OAuth state signing is not configured" });
    return;
  }
  const statePayload = Buffer.from(JSON.stringify({
    organizationId: organizationId.data,
    teamId: parsed.data.teamId,
    userId: req.userId,
    nonce: randomBytes(16).toString("base64url"),
    expiresAt: Date.now() + 10 * 60 * 1000,
  })).toString("base64url");
  const state = `${statePayload}.${signState(statePayload)}`;
  const url = new URL(authorizeUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  res.json({ authorizationUrl: url.toString() });
});

router.get("/connections/oauth/callback/:provider", async (req, res): Promise<void> => {
  const provider = z.enum(["notion", "confluence"]).safeParse(req.params.provider);
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const stateValue = typeof req.query.state === "string" ? req.query.state : "";
  if (!provider.success || !code || !stateValue) {
    res.status(400).json({ error: "Invalid OAuth callback" });
    return;
  }
  const [payloadValue, signature] = stateValue.split(".");
  if (!payloadValue || !signature || !verifyState(payloadValue, signature)) {
    res.status(400).json({ error: "Invalid OAuth state" });
    return;
  }
  let state: { organizationId: string; teamId?: string; userId: string; expiresAt: number };
  try {
    state = JSON.parse(Buffer.from(payloadValue, "base64url").toString("utf8"));
  } catch {
    res.status(400).json({ error: "Invalid OAuth state" });
    return;
  }
  if (state.expiresAt < Date.now()) {
    res.status(400).json({ error: "OAuth state expired" });
    return;
  }
  const membership = await organizationForUser(state.userId, state.organizationId);
  if (!membership || !canManage(membership.role)) {
    res.status(403).json({ error: "Organization admin access required" });
    return;
  }
  if (state.teamId) {
    const teamContext = await getTenantContext(state.userId, state.teamId);
    if (!teamContext || teamContext.organizationId !== state.organizationId) {
      res.status(403).json({ error: "Invalid team context" });
      return;
    }
  }
  const prefix = provider.data.toUpperCase();
  const tokenUrl = process.env[`${prefix}_OAUTH_TOKEN_URL`];
  const clientId = process.env[`${prefix}_OAUTH_CLIENT_ID`];
  const clientSecret = process.env[`${prefix}_OAUTH_CLIENT_SECRET`];
  const redirectUri = process.env[`${prefix}_OAUTH_REDIRECT_URI`];
  if (!tokenUrl || !clientId || !clientSecret || !redirectUri) {
    res.status(503).json({ error: `${provider.data} OAuth is not configured` });
    return;
  }
  const tokenResponse = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenResponse.ok) {
    res.status(502).json({ error: `Could not connect ${provider.data}` });
    return;
  }
  const token = await tokenResponse.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
  };
  if (!token.access_token && !token.refresh_token) {
    res.status(502).json({ error: "Provider returned no usable token" });
    return;
  }
  const [connection] = await db.insert(organizationConnectionsTable).values({
    organizationId: state.organizationId,
    name: `${provider.data[0].toUpperCase()}${provider.data.slice(1)} connection`,
    provider: provider.data,
    status: "connected",
    metadata: { tokenType: token.token_type, scope: token.scope },
    encryptedAccessToken: token.access_token ? encryptSecret(token.access_token) : null,
    encryptedRefreshToken: token.refresh_token ? encryptSecret(token.refresh_token) : null,
    tokenExpiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
    createdByUserId: state.userId,
  }).returning();
  if (state.teamId) {
    await db.insert(teamConnectionsTable).values({
      teamId: state.teamId,
      connectionId: connection.id,
      enabled: true,
    });
  }
  res.redirect(`${process.env.APP_URL ?? "/"}?connection=connected`);
});

router.get("/organizations/:organizationId/members", requireAuth, async (req, res): Promise<void> => {
  const organizationId = uuid.safeParse(req.params.organizationId);
  if (!organizationId.success || !(await organizationForUser(req.userId, organizationId.data))) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }
  const rows = await db.select().from(organizationMembershipsTable)
    .where(eq(organizationMembershipsTable.organizationId, organizationId.data));
  res.json(rows);
});

router.post("/connections/:connectionId/refresh", requireAuth, async (req, res): Promise<void> => {
  const connectionId = uuid.safeParse(req.params.connectionId);
  if (!connectionId.success) {
    res.status(400).json({ error: "Invalid connection ID" });
    return;
  }
  const found = await connectionForUser(req.userId, connectionId.data);
  if (!found || !canManage(found.role)) {
    res.status(404).json({ error: "Connection not found" });
    return;
  }
  if (!found.connection.encryptedRefreshToken) {
    res.status(400).json({ error: "This connection has no refresh token" });
    return;
  }
  const prefix = found.connection.provider.toUpperCase();
  const tokenUrl = process.env[`${prefix}_OAUTH_TOKEN_URL`];
  const clientId = process.env[`${prefix}_OAUTH_CLIENT_ID`];
  const clientSecret = process.env[`${prefix}_OAUTH_CLIENT_SECRET`];
  if (!tokenUrl || !clientId || !clientSecret) {
    res.status(503).json({ error: "OAuth refresh is not configured" });
    return;
  }
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: decryptSecret(found.connection.encryptedRefreshToken),
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!response.ok) {
    await db.update(organizationConnectionsTable).set({ status: "error", updatedAt: new Date() }).where(eq(organizationConnectionsTable.id, connectionId.data));
    res.status(502).json({ error: "Could not refresh provider connection" });
    return;
  }
  const token = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!token.access_token) {
    res.status(502).json({ error: "Provider returned no access token" });
    return;
  }
  const [updated] = await db.update(organizationConnectionsTable).set({
    status: "connected",
    encryptedAccessToken: encryptSecret(token.access_token),
    encryptedRefreshToken: token.refresh_token ? encryptSecret(token.refresh_token) : found.connection.encryptedRefreshToken,
    tokenExpiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
    updatedAt: new Date(),
  }).where(eq(organizationConnectionsTable.id, connectionId.data)).returning();
  res.json(safeConnection(updated));
});

router.delete("/connections/:connectionId", requireAuth, async (req, res): Promise<void> => {
  const connectionId = uuid.safeParse(req.params.connectionId);
  if (!connectionId.success) {
    res.status(400).json({ error: "Invalid connection ID" });
    return;
  }
  const found = await connectionForUser(req.userId, connectionId.data);
  if (!found || !canManage(found.role)) {
    res.status(404).json({ error: "Connection not found" });
    return;
  }
  await db.delete(organizationConnectionsTable).where(eq(organizationConnectionsTable.id, connectionId.data));
  res.sendStatus(204);
});

router.post("/organizations/:organizationId/members", requireAuth, async (req, res): Promise<void> => {
  const organizationId = uuid.safeParse(req.params.organizationId);
  const parsed = z.object({
    userId: z.string().trim().min(1),
    role: z.enum(["admin", "member"]).default("member"),
  }).safeParse(req.body);
  if (!organizationId.success || !parsed.success) {
    res.status(400).json({ error: "Invalid membership data" });
    return;
  }
  const membership = await organizationForUser(req.userId, organizationId.data);
  if (!membership || !canManage(membership.role)) {
    res.status(403).json({ error: "Organization admin access required" });
    return;
  }
  const [created] = await db.insert(organizationMembershipsTable).values({
    organizationId: organizationId.data,
    userId: parsed.data.userId,
    role: parsed.data.role,
  }).onConflictDoUpdate({
    target: [organizationMembershipsTable.organizationId, organizationMembershipsTable.userId],
    set: { role: parsed.data.role },
  }).returning();
  res.status(201).json(created);
});

router.patch("/organizations/:organizationId/members/:userId", requireAuth, async (req, res): Promise<void> => {
  const organizationId = uuid.safeParse(req.params.organizationId);
  const memberId = typeof req.params.userId === "string" ? req.params.userId : "";
  const parsed = z.object({ role: z.enum(["admin", "member", "owner"]) }).safeParse(req.body);
  if (!organizationId.success || !memberId || !parsed.success) {
    res.status(400).json({ error: "Invalid membership data" });
    return;
  }
  const membership = await organizationForUser(req.userId, organizationId.data);
  if (!membership || !canManage(membership.role) || (memberId === req.userId && parsed.data.role !== "owner" && membership.role === "owner")) {
    res.status(403).json({ error: "Organization admin access required" });
    return;
  }
  const [updated] = await db.update(organizationMembershipsTable).set({ role: parsed.data.role })
    .where(and(eq(organizationMembershipsTable.organizationId, organizationId.data), eq(organizationMembershipsTable.userId, memberId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Member not found" });
    return;
  }
  res.json(updated);
});

router.post("/teams/:teamId/connections/:connectionId", requireAuth, requireTenant, async (req, res): Promise<void> => {
  const teamId = uuid.safeParse(req.params.teamId);
  const connectionId = uuid.safeParse(req.params.connectionId);
  const tenant = req.tenant;
  if (!teamId.success || !connectionId.success || !tenant || tenant.teamId !== teamId.data || !canManage(tenant.teamRole)) {
    res.status(403).json({ error: "Team admin access required" });
    return;
  }
  const [connection] = await db.select().from(organizationConnectionsTable)
    .where(and(eq(organizationConnectionsTable.id, connectionId.data), eq(organizationConnectionsTable.organizationId, tenant.organizationId)))
    .limit(1);
  if (!connection) {
    res.status(404).json({ error: "Connection not found" });
    return;
  }
  const [binding] = await db.insert(teamConnectionsTable)
    .values({ teamId: teamId.data, connectionId: connectionId.data, enabled: true })
    .onConflictDoUpdate({ target: [teamConnectionsTable.teamId, teamConnectionsTable.connectionId], set: { enabled: true } })
    .returning();
  res.status(201).json(binding);
});

router.delete("/teams/:teamId/connections/:connectionId", requireAuth, requireTenant, async (req, res): Promise<void> => {
  const teamId = uuid.safeParse(req.params.teamId);
  const connectionId = uuid.safeParse(req.params.connectionId);
  const tenant = req.tenant;
  if (!teamId.success || !connectionId.success || !tenant || tenant.teamId !== teamId.data || !canManage(tenant.teamRole)) {
    res.status(403).json({ error: "Team admin access required" });
    return;
  }
  await db.delete(teamConnectionsTable).where(and(eq(teamConnectionsTable.teamId, teamId.data), eq(teamConnectionsTable.connectionId, connectionId.data)));
  res.sendStatus(204);
});

router.get("/teams/:teamId/connections", requireAuth, requireTenant, async (req, res): Promise<void> => {
  const teamId = uuid.safeParse(req.params.teamId);
  if (!teamId.success || !req.tenant || req.tenant.teamId !== teamId.data) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  const rows = await db
    .select({ binding: teamConnectionsTable, connection: organizationConnectionsTable })
    .from(teamConnectionsTable)
    .innerJoin(organizationConnectionsTable, eq(organizationConnectionsTable.id, teamConnectionsTable.connectionId))
    .where(and(eq(teamConnectionsTable.teamId, teamId.data), eq(teamConnectionsTable.enabled, true)));
  res.json(rows.map(({ binding, connection }) => ({ ...safeConnection(connection), enabled: binding.enabled })));
});

router.get("/teams/:teamId/sources", requireAuth, requireTenant, async (req, res): Promise<void> => {
  const teamId = uuid.safeParse(req.params.teamId);
  if (!teamId.success || !req.tenant || req.tenant.teamId !== teamId.data) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  const rows = await db.select({ source: knowledgeSourcesTable })
    .from(teamSourceGrantsTable)
    .innerJoin(knowledgeSourcesTable, eq(knowledgeSourcesTable.id, teamSourceGrantsTable.sourceId))
    .where(and(eq(teamSourceGrantsTable.teamId, teamId.data), eq(knowledgeSourcesTable.isEnabled, true)));
  res.json(rows.map(({ source }) => ({
    id: source.id,
    name: source.name,
    sourceType: source.sourceType,
    connectionConfig: source.connectionConfig,
    isEnabled: source.isEnabled,
  })));
});

router.post("/teams/:teamId/sources/:sourceId", requireAuth, requireTenant, async (req, res): Promise<void> => {
  const teamId = uuid.safeParse(req.params.teamId);
  const sourceId = uuid.safeParse(req.params.sourceId);
  const tenant = req.tenant;
  if (!teamId.success || !sourceId.success || !tenant || tenant.teamId !== teamId.data || !canManage(tenant.teamRole)) {
    res.status(403).json({ error: "Team admin access required" });
    return;
  }
  const [source] = await db.select().from(knowledgeSourcesTable)
    .where(and(eq(knowledgeSourcesTable.id, sourceId.data), eq(knowledgeSourcesTable.organizationId, tenant.organizationId)))
    .limit(1);
  if (!source) {
    res.status(404).json({ error: "Source not found" });
    return;
  }
  const [grant] = await db.insert(teamSourceGrantsTable)
    .values({ teamId: teamId.data, sourceId: sourceId.data })
    .onConflictDoNothing()
    .returning();
  res.status(201).json(grant ?? { teamId: teamId.data, sourceId: sourceId.data });
});

router.delete("/teams/:teamId/sources/:sourceId", requireAuth, requireTenant, async (req, res): Promise<void> => {
  const teamId = uuid.safeParse(req.params.teamId);
  const sourceId = uuid.safeParse(req.params.sourceId);
  const tenant = req.tenant;
  if (!teamId.success || !sourceId.success || !tenant || tenant.teamId !== teamId.data || !canManage(tenant.teamRole)) {
    res.status(403).json({ error: "Team admin access required" });
    return;
  }
  await db.delete(teamSourceGrantsTable).where(and(eq(teamSourceGrantsTable.teamId, teamId.data), eq(teamSourceGrantsTable.sourceId, sourceId.data)));
  res.sendStatus(204);
});

router.post("/agents/:agentId/sources/:sourceId", requireAuth, requireTenant, async (req, res): Promise<void> => {
  const agentId = uuid.safeParse(req.params.agentId);
  const sourceId = uuid.safeParse(req.params.sourceId);
  const tenant = req.tenant;
  if (!agentId.success || !sourceId.success || !tenant) {
    res.status(400).json({ error: "Invalid assignment" });
    return;
  }
  const [agent] = await db.select().from(agentsTable)
    .where(and(eq(agentsTable.id, agentId.data), eq(agentsTable.teamId, tenant.teamId), eq(agentsTable.userId, req.userId)))
    .limit(1);
  const [grant] = await db.select().from(teamSourceGrantsTable)
    .where(and(eq(teamSourceGrantsTable.teamId, tenant.teamId), eq(teamSourceGrantsTable.sourceId, sourceId.data)))
    .limit(1);
  if (!agent || !grant) {
    res.status(404).json({ error: "Agent or team source grant not found" });
    return;
  }
  const [assignment] = await db.insert(agentSourceAssignmentsTable)
    .values({ agentId: agent.id, sourceId: sourceId.data })
    .onConflictDoNothing()
    .returning();
  res.status(201).json(assignment ?? { agentId: agent.id, sourceId: sourceId.data });
});

function stateSecret(): string {
  return process.env.OAUTH_STATE_SECRET ?? process.env.CONNECTION_ENCRYPTION_KEY ?? "";
}

function signState(payload: string): string {
  return createHmac("sha256", stateSecret()).update(payload).digest("base64url");
}

function verifyState(payload: string, signature: string): boolean {
  if (!stateSecret()) return false;
  const expected = Buffer.from(signState(payload));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export default router;
