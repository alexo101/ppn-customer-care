import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  agentDeploymentsTable,
  agentsTable,
  type MemberRole,
} from "@workspace/db";
import { hashDeploymentToken } from "../lib/connection-secrets";
import { resolveUserEmail } from "../lib/identity";
import {
  WorkspaceAccessError,
  ensureWorkspaceMember,
} from "../lib/workspace-access";

declare global {
  namespace Express {
    interface Request {
      userId: string;
      userEmail?: string;
      workspaceMemberId?: string;
      memberRole?: MemberRole;
      file?: Express.Multer.File;
    }
  }
}

async function attachWorkspaceMember(
  req: Request,
  res: Response,
  userId: string,
  emailFromSession?: string,
): Promise<boolean> {
  try {
    const email = await resolveUserEmail(userId, emailFromSession);
    const member = await ensureWorkspaceMember(userId, email);
    req.userId = userId;
    req.userEmail = member.email;
    req.workspaceMemberId = member.id;
    req.memberRole = member.role as MemberRole;
    return true;
  } catch (error) {
    if (error instanceof WorkspaceAccessError) {
      res.status(error.statusCode).json({ error: error.message });
      return false;
    }
    throw error;
  }
}

function emailFromAuth(auth: ReturnType<typeof getAuth>): string | undefined {
  const claims = (
    auth as unknown as { sessionClaims?: Record<string, unknown> }
  )?.sessionClaims;
  return typeof claims?.email === "string" ? claims.email : undefined;
}

export async function requireAuthOrDeployment(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = getAuth(req);
  if (auth?.userId) {
    const attached = await attachWorkspaceMember(
      req,
      res,
      auth.userId,
      emailFromAuth(auth),
    );
    if (attached) next();
    return;
  }
  const rawToken = req.header("x-agent-deployment-token");
  if (!rawToken) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [deployment] = await db
    .select({ agent: agentsTable, deployment: agentDeploymentsTable })
    .from(agentDeploymentsTable)
    .innerJoin(agentsTable, eq(agentsTable.id, agentDeploymentsTable.agentId))
    .where(
      and(
        eq(agentDeploymentsTable.tokenHash, hashDeploymentToken(rawToken)),
        eq(agentDeploymentsTable.isActive, true),
      ),
    )
    .limit(1);
  if (!deployment || deployment.deployment.revokedAt) {
    res.status(401).json({ error: "Invalid deployment token" });
    return;
  }
  req.userId = deployment.agent.userId;
  next();
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  res.setHeader("Cache-Control", "private, no-store");
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const attached = await attachWorkspaceMember(
    req,
    res,
    userId,
    emailFromAuth(auth),
  );
  if (attached) next();
}

export function requireEditor(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.memberRole !== "editor") {
    res
      .status(403)
      .json({ error: "You need edit access to change this workspace." });
    return;
  }
  next();
}
