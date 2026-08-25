import { Router, type IRouter } from "express";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  connectionsTable,
  knowledgeSourcesTable,
  agentSourceAssignmentsTable,
  agentsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
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

function safeConnection(row: typeof connectionsTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    status: row.status,
    metadata: row.metadata,
    tokenExpiresAt: row.tokenExpiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

router.get("/connections", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(connectionsTable).orderBy(connectionsTable.name);
  res.json(rows.map(safeConnection));
});

router.post("/connections", requireAuth, async (req, res): Promise<void> => {
  const parsed = connectionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid connection data" });
    return;
  }
  if (!parsed.data.accessToken && !parsed.data.refreshToken) {
    res.status(400).json({ error: "A provider access or refresh token is required" });
    return;
  }
  const [existing] = await db
    .select({ id: connectionsTable.id })
    .from(connectionsTable)
    .where(eq(connectionsTable.provider, parsed.data.provider))
    .limit(1);
  if (existing) {
    res.status(409).json({ error: `A ${parsed.data.provider} connection already exists` });
    return;
  }
  const [row] = await db.insert(connectionsTable).values({
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

router.post("/connections/oauth/start", requireAuth, async (req, res): Promise<void> => {
  const parsed = z.object({ provider: z.enum(["notion", "confluence"]) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid OAuth request" });
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
    userId: req.userId,
    provider: parsed.data.provider,
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
  let state: { userId: string; provider?: string; expiresAt: number };
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
  const [existing] = await db
    .select()
    .from(connectionsTable)
    .where(eq(connectionsTable.provider, provider.data))
    .limit(1);
  let connection;
  if (existing) {
    [connection] = await db.update(connectionsTable).set({
      name: `${provider.data[0].toUpperCase()}${provider.data.slice(1)} connection`,
      status: "connected",
      metadata: { tokenType: token.token_type, scope: token.scope },
      encryptedAccessToken: token.access_token ? encryptSecret(token.access_token) : null,
      encryptedRefreshToken: token.refresh_token ? encryptSecret(token.refresh_token) : existing.encryptedRefreshToken,
      tokenExpiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
      updatedAt: new Date(),
    }).where(eq(connectionsTable.id, existing.id)).returning();
  } else {
    [connection] = await db.insert(connectionsTable).values({
      name: `${provider.data[0].toUpperCase()}${provider.data.slice(1)} connection`,
      provider: provider.data,
      status: "connected",
      metadata: { tokenType: token.token_type, scope: token.scope },
      encryptedAccessToken: token.access_token ? encryptSecret(token.access_token) : null,
      encryptedRefreshToken: token.refresh_token ? encryptSecret(token.refresh_token) : null,
      tokenExpiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
      createdByUserId: state.userId,
    }).returning();
  }
  void connection;
  res.redirect(`${process.env.APP_URL ?? "/"}?connection=connected`);
});

router.post("/connections/:connectionId/refresh", requireAuth, async (req, res): Promise<void> => {
  const connectionId = uuid.safeParse(req.params.connectionId);
  if (!connectionId.success) {
    res.status(400).json({ error: "Invalid connection ID" });
    return;
  }
  const [found] = await db
    .select()
    .from(connectionsTable)
    .where(eq(connectionsTable.id, connectionId.data))
    .limit(1);
  if (!found) {
    res.status(404).json({ error: "Connection not found" });
    return;
  }
  if (!found.encryptedRefreshToken) {
    res.status(400).json({ error: "This connection has no refresh token" });
    return;
  }
  const prefix = found.provider.toUpperCase();
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
      refresh_token: decryptSecret(found.encryptedRefreshToken),
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!response.ok) {
    await db.update(connectionsTable).set({ status: "error", updatedAt: new Date() }).where(eq(connectionsTable.id, connectionId.data));
    res.status(502).json({ error: "Could not refresh provider connection" });
    return;
  }
  const token = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!token.access_token) {
    res.status(502).json({ error: "Provider returned no access token" });
    return;
  }
  const [updated] = await db.update(connectionsTable).set({
    status: "connected",
    encryptedAccessToken: encryptSecret(token.access_token),
    encryptedRefreshToken: token.refresh_token ? encryptSecret(token.refresh_token) : found.encryptedRefreshToken,
    tokenExpiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
    updatedAt: new Date(),
  }).where(eq(connectionsTable.id, connectionId.data)).returning();
  res.json(safeConnection(updated));
});

router.delete("/connections/:connectionId", requireAuth, async (req, res): Promise<void> => {
  const connectionId = uuid.safeParse(req.params.connectionId);
  if (!connectionId.success) {
    res.status(400).json({ error: "Invalid connection ID" });
    return;
  }
  const [found] = await db
    .select({ id: connectionsTable.id })
    .from(connectionsTable)
    .where(eq(connectionsTable.id, connectionId.data))
    .limit(1);
  if (!found) {
    res.status(404).json({ error: "Connection not found" });
    return;
  }
  await db.delete(connectionsTable).where(eq(connectionsTable.id, connectionId.data));
  res.sendStatus(204);
});

router.post("/agents/:agentId/sources/:sourceId", requireAuth, async (req, res): Promise<void> => {
  const agentId = uuid.safeParse(req.params.agentId);
  const sourceId = uuid.safeParse(req.params.sourceId);
  if (!agentId.success || !sourceId.success) {
    res.status(400).json({ error: "Invalid assignment" });
    return;
  }
  const [agent] = await db.select().from(agentsTable)
    .where(eq(agentsTable.id, agentId.data))
    .limit(1);
  const [source] = await db.select().from(knowledgeSourcesTable)
    .where(eq(knowledgeSourcesTable.id, sourceId.data))
    .limit(1);
  if (!agent || !source) {
    res.status(404).json({ error: "Agent or source not found" });
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
