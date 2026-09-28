"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  ArrowRight,
  BookOpen,
  Brain,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  FlaskConical,
  GraduationCap,
  Layers,
  LibraryBig,
  LineChart,
  MessageSquare,
  PenLine,
  ShieldCheck,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Guide content: one entry per feature. Used by the welcome tour,     */
/* the per-page "How this page works" tips, and the /guide page.       */
/* ------------------------------------------------------------------ */

export type GuideItem = {
  id: string;
  href: string;
  title: string;
  icon: LucideIcon;
  summary: string;
  steps: string[];
  tips?: string[];
};

export const GUIDE: GuideItem[] = [
  {
    id: "library",
    href: "/library",
    title: "Library — your notes & PDFs",
    icon: LibraryBig,
    summary: "Upload your own study material once, then turn it into lessons, summaries, flashcards, quizzes and tests.",
    steps: [
      "Open Library and click Upload. You can pick PDFs, Word files (.docx) or text files — several at once.",
      "Click a document to open it. You'll see buttons: Teach it, Ask questions about it, summaries, Make flashcards, Create quiz, Create test, Explain difficult sections.",
      "Pick Teach it to have the AI tutor walk you through the document step by step.",
    ],
    tips: [
      "Scanned PDFs (photos of pages) can't be read — the text must be selectable.",
      "For a whole textbook, upload one chapter per file for the best quizzes and flashcards.",
      "Documents are kept in this browser on this device. They stay there until you clear your browser's site data.",
    ],
  },
  {
    id: "tutor",
    href: "/tutor",
    title: "AI Tutor — ask anything",
    icon: MessageSquare,
    summary: "A patient tutor you can chat with about any topic, or about your own documents.",
    steps: [
      "Click New Chat (top of the menu) and type your question — e.g. “Explain photosynthesis step by step.”",
      "Use the options above the chat box: a mode (General, Course, Document, Exam Prep, Research, Homework Help), an explanation style (Explain simply, Like I'm 10, Analogy, Memory tricks…), and “Answer using” (general knowledge, only your uploaded material, your material + internet, or internet).",
      "To study your own notes, choose your document under “Documents for this chat” and set “Answer using” to Only uploaded material.",
      "Under each answer you can click Make it easier, Example, Diagram, or Quiz me. Highlight any sentence in an answer to ask about just that part.",
    ],
    tips: ["Your chats are saved — find them under Recent chats in the menu."],
  },
  {
    id: "learn",
    href: "/learn",
    title: "Learn — short lessons",
    icon: Brain,
    summary: "Type a concept and get a clear lesson explained the way that works for you.",
    steps: [
      "Enter a topic (e.g. “Newton's second law”).",
      "Choose how it should be explained, and optionally base it on one of your documents.",
      "Read the lesson, then jump straight into practice questions on it.",
    ],
  },
  {
    id: "practice",
    href: "/practice",
    title: "Practice — quizzes that adapt",
    icon: PenLine,
    summary: "Questions one at a time, with instant feedback and explanations. Difficulty adapts to you.",
    steps: [
      "Choose where questions come from: a topic, a course, or a document from your Library.",
      "Pick the number of questions, difficulty and question types (multiple choice, true/false, fill in the blank, matching, ordering, short answer…).",
      "Answer, say how sure you were (Guess → Very sure), then click Check answer.",
      "Got it wrong? Click Explain my mistake. At the end you can practise only your mistakes or turn them into flashcards.",
    ],
  },
  {
    id: "tests",
    href: "/tests",
    title: "Tests — timed exams",
    icon: FlaskConical,
    summary: "Realistic timed exams. No answers are shown until you submit.",
    steps: [
      "Enter an exam topic or pick a course/document, then set questions, difficulty and time limit.",
      "Use the question navigator to jump around and flag questions to come back to. Progress auto-saves.",
      "Click Review & submit to see your score, a breakdown by topic, and what to review next.",
    ],
  },
  {
    id: "flashcards",
    href: "/flashcards",
    title: "Flashcards — remember for good",
    icon: Layers,
    summary: "Spaced repetition: cards come back just before you'd forget them.",
    steps: [
      "Make cards by hand, or click Generate cards from a topic or one of your documents.",
      "Click Review now. Try to recall the answer, flip the card (or press Space), then rate it: Again, Hard, Good or Easy.",
      "Come back daily — the Home page shows how many cards are due.",
    ],
  },
  {
    id: "courses",
    href: "/courses",
    title: "Courses — organise a subject",
    icon: GraduationCap,
    summary: "Group topics, documents, flashcards, quizzes and progress for one subject — or let the AI build a full course.",
    steps: [
      "Click Create course and name it (e.g. “Biology 101”), or use Generate course and type what you want to learn.",
      "Open the course to see its topics, materials, weak areas and study plan. Click Upload inside a course to add documents to it.",
    ],
  },
  {
    id: "research",
    href: "/research",
    title: "Research — answers with sources",
    icon: BookOpen,
    summary: "Searches the web, prefers reliable sources, and shows citations you can click.",
    steps: [
      "Type a research question and read the cited answer.",
      "Then click Teach me this, Quiz me on this, or Discuss with tutor.",
    ],
  },
  {
    id: "plan",
    href: "/plan",
    title: "Study Plan — beat the exam date",
    icon: CalendarDays,
    summary: "A day-by-day plan built around your exam date and your weakest topics.",
    steps: [
      "Short on time? Under Start today's session, pick how long you have (20 min – 3 hours) and click Build session — it mixes due flashcards, weak topics and recent mistakes.",
      "Have an exam coming? Add its name, date, course and study time per day, then click Add exam & generate plan. A countdown keeps you on track.",
    ],
  },
  {
    id: "progress",
    href: "/progress",
    title: "Progress — see what to fix",
    icon: LineChart,
    summary: "Mastery by topic, weak spots, a log of your mistakes, test scores, streaks, XP and achievements.",
    steps: [
      "Check Weakest concepts and click Practice my mistakes to focus on them.",
      "Open AI weekly report for a summary of your week and what to do next.",
    ],
  },
];

