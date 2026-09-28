"use client";

import { Check, X } from "lucide-react";
import { useMemo } from "react";
import type { Question } from "@/lib/types";

export type Answer = number[] | string;

const LETTERS = "ABCDEFGH";

export const TYPE_LABEL: Record<string, string> = {
  mcq: "Multiple choice",
  tf: "True / False",
  multi: "Select all that apply",
  fill: "Fill in the blank",
  short: "Short answer",
  order: "Put in order",
  match: "Matching",
};

function seeded(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export function matchParts(q: Question) {
  const pairs = q.options.map((o) => o.split("⇢").map((s) => s.trim()));
  const rnd = seeded(q.question);
  const order = pairs.map((_, i) => i).sort(() => rnd() - 0.5);
  return { lefts: pairs.map((p) => p[0]), rights: pairs.map((p) => p[1] ?? ""), order };
}

export function isAnswered(q: Question, a: Answer | undefined) {
  if (a === undefined) return false;
  if (typeof a === "string") return a.trim().length > 0;
  if (q.type === "order" || q.type === "match") return a.length === q.options.length && a.every((x) => x >= 0);
  return a.length > 0;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Returns true/false, or null when the AI needs to grade it (free text). */
export function gradeLocal(q: Question, a: Answer): boolean | null {
  switch (q.type) {
    case "mcq":
    case "tf":
      return Array.isArray(a) && a[0] === q.correct[0];
    case "multi": {
      if (!Array.isArray(a)) return false;
      const x = [...a].sort().join(",");
      return x === [...q.correct].sort().join(",");
    }
    case "order":
      return Array.isArray(a) && a.join(",") === q.correct.join(",");
    case "match":
      return Array.isArray(a) && a.every((v, i) => v === i);
    case "fill": {
      if (typeof a !== "string") return false;
      const alts = q.answerText.split(/\s*(?:\/|\bor\b|;)\s*/i).map(norm);
      return alts.includes(norm(a)) ? true : null;
    }
    case "short":
      return null;
  }
}

export function answerToString(q: Question, a: Answer | undefined): string {
  if (a === undefined) return "(no answer)";
  if (typeof a === "string") return a;
  if (q.type === "order") return a.map((i) => q.options[i]).join(" → ");
  if (q.type === "match") {
    const { lefts, rights } = matchParts(q);
    return a.map((r, i) => `${lefts[i]} ⇢ ${rights[r] ?? "?"}`).join("; ");
  }
  return a.map((i) => `${LETTERS[i]}. ${q.options[i]}`).join(", ");
}

export function correctToString(q: Question) {
  if (q.type === "fill" || q.type === "short") return q.answerText;
  if (q.type === "order") return q.correct.map((i) => q.options[i]).join(" → ");
  if (q.type === "match") return q.options.join("; ");
  return q.correct.map((i) => `${LETTERS[i]}. ${q.options[i]}`).join(", ");
}

export default function QuestionView({
  q,
  value,
  onChange,
  revealed,
  disabled,
}: {
  q: Question;
  value: Answer | undefined;
  onChange: (a: Answer) => void;
  revealed?: boolean;
  disabled?: boolean;
}) {
  const locked = revealed || disabled;
  const arr = Array.isArray(value) ? value : [];

  const matchData = useMemo(() => (q.type === "match" ? matchParts(q) : null), [q]);

  if (q.type === "fill" || q.type === "short") {
    return (
      <div>
        {q.type === "short" ? (
          <textarea
            className="input min-h-28"
            placeholder="Type your answer in your own words…"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={locked}
            aria-label="Your answer"
          />
        ) : (
          <input
            className="input"
            placeholder="Fill in the blank…"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={locked}
            aria-label="Your answer"
          />
        )}
        {revealed && (
          <div className="mt-3 rounded-xl bg-surface-2 px-4 py-3 text-sm">
            <span className="font-semibold">Model answer: </span>
            {q.answerText}
          </div>
        )}
      </div>
    );
  }

  if (q.type === "order") {
    const remaining = q.options.map((_, i) => i).filter((i) => !arr.includes(i));
    return (
      <div className="space-y-3">
        <div className="text-sm muted">Click the items in the correct order.</div>
        <ol className="space-y-2">
          {arr.map((idx, pos) => {
            const ok = revealed ? q.correct[pos] === idx : undefined;
            return (
              <li
                key={pos}
                className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 ${
                  ok === true ? "border-good bg-good-soft" : ok === false ? "border-bad bg-bad-soft" : "border-accent bg-accent-soft"
                }`}
              >
                <span className="font-bold">{pos + 1}.</span> {q.options[idx]}
                {!locked && (
                  <button className="btn btn-ghost btn-sm ml-auto" onClick={() => onChange(arr.filter((_, i) => i !== pos))} aria-label="Remove">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ol>
        {!locked && remaining.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {remaining.map((i) => (
              <button key={i} className="btn" onClick={() => onChange([...arr, i])}>
                {q.options[i]}
              </button>
            ))}
          </div>
        )}
        {revealed && (
          <div className="rounded-xl bg-surface-2 px-4 py-3 text-sm">
            <span className="font-semibold">Correct order: </span>
            {correctToString(q)}
          </div>
        )}
      </div>
    );
  }

  if (q.type === "match" && matchData) {
    const { lefts, rights, order } = matchData;
    const cur = arr.length === lefts.length ? arr : lefts.map(() => -1);
    return (
      <div className="space-y-2">
        {lefts.map((l, i) => {
          const ok = revealed ? cur[i] === i : undefined;
          return (
            <div
              key={i}
              className={`grid gap-2 rounded-xl border px-3 py-2 sm:grid-cols-2 sm:items-center ${
                ok === true ? "border-good bg-good-soft" : ok === false ? "border-bad bg-bad-soft" : "border-line"
              }`}
            >
              <div className="font-medium">{l}</div>
              <select
                className="input"
                value={cur[i]}
                disabled={locked}
                aria-label={`Match for ${l}`}
                onChange={(e) => {
                  const next = [...cur];
                  next[i] = Number(e.target.value);
                  onChange(next);
                }}
              >
                <option value={-1}>Choose…</option>
                {order.map((r) => (
                  <option key={r} value={r}>
                    {rights[r]}
                  </option>
                ))}
              </select>
              {revealed && !ok && <div className="text-sm text-good sm:col-span-2">✓ {rights[i]}</div>}
            </div>
          );
        })}
      </div>
    );
  }

  // mcq / tf / multi
  const multi = q.type === "multi";
  return (
    <div className="space-y-2" role={multi ? "group" : "radiogroup"}>
      {multi && <div className="text-sm muted">Select all that apply.</div>}
      {q.options.map((opt, i) => {
        const chosen = arr.includes(i);
        const isCorrect = q.correct.includes(i);
        let cls = "border-line hover:border-accent";
        if (!revealed && chosen) cls = "border-accent bg-accent-soft";
        if (revealed && isCorrect) cls = "border-good bg-good-soft";
        if (revealed && chosen && !isCorrect) cls = "border-bad bg-bad-soft";
        return (
          <div key={i}>
            <button
              type="button"
              role={multi ? "checkbox" : "radio"}
              aria-checked={chosen}
              disabled={locked}
              onClick={() => onChange(multi ? (chosen ? arr.filter((x) => x !== i) : [...arr, i]) : [i])}
              className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors disabled:cursor-default ${cls}`}
            >
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center ${multi ? "rounded-md" : "rounded-full"} border text-xs font-bold ${
                  chosen ? "border-accent bg-accent text-[var(--accent-text)]" : "border-line"
                }`}
              >
                {LETTERS[i]}
              </span>
              <span className="flex-1">{opt}</span>
              {revealed && isCorrect && <Check className="h-5 w-5 text-good" />}
              {revealed && chosen && !isCorrect && <X className="h-5 w-5 text-bad" />}
            </button>
            {revealed && !isCorrect && q.whyWrong[i] && (chosen || q.type !== "tf") && (
              <p className="ml-9 mt-1 text-sm muted">{q.whyWrong[i]}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
