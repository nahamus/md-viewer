import { useEffect, useState } from "react";
import { isAbsoluteUrl } from "../lib/folderSource";
import { Lightbox } from "./Lightbox";

interface Props {
  src: string;
  alt?: string;
  /** Present only when the current document belongs to a "folder" source. */
  resolveAsset?: (assetPath: string) => Promise<string | null>;
}

export function MarkdownImage({ src, alt, resolveAsset }: Props) {
  const needsResolve = !!resolveAsset && !isAbsoluteUrl(src);
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(needsResolve ? null : src);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!needsResolve) {
      setResolvedSrc(src);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setResolvedSrc(null);
    setError(false);
    resolveAsset!(src).then((url) => {
      if (cancelled) return;
      if (url) {
        objectUrl = url;
        setResolvedSrc(url);
      } else {
        setError(true);
      }
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // `resolveAsset` is expected to be a stable reference (memoized by the
    // caller per-document) — omitted from deps since `needsResolve` already
    // captures whether it's even present, and including a freshly-created
    // function here would re-fetch the image on every unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, needsResolve]);

  if (error) return <span className="markdown-image-error">Couldn't load image: {src}</span>;
  if (!resolvedSrc) return <span className="markdown-image-loading" aria-label={`Loading image${alt ? `: ${alt}` : ""}`} />;

  return (
    <>
      <img
        src={resolvedSrc}
        alt={alt}
        className="markdown-image"
        onClick={() => setExpanded(true)}
        title="Click to enlarge"
      />
      {expanded && (
        <Lightbox onClose={() => setExpanded(false)}>
          <img src={resolvedSrc} alt={alt} />
        </Lightbox>
      )}
    </>
  );
}
