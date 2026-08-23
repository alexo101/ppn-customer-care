export type KnowledgeItemType = "page" | "database" | "space";

export type SelectedKnowledgeItem = {
  id: string;
  type: KnowledgeItemType;
  title: string;
  parentTitle?: string;
  url?: string;
};

export type FetchedKnowledgeDocument = {
  itemId: string;
  title: string;
  text: string;
};

export type SourceBrowseItem = SelectedKnowledgeItem;

export type SourceBrowseResult = {
  items: SourceBrowseItem[];
  nextCursor: string | null;
  spaceTitle?: string;
};

export type IntegrationSyncStatus = "idle" | "syncing" | "ready" | "empty" | "error";

const ITEM_TYPES = new Set<KnowledgeItemType>(["page", "database", "space"]);

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseSelectedKnowledgeItems(value: unknown): SelectedKnowledgeItem[] {
  if (!Array.isArray(value)) return [];
  const items: SelectedKnowledgeItem[] = [];
  for (const entry of value) {
    if (!isPlainObject(entry)) continue;
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    const type = typeof entry.type === "string" ? entry.type.trim() : "";
    const title = typeof entry.title === "string" ? entry.title.trim() : "";
    if (!id || !ITEM_TYPES.has(type as KnowledgeItemType)) continue;
    items.push({
      id,
      type: type as KnowledgeItemType,
      title: title || id,
      parentTitle: typeof entry.parentTitle === "string" ? entry.parentTitle : undefined,
      url: typeof entry.url === "string" ? entry.url : undefined,
    });
  }
  return uniqueItems(items);
}

export function uniqueItems(items: SelectedKnowledgeItem[]): SelectedKnowledgeItem[] {
  const seen = new Set<string>();
  const unique: SelectedKnowledgeItem[] = [];
  for (const item of items) {
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

export function summarizeSelectedItems(items: SelectedKnowledgeItem[]): string {
  if (items.length === 0) return "No content selected";
  const titles = items.map((item) => item.title).filter(Boolean);
  if (titles.length <= 2) return titles.join(", ");
  return `${titles.slice(0, 2).join(", ")} +${titles.length - 2} more`;
}

export function joinKnowledgeDocuments(documents: FetchedKnowledgeDocument[]): string {
  return documents
    .map((document) => {
      const body = document.text.trim();
      if (!body) return "";
      return `# ${document.title}\n\n${body}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

export function readSyncStatus(config: Record<string, unknown>): IntegrationSyncStatus {
  const value = config.syncStatus;
  if (
    value === "idle" ||
    value === "syncing" ||
    value === "ready" ||
    value === "empty" ||
    value === "error"
  ) {
    return value;
  }
  return "idle";
}
