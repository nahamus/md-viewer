export const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPod|iPad/.test(navigator.userAgent);

export const modKeyLabel = isMac ? "⌘" : "Ctrl";
