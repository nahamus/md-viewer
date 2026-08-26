import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useEscapeKey } from "../hooks/useEscapeKey";

interface Props {
  onClose: () => void;
  children: ReactNode;
}

/**
 * Full-screen overlay rendered via a portal to <body>. A portal matters here
 * specifically because some content that opens a lightbox (the mermaid
 * diagram) sits inside an element with a CSS `transform`, which creates a
 * new containing block for `position: fixed` descendants — without the
 * portal, "full screen" would actually mean "the size of that element."
 */
export function Lightbox({ onClose, children }: Props) {
  useEscapeKey(onClose);

  return createPortal(
    <div className="lightbox-overlay" onClick={onClose}>
      <button type="button" className="lightbox-close" onClick={onClose} title="Close" aria-label="Close">
        ✕
      </button>
      <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
