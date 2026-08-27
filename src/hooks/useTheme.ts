import { useEffect } from "react";
import { bumpMermaidThemeVersion } from "../lib/mermaidTheme";
import type { ThemePreference } from "../types";

/** Applies a resolved theme preference to <html> as data-theme, which index.css uses to override prefers-color-scheme. */
export function useApplyTheme(theme: ThemePreference) {
  useEffect(() => {
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.dataset.theme = theme;
    // Mermaid reads data-theme itself (see Mermaid.tsx) but only at
    // render/init time, so already-open diagrams need an explicit nudge to
    // pick up the change.
    bumpMermaidThemeVersion();
  }, [theme]);
}
