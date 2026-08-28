# md-viewer

A simple, fully static .md document viewer/editor: a menu bar, a sidebar with document
trees grouped into named "sources", and a tab-based main area (pinned tabs + one preview
tab) for viewing, viewing raw, and editing markdown files — plus a search across every
document, a per-document outline for jumping to headings, Mermaid diagram rendering
(with its own zoom/pan toolbar), and lightweight local profiles. Tabs, pinned documents,
and the sidebar's expanded/collapsed state all survive page reloads and browser restarts.

Everything runs entirely in the browser (deployable as a static site, e.g. GitHub Pages).
There are two kinds of source:

- **Virtual sources** — content lives only in this browser's `localStorage`, scoped per
  local profile. Works in any browser.
- **Folder sources** — backed by a real folder you pick from disk, via the browser's
  [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API).
  Reads/writes go straight to the real `.md` files. **Chromium browsers only**
  (Chrome, Edge, Opera, …) — Firefox and Safari don't implement this API at all, so
  the "Add a folder from your computer" option won't appear there, full stop. **Brave**
  is a special case: it's Chromium-based and does implement the API, but hides it
  behind a privacy toggle that's off by default — the app detects Brave specifically and
  points at `brave://flags/#file-system-access-api` instead of just saying "unsupported."
  The browser also never exposes a real absolute path (only the picked folder's own
  name), and after a reload the app has to re-verify permission — if it can't do that
  silently, the source shows as "Disconnected" with a "Reconnect" button (in the sidebar
  and in "Manage sources") that re-asks for permission. A folder (or a single open
  document) can also be **refreshed** on demand to pick up changes made outside the app,
  without a full page reload.

Either way, source/profile *metadata* (names, which sources exist, tab layout) lives in
`localStorage`, so:

- **Never leaves this browser** — nothing is synced or backed up anywhere.
- **Is lost if the user clears site data** for this origin, or opens the app in a
  different browser/device. (Folder sources also depend on the browser's own separate
  handle storage — clearing site data can disconnect them even though the real files on
  disk are untouched.)
- **Is capped by the browser's localStorage quota** (commonly ~5-10MB per origin) for
  virtual-source content — plenty for personal notes, not for a large vault. Folder
  sources aren't affected by this, since their content stays on disk.

Profiles ("light user management") are just a way to keep separate sets of sources inside
the same browser — there's no password or real authentication, since none of this is
enforced anywhere but the client. Each profile also has its own **theme** preference
(system/light/dark), independent of the others.

The app is intentionally scoped as a **viewer with quick-fix editing**, not a document
manager: it doesn't own version history, sync, or the lifecycle of your files — Edit
mode is for a fast correction while you're looking at something, not for treating this
as your primary authoring tool.

## Stack

- `src/storage/store.ts` — the only place that touches `localStorage`: profiles (incl.
  each one's theme preference), each profile's `{ sources, docs }` blob (virtual-source
  content), and the persisted tab/sidebar session.
- `src/storage/handles.ts` — persists picked `FileSystemDirectoryHandle`s in IndexedDB
  (they aren't JSON-serializable, so they can't live in `localStorage`).
- `src/lib/folderSource.ts` — scans/reads/writes real files via a directory handle, and
  the permission-(re)request dance.
- `src/lib/tree.ts` — builds the sidebar's folder tree from a flat list of doc paths
  (used for both virtual and folder sources).
- `src/lib/search.ts` — searches file names and content across the current profile's docs.
- `src/lib/headings.ts` — parses ATX (`# ...`) and Setext (underlined) headings out of raw
  markdown for the outline panel, skipping YAML frontmatter and fenced code blocks.
- `src/lib/mermaidTheme.ts` — a small pub/sub "theme version" so already-rendered Mermaid
  diagrams re-render (Mermaid bakes its theme in at init and can't be told to re-theme
  in place) when the light/dark theme changes.
- `src/hooks/useLineGutter.ts` — measures wrap-aware line heights for the editor's
  line-number gutter.
- `src/hooks/useLaunchedFile.ts` — consumes a file opened directly by the OS (see
  "Installing as an app" below); deliberately kept outside the sources/docs system.
- `src/state/useAppState.ts` — all UI/app state (tabs, edit state, dialogs), backed by the
  storage layers above.
- `public/manifest.webmanifest` / `public/sw.js` / `src/registerServiceWorker.ts` —
  installability and offline support (service worker registers in production builds only).

## Running

```bash
npm install
npm run dev
```

Open http://localhost:5173.

Other scripts:

- `npm run build` — type-check and build for production (output in `dist/`).
- `npm run deploy` — build and publish `dist/` to the `gh-pages` branch (only needed if
  Pages is set to deploy from a branch, not GitHub Actions — see below).

## Deploying

`.github/workflows/deploy.yml` builds and deploys on every push to `main`. In the repo's
**Settings → Pages**, set **Source** to **"GitHub Actions"** — no branch or `npm run
deploy` needed; it just runs on push.

## Installing as an app

The deployed site is an installable PWA (Chrome/Edge — install icon in the address bar,
or the browser menu). Installing it also registers md-viewer as an OS-level handler for
`.md`/`.markdown` files ("Open with…" from a file manager, or as the default handler),
via the [File Handling API](https://developer.chrome.com/docs/capabilities/web-apis/file-handling).
A file opened this way is shown directly (with the same quick-fix Edit/Save/Refresh as
any other document) but is **never added to your sources** — closing it or navigating
away forgets it completely, in keeping with this being a viewer rather than something
that takes ownership of your files. Offline use works once the app has loaded at least
once, via a small service worker that only registers outside `npm run dev`.

## Using it

1. Open the **File** menu → "Manage sources…" to add a source: either pick a real folder
   from your computer (Chrome/Edge), or add a virtual one (works everywhere, no real files).
   Use **File → New file…** to create a document directly in an existing source.
2. Click a file once in the sidebar to open it in the italic **preview tab** (reused for
   the next file you click); double-click a file, or click its pin icon, to keep it open
   in a permanent tab. Hover a file or tab to reveal Rename/Delete; double-click a file's
   name or a tab's label to rename it inline.
3. Use the document toolbar to switch between **View** (rendered) and **Edit** (the raw
   source, with line numbers and a current-line highlight, plus Save/Cancel). In View
   mode, the outline icon opens a dropdown for jumping straight to a heading, and (for
   folder-source documents) a refresh icon re-reads that one file from disk.
4. Click the search icon in the sidebar, or press `Ctrl/⌘+P`, to search file names and
   content across every source.
5. Use the profile switcher (top right — shows "Default" until you set it up) to create,
   edit, or switch between local profiles — each has its own separate set of sources and
   its own theme (system/light/dark).

## Keyboard shortcuts

- `Ctrl/⌘+S` — save while editing
- `Ctrl/⌘+B` — toggle the sidebar
- `Ctrl/⌘+P` — open search
- `Esc` — cancel an edit in progress, or close the open dialog
