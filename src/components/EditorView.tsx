import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { useLineGutter } from "../hooks/useLineGutter";

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Fires on every scroll with the container's scroll position as a 0..1
   * fraction, so the caller can restore roughly the same place when View
   * mode is switched back to. */
  onScrollFractionChange?: (fraction: number) => void;
}

export interface EditorViewHandle {
  /** Moves the cursor to (and scrolls to) the start of a given 0-indexed line. */
  scrollToLine: (line: number) => void;
  /** Scrolls to a 0..1 fraction of the document, mirroring onScrollFractionChange. */
  scrollToFraction: (fraction: number) => void;
}

const INDENT = "    ";

/** Replaces [start, end) via execCommand so the browser's native undo stack
 * (Ctrl/Cmd+Z) still sees it as a real edit, not a React-only state change.
 * Falls back to a manual splice + synthetic input event (which React's
 * controlled textarea does pick up) if execCommand is unavailable. */
function replaceRange(el: HTMLTextAreaElement, start: number, end: number, replacement: string) {
  el.setSelectionRange(start, end);
  const applied =
    typeof document.execCommand === "function" &&
    (() => {
      try {
        return document.execCommand("insertText", false, replacement);
      } catch {
        return false;
      }
    })();
  if (!applied) {
    const text = el.value;
    el.value = text.slice(0, start) + replacement + text.slice(end);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.setSelectionRange(start + replacement.length, start + replacement.length);
  }
}

/** Escape un-traps keyboard focus from the textarea: Tab no longer moves
 * focus out (see handleTabKey below), so without this a keyboard user could
 * only leave via the app-level Escape handler, which discards the edit.
 * Blurring first (and swallowing this keypress) gives a plain "leave the
 * field" action; a second Escape, now that focus has moved on, reaches that
 * app-level handler normally and cancels the edit as documented. */
function handleEscapeKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
  if (e.key !== "Escape") return;
  e.stopPropagation();
  e.currentTarget.blur();
}

/** Tab/Shift+Tab: insert/remove one indent level, like any code/text editor —
 * a plain <textarea> only ever moves focus on Tab by default. A cursor (or a
 * same-line selection) indents in place; a selection spanning lines indents
 * or outdents every line it touches, and keeps them selected so repeated
 * Tab presses keep working on the same block. */
function handleTabKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
  if (e.key !== "Tab") return;
  e.preventDefault();
  const el = e.currentTarget;
  const { selectionStart, selectionEnd, value: text } = el;
  const selectionSpansLines = text.slice(selectionStart, selectionEnd).includes("\n");

  if (!selectionSpansLines && !e.shiftKey) {
    replaceRange(el, selectionStart, selectionEnd, INDENT);
    return;
  }

  const blockStart = text.lastIndexOf("\n", selectionStart - 1) + 1;
  const nextBreak = text.indexOf("\n", Math.max(selectionEnd - 1, blockStart));
  const blockEnd = nextBreak === -1 ? text.length : nextBreak;
  const lines = text.slice(blockStart, blockEnd).split("\n");

  if (e.shiftKey) {
    let firstLineRemoved = 0;
    const newLines = lines.map((line, i) => {
      const removed = line.match(/^ {1,4}/)?.[0].length ?? 0;
      if (i === 0) firstLineRemoved = removed;
      return line.slice(removed);
    });
    const replacement = newLines.join("\n");
    replaceRange(el, blockStart, blockEnd, replacement);
    requestAnimationFrame(() => {
      el.setSelectionRange(Math.max(blockStart, selectionStart - firstLineRemoved), blockStart + replacement.length);
    });
    return;
  }

  const replacement = lines.map((line) => INDENT + line).join("\n");
  replaceRange(el, blockStart, blockEnd, replacement);
  requestAnimationFrame(() => {
    el.setSelectionRange(selectionStart + INDENT.length, blockStart + replacement.length);
  });
}

const UNORDERED_RE = /^(\s*)([-*+])(\s+)(\[[ xX]\]\s+)?/;
const ORDERED_RE = /^(\s*)(\d+)([.)])(\s+)/;
const QUOTE_RE = /^(\s*>+ ?)/;

/** Enter continues a list/blockquote item onto the next line, like any note
 * or writing app — plain CommonMark has no such affordance, you'd otherwise
 * retype the marker by hand on every line. An empty item (Enter pressed on
 * a bare marker with nothing typed after it) breaks out of the list instead
 * of inserting another empty one, matching the same convention. */
function handleEnterKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
  if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
  const el = e.currentTarget;
  const { selectionStart, selectionEnd, value: text } = el;
  if (selectionStart !== selectionEnd) return;

  const lineStart = text.lastIndexOf("\n", selectionStart - 1) + 1;
  const nextBreak = text.indexOf("\n", selectionStart);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  const currentLine = text.slice(lineStart, lineEnd);
  const beforeCursor = text.slice(lineStart, selectionStart);

  const unordered = UNORDERED_RE.exec(beforeCursor);
  const ordered = !unordered ? ORDERED_RE.exec(beforeCursor) : null;
  const quote = !unordered && !ordered ? QUOTE_RE.exec(beforeCursor) : null;
  const match = unordered ?? ordered ?? quote;
  if (!match) return;

  e.preventDefault();

  if (currentLine.trim() === match[0].trim()) {
    replaceRange(el, lineStart, lineStart + currentLine.length, "");
    return;
  }

  let nextMarker = match[0];
  if (ordered) {
    nextMarker = `${ordered[1]}${Number(ordered[2]) + 1}${ordered[3]}${ordered[4]}`;
  } else if (unordered?.[4]) {
    nextMarker = `${unordered[1]}${unordered[2]}${unordered[3]}[ ] `;
  }

  replaceRange(el, selectionStart, selectionEnd, `\n${nextMarker}`);
}

