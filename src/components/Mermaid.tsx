import { useEffect, useId, useState } from "react";

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

interface Props {
  chart: string;
}

/** Callers should render this with `key={chart}` so an edited diagram remounts fresh. */
export function Mermaid({ chart }: Props) {
  const rawId = useId();
  const id = `mermaid-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadMermaid()
      .then(({ default: mermaid }) => mermaid.render(id, chart))
      .then(({ svg }) => {
        if (!cancelled) setSvg(svg);
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
  // eslint-disable-next-line react/no-danger
  return <div className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: svg }} />;
}
