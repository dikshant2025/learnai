import { generateJSON } from "@/lib/server/openai";
import { quizPrompt } from "@/lib/server/prompts";
import { checkRate, clip, errorResponse, requireAI } from "@/lib/server/guard";

export const maxDuration = 60;

const TYPES = new Set(["mcq", "tf", "multi", "fill", "short", "order", "match"]);

function cleanQuestions(raw: any): any[] {
  const qs = Array.isArray(raw?.questions) ? raw.questions : [];
  return qs
    .map((q: any) => {
      const type = TYPES.has(q?.type) ? q.type : "mcq";
      let options: string[] = Array.isArray(q?.options) ? q.options.map((o: any) => String(o)) : [];
      let correct: number[] = Array.isArray(q?.correct)
        ? q.correct.map((n: any) => Number(n)).filter((n: number) => Number.isInteger(n) && n >= 0 && n < options.length)
        : [];
      if (type === "tf") {
        options = ["True", "False"];
        if (!correct.length) correct = [0];
      }
      if (type === "fill" || type === "short") options = [];
      return {
        type,
        question: String(q?.question ?? "").trim(),
        options,
        correct,
        answerText: String(q?.answerText ?? ""),
        explanation: String(q?.explanation ?? ""),
        whyWrong: Array.isArray(q?.whyWrong) ? q.whyWrong.map((s: any) => String(s ?? "")) : [],
        subtopic: String(q?.subtopic ?? "").trim() || "General",
        difficulty: String(q?.difficulty ?? "medium"),
      };
    })
    .filter((q: any) => {
      if (!q.question) return false;
      if (q.type === "mcq" || q.type === "tf") return q.options.length >= 2 && q.correct.length === 1;
      if (q.type === "multi") return q.options.length >= 3 && q.correct.length >= 1;
      if (q.type === "order") return q.options.length >= 3 && q.correct.length === q.options.length;
      if (q.type === "match") return q.options.length >= 3 && q.options.every((o: string) => o.includes("⇢"));
      return Boolean(q.answerText);
    });
}

export async function POST(req: Request) {
  try {
    requireAI();
    checkRate(req);
    const b = await req.json();
    const a = b.args ?? {};
    switch (b.kind) {
      case "quiz": {
        const count = Math.min(Math.max(Number(a.count) || 5, 1), 15);
        const p = quizPrompt({
          count,
          subject: clip(a.subject, 120),
          topic: clip(a.topic, 300),
          difficulty: clip(a.difficulty, 20) || "medium",
          types: Array.isArray(a.types) ? a.types.filter((t: string) => TYPES.has(t)) : ["mcq"],
          focus: clip(a.focus, 600),
          avoid: clip(a.avoid, 3000),
          context: clip(a.context, 20000),
        });
        const raw = await generateJSON(p);
        return Response.json({ questions: cleanQuestions(raw) });
      }
      case "flashcards": {
        const count = Math.min(Math.max(Number(a.count) || 10, 1), 40);
        const raw: any = await generateJSON({
          instructions:
            "You create high-quality flashcards for spaced repetition: one fact per card, concise front (question/prompt), precise back. Respond with JSON only.",
          input: `Create ${count} flashcards.
${a.topic ? `Topic: ${clip(a.topic, 300)}` : ""}
${a.context ? `From this material:\n${clip(a.context, 20000)}` : ""}
${a.mistakes ? `Target these concepts the student got WRONG (card should fix the misconception):\n${clip(a.mistakes, 6000)}` : ""}
Return JSON: {"cards":[{"front":"...","back":"...","topic":"sub-topic name"}]}`,
        });
        const cards = (Array.isArray(raw?.cards) ? raw.cards : [])
          .filter((c: any) => c?.front && c?.back)
          .map((c: any) => ({ front: String(c.front), back: String(c.back), topic: String(c.topic ?? "") }));
        return Response.json({ cards });
      }
      case "grade": {
        const raw: any = await generateJSON({
          instructions:
            "You are a fair grader. Accept answers that are correct in meaning even if worded differently or with minor spelling errors. Respond with JSON only.",
          input: `Question: ${clip(a.question, 2000)}
Model answer: ${clip(a.answerText, 2000)}
Student answer: ${clip(a.userAnswer, 2000)}
Return JSON: {"correct":true|false,"score":0-100,"feedback":"1-3 sentences: what was right/missing","misconception":"the specific misconception if wrong, else empty"}`,
          maxOutputTokens: 1500,
        });
        return Response.json({
          correct: Boolean(raw?.correct),
          score: Number(raw?.score) || 0,
          feedback: String(raw?.feedback ?? ""),
          misconception: String(raw?.misconception ?? ""),
        });
      }
      case "mistake": {
        const raw: any = await generateJSON({
          instructions:
            "You diagnose student misconceptions precisely and kindly, then write one new question that tests the same concept differently. Respond with JSON only.",
          input: `Question: ${clip(a.question, 2000)}
${a.options ? `Options: ${clip(a.options, 1500)}` : ""}
Correct answer: ${clip(a.correctAnswer, 1000)}
Student answered: ${clip(a.userAnswer, 1000)}
Return JSON: {"problem":"what the student is mixing up (1-2 sentences)","remember":"a compact markdown memory aid, e.g. a comparison or arrows","followUp":{"type":"mcq","question":"...","options":["...4"],"correct":[i],"answerText":"...","explanation":"...","whyWrong":["..."],"subtopic":"...","difficulty":"medium"}}`,
        });
        const fu = cleanQuestions({ questions: raw?.followUp ? [raw.followUp] : [] })[0] ?? null;
        return Response.json({ problem: String(raw?.problem ?? ""), remember: String(raw?.remember ?? ""), followUp: fu });
      }
      case "course": {
        const raw: any = await generateJSON({
          instructions: "You design clear, well-sequenced courses. Respond with JSON only.",
          input: `Design a course for: "${clip(a.goal, 500)}"${a.level ? ` (target level: ${clip(a.level, 60)})` : ""}.
6-10 modules from fundamentals to advanced, each with 3-6 lesson topics (short names).
Return JSON: {"name":"course name","description":"1 sentence","modules":[{"title":"...","lessons":["..."]}]}`,
        });
        const modules = (Array.isArray(raw?.modules) ? raw.modules : []).map((m: any) => ({
          title: String(m?.title ?? "Module"),
          lessons: (Array.isArray(m?.lessons) ? m.lessons : []).map((l: any) => String(l)),
        }));
        return Response.json({ name: String(raw?.name ?? a.goal), description: String(raw?.description ?? ""), modules });
      }
      default:
        return Response.json({ error: "Unknown kind" }, { status: 400 });
    }
  } catch (e) {
    return errorResponse(e);
  }
}
