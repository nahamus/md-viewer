import { useEffect, useId, useState } from "react";
import { Lightbox } from "./Lightbox";

const prefersDark = typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;

// mermaid (plus the diagram-type chunks it pulls in) is sizeable, so only
// fetch it the first time a document actually needs to render a diagram.
let mermaidPromise: Promise<typeof import("mermaid")> | null = null;
function loadMermaid() {
  mermaidPromise ??= import("mermaid").then((mod) => {
    mod.default.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: prefersDark ? "dark" : "default",
    });
    return mod;
  });
  return mermaidPromise;
}

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
function fixMermaidSvgSizing(svg: string): string {
  const match = /max-width:\s*([\d.]+)px;?/i.exec(svg);
  let result = svg.replace(/max-width:\s*[\d.]+px;?/i, "");
  if (match) {
    result = result.replace(/(<svg\b[^>]*\bwidth=")100%(")/i, `$1${match[1]}$2`);
  }
  return result;
}

interface Props {
  chart: string;
}

/** Callers should render this with `key={chart}` so an edited diagram remounts fresh. */
export function Mermaid({ chart }: Props) {
  const rawId = useId();
  const id = `mermaid-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadMermaid()
      .then(({ default: mermaid }) => mermaid.render(id, chart))
      .then(({ svg }) => {
        if (!cancelled) setSvg(fixMermaidSvgSizing(svg));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [id, chart]);

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
      <div
        className="mermaid-diagram"
        title="Click to enlarge"
        onClick={() => setExpanded(true)}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {expanded && (
        <Lightbox onClose={() => setExpanded(false)}>
          <div className="mermaid-diagram-large" dangerouslySetInnerHTML={{ __html: svg }} />
        </Lightbox>
      )}
    </>
  );
  /* eslint-enable react/no-danger */
}
