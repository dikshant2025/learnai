"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Lightbulb, RotateCcw, Sparkles, X } from "lucide-react";
import { getState, logActivity, setState, uid, useHydrated, useStore } from "@/lib/store";
import { newCard, weakSpots } from "@/lib/learning";
import { contextFor, sampleText } from "@/lib/docs";
import { generate } from "@/lib/api";
import type { Attempt, Confidence, QType, Question } from "@/lib/types";
import QuestionView, { answerToString, correctToString, gradeLocal, isAnswered, TYPE_LABEL, type Answer } from "@/components/QuestionView";
import { Bar, Chips, CourseSelect, ErrorBox, Markdown, PageHeader, Spinner } from "@/components/ui";

export const DIFFICULTIES = ["beginner", "easy", "medium", "hard", "very hard", "exam level"];
const TYPES: { value: QType; label: string }[] = [
  { value: "mcq", label: "Multiple choice" },
  { value: "tf", label: "True / False" },
  { value: "multi", label: "Select all" },
  { value: "fill", label: "Fill in blank" },
  { value: "short", label: "Short answer" },
  { value: "order", label: "Ordering" },
  { value: "match", label: "Matching" },
];
const CONF: { value: Confidence; label: string }[] = [
  { value: "guess", label: "Guess" },
  { value: "unsure", label: "Not sure" },
  { value: "pretty", label: "Pretty sure" },
  { value: "very", label: "Very sure" },
];
const BATCH = 5;

type Config = {
  topic: string;
  courseId?: string;
  difficulty: string;
  count: number;
  types: QType[];
  docId: string;
  adaptive: boolean;
  focus: string;
  mistakes: boolean;
};

type Result = { correct: boolean; feedback?: string; misconception?: string; score?: number };
type Diagnosis = { problem: string; remember: string };

