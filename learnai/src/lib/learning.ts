import type { Attempt, Card, State } from "./types";
import { dayKey } from "./store";

const DAY = 86_400_000;

const DIFF_WEIGHT: Record<string, number> = {
  beginner: 0.6,
  easy: 0.8,
  medium: 1,
  hard: 1.25,
  "very hard": 1.5,
  "exam level": 1.4,
};

const CONF_ADJ: Record<string, number> = { guess: 0.5, unsure: 0.8, pretty: 1, very: 1 };

/**
 * Mastery score (0-100) for a set of attempts.
 * Combines accuracy, question difficulty, recency (half-life 14 days),
 * confidence (lucky guesses count less), number of attempts (few attempts
 * are pulled toward 50% uncertainty) and time since last review (forgetting).
 */
export function masteryOf(attempts: Attempt[], now = Date.now()): number {
  if (!attempts.length) return 0;
  let num = 0;
  let den = 0;
  for (const a of attempts) {
    const age = (now - a.date) / DAY;
    const w = Math.pow(0.5, age / 14) * (DIFF_WEIGHT[a.difficulty?.toLowerCase()] ?? 1);
    let credit = a.correct ? CONF_ADJ[a.confidence ?? "pretty"] ?? 1 : 0;
    // confidently wrong = misconception → extra penalty
    if (!a.correct && a.confidence === "very") credit = -0.25;
    num += w * credit;
    den += w;
  }
  let acc = Math.max(0, num / den);
  const n = attempts.length;
  acc = (acc * n + 0.5 * 2) / (n + 2); // Bayesian shrink toward 50%
  const last = Math.max(...attempts.map((a) => a.date));
  const daysSince = (now - last) / DAY;
  const decay = daysSince > 7 ? Math.max(0.75, 1 - (daysSince - 7) * 0.01) : 1;
  return Math.round(Math.min(100, acc * decay * 100));
}

export function masteryLabel(score: number) {
  if (score <= 20) return "Beginning";
  if (score <= 40) return "Developing";
  if (score <= 60) return "Learning";
  if (score <= 80) return "Strong";
  if (score <= 95) return "Mastered";
  return "Highly Mastered";
}

export function masteryColor(score: number) {
  if (score <= 40) return "var(--bad)";
  if (score <= 60) return "var(--warn)";
  if (score <= 80) return "var(--accent)";
  return "var(--good)";
}

export type TopicStat = {
  key: string;
  topic: string;
  subtopic?: string;
  courseId?: string;
  mastery: number;
  attempts: number;
  accuracy: number;
  last: number;
  misconceptions: number;
};

function group(attempts: Attempt[], keyFn: (a: Attempt) => string) {
  const m = new Map<string, Attempt[]>();
  for (const a of attempts) {
    const k = keyFn(a);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(a);
  }
  return m;
}

function stat(key: string, list: Attempt[], extra: Partial<TopicStat>): TopicStat {
  const correct = list.filter((a) => a.correct).length;
  return {
    key,
    topic: list[0].topic,
    courseId: list[0].courseId,
    mastery: masteryOf(list),
    attempts: list.length,
    accuracy: Math.round((correct / list.length) * 100),
    last: Math.max(...list.map((a) => a.date)),
    misconceptions: list.filter((a) => !a.correct && (a.confidence === "very" || a.confidence === "pretty")).length,
    ...extra,
  };
}

export function topicStats(attempts: Attempt[]): TopicStat[] {
  const g = group(attempts, (a) => `${a.courseId ?? ""}|${a.topic.toLowerCase()}`);
  return [...g.entries()].map(([k, list]) => stat(k, list, {})).sort((a, b) => a.mastery - b.mastery);
}

export function subtopicStats(attempts: Attempt[]): TopicStat[] {
  const g = group(attempts, (a) => `${a.topic.toLowerCase()}|${a.subtopic.toLowerCase()}`);
  return [...g.entries()].map(([k, list]) => stat(k, list, { subtopic: list[0].subtopic })).sort((a, b) => a.mastery - b.mastery);
}

