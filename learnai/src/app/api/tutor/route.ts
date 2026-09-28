import { streamText, type InputMessage } from "@/lib/server/openai";
import { tutorInstructions, type TutorParams } from "@/lib/server/prompts";
import { checkRate, clip, errorResponse, requireAI } from "@/lib/server/guard";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    requireAI();
    checkRate(req);
    const b = await req.json();
    const messages: InputMessage[] = (Array.isArray(b.messages) ? b.messages : [])
      .slice(-20)
      .filter((m: any) => m && (m.role === "user" || m.role === "assistant"))
      .map((m: any) => ({ role: m.role, content: clip(m.content, 8000) }));
    if (!messages.length || messages[messages.length - 1].role !== "user") {
      return Response.json({ error: "No question provided." }, { status: 400 });
    }
    const docContext = (Array.isArray(b.docContext) ? b.docContext : [])
      .slice(0, 8)
      .map((d: any) => ({ name: clip(d?.name, 120), text: clip(d?.text, 3000) }));
    const params: TutorParams = {
      mode: clip(b.mode, 20),
      style: clip(b.style, 20),
      socratic: Boolean(b.socratic),
      source: ["docs", "docs+web", "web", "general"].includes(b.source) ? b.source : "general",
      docContext,
      learner: clip(b.learner, 2500),
      profile: b.profile && typeof b.profile === "object" ? {
        name: clip(b.profile.name, 60),
        educationLevel: clip(b.profile.educationLevel, 60),
        major: clip(b.profile.major, 80),
        detail: clip(b.profile.detail, 20),
        style: clip(b.profile.style, 20),
      } : undefined,
      course: clip(b.course, 120),
    };
    const web = params.source === "web" || params.source === "docs+web";
    const stream = await streamText({ instructions: tutorInstructions(params), input: messages, webSearch: web });
    return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
