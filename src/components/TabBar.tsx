import { useState } from "react";
import { computeRenameTarget } from "../lib/rename";
import type { FileOpResult, OpenDoc } from "../types";

interface Props {
  pinnedTabs: OpenDoc[];
  previewTab: OpenDoc | null;
  activeKey: string | null;
  dirtyKeys: Set<string>;
  onActivate: (key: string) => void;
  onClose: (key: string) => void;
  onPin: (key: string) => void;
  onUnpin: (key: string) => void;
  onRename: (sourceId: string, relPath: string, newRelPath: string, newName: string) => Promise<FileOpResult>;
}

function Tab({
  doc,
  isActive,
  isPreview,
  isDirty,
  isRenaming,
  renameValue,
  renameError,
  onRenameValueChange,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onActivate,
  onClose,
  onPin,
  onUnpin,
}: {
  doc: OpenDoc;
  isActive: boolean;
  isPreview: boolean;
  isDirty: boolean;
  isRenaming: boolean;
  renameValue: string;
  renameError: string | null;
  onRenameValueChange: (value: string) => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onActivate: () => void;
  onClose: () => void;
  onPin: () => void;
  onUnpin: () => void;
}) {
  if (isRenaming) {
    return (
      <form
        className={`tab tab--renaming ${isActive ? "tab--active" : ""}`}
        onSubmit={(e) => {
          e.preventDefault();
          onCommitRename();
        }}
      >
        <input
          autoFocus
          className="tab-rename-input"
          value={renameValue}
          onChange={(e) => onRenameValueChange(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={onCommitRename}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              onCancelRename();
            }
          }}
        />
        {renameError && <span className="tab-rename-error">{renameError}</span>}
      </form>
    );
  }

  return (
    <div
      className={`tab ${isActive ? "tab--active" : ""} ${isPreview ? "tab--preview" : ""}`}
      onClick={onActivate}
      onDoubleClick={onStartRename}
      title={doc.sourceName + " / " + doc.relPath}
    >
      <button
        type="button"
        className="tab-pin"
        title={isPreview ? "Pin tab" : "Unpin tab"}
        onClick={(e) => {
          e.stopPropagation();
          if (isPreview) onPin();
          else onUnpin();
        }}
      >
        {isPreview ? "📌" : "📍"}
      </button>
      <span className="tab-label">
        {doc.name}
        {isDirty ? " •" : ""}
      </span>
      <button
        type="button"
        className="tab-close"
        title="Close"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        ✕
      </button>
    </div>
  );
}

export function TabBar({ pinnedTabs, previewTab, activeKey, dirtyKeys, onActivate, onClose, onPin, onUnpin, onRename }: Props) {
  const [renaming, setRenaming] = useState<{ doc: OpenDoc; value: string } | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);

  if (pinnedTabs.length === 0 && !previewTab) {
    return null;
  }

  async function commitRename() {
    if (!renaming) return;
    const target = computeRenameTarget(renaming.doc.relPath, renaming.value);
    if (!target) {
      setRenaming(null);
      return;
    }
    const result = await onRename(renaming.doc.sourceId, renaming.doc.relPath, target.newRelPath, target.newName);
    if (!result.ok) {
      setRenameError(result.error);
      return;
    }
    setRenaming(null);
    setRenameError(null);
  }

  function renderTab(doc: OpenDoc, isPreview: boolean) {
    return (
      <Tab
        key={doc.key}
        doc={doc}
        isActive={doc.key === activeKey}
        isPreview={isPreview}
        isDirty={dirtyKeys.has(doc.key)}
        isRenaming={renaming?.doc.key === doc.key}
        renameValue={renaming?.doc.key === doc.key ? renaming.value : ""}
        renameError={renaming?.doc.key === doc.key ? renameError : null}
        onRenameValueChange={(value) => setRenaming((prev) => (prev ? { ...prev, value } : prev))}
        onStartRename={() => {
          setRenameError(null);
          setRenaming({ doc, value: doc.name.replace(/\.md$/i, "") });
        }}
        onCommitRename={commitRename}
        onCancelRename={() => {
          setRenaming(null);
          setRenameError(null);
        }}
        onActivate={() => onActivate(doc.key)}
        onClose={() => onClose(doc.key)}
        onPin={() => onPin(doc.key)}
        onUnpin={() => onUnpin(doc.key)}
      />
    );
  }

  return (
    <div className="tab-bar">
      {pinnedTabs.map((doc) => renderTab(doc, false))}
      {previewTab && renderTab(previewTab, true)}
    </div>
  );
}
