import { useRef, useState } from "react";
import { useLineGutter } from "../hooks/useLineGutter";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function EditorView({ value, onChange }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { gutterRef, lineCount, syncGutterScroll } = useLineGutter(value);
  const [currentLine, setCurrentLine] = useState(1);

  function updateCurrentLine() {
    const el = textareaRef.current;
    if (!el) return;
    const upToCursor = el.value.slice(0, el.selectionStart);
    setCurrentLine(upToCursor.split("\n").length);
  }

  return (
    <div className="line-numbered-panel">
      <div className="line-gutter" ref={gutterRef} aria-hidden="true">
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i} className={i + 1 === currentLine ? "line-gutter-row line-gutter-row--active" : "line-gutter-row"}>
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
        onScroll={(e) => syncGutterScroll(e.currentTarget.scrollTop)}
        onSelect={updateCurrentLine}
        spellCheck={false}
      />
    </div>
  );
}
