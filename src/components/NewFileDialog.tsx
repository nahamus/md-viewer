import { useState } from "react";
import { useEscapeKey } from "../hooks/useEscapeKey";
import type { Source } from "../types";

interface Props {
  sources: Source[];
  onClose: () => void;
  onCreate: (sourceId: string, relPath: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onCreated: (source: Source, relPath: string, name: string) => void;
}

export function NewFileDialog({ sources, onClose, onCreate, onCreated }: Props) {
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? "");
  const [relPath, setRelPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEscapeKey(onClose);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const source = sources.find((s) => s.id === sourceId);
    if (!source) {
      setError("Choose a source first.");
      return;
    }
    let path = relPath.trim();
    if (!path) {
      setError("Enter a file name.");
      return;
    }
    if (!path.toLowerCase().endsWith(".md")) path += ".md";

    setCreating(true);
    const result = await onCreate(source.id, path);
    setCreating(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const name = path.split("/").pop()!;
    onCreated(source, path, name);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>New file</h2>
          <button type="button" className="icon-btn" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">
          {sources.length === 0 ? (
            <p className="sidebar-empty">Add a source first before creating files.</p>
          ) : (
            <form className="source-add-form" onSubmit={handleSubmit}>
              <label>
                Source
                <select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                File name (optionally with subfolder, e.g. <code>notes/todo.md</code>)
                <input
                  autoFocus
                  value={relPath}
                  onChange={(e) => setRelPath(e.target.value)}
                  placeholder="untitled.md"
                />
              </label>
              {error && <p className="form-error">{error}</p>}
              <button type="submit" className="primary-btn" disabled={creating}>
                {creating ? "Creating…" : "Create"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
