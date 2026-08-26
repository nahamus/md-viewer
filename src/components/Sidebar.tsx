import { useMemo, useState } from "react";
import { computeRenameTarget } from "../lib/rename";
import { buildTree } from "../lib/tree";
import { displayPath, parseDocKey, type FileOpResult, type FolderStatus, type Source } from "../types";
import { ChevronIcon } from "./ChevronIcon";
import { ConfirmDialog } from "./ConfirmDialog";
import { SourceTree } from "./SourceTree";

const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 480;

interface Props {
  sources: Source[];
  docs: Record<string, string>;
  folderStatus: Record<string, FolderStatus>;
  expandedKeys: Set<string>;
  activeKey: string | null;
  width: number;
  onWidthChange: (width: number) => void;
  onToggleExpand: (key: string) => void;
  onCollapseAll: () => void;
  onOpenFile: (source: Source, relPath: string, name: string, opts?: { pin?: boolean }) => void;
  onOpenSearch: () => void;
  onReconnect: (id: string) => void;
  onRenameFile: (sourceId: string, relPath: string, newRelPath: string, newName: string) => Promise<FileOpResult>;
  onDeleteFile: (sourceId: string, relPath: string) => Promise<FileOpResult>;
}

export function Sidebar({
  sources,
  docs,
  folderStatus,
  expandedKeys,
  activeKey,
  width,
  onWidthChange,
  onToggleExpand,
  onCollapseAll,
  onOpenFile,
  onOpenSearch,
  onReconnect,
  onRenameFile,
  onDeleteFile,
}: Props) {
  const [renaming, setRenaming] = useState<{ source: Source; relPath: string; value: string } | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ source: Source; relPath: string; name: string } | null>(null);
  const [liveWidth, setLiveWidth] = useState(width);
  const [syncedWidth, setSyncedWidth] = useState(width);

  // Stay in sync if width changes externally (e.g. restored on profile
  // switch) — adjusted during render per React's guidance for this case,
  // rather than an effect that would cause an extra render round-trip.
  if (width !== syncedWidth) {
    setSyncedWidth(width);
    setLiveWidth(width);
  }

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

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = liveWidth;
    let finalWidth = startWidth;
    function onMove(moveEvent: MouseEvent) {
      finalWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, startWidth + (moveEvent.clientX - startX)));
      setLiveWidth(finalWidth);
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      onWidthChange(finalWidth);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function handleTreeKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (!target.classList.contains("tree-row")) return;
    const rows = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(".tree-row"));
    const index = rows.indexOf(target);
    if (index === -1) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      rows[Math.min(index + 1, rows.length - 1)]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      rows[Math.max(index - 1, 0)]?.focus();
    } else if (e.key === "ArrowRight") {
      if (target.dataset.expandable !== "true") return;
      e.preventDefault();
      if (target.dataset.expanded === "false") target.click();
      else rows[Math.min(index + 1, rows.length - 1)]?.focus();
    } else if (e.key === "ArrowLeft") {
      if (target.dataset.expandable === "true" && target.dataset.expanded === "true") {
        e.preventDefault();
        target.click();
      }
    }
  }

  async function commitRename() {
    if (!renaming) return;
    const target = computeRenameTarget(renaming.relPath, renaming.value);
    if (!target) {
      setRenaming(null);
      return;
    }
    const result = await onRenameFile(renaming.source.id, renaming.relPath, target.newRelPath, target.newName);
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
    <aside className="sidebar" style={{ width: liveWidth }}>
      <div className="sidebar-header">
        <span className="sidebar-title">Documents</span>
        <div className="sidebar-header-actions">
          <button type="button" className="icon-btn" title="Collapse all" onClick={onCollapseAll}>
            ⊟
          </button>
          <button type="button" className="icon-btn" title="Search all documents" onClick={onOpenSearch}>
            🔍
          </button>
        </div>
      </div>

      <div className="sidebar-body" onKeyDown={handleTreeKeyDown}>
        {sources.length === 0 && (
          <p className="sidebar-empty">
            No sources yet. Use the <strong>File</strong> menu to add one.
          </p>
        )}
        {sources.map((source) => {
          const root = treesBySource[source.id];
          const expandKey = `${source.id}::`;
          const isExpanded = expandedKeys.has(expandKey);
          const status = source.kind === "folder" ? (folderStatus[source.id] ?? "connecting") : "connected";
          const path = displayPath(source);
          return (
            <div className="source-block" key={source.id}>
              <button
                type="button"
                className="tree-row tree-row--source"
                onClick={() => onToggleExpand(expandKey)}
                title={path}
                data-expandable="true"
                data-expanded={isExpanded}
              >
                <ChevronIcon className={`chevron ${isExpanded ? "chevron--open" : ""}`} />
                <span className="tree-icon">{source.kind === "folder" ? "📁" : "📚"}</span>
                <span className="tree-label">{source.name}</span>
              </button>
              {path && <div className="tree-source-path">{path}</div>}
              {status === "connecting" && <div className="tree-source-path source-status-connecting">Connecting…</div>}
              {status === "disconnected" && (
                <div className="tree-source-path source-status">
                  Disconnected
                  <button type="button" className="link-btn" onClick={() => onReconnect(source.id)}>
                    Reconnect
                  </button>
                </div>
              )}
              {status === "unsupported" && (
                <div className="tree-source-path source-status">Can't reconnect in this browser</div>
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

      <div className="sidebar-resize-handle" onMouseDown={startResize} />

      {deleting && (
        <ConfirmDialog
          title="Delete file?"
          message={`"${deleting.name}" will be permanently deleted${deleting.source.kind === "folder" ? " from disk" : ""}. This can't be undone.`}
          confirmLabel="Delete"
          danger
          requireText={deleting.name}
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
