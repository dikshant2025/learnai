"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BookmarkPlus, Layers, MessageSquare, PenLine, Sparkles } from "lucide-react";
import { getState, logActivity, setState, uid, useHydrated, useStore } from "@/lib/store";
import { newCard } from "@/lib/learning";
import { sampleText, contextFor } from "@/lib/docs";
import { generate, streamTask } from "@/lib/api";
import { Chips, CourseSelect, ErrorBox, Markdown, PageHeader, Thinking } from "@/components/ui";
import { STYLES } from "../tutor/Client";

const LEVELS = ["Beginner", "High school", "College intro", "College advanced", "Graduate"];

export default function LearnClient() {
  const params = useSearchParams();
  const hydrated = useHydrated();
  const courses = useStore((s) => s.courses);
  const docs = useStore((s) => s.docs);
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState("College intro");
  const [style, setStyle] = useState("normal");
  const [courseId, setCourseId] = useState<string | undefined>();
  const [docId, setDocId] = useState("");
  const [out, setOut] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (!hydrated || started.current) return;
    const t = params.get("topic");
    const c = params.get("course") ?? undefined;
    if (c) setCourseId(c);
    if (t) {
      setTopic(t);
      started.current = true;
      run(t, c);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  async function run(t = topic, c = courseId, st = style) {
    if (!t.trim()) return;
    setBusy(true);
    setError("");
    setNotice("");
    setOut("");
    try {
      let context = "";
      if (docId) {
        const d = getState().docs.find((x) => x.id === docId);
        if (d) {
          const hits = await contextFor([d], t, 8);
          context = hits.length ? hits.map((h) => h.text).join("\n\n") : await sampleText(d.id, 12000);
        }
      }
      const course = getState().courses.find((x) => x.id === c);
      await streamTask(
        "lesson",
        { topic: course ? `${t} (course: ${course.name})` : t, level, style: st, context, profile: getState().profile },
        (x) => setOut(x),
      );
      logActivity({ xp: 5, minutes: 5 });
    } catch (e) {
      setError((e as Error).message);
      setOut(null);
    } finally {
      setBusy(false);
    }
  }

  async function makeCards() {
    if (!out) return;
    setNotice("Creating flashcards…");
    try {
      const { cards } = await generate<{ cards: { front: string; back: string; topic: string }[] }>("flashcards", {
        count: 10,
        context: out,
        topic,
      });
      setState((s) => {
        for (const c of cards) s.cards.push(newCard({ id: uid(), front: c.front, back: c.back, topic: c.topic || topic, courseId }));
      });
      setNotice(`Added ${cards.length} flashcards to your deck.`);
    } catch (e) {
      setNotice("");
      setError((e as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader title="Learn" subtitle="Understand any concept, explained the way that works for you." />
      <form
        className="card space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <div>
          <label className="label" htmlFor="topic">
            Topic
          </label>
          <input
            id="topic"
            className="input"
            placeholder="e.g. Glycolysis, Newton's 2nd law, Supply and demand…"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        </div>
        <div>
          <span className="label">How should I explain it?</span>
          <Chips options={STYLES} value={style} onChange={setStyle} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="level">
              Level
            </label>
            <select id="level" className="input" value={level} onChange={(e) => setLevel(e.target.value)}>
              {LEVELS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="course">
              Course
            </label>
            <CourseSelect id="course" courses={courses} value={courseId} onChange={setCourseId} />
          </div>
          <div>
            <label className="label" htmlFor="doc">
              Teach from my notes
            </label>
            <select id="doc" className="input" value={docId} onChange={(e) => setDocId(e.target.value)}>
              <option value="">General knowledge</option>
              {docs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button className="btn btn-primary" disabled={busy || !topic.trim()}>
          <Sparkles className="h-4 w-4" /> {busy ? "Teaching…" : "Teach me"}
        </button>
      </form>

      <div className="mt-4">
        <ErrorBox>{error}</ErrorBox>
      </div>

      {out !== null && (
        <article className="card mt-6 p-6">
          {out ? <Markdown>{out}</Markdown> : <Thinking />}
          {!busy && out && (
            <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-4">
              <Link className="btn btn-primary btn-sm" href={`/practice?topic=${encodeURIComponent(topic)}${courseId ? `&course=${courseId}` : ""}`}>
                <PenLine className="h-4 w-4" /> Practice this
              </Link>
              <button className="btn btn-sm" onClick={makeCards}>
                <Layers className="h-4 w-4" /> Make flashcards
              </button>
              <Link className="btn btn-sm" href={`/tutor?new=1&q=${encodeURIComponent(`I just studied "${topic}". Ask me questions one at a time to check my understanding.`)}${courseId ? `&course=${courseId}` : ""}`}>
                <MessageSquare className="h-4 w-4" /> Discuss with tutor
              </Link>
              <button
                className="btn btn-sm"
                onClick={() => {
                  setState((s) => {
                    s.saved.push({ id: uid(), title: topic, content: out, kind: "lesson", courseId, createdAt: Date.now() });
                  });
                  setNotice("Lesson saved to your Library.");
                }}
              >
                <BookmarkPlus className="h-4 w-4" /> Save lesson
              </button>
              <button className="btn btn-sm" onClick={() => { setStyle("analogy"); run(topic, courseId, "analogy"); }}>
                Still confused? Try an analogy
              </button>
            </div>
          )}
          {notice && <p className="mt-3 text-sm text-good">{notice}</p>}
        </article>
      )}
    </div>
  );
}
