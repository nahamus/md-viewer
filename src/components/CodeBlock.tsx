import { isValidElement, useState, type ReactNode } from "react";

function extractText(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (isValidElement(node)) return extractText((node.props as { children?: ReactNode }).children);
  return "";
}

interface Props {
  children: ReactNode;
}

/** Wraps a rendered <pre><code>...</code></pre> with a VS Code-style hover copy button. */
export function CodeBlock({ children }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(extractText(children).replace(/\n$/, ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permission denied or unavailable — nothing useful to do.
    }
  }

  return (
    <div className="code-block">
      <button
        type="button"
        className="code-copy-btn"
        title={copied ? "Copied!" : "Copy"}
        aria-label="Copy code"
        onClick={handleCopy}
      >
        {copied ? "✓" : "⧉"}
      </button>
      <pre>{children}</pre>
    </div>
  );
}
