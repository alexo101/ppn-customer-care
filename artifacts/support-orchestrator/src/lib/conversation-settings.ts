export function isAwaitingAutoCloseConfirmation(metadata: unknown): boolean {
  return Boolean(
    metadata &&
      typeof metadata === "object" &&
      !Array.isArray(metadata) &&
      (metadata as { awaitingAutoCloseConfirmation?: unknown })
        .awaitingAutoCloseConfirmation === true,
  );
}
