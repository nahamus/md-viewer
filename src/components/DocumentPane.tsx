import { isValidElement } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { modKeyLabel } from "../lib/platform";
import type { DocMode, DocUiState, OpenDoc } from "../types";
import { Mermaid } from "./Mermaid";

function isMermaidCodeElement(node: unknown): boolean {
  if (!isValidElement(node)) return false;
  const className = (node.props as { className?: string }).className;
  return typeof className === "string" && className.includes("language-mermaid");
}

const markdownComponents: Components = {
  code({ className, children }) {
    const language = /language-(\w+)/.exec(className ?? "")?.[1];
    if (language === "mermaid") {
      const chart = String(children).replace(/\n$/, "");
      return <Mermaid key={chart} chart={chart} />;
    }
    return <code className={className}>{children}</code>;
  },
  pre({ children }) {
    // Fenced ```mermaid blocks come in as <pre><code class="language-mermaid">.
    // The Mermaid component (rendered by the `code` override above) already
    // draws its own container, so skip the <pre> wrapper for it — otherwise
    // the diagram ends up boxed inside the code-block styling.
    if (isMermaidCodeElement(children)) return <>{children}</>;
    return <pre>{children}</pre>;
  },
};

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
                className={`icon-action-btn ${dirty ? "icon-action-btn--active" : ""}`}
                onClick={onSave}
                disabled={!dirty || ui.saving}
                title={`Save (${modKeyLabel}+S)`}
                aria-label="Save"
              >
                {ui.saving ? "⏳" : "💾"}
              </button>
              <button
                type="button"
                className="icon-action-btn"
                onClick={onCancel}
                disabled={ui.saving}
                title="Cancel (Esc)"
                aria-label="Cancel"
              >
                ✕
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={`icon-action-btn ${ui.mode === "view" ? "icon-action-btn--active" : ""}`}
                onClick={() => onSetMode("view")}
                title="Rendered view"
                aria-label="Rendered view"
              >
                👁
              </button>
              <button
                type="button"
                className={`icon-action-btn icon-action-btn--mono ${ui.mode === "raw" ? "icon-action-btn--active" : ""}`}
                onClick={() => onSetMode("raw")}
                title="Raw source"
                aria-label="Raw source"
              >
                {"</>"}
              </button>
              <button
                type="button"
                className="icon-action-btn"
                onClick={() => onSetMode("edit")}
                title="Edit"
                aria-label="Edit"
              >
                ✎
              </button>
            </>
          )}
        </div>
      </div>

      <div className="document-content">
        {ui.error && <p className="form-error">{ui.error}</p>}
        {ui.mode === "view" && (
          <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {content}
            </ReactMarkdown>
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
