"use client";

import Link from "next/link";
import { useState } from "react";
import { BookmarkPlus, Search } from "lucide-react";
import { logActivity, setState, uid } from "@/lib/store";
import { streamTask } from "@/lib/api";
import type { ChatMessage } from "@/lib/types";
import { ErrorBox, Markdown, PageHeader, Thinking } from "@/components/ui";

const EXAMPLES = ["CRISPR gene editing", "mRNA vaccines", "Antibiotic resistance", "Quantum computing basics", "Causes of the 2008 financial crisis"];

export default function ResearchPage() {
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState("");
  const [out, setOut] = useState<string | null>(null);
  const [sources, setSources] = useState<ChatMessage["sources"]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  async function run(query = q) {
    if (!query.trim()) return;
    setBusy(true);
    setError("");
    setMsg("");
    setOut("");
    setSources(undefined);
    setAsked(query);
    try {
      const r = await streamTask("research", { query }, setOut);
      setOut(r.text);
      setSources(r.sources);
      logActivity({ xp: 5, minutes: 3 });
    } catch (e) {
      setError((e as Error).message);
      setOut(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader title="Research" subtitle="Searches the web, prefers reliable sources (universities, journals, government), and cites them." />
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); run(); }}>
        <input className="input !py-3" placeholder="Research… e.g. CRISPR" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Research question" />
        <button className="btn btn-primary !px-5" disabled={busy || !q.trim()}><Search className="h-4 w-4" /> Research</button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((e) => <button key={e} className="chip" onClick={() => { setQ(e); run(e); }}>{e}</button>)}
      </div>
      <div className="mt-4"><ErrorBox>{error}</ErrorBox></div>
      {out !== null && (
        <article className="card mt-6 p-6">
          {out ? <Markdown>{out}</Markdown> : <div className="flex items-center gap-2 muted text-sm"><Thinking /> Searching and reading sources…</div>}
          {sources && sources.length > 0 && (
            <div className="mt-6 rounded-xl bg-surface-2 p-4 text-sm">
              <div className="mb-1 font-semibold">Cited sources</div>
              <ol className="list-decimal space-y-0.5 pl-5">
                {sources.map((s) => (
                  <li key={s.url}><a className="text-accent underline" href={s.url} target="_blank" rel="noopener noreferrer">{s.title || new URL(s.url).hostname}</a></li>
                ))}
              </ol>
            </div>
          )}
          {!busy && out && (
            <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-4">
              <button className="btn btn-sm" onClick={() => {
                const src = sources?.length ? "\n\n### Sources\n" + sources.map((s, i) => `${i + 1}. [${s.title || s.url}](${s.url})`).join("\n") : "";
                setState((s) => { s.saved.push({ id: uid(), title: asked, content: out + src, kind: "research", createdAt: Date.now() }); });
                setMsg("Saved to Library.");
              }}><BookmarkPlus className="h-4 w-4" /> Save</button>
              <Link className="btn btn-sm" href={`/practice?topic=${encodeURIComponent(asked)}`}>Quiz me on this</Link>
              <Link className="btn btn-sm" href={`/learn?topic=${encodeURIComponent(asked)}`}>Teach me this</Link>
              <Link className="btn btn-sm" href={`/tutor?new=1&q=${encodeURIComponent(`I just researched ${asked}. Help me understand the key concepts.`)}`}>Discuss with tutor</Link>
            </div>
          )}
          {msg && <p className="mt-3 text-sm text-good">{msg}</p>}
        </article>
      )}
    </div>
  );
}
