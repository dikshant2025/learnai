"use client";

import { useSyncExternalStore } from "react";
import type { DayActivity, State } from "./types";

/**
 * App state lives in this browser's localStorage (a local cache) and, when the
 * user is signed in, is synced to their account by cloud.ts.
 * Large document text lives in IndexedDB (see docs.ts).
 */

const KEY = "learnai:v1";

export const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#8b5cf6", "#ec4899", "#84cc16"];

export function initialState(): State {
  return {
    version: 1,
    profile: { name: "", educationLevel: "", major: "", detail: "balanced", style: "simple", goals: "" },
    settings: { theme: "system", largeText: false, dyslexia: false, reducedMotion: false },
    courses: [],
    chats: [],
    docs: [],
    cards: [],
    attempts: [],
    tests: [],
    exams: [],
    saved: [],
    activity: {},
    xp: 0,
  };
}

let state: State = initialState();
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const base = initialState();
      state = { ...base, ...parsed, profile: { ...base.profile, ...parsed.profile }, settings: { ...base.settings, ...parsed.settings } };
    }
  } catch {
    /* corrupted or blocked storage: start fresh */
  }
}

let pending = false;
function persist() {
  // Coalesce multiple updates in the same tick, but write before the browser can navigate away.
  if (pending) return;
  pending = true;
  queueMicrotask(() => {
    pending = false;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("LearnAI: could not save", e);
    }
  });
}

export function getState(): State {
  load();
  return state;
}

export function setState(fn: (s: State) => State | void) {
  load();
  const draft = structuredClone(state);
  const next = fn(draft) ?? draft;
  state = next;
  persist();
  listeners.forEach((l) => l());
}

export function replaceState(next: State) {
  state = { ...initialState(), ...next };
  persist();
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const serverSnapshot = initialState();

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(getState()),
    () => selector(serverSnapshot),
  );
}

export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function logActivity(delta: Partial<DayActivity>) {
  setState((s) => {
    const k = dayKey();
    const cur = s.activity[k] ?? { questions: 0, correct: 0, cards: 0, xp: 0, minutes: 0 };
    s.activity[k] = {
      questions: cur.questions + (delta.questions ?? 0),
      correct: cur.correct + (delta.correct ?? 0),
      cards: cur.cards + (delta.cards ?? 0),
      xp: cur.xp + (delta.xp ?? 0),
      minutes: cur.minutes + (delta.minutes ?? 0),
    };
    s.xp += delta.xp ?? 0;
  });
}
