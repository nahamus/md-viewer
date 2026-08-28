// TypeScript's bundled DOM lib doesn't yet include the File System Access
// API's permission methods (queryPermission/requestPermission) on handles.
export {};

declare global {
  interface FileSystemHandlePermissionDescriptor {
    mode?: "read" | "readwrite";
  }

  interface FileSystemHandle {
    queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
    requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  }

  interface Window {
    showDirectoryPicker(): Promise<FileSystemDirectoryHandle>;
  }

  // The File Handling API (Chromium, installed PWAs only) — lets this app
  // register as an OS-level handler for .md files. Not yet in TypeScript's
  // bundled DOM lib.
  interface LaunchParams {
    readonly files: readonly FileSystemFileHandle[];
  }

  interface LaunchQueue {
    setConsumer(consumer: (params: LaunchParams) => void | Promise<void>): void;
  }

  interface Window {
    launchQueue?: LaunchQueue;
  }
}
