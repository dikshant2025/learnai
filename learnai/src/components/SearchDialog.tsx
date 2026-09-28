"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { getState } from "@/lib/store";

type Hit = { kind: string; title: string; snippet?: string; href: string };

export default function SearchDialog({ onClose, onGo }: { onClose: () => void; onGo: (href: string) => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const hits = useMemo<Hit[]>(() => {
    const term = q.trim().toLowerCase();
    if (term.length < 2) return [];
    const s = getState();
    const has = (t?: string) => (t ?? "").toLowerCase().includes(term);
    const snip = (t: string) => {
      const i = t.toLowerCase().indexOf(term);
      return i < 0 ? t.slice(0, 90) : "…" + t.slice(Math.max(0, i - 40), i + 60) + "…";
    };
    const out: Hit[] = [];
    for (const c of s.courses)
      if (has(c.name) || c.topics.some(has)) out.push({ kind: "Course", title: c.name, href: `/courses/${c.id}` });
    for (const c of s.chats) {
      const m = c.messages.find((m) => has(m.content));
      if (has(c.title) || m) out.push({ kind: "Chat", title: c.title, snippet: m ? snip(m.content) : undefined, href: `/tutor?chat=${c.id}` });
    }
    for (const d of s.docs) if (has(d.name)) out.push({ kind: "Document", title: d.name, href: `/library?doc=${d.id}` });
    for (const c of s.cards)
      if (has(c.front) || has(c.back)) out.push({ kind: "Flashcard", title: c.front, snippet: c.back.slice(0, 90), href: `/flashcards?q=${encodeURIComponent(c.front.slice(0, 40))}` });
    for (const n of s.saved)
      if (has(n.title) || has(n.content)) out.push({ kind: "Saved", title: n.title, snippet: snip(n.content), href: `/library?saved=${n.id}` });
    const seenQ = new Set<string>();
    for (const a of s.attempts)
      if ((has(a.question) || has(a.subtopic)) && !seenQ.has(a.question)) {
        seenQ.add(a.question);
        out.push({ kind: a.correct ? "Question" : "Missed question", title: a.question, snippet: `${a.topic} · ${a.subtopic}`, href: `/progress#mistakes` });
      }
    return out.slice(0, 30);
  }, [q]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]" onClick={onClose}>
      <div
        className="card w-full max-w-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Search"
      >
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search className="h-4 w-4 muted" />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") setSel((i) => Math.min(i + 1, hits.length - 1));
              if (e.key === "ArrowUp") setSel((i) => Math.max(i - 1, 0));
              if (e.key === "Enter" && hits[sel]) onGo(hits[sel].href);
            }}
            placeholder="Search courses, notes, chats, documents, flashcards and questions…"
            className="w-full bg-transparent py-3.5 outline-none"
          />
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {q.trim().length < 2 ? (
            <p className="p-4 text-sm muted">Type at least 2 characters.</p>
          ) : hits.length === 0 ? (
            <p className="p-4 text-sm muted">No results.</p>
          ) : (
            hits.map((h, i) => (
              <button
                key={i}
                onClick={() => onGo(h.href)}
                onMouseEnter={() => setSel(i)}
                className={`block w-full rounded-lg px-3 py-2 text-left ${i === sel ? "bg-surface-2" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[0.7rem] font-semibold text-accent">{h.kind}</span>
                  <span className="truncate text-sm font-medium">{h.title}</span>
                </div>
                {h.snippet && <div className="mt-0.5 truncate text-xs muted">{h.snippet}</div>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
