"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { COLORS, getState, setState, uid, useStore } from "@/lib/store";
import { courseMastery, masteryLabel } from "@/lib/learning";
import { generate } from "@/lib/api";
import { Bar, Empty, ErrorBox, PageHeader, Spinner } from "@/components/ui";

export default function CoursesPage() {
  const router = useRouter();
  const courses = useStore((s) => s.courses);
  const attempts = useStore((s) => s.attempts);
  const cards = useStore((s) => s.cards);
  const docs = useStore((s) => s.docs);
  const [name, setName] = useState("");
  const [topics, setTopics] = useState("");
  const [goal, setGoal] = useState("");
  const [level, setLevel] = useState("beginner to college level");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const rows = useMemo(
    () =>
      courses.map((c) => ({
        c,
        m: courseMastery(getState(), c.id),
        cards: cards.filter((x) => x.courseId === c.id).length,
        docs: docs.filter((x) => x.courseId === c.id).length,
      })),
    [courses, attempts, cards, docs],
  );

  function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const id = uid();
    setState((s) => {
      s.courses.push({
        id,
        name: name.trim(),
        color: COLORS[s.courses.length % COLORS.length],
        topics: topics.split(/[\n,]/).map((t) => t.trim()).filter(Boolean),
        createdAt: Date.now(),
      });
    });
    router.push(`/courses/${id}`);
  }

  async function aiCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!goal.trim()) return;
    setBusy(true);
    setError("");
    try {
      const r = await generate<{ name: string; description: string; modules: { title: string; lessons: string[] }[] }>("course", { goal, level });
      const id = uid();
      setState((s) => {
        s.courses.push({
          id,
          name: r.name,
          description: r.description,
          color: COLORS[s.courses.length % COLORS.length],
          topics: r.modules.flatMap((m) => m.lessons),
          modules: r.modules,
          createdAt: Date.now(),
        });
      });
      router.push(`/courses/${id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <PageHeader title="Courses" subtitle="Organize topics, notes, flashcards, quizzes and progress by course." />

      {rows.length === 0 ? (
        <Empty icon="📚" title="No courses yet">Create a course below, or let AI design a full course from beginner to advanced.</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ c, m, cards, docs }) => (
            <Link key={c.id} href={`/courses/${c.id}`} className="card block p-5 transition-colors hover:border-accent">
              <div className="mb-3 h-1.5 w-10 rounded-full" style={{ background: c.color }} />
              <div className="font-semibold">{c.name}</div>
              <div className="mt-1 text-xs muted">
                {c.topics.length} topics · {cards} cards · {docs} docs
              </div>
              <div className="mt-4 mb-1 flex justify-between text-xs">
                <span className="muted">{masteryLabel(m)}</span>
                <span className="tabular-nums">{m}%</span>
              </div>
              <Bar value={m} color={c.color} />
            </Link>
          ))}
        </div>
      )}

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <form className="card space-y-4 p-5" onSubmit={aiCourse}>
          <h2 className="h2 flex items-center gap-2"><Sparkles className="h-4 w-4 text-accent" /> AI course generator</h2>
          <div>
            <label className="label" htmlFor="goal">What do you want to learn?</label>
            <input id="goal" className="input" placeholder="Teach me microbiology" value={goal} onChange={(e) => setGoal(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="lvl">Level</label>
            <input id="lvl" className="input" value={level} onChange={(e) => setLevel(e.target.value)} />
          </div>
          <button className="btn btn-primary" disabled={busy || !goal.trim()}>Generate course</button>
          {busy && <Spinner label="Designing modules and lessons…" />}
          <ErrorBox>{error}</ErrorBox>
        </form>
        <form className="card space-y-4 p-5" onSubmit={create}>
          <h2 className="h2 flex items-center gap-2"><Plus className="h-4 w-4" /> Create a course</h2>
          <div>
            <label className="label" htmlFor="cn">Course name</label>
            <input id="cn" className="input" placeholder="Microbiology" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="ct">Topics (comma or line separated)</label>
            <textarea id="ct" className="input min-h-20" placeholder="Cell structure, Metabolism, Genetics, Viruses, Immunology" value={topics} onChange={(e) => setTopics(e.target.value)} />
          </div>
          <button className="btn btn-primary" disabled={!name.trim()}>Create course</button>
        </form>
      </div>
    </div>
  );
}
