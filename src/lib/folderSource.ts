import type { TreeNode } from "../types";

export const folderSourcesSupported = typeof window !== "undefined" && "showDirectoryPicker" in window;

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

async function resolveFileHandle(
  dirHandle: FileSystemDirectoryHandle,
  relPath: string,
  opts?: { create?: boolean },
): Promise<FileSystemFileHandle> {
  const parts = relPath.split("/");
  let dir = dirHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i], { create: !!opts?.create });
  }
  return dir.getFileHandle(parts[parts.length - 1], { create: !!opts?.create });
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
