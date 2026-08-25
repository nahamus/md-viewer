import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { modKeyLabel } from "../lib/platform";
import type { DocMode, DocUiState, OpenDoc } from "../types";

interface Props {
  doc: OpenDoc;
  content: string;
  ui: DocUiState;
  onSetMode: (mode: DocMode) => void;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function DocumentPane({ doc, content, ui, onSetMode, onDraftChange, onSave, onCancel }: Props) {
  const isEditing = ui.mode === "edit";
  const dirty = isEditing && ui.draft !== content;

  return (
    <div className="document-pane">
      <div className="document-toolbar">
        <span className="document-path">
          {doc.sourceName} / {doc.relPath}
          {dirty ? " •" : ""}
        </span>
        <div className="document-toolbar-actions">
          {isEditing ? (
            <>
              <button
                type="button"
                className="primary-btn"
                onClick={onSave}
                disabled={!dirty || ui.saving}
                title={`Save (${modKeyLabel}+S)`}
              >
                {ui.saving ? "Saving…" : "Save"}
              </button>
              <button type="button" onClick={onCancel} disabled={ui.saving} title="Cancel (Esc)">
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={ui.mode === "view" ? "toggle-btn toggle-btn--active" : "toggle-btn"}
                onClick={() => onSetMode("view")}
              >
                View
              </button>
              <button
                type="button"
                className={ui.mode === "raw" ? "toggle-btn toggle-btn--active" : "toggle-btn"}
                onClick={() => onSetMode("raw")}
              >
                Raw
              </button>
              <button type="button" onClick={() => onSetMode("edit")}>
                Edit
              </button>
            </>
          )}
        </div>
      </div>

      <div className="document-content">
        {ui.error && <p className="form-error">{ui.error}</p>}
        {ui.mode === "view" && (
          <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        )}
        {ui.mode === "raw" && <pre className="raw-view">{content}</pre>}
        {ui.mode === "edit" && (
          <textarea
            className="edit-view"
            value={ui.draft}
            onChange={(e) => onDraftChange(e.target.value)}
            spellCheck={false}
          />
        )}
      </div>
    </div>
  );
}
