import { streamText } from "@/lib/server/openai";
import { TASKS } from "@/lib/server/prompts";
import { checkRate, clip, errorResponse, requireAI } from "@/lib/server/guard";

export const maxDuration = 60;

function sanitize(args: Record<string, unknown>) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(args ?? {})) {
    if (typeof v === "string") out[k] = clip(v, k === "text" || k === "context" ? 24000 : 3000);
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (k === "profile" && v && typeof v === "object") {
      const p = v as Record<string, unknown>;
      out[k] = {
        name: clip(p.name, 60),
        educationLevel: clip(p.educationLevel, 60),
        major: clip(p.major, 80),
        detail: clip(p.detail, 20),
        style: clip(p.style, 20),
        birthDate: clip(p.birthDate, 10),
      };
    }
  }
  return out;
}

export async function POST(req: Request) {
  try {
    requireAI();
    checkRate(req);
    const b = await req.json();
    const make = TASKS[b.task as string];
    if (!make) return Response.json({ error: "Unknown task" }, { status: 400 });
    const t = make(sanitize(b.args));
    const stream = await streamText({ instructions: t.instructions, input: t.input, webSearch: t.web, maxOutputTokens: 8000 });
    return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
