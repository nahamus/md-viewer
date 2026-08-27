/**
 * mermaid's theme is baked in once at initialize() and cached for the
 * session (see Mermaid.tsx), so switching the active theme afterward
 * wouldn't otherwise reach diagrams already rendered, or even new ones
 * (loadMermaid() would just return the stale cached init). Bumping this
 * version — done from useApplyTheme whenever the resolved theme changes —
 * notifies every mounted <Mermaid> (via useSyncExternalStore) and a
 * module-level listener in Mermaid.tsx that invalidates the cached init,
 * so diagrams regenerate under the new theme.
 */
let version = 0;
const listeners = new Set<() => void>();

export function bumpMermaidThemeVersion() {
  version++;
  for (const listener of listeners) listener();
}

export function subscribeMermaidThemeVersion(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMermaidThemeVersionSnapshot() {
  return version;
}
