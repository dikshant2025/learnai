"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookmarkPlus, Layers, PenLine, RefreshCw, Send, Settings2, Square, Trash2 } from "lucide-react";
import { getState, logActivity, setState, uid, useHydrated, useStore } from "@/lib/store";
import { learnerSummary, newCard } from "@/lib/learning";
import { contextFor } from "@/lib/docs";
import { generate, streamPost } from "@/lib/api";
import type { Chat, ChatMessage, ChatMode, SourceMode } from "@/lib/types";
import { ErrorBox, Markdown, Thinking } from "@/components/ui";

const MODES: { value: ChatMode; label: string }[] = [
  { value: "general", label: "General Tutor" },
  { value: "course", label: "Course Tutor" },
  { value: "document", label: "Document Tutor" },
  { value: "exam", label: "Exam Prep" },
  { value: "research", label: "Research" },
  { value: "homework", label: "Homework Help" },
];

export const STYLES = [
  { value: "normal", label: "Normal" },
  { value: "simple", label: "Explain simply" },
  { value: "detailed", label: "Detailed" },
  { value: "steps", label: "Step-by-step" },
  { value: "eli10", label: "Like I'm 10" },
  { value: "example", label: "Real-life example" },
  { value: "analogy", label: "Analogy" },
  { value: "visual", label: "Visual" },
  { value: "exam", label: "Exam-focused" },
  { value: "memory", label: "Memory tricks" },
];

const SOURCES: { value: SourceMode; label: string }[] = [
  { value: "general", label: "General knowledge" },
  { value: "docs", label: "Only uploaded material" },
  { value: "docs+web", label: "Uploaded material + internet" },
  { value: "web", label: "Internet" },
];

const SUGGESTIONS = [
  "Explain cellular respiration.",
  "I still don't understand glycolysis.",
  "Explain photosynthesis like I'm 10.",
  "Draw a simple flowchart of DNA → protein.",
  "Compare Gram-positive and Gram-negative bacteria in a table.",
  "Give me a mnemonic for the planets.",
];

function newChat(partial: Partial<Chat> = {}): Chat {
  const s = getState();
  const style = s.profile.style === "socratic" ? "normal" : ({ simple: "simple", academic: "detailed", visual: "visual", examples: "example" } as Record<string, string>)[s.profile.style] ?? "normal";
  return {
    id: uid(),
    title: "New chat",
    mode: "general",
    style,
    socratic: s.profile.style === "socratic",
    source: "general",
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...partial,
  };
}

