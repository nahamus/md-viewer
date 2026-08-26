import { isValidElement, useCallback, useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { modKeyLabel } from "../lib/platform";
import type { DocMode, DocUiState, OpenDoc } from "../types";
import { EditorView } from "./EditorView";
import { MarkdownImage } from "./MarkdownImage";
import { Mermaid } from "./Mermaid";

function isMermaidCodeElement(node: unknown): boolean {
  if (!isValidElement(node)) return false;
  const className = (node.props as { className?: string }).className;
  return typeof className === "string" && className.includes("language-mermaid");
}

interface Props {
  doc: OpenDoc;
  content: string;
  ui: DocUiState;
  isFolderDoc: boolean;
  onSetMode: (mode: DocMode) => void;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onResolveAsset: (sourceId: string, fromRelPath: string, assetPath: string) => Promise<string | null>;
}

export function DocumentPane({
  doc,
  content,
  ui,
  isFolderDoc,
  onSetMode,
  onDraftChange,
  onSave,
  onCancel,
  onResolveAsset,
}: Props) {
  const isEditing = ui.mode === "edit";
  const dirty = isEditing && ui.draft !== content;

  const resolveAsset = useCallback(
    (assetPath: string) => onResolveAsset(doc.sourceId, doc.relPath, assetPath),
    [doc.sourceId, doc.relPath, onResolveAsset],
  );

  const markdownComponents = useMemo<Components>(
    () => ({
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
      img({ src, alt }) {
        return <MarkdownImage src={src ?? ""} alt={alt} resolveAsset={isFolderDoc ? resolveAsset : undefined} />;
      },
    }),
    [isFolderDoc, resolveAsset],
  );

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
                {ui.saving ? <span className="spinner" /> : "✓"}
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
            <button
              type="button"
              className="icon-action-btn"
              onClick={() => onSetMode("edit")}
              title="Edit"
              aria-label="Edit"
            >
              ✎
            </button>
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
        {ui.mode === "edit" && <EditorView value={ui.draft} onChange={onDraftChange} />}
      </div>
    </div>
  );
}
