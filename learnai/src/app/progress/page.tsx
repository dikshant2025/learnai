"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { getState, useHydrated, useStore, dayKey } from "@/lib/store";
import { achievements, learnerSummary, level, masteryColor, masteryLabel, masteryOf, streak, subtopicStats, topicStats } from "@/lib/learning";
import { streamTask } from "@/lib/api";
import { Bar, Empty, ErrorBox, Markdown, PageHeader, Stat, Thinking } from "@/components/ui";
import { TYPE_LABEL } from "@/components/QuestionView";

const DAY = 86_400_000;

export default function ProgressPage() {
  const hydrated = useHydrated();
  const attempts = useStore((s) => s.attempts);
  const activity = useStore((s) => s.activity);
  const tests = useStore((s) => s.tests);
  const cards = useStore((s) => s.cards);
  const xp = useStore((s) => s.xp);
  const courses = useStore((s) => s.courses);
  const [report, setReport] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showAllMistakes, setShowAllMistakes] = useState(false);

  const topics = useMemo(() => topicStats(attempts), [attempts]);
  const subs = useMemo(() => subtopicStats(attempts), [attempts]);
  const overall = useMemo(() => masteryOf(attempts), [attempts]);
  const days = useMemo(() => {
    const out: { k: string; label: string; q: number; xp: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * DAY);
      const k = dayKey(d);
      out.push({ k, label: d.toLocaleDateString(undefined, { weekday: "narrow" }), q: activity[k]?.questions ?? 0, xp: activity[k]?.xp ?? 0 });
    }
    return out;
  }, [activity]);
  const week = useMemo(() => {
    const keys = days.slice(-7).map((d) => d.k);
    const w = keys.map((k) => activity[k]).filter(Boolean);
    const q = w.reduce((a, d) => a + d!.questions, 0);
    const c = w.reduce((a, d) => a + d!.correct, 0);
    return { minutes: w.reduce((a, d) => a + d!.minutes, 0), q, acc: q ? Math.round((c / q) * 100) : null, cards: w.reduce((a, d) => a + d!.cards, 0) };
  }, [days, activity]);

  const mistakes = useMemo(() => attempts.filter((a) => !a.correct).reverse(), [attempts]);
  const repeated = useMemo(() => subs.filter((s) => s.attempts - Math.round((s.accuracy / 100) * s.attempts) >= 2).slice(0, 4), [subs]);
  const byType = useMemo(() => {
    const m = new Map<string, { c: number; t: number }>();
    for (const a of attempts) {
      const v = m.get(a.type) ?? { c: 0, t: 0 };
      v.t++;
      if (a.correct) v.c++;
      m.set(a.type, v);
    }
    return [...m.entries()].filter(([, v]) => v.t >= 3).sort((a, b) => b[1].c / b[1].t - a[1].c / a[1].t);
  }, [attempts]);

  if (!hydrated) return null;

  const totalMin = Object.values(activity).reduce((a, d) => a + d.minutes, 0);
  const reviewed = Object.values(activity).reduce((a, d) => a + d.cards, 0);
  const acc = attempts.length ? Math.round((attempts.filter((a) => a.correct).length / attempts.length) * 100) : null;
  const maxQ = Math.max(1, ...days.map((d) => d.q));
  const lv = level(xp);
  const profile = getState().profile;

  async function genReport() {
    setReport("");
    setError("");
    try {
      await streamTask("report", { learner: `${learnerSummary(getState())}\nThis week: ${week.q} questions, ${week.acc ?? "-"}% accuracy, ${week.cards} flashcards, ~${week.minutes} minutes.` }, setReport);
    } catch (e) {
      setError((e as Error).message);
      setReport(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <PageHeader title="Progress" subtitle="Your mastery, strengths, weaknesses and history." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Overall mastery" value={`${overall}%`} hint={masteryLabel(overall)} />
        <Stat label="Quiz accuracy" value={acc === null ? "—" : `${acc}%`} hint={`${attempts.length} questions`} />
        <Stat label="Time studied" value={`${(totalMin / 60).toFixed(1)}h`} hint={`${reviewed} cards reviewed`} />
        <Stat label="Streak · Level" value={`🔥${streak(activity)} · L${lv.level}`} hint={`${xp} XP`} />
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="card p-5">
          <h2 className="h2">Questions answered</h2>
          <p className="mb-4 text-xs muted">Last 14 days</p>
          <div className="flex h-36 items-end gap-[2px]" role="img" aria-label="Questions answered per day for the last 14 days">
            {days.map((d) => (
              <div key={d.k} className="group relative flex h-full flex-1 flex-col items-center justify-end">
                <div
                  className="w-full max-w-7 rounded-t bg-accent transition-opacity group-hover:opacity-80"
                  style={{ height: `${(d.q / maxQ) * 100}%`, minHeight: d.q ? 3 : 0 }}
                />
                <div className="pointer-events-none absolute -top-7 hidden whitespace-nowrap rounded-md border border-line bg-surface px-2 py-0.5 text-xs shadow group-hover:block">
                  {d.k}: {d.q} questions
                </div>
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-[2px] border-t border-line pt-1">
            {days.map((d) => <div key={d.k} className="flex-1 text-center text-[0.65rem] muted">{d.label}</div>)}
          </div>
        </section>

        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="h2">This week</h2>
            <button className="btn btn-sm" onClick={genReport} disabled={report === ""}>AI weekly report</button>
          </div>
          <ul className="space-y-1.5 text-sm">
            <li><b className="tabular-nums">{(week.minutes / 60).toFixed(1)}</b> hours studied</li>
            <li><b className="tabular-nums">{week.q}</b> questions answered</li>
            <li><b className="tabular-nums">{week.acc ?? "—"}{week.acc !== null && "%"}</b> accuracy</li>
            <li><b className="tabular-nums">{week.cards}</b> flashcards reviewed</li>
          </ul>
          {report !== null && <div className="mt-4 rounded-xl bg-surface-2 p-4 text-sm">{report ? <Markdown>{report}</Markdown> : <Thinking />}</div>}
          <div className="mt-2"><ErrorBox>{error}</ErrorBox></div>
        </section>
      </div>

      <section className="card mt-6 p-5">
        <h2 className="h2 mb-4">Mastery by topic</h2>
        {topics.length === 0 ? (
          <p className="text-sm muted">Answer some practice questions to see mastery scores. <Link href="/practice" className="text-accent underline">Start practicing</Link></p>
        ) : (
          <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
            {[...topics].sort((a, b) => b.mastery - a.mastery).map((t) => (
              <div key={t.key}>
                <div className="mb-1 flex justify-between gap-2 text-sm">
                  <span className="truncate">{t.topic}{t.courseId && <span className="muted"> · {courses.find((c) => c.id === t.courseId)?.name}</span>}</span>
                  <span className="shrink-0 tabular-nums">{t.mastery}% <span className="text-xs muted">{masteryLabel(t.mastery)}</span></span>
                </div>
                <Bar value={t.mastery} color={masteryColor(t.mastery)} />
              </div>
            ))}
          </div>
        )}
      </section>

      {subs.length > 0 && (
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <section className="card p-5">
            <h2 className="h2 mb-3">Weakest concepts</h2>
            <ul className="space-y-2 text-sm">
              {subs.slice(0, 6).map((s) => (
                <li key={s.key} className="flex items-center gap-2">
                  <span className="flex-1 truncate">{s.subtopic} <span className="muted">· {s.topic}</span></span>
                  <span className="tabular-nums" style={{ color: masteryColor(s.mastery) }}>{s.mastery}%</span>
                  <Link className="btn btn-sm" href={`/practice?topic=${encodeURIComponent(s.topic)}&focus=${encodeURIComponent(s.subtopic ?? "")}${s.courseId ? `&course=${s.courseId}` : ""}`}>Practice</Link>
                </li>
              ))}
            </ul>
          </section>
          <section className="card p-5">
            <h2 className="h2 mb-3">Strongest concepts</h2>
            <ul className="space-y-2 text-sm">
              {[...subs].reverse().slice(0, 6).map((s) => (
                <li key={s.key} className="flex justify-between gap-2"><span className="truncate">{s.subtopic} <span className="muted">· {s.topic}</span></span><span className="tabular-nums" style={{ color: masteryColor(s.mastery) }}>{s.mastery}%</span></li>
              ))}
            </ul>
          </section>
        </div>
      )}

      <section className="card mt-6 p-5">
        <h2 className="h2 mb-3">Learning profile</h2>
        <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><div className="label">Preferred explanation</div>{profile.style} · {profile.detail}</div>
          <div><div className="label">Best question type</div>{byType[0] ? `${TYPE_LABEL[byType[0][0]]} (${Math.round((byType[0][1].c / byType[0][1].t) * 100)}%)` : "—"}</div>
          <div><div className="label">Hardest question type</div>{byType.length > 1 ? `${TYPE_LABEL[byType[byType.length - 1][0]]} (${Math.round((byType[byType.length - 1][1].c / byType[byType.length - 1][1].t) * 100)}%)` : "—"}</div>
          <div><div className="label">Average quiz accuracy</div>{acc === null ? "—" : `${acc}%`}</div>
        </div>
      </section>

      {tests.length > 0 && (
        <section className="card mt-6 p-5">
          <h2 className="h2 mb-3">Test scores</h2>
          <div className="space-y-3">
            {[...tests].reverse().slice(0, 8).map((t) => {
              const p = Math.round((t.score / t.total) * 100);
              return (
                <div key={t.id}>
                  <div className="mb-1 flex justify-between text-sm"><span className="truncate">{t.title} <span className="muted">· {new Date(t.date).toLocaleDateString()}</span></span><span className="tabular-nums">{t.score}/{t.total} · {p}%</span></div>
                  <Bar value={p} color={masteryColor(p)} />
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section id="mistakes" className="card mt-6 scroll-mt-20 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="h2">Mistake log ({mistakes.length})</h2>
          {mistakes.length > 0 && <Link className="btn btn-primary btn-sm" href="/practice?mistakes=1">Practice my mistakes</Link>}
        </div>
        {repeated.length > 0 && (
          <div className="mb-4 space-y-1 rounded-xl bg-warn-soft p-3 text-sm">
            {repeated.map((r) => (
              <p key={r.key}>⚠️ You have missed questions involving <b>{r.subtopic}</b> {r.attempts - Math.round((r.accuracy / 100) * r.attempts)} times.</p>
            ))}
          </div>
        )}
        {mistakes.length === 0 ? (
          <Empty title="No mistakes logged">Every wrong answer is saved here with the correct answer and the misconception behind it.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase muted">
                <tr><th className="py-2 pr-3">Question</th><th className="py-2 pr-3">Your answer</th><th className="py-2 pr-3">Correct</th><th className="py-2 pr-3">Concept</th><th className="py-2">Date</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(showAllMistakes ? mistakes : mistakes.slice(0, 15)).map((m) => (
                  <tr key={m.id} className="align-top">
                    <td className="max-w-xs py-2 pr-3">{m.question}{m.misconception && <div className="mt-1 text-xs muted">↳ {m.misconception}</div>}</td>
                    <td className="py-2 pr-3 text-bad">{m.userAnswer}</td>
                    <td className="py-2 pr-3 text-good">{m.correctAnswer}</td>
                    <td className="py-2 pr-3">{m.subtopic}<div className="text-xs muted">{m.difficulty}</div></td>
                    <td className="whitespace-nowrap py-2 muted">{new Date(m.date).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {mistakes.length > 15 && <button className="btn btn-sm mt-3" onClick={() => setShowAllMistakes((v) => !v)}>{showAllMistakes ? "Show less" : `Show all ${mistakes.length}`}</button>}
          </div>
        )}
      </section>

      <section className="card mt-6 p-5">
        <h2 className="h2 mb-3">Achievements</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {achievements(getState()).map((a) => (
            <div key={a.name} className={`rounded-xl border p-3 text-center ${a.done ? "border-accent bg-accent-soft" : "border-line opacity-50"}`}>
              <div className="text-2xl">{a.icon}</div>
              <div className="mt-1 text-xs font-semibold">{a.name}</div>
              <div className="text-[0.7rem] muted">{a.done ? "Unlocked" : "Locked"}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs muted">{cards.filter((c) => c.interval >= 21).length} flashcards mastered (interval ≥ 21 days).</p>
      </section>
    </div>
  );
}
