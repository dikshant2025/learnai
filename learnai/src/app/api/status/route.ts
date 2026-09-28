import { aiConfigured, model } from "@/lib/server/openai";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ configured: aiConfigured(), model: model() });
}
