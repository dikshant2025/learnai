export type Role = "user" | "assistant";
export type ChatMessage = { role: Role; content: string; sources?: { url: string; title?: string }[] };

export type ChatMode = "general" | "course" | "document" | "exam" | "research" | "homework";
export type SourceMode = "general" | "docs" | "docs+web" | "web";

export type Chat = {
  id: string;
  title: string;
  mode: ChatMode;
  style: string;
  socratic: boolean;
  source: SourceMode;
  courseId?: string;
  docIds?: string[];
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
};

export type Course = {
  id: string;
  name: string;
  description?: string;
  color: string;
  topics: string[];
  modules?: { title: string; lessons: string[] }[];
  createdAt: number;
};

export type DocMeta = {
  id: string;
  name: string;
  courseId?: string;
  size: number;
  chars: number;
  createdAt: number;
};

export type Card = {
  id: string;
  front: string;
  back: string;
  courseId?: string;
  topic: string;
  ease: number;
  interval: number; // days
  reps: number;
  lapses: number;
  due: number; // timestamp
  createdAt: number;
  lastReviewed?: number;
};

export type QType = "mcq" | "tf" | "multi" | "fill" | "short" | "order" | "match";

export type Question = {
  type: QType;
  question: string;
  options: string[];
  correct: number[];
  answerText: string;
  explanation: string;
  whyWrong: string[];
  subtopic: string;
  difficulty: string;
};

export type Confidence = "guess" | "unsure" | "pretty" | "very";

export type Attempt = {
  id: string;
  question: string;
  type: QType;
  userAnswer: string;
  correctAnswer: string;
  correct: boolean;
  courseId?: string;
  topic: string; // the practice topic (e.g. "Cell envelope")
  subtopic: string;
  difficulty: string;
  confidence?: Confidence;
  misconception?: string;
  source: "practice" | "test" | "recall";
  date: number;
};

export type TestResult = {
  id: string;
  title: string;
  courseId?: string;
  topic: string;
  score: number;
  total: number;
  seconds: number;
  bySubtopic: Record<string, { correct: number; total: number }>;
  date: number;
};

export type Exam = {
  id: string;
  name: string;
  date: string; // yyyy-mm-dd
  courseId?: string;
  topics: string;
  minutesPerDay: number;
  plan?: string;
  planCreatedAt?: number;
};

export type Profile = {
  name: string;
  educationLevel: string;
  major: string;
  detail: "short" | "balanced" | "detailed";
  style: "simple" | "academic" | "socratic" | "visual" | "examples";
  goals: string;
};

export type Settings = {
  theme: "system" | "light" | "dark";
  largeText: boolean;
  dyslexia: boolean;
  reducedMotion: boolean;
};

export type DayActivity = { questions: number; correct: number; cards: number; xp: number; minutes: number };

export type SavedItem = { id: string; title: string; content: string; kind: "lesson" | "research" | "summary" | "note"; courseId?: string; createdAt: number };

export type State = {
  version: 1;
  profile: Profile;
  settings: Settings;
  courses: Course[];
  chats: Chat[];
  docs: DocMeta[];
  cards: Card[];
  attempts: Attempt[];
  tests: TestResult[];
  exams: Exam[];
  saved: SavedItem[];
  activity: Record<string, DayActivity>; // key yyyy-mm-dd
  xp: number;
};