export default function TutorClient() {
  const params = useSearchParams();
  const router = useRouter();
  const hydrated = useHydrated();
  const courses = useStore((s) => s.courses);
  const docs = useStore((s) => s.docs);
  const profile = useStore((s) => s.profile);

  const [chat, setChat] = useState<Chat | null>(null);
  const [input, setInput] = useState("");
  const [streaming, setStreamingState] = useState<string | null>(null);
  const streamingRef = useRef<string | null>(null);
  const setStreaming = useCallback((v: string | null) => {
    streamingRef.current = v;
    setStreamingState(v);
  }, []);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [selection, setSelection] = useState("");
  const [notice, setNotice] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const autoSent = useRef(false);

  // Load / create chat from URL
  useEffect(() => {
    if (!hydrated) return;
    const id = params.get("chat");
    const existing = id ? getState().chats.find((c) => c.id === id) : null;
    if (existing) {
      setChat(existing);
      return;
    }
    const docId = params.get("doc");
    const courseId = params.get("course") ?? undefined;
    const partial: Partial<Chat> = {};
    if (docId) Object.assign(partial, { mode: "document", source: "docs", docIds: [docId] });
    if (courseId) Object.assign(partial, { mode: partial.mode ?? "course", courseId });
    const m = params.get("mode") as ChatMode | null;
    if (m) partial.mode = m;
    setChat(newChat(partial));
    autoSent.current = false;
  }, [hydrated, params]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat?.messages.length, streaming]);

  const persist = useCallback((c: Chat) => {
    setState((s) => {
      const i = s.chats.findIndex((x) => x.id === c.id);
      if (i >= 0) s.chats[i] = c;
      else s.chats.push(c);
      if (s.chats.length > 200) s.chats = s.chats.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 200);
    });
  }, []);

  const updateChat = (patch: Partial<Chat>) => {
    if (!chat) return;
    const next = { ...chat, ...patch };
    setChat(next);
    if (next.messages.length) persist(next);
  };

  const send = useCallback(
    async (text: string, base?: Chat) => {
      const c = base ?? chat;
      if (!c || !text.trim() || streaming !== null) return;
      setError("");
      const msgs: ChatMessage[] = [...c.messages, { role: "user", content: text.trim() }];
      const title = c.messages.length ? c.title : text.trim().slice(0, 60);
      let cur: Chat = { ...c, title, messages: msgs, updatedAt: Date.now() };
      setChat(cur);
      persist(cur);
      if (!params.get("chat")) router.replace(`/tutor?chat=${cur.id}`, { scroll: false });
      setInput("");
      setStreaming("");
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const s = getState();
        const selDocs = s.docs.filter((d) => cur.docIds?.includes(d.id) || (cur.courseId && d.courseId === cur.courseId && cur.source !== "general"));
        const useDocs = cur.source !== "general" && cur.source !== "web" ? selDocs : cur.mode === "document" ? selDocs : [];
        const docContext = useDocs.length ? await contextFor(useDocs, msgs.slice(-3).map((m) => m.content).join(" "), 6) : [];
        const course = s.courses.find((x) => x.id === cur.courseId);
        const { text: answer, sources } = await streamPost(
          "/api/tutor",
          {
            messages: msgs.map(({ role, content }) => ({ role, content })),
            mode: cur.mode,
            style: cur.style,
            socratic: cur.socratic,
            source: cur.source,
            docContext: docContext.map(({ name, text }) => ({ name, text })),
            learner: learnerSummary(s, cur.courseId),
            profile: s.profile,
            course: course ? `${course.name}${course.topics.length ? ` (topics: ${course.topics.slice(0, 20).join(", ")})` : ""}` : undefined,
          },
          (t) => setStreaming(t),
          ac.signal,
        );
        cur = { ...cur, messages: [...msgs, { role: "assistant", content: answer || "_(no response)_", sources }], updatedAt: Date.now() };
        setChat(cur);
        persist(cur);
        logActivity({ xp: 2, minutes: 1 });
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
        else {
          const partial = streamingRef.current;
          if (partial) {
            cur = { ...cur, messages: [...msgs, { role: "assistant", content: partial + "\n\n_(stopped)_" }] };
            setChat(cur);
            persist(cur);
          }
        }
      } finally {
        setStreaming(null);
        abortRef.current = null;
      }
    },
    [chat, streaming, persist, params, router, setStreaming],
  );


  // Auto-send ?q=
  useEffect(() => {
    const q = params.get("q");
    if (q && chat && !chat.messages.length && !autoSent.current) {
      autoSent.current = true;
      send(q, chat);
    }
  }, [chat, params, send]);

  const lastAssistant = useMemo(() => [...(chat?.messages ?? [])].reverse().find((m) => m.role === "assistant"), [chat]);

  const topic = chat?.title ?? "";

  async function makeCards() {
    if (!lastAssistant) return;
    setNotice("Creating flashcards…");
    try {
      const { cards } = await generate<{ cards: { front: string; back: string; topic: string }[] }>("flashcards", {
        count: 8,
        context: lastAssistant.content,
        topic,
      });
      setState((s) => {
        for (const c of cards) s.cards.push(newCard({ id: uid(), front: c.front, back: c.back, topic: c.topic || topic, courseId: chat?.courseId }));
      });
      setNotice(`Added ${cards.length} flashcards. `);
    } catch (e) {
      setNotice("");
      setError((e as Error).message);
    }
  }

  function saveToLibrary() {
    if (!lastAssistant) return;
    setState((s) => {
      s.saved.push({ id: uid(), title: topic, content: lastAssistant.content, kind: "note", courseId: chat?.courseId, createdAt: Date.now() });
    });
    setNotice("Saved to your Library. ");
  }

  function onMouseUp() {
    const sel = window.getSelection()?.toString().trim() ?? "";
    setSelection(sel.length > 3 && sel.length < 1500 ? sel : "");
  }

  if (!chat) return null;

  const linkedDocs = docs.filter((d) => chat.docIds?.includes(d.id));

  return (
    <div className="mx-auto flex h-[calc(100dvh-3.2rem)] max-w-4xl flex-col px-4 lg:h-dvh sm:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line py-3">
        <select
          className="input !w-auto !py-1.5 text-sm"
          value={chat.mode}
          onChange={(e) => updateChat({ mode: e.target.value as ChatMode })}
          aria-label="Chat mode"
        >
          {MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <select
          className="input !w-auto !py-1.5 text-sm"
          value={chat.style}
          onChange={(e) => updateChat({ style: e.target.value })}
          aria-label="Explanation style"
        >
          {STYLES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <label className="chip" aria-pressed={chat.socratic}>
          <input type="checkbox" className="sr-only" checked={chat.socratic} onChange={(e) => updateChat({ socratic: e.target.checked })} />
          🧩 Socratic
        </label>
        <button className="btn btn-sm ml-auto" onClick={() => setShowSettings((v) => !v)} aria-expanded={showSettings}>
          <Settings2 className="h-4 w-4" /> Sources{linkedDocs.length ? ` (${linkedDocs.length})` : ""}
        </button>
        <Link href="/tutor?new=1" className="btn btn-sm">
          New
        </Link>
      </div>

      {showSettings && (
        <div className="card mt-3 grid gap-4 p-4 sm:grid-cols-2">
          <div>
            <span className="label">Answer using</span>
            <div className="space-y-1.5">
              {SOURCES.map((s) => (
                <label key={s.value} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="src" checked={chat.source === s.value} onChange={() => updateChat({ source: s.value })} />
                  {s.label}
                </label>
              ))}
            </div>
            <label className="label mt-3" htmlFor="course">
              Course
            </label>
            <select id="course" className="input" value={chat.courseId ?? ""} onChange={(e) => updateChat({ courseId: e.target.value || undefined })}>
              <option value="">None</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="label">Documents for this chat</span>
            {docs.length === 0 ? (
              <p className="text-sm muted">
                No documents yet.{" "}
                <Link className="text-accent underline" href="/library">
                  Upload notes
                </Link>
              </p>
            ) : (
              <div className="max-h-44 space-y-1.5 overflow-y-auto">
                {docs.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={chat.docIds?.includes(d.id) ?? false}
                      onChange={(e) => {
                        const ids = new Set(chat.docIds ?? []);
                        if (e.target.checked) ids.add(d.id);
                        else ids.delete(d.id);
                        updateChat({ docIds: [...ids], source: ids.size && chat.source === "general" ? "docs" : chat.source });
                      }}
                    />
                    <span className="truncate">{d.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-6" onMouseUp={onMouseUp}>
        {chat.messages.length === 0 && streaming === null ? (
          <div className="mx-auto max-w-xl pt-8 text-center">
            <div className="text-4xl">🎓</div>
            <h1 className="mt-3 text-2xl font-bold">What do you want to understand?</h1>
            <p className="muted mt-1 text-sm">
              {profile.name ? `Hi ${profile.name}! ` : ""}I remember what you&apos;ve practiced, so I can focus on what you find hard.
            </p>
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="card p-3 text-left text-sm hover:border-accent" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {chat.messages.map((m, i) => (
              <Message key={i} m={m} />
            ))}
            {streaming !== null && (
              <div className="max-w-none">{streaming ? <Markdown>{streaming}</Markdown> : <Thinking />}</div>
            )}
          </div>
        )}

        {lastAssistant && streaming === null && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn btn-sm" onClick={() => send("I still don't understand. Explain it a different way.")}>
              <RefreshCw className="h-3.5 w-3.5" /> Explain differently
            </button>
            <button className="btn btn-sm" onClick={() => send("Make this easier.")}>Make it easier</button>
            <button className="btn btn-sm" onClick={() => send("Give me a real-life example.")}>Example</button>
            <button className="btn btn-sm" onClick={() => send("Draw a simple text diagram or flowchart of this.")}>Diagram</button>
            <button className="btn btn-sm" onClick={() => send("Quiz me on this — ask me one question at a time and wait for my answer.")}>
              Quiz me here
            </button>
            <Link
              className="btn btn-sm"
              href={`/practice?topic=${encodeURIComponent(topic)}${chat.courseId ? `&course=${chat.courseId}` : ""}`}
            >
              <PenLine className="h-3.5 w-3.5" /> Practice set
            </Link>
            <button className="btn btn-sm" onClick={makeCards}>
              <Layers className="h-3.5 w-3.5" /> Make flashcards
            </button>
            <button className="btn btn-sm" onClick={saveToLibrary}>
              <BookmarkPlus className="h-3.5 w-3.5" /> Save
            </button>
          </div>
        )}
        {notice && (
          <p className="mt-3 text-sm text-good" role="status">
            {notice}
          </p>
        )}
        <div className="mt-3">
          <ErrorBox>{error}</ErrorBox>
        </div>
        <div ref={bottomRef} />
      </div>

      {/* Selection toolbar */}
      {selection && streaming === null && (
        <div className="card mb-2 flex flex-wrap items-center gap-2 p-2 text-sm">
          <span className="max-w-[40ch] truncate muted">“{selection}”</span>
          {[
            ["Explain", "Explain this part"],
            ["Simplify", "Simplify this"],
            ["Example", "Give an example of this"],
            ["Quiz me", "Ask me a question to test this"],
          ].map(([l, p]) => (
            <button
              key={l}
              className="btn btn-sm"
              onClick={() => {
                send(`${p}: "${selection}"`);
                setSelection("");
              }}
            >
              {l}
            </button>
          ))}
          <button
            className="btn btn-sm"
            onClick={() => {
              setState((s) => {
                s.cards.push(newCard({ id: uid(), front: `Explain: ${selection.slice(0, 120)}`, back: selection, topic, courseId: chat.courseId }));
              });
              setNotice("Flashcard created. ");
              setSelection("");
            }}
          >
            + Flashcard
          </button>
        </div>
      )}

      {/* Composer */}
      <form
        className="border-t border-line py-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <div className="flex items-end gap-2">
          <textarea
            className="input max-h-48 min-h-[48px] resize-none"
            rows={1}
            placeholder={chat.socratic ? "Answer or ask… (Socratic mode: I'll guide you with questions)" : "Ask anything…"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            aria-label="Message"
          />
          {streaming !== null ? (
            <button type="button" className="btn" onClick={() => abortRef.current?.abort()} aria-label="Stop">
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <button className="btn btn-primary" disabled={!input.trim()} aria-label="Send">
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="mt-1.5 flex items-center justify-between text-xs muted">
          <span>
            {SOURCES.find((s) => s.value === chat.source)?.label}
            {linkedDocs.length ? ` · ${linkedDocs.map((d) => d.name).join(", ")}` : ""}
          </span>
          {chat.messages.length > 0 && (
            <button
              type="button"
              className="inline-flex items-center gap-1 hover:text-bad"
              onClick={() => {
                setState((s) => {
                  s.chats = s.chats.filter((c) => c.id !== chat.id);
                });
                router.push("/tutor?new=1");
              }}
            >
              <Trash2 className="h-3 w-3" /> Delete chat
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function Message({ m }: { m: ChatMessage }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent-soft px-4 py-2.5">{m.content}</div>
      </div>
    );
  }
  return (
    <div>
      <Markdown>{m.content}</Markdown>
      {m.sources && m.sources.length > 0 && (
        <div className="mt-3 rounded-xl bg-surface-2 p-3 text-sm">
          <div className="mb-1 font-semibold">Sources</div>
          <ol className="list-decimal space-y-0.5 pl-5">
            {m.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                  {s.title || new URL(s.url).hostname}
                </a>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
