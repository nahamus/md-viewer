import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as folderSource from "../lib/folderSource";
import * as handles from "../storage/handles";
import * as storage from "../storage/store";
import {
  docKey,
  type DocMode,
  type DocUiState,
  type FileOpResult,
  type FolderStatus,
  type OpenDoc,
  type UserData,
  type UserProfile,
} from "../types";

/** Drops back to view mode, discarding any in-progress draft edits. */
function toViewMode(ui: DocUiState, content: string): DocUiState {
  return { ...ui, mode: "view", draft: content };
}

/** Which tab should become active after removing the one at `key` (if it was active). */
function nextActiveKeyAfterRemoving(
  key: string,
  pinnedTabs: OpenDoc[],
  previewTab: OpenDoc | null,
  activeKey: string | null,
): string | null {
  if (activeKey !== key) return activeKey;
  const pinnedIdx = pinnedTabs.findIndex((t) => t.key === key);
  if (pinnedIdx !== -1) {
    return pinnedTabs[pinnedIdx + 1]?.key ?? pinnedTabs[pinnedIdx - 1]?.key ?? previewTab?.key ?? null;
  }
  if (previewTab?.key === key) {
    return pinnedTabs[pinnedTabs.length - 1]?.key ?? null;
  }
  return activeKey;
}

function withoutPrefix<T>(map: Record<string, T>, prefix: string): Record<string, T> {
  const next = { ...map };
  for (const key of Object.keys(next)) if (key.startsWith(prefix)) delete next[key];
  return next;
}

