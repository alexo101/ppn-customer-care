export type PublicMessageSource = {
  id: string;
  conversationId: string;
  sender: string;
  content: string;
  metadata: unknown;
  createdAt: Date | null;
};

export function toPublicMessage(row: PublicMessageSource) {
  const metadata =
    row.metadata &&
    typeof row.metadata === "object" &&
    !Array.isArray(row.metadata)
      ? { ...(row.metadata as Record<string, unknown>) }
      : {};

  // Diagnostic codes are for server-side troubleshooting, never for customers.
  delete metadata.diagnostics;
  delete metadata.internalDiagnostics;
  delete metadata.answer_diagnostics;

  return {
    id: row.id,
    conversationId: row.conversationId,
    sender: row.sender,
    content: row.content,
    metadata,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}
