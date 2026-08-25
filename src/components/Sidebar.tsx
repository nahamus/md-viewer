import { useMemo, useState } from "react";
import { buildTree } from "../lib/tree";
import { displayPath, parseDocKey, type FolderStatus, type Source } from "../types";
import { ConfirmDialog } from "./ConfirmDialog";
import { SourceTree } from "./SourceTree";

type RenameResult = { ok: true } | { ok: false; error: string };

interface Props {
  sources: Source[];
  docs: Record<string, string>;
  folderStatus: Record<string, FolderStatus>;
  expandedKeys: Set<string>;
  activeKey: string | null;
  onToggleExpand: (key: string) => void;
  onOpenFile: (source: Source, relPath: string, name: string, opts?: { pin?: boolean }) => void;
  onOpenSearch: () => void;
  onReconnect: (id: string) => void;
  onRenameFile: (sourceId: string, relPath: string, newRelPath: string, newName: string) => Promise<RenameResult>;
  onDeleteFile: (sourceId: string, relPath: string) => Promise<RenameResult>;
}

export function Sidebar({
  sources,
  docs,
  folderStatus,
  expandedKeys,
  activeKey,
  onToggleExpand,
  onOpenFile,
  onOpenSearch,
  onReconnect,
  onRenameFile,
  onDeleteFile,
}: Props) {
  const [renaming, setRenaming] = useState<{ source: Source; relPath: string; value: string } | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ source: Source; relPath: string; name: string } | null>(null);

  const treesBySource = useMemo(() => {
    const bySource: Record<string, string[]> = {};
    for (const source of sources) bySource[source.id] = [];
    for (const key of Object.keys(docs)) {
      const { sourceId, relPath } = parseDocKey(key);
      if (bySource[sourceId]) bySource[sourceId].push(relPath);
    }
    const trees: Record<string, ReturnType<typeof buildTree>> = {};
    for (const source of sources) trees[source.id] = buildTree(bySource[source.id]);
    return trees;
  }, [sources, docs]);

  async function commitRename() {
    if (!renaming) return;
    const trimmed = renaming.value.trim();
    if (!trimmed) {
      setRenaming(null);
      return;
    }
    const newName = trimmed.toLowerCase().endsWith(".md") ? trimmed : `${trimmed}.md`;
    const parts = renaming.relPath.split("/");
    parts[parts.length - 1] = newName;
    const newRelPath = parts.join("/");

    if (newRelPath === renaming.relPath) {
      setRenaming(null);
      return;
    }
    const result = await onRenameFile(renaming.source.id, renaming.relPath, newRelPath, newName);
    if (!result.ok) {
      setRenameError(result.error);
      return;
    }
    setRenaming(null);
    setRenameError(null);
  }

  const fileActions = {
    renamingKey: renaming ? `${renaming.source.id}::${renaming.relPath}` : null,
    renameValue: renaming?.value ?? "",
    renameError,
    onRenameValueChange: (value: string) => setRenaming((prev) => (prev ? { ...prev, value } : prev)),
    onStartRename: (source: Source, relPath: string, name: string) => {
      setRenameError(null);
      setRenaming({ source, relPath, value: name.replace(/\.md$/i, "") });
    },
    onCommitRename: commitRename,
    onCancelRename: () => {
      setRenaming(null);
      setRenameError(null);
    },
    onRequestDelete: (source: Source, relPath: string, name: string) => setDeleting({ source, relPath, name }),
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Documents</span>
        <button type="button" className="icon-btn" title="Search all documents" onClick={onOpenSearch}>
          🔍
        </button>
      </div>

      <div className="sidebar-body">
        {sources.length === 0 && (
          <p className="sidebar-empty">
            No sources yet. Use the <strong>File</strong> menu to add one.
          </p>
        )}
        {sources.map((source) => {
          const root = treesBySource[source.id];
          const expandKey = `${source.id}::`;
          const isExpanded = expandedKeys.has(expandKey);
          const isDisconnected = source.kind === "folder" && folderStatus[source.id] !== "connected";
          const path = displayPath(source);
          return (
            <div className="source-block" key={source.id}>
              <button
                type="button"
                className="tree-row tree-row--source"
                onClick={() => onToggleExpand(expandKey)}
                title={path}
              >
                <span className={`chevron ${isExpanded ? "chevron--open" : ""}`}>▸</span>
                <span className="tree-icon">{source.kind === "folder" ? "📁" : "📚"}</span>
                <span className="tree-label">{source.name}</span>
              </button>
              {path && <div className="tree-source-path">{path}</div>}
              {isDisconnected && (
                <div className="tree-source-path source-status">
                  Disconnected
                  {folderStatus[source.id] !== "unsupported" && (
                    <button type="button" className="link-btn" onClick={() => onReconnect(source.id)}>
                      Reconnect
                    </button>
                  )}
                </div>
              )}
              {isExpanded && root && (
                <SourceTree
                  source={source}
                  node={root}
                  expandedKeys={expandedKeys}
                  activeKey={activeKey}
                  onToggleExpand={onToggleExpand}
                  onOpenFile={onOpenFile}
                  fileActions={fileActions}
                  depth={1}
                />
              )}
            </div>
          );
        })}
      </div>

      {deleting && (
        <ConfirmDialog
          title="Delete file?"
          message={`"${deleting.name}" will be permanently deleted${deleting.source.kind === "folder" ? " from disk" : ""}. This can't be undone.`}
          confirmLabel="Delete"
          danger
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            const target = deleting;
            setDeleting(null);
            const result = await onDeleteFile(target.source.id, target.relPath);
            if (!result.ok) setRenameError(result.error);
          }}
        />
      )}
    </aside>
  );
}
