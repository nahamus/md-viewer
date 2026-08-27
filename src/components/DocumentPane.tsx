import { isValidElement, useCallback, useEffect, useMemo, useRef } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { extractHeadings } from "../lib/headings";
import { modKeyLabel } from "../lib/platform";
import type { DocMode, DocUiState, OpenDoc } from "../types";
import { CodeBlock } from "./CodeBlock";
import { EditIcon } from "./EditIcon";
import { EditorView } from "./EditorView";
import { MarkdownImage } from "./MarkdownImage";
import { Mermaid } from "./Mermaid";
import { OutlinePanel } from "./OutlinePanel";

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

  const headings = useMemo(() => extractHeadings(content), [content]);
  const contentRef = useRef<HTMLDivElement>(null);

  // react-markdown doesn't add heading ids itself. Assigning them via a
  // custom h1..h6 `components` override would need a counter shared across
  // those render calls to match each heading to its slug by position — but
  // mutating a ref during render like that is exactly what React warns
  // against (a parent re-render doesn't guarantee children re-run in the
  // same order/count if anything upstream changes). Doing it here instead,
  // against the already-rendered DOM, sidesteps that: querySelectorAll
  // returns headings in the same document order extractHeadings used, so
  // matching by index is safe post-render even though it wouldn't be during it.
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    const elements = container.querySelectorAll("h1, h2, h3, h4, h5, h6");
    elements.forEach((el, i) => {
      const id = headings[i]?.id;
      if (id) el.id = id;
    });
  }, [headings, ui.mode]);

  const resolveAsset = useCallback(
    (assetPath: string) => onResolveAsset(doc.sourceId, doc.relPath, assetPath),
    [doc.sourceId, doc.relPath, onResolveAsset],
  );

  function jumpToHeading(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

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
        return <CodeBlock>{children}</CodeBlock>;
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
            <>
              <OutlinePanel headings={headings} onJump={jumpToHeading} />
              <button
                type="button"
                className="icon-action-btn"
                onClick={() => onSetMode("edit")}
                title="Edit"
                aria-label="Edit"
              >
                <EditIcon />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="document-content">
        {ui.error && <p className="form-error">{ui.error}</p>}
        {ui.mode === "view" && (
          <div className="markdown-body" ref={contentRef}>
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
