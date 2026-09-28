import "server-only";
import { aiConfigured, AIError } from "./openai";

/**
 * Best-effort per-IP rate limit. On serverless this is per-instance, which is
 * still enough to stop accidental loops and casual abuse. For stronger limits
 * use Vercel Firewall or Upstash.
 */
const hits = new Map<string, number[]>();
const LIMIT = Number(process.env.RATE_LIMIT_PER_MINUTE || 20);

export function clientIp(req: Request) {
  return (
    req.headers.get("x-learnai-user") || // set by src/proxy.ts for signed-in users
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local"
  );
}

export function checkRate(req: Request) {
  const ip = clientIp(req);
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= LIMIT) {
    throw new AIError("You're sending requests too quickly. Please wait a minute and try again.", 429);
  }
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
}

export function requireAI() {
  if (!aiConfigured()) {
    throw new AIError(
      "AI is not configured yet. The site owner needs to add OPENAI_API_KEY in the hosting environment variables.",
      503,
    );
  }
}

export function clip(s: unknown, max: number): string {
  if (typeof s !== "string") return "";
  return s.length > max ? s.slice(0, max) : s;
}

export function errorResponse(e: unknown) {
  const status = e instanceof AIError ? e.status : 500;
  const message = e instanceof Error ? e.message : "Unexpected error";
  return Response.json({ error: message }, { status });
}
