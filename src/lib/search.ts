import type { Source } from "../types";
import { parseDocKey } from "../types";

export interface SearchResult {
  key: string;
  sourceId: string;
  sourceName: string;
  relPath: string;
  name: string;
  snippet?: string;
}

/** Searches file names and content across every document the user owns. */
export function searchDocs(
  docs: Record<string, string>,
  sources: Source[],
  query: string,
  limit = 50,
): SearchResult[] {
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const q = query.trim().toLowerCase();

  const results: SearchResult[] = [];
  for (const [key, content] of Object.entries(docs)) {
    const { sourceId, relPath } = parseDocKey(key);
    const source = sourceById.get(sourceId);
    if (!source) continue;
    const name = relPath.split("/").pop() ?? relPath;

    if (!q) {
      results.push({ key, sourceId, sourceName: source.name, relPath, name });
      continue;
    }

    const nameMatches = relPath.toLowerCase().includes(q);
    const contentIdx = content.toLowerCase().indexOf(q);
    if (!nameMatches && contentIdx === -1) continue;

    results.push({
      key,
      sourceId,
      sourceName: source.name,
      relPath,
      name,
      snippet: contentIdx !== -1 ? buildSnippet(content, contentIdx, q.length) : undefined,
    });
  }

  results.sort((a, b) => {
    const aNameMatch = q && a.relPath.toLowerCase().includes(q) ? 0 : 1;
    const bNameMatch = q && b.relPath.toLowerCase().includes(q) ? 0 : 1;
    if (aNameMatch !== bNameMatch) return aNameMatch - bNameMatch;
    return a.relPath.localeCompare(b.relPath);
  });

  return results.slice(0, limit);
}

function buildSnippet(content: string, matchIndex: number, matchLength: number, radius = 40): string {
  const start = Math.max(0, matchIndex - radius);
  const end = Math.min(content.length, matchIndex + matchLength + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < content.length ? "…" : "";
  return `${prefix}${content.slice(start, end).replace(/\s+/g, " ").trim()}${suffix}`;
}
