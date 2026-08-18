import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, appearanceSettingsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import {
  UpdateAppearanceBody,
  ImportAppearanceBody,
} from "@workspace/api-zod";
import {
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_CTA_COLOR,
  ImportError,
  importWebsiteStyles,
  normalizeHttpUrl,
} from "../lib/importWebsiteStyles";

const HEX_COLOR = /^#([0-9A-Fa-f]{6})$/;
const MAX_LOGO_CHARS = 900_000;

const router: IRouter = Router();

router.get("/appearance", requireAuth, async (req, res): Promise<void> => {
  const row = await getOrCreateAppearance(req.userId);
  res.json(toAppearance(row));
});

router.put("/appearance", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateAppearanceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (parsed.data.websiteUrl !== undefined) {
    if (parsed.data.websiteUrl === null || parsed.data.websiteUrl.trim() === "") {
      updates.websiteUrl = null;
    } else {
      try {
        updates.websiteUrl = normalizeHttpUrl(parsed.data.websiteUrl);
      } catch (err) {
        res.status(400).json({ error: err instanceof ImportError ? err.message : "Invalid website URL." });
        return;
      }
    }
  }

  if (parsed.data.ctaColor !== undefined) {
    const hex = normalizeHexColor(parsed.data.ctaColor);
    if (!hex) {
      res.status(400).json({ error: "CTA color must be a hex value like #0EA5E9." });
      return;
    }
    updates.ctaColor = hex;
  }

  if (parsed.data.backgroundColor !== undefined) {
    const hex = normalizeHexColor(parsed.data.backgroundColor);
    if (!hex) {
      res.status(400).json({ error: "Background color must be a hex value like #F8FAFC." });
      return;
    }
    updates.backgroundColor = hex;
  }

  if (parsed.data.logoUrl !== undefined) {
    const logoError = validateLogo(parsed.data.logoUrl);
    if (logoError) {
      res.status(400).json({ error: logoError });
      return;
    }
    updates.logoUrl = parsed.data.logoUrl === "" ? null : parsed.data.logoUrl;
  }

  const [row] = await db
    .insert(appearanceSettingsTable)
    .values({
      userId: req.userId,
      websiteUrl: (updates.websiteUrl as string | null | undefined) ?? null,
      ctaColor: (updates.ctaColor as string | undefined) ?? DEFAULT_CTA_COLOR,
      backgroundColor: (updates.backgroundColor as string | undefined) ?? DEFAULT_BACKGROUND_COLOR,
      logoUrl: (updates.logoUrl as string | null | undefined) ?? null,
    })
    .onConflictDoUpdate({
      target: appearanceSettingsTable.userId,
      set: updates,
    })
    .returning();

  res.json(toAppearance(row));
});

router.post("/appearance/import", requireAuth, async (req, res): Promise<void> => {
  const parsed = ImportAppearanceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const imported = await importWebsiteStyles(parsed.data.url);
    const importedAt = new Date();

    const [row] = await db
      .insert(appearanceSettingsTable)
      .values({
        userId: req.userId,
        websiteUrl: imported.websiteUrl,
        ctaColor: imported.ctaColor,
        backgroundColor: imported.backgroundColor,
        logoUrl: imported.logoUrl,
        importedAt,
      })
      .onConflictDoUpdate({
        target: appearanceSettingsTable.userId,
        set: {
          websiteUrl: imported.websiteUrl,
          ctaColor: imported.ctaColor,
          backgroundColor: imported.backgroundColor,
          logoUrl: imported.logoUrl,
          importedAt,
          updatedAt: importedAt,
        },
      })
      .returning();

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
});

async function getOrCreateAppearance(userId: string) {
  const existing = await db
    .select()
    .from(appearanceSettingsTable)
    .where(eq(appearanceSettingsTable.userId, userId))
    .limit(1);

  if (existing[0]) return existing[0];

  const [created] = await db
    .insert(appearanceSettingsTable)
    .values({ userId })
    .onConflictDoNothing()
    .returning();

  if (created) return created;

  const [row] = await db
    .select()
    .from(appearanceSettingsTable)
    .where(eq(appearanceSettingsTable.userId, userId))
    .limit(1);

  if (!row) {
    throw new Error("Failed to load appearance settings");
  }

  return row;
}

function toAppearance(row: typeof appearanceSettingsTable.$inferSelect) {
  return {
    id: row.id,
    websiteUrl: row.websiteUrl ?? null,
    ctaColor: row.ctaColor,
    backgroundColor: row.backgroundColor,
    logoUrl: row.logoUrl ?? null,
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
