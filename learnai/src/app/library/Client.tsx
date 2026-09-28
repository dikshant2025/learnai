"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FileText, Trash2, Upload } from "lucide-react";
import { setState, uid, useHydrated, useStore } from "@/lib/store";
import { newCard } from "@/lib/learning";
import { ACCEPT, deleteDocText, extractText, getDocText, sampleText, saveDocText } from "@/lib/docs";
import { generate, streamTask } from "@/lib/api";
import type { SavedItem } from "@/lib/types";
import { CourseSelect, Empty, ErrorBox, Markdown, PageHeader, Spinner, Thinking, timeAgo } from "@/components/ui";

const SUMMARY_LEVELS = [
  ["10-second", "10-second summary"],
  ["1-minute", "1-minute summary"],
  ["detailed", "Create notes"],
  ["exam", "Exam summary"],
  ["key-facts", "Key facts only"],
  ["important-topics", "Find important topics"],
];

export default function LibraryClient() {
  const params = useSearchParams();
  const hydrated = useHydrated();
  const docs = useStore((s) => s.docs);
  const saved = useStore((s) => s.saved);
  const courses = useStore((s) => s.courses);
  const [tab, setTab] = useState<"docs" | "saved">("docs");
  const [sel, setSel] = useState<string | null>(null);
  const [selSaved, setSelSaved] = useState<string | null>(null);
  const [courseId, setCourseId] = useState<string | undefined>();
  const [uploading, setUploading] = useState("");
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (params.get("doc")) { setTab("docs"); setSel(params.get("doc")); }
    if (params.get("saved")) { setTab("saved"); setSelSaved(params.get("saved")); }
    if (params.get("course")) setCourseId(params.get("course")!);
  }, [hydrated, params]);

  async function upload(files: FileList | File[]) {
    setError("");
    for (const f of Array.from(files)) {
      setUploading(`Reading ${f.name}…`);
      try {
        const text = await extractText(f);
        if (!text.trim()) throw new Error("No text found in file.");
        const id = uid();
        await saveDocText(id, text);
        setState((s) => {
          s.docs.push({ id, name: f.name, courseId, size: f.size, chars: text.length, createdAt: Date.now() });
        });
        setSel(id);
      } catch (e) {
        setError(`${f.name}: ${(e as Error).message}`);
      }
    }
    setUploading("");
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <PageHeader title="Library" subtitle="Your documents, notes, saved lessons and research." />
      <div className="mb-5 flex gap-1 rounded-xl bg-surface-2 p-1" role="tablist">
        {([["docs", `Documents (${docs.length})`], ["saved", `Notes & saved (${saved.length})`]] as const).map(([t, l]) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`flex-1 rounded-lg py-2 text-sm font-medium ${tab === t ? "bg-surface shadow-sm" : "muted"}`}>{l}</button>
        ))}
      </div>

      {tab === "docs" && (
        <>
          <div
            className={`card mb-5 flex flex-col items-center gap-3 border-2 border-dashed p-8 text-center ${drag ? "!border-accent bg-accent-soft" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
          >
            <Upload className="h-8 w-8 text-accent" />
            <div className="font-semibold">Upload lecture notes, study guides or textbook pages</div>
            <div className="text-sm muted">PDF, DOCX, TXT, Markdown · up to 20 MB · stays in your browser</div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <div className="w-48"><CourseSelect courses={courses} value={courseId} onChange={setCourseId} /></div>
              <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={!!uploading}>Choose files</button>
            </div>
            <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => e.target.files && upload(e.target.files)} />
            {uploading && <Spinner label={uploading} />}
          </div>
          <ErrorBox>{error}</ErrorBox>

          {docs.length === 0 ? (
            <Empty icon="📄" title="No documents yet">Upload your course material and LearnAI can teach it, quiz you on it, and answer questions using only your notes.</Empty>
          ) : (
            <div className="grid gap-4 md:grid-cols-[260px_1fr]">
              <div className="card h-fit divide-y divide-line">
                {docs.map((d) => (
                  <button key={d.id} onClick={() => setSel(d.id)} className={`flex w-full items-start gap-2 p-3 text-left ${sel === d.id ? "bg-accent-soft" : "hover:bg-surface-2"}`}>
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{d.name}</div>
                      <div className="text-xs muted">{Math.round(d.chars / 1000)}k chars · {courses.find((c) => c.id === d.courseId)?.name ?? "No course"}</div>
                    </div>
                  </button>
                ))}
              </div>
              {sel && docs.find((d) => d.id === sel) ? <DocPanel key={sel} id={sel} onDeleted={() => setSel(null)} /> : <p className="muted p-4 text-sm">Select a document.</p>}
            </div>
          )}
        </>
      )}

      {tab === "saved" && <SavedPanel sel={selSaved} setSel={setSelSaved} />}
    </div>
  );
}

function DocPanel({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const doc = useStore((s) => s.docs.find((d) => d.id === id))!;
  const courses = useStore((s) => s.courses);
  const [preview, setPreview] = useState("");
  const [out, setOut] = useState<string | null>(null);
  const [outTitle, setOutTitle] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    getDocText(id).then((t) => setPreview(t.slice(0, 3000)));
  }, [id]);

  async function summarize(level: string, label: string) {
    setBusy(label);
    setError("");
    setOut("");
    setOutTitle(label);
    try {
      const text = await sampleText(id, 22000);
      await streamTask("summary", { level, name: doc.name, text }, setOut);
    } catch (e) {
      setError((e as Error).message);
      setOut(null);
    } finally {
      setBusy("");
    }
  }

  async function cards() {
    setBusy("Making flashcards…");
    setError("");
    try {
      const { cards } = await generate<{ cards: { front: string; back: string; topic: string }[] }>("flashcards", { count: 20, context: await sampleText(id, 18000) });
      setState((s) => {
        for (const c of cards) s.cards.push(newCard({ id: uid(), front: c.front, back: c.back, topic: c.topic || doc.name, courseId: doc.courseId }));
      });
      setMsg(`Added ${cards.length} flashcards.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const qp = `doc=${id}${doc.courseId ? `&course=${doc.courseId}` : ""}`;

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="h2">{doc.name}</h2>
            <div className="text-xs muted">Uploaded {timeAgo(doc.createdAt)} · {(doc.size / 1024).toFixed(0)} KB</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-40">
              <CourseSelect courses={courses} value={doc.courseId} onChange={(v) => setState((s) => { const d = s.docs.find((x) => x.id === id); if (d) d.courseId = v; })} />
            </div>
            <button className="btn btn-ghost btn-sm text-bad" aria-label="Delete document" onClick={async () => {
              if (!confirm(`Delete ${doc.name}?`)) return;
              await deleteDocText(id);
              setState((s) => { s.docs = s.docs.filter((d) => d.id !== id); });
              onDeleted();
            }}><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link className="btn btn-primary btn-sm" href={`/tutor?new=1&${qp}&q=${encodeURIComponent(`Teach me "${doc.name}" step by step, starting with the most important ideas. Check my understanding as we go.`)}`}>Teach it</Link>
          <Link className="btn btn-sm" href={`/tutor?new=1&${qp}`}>Ask questions about it</Link>
          {SUMMARY_LEVELS.map(([lvl, label]) => (
            <button key={lvl} className="btn btn-sm" disabled={!!busy} onClick={() => summarize(lvl, label)}>{label}</button>
          ))}
          <button className="btn btn-sm" disabled={!!busy} onClick={cards}>Make flashcards</button>
          <Link className="btn btn-sm" href={`/practice?${qp}`}>Create quiz</Link>
          <Link className="btn btn-sm" href={`/tests?${qp}`}>Create test</Link>
          <Link className="btn btn-sm" href={`/tutor?new=1&${qp}&q=${encodeURIComponent("Which sections of this material are the most difficult? Explain them simply.")}`}>Explain difficult sections</Link>
        </div>
        {busy && <div className="mt-3"><Spinner label={busy} /></div>}
        {msg && <p className="mt-3 text-sm text-good">{msg}</p>}
        <div className="mt-3"><ErrorBox>{error}</ErrorBox></div>
      </div>

      {out !== null && (
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">{outTitle}</h3>
            {out && !busy && (
              <button className="btn btn-sm" onClick={() => { setState((s) => { s.saved.push({ id: uid(), title: `${outTitle}: ${doc.name}`, content: out, kind: "summary", courseId: doc.courseId, createdAt: Date.now() }); }); setMsg("Saved to Notes."); }}>Save</button>
            )}
          </div>
          {out ? <Markdown>{out}</Markdown> : <Thinking />}
        </div>
      )}

      <details className="card p-5">
        <summary className="cursor-pointer text-sm font-semibold">Text preview</summary>
        <pre className="mt-3 max-h-80 overflow-y-auto whitespace-pre-wrap text-xs muted">{preview}{doc.chars > 3000 && "\n…"}</pre>
      </details>
    </div>
  );
}

function SavedPanel({ sel, setSel }: { sel: string | null; setSel: (s: string | null) => void }) {
  const saved = useStore((s) => s.saved);
  const courses = useStore((s) => s.courses);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [out, setOut] = useState<string | null>(null);
  const item = saved.find((s) => s.id === sel);

  async function act(kind: "simplify" | "expand" | "cards" | "concepts", it: SavedItem) {
    setError("");
    setMsg("");
    if (kind === "cards") {
      setBusy("Making flashcards…");
      try {
        const { cards } = await generate<{ cards: { front: string; back: string; topic: string }[] }>("flashcards", { count: 12, context: it.content, topic: it.title });
        setState((s) => { for (const c of cards) s.cards.push(newCard({ id: uid(), front: c.front, back: c.back, topic: c.topic || it.title, courseId: it.courseId })); });
        setMsg(`Added ${cards.length} flashcards.`);
      } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
      return;
    }
    const level = kind === "simplify" ? "1-minute" : kind === "expand" ? "detailed" : "important-topics";
    setBusy("Working…");
    setOut("");
    try {
      await streamTask("summary", { level, name: it.title, text: kind === "expand" ? `EXPAND these notes with more explanation and examples:\n${it.content}` : it.content }, setOut);
    } catch (e) { setError((e as Error).message); setOut(null); } finally { setBusy(""); }
  }

  if (item) {
    return (
      <div className="card p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button className="btn btn-sm" onClick={() => { setSel(null); setOut(null); }}>← Back</button>
          <span className="rounded bg-accent-soft px-2 py-0.5 text-xs font-semibold capitalize text-accent">{item.kind}</span>
          <span className="text-xs muted">{courses.find((c) => c.id === item.courseId)?.name}</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <button className="btn btn-sm" onClick={() => act("simplify", item)} disabled={!!busy}>Simplify</button>
            <button className="btn btn-sm" onClick={() => act("expand", item)} disabled={!!busy}>Expand</button>
            <button className="btn btn-sm" onClick={() => act("concepts", item)} disabled={!!busy}>Important concepts</button>
            <button className="btn btn-sm" onClick={() => act("cards", item)} disabled={!!busy}>Flashcards</button>
            <Link className="btn btn-sm" href={`/practice?topic=${encodeURIComponent(item.title)}`}>Quiz</Link>
            <button className="btn btn-ghost btn-sm text-bad" aria-label="Delete" onClick={() => { setState((s) => { s.saved = s.saved.filter((x) => x.id !== item.id); }); setSel(null); }}><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>
        <h2 className="h1 mb-4">{item.title}</h2>
        {busy && <Spinner label={busy} />}
        {msg && <p className="text-sm text-good">{msg}</p>}
        <ErrorBox>{error}</ErrorBox>
        {out !== null && <div className="mb-6 rounded-xl bg-surface-2 p-4">{out ? <Markdown>{out}</Markdown> : <Thinking />}</div>}
        <Markdown>{item.content}</Markdown>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form className="card space-y-3 p-5" onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim() || !content.trim()) return;
        setState((s) => { s.saved.push({ id: uid(), title: title.trim(), content, kind: "note", createdAt: Date.now() }); });
        setTitle(""); setContent("");
      }}>
        <h2 className="h2">New note</h2>
        <input className="input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="input min-h-28" placeholder="Write notes (Markdown supported)…" value={content} onChange={(e) => setContent(e.target.value)} />
        <button className="btn btn-primary" disabled={!title.trim() || !content.trim()}>Save note</button>
      </form>
      {saved.length === 0 ? (
        <Empty icon="📝" title="Nothing saved yet">Save lessons, research and tutor answers to find them here.</Empty>
      ) : (
        <div className="card divide-y divide-line">
          {[...saved].reverse().map((s) => (
            <button key={s.id} className="flex w-full items-center gap-3 p-4 text-left hover:bg-surface-2" onClick={() => setSel(s.id)}>
              <span className="rounded bg-accent-soft px-2 py-0.5 text-xs font-semibold capitalize text-accent">{s.kind}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{s.title}</span>
              <span className="text-xs muted">{timeAgo(s.createdAt)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
