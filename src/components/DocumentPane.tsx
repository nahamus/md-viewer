import { isValidElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { extractHeadings } from "../lib/headings";
import { isAbsoluteUrl, resolveRelativePath } from "../lib/folderSource";
import { modKeyLabel } from "../lib/platform";
import { docKey, type DocMode, type DocUiState, type FileOpResult, type OpenDoc } from "../types";
import { CodeBlock } from "./CodeBlock";
import { EditIcon } from "./EditIcon";
import { EditorView } from "./EditorView";
import { MarkdownImage } from "./MarkdownImage";
import { Mermaid } from "./Mermaid";
import { OutlinePanel } from "./OutlinePanel";
import { RefreshIcon } from "./RefreshIcon";

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
  /** Show the per-document Refresh button. Usually mirrors isFolderDoc, but a
   * launched loose file (see useLaunchedFile) can refresh without being a
   * folder-source doc — it has no directory context for asset resolution,
   * which is what isFolderDoc otherwise gates. */
  showRefresh: boolean;
  /** Every known doc's key -> content, used to tell whether a relative markdown
   * link's target actually exists (for both virtual and folder sources). */
  docs: Record<string, string>;
  /** The doc's source's manually-entered path label (see Source.path), if any —
   * browsers never expose a real filesystem path for a picked folder, so this is
   * a user-provided annotation shown as a toolbar tooltip, not a verified path. */
  sourcePathLabel?: string;
  onSetMode: (mode: DocMode) => void;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onResolveAsset: (sourceId: string, fromRelPath: string, assetPath: string) => Promise<string | null>;
  onRefresh: () => Promise<FileOpResult>;
  /** A relative markdown link to another doc in the same source was clicked.
   * `pin: true` (Ctrl/Cmd-click or middle-click) opens it as a new persistent
   * tab; otherwise it reuses the preview tab, mirroring the sidebar. */
  onOpenDocLink: (sourceId: string, relPath: string, opts: { pin: boolean }) => void;
}

export function DocumentPane({
  doc,
  content,
  ui,
  isFolderDoc,
  showRefresh,
  docs,
  sourcePathLabel,
  onSetMode,
  onDraftChange,
  onSave,
  onCancel,
  onResolveAsset,
  onRefresh,
  onOpenDocLink,
}: Props) {
  const isEditing = ui.mode === "edit";
  const dirty = isEditing && ui.draft !== content;
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshErrorKey, setRefreshErrorKey] = useState(doc.key);

  // A doc switch/rename means any stale refresh error belongs to a different
  // file — clear it during render (not an effect) to avoid an extra render.
  if (refreshErrorKey !== doc.key) {
    setRefreshErrorKey(doc.key);
    setRefreshError(null);
  }

  const headings = useMemo(() => extractHeadings(content), [content]);
  const contentRef = useRef<HTMLDivElement>(null);

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshError(null);
    const result = await onRefresh();
    setRefreshing(false);
    if (!result.ok) setRefreshError(result.error);
  }

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
      a({ href, children }) {
        if (!href || href.startsWith("#") || isAbsoluteUrl(href)) {
          const external = !!href && !href.startsWith("#") && isAbsoluteUrl(href);
          return (
            <a href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
              {children}
            </a>
          );
        }

        // remark-rehype percent-encodes link URLs (e.g. spaces -> %20) when
        // converting to hast, so `href` here won't match a relPath containing
        // those characters unless it's decoded back first.
        let rawTarget = href.split("#")[0];
        try {
          rawTarget = decodeURIComponent(rawTarget);
        } catch {
          // Malformed escape (e.g. a literal `%` in the filename) — use as-is.
        }
        const targetPath = resolveRelativePath(doc.relPath, rawTarget);
        const exists = docKey(doc.sourceId, targetPath) in docs;

        if (!exists) {
          return (
            <a href={href} className="markdown-link-broken" title="Not found in this source" onClick={(e) => e.preventDefault()}>
              {children}
            </a>
          );
        }

        return (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault();
              onOpenDocLink(doc.sourceId, targetPath, { pin: e.metaKey || e.ctrlKey });
            }}
            onAuxClick={(e) => {
              if (e.button !== 1) return;
              e.preventDefault();
              onOpenDocLink(doc.sourceId, targetPath, { pin: true });
            }}
          >
            {children}
          </a>
        );
      },
    }),
    [isFolderDoc, resolveAsset, doc.sourceId, doc.relPath, docs, onOpenDocLink],
  );

  return (
    <div className="document-pane">
      <div className="document-toolbar">
        <span className="document-path" title={sourcePathLabel ? `${sourcePathLabel}/${doc.relPath}` : undefined}>
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
              {showRefresh && (
                <button
                  type="button"
                  className="icon-action-btn"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  title="Refresh this document (pick up changes made outside the app)"
                  aria-label="Refresh"
                >
                  {refreshing ? <span className="spinner" /> : <RefreshIcon />}
                </button>
              )}
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
        {refreshError && <p className="form-error">{refreshError}</p>}
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