/** Wraps the selection (or inserts placeholder text) in `before`/`after`
 * markers — e.g. `**`/`**` for bold — and leaves the placeholder selected
 * when there was nothing selected, so typing immediately replaces it. */
function wrapSelection(el: HTMLTextAreaElement, before: string, after: string, placeholder: string) {
  const { selectionStart, selectionEnd, value: text } = el;
  const hasSelection = selectionStart !== selectionEnd;
  const inner = hasSelection ? text.slice(selectionStart, selectionEnd) : placeholder;
  replaceRange(el, selectionStart, selectionEnd, `${before}${inner}${after}`);
  if (!hasSelection) {
    requestAnimationFrame(() => {
      el.setSelectionRange(selectionStart + before.length, selectionStart + before.length + inner.length);
    });
  }
}

function insertLink(el: HTMLTextAreaElement) {
  const { selectionStart, selectionEnd, value: text } = el;
  const hasSelection = selectionStart !== selectionEnd;
  const linkText = hasSelection ? text.slice(selectionStart, selectionEnd) : "text";
  replaceRange(el, selectionStart, selectionEnd, `[${linkText}](url)`);
  requestAnimationFrame(() => {
    const urlStart = selectionStart + linkText.length + 3; // "[" + linkText + "]("
    el.setSelectionRange(urlStart, urlStart + 3); // select the "url" placeholder
  });
}

/** Ctrl/Cmd+B/I/K: bold/italic/link, like any text editor. Ctrl/Cmd+B is
 * also this app's global sidebar-toggle shortcut — stopPropagation while
 * the editor has focus so it doesn't also fire while typing. */
function handleFormatShortcuts(e: React.KeyboardEvent<HTMLTextAreaElement>) {
  if (!(e.metaKey || e.ctrlKey)) return;
  const el = e.currentTarget;
  switch (e.key.toLowerCase()) {
    case "b":
      e.preventDefault();
      e.stopPropagation();
      wrapSelection(el, "**", "**", "bold text");
      return;
    case "i":
      e.preventDefault();
      wrapSelection(el, "*", "*", "italic text");
      return;
    case "k":
      e.preventDefault();
      insertLink(el);
      return;
  }
}

export const EditorView = forwardRef<EditorViewHandle, Props>(function EditorView(
  { value, onChange, onScrollFractionChange },
  ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { gutterRef, mirrorRef, lineCount, lineHeights, syncGutterScroll } = useLineGutter(value, textareaRef);
  const [currentLine, setCurrentLine] = useState(1);
  const [scrollTop, setScrollTop] = useState(0);

  function updateCurrentLine() {
    const el = textareaRef.current;
    if (!el) return;
    const upToCursor = el.value.slice(0, el.selectionStart);
    setCurrentLine(upToCursor.split("\n").length);
  }

  function scrollTo(nextScrollTop: number) {
    const el = textareaRef.current;
    if (!el) return;
    el.scrollTop = nextScrollTop;
    syncGutterScroll(nextScrollTop);
    setScrollTop(nextScrollTop);
  }

  useImperativeHandle(
    ref,
    () => ({
      scrollToLine(line) {
        const el = textareaRef.current;
        if (!el) return;
        const lines = value.split("\n");
        const clamped = Math.max(0, Math.min(line, lines.length - 1));
        const offset = lines.slice(0, clamped).reduce((sum, l) => sum + l.length + 1, 0);
        el.focus();
        el.setSelectionRange(offset, offset);
        setCurrentLine(clamped + 1);
        const targetTop = lineHeights.slice(0, clamped).reduce((sum, h) => sum + h, 0);
        scrollTo(Math.max(0, targetTop - el.clientHeight / 3));
      },
      scrollToFraction(fraction) {
        const el = textareaRef.current;
        if (!el) return;
        scrollTo(fraction * (el.scrollHeight - el.clientHeight));
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [value, lineHeights],
  );

  const highlightTop = lineHeights.slice(0, currentLine - 1).reduce((sum, h) => sum + h, 0);
  const highlightHeight = lineHeights[currentLine - 1];

  return (
    <div className="line-numbered-panel">
      {highlightHeight !== undefined && (
        <div
          className="current-line-highlight"
          style={{ top: 12 + highlightTop - scrollTop, height: highlightHeight }}
        />
      )}
      <div className="line-gutter" ref={gutterRef} aria-hidden="true">
        {Array.from({ length: lineCount }, (_, i) => (
          <div
            key={i}
            className={i + 1 === currentLine ? "line-gutter-row line-gutter-row--active" : "line-gutter-row"}
            style={{ height: lineHeights[i] }}
          >
            {i + 1}
          </div>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        className="edit-view"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          updateCurrentLine();
        }}
        onScroll={(e) => {
          const el = e.currentTarget;
          syncGutterScroll(el.scrollTop);
          setScrollTop(el.scrollTop);
          const max = el.scrollHeight - el.clientHeight;
          onScrollFractionChange?.(max > 0 ? el.scrollTop / max : 0);
        }}
        onSelect={updateCurrentLine}
        onKeyDown={(e) => {
          handleEscapeKey(e);
          handleTabKey(e);
          handleEnterKey(e);
          handleFormatShortcuts(e);
        }}
        spellCheck={false}
      />
      {/* Hidden measurement twin of .edit-view: same font/padding/wrap rules,
          used only to read each line's real rendered (wrap-aware) height. */}
      <div className="line-metrics-mirror edit-view" ref={mirrorRef} aria-hidden="true" />
    </div>
  );
});
