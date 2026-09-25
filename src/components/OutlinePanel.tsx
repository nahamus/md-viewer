import { useRef, useState } from "react";
import { useClickOutside } from "../hooks/useClickOutside";
import type { HeadingItem } from "../lib/headings";

interface Props {
  headings: HeadingItem[];
  onJump: (heading: HeadingItem) => void;
}

export function OutlinePanel({ headings, onJump }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  if (headings.length === 0) return null;

  const minLevel = Math.min(...headings.map((h) => h.level));

  return (
    <div className="outline-menu" ref={ref}>
      <button
        type="button"
        className="icon-action-btn"
        title="Outline"
        aria-label="Outline"
        onClick={() => setOpen((v) => !v)}
      >
        ☰
      </button>
      {open && (
        <div className="outline-dropdown">
          {headings.map((h, i) => (
            <button
              key={i}
              type="button"
              className="outline-item"
              style={{ paddingLeft: `${(h.level - minLevel) * 14 + 10}px` }}
              title={h.text}
              onClick={() => {
                onJump(h);
                setOpen(false);
              }}
            >
              {h.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
