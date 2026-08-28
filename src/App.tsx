import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { DocumentPane } from "./components/DocumentPane";
import { MenuBar } from "./components/MenuBar";
import { NewFileDialog } from "./components/NewFileDialog";
import { ProfileDialog } from "./components/ProfileDialog";
import { SearchDialog } from "./components/SearchDialog";
import { Sidebar } from "./components/Sidebar";
import { SourceDialog } from "./components/SourceDialog";
import { TabBar } from "./components/TabBar";
import { UserMenu } from "./components/UserMenu";
import { useApplyTheme } from "./hooks/useTheme";
import { useLaunchedFile } from "./hooks/useLaunchedFile";
import { modKeyLabel } from "./lib/platform";
import { useAppState } from "./state/useAppState";
import type { UserProfile } from "./types";

interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}

type ProfileDialogState = { mode: "create" } | { mode: "edit"; user: UserProfile } | null;

function App() {
  const state = useAppState();
  const { docs, isDirty, saveDoc, setSidebarVisible, setSearchDialogOpen } = state;
  const currentUser = state.users.find((u) => u.id === state.currentUserId);
  useApplyTheme(currentUser?.theme ?? "system");
  const launched = useLaunchedFile();
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [profileDialog, setProfileDialog] = useState<ProfileDialogState>(null);

  // A file opened from the OS (see useLaunchedFile) takes over the main pane
  // until closed — switching to a sidebar/tab/search doc implicitly closes
  // it first, with the same discard-confirmation every other transition in
  // this app already applies to unsaved edits.
  function runAfterClosingLaunchedFile(action: () => void) {
    if (!launched.file) {
      action();
      return;
    }
    const dirty = launched.file.mode === "edit" && launched.file.draft !== launched.file.content;
    if (!dirty) {
      launched.close();
      action();
      return;
    }
    setConfirmRequest({
      title: "Discard changes?",
      message: "This document has unsaved edits. Closing it will discard them.",
      confirmLabel: "Discard",
      danger: true,
      onConfirm: () => {
        launched.close();
        action();
      },
    });
  }

  const dirtyKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const key of Object.keys(state.docsUi)) {
      if (isDirty(key)) keys.add(key);
    }
    return keys;
  }, [state.docsUi, isDirty]);

  function requestCloseTab(key: string) {
    if (isDirty(key)) {
      setConfirmRequest({
        title: "Discard changes?",
        message: "This document has unsaved edits. Closing the tab will discard them.",
        confirmLabel: "Discard",
        danger: true,
        onConfirm: () => state.closeTab(key),
      });
    } else {
      state.closeTab(key);
    }
  }

  function requestSwitchUser(id: string) {
    if (dirtyKeys.size > 0) {
      setConfirmRequest({
        title: "Switch profile?",
        message: `You have unsaved edits in ${dirtyKeys.size} document${dirtyKeys.size === 1 ? "" : "s"}. Switching profiles will discard them.`,
        confirmLabel: "Switch anyway",
        danger: true,
        onConfirm: () => state.switchUser(id),
      });
    } else {
      state.switchUser(id);
    }
  }

  function requestDeleteUser(id: string, name: string) {
    setConfirmRequest({
      title: "Delete profile?",
      message: `"${name}" and its sources will be forgotten. Any virtual documents are permanently deleted; real folders on disk are untouched, just disconnected.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: () => state.deleteUserProfile(id),
    });
  }

  function requestCancelEdit(key: string) {
    if (isDirty(key)) {
      setConfirmRequest({
        title: "Discard changes?",
        message: "This document has unsaved edits. Cancelling will discard them.",
        confirmLabel: "Discard",
        danger: true,
        onConfirm: () => state.cancelEdit(key),
      });
    } else {
      state.cancelEdit(key);
    }
  }

  const { activeDoc } = state;
  const activeContent = activeDoc ? (docs[activeDoc.key] ?? "") : "";
  const isFolderDoc = activeDoc
    ? state.sources.find((s) => s.id === activeDoc.sourceId)?.kind === "folder"
    : false;
  // Tabs restored from a previous session never went through openDoc(), so
  // they may not have a docsUi entry yet — fall back to a plain view state
  // rather than showing the empty-state placeholder for an open tab.
  const activeDocUi = activeDoc
    ? (state.docsUi[activeDoc.key] ?? { mode: "view" as const, draft: activeContent, saving: false, error: null })
    : undefined;
  const anyModalOpen =
    state.sourceDialogOpen ||
    state.newFileDialogOpen ||
    state.searchDialogOpen ||
    confirmRequest !== null ||
    profileDialog !== null;

  // Keyboard shortcuts that are safe to override (i.e. not reserved by the
  // browser for tab/window management, unlike Ctrl/Cmd+N, +T or +W).
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      const launchedDirty =
        launched.file?.mode === "edit" && launched.file.draft !== launched.file.content;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (launchedDirty) {
          launched.save();
        } else if (activeDoc && activeDocUi?.mode === "edit" && activeDocUi.draft !== activeContent) {
          saveDoc(activeDoc);
        }
      } else if (mod && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSidebarVisible((v) => !v);
      } else if (mod && e.key.toLowerCase() === "p" && !anyModalOpen) {
        e.preventDefault();
        setSearchDialogOpen(true);
      } else if (e.key === "Escape" && !anyModalOpen && launched.file?.mode === "edit") {
        launched.cancel();
      } else if (e.key === "Escape" && !anyModalOpen && activeDoc && activeDocUi?.mode === "edit") {
        requestCancelEdit(activeDoc.key);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // activeDocUi is recreated on every render when it falls back to a
    // default (see above) — depend on its primitive fields instead so this
    // effect doesn't re-subscribe every render. requestCancelEdit itself
    // isn't memoized, so depend on the stable pieces it's built from instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeDoc,
    activeDocUi?.mode,
    activeDocUi?.draft,
    activeContent,
    anyModalOpen,
    saveDoc,
    setSidebarVisible,
    setSearchDialogOpen,
    isDirty,
    state.cancelEdit,
    launched.file?.mode,
    launched.file?.draft,
    launched.file?.content,
  ]);

  // Warn before closing/reloading the tab with unsaved edits — otherwise
  // they're silently lost with no confirmation at all (unlike closing a tab
  // or switching profiles, which already confirm).
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      const launchedDirty =
        launched.file?.mode === "edit" && launched.file.draft !== launched.file.content;
      if (dirtyKeys.size > 0 || launchedDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirtyKeys, launched.file]);

  return (
    <div className="app-shell">
      <div className="topbar">
        <MenuBar
          menus={[
            {
              label: "File",
              items: [
                { label: "New file…", onSelect: () => state.setNewFileDialogOpen(true) },
                { label: "Manage sources…", onSelect: () => state.setSourceDialogOpen(true) },
              ],
            },
            {
              label: "View",
              items: [
                {
                  label: `${state.sidebarVisible ? "Hide" : "Show"} sidebar (${modKeyLabel}+B)`,
                  onSelect: () => state.setSidebarVisible((v) => !v),
                },
                {
                  label: `Search documents (${modKeyLabel}+P)`,
                  onSelect: () => state.setSearchDialogOpen(true),
                },
              ],
            },
          ]}
        />
        <UserMenu
          users={state.users}
          currentUserId={state.currentUserId}
          onSwitch={requestSwitchUser}
          onRequestCreate={() => setProfileDialog({ mode: "create" })}
          onRequestEdit={(user) => setProfileDialog({ mode: "edit", user })}
          onDelete={requestDeleteUser}
        />
      </div>

      <div className="app-body">
        {state.sidebarVisible && (
          <Sidebar
            sources={state.sources}
            docs={docs}
            folderStatus={state.folderStatus}
            expandedKeys={state.expandedKeys}
            activeKey={state.activeKey}
            width={state.sidebarWidth}
            onWidthChange={state.setSidebarWidth}
            onToggleExpand={state.toggleExpand}
            onCollapseAll={state.collapseAll}
            onOpenFile={(source, relPath, name, opts) =>
              runAfterClosingLaunchedFile(() => state.openDoc(source, relPath, name, opts))
            }
            onOpenSearch={() => state.setSearchDialogOpen(true)}
            onReconnect={state.reconnectFolderSource}
            onRefreshFolder={state.refreshFolderSource}
            onRenameFile={state.renameDoc}
            onDeleteFile={state.deleteDoc}
          />
        )}

        <main className="main-area">
          <TabBar
            pinnedTabs={state.pinnedTabs}
            previewTab={state.previewTab}
            activeKey={state.activeKey}
            dirtyKeys={dirtyKeys}
            onActivate={(key) => runAfterClosingLaunchedFile(() => state.setActiveKey(key))}
            onClose={requestCloseTab}
            onPin={state.pinTab}
            onUnpin={state.unpinTab}
            onRename={state.renameDoc}
          />

          {launched.file ? (
            <>
              <div className="launched-file-banner">
                <span>Opened "{launched.file.name}" from your computer — not added to any source.</span>
                <button type="button" className="link-btn" onClick={() => runAfterClosingLaunchedFile(() => {})}>
                  Close
                </button>
              </div>
              <DocumentPane
                doc={{
                  key: "launched-file",
                  sourceId: "launched",
                  sourceName: "Opened from your computer",
                  relPath: launched.file.name,
                  name: launched.file.name,
                  pinned: false,
                }}
                content={launched.file.content}
                ui={{
                  mode: launched.file.mode,
                  draft: launched.file.draft,
                  saving: launched.file.saving,
                  error: launched.file.error,
                }}
                isFolderDoc={false}
                showRefresh
                onSetMode={launched.setMode}
                onDraftChange={launched.setDraft}
                onSave={launched.save}
                onCancel={launched.cancel}
                onResolveAsset={async () => null}
                onRefresh={async () => {
                  await launched.refresh();
                  return { ok: true } as const;
                }}
              />
            </>
          ) : activeDoc && activeDocUi ? (
            <DocumentPane
              doc={activeDoc}
              content={activeContent}
              ui={activeDocUi}
              isFolderDoc={isFolderDoc}
              showRefresh={isFolderDoc}
              onSetMode={(mode) => state.setMode(activeDoc.key, mode)}
              onDraftChange={(value) => state.setDraft(activeDoc.key, value)}
              onSave={() => state.saveDoc(activeDoc)}
              onCancel={() => requestCancelEdit(activeDoc.key)}
              onResolveAsset={state.resolveFolderAsset}
              onRefresh={() => state.refreshDoc(activeDoc.sourceId, activeDoc.relPath)}
            />
          ) : (
            <div className="empty-state">
              <p>Select a document from the sidebar to get started.</p>
            </div>
          )}
        </main>
      </div>

      {state.sourceDialogOpen && (
        <SourceDialog
          sources={state.sources}
          folderSourcesSupported={state.folderSourcesSupported}
          folderStatus={state.folderStatus}
          onAdd={state.addSource}
          onAddFolder={state.addFolderSource}
          onUpdate={state.updateSource}
          onRemove={state.removeSource}
          onReconnect={state.reconnectFolderSource}
          onClose={() => state.setSourceDialogOpen(false)}
        />
      )}

      {state.newFileDialogOpen && (
        <NewFileDialog
          sources={state.sources}
          onCreate={state.createFile}
          onClose={() => state.setNewFileDialogOpen(false)}
          onCreated={(source, relPath, name) => {
            state.setNewFileDialogOpen(false);
            runAfterClosingLaunchedFile(() => state.openDoc(source, relPath, name, { pin: true, mode: "edit" }));
            if (!state.expandedKeys.has(`${source.id}::`)) {
              state.toggleExpand(`${source.id}::`);
            }
          }}
        />
      )}

      {state.searchDialogOpen && (
        <SearchDialog
          sources={state.sources}
          docs={docs}
          onOpen={(source, relPath, name) =>
            runAfterClosingLaunchedFile(() => state.openDoc(source, relPath, name, { pin: true }))
          }
          onClose={() => state.setSearchDialogOpen(false)}
        />
      )}

      {confirmRequest && (
        <ConfirmDialog
          title={confirmRequest.title}
          message={confirmRequest.message}
          confirmLabel={confirmRequest.confirmLabel}
          danger={confirmRequest.danger}
          onCancel={() => setConfirmRequest(null)}
          onConfirm={() => {
            confirmRequest.onConfirm();
            setConfirmRequest(null);
          }}
        />
      )}

      {profileDialog && (
        <ProfileDialog
          title={profileDialog.mode === "create" ? "New profile" : "Edit profile"}
          initial={profileDialog.mode === "edit" ? profileDialog.user : undefined}
          onClose={() => setProfileDialog(null)}
          onSave={(profile) => {
            if (profileDialog.mode === "create") {
              state.createUserProfile(profile);
            } else {
              state.updateUserProfile(profileDialog.user.id, profile);
            }
          }}
        />
      )}
    </div>
  );
}

export default App;
