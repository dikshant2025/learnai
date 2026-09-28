"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { getState, initialState, replaceState, setState, useHydrated, useStore } from "@/lib/store";
import { Chips, PageHeader } from "@/components/ui";
import type { Profile, Settings, State } from "@/lib/types";
import { MIN_AGE, ageFrom } from "@/lib/profile";

/** Date of birth can be corrected, but never to an age under the minimum. */
function BirthDateField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState("");
  return (
    <div>
      <label className="label" htmlFor="dob">Date of birth</label>
      <input
        id="dob"
        className="input"
        type="date"
        value={draft}
        onChange={(e) => {
          const v = e.target.value;
          setDraft(v);
          const age = ageFrom(v);
          if (age === null) return setError("Please enter a real date.");
          if (age < MIN_AGE) return setError(`You must be at least ${MIN_AGE}.`);
          setError("");
          onSave(v);
        }}
      />
      {error && <p className="mt-1 text-sm text-bad">{error}</p>}
    </div>
  );
}

export default function SettingsPage() {
  const hydrated = useHydrated();
  const profile = useStore((s) => s.profile);
  const settings = useStore((s) => s.settings);
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");

  if (!hydrated) return null;

  const setP = (patch: Partial<Profile>) => setState((s) => { s.profile = { ...s.profile, ...patch }; });
  const setS = (patch: Partial<Settings>) => setState((s) => { s.settings = { ...s.settings, ...patch }; });

  function exportData() {
    const blob = new Blob([JSON.stringify(getState(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `learnai-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importData(f: File) {
    try {
      const data = JSON.parse(await f.text()) as State;
      if (data.version !== 1 || !Array.isArray(data.cards)) throw new Error("Not a LearnAI backup file.");
      replaceState(data);
      setMsg("Backup restored. (Uploaded document text isn't included in backups — re-upload documents if needed.)");
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <PageHeader title="Profile & Settings" subtitle="LearnAI uses your profile to tailor every explanation." />

      <section className="card space-y-4 p-5">
        <h2 className="h2">Profile</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="n">Name</label>
            <input id="n" className="input" value={profile.name} onChange={(e) => setP({ name: e.target.value })} />
          </div>
          <BirthDateField value={profile.birthDate} onSave={(v) => setP({ birthDate: v })} />
          <div>
            <label className="label" htmlFor="el">Education level</label>
            <select id="el" className="input" value={profile.educationLevel} onChange={(e) => setP({ educationLevel: e.target.value })}>
              <option value="">Not set</option>
              {["Middle school", "High school", "College (undergraduate)", "Graduate school", "Professional / self-learner"].map((x) => <option key={x}>{x}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="mj">Major / field</label>
            <input id="mj" className="input" placeholder="e.g. Biology" value={profile.major} onChange={(e) => setP({ major: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="gl">Learning goals</label>
            <input id="gl" className="input" placeholder="e.g. Pass MCAT biology section" value={profile.goals} onChange={(e) => setP({ goals: e.target.value })} />
          </div>
        </div>
      </section>

      <section className="card mt-6 space-y-4 p-5">
        <h2 className="h2">AI behavior</h2>
        <div>
          <span className="label">Explanation detail</span>
          <Chips options={[{ value: "short", label: "Short" }, { value: "balanced", label: "Balanced" }, { value: "detailed", label: "Detailed" }]} value={profile.detail} onChange={(v: Profile["detail"]) => setP({ detail: v })} />
        </div>
        <div>
          <span className="label">Teaching style</span>
          <Chips
            options={[
              { value: "simple", label: "Simple" },
              { value: "academic", label: "Academic" },
              { value: "socratic", label: "Socratic" },
              { value: "visual", label: "Visual" },
              { value: "examples", label: "Example-heavy" },
            ]}
            value={profile.style}
            onChange={(v: Profile["style"]) => setP({ style: v })}
          />
        </div>
      </section>

      <section className="card mt-6 space-y-4 p-5">
        <h2 className="h2">Display & accessibility</h2>
        <div>
          <span className="label">Theme</span>
          <Chips options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} value={settings.theme} onChange={(v: Settings["theme"]) => setS({ theme: v })} />
        </div>
        {(
          [
            ["largeText", "Larger text"],
            ["dyslexia", "Dyslexia-friendly display (wider spacing, legible font)"],
            ["reducedMotion", "Reduce animation"],
          ] as const
        ).map(([k, l]) => (
          <label key={k} className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={settings[k]} onChange={(e) => setS({ [k]: e.target.checked })} /> {l}
          </label>
        ))}
      </section>

      <section className="card mt-6 space-y-3 p-5">
        <h2 className="h2">Your data</h2>
        <p className="text-sm muted">
          Everything is saved privately to your account and syncs to any device you sign in on. You can also export a backup file
          to keep your own copy.
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={exportData}><Download className="h-4 w-4" /> Export backup</button>
          <button className="btn" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Import backup</button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
          <button
            className="btn text-bad"
            onClick={() => {
              if (confirm("Erase all LearnAI data in this browser? This cannot be undone.")) {
                replaceState(initialState());
                setMsg("All data erased.");
              }
            }}
          >
            Erase all data
          </button>
        </div>
        {msg && <p className="text-sm">{msg}</p>}
      </section>
    </div>
  );
}
