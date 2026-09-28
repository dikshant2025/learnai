"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, PlayCircle, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { DATA_NOTE, GUIDE, openTour, resetTips } from "@/components/Guide";

const QUICK_START = [
  { n: 1, title: "Upload your notes", body: "Library → Upload a PDF, Word file or text file.", href: "/library" },
  { n: 2, title: "Let the tutor teach it", body: "Open the document and click Teach it.", href: "/library" },
  { n: 3, title: "Test yourself", body: "Create quiz or Create test from the same document.", href: "/practice" },
  { n: 4, title: "Remember it", body: "Make flashcards and review the due ones each day.", href: "/flashcards" },
];

const FAQ: [string, string][] = [
  ["How do I sign in?", "Enter your email, and we'll email you a code. Type the code in and you're in — no password. The first time, this creates your account."],
  ["I didn't get the code.", "Wait a minute and check your spam or junk folder. Then use “Send a new code” (you can request one every 60 seconds). Only the newest code works."],
  ["Will my documents and progress be saved?", "Yes. Everything is saved to your account automatically a moment after you make a change. If you're offline, it saves when you're back online."],
  ["Can I use it on my phone and my laptop?", "Yes. Sign in with the same email on each device and all your notes, documents and progress are there."],
  ["Can other people see my files?", "No. Your data is stored privately in your account and only you can access it. Remember to sign out on shared computers."],
  ["My PDF doesn't work.", "It's probably scanned (a picture of pages). The app needs PDFs whose text you can select. Try exporting a text-based PDF or a Word file."],
  ["The AI gave an error or is slow.", "Wait a few seconds and try again. If you send many requests quickly there's a short per-minute limit."],
  ["Is the AI always right?", "Usually, but not always. For important facts, use Research (it shows sources) or set the tutor to answer only from your uploaded material."],
];

export default function GuidePage() {
  const [tipsReset, setTipsReset] = useState(false);
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader
        title="How to use LearnAI"
        subtitle="Everything you can do here, step by step."
        actions={
          <button className="btn btn-primary" onClick={openTour}>
            <PlayCircle className="h-4 w-4" /> Replay the intro
          </button>
        }
      />

      <section className="card p-5">
        <h2 className="h2 mb-3">Quick start — study your own notes in 4 steps</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {QUICK_START.map((q) => (
            <Link key={q.n} href={q.href} className="flex gap-3 rounded-xl border border-line p-3 hover:bg-surface-2">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-[var(--accent-text)]">
                {q.n}
              </div>
              <div>
                <div className="font-semibold">{q.title}</div>
                <div className="text-sm muted">{q.body}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <nav className="mt-6 flex flex-wrap gap-2" aria-label="Jump to feature">
        {GUIDE.map((g) => (
          <a key={g.id} href={`#${g.id}`} className="chip">
            {g.title.split(" — ")[0]}
          </a>
        ))}
        <a href="#data" className="chip">Your data</a>
        <a href="#faq" className="chip">FAQ</a>
      </nav>

      <div className="mt-6 space-y-4">
        {GUIDE.map((g) => {
          const Icon = g.icon;
          return (
            <section key={g.id} id={g.id} className="card scroll-mt-20 p-5">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="h2">{g.title}</h2>
              </div>
              <p className="mt-2 muted">{g.summary}</p>
              <ol className="mt-3 list-decimal space-y-1.5 pl-5">
                {g.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              {g.tips && (
                <ul className="mt-3 space-y-1 text-sm muted">
                  {g.tips.map((t) => (
                    <li key={t}>💡 {t}</li>
                  ))}
                </ul>
              )}
              <Link href={g.href} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
                Open {g.title.split(" — ")[0]} <ArrowRight className="h-4 w-4" />
              </Link>
            </section>
          );
        })}

        <section id="data" className="card scroll-mt-20 p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h2 className="h2">{DATA_NOTE.title}</h2>
          </div>
          <ul className="mt-3 list-disc space-y-1.5 pl-5">
            {DATA_NOTE.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <Link href="/settings" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
            Open Profile & Settings <ArrowRight className="h-4 w-4" />
          </Link>
        </section>

        <section className="card p-5">
          <h2 className="h2">Handy extras</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5">
            <li>
              <b>Search everything:</b> press ⌘K (Mac) or Ctrl+K (Windows), or the Search button in the menu.
            </li>
            <li>
              <b>Make it yours:</b> in Profile & Settings set your name, education level, learning goals and teaching style — every
              explanation adapts to it.
            </li>
            <li>
              <b>Easier to read:</b> dark mode, larger text, a dyslexia-friendly font and reduced motion are in Profile & Settings.
            </li>
            <li>
              <b>Streaks & XP:</b> studying each day builds your streak and levels you up (see the box at the bottom of the menu).
            </li>
          </ul>
        </section>

        <section id="faq" className="card scroll-mt-20 p-5">
          <h2 className="h2 mb-2">FAQ</h2>
          <div className="divide-y divide-line">
            {FAQ.map(([q, a]) => (
              <details key={q} className="py-3">
                <summary className="cursor-pointer font-semibold">{q}</summary>
                <p className="mt-2 muted">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3 pb-4">
          <button
            className="btn h-auto max-w-full whitespace-normal text-left"
            onClick={() => {
              resetTips();
              setTipsReset(true);
            }}
          >
            Show the “How this page works” tips again
          </button>
          {tipsReset && <span className="text-sm text-good">Done — tips will reappear on each page.</span>}
        </div>
      </div>
    </div>
  );
}
