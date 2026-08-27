import { ExternalLink, Image as ImageIcon, Loader2 } from "lucide-react";
import {
  getGetSourceAssetUrlQueryKey,
  useGetSourceAssetUrl,
} from "@workspace/api-client-react";

type Citation = {
  sourceId?: string;
  sourceName?: string;
  chunkId?: string;
  assetId?: string;
  excerpt?: string;
};

function readCitations(metadata: unknown): Citation[] {
  if (!metadata || typeof metadata !== "object") return [];
  const citations = (metadata as { citations?: unknown }).citations;
  if (!Array.isArray(citations)) return [];
  return citations.filter(
    (citation): citation is Citation =>
      Boolean(citation) &&
      typeof citation === "object" &&
      typeof (citation as Citation).sourceName === "string",
  );
}

export function SourceCitations({ metadata }: { metadata: unknown }) {
  const citations = readCitations(metadata);
  if (citations.length === 0) return null;

  return (
    <div className="mt-2 space-y-2 border-t border-border/60 pt-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Sources
      </p>
      <div className="flex flex-wrap gap-2">
        {citations.map((citation, index) => (
          <CitationCard key={`${citation.assetId ?? citation.chunkId ?? citation.sourceId}-${index}`} citation={citation} />
        ))}
      </div>
    </div>
  );
}

function CitationCard({ citation }: { citation: Citation }) {
  const { data, isLoading } = useGetSourceAssetUrl(citation.assetId ?? "", {
    query: {
      enabled: Boolean(citation.assetId),
      queryKey: getGetSourceAssetUrlQueryKey(citation.assetId ?? ""),
    },
  });

  if (!citation.assetId) {
    return (
      <span className="rounded border border-border bg-muted/30 px-2 py-1 text-[11px]" title={citation.excerpt}>
        {citation.sourceName}
      </span>
    );
  }

  return (
    <a
      href={data?.url}
      target="_blank"
      rel="noreferrer"
      className="group flex max-w-56 items-center gap-2 rounded border border-border bg-muted/30 p-1.5 text-left hover:bg-muted"
      aria-label={`Open screenshot from ${citation.sourceName}`}
    >
      <div className="flex h-10 w-12 shrink-0 items-center justify-center overflow-hidden rounded bg-background">
        {data?.url ? (
          <img src={data.url} alt={citation.sourceName} className="h-full w-full object-cover" />
        ) : isLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : (
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <span className="min-w-0 text-[11px]">
        <span className="block truncate font-medium">{citation.sourceName}</span>
        <span className="flex items-center gap-1 text-muted-foreground">
          Screenshot <ExternalLink className="h-2.5 w-2.5" />
        </span>
      </span>
    </a>
  );
}
