import { NextResponse, type NextRequest } from "next/server";

/**
 * Only signed-in users may call the AI endpoints (protects the OpenAI credit).
 * The browser sends its Supabase access token; we ask Supabase who it belongs to.
 * If Supabase isn't configured yet, the site keeps working in guest mode.
 */

const URL_ = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const cache = new Map<string, { id: string; exp: number }>();

async function userIdFor(token: string): Promise<string | null> {
  const hit = cache.get(token);
  if (hit && hit.exp > Date.now()) return hit.id;
  const res = await fetch(`${URL_}/auth/v1/user`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const user = (await res.json()) as { id?: string };
  if (!user.id) return null;
  if (cache.size > 2000) cache.clear();
  cache.set(token, { id: user.id, exp: Date.now() + 5 * 60_000 });
  return user.id;
}

export async function proxy(req: NextRequest) {
  if (!URL_ || !ANON) return NextResponse.next();
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const id = token ? await userIdFor(token).catch(() => null) : null;
  if (!id) {
    return NextResponse.json({ error: "Please sign in to use the AI features." }, { status: 401 });
  }
  const headers = new Headers(req.headers);
  headers.set("x-learnai-user", id);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/api/tutor", "/api/task", "/api/generate"],
};
