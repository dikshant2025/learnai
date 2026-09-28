"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BookOpen,
  Brain,
  CircleHelp,
  CalendarDays,
  FlaskConical,
  GraduationCap,
  Home,
  Layers,
  LibraryBig,
  LineChart,
  Menu,
  MessageSquare,
  PenLine,
  Plus,
  Search,
  Settings,
  X,
} from "lucide-react";
import { useStore, useHydrated } from "@/lib/store";
import { streak, level } from "@/lib/learning";
import SearchDialog from "./SearchDialog";
import { PageTip, WelcomeTour } from "./Guide";
import { AccountBox } from "./AuthGate";

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/tutor", label: "AI Tutor", icon: MessageSquare },
  { href: "/learn", label: "Learn", icon: Brain },
  { href: "/practice", label: "Practice", icon: PenLine },
  { href: "/tests", label: "Tests", icon: FlaskConical },
  { href: "/flashcards", label: "Flashcards", icon: Layers },
  { href: "/courses", label: "Courses", icon: GraduationCap },
  { href: "/library", label: "Library", icon: LibraryBig },
  { href: "/research", label: "Research", icon: BookOpen },
  { href: "/plan", label: "Study Plan", icon: CalendarDays },
  { href: "/progress", label: "Progress", icon: LineChart },
  { href: "/guide", label: "How to use", icon: CircleHelp },
];

function useApplySettings() {
  const settings = useStore((s) => s.settings);
  const hydrated = useHydrated();
  useEffect(() => {
    if (!hydrated) return;
    const d = document.documentElement;
    const apply = () => {
      const t =
        settings.theme === "system"
          ? matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"
          : settings.theme;
      d.dataset.theme = t;
    };
    apply();
    d.classList.toggle("large-text", settings.largeText);
    d.classList.toggle("dyslexia", settings.dyslexia);
    d.classList.toggle(
      "reduce-motion",
      settings.reducedMotion || matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [settings, hydrated]);
}

function AIStatusBanner() {
  const [status, setStatus] = useState<{ configured: boolean } | null>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
  }, []);
  if (!status || status.configured || hidden) return null;
  return (
    <div className="flex items-start gap-3 border-b border-warn bg-warn-soft px-4 py-2.5 text-sm">
      <div className="flex-1">
        <b>AI is not connected yet.</b> Add <code>OPENAI_API_KEY</code> in your Vercel project → Settings → Environment
        Variables, then redeploy. Flashcards, notes and progress still work without it.
      </div>
      <button className="btn btn-ghost btn-sm" onClick={() => setHidden(true)} aria-label="Dismiss">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function Sidebar({ onNavigate, onSearch }: { onNavigate?: () => void; onSearch: () => void }) {
  const path = usePathname();
  const chats = useStore((s) => s.chats);
  const activity = useStore((s) => s.activity);
  const xp = useStore((s) => s.xp);
  const hydrated = useHydrated();
  const recent = useMemo(() => [...chats].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6), [chats]);
  const st = hydrated ? streak(activity) : 0;
  const lv = level(xp);

  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <nav className="flex h-full flex-col gap-1 overflow-y-auto p-3" aria-label="Main">
      <Link href="/" onClick={onNavigate} className="mb-2 flex items-center gap-2 px-2 py-1.5">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-sm font-bold text-[var(--accent-text)]">L</div>
        <span className="text-lg font-bold tracking-tight">LearnAI</span>
      </Link>
      <Link href="/tutor?new=1" onClick={onNavigate} className="btn btn-primary mb-1 w-full">
        <Plus className="h-4 w-4" /> New Chat
      </Link>
      <button onClick={onSearch} className="btn mb-2 w-full justify-start text-muted">
        <Search className="h-4 w-4" /> Search… <kbd className="ml-auto text-xs opacity-70">⌘K</kbd>
      </button>
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={onNavigate}
          aria-current={isActive(href) ? "page" : undefined}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[0.92rem] font-medium transition-colors ${
            isActive(href) ? "bg-accent-soft text-accent" : "hover:bg-surface-2"
          }`}
        >
          <Icon className="h-[18px] w-[18px]" /> {label}
        </Link>
      ))}

      {recent.length > 0 && (
        <>
          <div className="mt-4 mb-1 px-3 text-xs font-semibold uppercase tracking-wide muted">Recent chats</div>
          {recent.map((c) => (
            <Link
              key={c.id}
              href={`/tutor?chat=${c.id}`}
              onClick={onNavigate}
              className="truncate rounded-lg px-3 py-1.5 text-sm muted hover:bg-surface-2 hover:text-ink"
            >
              {c.title}
            </Link>
          ))}
        </>
      )}

      <div className="mt-auto pt-4">
        <AccountBox />
        <div className="card mb-2 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Level {lv.level}</span>
            <span className="muted">{st > 0 ? `🔥 ${st} day${st > 1 ? "s" : ""}` : "Start a streak"}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-accent" style={{ width: `${(lv.into / lv.need) * 100}%` }} />
          </div>
          <div className="mt-1 text-xs muted">
            {lv.into} / {lv.need} XP
          </div>
        </div>
        <Link
          href="/settings"
          onClick={onNavigate}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
            isActive("/settings") ? "bg-accent-soft text-accent" : "hover:bg-surface-2"
          }`}
        >
          <Settings className="h-[18px] w-[18px]" /> Profile & Settings
        </Link>
      </div>
    </nav>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  useApplySettings();
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-2">
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-line bg-surface lg:block">
        <Sidebar onSearch={() => setSearchOpen(true)} />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 border-r border-line bg-surface shadow-xl">
            <Sidebar
              onNavigate={() => setOpen(false)}
              onSearch={() => {
                setOpen(false);
                setSearchOpen(true);
              }}
            />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-surface/90 px-4 py-2.5 backdrop-blur lg:hidden">
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-bold">LearnAI</span>
          <button className="btn btn-ghost btn-sm ml-auto" onClick={() => setSearchOpen(true)} aria-label="Search">
            <Search className="h-5 w-5" />
          </button>
        </header>
        <AIStatusBanner />
        <main id="main" className="flex-1">
          <PageTip />
          {children}
        </main>
      </div>
      <WelcomeTour />
      {searchOpen && (
        <SearchDialog
          onClose={() => setSearchOpen(false)}
          onGo={(href) => {
            setSearchOpen(false);
            router.push(href);
          }}
        />
      )}
    </div>
  );
}
