import { useState } from "react";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { isBraveBrowser } from "../lib/folderSource";
import { displayPath, type FolderStatus, type Source } from "../types";
import { ConfirmDialog } from "./ConfirmDialog";

interface Props {
  sources: Source[];
  folderSourcesSupported: boolean;
  folderStatus: Record<string, FolderStatus>;
  onAdd: (name: string, path?: string) => void;
  onAddFolder: () => Promise<{ ok: true } | { ok: false; error: string }>;
  onUpdate: (id: string, updates: { name: string; path?: string }) => void;
  onRemove: (id: string) => void;
  onReconnect: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onClose: () => void;
}

export function SourceDialog({
  sources,
  folderSourcesSupported,
  folderStatus,
  onAdd,
  onAddFolder,
  onUpdate,
  onRemove,
  onReconnect,
  onClose,
}: Props) {
  const [newName, setNewName] = useState("");
  const [newPath, setNewPath] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPath, setEditPath] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [addingFolder, setAddingFolder] = useState(false);
  const [reconnectingId, setReconnectingId] = useState<string | null>(null);

  // Only close this dialog on Escape if the nested remove-confirmation isn't
  // covering it (that dialog handles Escape itself, both listeners are global).
  useEscapeKey(() => {
    if (!removingId) onClose();
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    onAdd(name, newPath.trim() || undefined);
    setNewName("");
    setNewPath("");
  }

  async function handleAddFolder() {
    setFolderError(null);
    setAddingFolder(true);
    const result = await onAddFolder();
    setAddingFolder(false);
    if (!result.ok) setFolderError(result.error);
  }

  async function handleReconnect(id: string) {
    setReconnectingId(id);
    const result = await onReconnect(id);
    setReconnectingId(null);
    if (!result.ok) setFolderError(result.error);
  }

  function startEdit(source: Source) {
    setEditingId(source.id);
    setEditName(source.name);
    setEditPath(source.path ?? "");
  }

  function commitEdit() {
    if (!editingId) return;
    const name = editName.trim();
    if (name) onUpdate(editingId, { name, path: editPath.trim() || undefined });
    setEditingId(null);
  }

  const removingSource = sources.find((s) => s.id === removingId);

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Manage sources</h2>
            <button type="button" className="icon-btn" onClick={onClose} title="Close">
              ✕
            </button>
          </div>

          <div className="modal-body">
            {sources.length === 0 && <p className="sidebar-empty">No sources added yet.</p>}
            <ul className="source-list">
              {sources.map((source) => {
                const status = source.kind === "folder" ? (folderStatus[source.id] ?? "disconnected") : null;
                return (
                  <li key={source.id} className="source-list-item">
                    {editingId === source.id ? (
                      <form
                        className="source-edit-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          commitEdit();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.stopPropagation();
                            setEditingId(null);
                          }
                        }}
                      >
                        <input
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Name"
                        />
                        <input
                          value={editPath}
                          onChange={(e) => setEditPath(e.target.value)}
                          placeholder="Path (optional)"
                        />
                        <div className="inline-edit-actions">
                          <button type="submit" className="icon-btn" title="Save">
                            ✓
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            title="Cancel"
                            onClick={() => setEditingId(null)}
                          >
                            ✕
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="source-list-info">
                        <span className="source-list-name">
                          {source.kind === "folder" ? "📁 " : ""}
                          {source.name}
                        </span>
                        {displayPath(source) && <span className="source-list-path">{displayPath(source)}</span>}
                        {status && status !== "connected" && (
                          <span className="source-status">
                            {status === "unsupported"
                              ? "This browser can't reconnect real folders"
                              : reconnectingId === source.id
                                ? "Reconnecting…"
                                : "Disconnected"}
                            {status === "disconnected" && reconnectingId !== source.id && (
                              <button type="button" className="link-btn" onClick={() => handleReconnect(source.id)}>
                                Reconnect
                              </button>
                            )}
                          </span>
                        )}
                      </div>
                    )}
                    {editingId !== source.id && (
                      <div className="source-list-actions">
                        <button type="button" onClick={() => startEdit(source)} title="Edit">
                          ✎
                        </button>
                        <button type="button" onClick={() => setRemovingId(source.id)} title="Remove">
                          🗑
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="source-add-section">
              <h3>Add a source</h3>
              {folderSourcesSupported ? (
                <button type="button" className="secondary-btn" onClick={handleAddFolder} disabled={addingFolder}>
                  📁 {addingFolder ? "Choosing…" : "Add a folder from your computer"}
                </button>
              ) : isBraveBrowser ? (
                <p className="field-hint">
                  Brave hides this feature behind a privacy setting by default. Enable it at{" "}
                  <code>brave://flags/#file-system-access-api</code>, relaunch Brave, and it'll appear here — or add
                  a virtual source below instead.
                </p>
              ) : (
                <p className="field-hint">
                  This browser doesn't support picking real folders (Chrome, Edge, and other Chromium browsers do) —
                  add a virtual source below instead.
                </p>
              )}
              {folderError && <p className="form-error">{folderError}</p>}

              <form className="source-add-form" onSubmit={handleAdd}>
                <label>
                  Name
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="My Notes"
                    required
                  />
                </label>
                <label>
                  Path <span className="field-hint">(optional label)</span>
                  <input
                    value={newPath}
                    onChange={(e) => setNewPath(e.target.value)}
                    placeholder="~/notes/work"
                  />
                </label>
                <button type="submit" className="secondary-btn">
                  Add virtual source (no real files)
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {removingSource && (
        <ConfirmDialog
          title="Remove source?"
          message={
            removingSource.kind === "folder"
              ? `"${removingSource.name}" will be removed from the sidebar. The folder and its files on disk are untouched.`
              : `"${removingSource.name}" and every document in it will be permanently deleted from this browser's storage.`
          }
          confirmLabel="Remove"
          danger
          onCancel={() => setRemovingId(null)}
          onConfirm={() => {
            onRemove(removingSource.id);
            setRemovingId(null);
          }}
        />
      )}
    </>
  );
}