/** Weak sub-concepts: low mastery with at least 2 attempts, or any confident misses. */
export function weakSpots(attempts: Attempt[], limit = 6): TopicStat[] {
  return subtopicStats(attempts)
    .filter((s) => (s.attempts >= 2 && s.mastery < 60) || s.misconceptions > 0)
    .slice(0, limit);
}

export function courseMastery(s: State, courseId: string) {
  const list = s.attempts.filter((a) => a.courseId === courseId);
  return masteryOf(list);
}

/* ---------------- Spaced repetition (SM-2 variant) ---------------- */

export type Rating = "again" | "hard" | "good" | "easy";

export function schedule(card: Card, rating: Rating, now = Date.now()): Card {
  let { ease, interval, reps, lapses } = card;
  if (rating === "again") {
    reps = 0;
    lapses += 1;
    interval = 0; // show again today (10 min)
    ease = Math.max(1.3, ease - 0.2);
  } else {
    reps += 1;
    if (rating === "hard") ease = Math.max(1.3, ease - 0.15);
    if (rating === "easy") ease = ease + 0.15;
    if (reps === 1) interval = rating === "easy" ? 3 : 1;
    else if (reps === 2) interval = rating === "hard" ? 2 : rating === "easy" ? 7 : 3;
    else interval = Math.round(interval * (rating === "hard" ? 1.2 : rating === "easy" ? ease * 1.3 : ease));
    interval = Math.min(interval, 365);
  }
  const due = interval === 0 ? now + 10 * 60_000 : startOfDay(now) + interval * DAY;
  return { ...card, ease, interval, reps, lapses, due, lastReviewed: now };
}

export function previewInterval(card: Card, rating: Rating) {
  const n = schedule(card, rating);
  if (n.interval === 0) return "10m";
  if (n.interval < 30) return `${n.interval}d`;
  if (n.interval < 365) return `${Math.round(n.interval / 30)}mo`;
  return "1y";
}

export function newCard(partial: { front: string; back: string; topic?: string; courseId?: string; id: string }): Card {
  const now = Date.now();
  return { topic: "", ease: 2.5, interval: 0, reps: 0, lapses: 0, due: now, createdAt: now, ...partial } as Card;
}

function startOfDay(t: number) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function dueCards(cards: Card[], now = Date.now()) {
  const end = startOfDay(now) + DAY;
  return cards.filter((c) => c.due < end);
}

/* ---------------- Streaks, XP, levels ---------------- */

