export function isAutoClosedConversation(metadata: unknown): boolean {
  return Boolean(
    metadata &&
      typeof metadata === "object" &&
      !Array.isArray(metadata) &&
      (metadata as { autoClosed?: unknown }).autoClosed === true,
  );
}
