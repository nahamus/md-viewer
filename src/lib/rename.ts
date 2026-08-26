/**
 * Turns a raw typed name into the new relPath/name for a rename, or null if
 * the input is empty or resolves to no actual change (so callers can just
 * close the rename UI without calling the rename handler).
 */
export function computeRenameTarget(relPath: string, rawValue: string): { newRelPath: string; newName: string } | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  const newName = trimmed.toLowerCase().endsWith(".md") ? trimmed : `${trimmed}.md`;
  const parts = relPath.split("/");
  parts[parts.length - 1] = newName;
  const newRelPath = parts.join("/");

  if (newRelPath === relPath) return null;
  return { newRelPath, newName };
}
