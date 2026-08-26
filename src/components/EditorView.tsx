import { useRef, useState } from "react";
import { useLineGutter } from "../hooks/useLineGutter";

interface Props {
  value: string;
  onChange: (value: string) => void;
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
        spellCheck={false}
      />
      {/* Hidden measurement twin of .edit-view: same font/padding/wrap rules,
          used only to read each line's real rendered (wrap-aware) height. */}
      <div className="line-metrics-mirror edit-view" ref={mirrorRef} aria-hidden="true" />
    </div>
  );
}
