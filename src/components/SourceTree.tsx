import { docKey, type Source, type TreeNode } from "../types";

interface Props {
  source: Source;
  node: TreeNode;
  expandedKeys: Set<string>;
  activeKey: string | null;
  onToggleExpand: (key: string) => void;
  onOpenFile: (source: Source, relPath: string, name: string, opts?: { pin?: boolean }) => void;
  depth?: number;
}

export function SourceTree({ source, node, expandedKeys, activeKey, onToggleExpand, onOpenFile, depth = 0 }: Props) {
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
              >
                <span className={`chevron ${isExpanded ? "chevron--open" : ""}`}>▸</span>
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
                  depth={depth + 1}
                />
              )}
            </li>
          );
        }
        return (
          <li key={fileKey}>
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
          </li>
        );
      })}
    </ul>
  );
}
