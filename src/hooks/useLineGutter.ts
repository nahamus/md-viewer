import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

/**
 * Shared line-wrap-aware gutter plumbing for a plain <textarea>.
 *
 * A naive gutter renders one row per logical line at a fixed height, but
 * .edit-view soft-wraps long lines — once any line wraps to more than one
 * visual row, a fixed-height gutter drifts out of alignment with the actual
 * text below it. To stay aligned, a hidden mirror element (matching the
 * textarea's font, padding and current width exactly) renders each logical
 * line separately so its real wrapped height can be measured, and the
 * gutter/current-line-highlight use those measured heights instead of
 * assuming one line-height each.
 */
export function useLineGutter(content: string, textareaRef: RefObject<HTMLTextAreaElement | null>) {
  const gutterRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const lines = content.split("\n");
  const [lineHeights, setLineHeights] = useState<number[]>([]);
  const measureRef = useRef(() => {});

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    const mirror = mirrorRef.current;
    if (!textarea || !mirror) return;

    function measure() {
      if (!textarea || !mirror) return;
      mirror.style.width = `${textarea.clientWidth}px`;
      mirror.replaceChildren(
        ...lines.map((line) => {
          const row = document.createElement("div");
          row.textContent = line.length > 0 ? line : " ";
          return row;
        }),
      );
      setLineHeights(Array.from(mirror.children, (child) => child.getBoundingClientRect().height));
    }
    measureRef.current = measure;

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(textarea);
    return () => observer.disconnect();
    // `lines` is re-derived from `content` every render, so `content` alone covers it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, textareaRef]);

  // The very first measurement above, right when the editor first mounts on
  // a cold page load specifically (not a later view->edit toggle in an
  // already-running session), has been seen to come out wrong in a way a
  // plain content edit then fixes just by re-running that same effect —
  // some layout detail isn't settled yet at that exact point, even inside
  // useLayoutEffect. Rather than chase the precise cause (Vite's dev server
  // injects CSS via JS asynchronously on first load, unlike a production
  // build's blocking stylesheet, which is the most likely culprit), retry
  // across the next several frames once per mount — cheap, and a no-op if
  // the first measurement was already correct.
  useEffect(() => {
    let remaining = 5;
    let rafId: number;
    function tick() {
      measureRef.current();
      if (remaining-- > 0) rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  function syncGutterScroll(scrollTop: number) {
    if (gutterRef.current) gutterRef.current.scrollTop = scrollTop;
  }

  return { gutterRef, mirrorRef, lineCount: lines.length, lineHeights, syncGutterScroll };
}
