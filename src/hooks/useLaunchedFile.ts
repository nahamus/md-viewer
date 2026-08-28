import { useCallback, useEffect, useState } from "react";
import type { DocMode } from "../types";

export interface LaunchedFile {
  handle: FileSystemFileHandle;
  name: string;
  content: string;
  mode: DocMode;
  draft: string;
  saving: boolean;
  error: string | null;
}

/**
 * Consumes a file the OS handed this (installed) app directly — via
 * "Open with md-viewer", or double-clicking a .md file if it's set as the
 * default handler (see the `file_handlers` entry in manifest.webmanifest).
 *
 * This deliberately stays outside the sources/docs system entirely: the app
 * only gets a handle to the one file, never its containing folder, so there's
 * nothing to scan or list, and nothing gets added to the sidebar or persisted
 * anywhere — closing it (or reloading) forgets it completely. That's by
 * design: opening a file from the OS is a one-off look (with the same
 * quick-fix editing already available elsewhere in the app), not adopting it
 * as something this app now manages.
 */
export function useLaunchedFile() {
  const [file, setFile] = useState<LaunchedFile | null>(null);

  useEffect(() => {
    const launchQueue = window.launchQueue;
    if (!launchQueue) return;
    launchQueue.setConsumer(async (params) => {
      const handle = params.files[0];
      if (!handle) return;
      try {
        const content = await (await handle.getFile()).text();
        setFile({ handle, name: handle.name, content, mode: "view", draft: content, saving: false, error: null });
      } catch (err) {
        setFile({
          handle,
          name: handle.name,
          content: "",
          mode: "view",
          draft: "",
          saving: false,
          error: `Couldn't read this file: ${(err as Error).message}`,
        });
      }
    });
  }, []);

  const setMode = useCallback((mode: DocMode) => {
    setFile((prev) => (prev ? { ...prev, mode, draft: mode === "edit" ? prev.content : prev.draft } : prev));
  }, []);

  const setDraft = useCallback((value: string) => {
    setFile((prev) => (prev ? { ...prev, draft: value } : prev));
  }, []);

  const cancel = useCallback(() => {
    setFile((prev) => (prev ? { ...prev, mode: "view", draft: prev.content } : prev));
  }, []);

  const close = useCallback(() => setFile(null), []);

  async function refresh() {
    if (!file) return;
    try {
      const content = await (await file.handle.getFile()).text();
      setFile((prev) => (prev ? { ...prev, content, error: null } : prev));
    } catch (err) {
      setFile((prev) => (prev ? { ...prev, error: (err as Error).message } : prev));
    }
  }

  async function save() {
    if (!file) return;
    const draft = file.draft;
    setFile((prev) => (prev ? { ...prev, saving: true, error: null } : prev));
    try {
      const writable = await file.handle.createWritable();
      await writable.write(draft);
      await writable.close();
      setFile((prev) => (prev ? { ...prev, content: draft, mode: "view", saving: false } : prev));
    } catch (err) {
      setFile((prev) => (prev ? { ...prev, saving: false, error: (err as Error).message } : prev));
    }
  }

  return { file, setMode, setDraft, cancel, refresh, save, close };
}