export function streak(activity: State["activity"]) {
  let n = 0;
  const d = new Date();
  if (!activity[dayKey(d)]?.xp) d.setDate(d.getDate() - 1); // today not started yet is ok
  while (activity[dayKey(d)]?.xp) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function level(xp: number) {
  // level n needs 100 * n^1.5 cumulative-ish; simple and friendly
  let lvl = 1;
  let need = 100;
  let rem = xp;
  while (rem >= need) {
    rem -= need;
    lvl++;
    need = Math.round(100 * Math.pow(lvl, 1.3));
  }
  return { level: lvl, into: rem, need };
}

export function achievements(s: State) {
  const totalQ = s.attempts.length;
  const reviewed = Object.values(s.activity).reduce((a, d) => a + d.cards, 0);
  const mastered = s.cards.filter((c) => c.interval >= 21).length;
  const minutes = Object.values(s.activity).reduce((a, d) => a + d.minutes, 0);
  return [
    { name: "First Quiz", done: totalQ > 0, icon: "🎯" },
    { name: "100 Questions", done: totalQ >= 100, icon: "💯" },
    { name: "7-Day Streak", done: streak(s.activity) >= 7, icon: "🔥" },
    { name: "First Perfect Test", done: s.tests.some((t) => t.score === t.total && t.total >= 5), icon: "🏆" },
    { name: "100 Cards Reviewed", done: reviewed >= 100, icon: "🗂️" },
    { name: "25 Cards Mastered", done: mastered >= 25, icon: "🧠" },
    { name: "First Course", done: s.courses.length > 0, icon: "📚" },
    { name: "10 Hours Studied", done: minutes >= 600, icon: "⏱️" },
  ];
}

/* ---------------- Learner memory summary (sent to the AI) ---------------- */

export function learnerSummary(s: State, courseId?: string): string {
  const attempts = courseId ? s.attempts.filter((a) => a.courseId === courseId) : s.attempts;
  const lines: string[] = [];
  if (!attempts.length && !s.cards.length) return "";
  const topics = topicStats(attempts);
  if (topics.length) {
    lines.push("Topic mastery: " + topics.slice(0, 12).map((t) => `${t.topic} ${t.mastery}%`).join(", "));
  }
  const weak = weakSpots(attempts, 6);
  if (weak.length) lines.push("Weak sub-concepts: " + weak.map((w) => `${w.subtopic} (${w.topic}, ${w.mastery}%)`).join("; "));
  const mis = attempts
    .filter((a) => a.misconception)
    .slice(-5)
    .map((a) => a.misconception);
  if (mis.length) lines.push("Recent misconceptions: " + mis.join(" | "));
  const recentWrong = attempts
    .filter((a) => !a.correct)
    .slice(-4)
    .map((a) => `"${a.question.slice(0, 90)}" (answered ${a.userAnswer.slice(0, 40)})`);
  if (recentWrong.length) lines.push("Recently missed: " + recentWrong.join("; "));
  const total = attempts.length;
  if (total) {
    const acc = Math.round((attempts.filter((a) => a.correct).length / total) * 100);
    lines.push(`Overall: ${total} questions answered, ${acc}% accuracy.`);
  }
  const due = dueCards(s.cards).length;
  if (due) lines.push(`${due} flashcards due for review.`);
  const upcoming = s.exams.filter((e) => new Date(e.date).getTime() >= Date.now() - DAY);
  if (upcoming.length) lines.push("Upcoming exams: " + upcoming.map((e) => `${e.name} on ${e.date}`).join(", "));
  const last = attempts[attempts.length - 1];
  if (last) lines.push(`Last studied: ${last.topic} (${Math.round((Date.now() - last.date) / DAY)} days ago).`);
  return lines.join("\n");
}

/** Home-screen recommendations. */
export function recommendations(s: State): { text: string; href: string }[] {
  const recs: { text: string; href: string }[] = [];
  const due = dueCards(s.cards).length;
  if (due) recs.push({ text: `Review ${due} due flashcard${due > 1 ? "s" : ""}`, href: "/flashcards?review=1" });
  const seenWeak = new Set<string>();
  for (const w of weakSpots(s.attempts, 6)) {
    const k = (w.subtopic ?? "").toLowerCase();
    if (seenWeak.has(k) || seenWeak.size >= 3) continue;
    seenWeak.add(k);
    recs.push({
      text: `Practice weak spot: ${w.subtopic} (${w.mastery}%)`,
      href: `/practice?topic=${encodeURIComponent(w.topic)}&focus=${encodeURIComponent(w.subtopic ?? "")}${w.courseId ? `&course=${w.courseId}` : ""}`,
    });
  }
  const stale = topicStats(s.attempts).filter((t) => Date.now() - t.last > 7 * DAY).slice(0, 2);
  for (const t of stale) {
    recs.push({
      text: `You haven't reviewed ${t.topic} in ${Math.round((Date.now() - t.last) / DAY)} days`,
      href: `/practice?topic=${encodeURIComponent(t.topic)}${t.courseId ? `&course=${t.courseId}` : ""}`,
    });
  }
  const wrong = s.attempts.filter((a) => !a.correct).length;
  if (wrong >= 3) recs.push({ text: "Practice my mistakes", href: "/practice?mistakes=1" });
  const exam = s.exams
    .filter((e) => new Date(e.date + "T23:59").getTime() > Date.now())
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (exam && !exam.plan) recs.push({ text: `Create a study plan for ${exam.name}`, href: "/plan" });
  if (!recs.length) {
    recs.push({ text: "Learn a new topic", href: "/learn" });
    recs.push({ text: "Take a 5-question practice quiz", href: "/practice" });
  }
  return recs.slice(0, 5);
}

export function daysUntil(date: string) {
  const t = new Date(date + "T00:00").getTime();
  const today = startOfDay(Date.now());
  return Math.round((t - today) / DAY);
}
