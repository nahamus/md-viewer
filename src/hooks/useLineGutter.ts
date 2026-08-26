import { useRef } from "react";

/** Shared line-count + scroll-sync plumbing for a gutter next to a text panel. */
export function useLineGutter(content: string) {
  const gutterRef = useRef<HTMLDivElement>(null);
  const lineCount = content.split("\n").length;

  function syncGutterScroll(scrollTop: number) {
    if (gutterRef.current) gutterRef.current.scrollTop = scrollTop;
  }

  return { gutterRef, lineCount, syncGutterScroll };
}
