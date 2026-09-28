# LearnAI — Personal AI Learning System

An AI tutor that helps you **understand, memorize, practice and master** any subject — and remembers what you struggle with.

Learning loop: **Understand → Recall → Practice → Test → Analyze → Review → Master**

## Features (Phase 1 MVP)

| Area | What it does |
|---|---|
| **AI Tutor** | Streaming chat with 6 modes (General, Course, Document, Exam Prep, Research, Homework Help), 10 explanation styles (simple, ELI10, analogy, visual, exam-focused, memory tricks…), **Socratic mode**, adaptive re-explaining, source lock (only my notes / notes + internet / internet / general), web citations, ask-from-selected-text |
| **Learn** | Structured lessons: big idea, key concepts, flowchart, example, misconceptions, memory hook, quick check |
| **Practice** | One-by-one adaptive quizzes, 7 question types (MCQ, T/F, select-all, fill-in, short answer (AI-graded), ordering, matching), 6 difficulty levels, confidence tracking, "Explain my mistake" with follow-up question, practice my mistakes |
| **Tests** | Timed exams (up to 50 Qs), navigator, flags, auto-save, submit confirmation, topic breakdown, recommended review, detailed review |
| **Flashcards** | Manual + AI (from topic, document, or your mistakes), SM-2 spaced repetition (Again/Hard/Good/Easy), active-recall typing mode, keyboard shortcuts |
| **Courses** | Manual courses or **AI course generator** (modules & lessons), per-topic mastery |
| **Library** | Upload PDF/DOCX/TXT/MD (parsed in-browser), summaries at 5 levels, notes, flashcards, quizzes/tests from documents, document chat with retrieval |
| **Research** | Web search with source-quality preference and citations |
| **Study Plan** | Exam countdown, AI day-by-day plans weighted toward weak topics, "I have 30 minutes" session builder |
| **Progress** | Mastery scores (accuracy × difficulty × recency × confidence), weak/strong concepts, mistake log, learning profile, weekly AI report, streaks, XP, achievements |
| **Other** | Universal search (⌘K), dark mode, larger text, dyslexia-friendly mode, reduced motion, guest mode (data stays in your browser), backup export/import |

## Run locally

```bash
npm install
cp .env.example .env.local   # add your OPENAI_API_KEY
npm run dev                  # http://localhost:3000
```

## Deploy (GitHub → Vercel)

1. Push this repo to GitHub.
2. Go to <https://vercel.com/new>, import the repo (framework auto-detected: Next.js).
3. Add environment variable `OPENAI_API_KEY` (and optionally `OPENAI_MODEL`).
4. Click **Deploy**. Every push to `main` redeploys automatically.

## Architecture

```
Browser (guest mode: localStorage + IndexedDB)
  ├─ Tutor / Learn / Practice / Tests / Flashcards / Plan / Progress UI
  ├─ Memory engine: mastery scores, weak spots, misconceptions → learner summary
  └─ Document engine: PDF/DOCX parsing, chunking, BM25 retrieval
        │  (only the relevant excerpts + learner summary are sent)
        ▼
Next.js route handlers (server — API key never leaves here)
  /api/tutor     streaming tutor (Responses API, optional web_search)
  /api/task      streaming lessons, summaries, research, plans, sessions, reports
  /api/generate  JSON: quizzes, flashcards, grading, mistake diagnosis, courses
        ▼
OpenAI Responses API
```

Security: API key is server-only, per-IP rate limiting, input length caps, JSON output validation.

## Roadmap

- **Phase 2**: Supabase auth + cloud sync (guest data migrates on sign-up), pgvector semantic search, knowledge graph view, calendar reminders
- **Phase 3**: Voice tutor, audio lessons, image/diagram understanding, math step-by-step mode, coding & language modes
- **Phase 4**: Teacher/classroom mode, parent dashboards, community decks, LMS integrations
