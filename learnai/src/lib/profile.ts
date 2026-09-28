import type { Profile } from "./types";

/** Minimum age to use LearnAI (self-reported date of birth). */
export const MIN_AGE = 18;

export const EDUCATION_LEVELS = [
  "High school",
  "College (undergraduate)",
  "Graduate school",
  "Professional / self-learner",
];

export const STYLE_OPTIONS: { value: Profile["style"]; label: string }[] = [
  { value: "simple", label: "Simple" },
  { value: "academic", label: "Academic" },
  { value: "socratic", label: "Socratic" },
  { value: "visual", label: "Visual" },
  { value: "examples", label: "Example-heavy" },
];

export const DETAIL_OPTIONS: { value: Profile["detail"]; label: string }[] = [
  { value: "short", label: "Short" },
  { value: "balanced", label: "Balanced" },
  { value: "detailed", label: "Detailed" },
];

/** Whole years between a YYYY-MM-DD birth date and today, or null if invalid. */
export function ageFrom(birthDate?: string, today = new Date()): number | null {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const [y, m, d] = birthDate.split("-").map(Number);
  const born = new Date(y, m - 1, d);
  if (born.getFullYear() !== y || born.getMonth() !== m - 1 || born.getDate() !== d) return null; // e.g. Feb 30
  if (born > today) return null;
  let age = today.getFullYear() - y;
  if (today.getMonth() < m - 1 || (today.getMonth() === m - 1 && today.getDate() < d)) age--;
  return age > 120 ? null : age;
}

/** Human-readable problems with a profile; empty when it's complete. */
export function profileProblems(p: Profile): Partial<Record<keyof Profile, string>> {
  const e: Partial<Record<keyof Profile, string>> = {};
  const name = p.name.trim();
  if (name.length < 2 || !/\p{L}/u.test(name)) e.name = "Please enter your full name.";
  const age = ageFrom(p.birthDate);
  if (!p.birthDate) e.birthDate = "Please enter your date of birth.";
  else if (age === null) e.birthDate = "Please enter a real date of birth.";
  if (!p.educationLevel) e.educationLevel = "Please choose your education level.";
  if (p.major.trim().length < 2) e.major = "Please tell us what you're studying.";
  if (p.goals.trim().length < 3) e.goals = "Please add a learning goal.";
  if (!p.style) e.style = "Please pick a teaching style.";
  return e;
}

export function profileComplete(p: Profile) {
  return !p.ageBlocked && Object.keys(profileProblems(p)).length === 0 && (ageFrom(p.birthDate) ?? 0) >= MIN_AGE;
}
