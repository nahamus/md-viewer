import type { OpenDoc } from "../types";

interface Props {
  pinnedTabs: OpenDoc[];
  previewTab: OpenDoc | null;
  activeKey: string | null;
  dirtyKeys: Set<string>;
  onActivate: (key: string) => void;
  onClose: (key: string) => void;
  onPin: (key: string) => void;
  onUnpin: (key: string) => void;
}

function Tab({
  doc,
  isActive,
  isPreview,
  isDirty,
  onActivate,
  onClose,
  onPin,
  onUnpin,
}: {
  doc: OpenDoc;
  isActive: boolean;
  isPreview: boolean;
  isDirty: boolean;
  onActivate: () => void;
  onClose: () => void;
  onPin: () => void;
  onUnpin: () => void;
}) {
  return (
    <div
      className={`tab ${isActive ? "tab--active" : ""} ${isPreview ? "tab--preview" : ""}`}
      onClick={onActivate}
      onDoubleClick={isPreview ? onPin : undefined}
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

export function TabBar({ pinnedTabs, previewTab, activeKey, dirtyKeys, onActivate, onClose, onPin, onUnpin }: Props) {
  if (pinnedTabs.length === 0 && !previewTab) {
    return null;
  }
  return (
    <div className="tab-bar">
      {pinnedTabs.map((doc) => (
        <Tab
          key={doc.key}
          doc={doc}
          isActive={doc.key === activeKey}
          isPreview={false}
          isDirty={dirtyKeys.has(doc.key)}
          onActivate={() => onActivate(doc.key)}
          onClose={() => onClose(doc.key)}
          onPin={() => {}}
          onUnpin={() => onUnpin(doc.key)}
        />
      ))}
      {previewTab && (
        <Tab
          key={previewTab.key}
          doc={previewTab}
          isActive={previewTab.key === activeKey}
          isPreview
          isDirty={dirtyKeys.has(previewTab.key)}
          onActivate={() => onActivate(previewTab.key)}
          onClose={() => onClose(previewTab.key)}
          onPin={() => onPin(previewTab.key)}
          onUnpin={() => {}}
        />
      )}
    </div>
  );
}
