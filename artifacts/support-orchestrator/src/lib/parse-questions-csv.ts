const QUESTION_HEADERS = new Set(["question", "questions", "prompt", "text", "query"]);

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((entry) => entry.some((value) => value.trim().length > 0));
}

function headerIndex(header: string[]): number {
  const normalized = header.map((value) => value.trim().toLowerCase());
  const match = normalized.findIndex((value) => QUESTION_HEADERS.has(value));
  return match >= 0 ? match : 0;
}

function looksLikeHeader(row: string[]): boolean {
  if (row.length === 0) return false;
  const first = row[0].trim().toLowerCase();
  if (QUESTION_HEADERS.has(first)) return true;
  if (row.length === 1) return false;
  return row.every((cell) => {
    const value = cell.trim();
    return value.length > 0 && value.length <= 40 && !value.includes("?") && /^[a-z0-9 _-]+$/i.test(value);
  });
}

export function parseQuestionsCsv(text: string): string[] {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return [];

  const hasHeader = looksLikeHeader(rows[0]);
  const column = hasHeader ? headerIndex(rows[0]) : 0;
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const seen = new Set<string>();
  const questions: string[] = [];

  for (const row of dataRows) {
    const value = (row[column] ?? row[0] ?? "").replace(/\s+/g, " ").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    questions.push(value);
  }

  return questions;
}
