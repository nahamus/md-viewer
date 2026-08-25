import type { TreeNode } from "../types";

/** Builds a nested folder/file tree from a flat list of `a/b/c.md`-style paths. */
export function buildTree(relPaths: string[]): TreeNode {
  const root: TreeNode = { name: "", relPath: "", type: "dir", children: [] };

  for (const relPath of relPaths) {
    const parts = relPath.split("/");
    let current = root;
    let pathSoFar = "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part;
      if (i === parts.length - 1) {
        current.children!.push({ name: part, relPath: pathSoFar, type: "file" });
        continue;
      }
      let dir = current.children!.find((c) => c.type === "dir" && c.name === part);
      if (!dir) {
        dir = { name: part, relPath: pathSoFar, type: "dir", children: [] };
        current.children!.push(dir);
      }
      current = dir;
    }
  }

  sortTree(root);
  return root;
}

function sortTree(node: TreeNode) {
  if (!node.children) return;
  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const child of node.children) sortTree(child);
}