export function useAppState() {
  const [users, setUsers] = useState(() => storage.bootstrap().users);
  const [currentUserId, setCurrentUserId] = useState(() => storage.bootstrap().currentUserId);
  const [userData, setUserData] = useState<UserData>(() => storage.loadUserData(currentUserId));

  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
    () => new Set(storage.loadSession(currentUserId).expandedKeys),
  );
  const [pinnedTabs, setPinnedTabs] = useState<OpenDoc[]>(() => storage.loadSession(currentUserId).pinnedTabs);
  const [previewTab, setPreviewTab] = useState<OpenDoc | null>(() => storage.loadSession(currentUserId).previewTab);
  const [activeKey, setActiveKey] = useState<string | null>(() => storage.loadSession(currentUserId).activeKey);
  const [sidebarVisible, setSidebarVisible] = useState(() => storage.loadSession(currentUserId).sidebarVisible);
  const [sidebarWidth, setSidebarWidth] = useState(() => storage.loadSession(currentUserId).sidebarWidth);
  const [docsUi, setDocsUi] = useState<Record<string, DocUiState>>({});

  // "folder" sources are backed by a real picked directory; their handle and
  // content live only in memory for this session (never in localStorage —
  // the files on disk are the persistence), keyed by source id / docKey.
  const [folderHandles, setFolderHandles] = useState<Record<string, FileSystemDirectoryHandle>>({});
  const [folderDocs, setFolderDocs] = useState<Record<string, string>>({});
  const [folderStatus, setFolderStatus] = useState<Record<string, FolderStatus>>({});

  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [newFileDialogOpen, setNewFileDialogOpen] = useState(false);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);

  const docs = useMemo(() => ({ ...userData.docs, ...folderDocs }), [userData.docs, folderDocs]);

  const refreshUserData = useCallback(() => {
    setUserData(storage.loadUserData(currentUserId));
  }, [currentUserId]);

  const userDataRef = useRef(userData);
  useEffect(() => {
    userDataRef.current = userData;
  }, [userData]);

  // --- Folder sources ---

  const loadFolderContents = useCallback(async (sourceId: string, handle: FileSystemDirectoryHandle) => {
    const tree = await folderSource.scanMdFiles(handle);
    const paths = folderSource.collectFilePaths(tree);
    const entries = await Promise.all(
      paths.map(async (p) => [docKey(sourceId, p), await folderSource.readMdFile(handle, p)] as const),
    );
    setFolderDocs((prev) => ({ ...withoutPrefix(prev, `${sourceId}::`), ...Object.fromEntries(entries) }));
  }, []);

  // Silently reconnect this profile's folder sources whenever it's loaded
  // (on mount, and after switching profiles).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const folderSources = userDataRef.current.sources.filter((s) => s.kind === "folder");
      // Mark all of them "connecting" up front (rather than one at a time as
      // the loop below reaches each) so the sidebar shows a loading state
      // instead of treating an as-yet-unprocessed source as "disconnected".
      if (folderSources.length > 0) {
        setFolderStatus((prev) => {
          const next = { ...prev };
          for (const source of folderSources) next[source.id] = "connecting";
          return next;
        });
      }
      for (const source of folderSources) {
        if (!folderSource.folderSourcesSupported) {
          if (!cancelled) setFolderStatus((prev) => ({ ...prev, [source.id]: "unsupported" }));
          continue;
        }
        const handle = await handles.loadHandle(source.id);
        if (cancelled) return;
        if (!handle) {
          setFolderStatus((prev) => ({ ...prev, [source.id]: "disconnected" }));
          continue;
        }
        setFolderHandles((prev) => ({ ...prev, [source.id]: handle }));
        const granted = await folderSource.verifyPermission(handle, true);
        if (cancelled) return;
        if (!granted) {
          setFolderStatus((prev) => ({ ...prev, [source.id]: "disconnected" }));
          continue;
        }
        await loadFolderContents(source.id, handle);
        if (!cancelled) setFolderStatus((prev) => ({ ...prev, [source.id]: "connected" }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUserId, loadFolderContents]);

  const addFolderSource = useCallback(async (): Promise<FileOpResult> => {
    if (!folderSource.folderSourcesSupported) {
      const error = folderSource.isBraveBrowser
        ? "Enable brave://flags/#file-system-access-api and relaunch Brave, or add a virtual source instead."
        : "This browser can't pick real folders — try Chrome, Edge, or add a virtual source instead.";
      return { ok: false, error };
    }
    let handle: FileSystemDirectoryHandle;
    try {
      handle = await window.showDirectoryPicker();
    } catch (err) {
      if ((err as Error).name === "AbortError") return { ok: true };
      return { ok: false, error: (err as Error).message };
    }

    // The picker gives no stable path to compare against — isSameEntry is
    // the only reliable way to tell "the same folder, picked again" from
    // "a different folder that happens to share a name".
    for (const existing of userData.sources) {
      if (existing.kind !== "folder") continue;
      const existingHandle = folderHandles[existing.id] ?? (await handles.loadHandle(existing.id));
      if (existingHandle && (await handle.isSameEntry(existingHandle))) {
        return { ok: false, error: `This folder is already added as "${existing.name}".` };
      }
    }

    // Don't default path to the folder's name — it's identical to the label
    // above it and would just show the same text twice in the sidebar.
    const source = storage.addSource(currentUserId, handle.name, undefined, "folder");
    refreshUserData();
    await handles.saveHandle(source.id, handle);
    setFolderHandles((prev) => ({ ...prev, [source.id]: handle }));
    try {
      await loadFolderContents(source.id, handle);
    } catch (err) {
      return { ok: false, error: `Folder added, but couldn't read its contents: ${(err as Error).message}` };
    }
    setFolderStatus((prev) => ({ ...prev, [source.id]: "connected" }));
    return { ok: true };
  }, [currentUserId, refreshUserData, loadFolderContents, userData.sources, folderHandles]);

  const reconnectFolderSource = useCallback(
    async (id: string): Promise<{ ok: true } | { ok: false; error: string }> => {
      setFolderStatus((prev) => ({ ...prev, [id]: "connecting" }));
      const handle = folderHandles[id] ?? (await handles.loadHandle(id));
      if (!handle) return { ok: false, error: "This folder's connection was lost — remove it and add it again." };
      const granted = await folderSource.verifyPermission(handle, false);
      if (!granted) {
        setFolderStatus((prev) => ({ ...prev, [id]: "disconnected" }));
        return { ok: false, error: "Permission wasn't granted." };
      }
      setFolderHandles((prev) => ({ ...prev, [id]: handle }));
      try {
        await loadFolderContents(id, handle);
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
      setFolderStatus((prev) => ({ ...prev, [id]: "connected" }));
      return { ok: true };
    },
    [folderHandles, loadFolderContents],
  );

  /** Re-scans and re-reads a connected folder source's files, to pick up changes made outside the app. */
  const refreshFolderSource = useCallback(
    async (id: string): Promise<{ ok: true } | { ok: false; error: string }> => {
      const handle = folderHandles[id];
      if (!handle || folderStatus[id] !== "connected") {
        return { ok: false, error: "This folder isn't connected — click Reconnect." };
      }
      try {
        await loadFolderContents(id, handle);
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
      return { ok: true };
    },
    [folderHandles, folderStatus, loadFolderContents],
  );

  /** Re-reads a single folder-source document from disk, to pick up an external change without rescanning the whole tree. */
  const refreshDoc = useCallback(
    async (sourceId: string, relPath: string): Promise<FileOpResult> => {
      const source = userData.sources.find((s) => s.id === sourceId);
      // Virtual sources live entirely in this browser's storage — there's no
      // external copy to have drifted, so there's nothing to refresh.
      if (source?.kind !== "folder") return { ok: true };
      const handle = folderHandles[sourceId];
      if (!handle || folderStatus[sourceId] !== "connected") {
        return { ok: false, error: "This folder isn't connected — click Reconnect in the sidebar." };
      }
      try {
        const content = await folderSource.readMdFile(handle, relPath);
        setFolderDocs((prev) => ({ ...prev, [docKey(sourceId, relPath)]: content }));
        return { ok: true };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
    [userData.sources, folderHandles, folderStatus],
  );

  /** Resolves a relative asset path (e.g. an image) referenced from a folder-source document. */
  const resolveFolderAsset = useCallback(
    async (sourceId: string, fromRelPath: string, assetPath: string): Promise<string | null> => {
      const handle = folderHandles[sourceId];
      if (!handle || folderStatus[sourceId] !== "connected") return null;
      try {
        const resolvedPath = folderSource.resolveRelativePath(fromRelPath, assetPath);
        return await folderSource.readFileAsObjectUrl(handle, resolvedPath);
      } catch {
        return null;
      }
    },
    [folderHandles, folderStatus],
  );

  // --- Profiles ---

  const switchUser = useCallback((id: string) => {
    storage.setCurrentUserId(id);
    setCurrentUserId(id);
    setUserData(storage.loadUserData(id));
    const session = storage.loadSession(id);
    setPinnedTabs(session.pinnedTabs);
    setPreviewTab(session.previewTab);
    setActiveKey(session.activeKey);
    setExpandedKeys(new Set(session.expandedKeys));
    setSidebarVisible(session.sidebarVisible);
    setSidebarWidth(session.sidebarWidth);
    setDocsUi({});
    setFolderHandles({});
    setFolderDocs({});
    setFolderStatus({});
  }, []);

  const createUserProfile = useCallback(
    (profile: Omit<UserProfile, "id">) => {
      const user = storage.createUser(profile);
      setUsers((prev) => [...prev, user]);
      switchUser(user.id);
    },
    [switchUser],
  );

  const updateUserProfile = useCallback((id: string, updates: Partial<Omit<UserProfile, "id">>) => {
    setUsers(storage.updateUser(id, updates));
  }, []);

  const deleteUserProfile = useCallback(
    (id: string) => {
      const folderSourceIds = storage
        .loadUserData(id)
        .sources.filter((s) => s.kind === "folder")
        .map((s) => s.id);
      for (const sourceId of folderSourceIds) {
        handles.deleteHandle(sourceId).catch(() => {});
      }

      const remaining = storage.deleteUser(id);
      if (remaining.length === 0) {
        const fresh = storage.createUser({ name: "" });
        setUsers([fresh]);
        switchUser(fresh.id);
        return;
      }
      setUsers(remaining);
      if (id === currentUserId) switchUser(remaining[0].id);
    },
    [currentUserId, switchUser],
  );

  // --- Sources ---

  const addSource = useCallback(
    (name: string, path?: string): FileOpResult => {
      const trimmed = name.trim();
      const isDuplicate = userData.sources.some(
        (s) => s.kind !== "folder" && s.name.trim().toLowerCase() === trimmed.toLowerCase(),
      );
      if (isDuplicate) return { ok: false, error: `A source named "${trimmed}" already exists.` };
      storage.addSource(currentUserId, trimmed, path);
      refreshUserData();
      return { ok: true };
    },
    [currentUserId, refreshUserData, userData.sources],
  );

  const updateSource = useCallback(
    (id: string, updates: { name: string; path?: string }) => {
      storage.updateSource(currentUserId, id, updates);
      refreshUserData();
    },
    [currentUserId, refreshUserData],
  );

  const removeSource = useCallback(
    (id: string) => {
      storage.removeSource(currentUserId, id);
      refreshUserData();
      handles.deleteHandle(id).catch(() => {});

      const prefix = `${id}::`;
      setPinnedTabs((prev) => prev.filter((t) => !t.key.startsWith(prefix)));
      setPreviewTab((prev) => (prev && prev.key.startsWith(prefix) ? null : prev));
      setActiveKey((prev) => (prev && prev.startsWith(prefix) ? null : prev));
      setDocsUi((prev) => withoutPrefix(prev, prefix));
      setFolderDocs((prev) => withoutPrefix(prev, prefix));
      setFolderHandles((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setFolderStatus((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
    [currentUserId, refreshUserData],
  );

  // --- Documents ---

  const toggleExpand = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => setExpandedKeys(new Set()), []);

  const createFile = useCallback(
    async (sourceId: string, relPath: string): Promise<{ ok: true } | { ok: false; error: string }> => {
      const key = docKey(sourceId, relPath);
      const source = userData.sources.find((s) => s.id === sourceId);
      if (source?.kind === "folder") {
        const handle = folderHandles[sourceId];
        if (!handle || folderStatus[sourceId] !== "connected") {
          return { ok: false, error: "This folder isn't connected — click Reconnect in the sidebar." };
        }
        try {
          const result = await folderSource.createMdFile(handle, relPath);
          if (!result.ok) return result;
          setFolderDocs((prev) => ({ ...prev, [key]: "" }));
          return { ok: true };
        } catch (err) {
          return { ok: false, error: (err as Error).message };
        }
      }
      try {
        const next = storage.createDoc(currentUserId, key);
        if (!next) return { ok: false, error: "A file with that name already exists." };
        setUserData(next);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
    [currentUserId, userData.sources, folderHandles, folderStatus],
  );

  const deleteDoc = useCallback(
    async (sourceId: string, relPath: string): Promise<{ ok: true } | { ok: false; error: string }> => {
      const key = docKey(sourceId, relPath);
      const source = userData.sources.find((s) => s.id === sourceId);
      if (source?.kind === "folder") {
        const handle = folderHandles[sourceId];
        if (!handle || folderStatus[sourceId] !== "connected") {
          return { ok: false, error: "This folder isn't connected — click Reconnect in the sidebar." };
        }
        try {
          await folderSource.deleteMdFile(handle, relPath);
        } catch (err) {
          return { ok: false, error: (err as Error).message };
        }
        setFolderDocs((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      } else {
        setUserData(storage.deleteDoc(currentUserId, key));
      }

      const wasPinned = pinnedTabs.some((t) => t.key === key);
      const wasPreview = previewTab?.key === key;
      const nextActive = nextActiveKeyAfterRemoving(key, pinnedTabs, previewTab, activeKey);
      if (wasPinned) setPinnedTabs((prev) => prev.filter((t) => t.key !== key));
      if (wasPreview) setPreviewTab(null);
      if (activeKey === key) setActiveKey(nextActive);
      setDocsUi((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });

      return { ok: true };
    },
    [currentUserId, userData.sources, folderHandles, folderStatus, pinnedTabs, previewTab, activeKey],
  );

  const renameDoc = useCallback(
    async (
      sourceId: string,
      relPath: string,
      newRelPath: string,
      newName: string,
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const oldKey = docKey(sourceId, relPath);
      const newKey = docKey(sourceId, newRelPath);
      if (oldKey === newKey) return { ok: true };
      if (docs[newKey] !== undefined) return { ok: false, error: "A file with that name already exists." };

      const source = userData.sources.find((s) => s.id === sourceId);
      if (source?.kind === "folder") {
        const handle = folderHandles[sourceId];
        if (!handle || folderStatus[sourceId] !== "connected") {
          return { ok: false, error: "This folder isn't connected — click Reconnect in the sidebar." };
        }
        try {
          await folderSource.renameMdFile(handle, relPath, newRelPath);
        } catch (err) {
          return { ok: false, error: (err as Error).message };
        }
        setFolderDocs((prev) => {
          const next = { ...prev };
          next[newKey] = next[oldKey];
          delete next[oldKey];
          return next;
        });
      } else {
        const next = storage.renameDoc(currentUserId, oldKey, newKey);
        if (!next) return { ok: false, error: "A file with that name already exists." };
        setUserData(next);
      }

      // Carry over the tab/edit state for this doc to its new key, rather
      // than closing it — a rename shouldn't feel like closing one file and
      // opening a different one.
      setPinnedTabs((prev) =>
        prev.map((t) => (t.key === oldKey ? { ...t, key: newKey, relPath: newRelPath, name: newName } : t)),
      );
      setPreviewTab((prev) =>
        prev?.key === oldKey ? { ...prev, key: newKey, relPath: newRelPath, name: newName } : prev,
      );
      setActiveKey((prev) => (prev === oldKey ? newKey : prev));
      setDocsUi((prev) => {
        if (!prev[oldKey]) return prev;
        const next = { ...prev };
        next[newKey] = next[oldKey];
        delete next[oldKey];
        return next;
      });

      return { ok: true };
    },
    [currentUserId, userData.sources, folderHandles, folderStatus, docs],
  );

  const openDoc = useCallback(
    (source: { id: string; name: string }, relPath: string, name: string, opts?: { pin?: boolean; mode?: DocMode }) => {
      const key = docKey(source.id, relPath);
      const doc: OpenDoc = {
        key,
        sourceId: source.id,
        sourceName: source.name,
        relPath,
        name,
        pinned: !!opts?.pin,
      };

      setPinnedTabs((prev) => {
        if (opts?.pin && !prev.some((t) => t.key === key)) return [...prev, { ...doc, pinned: true }];
        return prev;
      });

      setPreviewTab((prev) => {
        const willBePinned = opts?.pin || pinnedTabs.some((t) => t.key === key);
        if (willBePinned) return prev?.key === key ? null : prev;
        return doc;
      });

      setActiveKey(key);

      setDocsUi((prev) => {
        if (prev[key]) return prev;
        const content = docs[key] ?? "";
        return { ...prev, [key]: { mode: opts?.mode ?? "view", draft: content, saving: false, error: null } };
      });
    },
    [pinnedTabs, docs],
  );

  /** Moves the pinned tab `fromKey` to sit where `toKey` currently is, preserving the rest of the order. */
  const reorderPinnedTab = useCallback((fromKey: string, toKey: string) => {
    if (fromKey === toKey) return;
    setPinnedTabs((prev) => {
      const fromIdx = prev.findIndex((t) => t.key === fromKey);
      const toIdx = prev.findIndex((t) => t.key === toKey);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  }, []);

  const pinTab = useCallback(
    (key: string) => {
      if (previewTab?.key !== key) return;
      const doc = previewTab;
      setPinnedTabs((prev) => (prev.some((t) => t.key === key) ? prev : [...prev, { ...doc, pinned: true }]));
      setPreviewTab(null);
    },
    [previewTab],
  );

  const unpinTab = useCallback(
    (key: string) => {
      const doc = pinnedTabs.find((t) => t.key === key);
      if (!doc) return;
      setPinnedTabs((prev) => prev.filter((t) => t.key !== key));
      setPreviewTab({ ...doc, pinned: false });
    },
    [pinnedTabs],
  );

  const isDirty = useCallback(
    (key: string) => {
      const ui = docsUi[key];
      if (!ui || ui.mode !== "edit") return false;
      return ui.draft !== (docs[key] ?? "");
    },
    [docsUi, docs],
  );

  /**
   * Closes a tab unconditionally. Callers should check `isDirty(key)` first
   * and confirm with the user before calling this, since it discards any
   * in-progress edit without asking.
   */
  const closeTab = useCallback(
    (key: string) => {
      const wasPinned = pinnedTabs.some((t) => t.key === key);
      const wasPreview = previewTab?.key === key;
      const nextActive = nextActiveKeyAfterRemoving(key, pinnedTabs, previewTab, activeKey);

      if (wasPinned) setPinnedTabs((prev) => prev.filter((t) => t.key !== key));
      if (wasPreview) setPreviewTab(null);
      if (activeKey === key) setActiveKey(nextActive);

      setDocsUi((prev) => {
        const ui = prev[key];
        if (!ui || ui.mode === "view") return prev;
        return { ...prev, [key]: toViewMode(ui, docs[key] ?? "") };
      });
    },
    [activeKey, previewTab, pinnedTabs, docs],
  );

  const setMode = useCallback(
    (key: string, mode: DocMode) => {
      setDocsUi((prev) => {
        const current = prev[key] ?? { mode: "view", draft: docs[key] ?? "", saving: false, error: null };
        return { ...prev, [key]: { ...current, mode, draft: mode === "edit" ? (docs[key] ?? "") : current.draft } };
      });
    },
    [docs],
  );

  const setDraft = useCallback((key: string, value: string) => {
    setDocsUi((prev) => ({ ...prev, [key]: { ...prev[key], draft: value } }));
  }, []);

  const cancelEdit = useCallback(
    (key: string) => {
      setDocsUi((prev) => ({ ...prev, [key]: toViewMode(prev[key], docs[key] ?? "") }));
    },
    [docs],
  );

  const saveDoc = useCallback(
    async (doc: OpenDoc) => {
      const key = doc.key;
      const draft = docsUi[key]?.draft ?? "";
      setDocsUi((prev) => ({ ...prev, [key]: { ...prev[key], saving: true, error: null } }));
      try {
        const source = userData.sources.find((s) => s.id === doc.sourceId);
        if (source?.kind === "folder") {
          const handle = folderHandles[doc.sourceId];
          if (!handle || folderStatus[doc.sourceId] !== "connected") {
            throw new Error("This folder isn't connected — click Reconnect in the sidebar.");
          }
          await folderSource.writeMdFile(handle, doc.relPath, draft);
          setFolderDocs((prev) => ({ ...prev, [key]: draft }));
        } else {
          const next = storage.setDocContent(currentUserId, key, draft);
          setUserData(next);
        }
        setDocsUi((prev) => ({ ...prev, [key]: { ...prev[key], mode: "view", saving: false } }));
      } catch (err) {
        setDocsUi((prev) => ({ ...prev, [key]: { ...prev[key], saving: false, error: (err as Error).message } }));
      }
    },
    [currentUserId, docsUi, userData.sources, folderHandles, folderStatus],
  );

  const activeDoc = useMemo(
    () => pinnedTabs.find((t) => t.key === activeKey) ?? (previewTab?.key === activeKey ? previewTab : null),
    [pinnedTabs, previewTab, activeKey],
  );

  // Persist the sidebar/tab layout so it survives reloads and browser restarts.
  useEffect(() => {
    storage.saveSession(currentUserId, {
      pinnedTabs,
      previewTab,
      activeKey,
      expandedKeys: Array.from(expandedKeys),
      sidebarVisible,
      sidebarWidth,
    });
  }, [currentUserId, pinnedTabs, previewTab, activeKey, expandedKeys, sidebarVisible, sidebarWidth]);

  return {
    users,
    currentUserId,
    switchUser,
    createUserProfile,
    updateUserProfile,
    deleteUserProfile,

    sources: userData.sources,
    docs,
    addSource,
    updateSource,
    removeSource,
    folderSourcesSupported: folderSource.folderSourcesSupported,
    folderStatus,
    addFolderSource,
    reconnectFolderSource,
    refreshFolderSource,
    refreshDoc,
    resolveFolderAsset,

    expandedKeys,
    toggleExpand,
    collapseAll,

    pinnedTabs,
    previewTab,
    activeKey,
    activeDoc,
    setActiveKey,
    docsUi,
    openDoc,
    pinTab,
    unpinTab,
    reorderPinnedTab,
    closeTab,
    setMode,
    setDraft,
    cancelEdit,
    saveDoc,
    isDirty,
    createFile,
    deleteDoc,
    renameDoc,

    sidebarVisible,
    setSidebarVisible,
    sidebarWidth,
    setSidebarWidth,
    sourceDialogOpen,
    setSourceDialogOpen,
    newFileDialogOpen,
    setNewFileDialogOpen,
    searchDialogOpen,
    setSearchDialogOpen,
  };
}
