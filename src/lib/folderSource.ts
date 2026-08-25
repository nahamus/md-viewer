import type { TreeNode } from "../types";

export const folderSourcesSupported = typeof window !== "undefined" && "showDirectoryPicker" in window;

/**
 * Brave is Chromium-based and does implement the File System Access API, but
 * hides it behind a privacy toggle (brave://flags/#file-system-access-api)
 * that's off by default — unlike Firefox/Safari, which don't implement it at
 * all. `navigator.brave` exists in Brave regardless of that flag's state, so
 * it lets us tell "flip a setting" apart from "not possible in this browser."
 */
export const isBraveBrowser = typeof navigator !== "undefined" && "brave" in navigator;

/** Recursively scans a directory for .md files and builds a sidebar tree. */
export async function scanMdFiles(dirHandle: FileSystemDirectoryHandle, relPath = ""): Promise<TreeNode> {
  const children: TreeNode[] = [];
  for await (const [name, handle] of dirHandle.entries()) {
    if (name.startsWith(".")) continue;
    const childRelPath = relPath ? `${relPath}/${name}` : name;
    if (handle.kind === "directory") {
      const subtree = await scanMdFiles(handle, childRelPath);
      if (subtree.children && subtree.children.length > 0) children.push(subtree);
    } else if (name.toLowerCase().endsWith(".md")) {
      children.push({ name, relPath: childRelPath, type: "file" });
    }
  }
  children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return { name: relPath.split("/").pop() ?? "", relPath, type: "dir", children };
}

/** Flattens a tree (as produced by scanMdFiles) into a list of file relPaths. */
export function collectFilePaths(node: TreeNode, out: string[] = []): string[] {
  for (const child of node.children ?? []) {
    if (child.type === "file") out.push(child.relPath);
    else collectFilePaths(child, out);
  }
  return out;
}

async function resolveParentDir(
  dirHandle: FileSystemDirectoryHandle,
  relPath: string,
  opts?: { create?: boolean },
): Promise<{ parent: FileSystemDirectoryHandle; name: string }> {
  const parts = relPath.split("/");
  let dir = dirHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i], { create: !!opts?.create });
  }
  return { parent: dir, name: parts[parts.length - 1] };
}

async function resolveFileHandle(
  dirHandle: FileSystemDirectoryHandle,
  relPath: string,
  opts?: { create?: boolean },
): Promise<FileSystemFileHandle> {
  const { parent, name } = await resolveParentDir(dirHandle, relPath, opts);
  return parent.getFileHandle(name, { create: !!opts?.create });
}

export async function readMdFile(dirHandle: FileSystemDirectoryHandle, relPath: string): Promise<string> {
  const fileHandle = await resolveFileHandle(dirHandle, relPath);
  const file = await fileHandle.getFile();
  return file.text();
}

export async function writeMdFile(dirHandle: FileSystemDirectoryHandle, relPath: string, content: string) {
  const fileHandle = await resolveFileHandle(dirHandle, relPath, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

export async function createMdFile(
  dirHandle: FileSystemDirectoryHandle,
  relPath: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await resolveFileHandle(dirHandle, relPath);
    return { ok: false, error: "A file with that name already exists." };
  } catch {
    // getFileHandle without `create` throws NotFoundError when the file
    // doesn't exist yet — that's the expected, "go ahead and create it" path.
  }
  await writeMdFile(dirHandle, relPath, "");
  return { ok: true };
}

export async function deleteMdFile(dirHandle: FileSystemDirectoryHandle, relPath: string): Promise<void> {
  const { parent, name } = await resolveParentDir(dirHandle, relPath);
  await parent.removeEntry(name);
}

/**
 * Renames/moves a file by copying its content to the new path and removing
 * the old one — `FileSystemHandle.move()` exists in newer browsers but isn't
 * universally supported yet, so this sticks to the stable read/write API.
 */
export async function renameMdFile(
  dirHandle: FileSystemDirectoryHandle,
  oldRelPath: string,
  newRelPath: string,
): Promise<void> {
  const content = await readMdFile(dirHandle, oldRelPath);
  await writeMdFile(dirHandle, newRelPath, content);
  await deleteMdFile(dirHandle, oldRelPath);
}

/**
 * Checks (and if needed, asks for) readwrite permission on a stored handle.
 * `requestPermission` requires an active user gesture — only call this from
 * inside a click handler when `silent` is false.
 */
export async function verifyPermission(dirHandle: FileSystemDirectoryHandle, silent: boolean): Promise<boolean> {
  const opts = { mode: "readwrite" as const };
  if ((await dirHandle.queryPermission(opts)) === "granted") return true;
  if (silent) return false;
  return (await dirHandle.requestPermission(opts)) === "granted";
}
