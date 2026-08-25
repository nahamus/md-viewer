import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as folderSource from "../lib/folderSource";
import * as handles from "../storage/handles";
import * as storage from "../storage/store";
import {
  docKey,
  type DocMode,
  type DocUiState,
  type FolderStatus,
  type OpenDoc,
  type UserData,
  type UserProfile,
} from "../types";

/** Drops back to view mode, discarding any in-progress draft edits. */
function toViewMode(ui: DocUiState, content: string): DocUiState {
  return { ...ui, mode: "view", draft: content };
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

  const addFolderSource = useCallback(async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    if (!folderSource.folderSourcesSupported) {
      return { ok: false, error: "This browser can't pick real folders — try Chrome or Edge, or add a virtual source instead." };
    }
    let handle: FileSystemDirectoryHandle;
    try {
      handle = await window.showDirectoryPicker();
    } catch (err) {
      if ((err as Error).name === "AbortError") return { ok: true };
      return { ok: false, error: (err as Error).message };
    }
    const source = storage.addSource(currentUserId, handle.name, handle.name, "folder");
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
  }, [currentUserId, refreshUserData, loadFolderContents]);

  const reconnectFolderSource = useCallback(
    async (id: string): Promise<{ ok: true } | { ok: false; error: string }> => {
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
    (name: string, path?: string) => {
      storage.addSource(currentUserId, name, path);
      refreshUserData();
    },
    [currentUserId, refreshUserData],
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

  const openDoc = useCallback(
    (source: { id: string; name: string }, relPath: string, name: string, opts?: { pin?: boolean }) => {
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
        return { ...prev, [key]: { mode: "view", draft: content, saving: false, error: null } };
      });
    },
    [pinnedTabs, docs],
  );

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
      const pinnedIdx = pinnedTabs.findIndex((t) => t.key === key);
      const wasPreview = previewTab?.key === key;
      let nextActive = activeKey;

      if (activeKey === key) {
        if (pinnedIdx !== -1) {
          nextActive = pinnedTabs[pinnedIdx + 1]?.key ?? pinnedTabs[pinnedIdx - 1]?.key ?? previewTab?.key ?? null;
        } else if (wasPreview) {
          nextActive = pinnedTabs[pinnedTabs.length - 1]?.key ?? null;
        }
      }

      if (pinnedIdx !== -1) setPinnedTabs((prev) => prev.filter((t) => t.key !== key));
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
    });
  }, [currentUserId, pinnedTabs, previewTab, activeKey, expandedKeys, sidebarVisible]);

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

    expandedKeys,
    toggleExpand,

    pinnedTabs,
    previewTab,
    activeKey,
    activeDoc,
    setActiveKey,
    docsUi,
    openDoc,
    pinTab,
    unpinTab,
    closeTab,
    setMode,
    setDraft,
    cancelEdit,
    saveDoc,
    isDirty,
    createFile,

    sidebarVisible,
    setSidebarVisible,
    sourceDialogOpen,
    setSourceDialogOpen,
    newFileDialogOpen,
    setNewFileDialogOpen,
    searchDialogOpen,
    setSearchDialogOpen,
  };
}
