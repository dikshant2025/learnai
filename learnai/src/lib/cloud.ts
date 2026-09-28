"use client";

/**
 * Accounts + cloud sync on Supabase, using its REST APIs directly (no SDK).
 *
 *  - Auth: passwordless email code (POST /auth/v1/otp, then /auth/v1/verify).
 *  - Data: one row per user in `user_state` (the whole app state as JSON).
 *  - Documents: extracted text in the private `documents` storage bucket,
 *    under a folder named after the user's id.
 *
 * Row-level security in the database makes sure people can only read and
 * write their own row and their own folder.
 */

import { getState, initialState, replaceState, subscribe } from "./store";
import type { State } from "./types";

const URL_ = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const cloudEnabled = Boolean(URL_ && ANON);

export type User = { id: string; email: string };
type Session = { access_token: string; refresh_token: string; expires_at: number; user: User };

const SESSION_KEY = "learnai:session";
const OWNER_KEY = "learnai:owner";
const DIRTY_KEY = "learnai:dirty";
const SYNCED_KEY = "learnai:syncedAt";

/* ------------------------------ small helpers ------------------------------ */

function ls(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(key);
    else localStorage.setItem(key, v);
  } catch {}
}

async function authFetch(path: string, body: unknown, token?: string) {
  const res = await fetch(`${URL_}/auth/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: ANON,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg: string = json.msg || json.error_description || json.message || json.error || `Request failed (${res.status})`;
    throw new Error(friendly(msg, res.status));
  }
  return json;
}

function friendly(msg: string, status: number) {
  const m = msg.toLowerCase();
  if (status === 429 || m.includes("rate limit")) return "Too many emails requested. Please wait a minute and try again.";
  if (m.includes("expired") || m.includes("invalid")) return "That code is wrong or has expired. Check the latest email, or send a new code.";
  if (m.includes("email") && m.includes("valid")) return "Please enter a valid email address.";
  if (m.includes("signups not allowed")) return "New sign-ups are turned off for this site.";
  return msg;
}

/* --------------------------------- session -------------------------------- */

let session: Session | null = null;
const authListeners = new Set<() => void>();

function loadSession() {
  if (session || typeof window === "undefined") return;
  try {
    const raw = ls(SESSION_KEY);
    if (raw) session = JSON.parse(raw);
  } catch {
    session = null;
  }
}

function saveSession(s: Session | null) {
  session = s;
  lsSet(SESSION_KEY, s ? JSON.stringify(s) : null);
  authListeners.forEach((l) => l());
}

function toSession(json: {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
  user: { id: string; email?: string };
}): Session {
  const expires_at = json.expires_at ?? Math.floor(Date.now() / 1000) + (json.expires_in ?? 3600);
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at,
    user: { id: json.user.id, email: json.user.email ?? "" },
  };
}

export function currentUser(): User | null {
  loadSession();
  return session?.user ?? null;
}

export function onAuthChange(cb: () => void) {
  authListeners.add(cb);
  return () => {
    authListeners.delete(cb);
  };
}

let refreshing: Promise<Session | null> | null = null;

/** A valid access token, refreshing it if it's about to expire. */
export async function getAccessToken(): Promise<string | null> {
  loadSession();
  if (!session) return null;
  if (session.expires_at - 60 > Date.now() / 1000) return session.access_token;
  if (!refreshing) {
    const rt = session.refresh_token;
    refreshing = authFetch("token?grant_type=refresh_token", { refresh_token: rt })
      .then((j) => {
        const s = toSession(j);
        saveSession(s);
        return s;
      })
      .catch((e: Error) => {
        // Only sign out when the refresh token itself was rejected (not when offline).
        if (/invalid|expired|not found|revoked/i.test(e.message)) saveSession(null);
        return null;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  const s = await refreshing;
  return s?.access_token ?? null;
}

export async function sendCode(email: string) {
  await authFetch("otp", { email: email.trim().toLowerCase(), create_user: true });
}

export async function verifyCode(email: string, code: string) {
  const json = await authFetch("verify", { type: "email", email: email.trim().toLowerCase(), token: code.trim() });
  if (!json.access_token) throw new Error("Could not sign in. Please request a new code.");
  saveSession(toSession(json));
}

export async function signOut() {
  await flushSync().catch(() => {});
  const token = session?.access_token;
  stopSync();
  saveSession(null);
  if (token) authFetch("logout", {}, token).catch(() => {});
  // Clear this device so the next person on a shared computer starts clean.
  lsSet(OWNER_KEY, null);
  lsSet(DIRTY_KEY, null);
  lsSet(SYNCED_KEY, null);
  lsSet("learnai:welcomed", null); // next person gets the intro tour and page tips
  lsSet("learnai:tips-dismissed", null);
  replaceState(initialState());
  try {
    const { clear } = await import("idb-keyval");
    await clear();
  } catch {}
}

/* ------------------------------ REST wrappers ------------------------------ */

async function authed(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("Not signed in");
  return fetch(`${URL_}${path}`, {
    ...init,
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
}

async function fetchRemote(userId: string): Promise<{ data: State; updated_at: string } | null> {
  const res = await authed(`/rest/v1/user_state?select=data,updated_at&user_id=eq.${userId}`);
  if (!res.ok) throw new Error(`Could not load your data (${res.status})`);
  const rows = await res.json();
  return rows[0] ?? null;
}

async function pushRemote(userId: string, data: State, keepalive = false) {
  const updated_at = new Date().toISOString();
  const res = await authed(`/rest/v1/user_state`, {
    method: "POST",
    keepalive,
    headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: userId, data, updated_at }),
  });
  if (!res.ok) throw new Error(`Could not save your data (${res.status})`);
  return updated_at;
}

/* ---------------------------------- sync ---------------------------------- */

export type SyncStatus = "idle" | "syncing" | "saved" | "offline";
let status: SyncStatus = "idle";
const statusListeners = new Set<() => void>();
function setStatus(s: SyncStatus) {
  status = s;
  statusListeners.forEach((l) => l());
}
export function getSyncStatus() {
  return status;
}
export function onSyncStatus(cb: () => void) {
  statusListeners.add(cb);
  return () => {
    statusListeners.delete(cb);
  };
}

let unsub: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let applyingRemote = false;
let activeUser: string | null = null;

function applyRemote(data: State, updatedAt: string) {
  applyingRemote = true;
  try {
    replaceState({ ...initialState(), ...data });
  } finally {
    applyingRemote = false;
  }
  lsSet(SYNCED_KEY, updatedAt);
}

async function push(keepalive = false) {
  if (!activeUser) return;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  setStatus("syncing");
  try {
    const at = await pushRemote(activeUser, getState(), keepalive);
    lsSet(SYNCED_KEY, at);
    lsSet(DIRTY_KEY, null);
    setStatus("saved");
  } catch {
    setStatus("offline");
    timer = setTimeout(() => push(), 15000); // retry later
  }
}

export function flushSync() {
  return ls(DIRTY_KEY) ? push(true) : Promise.resolve();
}

/** Pull newer data saved from another device (only when nothing is waiting to upload). */
async function pullIfNewer() {
  if (!activeUser || ls(DIRTY_KEY)) return;
  try {
    const remote = await fetchRemote(activeUser);
    const last = ls(SYNCED_KEY);
    if (remote && (!last || remote.updated_at > last)) applyRemote(remote.data, remote.updated_at);
  } catch {}
}

function onVisibility() {
  if (document.visibilityState === "hidden") void flushSync();
  else void pullIfNewer();
}

export function stopSync() {
  unsub?.();
  unsub = null;
  if (timer) clearTimeout(timer);
  timer = null;
  activeUser = null;
  if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
}

/**
 * First load after sign-in:
 *  - account already has data → use it (unless this device has unsent changes for the same account)
 *  - brand-new account → upload what's on this device (moves guest data into the account)
 *  - this device belonged to someone else → start this account fresh
 */
export async function startSync(user: User) {
  stopSync();
  const owner = ls(OWNER_KEY);
  const remote = await fetchRemote(user.id);

  if (owner && owner !== user.id) {
    // Another account used this browser: never mix their data in.
    try {
      const { clear } = await import("idb-keyval");
      await clear();
    } catch {}
    if (remote) applyRemote(remote.data, remote.updated_at);
    else applyRemote(initialState(), "");
    lsSet(DIRTY_KEY, null);
  } else if (remote && !(owner === user.id && ls(DIRTY_KEY))) {
    applyRemote(remote.data, remote.updated_at);
  } else {
    lsSet(DIRTY_KEY, "1");
  }

  lsSet(OWNER_KEY, user.id);
  activeUser = user.id;

  unsub = subscribe(() => {
    if (applyingRemote) return;
    lsSet(DIRTY_KEY, "1");
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => push(), 1500);
  });
  document.addEventListener("visibilitychange", onVisibility);

  if (ls(DIRTY_KEY)) await push();
  else setStatus("saved");
}

/* ------------------------------ document files ----------------------------- */

function docPath(id: string) {
  const u = currentUser();
  return u ? `${u.id}/${encodeURIComponent(id)}.txt` : null;
}

export async function uploadDoc(id: string, text: string) {
  const p = docPath(id);
  if (!cloudEnabled || !p) return;
  const res = await authed(`/storage/v1/object/documents/${p}`, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8", "x-upsert": "true" },
    body: text,
  });
  if (!res.ok) throw new Error(`Could not upload the document to your account (${res.status}).`);
}

export async function downloadDoc(id: string): Promise<string | null> {
  const p = docPath(id);
  if (!cloudEnabled || !p) return null;
  const res = await authed(`/storage/v1/object/authenticated/documents/${p}`);
  if (!res.ok) return null;
  return res.text();
}

export async function removeDoc(id: string) {
  const p = docPath(id);
  if (!cloudEnabled || !p) return;
  await authed(`/storage/v1/object/documents/${p}`, { method: "DELETE" }).catch(() => {});
}