export const DATA_NOTE = {
  title: "Where your stuff is saved",
  points: [
    "No account needed. Everything you do — documents, chats, flashcards, progress — is saved in this browser on this device.",
    "It stays until you clear this site's data in your browser (or use a private/incognito window, which forgets everything when closed).",
    "Using another phone or computer? Go to Profile & Settings → Export backup, then Import backup on the other device. (Re-upload documents there.)",
    "Your data is private: it isn't shared with other people who use this site.",
  ],
};

/* ------------------------------------------------------------------ */
/* Small localStorage helpers (safe when storage is blocked)           */
/* ------------------------------------------------------------------ */

const WELCOMED = "learnai:welcomed";
const TIPS = "learnai:tips-dismissed";
const OPEN_EVENT = "learnai:open-tour";

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {}
}

/** Anywhere in the app: openTour() re-opens the welcome tour. */
export function openTour() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

const noopSubscribe = () => () => {};
function useIsClient() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/** Ask the browser not to evict our data under storage pressure. */
function usePersistentStorage() {
  useEffect(() => {
    try {
      navigator.storage?.persist?.().catch(() => {});
    } catch {}
  }, []);
}

/* ------------------------------------------------------------------ */
/* Welcome tour (shown automatically on a person's first visit)         */
/* ------------------------------------------------------------------ */

type Slide = { icon: LucideIcon; title: string; body: string; points?: string[]; href?: string; cta?: string };

const SLIDES: Slide[] = [
  {
    icon: Sparkles,
    title: "Welcome to LearnAI 👋",
    body: "Your personal AI study partner. It helps you understand topics, memorise them, and practise with quizzes and tests — using your own notes or anything you're curious about.",
    points: [
      "Takes about 1 minute to go through.",
      "You can reopen this intro any time from “How to use” in the menu.",
    ],
  },
  ...GUIDE.map((g) => ({
    icon: g.icon,
    title: g.title,
    body: g.summary,
    points: g.steps.slice(0, 3),
    href: g.href,
    cta: `Open ${g.title.split(" — ")[0]}`,
  })),
  { icon: ShieldCheck, title: DATA_NOTE.title, body: "", points: DATA_NOTE.points },
  {
    icon: LibraryBig,
    title: "Best way to start",
    body: "Upload a PDF of your notes, click Teach it, then make flashcards and a quiz from the same document.",
    points: [
      "1. Library → Upload your notes",
      "2. Teach it — the tutor explains it step by step",
      "3. Make flashcards + Create quiz",
      "4. Review due flashcards every day",
    ],
    href: "/library",
    cta: "Upload my first document",
  },
];

