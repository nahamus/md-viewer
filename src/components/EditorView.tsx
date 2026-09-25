import { useRef, useState } from "react";
import { useLineGutter } from "../hooks/useLineGutter";

interface Props {
  value: string;
  onChange: (value: string) => void;
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

export function EditorView({ value, onChange }: Props) {
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
          syncGutterScroll(e.currentTarget.scrollTop);
          setScrollTop(e.currentTarget.scrollTop);
        }}
        onSelect={updateCurrentLine}
        onKeyDown={handleTabKey}
        spellCheck={false}
      />
      {/* Hidden measurement twin of .edit-view: same font/padding/wrap rules,
          used only to read each line's real rendered (wrap-aware) height. */}
      <div className="line-metrics-mirror edit-view" ref={mirrorRef} aria-hidden="true" />
    </div>
  );
}
