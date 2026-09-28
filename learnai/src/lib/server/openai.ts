import "server-only";

/**
 * Thin wrapper around the OpenAI Responses API using fetch (no SDK needed).
 * The API key is only ever read on the server.
 */

const API = `${(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "")}/responses`;

export function aiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function model() {
  return process.env.OPENAI_MODEL || "gpt-5-mini";
}

export type InputMessage = { role: "user" | "assistant"; content: string };

type BaseOpts = {
  instructions: string;
  input: InputMessage[] | string;
  webSearch?: boolean;
  maxOutputTokens?: number;
};

function body(opts: BaseOpts, extra: Record<string, unknown> = {}) {
  const b: Record<string, unknown> = {
    model: model(),
    instructions: opts.instructions,
    input: opts.input,
    max_output_tokens: opts.maxOutputTokens ?? 6000,
    store: false,
    ...extra,
  };
  if (opts.webSearch) b.tools = [{ type: "web_search" }];
  if (/^(gpt-5|o\d)/.test(model())) b.reasoning = { effort: "low" };
  return b;
}

async function post(payload: Record<string, unknown>) {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = text;
    try {
      msg = JSON.parse(text)?.error?.message ?? text;
    } catch {}
    throw new AIError(`OpenAI error (${res.status}): ${msg.slice(0, 300)}`, res.status);
  }
  return res;
}

export class AIError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

type Citation = { url: string; title?: string };

function collectText(json: any): { text: string; citations: Citation[] } {
  let text = "";
  const citations: Citation[] = [];
  for (const item of json?.output ?? []) {
    if (item.type !== "message") continue;
    for (const c of item.content ?? []) {
      if (c.type === "output_text") {
        text += c.text;
        for (const a of c.annotations ?? []) {
          if (a.type === "url_citation" && a.url) citations.push({ url: a.url, title: a.title });
        }
      }
    }
  }
  return { text, citations };
}

/** Non-streaming call that must return JSON. */
export async function generateJSON<T = unknown>(opts: BaseOpts): Promise<T> {
  const res = await post(body(opts, { text: { format: { type: "json_object" } } }));
  const json = await res.json();
  const { text } = collectText(json);
  try {
    return JSON.parse(text) as T;
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as T;
    throw new AIError("The AI returned malformed JSON. Please try again.", 502);
  }
}

export const SOURCES_MARKER = "\n\n<<<SOURCES>>>";

/**
 * Streaming call. Returns a ReadableStream of plain text.
 * If web search produced citations, they're appended after SOURCES_MARKER as JSON.
 */
export async function streamText(opts: BaseOpts): Promise<ReadableStream<Uint8Array>> {
  const res = await post(body(opts, { stream: true }));
  const reader = res.body!.getReader();
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let buf = "";
      const citations: Citation[] = [];
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf("\n\n")) !== -1) {
            const chunk = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const dataLine = chunk
              .split("\n")
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5).trim())
              .join("");
            if (!dataLine || dataLine === "[DONE]") continue;
            let evt: any;
            try {
              evt = JSON.parse(dataLine);
            } catch {
              continue;
            }
            if (evt.type === "response.output_text.delta" && evt.delta) {
              controller.enqueue(enc.encode(evt.delta));
            } else if (evt.type === "response.output_text.annotation.added") {
              const a = evt.annotation;
              if (a?.type === "url_citation" && a.url) citations.push({ url: a.url, title: a.title });
            } else if (evt.type === "response.completed") {
              const extra = collectText(evt.response).citations;
              for (const c of extra) if (!citations.find((x) => x.url === c.url)) citations.push(c);
            } else if (evt.type === "error" || evt.type === "response.failed") {
              const msg = evt.message || evt.response?.error?.message || "AI request failed";
              controller.enqueue(enc.encode(`\n\n_Error: ${msg}_`));
            }
          }
        }
        if (citations.length) {
          const seen = new Set<string>();
          const uniq = citations.filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)));
          controller.enqueue(enc.encode(SOURCES_MARKER + JSON.stringify(uniq)));
        }
      } catch (e) {
        controller.enqueue(enc.encode(`\n\n_Stream interrupted: ${(e as Error).message}_`));
      } finally {
        controller.close();
      }
    },
  });
}
