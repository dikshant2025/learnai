"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Pencil, Sparkles, Trash2 } from "lucide-react";
import { getState, logActivity, setState, uid, useHydrated, useStore } from "@/lib/store";
import { dueCards, newCard, previewInterval, schedule, type Rating } from "@/lib/learning";
import { sampleText } from "@/lib/docs";
import { generate } from "@/lib/api";
import type { Card } from "@/lib/types";
import { CourseSelect, Empty, ErrorBox, PageHeader, Spinner } from "@/components/ui";

type Tab = "review" | "browse" | "create";

const RATINGS: { r: Rating; label: string; cls: string; key: string }[] = [
  { r: "again", label: "Again", cls: "!border-bad text-bad", key: "1" },
  { r: "hard", label: "Hard", cls: "!border-warn text-warn", key: "2" },
  { r: "good", label: "Good", cls: "!border-good text-good", key: "3" },
  { r: "easy", label: "Easy", cls: "!border-accent text-accent", key: "4" },
];

export default function FlashcardsClient() {
  const params = useSearchParams();
  const hydrated = useHydrated();
  const cards = useStore((s) => s.cards);
  const courses = useStore((s) => s.courses);
  const [tab, setTab] = useState<Tab>("review");
  const [courseFilter, setCourseFilter] = useState<string | undefined>();
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!hydrated) return;
    if (params.get("q")) {
      setTab("browse");
      setQ(params.get("q")!);
    } else if (params.get("review")) setTab("review");
    else if (getState().cards.length === 0) setTab("create");
  }, [hydrated, params]);

  const filtered = useMemo(() => cards.filter((c) => !courseFilter || c.courseId === courseFilter), [cards, courseFilter]);
  const due = useMemo(() => dueCards(filtered), [filtered]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Flashcards"
        subtitle={`${cards.length} cards · ${dueCards(cards).length} due today · spaced repetition`}
        actions={
          <div className="w-48">
            <CourseSelect courses={courses} value={courseFilter} onChange={setCourseFilter} />
          </div>
        }
      />
      <div className="mb-5 flex gap-1 rounded-xl bg-surface-2 p-1" role="tablist">
        {(
          [
            ["review", `Review (${due.length})`],
            ["browse", "Browse"],
            ["create", "Create"],
          ] as [Tab, string][]
        ).map(([t, l]) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium ${tab === t ? "bg-surface shadow-sm" : "muted"}`}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "review" && <Review due={due} onCreate={() => setTab("create")} />}
      {tab === "browse" && <Browse cards={filtered} q={q} setQ={setQ} />}
      {tab === "create" && <Create defaultCourse={courseFilter} onDone={() => setTab("review")} />}
    </div>
  );
}

function Review({ due, onCreate }: { due: Card[]; onCreate: () => void }) {
  const [queue, setQueue] = useState<string[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [recall, setRecall] = useState(false);
  const [typed, setTyped] = useState("");
  const [reviewed, setReviewed] = useState(0);
  const cards = useStore((s) => s.cards);

  useEffect(() => {
    setQueue((cur) => (cur.length ? cur : due.map((c) => c.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [due.length]);

  const card = cards.find((c) => c.id === queue[0]);

  function rate(r: Rating) {
    if (!card) return;
    const next = schedule(card, r);
    setState((s) => {
      const i = s.cards.findIndex((c) => c.id === card.id);
      if (i >= 0) s.cards[i] = next;
    });
    logActivity({ cards: 1, xp: 2 });
    setReviewed((n) => n + 1);
    setQueue((qu) => {
      const rest = qu.slice(1);
      return r === "again" ? [...rest, card.id] : rest;
    });
    setFlipped(false);
    setTyped("");
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "TEXTAREA" || (e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === " ") {
        e.preventDefault();
        setFlipped((f) => !f);
      }
      if (flipped) {
        const r = RATINGS.find((x) => x.key === e.key);
        if (r) rate(r.r);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!card) {
    return (
      <Empty icon={reviewed ? "🎉" : "🗂"} title={reviewed ? `Done! You reviewed ${reviewed} cards.` : "Nothing due right now"}>
        {reviewed ? "Come back tomorrow — spaced repetition schedules the next review for you." : (
          <>No cards are due. <button className="text-accent underline" onClick={onCreate}>Create or generate cards</button>.</>
        )}
      </Empty>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-sm muted">
        <span>{queue.length} left · {reviewed} reviewed</span>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={recall} onChange={(e) => setRecall(e.target.checked)} /> Active recall (type first)
        </label>
      </div>
      <div className="flip">
        <div className={`flip-inner ${flipped ? "flipped" : ""}`}>
          <button className="flip-face card flex min-h-64 w-full flex-col items-center justify-center p-8 text-center" onClick={() => setFlipped(true)} aria-label="Show answer">
            <div className="text-xs uppercase tracking-wide muted">{card.topic || "Front"}</div>
            <div className="mt-3 whitespace-pre-wrap text-xl font-semibold">{card.front}</div>
            {!recall && <div className="mt-6 text-xs muted">Click or press Space to flip</div>}
          </button>
          <div className="flip-face flip-back card flex min-h-64 flex-col items-center justify-center overflow-y-auto p-8 text-center">
            <div className="text-xs uppercase tracking-wide muted">Answer</div>
            <div className="mt-3 whitespace-pre-wrap text-lg">{card.back}</div>
            {recall && typed && <div className="mt-4 rounded-lg bg-surface-2 px-3 py-2 text-sm"><b>You wrote:</b> {typed}</div>}
          </div>
        </div>
      </div>
      {recall && !flipped && (
        <div className="mt-4 flex gap-2">
          <input className="input" placeholder="Type what you remember…" value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setFlipped(true)} />
          <button className="btn btn-primary" onClick={() => setFlipped(true)}>Check</button>
        </div>
      )}
      {flipped ? (
        <div className="mt-5 grid grid-cols-4 gap-2">
          {RATINGS.map((r) => (
            <button key={r.r} className={`btn flex-col !py-3 ${r.cls}`} onClick={() => rate(r.r)}>
              <span>{r.label}</span>
              <span className="text-xs font-normal muted">{previewInterval(card, r.r)} · {r.key}</span>
            </button>
          ))}
        </div>
      ) : (
        !recall && <button className="btn btn-primary mt-5 w-full" onClick={() => setFlipped(true)}>Show answer</button>
      )}
    </div>
  );
}

function Browse({ cards, q, setQ }: { cards: Card[]; q: string; setQ: (s: string) => void }) {
  const [edit, setEdit] = useState<string | null>(null);
  const [f, setF] = useState("");
  const [b, setB] = useState("");
  const list = useMemo(() => {
    const t = q.toLowerCase();
    return cards.filter((c) => !t || c.front.toLowerCase().includes(t) || c.back.toLowerCase().includes(t) || c.topic.toLowerCase().includes(t));
  }, [cards, q]);
  if (!cards.length) return <Empty icon="🗂" title="No flashcards yet" />;
  return (
    <div>
      <input className="input mb-4" placeholder="Search cards…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="space-y-2">
        {list.map((c) => (
          <div key={c.id} className="card p-4">
            {edit === c.id ? (
              <div className="space-y-2">
                <textarea className="input" value={f} onChange={(e) => setF(e.target.value)} />
                <textarea className="input" value={b} onChange={(e) => setB(e.target.value)} />
                <div className="flex gap-2">
                  <button className="btn btn-primary btn-sm" onClick={() => { setState((s) => { const x = s.cards.find((y) => y.id === c.id); if (x) { x.front = f; x.back = b; } }); setEdit(null); }}>Save</button>
                  <button className="btn btn-sm" onClick={() => setEdit(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{c.front}</div>
                  <div className="mt-1 text-sm muted">{c.back}</div>
                  <div className="mt-2 text-xs muted">
                    {c.topic && `${c.topic} · `}
                    {c.reps === 0 ? "New" : `Next review ${new Date(c.due).toLocaleDateString()}`} · {c.interval >= 21 ? "Mastered" : c.reps ? "Learning" : "Unseen"}
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm" aria-label="Edit" onClick={() => { setEdit(c.id); setF(c.front); setB(c.back); }}><Pencil className="h-4 w-4" /></button>
                <button className="btn btn-ghost btn-sm" aria-label="Delete" onClick={() => setState((s) => { s.cards = s.cards.filter((x) => x.id !== c.id); })}><Trash2 className="h-4 w-4" /></button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Create({ defaultCourse, onDone }: { defaultCourse?: string; onDone: () => void }) {
  const courses = useStore((s) => s.courses);
  const docs = useStore((s) => s.docs);
  const [courseId, setCourseId] = useState<string | undefined>(defaultCourse);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [topic, setTopic] = useState("");
  const [src, setSrc] = useState<"topic" | "doc" | "mistakes">("topic");
  const [docId, setDocId] = useState("");
  const [count, setCount] = useState(15);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  function add(cs: { front: string; back: string; topic?: string }[]) {
    setState((s) => {
      for (const c of cs) s.cards.push(newCard({ id: uid(), front: c.front, back: c.back, topic: c.topic || topic, courseId }));
    });
  }

  async function gen() {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const args: Record<string, unknown> = { count, topic };
      if (src === "doc") {
        if (!docId) throw new Error("Choose a document.");
        args.context = await sampleText(docId, 18000);
      }
      if (src === "mistakes") {
        const wrong = getState().attempts.filter((a) => !a.correct).slice(-20);
        if (!wrong.length) throw new Error("No missed questions yet — practice first!");
        args.mistakes = wrong.map((w) => `Q: ${w.question}\nStudent: ${w.userAnswer}\nCorrect: ${w.correctAnswer}`).join("\n\n");
      }
      if (src === "topic" && !topic.trim()) throw new Error("Enter a topic.");
      const { cards } = await generate<{ cards: { front: string; back: string; topic: string }[] }>("flashcards", args);
      add(cards);
      setMsg(`Added ${cards.length} cards.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card space-y-4 p-5">
        <h2 className="h2 flex items-center gap-2"><Sparkles className="h-4 w-4 text-accent" /> Generate with AI</h2>
        <div className="flex gap-2">
          {(["topic", "doc", "mistakes"] as const).map((s) => (
            <button key={s} className="chip" aria-pressed={src === s} onClick={() => setSrc(s)}>
              {s === "topic" ? "From topic" : s === "doc" ? "From document" : "From my mistakes"}
            </button>
          ))}
        </div>
        {src !== "mistakes" && (
          <div>
            <label className="label" htmlFor="gt">Topic</label>
            <input id="gt" className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Bacterial cell structures" />
          </div>
        )}
        {src === "doc" && (
          <select className="input" value={docId} onChange={(e) => setDocId(e.target.value)} aria-label="Document">
            <option value="">Choose a document…</option>
            {docs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="gc">How many</label>
            <select id="gc" className="input" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[5, 10, 15, 20, 30].map((n) => <option key={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="gco">Course</label>
            <CourseSelect id="gco" courses={courses} value={courseId} onChange={setCourseId} />
          </div>
        </div>
        <button className="btn btn-primary" onClick={gen} disabled={busy}>Generate cards</button>
        {busy && <Spinner label="Creating cards…" />}
        {msg && <p className="text-sm text-good">{msg} <button className="underline" onClick={onDone}>Review now</button></p>}
        <ErrorBox>{error}</ErrorBox>
      </div>
      <form
        className="card space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!front.trim() || !back.trim()) return;
          add([{ front, back, topic }]);
          setFront("");
          setBack("");
          setMsg("Card added.");
        }}
      >
        <h2 className="h2">Create manually</h2>
        <div>
          <label className="label" htmlFor="mf">Front</label>
          <textarea id="mf" className="input" value={front} onChange={(e) => setFront(e.target.value)} placeholder="What is LPS?" />
        </div>
        <div>
          <label className="label" htmlFor="mb">Back</label>
          <textarea id="mb" className="input" value={back} onChange={(e) => setBack(e.target.value)} placeholder="Lipopolysaccharide found in the outer membrane of Gram-negative bacteria." />
        </div>
        <button className="btn btn-primary" disabled={!front.trim() || !back.trim()}>Add card</button>
      </form>
    </div>
  );
}
