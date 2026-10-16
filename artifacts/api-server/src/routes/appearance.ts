import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, appearanceSettingsTable } from "@workspace/db";
import { requireAuth, requireEditor } from "../middlewares/requireAuth";
import {
  UpdateAppearanceBody,
  ImportAppearanceBody,
  GetAgentAppearanceParams,
  UpdateAgentAppearanceParams,
  UpdateAgentAppearanceBody,
  ImportAgentAppearanceParams,
  ImportAgentAppearanceBody,
} from "@workspace/api-zod";
import {
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_CTA_COLOR,
  ImportError,
  importWebsiteStyles,
  normalizeHttpUrl,
} from "../lib/importWebsiteStyles";
import { ensureDefaultAgentIfNeeded, getOwnedAgent } from "../lib/agents";

const HEX_COLOR = /^#([0-9A-Fa-f]{6})$/;
const MAX_LOGO_CHARS = 900_000;
const MAX_TAG_CHARS = 20;
const DEFAULT_TAG_STYLE = "solid";
const TAG_STYLES = new Set(["solid", "outline", "soft"]);

const router: IRouter = Router();

router.get("/appearance", requireAuth, async (req, res): Promise<void> => {
  const defaultAgent = await ensureDefaultAgentIfNeeded(req.userId);
  const row = await getOrCreateAppearance(req.userId, defaultAgent?.id ?? null);
  res.json(toAppearance(row));
});

router.put("/appearance", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const parsed = UpdateAppearanceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const defaultAgent = await ensureDefaultAgentIfNeeded(req.userId);
  const row = await applyAppearanceUpdate(req.userId, defaultAgent?.id ?? null, parsed.data, res);
  if (row) res.json(toAppearance(row));
});

router.post("/appearance/import", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const parsed = ImportAppearanceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const defaultAgent = await ensureDefaultAgentIfNeeded(req.userId);
  await importAppearanceFor(req.userId, defaultAgent?.id ?? null, parsed.data.url, res);
});

router.get("/agents/:id/appearance", requireAuth, async (req, res): Promise<void> => {
  const params = GetAgentAppearanceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const agent = await getOwnedAgent(req.userId, params.data.id);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  const row = await getOrCreateAppearance(req.userId, agent.id);
  res.json(toAppearance(row));
});

router.put("/agents/:id/appearance", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const params = UpdateAgentAppearanceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateAgentAppearanceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const agent = await getOwnedAgent(req.userId, params.data.id);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  const row = await applyAppearanceUpdate(req.userId, agent.id, parsed.data, res);
  if (row) res.json(toAppearance(row));
});

router.post("/agents/:id/appearance/import", requireAuth, requireEditor, async (req, res): Promise<void> => {
  const params = ImportAgentAppearanceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = ImportAgentAppearanceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const agent = await getOwnedAgent(req.userId, params.data.id);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  await importAppearanceFor(req.userId, agent.id, parsed.data.url, res);
});

async function applyAppearanceUpdate(
  userId: string,
  agentId: string | null,
  data: {
    websiteUrl?: string | null;
    ctaColor?: string;
    backgroundColor?: string;
    logoUrl?: string | null;
    communicationLanguage?: string;
    tagText?: string | null;
    tagStyle?: string;
  },
  res: { status: (n: number) => { json: (b: unknown) => void } },
) {
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (data.websiteUrl !== undefined) {
    if (data.websiteUrl === null || data.websiteUrl.trim() === "") {
      updates.websiteUrl = null;
    } else {
      try {
        updates.websiteUrl = normalizeHttpUrl(data.websiteUrl);
      } catch (err) {
        res.status(400).json({ error: err instanceof ImportError ? err.message : "Invalid website URL." });
        return null;
      }
    }
  }

  if (data.ctaColor !== undefined) {
    const hex = normalizeHexColor(data.ctaColor);
    if (!hex) {
      res.status(400).json({ error: "CTA color must be a hex value like #0EA5E9." });
      return null;
    }
    updates.ctaColor = hex;
  }

  if (data.backgroundColor !== undefined) {
    const hex = normalizeHexColor(data.backgroundColor);
    if (!hex) {
      res.status(400).json({ error: "Background color must be a hex value like #F8FAFC." });
      return null;
    }
    updates.backgroundColor = hex;
  }

  if (data.logoUrl !== undefined) {
    const logoError = validateLogo(data.logoUrl);
    if (logoError) {
      res.status(400).json({ error: logoError });
      return null;
    }
    updates.logoUrl = data.logoUrl === "" ? null : data.logoUrl;
  }

  if (data.communicationLanguage !== undefined) {
    updates.communicationLanguage = data.communicationLanguage;
  }

  if (data.tagText !== undefined) {
    if (data.tagText === null || data.tagText.trim() === "") {
      updates.tagText = null;
    } else {
      const tagText = data.tagText.trim();
      if (tagText.length > MAX_TAG_CHARS) {
        res.status(400).json({ error: `Tag text must be ${MAX_TAG_CHARS} characters or fewer.` });
        return null;
      }
      updates.tagText = tagText;
    }
  }

  if (data.tagStyle !== undefined) {
    if (!TAG_STYLES.has(data.tagStyle)) {
      res.status(400).json({ error: "Tag style must be solid, outline, or soft." });
      return null;
    }
    updates.tagStyle = data.tagStyle;
  }

  return upsertAppearance(userId, agentId, updates);
}

