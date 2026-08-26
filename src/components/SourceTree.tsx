import { docKey, type Source, type TreeNode } from "../types";

export interface FileActions {
  renamingKey: string | null;
  renameValue: string;
  renameError: string | null;
  onRenameValueChange: (value: string) => void;
  onStartRename: (source: Source, relPath: string, name: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onRequestDelete: (source: Source, relPath: string, name: string) => void;
}

interface Props {
  source: Source;
  node: TreeNode;
  expandedKeys: Set<string>;
  activeKey: string | null;
  onToggleExpand: (key: string) => void;
  onOpenFile: (source: Source, relPath: string, name: string, opts?: { pin?: boolean }) => void;
  fileActions: FileActions;
  depth?: number;
}

export function SourceTree({
  source,
  node,
  expandedKeys,
  activeKey,
  onToggleExpand,
  onOpenFile,
  fileActions,
  depth = 0,
}: Props) {
  if (!node.children) return null;
  return (
    <ul className="tree-list">
      {node.children.map((child) => {
        const expandKey = `${source.id}::${child.relPath}`;
        const fileKey = docKey(source.id, child.relPath);
        if (child.type === "dir") {
          const isExpanded = expandedKeys.has(expandKey);
          return (
            <li key={expandKey}>
              <button
                type="button"
                className="tree-row tree-row--dir"
                onClick={() => onToggleExpand(expandKey)}
                style={{ paddingLeft: `${depth * 14 + 8}px` }}
                data-expandable="true"
                data-expanded={isExpanded}
              >
                <span className={`chevron ${isExpanded ? "chevron--open" : ""}`}>{">"}</span>
                <span className="tree-icon">📁</span>
                <span className="tree-label">{child.name}</span>
              </button>
              {isExpanded && (
                <SourceTree
                  source={source}
                  node={child}
                  expandedKeys={expandedKeys}
                  activeKey={activeKey}
                  onToggleExpand={onToggleExpand}
                  onOpenFile={onOpenFile}
                  fileActions={fileActions}
                  depth={depth + 1}
                />
              )}
            </li>
          );
        }

        if (fileActions.renamingKey === fileKey) {
          return (
            <li key={fileKey} className="tree-item">
              <form
                className="tree-rename-form"
                style={{ paddingLeft: `${depth * 14 + 8}px` }}
                onSubmit={(e) => {
                  e.preventDefault();
                  fileActions.onCommitRename();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    fileActions.onCancelRename();
                  }
                }}
              >
                <span className="tree-icon">📄</span>
                <input
                  autoFocus
                  value={fileActions.renameValue}
                  onChange={(e) => fileActions.onRenameValueChange(e.target.value)}
                  onFocus={(e) => e.target.select()}
                />
                <button type="submit" className="icon-btn" title="Save">
                  ✓
                </button>
                <button type="button" className="icon-btn" title="Cancel" onClick={fileActions.onCancelRename}>
                  ✕
                </button>
              </form>
              {fileActions.renameError && (
                <p className="tree-rename-error" style={{ paddingLeft: `${depth * 14 + 30}px` }}>
                  {fileActions.renameError}
                </p>
              )}
            </li>
          );
        }

        return (
          <li key={fileKey} className="tree-item">
            <button
              type="button"
              className={`tree-row tree-row--file ${activeKey === fileKey ? "tree-row--active" : ""}`}
              style={{ paddingLeft: `${depth * 14 + 8}px` }}
              onClick={() => onOpenFile(source, child.relPath, child.name)}
              onDoubleClick={() => onOpenFile(source, child.relPath, child.name, { pin: true })}
              title="Click to preview, double-click to pin"
            >
              <span className="tree-icon">📄</span>
              <span className="tree-label">{child.name}</span>
            </button>
            <div className="tree-item-actions">
              <button
                type="button"
                className="tree-action-btn"
                title="Rename"
                aria-label="Rename"
                onClick={(e) => {
                  e.stopPropagation();
                  fileActions.onStartRename(source, child.relPath, child.name);
                }}
              >
                ✎
              </button>
              <button
                type="button"
                className="tree-action-btn"
                title="Delete"
                aria-label="Delete"
                onClick={(e) => {
                  e.stopPropagation();
                  fileActions.onRequestDelete(source, child.relPath, child.name);
                }}
              >
                🗑
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
