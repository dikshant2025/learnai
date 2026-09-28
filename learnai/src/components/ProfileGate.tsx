"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Loader2, LogOut, UserRound } from "lucide-react";
import { setState, useHydrated, useStore } from "@/lib/store";
import { cloudEnabled, signOut } from "@/lib/cloud";
import { Chips } from "@/components/ui";
import {
  DETAIL_OPTIONS,
  EDUCATION_LEVELS,
  MIN_AGE,
  STYLE_OPTIONS,
  ageFrom,
  profileComplete,
  profileProblems,
} from "@/lib/profile";
import type { Profile } from "@/lib/types";

/**
 * Everyone must finish their profile (incl. date of birth) before using the app.
 * People under MIN_AGE are blocked.
 */
export default function ProfileGate({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  const profile = useStore((s) => s.profile);
  if (!hydrated) return null;
  if (profile.ageBlocked) return <TooYoung />;
  if (!profileComplete(profile)) return <SetupProfile initial={profile} />;
  return <>{children}</>;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg px-4 py-10">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-lg font-bold text-[var(--accent-text)]">L</div>
          <span className="text-2xl font-bold tracking-tight">LearnAI</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function SignOutLink() {
  const [busy, setBusy] = useState(false);
  if (!cloudEnabled) return null;
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm mx-auto mt-4 flex"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await signOut();
      }}
    >
      <LogOut className="h-4 w-4" /> {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label} <span className="text-bad" aria-hidden>*</span>
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs muted">{hint}</p>}
      {error && (
        <p className="mt-1 text-sm text-bad" id={`${id}-err`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function SetupProfile({ initial }: { initial: Profile }) {
  const [p, setP] = useState<Profile>({ ...initial, style: initial.style || "simple", detail: initial.detail || "balanced" });
  const [confirmed, setConfirmed] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  const problems = profileProblems(p);
  const errors = tried ? problems : {};
  const confirmError = tried && !confirmed ? "Please confirm your details are correct." : "";
  const update = (patch: Partial<Profile>) => setP((x) => ({ ...x, ...patch }));

  function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (Object.keys(problems).length || !confirmed) {
      const first = document.querySelector<HTMLElement>("[aria-invalid=true]");
      first?.focus();
      return;
    }
    setBusy(true);
    const age = ageFrom(p.birthDate) ?? 0;
    const clean: Profile = {
      ...p,
      name: p.name.trim().replace(/\s+/g, " "),
      major: p.major.trim(),
      goals: p.goals.trim(),
      ageBlocked: age < MIN_AGE ? true : undefined,
    };
    setState((s) => {
      s.profile = clean;
    });
  }

  const inv = (k: keyof Profile) => (errors[k] ? { "aria-invalid": true, "aria-describedby": `${k}-err` } : {});

  return (
    <Shell>
      <form className="card p-6" onSubmit={submit} noValidate>
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <UserRound className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Set up your profile</h1>
            <p className="text-sm muted">Required before you start. LearnAI uses this to teach at the right level for you.</p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <Field id="name" label="Full name" error={errors.name}>
            <input id="name" className="input" autoComplete="name" value={p.name} onChange={(e) => update({ name: e.target.value })} {...inv("name")} />
          </Field>

          <Field id="birthDate" label="Date of birth" error={errors.birthDate} hint={`You must be at least ${MIN_AGE} years old to use LearnAI.`}>
            <input
              id="birthDate"
              className="input"
              type="date"
              autoComplete="bday"
              min="1900-01-01"
              max={todayISO()}
              value={p.birthDate}
              onChange={(e) => update({ birthDate: e.target.value })}
              {...inv("birthDate")}
            />
          </Field>

          <Field id="educationLevel" label="Education level" error={errors.educationLevel}>
            <select
              id="educationLevel"
              className="input"
              value={p.educationLevel}
              onChange={(e) => update({ educationLevel: e.target.value })}
              {...inv("educationLevel")}
            >
              <option value="">Choose one…</option>
              {EDUCATION_LEVELS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>

          <Field id="major" label="Subject / field of study" error={errors.major}>
            <input id="major" className="input" placeholder="e.g. Biology" value={p.major} onChange={(e) => update({ major: e.target.value })} {...inv("major")} />
          </Field>

          <Field id="goals" label="Learning goal" error={errors.goals}>
            <input
              id="goals"
              className="input"
              placeholder="e.g. Pass my biology final with an A"
              value={p.goals}
              onChange={(e) => update({ goals: e.target.value })}
              {...inv("goals")}
            />
          </Field>

          <Field id="style" label="How should the AI teach you?" error={errors.style}>
            <Chips options={STYLE_OPTIONS} value={p.style} onChange={(v: Profile["style"]) => update({ style: v })} />
          </Field>

          <div>
            <span className="label">Explanation length</span>
            <Chips options={DETAIL_OPTIONS} value={p.detail} onChange={(v: Profile["detail"]) => update({ detail: v })} />
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            <span>I confirm that these details, including my date of birth, are true.</span>
          </label>
          {confirmError && <p className="-mt-2 text-sm text-bad" role="alert">{confirmError}</p>}
        </div>

        <button className="btn btn-primary mt-6 w-full" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Continue
        </button>
        <p className="mt-3 text-center text-xs muted">You can change these later in Profile &amp; Settings.</p>
      </form>
      <SignOutLink />
    </Shell>
  );
}

function TooYoung() {
  return (
    <Shell>
      <div className="card p-6 text-center">
        <h1 className="text-xl font-bold tracking-tight">Sorry, LearnAI is for adults only</h1>
        <p className="mt-2 muted">
          You must be {MIN_AGE} or older to use LearnAI. Based on the date of birth you entered, this account can&apos;t be used.
        </p>
      </div>
      <SignOutLink />
    </Shell>
  );
}
