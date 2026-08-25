import type { SessionState, Source, UserData, UserProfile } from "../types";

const USERS_KEY = "mdviewer:users";
const CURRENT_USER_KEY = "mdviewer:currentUser";
const userDataKey = (userId: string) => `mdviewer:user:${userId}:data`;
const sessionKey = (userId: string) => `mdviewer:user:${userId}:session`;

const emptyUserData: UserData = { sources: [], docs: {} };

function readJson<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function loadUsers(): UserProfile[] {
  return readJson(USERS_KEY, []);
}

function saveUsers(users: UserProfile[]) {
  writeJson(USERS_KEY, users);
}

export function getCurrentUserId(): string | null {
  return localStorage.getItem(CURRENT_USER_KEY);
}

export function setCurrentUserId(id: string) {
  localStorage.setItem(CURRENT_USER_KEY, id);
}

/**
 * Ensures at least one profile exists (creating an unnamed default profile on
 * first run — the UI shows it as "Default" until the user names it) and that
 * a current profile is selected. Safe to call on every app start.
 */
export function bootstrap(): { users: UserProfile[]; currentUserId: string } {
  let users = loadUsers();
  if (users.length === 0) {
    const defaultUser: UserProfile = { id: crypto.randomUUID(), name: "" };
    users = [defaultUser];
    saveUsers(users);
    saveUserData(defaultUser.id, emptyUserData);
  }
  let currentUserId = getCurrentUserId();
  if (!currentUserId || !users.some((u) => u.id === currentUserId)) {
    currentUserId = users[0].id;
    setCurrentUserId(currentUserId);
  }
  return { users, currentUserId };
}

export function createUser(profile: Omit<UserProfile, "id">): UserProfile {
  const users = loadUsers();
  const user: UserProfile = { id: crypto.randomUUID(), ...profile };
  saveUsers([...users, user]);
  saveUserData(user.id, emptyUserData);
  return user;
}

export function updateUser(id: string, updates: Partial<Omit<UserProfile, "id">>): UserProfile[] {
  const users = loadUsers().map((u) => (u.id === id ? { ...u, ...updates } : u));
  saveUsers(users);
  return users;
}

export function deleteUser(id: string): UserProfile[] {
  const users = loadUsers().filter((u) => u.id !== id);
  saveUsers(users);
  localStorage.removeItem(userDataKey(id));
  localStorage.removeItem(sessionKey(id));
  return users;
}

export function loadUserData(userId: string): UserData {
  return readJson(userDataKey(userId), emptyUserData);
}

/** Throws (typically a QuotaExceededError) if localStorage is full. */
export function saveUserData(userId: string, data: UserData) {
  writeJson(userDataKey(userId), data);
}

export function addSource(userId: string, name: string, path?: string, kind: Source["kind"] = "virtual"): Source {
  const data = loadUserData(userId);
  const source: Source = { id: crypto.randomUUID(), name, path: path || undefined, kind };
  saveUserData(userId, { ...data, sources: [...data.sources, source] });
  return source;
}

export function updateSource(userId: string, sourceId: string, updates: Partial<Pick<Source, "name" | "path">>) {
  const data = loadUserData(userId);
  const sources = data.sources.map((s) => (s.id === sourceId ? { ...s, ...updates } : s));
  saveUserData(userId, { ...data, sources });
}

/** Removes a source and every document stored under it. */
export function removeSource(userId: string, sourceId: string) {
  const data = loadUserData(userId);
  const sources = data.sources.filter((s) => s.id !== sourceId);
  const prefix = `${sourceId}::`;
  const docs = Object.fromEntries(Object.entries(data.docs).filter(([key]) => !key.startsWith(prefix)));
  saveUserData(userId, { sources, docs });
}

/** Creates an empty document; returns null (without writing) if `key` is already taken. */
export function createDoc(userId: string, key: string): UserData | null {
  const data = loadUserData(userId);
  if (data.docs[key] !== undefined) return null;
  const next = { ...data, docs: { ...data.docs, [key]: "" } };
  saveUserData(userId, next);
  return next;
}

export function setDocContent(userId: string, key: string, content: string): UserData {
  const data = loadUserData(userId);
  const next = { ...data, docs: { ...data.docs, [key]: content } };
  saveUserData(userId, next);
  return next;
}

const emptySession: SessionState = {
  pinnedTabs: [],
  previewTab: null,
  activeKey: null,
  expandedKeys: [],
  sidebarVisible: true,
};

export function loadSession(userId: string): SessionState {
  return readJson(sessionKey(userId), emptySession);
}

export function saveSession(userId: string, session: SessionState) {
  writeJson(sessionKey(userId), session);
}