async function importAppearanceFor(
  userId: string,
  agentId: string | null,
  url: string,
  res: { status: (n: number) => { json: (b: unknown) => void }; json: (b: unknown) => void },
) {
  try {
    const imported = await importWebsiteStyles(url);
    const importedAt = new Date();
    const row = await upsertAppearance(userId, agentId, {
      websiteUrl: imported.websiteUrl,
      ctaColor: imported.ctaColor,
      backgroundColor: imported.backgroundColor,
      logoUrl: imported.logoUrl,
      importedAt,
      updatedAt: importedAt,
    });
    res.json({
      appearance: toAppearance(row),
      pageTitle: imported.pageTitle,
      ctaColorCandidates: imported.ctaColorCandidates,
      backgroundColorCandidates: imported.backgroundColorCandidates,
      logoCandidates: imported.logoCandidates,
    });
  } catch (err) {
    const message = err instanceof ImportError ? err.message : "Could not import styling from that website.";
    res.status(400).json({ error: message });
  }
}

async function getOrCreateAppearance(userId: string, agentId: string | null) {
  const existing = await findAppearance(userId, agentId);
  if (existing) return existing;

  const [created] = await db
    .insert(appearanceSettingsTable)
    .values({
      userId,
      agentId,
      ctaColor: DEFAULT_CTA_COLOR,
      backgroundColor: DEFAULT_BACKGROUND_COLOR,
    })
    .returning();

  return created;
}

async function findAppearance(userId: string, agentId: string | null) {
  if (agentId) {
    const [row] = await db
      .select()
      .from(appearanceSettingsTable)
      .where(and(eq(appearanceSettingsTable.userId, userId), eq(appearanceSettingsTable.agentId, agentId)))
      .limit(1);
    return row ?? null;
  }

  const [row] = await db
    .select()
    .from(appearanceSettingsTable)
    .where(eq(appearanceSettingsTable.userId, userId))
    .limit(1);
  return row ?? null;
}

async function upsertAppearance(userId: string, agentId: string | null, updates: Record<string, unknown>) {
  const existing = await findAppearance(userId, agentId);
  if (existing) {
    const [row] = await db
      .update(appearanceSettingsTable)
      .set(updates)
      .where(eq(appearanceSettingsTable.id, existing.id))
      .returning();
    return row;
  }

  const [created] = await db
    .insert(appearanceSettingsTable)
    .values(buildAppearanceInsertValues(userId, agentId, updates))
    .returning();
  return created;
}

export function buildAppearanceInsertValues(
  userId: string,
  agentId: string | null,
  updates: Record<string, unknown>,
) {
  return {
    userId,
    agentId,
    websiteUrl: (updates.websiteUrl as string | null | undefined) ?? null,
    ctaColor: (updates.ctaColor as string | undefined) ?? DEFAULT_CTA_COLOR,
    backgroundColor: (updates.backgroundColor as string | undefined) ?? DEFAULT_BACKGROUND_COLOR,
    logoUrl: (updates.logoUrl as string | null | undefined) ?? null,
    communicationLanguage:
      (updates.communicationLanguage as string | undefined) ?? "en",
    tagText: (updates.tagText as string | null | undefined) ?? null,
    tagStyle: (updates.tagStyle as string | undefined) ?? DEFAULT_TAG_STYLE,
    importedAt: (updates.importedAt as Date | undefined) ?? null,
  };
}

export function toAppearance(row: typeof appearanceSettingsTable.$inferSelect) {
  return {
    id: row.id,
    websiteUrl: row.websiteUrl ?? null,
    ctaColor: row.ctaColor,
    backgroundColor: row.backgroundColor,
    logoUrl: row.logoUrl ?? null,
    communicationLanguage: row.communicationLanguage,
    tagText: row.tagText ?? null,
    tagStyle: TAG_STYLES.has(row.tagStyle) ? row.tagStyle : DEFAULT_TAG_STYLE,
    importedAt: row.importedAt?.toISOString() ?? null,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  if (!HEX_COLOR.test(trimmed)) return null;
  return trimmed.toUpperCase();
}

function validateLogo(value: string | null): string | null {
  if (value === null || value === "") return null;
  if (value.length > MAX_LOGO_CHARS) return "Logo is too large. Use a smaller image or a URL.";
  if (value.startsWith("data:image/")) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "Logo must be an image URL or an uploaded image.";
    }
    return null;
  } catch {
    return "Logo must be an image URL or an uploaded image.";
  }
}

export default router;