export function WelcomeTour() {
  usePersistentStorage();
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    const show = () => {
      setI(0);
      setOpen(true);
    };
    if (!read(WELCOMED)) {
      const t = setTimeout(show, 400);
      window.addEventListener(OPEN_EVENT, show);
      return () => {
        clearTimeout(t);
        window.removeEventListener(OPEN_EVENT, show);
      };
    }
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setI((x) => Math.min(SLIDES.length - 1, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function close() {
    write(WELCOMED, "1");
    setOpen(false);
  }

  if (!open) return null;
  const s = SLIDES[i];
  const Icon = s.icon;
  const last = i === SLIDES.length - 1;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div className="absolute inset-0 bg-black/50" onClick={close} />
      <div className="card relative w-full max-w-lg p-6 shadow-2xl">
        <button className="btn btn-ghost btn-sm absolute right-3 top-3" onClick={close} aria-label="Close intro">
          <X className="h-4 w-4" />
        </button>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide muted">
          {i === 0 ? "Quick intro" : `Step ${i} of ${SLIDES.length - 1}`}
        </div>
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <Icon className="h-6 w-6" />
          </div>
          <h2 id="tour-title" className="text-xl font-bold tracking-tight">
            {s.title}
          </h2>
        </div>
        {s.body && <p className="mt-3">{s.body}</p>}
        {s.points && (
          <ul className="mt-3 space-y-2 text-[0.95rem]">
            {s.points.map((p) => (
              <li key={p} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        )}
        {s.href && (
          <Link href={s.href} onClick={close} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
            {s.cta} <ArrowRight className="h-4 w-4" />
          </Link>
        )}

        <div className="mt-5 flex justify-center gap-1.5" aria-hidden>
          {SLIDES.map((_, k) => (
            <button
              key={k}
              tabIndex={-1}
              onClick={() => setI(k)}
              className={`h-1.5 rounded-full transition-all ${k === i ? "w-5 bg-accent" : "w-1.5 bg-surface-2"}`}
            />
          ))}
        </div>

        <div className="mt-5 flex items-center gap-2">
          {i > 0 ? (
            <button className="btn" onClick={() => setI(i - 1)}>
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
          ) : (
            <button className="btn btn-ghost" onClick={close}>
              Skip intro
            </button>
          )}
          <Link href="/guide" onClick={close} className="btn btn-ghost ml-auto hidden sm:inline-flex">
            Full guide
          </Link>
          {last ? (
            <button className="btn btn-primary ml-auto sm:ml-0" onClick={close}>
              Start learning
            </button>
          ) : (
            <button className="btn btn-primary ml-auto sm:ml-0" onClick={() => setI(i + 1)}>
              Next <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* "How this page works" tip shown at the top of each feature page      */
/* ------------------------------------------------------------------ */

export function PageTip() {
  const path = usePathname();
  const isClient = useIsClient();
  const [dismissed, setDismissed] = useState<string[] | null>(null);
  const [expanded, setExpanded] = useState(true);

  const item = GUIDE.find((g) => path === g.href || path.startsWith(g.href + "/"));
  const list = dismissed ?? (isClient ? safeList() : []);

  if (!isClient || !item || list.includes(item.id)) return null;

  const dismiss = () => {
    const next = [...list, item.id];
    write(TIPS, JSON.stringify(next));
    setDismissed(next);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 pt-5 sm:px-6">
      <div className="rounded-xl border border-line bg-accent-soft/60 p-4 text-sm">
        <div className="flex items-start gap-3">
          <CircleHelp className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <button className="text-left font-semibold" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded}>
              How this page works {expanded ? "▾" : "▸"}
            </button>
            {expanded && (
              <>
                <p className="mt-1 muted">{item.summary}</p>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                  {item.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
                {item.tips && (
                  <ul className="mt-2 space-y-1 muted">
                    {item.tips.map((t) => (
                      <li key={t}>💡 {t}</li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn btn-primary btn-sm" onClick={dismiss}>
                    Got it
                  </button>
                  <Link href="/guide" className="btn btn-sm">
                    Full guide
                  </Link>
                </div>
              </>
            )}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={dismiss} aria-label="Hide this tip">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function safeList(): string[] {
  try {
    const v = JSON.parse(read(TIPS) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Clears dismissed page tips so they show again. */
export function resetTips() {
  write(TIPS, "[]");
}
