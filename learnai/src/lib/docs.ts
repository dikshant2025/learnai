"use client";

import { get, set, del } from "idb-keyval";

/** Document text lives in IndexedDB so large files don't blow the localStorage quota. */

export const MAX_FILE_MB = 20;
export const ACCEPT = ".pdf,.docx,.txt,.md,.markdown,.csv,.json,.html,.htm";

export async function saveDocText(id: string, text: string) {
  await set(`doc:${id}`, text);
}
export async function getDocText(id: string): Promise<string> {
  return ((await get(`doc:${id}`)) as string) ?? "";
}
export async function deleteDocText(id: string) {
  await del(`doc:${id}`);
}

export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`File is larger than ${MAX_FILE_MB} MB.`);
  if (name.endsWith(".pdf")) return extractPdf(file);
  if (name.endsWith(".docx")) return extractDocx(file);
  if (name.endsWith(".pptx")) throw new Error("PowerPoint isn't supported yet — export it as PDF first.");
  const text = await file.text();
  if (name.endsWith(".html") || name.endsWith(".htm")) {
    const doc = new DOMParser().parseFromString(text, "text/html");
    return doc.body.innerText;
  }
  return text;
}

async function extractPdf(file: File) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it: any) => ("str" in it ? it.str + (it.hasEOL ? "\n" : " ") : "")).join("");
    pages.push(`[Page ${i}]\n${text.trim()}`);
  }
  const all = pages.join("\n\n");
  if (all.replace(/\[Page \d+\]/g, "").trim().length < 20) {
    throw new Error("This PDF looks like scanned images — no selectable text was found.");
  }
  return all;
}

async function extractDocx(file: File) {
  // @ts-expect-error — browser build has no types
  const mammoth = (await import("mammoth/mammoth.browser.min.js")).default;
  const res = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return res.value as string;
}

/* ---------------- Chunking + keyword retrieval (BM25) ---------------- */

export function chunk(text: string, size = 1400, overlap = 200): string[] {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const paras = clean.split(/\n\n+/);
  const out: string[] = [];
  let cur = "";
  for (const p of paras) {
    if ((cur + "\n\n" + p).length > size && cur) {
      out.push(cur);
      cur = cur.slice(-overlap) + "\n\n" + p;
    } else {
      cur = cur ? cur + "\n\n" + p : p;
    }
    while (cur.length > size * 1.5) {
      out.push(cur.slice(0, size));
      cur = cur.slice(size - overlap);
    }
  }
  if (cur.trim()) out.push(cur);
  return out;
}

const STOP = new Set(
  "a an the and or of to in on for with is are was were be been by as at from that this these those it its into what which who how why when where do does did can could would should explain tell me about my i you your we our please".split(
    " ",
  ),
);

function tokens(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9À-ɏ\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => t.replace(/(ing|ed|es|s)$/, ""));
}

export function retrieve(chunks: string[], query: string, k = 5): { text: string; score: number; index: number }[] {
  const q = [...new Set(tokens(query))];
  if (!q.length) return chunks.slice(0, k).map((text, index) => ({ text, score: 0, index }));
  const docs = chunks.map(tokens);
  const avg = docs.reduce((a, d) => a + d.length, 0) / Math.max(1, docs.length);
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const N = docs.length;
  const scored = docs.map((d, index) => {
    const tf = new Map<string, number>();
    for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0;
    for (const t of q) {
      const f = tf.get(t) ?? 0;
      if (!f) continue;
      const idf = Math.log(1 + (N - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
      score += (idf * f * 2.2) / (f + 1.2 * (0.25 + 0.75 * (d.length / avg)));
    }
    return { text: chunks[index], score, index };
  });
  const hits = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  return (hits.length ? hits : scored.slice(0, 2)).slice(0, k);
}

/** Retrieve the best excerpts across several documents. */
export async function contextFor(docs: { id: string; name: string }[], query: string, k = 6) {
  const all: { name: string; text: string; score: number }[] = [];
  for (const d of docs) {
    const text = await getDocText(d.id);
    if (!text) continue;
    for (const h of retrieve(chunk(text), query, k)) all.push({ name: d.name, text: h.text, score: h.score });
  }
  return all.sort((a, b) => b.score - a.score).slice(0, k);
}

/** A representative sample of a document for summaries/quizzes (fits the token budget). */
export async function sampleText(id: string, max = 20000) {
  const text = await getDocText(id);
  if (text.length <= max) return text;
  const parts = chunk(text, 1400, 0);
  const step = parts.length / Math.floor(max / 1400);
  const picked: string[] = [];
  for (let i = 0; i < parts.length && picked.join("").length < max; i += step) picked.push(parts[Math.floor(i)]);
  return picked.join("\n\n…\n\n");
}
