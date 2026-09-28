"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, Flag, FlaskConical } from "lucide-react";
import { getState, logActivity, setState, uid, useHydrated, useStore } from "@/lib/store";
import { contextFor, sampleText } from "@/lib/docs";
import { generate } from "@/lib/api";
import type { Attempt, Question, TestResult } from "@/lib/types";
import QuestionView, { answerToString, correctToString, gradeLocal, isAnswered, type Answer } from "@/components/QuestionView";
import { Bar, Chips, CourseSelect, Empty, ErrorBox, PageHeader, Spinner, Stat } from "@/components/ui";

const DIFFS = ["easy", "medium", "hard", "exam level"];
const SAVE_KEY = "learnai:test-in-progress";

type Running = {
  id: string;
  title: string;
  topic: string;
  courseId?: string;
  questions: Question[];
  answers: (Answer | null)[];
  flags: boolean[];
  current: number;
  startedAt: number;
  limitSec: number;
};

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function TestsClient() {
  const hydrated = useHydrated();
  const courses = useStore((s) => s.courses);
  const docs = useStore((s) => s.docs);
  const tests = useStore((s) => s.tests);

  const [topic, setTopic] = useState("");
  const [courseId, setCourseId] = useState<string | undefined>();
  const [docId, setDocId] = useState("");
  const [count, setCount] = useState("20");
  const [minutes, setMinutes] = useState("30");
  const [difficulty, setDifficulty] = useState("exam level");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [run, setRun] = useState<Running | null>(null);
  const [now, setNow] = useState(Date.now());
  const [confirm, setConfirm] = useState(false);
  const [review, setReview] = useState<{ run: Running; result: TestResult; correct: boolean[] } | null>(null);
  const submitted = useRef(false);
  const params = useSearchParams();

  useEffect(() => {
    if (params.get("course")) setCourseId(params.get("course")!);
    if (params.get("doc")) setDocId(params.get("doc")!);
  }, [params]);

  // Restore auto-saved test
  useEffect(() => {
    if (!hydrated) return;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) setRun(JSON.parse(raw));
    } catch {}
  }, [hydrated]);

  // Auto-save + timer
  useEffect(() => {
    if (!run) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(run));
    } catch {}
  }, [run]);
  useEffect(() => {
    if (!run) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [run]);

  const remaining = run ? Math.max(0, Math.round(run.limitSec - (now - run.startedAt) / 1000)) : 0;
  useEffect(() => {
    if (run && run.limitSec > 0 && remaining === 0 && !submitted.current) finish(run);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  async function build() {
    if (!topic.trim() && !courseId && !docId) {
      setError("Enter a topic, choose a course, or pick a document.");
      return;
    }
    setError("");
    const n = Number(count);
    setLoading(`Building your ${n}-question exam…`);
    try {
      const s = getState();
      const course = s.courses.find((c) => c.id === courseId);
      let context = "";
      if (docId) {
        const d = s.docs.find((x) => x.id === docId);
        if (d) context = topic ? (await contextFor([d], topic, 10)).map((h) => h.text).join("\n\n") : await sampleText(d.id, 18000);
      }
      const t = topic || course?.topics.join(", ") || s.docs.find((d) => d.id === docId)?.name || "general";
      const batches = Math.ceil(n / 10);
      const results = await Promise.all(
        Array.from({ length: batches }, (_, i) =>
          generate<{ questions: Question[] }>("quiz", {
            count: Math.min(10, n - i * 10),
            subject: course?.name ?? "",
            topic: t,
            difficulty,
            types: ["mcq", "mcq", "tf", "multi"],
            focus: batches > 1 ? `This is part ${i + 1} of ${batches} of one exam; cover different sub-topics than other parts (part ${i + 1} should emphasise the ${["first", "second", "third", "fourth", "fifth"][i] ?? "remaining"} portion of the syllabus).` : "",
            context,
          }),
        ),
      );
      const qs = results.flatMap((r) => r.questions).filter((q) => ["mcq", "tf", "multi"].includes(q.type));
      if (!qs.length) throw new Error("Couldn't create questions. Try a different topic.");
      submitted.current = false;
      setReview(null);
      setRun({
        id: uid(),
        title: `${course?.name ? course.name + " — " : ""}${topic || "Exam"}`,
        topic: t,
        courseId,
        questions: qs,
        answers: qs.map(() => null),
        flags: qs.map(() => false),
        current: 0,
        startedAt: Date.now(),
        limitSec: Number(minutes) * 60,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading("");
    }
  }

  function finish(r: Running) {
    if (submitted.current) return;
    submitted.current = true;
    const seconds = Math.round((Date.now() - r.startedAt) / 1000);
    const correct = r.questions.map((q, i) => (r.answers[i] != null ? gradeLocal(q, r.answers[i]!) === true : false));
    const bySubtopic: TestResult["bySubtopic"] = {};
    r.questions.forEach((q, i) => {
      const k = q.subtopic;
      bySubtopic[k] ??= { correct: 0, total: 0 };
      bySubtopic[k].total++;
      if (correct[i]) bySubtopic[k].correct++;
    });
    const score = correct.filter(Boolean).length;
    const result: TestResult = { id: r.id, title: r.title, courseId: r.courseId, topic: r.topic, score, total: r.questions.length, seconds, bySubtopic, date: Date.now() };
    const atts: Attempt[] = r.questions.map((q, i) => ({
      id: uid(),
      question: q.question,
      type: q.type,
      userAnswer: r.answers[i] == null ? "(no answer)" : answerToString(q, r.answers[i]!),
      correctAnswer: correctToString(q),
      correct: correct[i],
      courseId: r.courseId,
      topic: r.topic.slice(0, 80),
      subtopic: q.subtopic,
      difficulty: q.difficulty,
      source: "test",
      date: Date.now(),
    }));
    setState((s) => {
      s.tests.push(result);
      s.attempts.push(...atts);
    });
    logActivity({ questions: atts.length, correct: score, xp: 20 + score * 5, minutes: Math.round(seconds / 60) });
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {}
    setReview({ run: r, result, correct });
    setRun(null);
    setConfirm(false);
  }

  /* ---------------- Running exam ---------------- */
  if (run) {
    const q = run.questions[run.current];
    const answeredN = run.answers.filter((a, i) => a != null && isAnswered(run.questions[i], a)).length;
    const setAns = (a: Answer) => setRun({ ...run, answers: run.answers.map((x, i) => (i === run.current ? a : x)) });
    const go = (i: number) => setRun({ ...run, current: Math.max(0, Math.min(run.questions.length - 1, i)) });
    return (
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <div className="card sticky top-14 z-10 mb-4 flex flex-wrap items-center gap-4 p-4 lg:top-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold uppercase tracking-wide">{run.title}</div>
            <div className="mt-2"><Bar value={(answeredN / run.questions.length) * 100} /></div>
          </div>
          <div className="text-center">
            <div className="text-xs muted">Question</div>
            <div className="font-bold tabular-nums">{run.current + 1} / {run.questions.length}</div>
          </div>
          {run.limitSec > 0 && (
            <div className={`text-center ${remaining < 300 ? "text-bad" : ""}`} aria-live="polite">
              <div className="flex items-center gap-1 text-xs muted"><Clock className="h-3 w-3" /> Time remaining</div>
              <div className="text-xl font-bold tabular-nums">{fmt(remaining)}</div>
            </div>
          )}
          <button className="btn btn-primary" onClick={() => setConfirm(true)}>Submit</button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
          <div className="card p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold leading-snug">{q.question}</h2>
              <button
                className={`btn btn-sm ${run.flags[run.current] ? "!border-warn !bg-warn-soft" : ""}`}
                onClick={() => setRun({ ...run, flags: run.flags.map((f, i) => (i === run.current ? !f : f)) })}
                aria-pressed={run.flags[run.current]}
              >
                <Flag className="h-4 w-4" /> {run.flags[run.current] ? "Flagged" : "Flag"}
              </button>
            </div>
            <QuestionView q={q} value={run.answers[run.current] ?? undefined} onChange={setAns} />
            <div className="mt-6 flex justify-between">
              <button className="btn" onClick={() => go(run.current - 1)} disabled={run.current === 0}><ChevronLeft className="h-4 w-4" /> Previous</button>
              {run.current < run.questions.length - 1 ? (
                <button className="btn btn-primary" onClick={() => go(run.current + 1)}>Next <ChevronRight className="h-4 w-4" /></button>
              ) : (
                <button className="btn btn-primary" onClick={() => setConfirm(true)}>Review & submit</button>
              )}
            </div>
          </div>
          <div className="card h-fit p-4">
            <div className="mb-2 text-sm font-semibold">Question navigator</div>
            <div className="grid grid-cols-6 gap-1.5 lg:grid-cols-5">
              {run.questions.map((qq, i) => {
                const done = run.answers[i] != null && isAnswered(qq, run.answers[i]!);
                return (
                  <button
                    key={i}
                    onClick={() => go(i)}
                    aria-label={`Question ${i + 1}${done ? ", answered" : ""}${run.flags[i] ? ", flagged" : ""}`}
                    className={`relative grid h-9 place-items-center rounded-lg border text-xs font-semibold tabular-nums ${
                      i === run.current ? "border-accent ring-2 ring-accent-soft" : "border-line"
                    } ${done ? "bg-accent-soft text-accent" : ""}`}
                  >
                    {i + 1}
                    {run.flags[i] && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-warn" />}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 space-y-1 text-xs muted">
              <div>{answeredN} answered · {run.questions.length - answeredN} left</div>
              <div>{run.flags.filter(Boolean).length} flagged</div>
              <div>Progress auto-saves.</div>
            </div>
          </div>
        </div>

        {confirm && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true">
            <div className="card w-full max-w-sm p-6">
              <h2 className="h2">Submit exam?</h2>
              <p className="mt-2 text-sm muted">
                You answered {answeredN} of {run.questions.length}.
                {run.flags.filter(Boolean).length > 0 && ` ${run.flags.filter(Boolean).length} question(s) are flagged.`}
                {answeredN < run.questions.length && " Unanswered questions count as wrong."}
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button className="btn" onClick={() => setConfirm(false)}>Keep working</button>
                <button className="btn btn-primary" onClick={() => finish(run)}>Submit</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ---------------- Results ---------------- */
  if (review) {
    const { result, run: r, correct } = review;
    const pct = Math.round((result.score / result.total) * 100);
    const subs = Object.entries(result.bySubtopic).sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total);
    const weak = subs.filter(([, v]) => v.correct / v.total < 0.75).slice(0, 4);
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <PageHeader title="Exam results" subtitle={r.title} actions={<button className="btn" onClick={() => setReview(null)}>New test</button>} />
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Score" value={`${result.score} / ${result.total}`} />
          <Stat label="Percent" value={`${pct}%`} />
          <Stat label="Time" value={`${Math.round(result.seconds / 60)} min`} />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="card p-5">
            <h2 className="h2 mb-3">Accuracy by topic</h2>
            <div className="space-y-3">
              {subs.map(([k, v]) => {
                const p = Math.round((v.correct / v.total) * 100);
                return (
                  <div key={k}>
                    <div className="mb-1 flex justify-between text-sm"><span>{k}</span><span className="tabular-nums muted">{p}%</span></div>
                    <Bar value={p} color={p >= 80 ? "var(--good)" : p >= 60 ? "var(--warn)" : "var(--bad)"} />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="card p-5">
            <h2 className="h2 mb-3">Recommended review</h2>
            {weak.length === 0 ? (
              <p className="text-sm">Great work — no weak areas in this exam. 🎉</p>
            ) : (
              <ol className="space-y-2">
                {weak.map(([k]) => (
                  <li key={k} className="flex items-center justify-between gap-2 text-sm">
                    <span>{k}</span>
                    <span className="flex gap-1">
                      <Link className="btn btn-sm" href={`/learn?topic=${encodeURIComponent(k)}${r.courseId ? `&course=${r.courseId}` : ""}`}>Learn</Link>
                      <Link className="btn btn-sm" href={`/practice?topic=${encodeURIComponent(r.topic)}&focus=${encodeURIComponent(k)}${r.courseId ? `&course=${r.courseId}` : ""}`}>Practice</Link>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
        <h2 className="h2 mb-3 mt-8">Detailed review</h2>
        <div className="space-y-4">
          {r.questions.map((q, i) => (
            <div key={i} className={`card border-l-4 p-5 ${correct[i] ? "!border-l-good" : "!border-l-bad"}`}>
              <div className="mb-3 text-sm muted">Question {i + 1} · {q.subtopic} {r.answers[i] == null && "· not answered"}</div>
              <div className="mb-4 font-semibold">{q.question}</div>
              <QuestionView q={q} value={r.answers[i] ?? undefined} onChange={() => {}} revealed />
              {q.explanation && <p className="mt-3 text-sm"><b>Why: </b>{q.explanation}</p>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ---------------- Setup ---------------- */
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <PageHeader title="Tests" subtitle="Timed, realistic exams. No answers until you submit." />
      <form className="card space-y-5 p-5" onSubmit={(e) => { e.preventDefault(); build(); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="t">Exam topic</label>
            <input id="t" className="input" placeholder="e.g. Microbiology Exam 2: cell structure & metabolism" value={topic} onChange={(e) => setTopic(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="c">Course</label>
            <CourseSelect id="c" courses={courses} value={courseId} onChange={setCourseId} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="d">Based on document</label>
          <select id="d" className="input" value={docId} onChange={(e) => setDocId(e.target.value)}>
            <option value="">None (general knowledge)</option>
            {docs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <span className="label">Questions</span>
            <Chips options={["10", "20", "30", "50"].map((v) => ({ value: v, label: v }))} value={count} onChange={setCount} />
          </div>
          <div>
            <span className="label">Time limit</span>
            <Chips options={[["0", "None"], ["15", "15m"], ["30", "30m"], ["60", "60m"]].map(([v, l]) => ({ value: v, label: l }))} value={minutes} onChange={setMinutes} />
          </div>
          <div>
            <span className="label">Difficulty</span>
            <select className="input" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              {DIFFS.map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>
        </div>
        <button className="btn btn-primary" disabled={!!loading}><FlaskConical className="h-4 w-4" /> Start exam</button>
        {loading && <div><Spinner label={loading} /></div>}
        <ErrorBox>{error}</ErrorBox>
      </form>

      <h2 className="h2 mb-3 mt-8">Past tests</h2>
      {tests.length === 0 ? (
        <Empty icon="🧪" title="No tests yet">Your scores and topic breakdowns will appear here.</Empty>
      ) : (
        <div className="card divide-y divide-line">
          {[...tests].reverse().slice(0, 20).map((t) => (
            <div key={t.id} className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{t.title}</div>
                <div className="text-xs muted">{new Date(t.date).toLocaleDateString()} · {Math.round(t.seconds / 60)} min</div>
              </div>
              <div className="text-right font-bold tabular-nums">{Math.round((t.score / t.total) * 100)}%<div className="text-xs font-normal muted">{t.score}/{t.total}</div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
