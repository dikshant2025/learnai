"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, Loader2, LogOut, Mail } from "lucide-react";
import {
  cloudEnabled,
  currentUser,
  getSyncStatus,
  onAuthChange,
  onSyncStatus,
  sendCode,
  signOut,
  startSync,
  verifyCode,
} from "@/lib/cloud";

/**
 * Requires sign-in (when Supabase is configured) before showing the app.
 * Sign-in is passwordless: enter email → receive a code → type the code.
 */

const noop = () => () => {};

export default function AuthGate({ children }: { children: ReactNode }) {
  const isClient = useSyncExternalStore(noop, () => true, () => false);
  const user = useSyncExternalStore(onAuthChange, currentUser, () => null);
  const [ready, setReady] = useState<string | null>(null); // id of the user whose data is loaded
  const [error, setError] = useState("");

  useEffect(() => {
    if (!cloudEnabled || !user || ready === user.id) return;
    let cancelled = false;
    startSync(user)
      .then(() => !cancelled && setReady(user.id))
      .catch((e: Error) => !cancelled && setError(e.message || "Could not load your account."));
    return () => {
      cancelled = true;
    };
  }, [user, ready]);

  if (!cloudEnabled) return <>{children}</>; // accounts not set up yet → guest mode
  if (!isClient) return <Splash />;
  if (!user) return <SignIn />;
  if (error) return <LoadError message={error} onRetry={() => { setError(""); setReady(null); }} />;
  if (ready !== user.id) return <Splash label="Loading your study space…" />;
  return <>{children}</>;
}

function Brand() {
  return (
    <div className="mb-6 flex items-center justify-center gap-2">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-lg font-bold text-[var(--accent-text)]">L</div>
      <span className="text-2xl font-bold tracking-tight">LearnAI</span>
    </div>
  );
}

function Splash({ label = "" }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <div className="flex items-center gap-2 muted">
        <Loader2 className="h-5 w-5 animate-spin" /> {label}
      </div>
    </div>
  );
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <div className="card w-full max-w-sm p-6 text-center">
        <p className="font-semibold">Couldn&apos;t load your account</p>
        <p className="mt-1 text-sm muted">{message}</p>
        <button className="btn btn-primary mt-4" onClick={onRetry}>Try again</button>
      </div>
    </div>
  );
}

function SignIn() {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  async function requestCode(e?: FormEvent) {
    e?.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Please enter a valid email address.");
    setBusy(true);
    setError("");
    try {
      await sendCode(email);
      setStep("code");
      setCode("");
      setCooldown(60);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    if (code.trim().length < 6) return setError("Enter the code from the email.");
    setBusy(true);
    setError("");
    try {
      await verifyCode(email, code); // AuthGate re-renders once the session is saved
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-bg p-4">
      <div className="w-full max-w-sm">
        <Brand />
        <div className="card p-6">
          {step === "email" ? (
            <form onSubmit={requestCode} noValidate>
              <h1 className="text-xl font-bold tracking-tight">Sign in</h1>
              <p className="mt-1 text-sm muted">
                Enter your email and we&apos;ll send you a sign-in code. No password needed. New here? This creates your account.
              </p>
              <label className="label mt-5 block" htmlFor="email">Email</label>
              <input
                id="email"
                className="input"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
              {error && <p className="mt-2 text-sm text-bad" role="alert">{error}</p>}
              <button className="btn btn-primary mt-4 w-full" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Send me a code
              </button>
            </form>
          ) : (
            <form onSubmit={submitCode} noValidate>
              <button type="button" className="btn btn-ghost btn-sm -ml-2 mb-2" onClick={() => { setStep("email"); setError(""); }}>
                <ArrowLeft className="h-4 w-4" /> Change email
              </button>
              <h1 className="text-xl font-bold tracking-tight">Check your email</h1>
              <p className="mt-1 text-sm muted">
                We sent a code to <b className="text-ink">{email.trim()}</b>. It can take a minute — check your spam folder too.
              </p>
              <label className="label mt-5 block" htmlFor="code">Code</label>
              <input
                id="code"
                ref={codeRef}
                className="input text-center text-2xl tracking-[0.4em] tabular-nums"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="••••••"
                maxLength={10}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
              {error && <p className="mt-2 text-sm text-bad" role="alert">{error}</p>}
              <button className="btn btn-primary mt-4 w-full" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Sign in
              </button>
              <button
                type="button"
                className="btn btn-ghost mt-2 w-full"
                disabled={busy || cooldown > 0}
                onClick={() => requestCode()}
              >
                {cooldown > 0 ? `Send a new code in ${cooldown}s` : "Send a new code"}
              </button>
            </form>
          )}
        </div>
        <p className="mt-4 text-center text-xs muted">
          Your notes, progress and documents are saved to your account so they&apos;re on every device you sign in on.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Account box for the sidebar: who's signed in, sync status, sign out */
/* ------------------------------------------------------------------ */

export function AccountBox() {
  const user = useSyncExternalStore(onAuthChange, currentUser, () => null);
  const status = useSyncExternalStore(onSyncStatus, getSyncStatus, () => "idle" as const);
  const [busy, setBusy] = useState(false);
  if (!cloudEnabled || !user) return null;
  const label =
    status === "syncing" ? "Saving…" : status === "offline" ? "Offline — will save when back online" : "Saved to your account";
  return (
    <div className="mb-2 rounded-lg px-3 py-2 text-sm">
      <div className="truncate font-medium" title={user.email}>{user.email}</div>
      <div className={`text-xs ${status === "offline" ? "text-warn" : "muted"}`}>{label}</div>
      <button
        className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline disabled:opacity-60"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await signOut();
          setBusy(false);
        }}
      >
        <LogOut className="h-3.5 w-3.5" /> {busy ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
