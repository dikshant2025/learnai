"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, Play, Trash2 } from "lucide-react";
import { getState, setState, uid, useStore, dayKey } from "@/lib/store";
import { daysUntil, learnerSummary } from "@/lib/learning";
import { streamTask } from "@/lib/api";
import { Chips, CourseSelect, Empty, ErrorBox, Markdown, PageHeader, Thinking } from "@/components/ui";

export default function PlanPage() {
  const exams = useStore((s) => s.exams);
  const courses = useStore((s) => s.courses);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [courseId, setCourseId] = useState<string | undefined>();
  const [topics, setTopics] = useState("");
  const [minutes, setMinutes] = useState("60");
  const [busyId, setBusyId] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  // session generator
  const [sessMin, setSessMin] = useState("30");
  const [focus, setFocus] = useState("");
  const [sess, setSess] = useState<string | null>(null);
  const [sessBusy, setSessBusy] = useState(false);

  useEffect(() => {
    const c = new URLSearchParams(location.search).get("course");
    if (c) setCourseId(c);
  }, []);

  const sorted = useMemo(() => [...exams].sort((a, b) => a.date.localeCompare(b.date)), [exams]);

  function addExam(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !date) return;
    const course = getState().courses.find((c) => c.id === courseId);
    const id = uid();
    setState((s) => {
      s.exams.push({ id, name: name.trim(), date, courseId, topics: topics || course?.topics.join(", ") || "", minutesPerDay: Number(minutes) || 60 });
    });
    setName(""); setDate(""); setTopics("");
    makePlan(id);
  }

  async function makePlan(id: string) {
    const ex = getState().exams.find((e) => e.id === id);
    if (!ex) return;
    setBusyId(id);
    setOpen(id);
    setDraft("");
    setError("");
    try {
      const course = getState().courses.find((c) => c.id === ex.courseId);
      const r = await streamTask(
        "plan",
        {
          today: `${new Date().toDateString()} (${dayKey()})`,
          exam: `${ex.name}${course ? ` (${course.name})` : ""}`,
          date: ex.date,
          daysLeft: daysUntil(ex.date),
          minutes: ex.minutesPerDay,
          topics: ex.topics,
          learner: learnerSummary(getState(), ex.courseId),
          profile: getState().profile,
        },
        setDraft,
      );
      setState((s) => {
        const e = s.exams.find((x) => x.id === id);
        if (e) { e.plan = r.text; e.planCreatedAt = Date.now(); }
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId("");
    }
  }

  async function session() {
    setSessBusy(true);
    setSess("");
    setError("");
    try {
      await streamTask("session", { minutes: Number(sessMin), focus, learner: learnerSummary(getState()), profile: getState().profile }, setSess);
    } catch (e) {
      setError((e as Error).message);
      setSess(null);
    } finally {
      setSessBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader title="Study Plan" subtitle="Plans built around your exam dates and weakest topics." />

      <section id="session" className="card scroll-mt-20 p-5">
        <h2 className="h2 mb-1">Start today&apos;s session</h2>
        <p className="mb-4 text-sm muted">Tell me how much time you have — I&apos;ll build a session from your due flashcards, weak topics and recent mistakes.</p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <span className="label">I have</span>
            <Chips options={[["20", "20 min"], ["30", "30 min"], ["60", "1 hour"], ["180", "3 hours"]].map(([v, l]) => ({ value: v, label: l }))} value={sessMin} onChange={setSessMin} />
          </div>
          <input className="input !w-64" placeholder="Focus (optional), e.g. Chemistry" value={focus} onChange={(e) => setFocus(e.target.value)} />
          <button className="btn btn-primary" onClick={session} disabled={sessBusy}><Play className="h-4 w-4" /> Build session</button>
        </div>
        {sess !== null && <div className="mt-5 rounded-xl bg-surface-2 p-4">{sess ? <Markdown>{sess}</Markdown> : <Thinking />}</div>}
      </section>

      <div className="mt-4"><ErrorBox>{error}</ErrorBox></div>

      <form className="card mt-6 space-y-4 p-5" onSubmit={addExam}>
        <h2 className="h2 flex items-center gap-2"><CalendarPlus className="h-4 w-4" /> Add an exam</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="en">Exam</label>
            <input id="en" className="input" placeholder="Microbiology Exam 2" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="ed">Date</label>
            <input id="ed" type="date" className="input" min={dayKey()} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="ec">Course</label>
            <CourseSelect id="ec" courses={courses} value={courseId} onChange={setCourseId} />
          </div>
          <div>
            <label className="label" htmlFor="em">Study time per day</label>
            <select id="em" className="input" value={minutes} onChange={(e) => setMinutes(e.target.value)}>
              {[["20", "20 min"], ["30", "30 min"], ["45", "45 min"], ["60", "1 hour"], ["90", "1.5 hours"], ["120", "2 hours"], ["180", "3 hours"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="et">Topics covered</label>
            <input id="et" className="input" placeholder="Optional" value={topics} onChange={(e) => setTopics(e.target.value)} />
          </div>
        </div>
        <button className="btn btn-primary" disabled={!name.trim() || !date || !!busyId}>Add exam & generate plan</button>
      </form>

      <h2 className="h2 mb-3 mt-8">Exam countdown</h2>
      {sorted.length === 0 ? (
        <Empty icon="📅" title="No exams yet">Add an exam date to get a day-by-day plan that gives more time to your weak topics.</Empty>
      ) : (
        <div className="space-y-3">
          {sorted.map((e) => {
            const d = daysUntil(e.date);
            const isOpen = open === e.id;
            return (
              <div key={e.id} className="card p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="grid h-14 w-14 place-items-center rounded-xl bg-accent-soft text-center">
                    <div className="text-lg font-bold leading-none text-accent tabular-nums">{d < 0 ? "✓" : d}</div>
                    {d >= 0 && <div className="text-[0.65rem] text-accent">days</div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{e.name}</div>
                    <div className="text-xs muted">{e.date} · {e.minutesPerDay} min/day{e.courseId ? ` · ${courses.find((c) => c.id === e.courseId)?.name ?? ""}` : ""}</div>
                  </div>
                  <button className="btn btn-sm" onClick={() => setOpen(isOpen ? null : e.id)}>{isOpen ? "Hide plan" : "View plan"}</button>
                  <button className="btn btn-sm" onClick={() => makePlan(e.id)} disabled={!!busyId}>{e.plan ? "Regenerate" : "Generate"}</button>
                  <button className="btn btn-ghost btn-sm text-bad" aria-label="Delete exam" onClick={() => setState((s) => { s.exams = s.exams.filter((x) => x.id !== e.id); })}><Trash2 className="h-4 w-4" /></button>
                </div>
                {isOpen && (
                  <div className="mt-4 border-t border-line pt-4">
                    {busyId === e.id ? (draft ? <Markdown>{draft}</Markdown> : <Thinking />) : e.plan ? <Markdown>{e.plan}</Markdown> : <p className="text-sm muted">No plan yet.</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
