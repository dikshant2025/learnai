"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import type { Course } from "@/lib/types";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-ai">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ a: (p) => <a {...p} target="_blank" rel="noopener noreferrer" /> }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="h1">{title}</h1>
        {subtitle && <p className="muted mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Bar({ value, color = "var(--accent)", height = 8 }: { value: number; color?: string; height?: number }) {
  return (
    <div
      className="w-full overflow-hidden rounded-full bg-surface-2"
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide muted">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs muted">{hint}</div>}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-10 text-center">
      {icon && <div className="text-3xl">{icon}</div>}
      <div className="font-semibold">{title}</div>
      {children && <div className="muted max-w-md text-sm">{children}</div>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 muted text-sm">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </span>
  );
}

export function Thinking() {
  return (
    <span className="inline-flex gap-1 py-2" aria-label="Thinking">
      <span className="dot h-2 w-2 rounded-full bg-muted" />
      <span className="dot h-2 w-2 rounded-full bg-muted" style={{ animationDelay: "0.2s" }} />
      <span className="dot h-2 w-2 rounded-full bg-muted" style={{ animationDelay: "0.4s" }} />
    </span>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div role="alert" className="rounded-xl border border-bad bg-bad-soft px-4 py-3 text-sm text-bad">
      {children}
    </div>
  );
}

export function CourseSelect({
  courses,
  value,
  onChange,
  allowNone = true,
  id,
}: {
  courses: Course[];
  value?: string;
  onChange: (v: string | undefined) => void;
  allowNone?: boolean;
  id?: string;
}) {
  return (
    <select id={id} className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
      {allowNone && <option value="">No course</option>}
      {courses.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
  multi,
}: {
  options: { value: T; label: string }[];
  value: T | T[];
  onChange: (v: any) => void;
  multi?: boolean;
}) {
  const sel = Array.isArray(value) ? value : [value];
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          className="chip"
          aria-pressed={sel.includes(o.value)}
          onClick={() => {
            if (!multi) return onChange(o.value);
            const next = sel.includes(o.value) ? sel.filter((v) => v !== o.value) : [...sel, o.value];
            onChange(next.length ? next : sel);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function timeAgo(t: number) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
