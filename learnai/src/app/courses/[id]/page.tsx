"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Brain, FlaskConical, Layers, MessageSquare, PenLine, Plus, Trash2 } from "lucide-react";
import { setState, useHydrated, useStore } from "@/lib/store";
import { dueCards, masteryColor, masteryLabel, masteryOf, weakSpots } from "@/lib/learning";
import { Bar, Empty, PageHeader, Stat } from "@/components/ui";

export default function CourseDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const hydrated = useHydrated();
  const courses = useStore((s) => s.courses);
  const attemptsAll = useStore((s) => s.attempts);
  const cardsAll = useStore((s) => s.cards);
  const docsAll = useStore((s) => s.docs);
  const testsAll = useStore((s) => s.tests);
  const saved = useStore((s) => s.saved);
  const [newTopic, setNewTopic] = useState("");

  const course = courses.find((c) => c.id === id);
  const attempts = useMemo(() => attemptsAll.filter((a) => a.courseId === id), [attemptsAll, id]);
  const cards = useMemo(() => cardsAll.filter((a) => a.courseId === id), [cardsAll, id]);
  const docs = useMemo(() => docsAll.filter((a) => a.courseId === id), [docsAll, id]);
  const tests = useMemo(() => testsAll.filter((a) => a.courseId === id), [testsAll, id]);
  const notes = useMemo(() => saved.filter((a) => a.courseId === id), [saved, id]);

  const topicMastery = useMemo(() => {
    if (!course) return [];
    return course.topics.map((t) => {
      const tl = t.toLowerCase();
      const list = attempts.filter((a) => a.topic.toLowerCase() === tl || a.subtopic.toLowerCase().includes(tl) || tl.includes(a.subtopic.toLowerCase()));
      return { t, m: masteryOf(list), n: list.length };
    });
  }, [course, attempts]);

  if (!hydrated) return null;
  if (!course) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Empty icon="🤷" title="Course not found"><Link className="text-accent underline" href="/courses">Back to courses</Link></Empty>
      </div>
    );
  }

  const overall = masteryOf(attempts);
  const weak = weakSpots(attempts, 5);
  const q = (t: string) => `topic=${encodeURIComponent(t)}&course=${course.id}`;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <PageHeader
        title={course.name}
        subtitle={course.description}
        actions={
          <>
            <Link className="btn btn-primary" href={`/tutor?new=1&course=${course.id}`}><MessageSquare className="h-4 w-4" /> Course tutor</Link>
            <Link className="btn" href={`/tests?course=${course.id}`}><FlaskConical className="h-4 w-4" /> Test</Link>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Mastery" value={`${overall}%`} hint={masteryLabel(overall)} />
        <Stat label="Questions" value={attempts.length} />
        <Stat label="Flashcards" value={cards.length} hint={`${dueCards(cards).length} due`} />
        <Stat label="Tests" value={tests.length} hint={tests.length ? `last ${Math.round((tests[tests.length - 1].score / tests[tests.length - 1].total) * 100)}%` : undefined} />
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_300px]">
        <section className="card p-5">
          <h2 className="h2 mb-4">{course.modules?.length ? "Modules & lessons" : "Topics"}</h2>
          {course.modules?.length ? (
            <div className="space-y-5">
              {course.modules.map((m, mi) => (
                <div key={mi}>
                  <div className="mb-2 text-sm font-semibold">Module {mi + 1} · {m.title}</div>
                  <div className="space-y-1">
                    {m.lessons.map((l) => {
                      const tm = topicMastery.find((x) => x.t === l);
                      return <TopicRow key={l} t={l} m={tm?.m ?? 0} n={tm?.n ?? 0} q={q(l)} />;
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : topicMastery.length ? (
            <div className="space-y-1">
              {topicMastery.map(({ t, m, n }) => (
                <TopicRow key={t} t={t} m={m} n={n} q={q(t)} onDelete={() => setState((s) => { const c = s.courses.find((x) => x.id === id); if (c) c.topics = c.topics.filter((x) => x !== t); })} />
              ))}
            </div>
          ) : (
            <p className="text-sm muted">Add topics to track mastery for each concept.</p>
          )}
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newTopic.trim()) return;
              setState((s) => { const c = s.courses.find((x) => x.id === id); if (c) { c.topics.push(newTopic.trim()); if (c.modules?.length) c.modules[c.modules.length - 1].lessons.push(newTopic.trim()); } });
              setNewTopic("");
            }}
          >
            <input className="input" placeholder="Add a topic…" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} />
            <button className="btn" aria-label="Add topic"><Plus className="h-4 w-4" /></button>
          </form>
        </section>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="h2 mb-3">Weak areas</h2>
            {weak.length ? (
              <ul className="space-y-2 text-sm">
                {weak.map((w) => (
                  <li key={w.key}>
                    <Link className="flex justify-between hover:text-accent" href={`/practice?${q(w.topic)}&focus=${encodeURIComponent(w.subtopic ?? "")}`}>
                      <span>{w.subtopic}</span><span className="text-bad tabular-nums">{w.mastery}%</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm muted">None detected yet — practice to find out.</p>
            )}
          </section>
          <section className="card p-5">
            <h2 className="h2 mb-3">Materials</h2>
            <ul className="space-y-1.5 text-sm">
              {docs.map((d) => <li key={d.id}><Link className="hover:text-accent" href={`/library?doc=${d.id}`}>📄 {d.name}</Link></li>)}
              {notes.map((n) => <li key={n.id}><Link className="hover:text-accent" href={`/library?saved=${n.id}`}>📝 {n.title}</Link></li>)}
            </ul>
            {!docs.length && !notes.length && <p className="text-sm muted">No documents or notes yet.</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Link className="btn btn-sm" href={`/library?course=${course.id}`}>Upload</Link>
              <Link className="btn btn-sm" href={`/flashcards?review=1`}><Layers className="h-3.5 w-3.5" /> Cards</Link>
              <Link className="btn btn-sm" href={`/plan?course=${course.id}`}>Study plan</Link>
            </div>
          </section>
          <button
            className="btn btn-ghost btn-sm text-bad"
            onClick={() => {
              if (!confirm(`Delete "${course.name}"? Questions and cards stay in your history.`)) return;
              setState((s) => { s.courses = s.courses.filter((c) => c.id !== id); });
              router.push("/courses");
            }}
          >
            <Trash2 className="h-4 w-4" /> Delete course
          </button>
        </div>
      </div>
    </div>
  );
}

function TopicRow({ t, m, n, q, onDelete }: { t: string; m: number; n: number; q: string; onDelete?: () => void }) {
  return (
    <div className="group flex flex-wrap items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{t}</div>
        <div className="mt-1 flex items-center gap-2">
          <div className="w-28"><Bar value={m} color={masteryColor(m)} height={5} /></div>
          <span className="text-xs muted tabular-nums">{n ? `${m}% · ${masteryLabel(m)}` : "not started"}</span>
        </div>
      </div>
      <div className="flex gap-1">
        <Link className="btn btn-sm" href={`/learn?${q}`} aria-label={`Learn ${t}`}><Brain className="h-3.5 w-3.5" /> Learn</Link>
        <Link className="btn btn-sm" href={`/practice?${q}`} aria-label={`Practice ${t}`}><PenLine className="h-3.5 w-3.5" /> Practice</Link>
        {onDelete && <button className="btn btn-ghost btn-sm opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={onDelete} aria-label="Remove topic"><Trash2 className="h-3.5 w-3.5" /></button>}
      </div>
    </div>
  );
}
