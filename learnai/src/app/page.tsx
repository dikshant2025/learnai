"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { useHydrated, useStore, getState } from "@/lib/store";
import { courseMastery, daysUntil, dueCards, level, recommendations, streak } from "@/lib/learning";
import { Bar, Stat } from "@/components/ui";

const QUICK = [
  { icon: "🧠", label: "Learn a Topic", href: "/learn" },
  { icon: "📝", label: "Practice Questions", href: "/practice" },
  { icon: "🧪", label: "Take a Test", href: "/tests" },
  { icon: "🗂", label: "Review Flashcards", href: "/flashcards?review=1" },
  { icon: "📚", label: "Upload Notes", href: "/library" },
  { icon: "🔎", label: "Research Something", href: "/research" },
];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function Home() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [q, setQ] = useState("");
  const name = useStore((s) => s.profile.name);
  const courses = useStore((s) => s.courses);
  const attempts = useStore((s) => s.attempts);
  const cards = useStore((s) => s.cards);
  const exams = useStore((s) => s.exams);
  const activity = useStore((s) => s.activity);
  const xp = useStore((s) => s.xp);

  const recs = useMemo(() => (hydrated ? recommendations(getState()) : []), [hydrated, attempts, cards, exams]);
  const courseRows = useMemo(
    () => courses.map((c) => ({ c, m: courseMastery(getState(), c.id) })),
    [courses, attempts],
  );
  const upcoming = useMemo(
    () =>
      exams
        .map((e) => ({ e, d: daysUntil(e.date) }))
        .filter((x) => x.d >= 0)
        .sort((a, b) => a.d - b.d)
        .slice(0, 4),
    [exams],
  );
  const due = dueCards(cards).length;
  const acc = attempts.length ? Math.round((attempts.filter((a) => a.correct).length / attempts.length) * 100) : null;
  const lv = level(xp);
  const st = hydrated ? streak(activity) : 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">
        {greeting()}
        {hydrated && name ? `, ${name}` : ""}
      </h1>
      <p className="muted mt-1">What would you like to learn today?</p>

      <form
        className="mt-5 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) router.push(`/tutor?new=1&q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <input
          className="input !py-3 !text-base"
          placeholder="Ask AI anything… e.g. “Explain cellular respiration simply”"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Ask the AI tutor"
        />
        <button className="btn btn-primary !px-5" disabled={!q.trim()}>
          <Sparkles className="h-4 w-4" /> Ask
        </button>
      </form>

      <section className="mt-8">
        <h2 className="h2 mb-3">Quick actions</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {QUICK.map((a) => (
            <Link key={a.href} href={a.href} className="card flex items-center gap-3 p-4 transition-colors hover:border-accent">
              <span className="text-2xl">{a.icon}</span>
              <span className="font-medium">{a.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Study streak" value={st ? `🔥 ${st}` : "0"} hint={st ? "days in a row" : "Study today to start"} />
        <Stat label="Level" value={lv.level} hint={`${xp} XP total`} />
        <Stat label="Cards due" value={due} hint="flashcards to review" />
        <Stat label="Accuracy" value={acc === null ? "—" : `${acc}%`} hint={`${attempts.length} questions answered`} />
      </section>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="h2">Recommended today</h2>
            <Link href="/plan#session" className="btn btn-primary btn-sm">
              Start today&apos;s session
            </Link>
          </div>
          <ol className="space-y-1.5">
            {recs.map((r, i) => (
              <li key={i}>
                <Link href={r.href} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm">{r.text}</span>
                  <ArrowRight className="h-4 w-4 muted" />
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="h2">Course progress</h2>
            <Link href="/courses" className="text-sm text-accent">
              All courses
            </Link>
          </div>
          {courseRows.length === 0 ? (
            <p className="text-sm muted">
              No courses yet.{" "}
              <Link href="/courses" className="text-accent underline">
                Create one
              </Link>{" "}
              or let AI build a full course for you.
            </p>
          ) : (
            <div className="space-y-4">
              {courseRows.map(({ c, m }) => (
                <Link key={c.id} href={`/courses/${c.id}`} className="block">
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-medium">{c.name}</span>
                    <span className="muted tabular-nums">{m}%</span>
                  </div>
                  <Bar value={m} color={c.color} />
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="card p-5 md:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="h2">Upcoming exams</h2>
            <Link href="/plan" className="text-sm text-accent">
              Manage
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-sm muted">Add an exam date and LearnAI will build a study plan around your weak topics.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {upcoming.map(({ e, d }) => (
                <div key={e.id} className="rounded-xl bg-surface-2 p-4">
                  <div className="font-semibold">{e.name}</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums">{d === 0 ? "Today" : `${d} day${d > 1 ? "s" : ""}`}</div>
                  <div className="text-xs muted">{e.date}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