export default function PracticeClient() {
  const params = useSearchParams();
  const hydrated = useHydrated();
  const courses = useStore((s) => s.courses);
  const docs = useStore((s) => s.docs);
  const attemptsAll = useStore((s) => s.attempts);

  const [cfg, setCfg] = useState<Config>({
    topic: "",
    difficulty: "medium",
    count: 10,
    types: ["mcq", "tf", "multi"],
    docId: "",
    adaptive: true,
    focus: "",
    mistakes: false,
  });
  const [phase, setPhase] = useState<"setup" | "quiz" | "done">("setup");
  const [qs, setQs] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState<Answer | undefined>();
  const [conf, setConf] = useState<Confidence | undefined>();
  const [result, setResult] = useState<Result | null>(null);
  const [diag, setDiag] = useState<Diagnosis | null>(null);
  const [session, setSession] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState<string>("");
  const [error, setError] = useState("");
  const [curDiff, setCurDiff] = useState("medium");
  const fetching = useRef(false);
  const init = useRef("");
  const qsRef = useRef<Question[]>([]);
  const [extra, setExtra] = useState(0);
  const updateQs = (fn: (prev: Question[]) => Question[]) => {
    qsRef.current = fn(qsRef.current);
    setQs(qsRef.current);
  };

  useEffect(() => {
    if (!hydrated || init.current === params.toString()) return;
    init.current = params.toString();
    const topic = params.get("topic") ?? "";
    const course = params.get("course") ?? undefined;
    const focus = params.get("focus") ?? "";
    const mistakes = params.get("mistakes") === "1";
    const docId = params.get("doc") ?? "";
    setCfg((c) => ({ ...c, topic, courseId: course, focus, mistakes, docId }));
    setPhase("setup");
    if (mistakes) start({ ...cfg, mistakes: true, topic: "My mistakes" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, params]);

  const mistakeCount = useMemo(() => attemptsAll.filter((a) => !a.correct).length, [attemptsAll]);

  async function fetchBatch(c: Config, difficulty: string, extraFocus: string, avoid: string[]): Promise<Question[]> {
    const s = getState();
    let context = "";
    if (c.docId) {
      const d = s.docs.find((x) => x.id === c.docId);
      if (d) {
        const hits = c.topic ? await contextFor([d], c.topic + " " + extraFocus, 6) : [];
        context = hits.length ? hits.map((h) => h.text).join("\n\n") : await sampleText(d.id, 15000);
      }
    }
    let topic = c.topic;
    let focus = [c.focus, extraFocus].filter(Boolean).join("; ");
    if (c.mistakes) {
      const wrong = s.attempts.filter((a) => !a.correct).slice(-15);
      topic = [...new Set(wrong.map((w) => w.topic))].join(", ") || "general";
      focus =
        wrong.map((w) => `${w.subtopic} (missed: "${w.question.slice(0, 100)}" — correct: ${w.correctAnswer.slice(0, 80)})`).join("\n") +
        (extraFocus ? `\n${extraFocus}` : "");
    }
    const course = s.courses.find((x) => x.id === c.courseId);
    const { questions } = await generate<{ questions: Question[] }>("quiz", {
      count: BATCH,
      subject: course?.name ?? "",
      topic: topic || (course ? course.topics.join(", ") : "general knowledge"),
      difficulty,
      types: c.types,
      focus,
      avoid: avoid.slice(-25).join("\n"),
      context,
    });
    if (!questions.length) throw new Error("The AI couldn't create questions for that. Try rephrasing the topic.");
    return questions;
  }

  async function start(c = cfg) {
    if (!c.mistakes && !c.topic.trim() && !c.docId && !c.courseId) {
      setError("Enter a topic, pick a course, or choose a document.");
      return;
    }
    setError("");
    setLoading("Writing your questions…");
    try {
      const prevQs = getState().attempts.filter((a) => a.topic === c.topic).map((a) => a.question);
      const first = await fetchBatch(c, c.difficulty, "", prevQs);
      updateQs(() => first);
      setExtra(0);
      setIdx(0);
      setSession([]);
      setCurDiff(c.difficulty);
      resetQ();
      setPhase("quiz");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading("");
    }
  }

  function resetQ() {
    setAnswer(undefined);
    setConf(undefined);
    setResult(null);
    setDiag(null);
  }

  const q = qs[idx];
  const total = cfg.count + extra;

  async function submit() {
    if (!q || !isAnswered(q, answer)) return;
    let r: Result;
    const local = gradeLocal(q, answer!);
    if (local === null) {
      setLoading("Checking your answer…");
      try {
        const g = await generate<{ correct: boolean; score: number; feedback: string; misconception: string }>("grade", {
          question: q.question,
          answerText: q.answerText,
          userAnswer: String(answer),
        });
        r = g;
      } catch (e) {
        setError((e as Error).message);
        setLoading("");
        return;
      }
      setLoading("");
    } else r = { correct: local };
    setResult(r);

    const att: Attempt = {
      id: uid(),
      question: q.question,
      type: q.type,
      userAnswer: answerToString(q, answer),
      correctAnswer: correctToString(q),
      correct: r.correct,
      courseId: cfg.courseId,
      topic: cfg.mistakes ? q.subtopic : cfg.topic || getState().docs.find((d) => d.id === cfg.docId)?.name || "General",
      subtopic: q.subtopic,
      difficulty: q.difficulty || curDiff,
      confidence: conf,
      misconception: r.misconception || undefined,
      source: "practice",
      date: Date.now(),
    };
    setSession((s) => [...s, att]);
    setState((s) => {
      s.attempts.push(att);
      if (s.attempts.length > 5000) s.attempts = s.attempts.slice(-5000);
    });
    logActivity({ questions: 1, correct: r.correct ? 1 : 0, xp: r.correct ? 10 : 3, minutes: 1 });

    // Adaptive prefetch
    const answeredCount = idx + 1;
    if (qsRef.current.length - answeredCount <= 1 && qsRef.current.length < total && !fetching.current) {
      prefetch([...session, att]);
    }
  }

  async function prefetch(hist: Attempt[]) {
    fetching.current = true;
    try {
      let diff = curDiff;
      let focus = "";
      if (cfg.adaptive) {
        const recent = hist.slice(-BATCH);
        const acc = recent.filter((a) => a.correct).length / Math.max(1, recent.length);
        const i = DIFFICULTIES.indexOf(curDiff);
        if (acc >= 0.8 && i < DIFFICULTIES.length - 2) diff = DIFFICULTIES[i + 1];
        else if (acc < 0.5 && i > 0) diff = DIFFICULTIES[i - 1];
        const missed = [...new Set(hist.filter((a) => !a.correct || a.confidence === "guess").map((a) => a.subtopic))];
        if (missed.length) focus = `Possible weaknesses detected in this session — test again in a different way: ${missed.join(", ")}`;
        setCurDiff(diff);
      }
      const more = await fetchBatch(cfg, diff, focus, qsRef.current.map((x) => x.question));
      updateQs((prev) => [...prev, ...more].slice(0, total + 5));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      fetching.current = false;
    }
  }

  async function explainMistake() {
    if (!q) return;
    setLoading("Finding the misconception…");
    try {
      const r = await generate<{ problem: string; remember: string; followUp: Question | null }>("mistake", {
        question: q.question,
        options: q.options.map((o, i) => `${"ABCDEFGH"[i]}. ${o}`).join(" | "),
        correctAnswer: correctToString(q),
        userAnswer: answerToString(q, answer),
      });
      setDiag({ problem: r.problem, remember: r.remember });
      if (r.problem) {
        setState((s) => {
          const a = [...s.attempts].reverse().find((x) => x.question === q.question);
          if (a && !a.misconception) a.misconception = r.problem;
        });
      }
      if (r.followUp) {
        const fu = { ...r.followUp, subtopic: r.followUp.subtopic || q.subtopic };
        updateQs((prev) => [...prev.slice(0, idx + 1), fu, ...prev.slice(idx + 1)]);
        setExtra((x) => x + 1);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading("");
    }
  }

  async function next() {
    const answered = session.length;
    if (answered >= total) {
      setPhase("done");
      return;
    }
    if (idx + 1 < qsRef.current.length) {
      setIdx(idx + 1);
      resetQ();
      return;
    }
    setLoading("Adapting your next questions…");
    while (fetching.current) await new Promise((r) => setTimeout(r, 250));
    if (idx + 1 >= qsRef.current.length) await prefetch(session);
    setLoading("");
    if (idx + 1 < qsRef.current.length) {
      setIdx(idx + 1);
      resetQ();
    }
  }

  async function cardsFromMistakes() {
    const wrong = session.filter((a) => !a.correct);
    if (!wrong.length) return;
    setLoading("Creating flashcards from your mistakes…");
    try {
      const { cards } = await generate<{ cards: { front: string; back: string; topic: string }[] }>("flashcards", {
        count: Math.min(12, wrong.length * 2),
        mistakes: wrong.map((w) => `Q: ${w.question}\nStudent: ${w.userAnswer}\nCorrect: ${w.correctAnswer}`).join("\n\n"),
      });
      setState((s) => {
        for (const c of cards) s.cards.push(newCard({ id: uid(), front: c.front, back: c.back, topic: c.topic || cfg.topic, courseId: cfg.courseId }));
      });
      setError("");
      alertRef.current = `Added ${cards.length} flashcards.`;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading("");
    }
  }
  const alertRef = useRef("");

  /* ------------------------------ UI ------------------------------ */

  if (phase === "setup") {
    const weak = weakSpots(attemptsAll, 5);
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader
          title="Practice"
          subtitle="Adaptive questions, one at a time, with explanations."
          actions={
            mistakeCount > 0 && (
              <button className="btn" onClick={() => { const c = { ...cfg, mistakes: true, topic: "My mistakes" }; setCfg(c); start(c); }} disabled={!!loading}>
                <RotateCcw className="h-4 w-4" /> Practice my mistakes ({mistakeCount})
              </button>
            )
          }
        />
        <form
          className="card space-y-5 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            start({ ...cfg, mistakes: false });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="topic">Topic</label>
              <input id="topic" className="input" placeholder="e.g. Gram-negative cell envelope" value={cfg.topic} onChange={(e) => setCfg({ ...cfg, topic: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="course">Course</label>
              <CourseSelect id="course" courses={courses} value={cfg.courseId} onChange={(v) => setCfg({ ...cfg, courseId: v })} />
            </div>
          </div>
          {cfg.focus && (
            <div className="flex items-center gap-2 rounded-xl bg-warn-soft px-3 py-2 text-sm">
              <Lightbulb className="h-4 w-4 text-warn" /> Focusing on weak spot: <b>{cfg.focus}</b>
              <button type="button" className="ml-auto text-xs underline" onClick={() => setCfg({ ...cfg, focus: "" })}>clear</button>
            </div>
          )}
          <div>
            <span className="label">Difficulty</span>
            <Chips options={DIFFICULTIES.map((d) => ({ value: d, label: d[0].toUpperCase() + d.slice(1) }))} value={cfg.difficulty} onChange={(v: string) => setCfg({ ...cfg, difficulty: v })} />
          </div>
          <div>
            <span className="label">Question types</span>
            <Chips multi options={TYPES} value={cfg.types} onChange={(v: QType[]) => setCfg({ ...cfg, types: v })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="label">Number of questions</span>
              <Chips options={[5, 10, 15, 20].map((n) => ({ value: String(n), label: String(n) }))} value={String(cfg.count)} onChange={(v: string) => setCfg({ ...cfg, count: Number(v) })} />
            </div>
            <div>
              <label className="label" htmlFor="doc">Questions from a document</label>
              <select id="doc" className="input" value={cfg.docId} onChange={(e) => setCfg({ ...cfg, docId: e.target.value })}>
                <option value="">None (general knowledge)</option>
                {docs.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={cfg.adaptive} onChange={(e) => setCfg({ ...cfg, adaptive: e.target.checked })} />
            Adaptive difficulty — harder when you&apos;re doing well, easier and more targeted when you miss
          </label>
          <button className="btn btn-primary" disabled={!!loading}>
            <Sparkles className="h-4 w-4" /> Start practice
          </button>
          {loading && <Spinner label={loading} />}
          <ErrorBox>{error}</ErrorBox>
        </form>

        {weak.length > 0 && (
          <div className="card mt-6 p-5">
            <h2 className="h2 mb-3">Your weak spots</h2>
            <div className="space-y-2">
              {weak.map((w) => (
                <Link key={w.key} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2" href={`/practice?topic=${encodeURIComponent(w.topic)}&focus=${encodeURIComponent(w.subtopic ?? "")}${w.courseId ? `&course=${w.courseId}` : ""}`}>
                  <span className="flex-1 text-sm">{w.subtopic} <span className="muted">· {w.topic}</span></span>
                  <span className="text-sm font-semibold tabular-nums text-bad">{w.mastery}%</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (phase === "done") {
    const correct = session.filter((a) => a.correct).length;
    const pct = Math.round((correct / Math.max(1, session.length)) * 100);
    const bySub = new Map<string, { c: number; t: number }>();
    for (const a of session) {
      const v = bySub.get(a.subtopic) ?? { c: 0, t: 0 };
      v.t++;
      if (a.correct) v.c++;
      bySub.set(a.subtopic, v);
    }
    const wrong = session.filter((a) => !a.correct);
    const lucky = session.filter((a) => a.correct && (a.confidence === "guess" || a.confidence === "unsure"));
    const confWrong = session.filter((a) => !a.correct && a.confidence === "very");
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="card p-6 text-center">
          <div className="text-5xl font-bold tabular-nums">{pct}%</div>
          <div className="muted mt-1">{correct} / {session.length} correct · +{correct * 10 + (session.length - correct) * 3} XP</div>
        </div>
        <div className="card mt-4 p-5">
          <h2 className="h2 mb-3">By concept</h2>
          <div className="space-y-3">
            {[...bySub.entries()].sort((a, b) => a[1].c / a[1].t - b[1].c / b[1].t).map(([k, v]) => (
              <div key={k}>
                <div className="mb-1 flex justify-between text-sm"><span>{k}</span><span className="tabular-nums muted">{v.c}/{v.t}</span></div>
                <Bar value={(v.c / v.t) * 100} color={v.c / v.t >= 0.8 ? "var(--good)" : v.c / v.t >= 0.5 ? "var(--warn)" : "var(--bad)"} />
              </div>
            ))}
          </div>
        </div>
        {(lucky.length > 0 || confWrong.length > 0) && (
          <div className="card mt-4 space-y-2 p-5 text-sm">
            <h2 className="h2">Confidence insights</h2>
            {lucky.length > 0 && <p>🟡 <b>{lucky.length}</b> correct but unsure — needs reinforcement: {[...new Set(lucky.map((a) => a.subtopic))].join(", ")}</p>}
            {confWrong.length > 0 && <p>🔴 <b>{confWrong.length}</b> wrong but very sure — possible misconception: {[...new Set(confWrong.map((a) => a.subtopic))].join(", ")}</p>}
          </div>
        )}
        {wrong.length > 0 && (
          <div className="card mt-4 p-5">
            <h2 className="h2 mb-3">Review your mistakes</h2>
            <ul className="space-y-3 text-sm">
              {wrong.map((w) => (
                <li key={w.id} className="rounded-xl bg-surface-2 p-3">
                  <div className="font-medium">{w.question}</div>
                  <div className="mt-1 text-bad">Your answer: {w.userAnswer}</div>
                  <div className="text-good">Correct: {w.correctAnswer}</div>
                  {w.misconception && <div className="mt-1 muted">Misconception: {w.misconception}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          {wrong.length > 0 && (
            <button className="btn btn-primary" onClick={() => { const c = { ...cfg, mistakes: true, topic: "My mistakes" }; setCfg(c); start(c); }}>
              <RotateCcw className="h-4 w-4" /> Practice these mistakes
            </button>
          )}
          {wrong.length > 0 && <button className="btn" onClick={cardsFromMistakes}>Make flashcards from mistakes</button>}
          <button className="btn" onClick={() => start()}>Another set</button>
          <button className="btn" onClick={() => setPhase("setup")}>Change settings</button>
          <Link className="btn" href="/progress">View progress</Link>
        </div>
        {loading && <div className="mt-3"><Spinner label={loading} /></div>}
        {alertRef.current && !loading && <p className="mt-3 text-sm text-good">{alertRef.current}</p>}
        <div className="mt-3"><ErrorBox>{error}</ErrorBox></div>
      </div>
    );
  }

  // quiz phase
  const answered = session.length;
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-4 flex items-center gap-3">
        <button className="btn btn-sm" onClick={() => (answered ? setPhase("done") : setPhase("setup"))}>
          {answered ? "Finish" : "Exit"}
        </button>
        <div className="flex-1"><Bar value={(answered / total) * 100} /></div>
        <span className="text-sm tabular-nums muted">{Math.min(answered + (result ? 0 : 1), total)} / {total}</span>
      </div>

      {q ? (
        <div className="card p-6">
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-accent-soft px-2 py-0.5 font-semibold text-accent">{TYPE_LABEL[q.type]}</span>
            <span className="rounded-full bg-surface-2 px-2 py-0.5 capitalize">{q.difficulty}</span>
            <span className="rounded-full bg-surface-2 px-2 py-0.5">{q.subtopic}</span>
          </div>
          <h2 className="mb-5 text-lg font-semibold leading-snug">{q.question}</h2>
          <QuestionView q={q} value={answer} onChange={setAnswer} revealed={!!result} />

          {!result && (
            <div className="mt-5">
              <span className="label">How confident are you? (optional)</span>
              <Chips options={CONF} value={conf ?? ("" as Confidence)} onChange={setConf} />
            </div>
          )}

          {result && (
            <div className={`mt-5 rounded-xl border p-4 ${result.correct ? "border-good bg-good-soft" : "border-bad bg-bad-soft"}`} role="status">
              <div className={`flex items-center gap-2 font-semibold ${result.correct ? "text-good" : "text-bad"}`}>
                {result.correct ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
                {result.correct ? "Correct" : "Not quite"}
                {result.correct && (conf === "guess" || conf === "unsure") && <span className="text-xs font-normal muted">— right, but you weren&apos;t sure. We&apos;ll reinforce this.</span>}
                {!result.correct && conf === "very" && <span className="text-xs font-normal muted">— you were very sure, so this may be a misconception.</span>}
              </div>
              {result.feedback && <p className="mt-2 text-sm">{result.feedback}</p>}
              {q.explanation && (
                <div className="mt-2 text-sm"><b>Why: </b>{q.explanation}</div>
              )}
            </div>
          )}

          {diag && (
            <div className="mt-4 rounded-xl bg-surface-2 p-4 text-sm">
              <div className="font-semibold">Problem</div>
              <p className="mt-1">{diag.problem}</p>
              {diag.remember && (<><div className="mt-3 font-semibold">Remember</div><Markdown>{diag.remember.replace(/\n/g, "  \n")}</Markdown></>)}
              <p className="mt-3 muted">A follow-up question on this concept is next.</p>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            {!result ? (
              <button className="btn btn-primary" disabled={!isAnswered(q, answer) || !!loading} onClick={submit}>Check answer</button>
            ) : (
              <>
                <button className="btn btn-primary" onClick={next} disabled={!!loading}>
                  {answered >= total ? "See results" : "Next question"} <ArrowRight className="h-4 w-4" />
                </button>
                {!result.correct && !diag && (
                  <button className="btn" onClick={explainMistake} disabled={!!loading}>Explain my mistake</button>
                )}
                <Link className="btn" href={`/tutor?new=1&q=${encodeURIComponent(`Help me understand this question: "${q.question}". The answer is: ${correctToString(q)}. I answered: ${answerToString(q, answer)}.`)}`}>
                  Ask tutor
                </Link>
              </>
            )}
            {loading && <Spinner label={loading} />}
          </div>
          <div className="mt-3"><ErrorBox>{error}</ErrorBox></div>
        </div>
      ) : (
        <Spinner label="Loading…" />
      )}
    </div>
  );
}
