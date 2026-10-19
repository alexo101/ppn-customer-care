export type ArticleSnippet = {
  before: string;
  match: string;
  after: string;
};

const CONTEXT_WORDS = 5;

export function articleKeywordSnippets(html: string, query: string): ArticleSnippet[] {
  const queryWords = query.trim().split(/\s+/).filter(Boolean);
  if (queryWords.length === 0) return [];

  const words = plainWords(html);
  const needle = queryWords.map((word) => word.toLowerCase());
  const snippets: ArticleSnippet[] = [];

  for (let index = 0; index <= words.length - needle.length; index += 1) {
    const matches = needle.every(
      (word, offset) => words[index + offset].toLowerCase() === word,
    );
    if (!matches) continue;
    snippets.push({
      before: words.slice(Math.max(0, index - CONTEXT_WORDS), index).join(" "),
      match: words.slice(index, index + needle.length).join(" "),
      after: words
        .slice(index + needle.length, index + needle.length + CONTEXT_WORDS)
        .join(" "),
    });
  }

  return snippets;
}

function plainWords(html: string): string[] {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .split(/\s+/)
    .filter(Boolean);
}
