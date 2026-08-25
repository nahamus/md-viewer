import { useMemo } from "react";
import { buildTree } from "../lib/tree";
import { parseDocKey, type FolderStatus, type Source } from "../types";
import { SourceTree } from "./SourceTree";

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
}: Props) {
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
          return (
            <div className="source-block" key={source.id}>
              <button
                type="button"
                className="tree-row tree-row--source"
                onClick={() => onToggleExpand(expandKey)}
                title={source.path}
              >
                <span className={`chevron ${isExpanded ? "chevron--open" : ""}`}>▸</span>
                <span className="tree-icon">{source.kind === "folder" ? "📁" : "📚"}</span>
                <span className="tree-label">{source.name}</span>
              </button>
              {source.path && <div className="tree-source-path">{source.path}</div>}
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
                  depth={1}
                />
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
