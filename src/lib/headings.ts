export interface HeadingItem {
  level: number;
  text: string;
  id: string;
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

const ATX_RE = /^ {0,3}(#{1,6})(?:\s+(.+?))?\s*#*$/;
const SETEXT_RE = /^ {0,3}(=+|-+)\s*$/;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Parses headings out of raw markdown — both ATX (`# ...`) and Setext
 * (underlined with `===`/`---`) styles — skipping YAML frontmatter and
 * fenced code blocks. A closing fence must use the same character as the
 * opening one and be at least as long (CommonMark's rule) — a naive "any
 * ``` toggles it" check misreads a fenced block nested inside a longer
 * outer fence (common when a doc shows markdown-syntax examples), exposing
 * whatever's inside — including any accidental "# ..." lines — as if it
 * were real content.
 *
 * Ids are deduplicated the way GitHub does (name, name-1, name-2, ...) —
 * the exact algorithm doesn't need to match GitHub's, since these ids are
 * only ever compared against ones this app assigns itself (see the heading
 * id effect in DocumentPane), not external links.
 */
export function extractHeadings(content: string): HeadingItem[] {
  const headings: HeadingItem[] = [];
  const seen = new Map<string, number>();
  let fence: { char: string; len: number } | null = null;
  let previousLine: string | null = null;

  function addHeading(level: number, rawText: string) {
    const text = stripInlineMarkdown(rawText);
    if (!text) return;
    const baseId = slugify(text) || "section";
    const count = seen.get(baseId) ?? 0;
    seen.set(baseId, count + 1);
    headings.push({ level, text, id: count === 0 ? baseId : `${baseId}-${count}` });
  }

  const lines = content.split("\n");

  // Skip a leading YAML frontmatter block — otherwise a plain field line
  // right before its closing "---" reads as a Setext H2.
  let start = 0;
  if (lines[0]?.trim() === "---") {
    const closing = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
    if (closing !== -1) start = closing + 1;
  }

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];

    const fenceMatch = FENCE_RE.exec(line);
    if (fenceMatch) {
      const run = fenceMatch[1];
      if (!fence) {
        fence = { char: run[0], len: run.length };
      } else if (run[0] === fence.char && run.length >= fence.len) {
        fence = null;
      }
      previousLine = null;
      continue;
    }
    if (fence) {
      previousLine = null;
      continue;
    }

    const atx = ATX_RE.exec(line);
    if (atx) {
      addHeading(atx[1].length, atx[2] ?? "");
      previousLine = null;
      continue;
    }

    const setext = SETEXT_RE.exec(line);
    if (setext && previousLine !== null && previousLine.trim() !== "") {
      addHeading(setext[1][0] === "=" ? 1 : 2, previousLine);
      previousLine = null;
      continue;
    }

    previousLine = line;
  }

  return headings;
}
