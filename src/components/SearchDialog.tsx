import { useMemo, useState } from "react";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { searchDocs } from "../lib/search";
import type { Source } from "../types";

interface Props {
  sources: Source[];
  docs: Record<string, string>;
  onOpen: (source: Source, relPath: string, name: string) => void;
  onClose: () => void;
}

function highlight(text: string, query: string) {
  const q = query.trim();
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

export function SearchDialog({ sources, docs, onOpen, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  useEscapeKey(onClose);

  const results = useMemo(() => searchDocs(docs, sources, query), [docs, sources, query]);

  function openResult(idx: number) {
    const r = results[idx];
    if (!r) return;
    const source = sources.find((s) => s.id === r.sourceId);
    if (!source) return;
    onOpen(source, r.relPath, r.name);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--search" onClick={(e) => e.stopPropagation()}>
        <div className="search-input-row">
          <span className="search-icon">🔍</span>
          <input
            autoFocus
            className="search-input"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            placeholder="Search file names and content…"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelected((s) => Math.min(s + 1, Math.max(results.length - 1, 0)));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelected((s) => Math.max(s - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                openResult(selected);
              }
            }}
          />
        </div>
        <ul className="search-results">
          {results.length === 0 && (
            <li className="search-empty">{Object.keys(docs).length === 0 ? "No documents yet." : "No matches."}</li>
          )}
          {results.map((r, i) => (
            <li key={r.key}>
              <button
                type="button"
                className={`search-result ${i === selected ? "search-result--active" : ""}`}
                onMouseEnter={() => setSelected(i)}
                onClick={() => openResult(i)}
              >
                <div className="search-result-title">
                  <span className="tree-icon">📄</span>
                  <span className="search-result-name">{highlight(r.name, query)}</span>
                  <span className="search-result-source">{r.sourceName}</span>
                </div>
                {r.snippet && <div className="search-result-snippet">{highlight(r.snippet, query)}</div>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
