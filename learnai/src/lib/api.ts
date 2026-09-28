"use client";

import type { ChatMessage } from "./types";

const SOURCES_MARKER = "<<<SOURCES>>>";

async function errorText(res: Response) {
  try {
    const j = await res.json();
    return j.error || `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

/** POST and stream plain text back; calls onText with the full text so far. */
export async function streamPost(
  url: string,
  payload: unknown,
  onText: (full: string) => void,
  signal?: AbortSignal,
): Promise<{ text: string; sources: ChatMessage["sources"] }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(await errorText(res));
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    full += dec.decode(value, { stream: true });
    const i = full.indexOf(SOURCES_MARKER);
    onText((i === -1 ? full : full.slice(0, i)).trimStart());
  }
  const i = full.indexOf(SOURCES_MARKER);
  let sources: ChatMessage["sources"];
  if (i !== -1) {
    try {
      sources = JSON.parse(full.slice(i + SOURCES_MARKER.length));
    } catch {}
    full = full.slice(0, i);
  }
  return { text: full.trim(), sources };
}

export async function generate<T>(kind: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, args }),
  });
  if (!res.ok) throw new Error(await errorText(res));
  return res.json();
}

export function streamTask(task: string, args: Record<string, unknown>, onText: (t: string) => void, signal?: AbortSignal) {
  return streamPost("/api/task", { task, args }, onText, signal);
}
