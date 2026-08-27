import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { getMermaidThemeVersionSnapshot, subscribeMermaidThemeVersion } from "../lib/mermaidTheme";
import { Lightbox } from "./Lightbox";

const ZOOM_STEP = 0.25;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;

// Mermaid's own theme is baked in once at initialize() (below) and cached
// for the session — it won't live-update if the user toggles the theme
// later, same limitation this already had with the OS-level dark mode
// setting. Reading the resolved data-theme attribute (rather than the
// profile's raw preference) means this doesn't need to know anything about
// profiles/storage — it just reflects whatever index.css is actually
// rendering with, "system" included.
function resolvePrefersDark(): boolean {
  const override = document.documentElement.dataset.theme;
  if (override === "light") return false;
  if (override === "dark") return true;
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// mermaid (plus the diagram-type chunks it pulls in) is sizeable, so only
// fetch it the first time a document actually needs to render a diagram.
// Computing the theme lazily here (rather than at module scope) matters:
// this module loads as part of the initial bundle evaluation, before React
// has mounted and applied data-theme to <html> — reading it too early would
// always see the pre-mount default instead of the profile's actual choice.
let mermaidPromise: Promise<typeof import("mermaid")> | null = null;
function loadMermaid() {
  mermaidPromise ??= import("mermaid").then((mod) => {
    mod.default.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: resolvePrefersDark() ? "dark" : "default",
    });
    return mod;
  });
  return mermaidPromise;
}

// Invalidate the cached init as soon as the active theme changes (see
// lib/mermaidTheme) — registered once at module scope, not tied to any one
// <Mermaid> instance's lifecycle, since the cache itself isn't either.
subscribeMermaidThemeVersion(() => {
  mermaidPromise = null;
});

/**
 * mermaid always emits its root <svg> as `width="100%" style="max-width:
 * {natural}px;"` (see calculateSvgSizeAttrs in its source). The inline style
 * beats any CSS rule of ours, so stripping just that fixed the "always
 * tiny" case — but left `width="100%"` behind, which is a *percentage* of
 * whatever CSS gives the SVG's own container. Since that container is
 * itself sized via `width: max-content` (to let wide diagrams grow past the
 * narrow prose column), the two chase each other: max-content needs the
 * child's intrinsic size, but the child's width is "100% of my parent" —
 * there is no intrinsic size to compute, so it collapses. Replacing 100%
 * with the real pixel width mermaid already told us (from that same style
 * attribute) gives the SVG a genuine intrinsic size, which fixes both the
 * sizing and lets a diagram wider than the container actually overflow
 * (and thus scroll) instead of never reaching that width at all.
 */
function fixMermaidSvgSizing(svg: string): { svg: string; naturalWidth: number | null } {
  const match = /max-width:\s*([\d.]+)px;?/i.exec(svg);
  let result = svg.replace(/max-width:\s*[\d.]+px;?/i, "");
  if (match) {
    result = result.replace(/(<svg\b[^>]*\bwidth=")100%(")/i, `$1${match[1]}$2`);
  }
  return { svg: result, naturalWidth: match ? Number(match[1]) : null };
}

interface Props {
  chart: string;
}

/** Callers should render this with `key={chart}` so an edited diagram remounts fresh. */
export function Mermaid({ chart }: Props) {
  const rawId = useId();
  // Folding the theme version into the id (rather than just adding it to the
  // effect's deps) gives mermaid.render() a genuinely new id on every theme
  // change, rather than calling it twice for the same id — mermaid's id
  // tracking for a given render is meant for one-shot use.
  const themeVersion = useSyncExternalStore(subscribeMermaidThemeVersion, getMermaidThemeVersionSnapshot);
  const id = `mermaid-${rawId.replace(/[^a-zA-Z0-9]/g, "")}-${themeVersion}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [naturalWidth, setNaturalWidth] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadMermaid()
      .then(({ default: mermaid }) => mermaid.render(id, chart))
      .then(({ svg }) => {
        if (cancelled) return;
        const fixed = fixMermaidSvgSizing(svg);
        setSvg(fixed.svg);
        setNaturalWidth(fixed.naturalWidth);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [id, chart]);

  // Zooming resizes the SVG's own width (rather than a CSS transform: scale)
  // so the browser recomputes real layout size — which is what makes
  // .diagram-viewport's overflow: auto actually produce a scrollbar for a
  // zoomed-in diagram, instead of just visually clipping it.
  useEffect(() => {
    if (!naturalWidth) return;
    const svgEl = viewportRef.current?.querySelector("svg");
    if (svgEl) svgEl.style.width = `${naturalWidth * zoom}px`;
  }, [zoom, naturalWidth, svg]);

  if (error) {
    return (
      <div className="mermaid-error">
        <p>Couldn't render this diagram:</p>
        <pre>{error}</pre>
      </div>
    );
  }
  if (!svg) {
    return <div className="mermaid-loading">Rendering diagram…</div>;
  }
  // mermaid.render() returns markup it generated from parsing the diagram
  // source (in "strict" security mode, which sanitizes label content) — not
  // a pass-through of arbitrary HTML.
  /* eslint-disable react/no-danger */
  return (
    <>
      <div className="diagram-frame">
        <div className="diagram-toolbar">
          <button
            type="button"
            className="icon-btn"
            title="Zoom out"
            aria-label="Zoom out"
            disabled={zoom <= MIN_ZOOM}
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))}
          >
            −
          </button>
          <span className="diagram-zoom-level">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="icon-btn"
            title="Zoom in"
            aria-label="Zoom in"
            disabled={zoom >= MAX_ZOOM}
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))}
          >
            +
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Reset zoom"
            aria-label="Reset zoom"
            disabled={zoom === 1}
            onClick={() => setZoom(1)}
          >
            ⟲
          </button>
          <button type="button" className="icon-btn" title="Expand" aria-label="Expand" onClick={() => setExpanded(true)}>
            ⛶
          </button>
        </div>
        <div className="diagram-viewport" ref={viewportRef} dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
      {expanded && (
        <Lightbox onClose={() => setExpanded(false)}>
          <div className="mermaid-diagram-large" dangerouslySetInnerHTML={{ __html: svg }} />
        </Lightbox>
      )}
    </>
  );
  /* eslint-enable react/no-danger */
}
