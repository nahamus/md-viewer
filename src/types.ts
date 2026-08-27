export interface Source {
  id: string;
  name: string;
  /**
   * For a "virtual" source: a free-text note of where this maps to (e.g.
   * "~/notes/work") — not a real filesystem link.
   * For a "folder" source: the picked folder's own name (the File System
   * Access API never exposes a full path, only that).
   */
  path?: string;
  /** "virtual" (default) = content lives only in this browser's storage. "folder" = backed by a real picked folder on disk. */
  kind?: "virtual" | "folder";
}

/** Live (per-session) connection state of a "folder" source. */
export type FolderStatus = "connecting" | "connected" | "disconnected" | "unsupported";

/** "system" follows prefers-color-scheme; the others force a specific theme regardless of it. */
export type ThemePreference = "system" | "light" | "dark";

/** A source's path is only worth displaying alongside its name if it says something new. */
export function displayPath(source: Source): string | undefined {
  return source.path && source.path !== source.name ? source.path : undefined;
}

export interface TreeNode {
  name: string;
  relPath: string;
  type: "file" | "dir";
  children?: TreeNode[];
}

export interface UserProfile {
  id: string;
  name: string;
  /** e.g. an occupation or role, shown as a subtitle. */
  label?: string;
  /** A single emoji representing this profile. */
  avatar?: string;
  /** "system" (default) follows prefers-color-scheme; the others force a specific theme regardless of it. */
  theme?: ThemePreference;
}

/** Everything one profile owns, persisted as a single localStorage entry. */
export interface UserData {
  sources: Source[];
  /** Keyed by docKey(sourceId, relPath) -> markdown content. */
  docs: Record<string, string>;
}

export type DocMode = "view" | "edit";

export interface OpenDoc {
  key: string;
  sourceId: string;
  sourceName: string;
  relPath: string;
  name: string;
  pinned: boolean;
}

/** Per-open-tab UI state; the saved content itself lives in UserData.docs. */
export interface DocUiState {
  mode: DocMode;
  draft: string;
  saving: boolean;
  error: string | null;
}

/** Outcome of a rename/delete request against a doc source. */
export type FileOpResult = { ok: true } | { ok: false; error: string };

/** The sidebar/tabs layout, persisted per-profile so it survives reloads. */
export interface SessionState {
  pinnedTabs: OpenDoc[];
  previewTab: OpenDoc | null;
  activeKey: string | null;
  expandedKeys: string[];
  sidebarVisible: boolean;
  sidebarWidth: number;
}

const KEY_SEP = "::";

export function docKey(sourceId: string, relPath: string): string {
  return `${sourceId}${KEY_SEP}${relPath}`;
}

export function parseDocKey(key: string): { sourceId: string; relPath: string } {
  const idx = key.indexOf(KEY_SEP);
  return { sourceId: key.slice(0, idx), relPath: key.slice(idx + KEY_SEP.length) };
}
