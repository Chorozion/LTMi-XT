// Stage 2 — Topologization: assign breadcrumb path + lattice coord.
// Batched LLM calls so we pay one round-trip per ~30 loci instead of one per
// locus.

import type { Breadcrumb, ChatRequest, Provider } from "./types.js";
import { latticeCoord } from "./format/lattice.js";
import type { CrystallizedLocus } from "./crystallizer.js";

// Mercury 2 is a reasoning model — large batches (30 loci) blow the token
// budget. 8 loci per batch comfortably fits within reasoning + completion
// for the typical statement length.
const BATCH_SIZE_DEFAULT = 8;

export interface TopologizerOptions {
  provider: Provider;
  systemPrompt: string;
  batchSize?: number;
  /** Optional vocabulary of existing topics/subtopics/concepts the model
   *  should reuse instead of inventing new ones. */
  knownVocabulary?: { topics?: string[]; subtopics?: string[]; concepts?: string[] };
}

export interface TopologizedLocus extends CrystallizedLocus {
  tempId: string;
  breadcrumb: Breadcrumb;
  lattice: readonly [number, number, number];
}

interface RawAssignment {
  id?: unknown;
  breadcrumb?: unknown;
}

function tryParseJson(text: string): unknown | null {
  try { return JSON.parse(text); } catch {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try { return JSON.parse(fenced[1]); } catch {}
  }
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escaped) { escaped = false; continue; }
    if (c === "\\") { escaped = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === "{") depth++;
    if (c === "}") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  // Truncated output. Try to recover a partial assignments array.
  const am = text.match(/"assignments"\s*:\s*\[([\s\S]*)/);
  if (!am) return null;
  // Walk array items, balanced-brace, until we hit incomplete one.
  const items: unknown[] = [];
  let body = am[1];
  let i = 0;
  while (i < body.length) {
    while (i < body.length && /[\s,]/.test(body[i])) i++;
    if (body[i] !== "{") break;
    const itemStart = i;
    let d = 0;
    let iss = false;
    let esc = false;
    let j = i;
    for (; j < body.length; j++) {
      const cc = body[j];
      if (esc) { esc = false; continue; }
      if (cc === "\\") { esc = true; continue; }
      if (cc === '"') { iss = !iss; continue; }
      if (iss) continue;
      if (cc === "{") d++;
      if (cc === "}") {
        d--;
        if (d === 0) {
          try { items.push(JSON.parse(body.slice(itemStart, j + 1))); } catch {}
          j++;
          break;
        }
      }
    }
    if (d !== 0) break; // truncated mid-item
    i = j;
  }
  return items.length > 0 ? { assignments: items } : null;
}

function coerceBreadcrumb(raw: unknown): Breadcrumb | null {
  if (!Array.isArray(raw)) return null;
  const cleaned: (string | null)[] = [];
  for (let i = 0; i < 4; i++) {
    const v = raw[i];
    if (typeof v === "string" && v.trim().length > 0) {
      cleaned.push(v.trim());
    } else {
      cleaned.push(null);
    }
  }
  // Must start with a real topic.
  if (cleaned[0] == null) return null;
  return cleaned as Breadcrumb;
}

function buildVocabHint(opts: TopologizerOptions): string {
  const v = opts.knownVocabulary;
  if (!v) return "";
  const lines: string[] = [];
  if (v.topics?.length) lines.push("Existing topics: " + v.topics.join(", "));
  if (v.subtopics?.length) lines.push("Existing subtopics: " + v.subtopics.join(", "));
  if (v.concepts?.length) lines.push("Existing concepts: " + v.concepts.join(", "));
  if (lines.length === 0) return "";
  return "When possible, REUSE these existing levels rather than inventing new ones:\n" + lines.join("\n") + "\n\n";
}

export async function topologize(
  loci: CrystallizedLocus[],
  opts: TopologizerOptions,
): Promise<TopologizedLocus[]> {
  if (loci.length === 0) return [];
  const batchSize = opts.batchSize ?? BATCH_SIZE_DEFAULT;
  const vocabHint = buildVocabHint(opts);
  const result: TopologizedLocus[] = [];

  for (let i = 0; i < loci.length; i += batchSize) {
    const batch = loci.slice(i, i + batchSize);
    const ids = batch.map((_, j) => `t-${i + j}`);
    const userPayload = batch.map((l, j) => ({
      id: ids[j],
      statement: l.statement,
      kind: l.kind,
    }));

    const req: ChatRequest = {
      system: opts.systemPrompt,
      user: JSON.stringify(
        {
          instruction:
            "Assign a four-level breadcrumb path to each statement in the list. The four levels are topic, subtopic, concept, claim. Reuse existing topic, subtopic, and concept names from knownVocabulary when relevant. Return only valid JSON matching the requiredJsonSchema.",
          requiredJsonSchema: {
            assignments: [
              { id: "string", breadcrumb: "array of exactly four strings (topic, subtopic, concept, claim) where the topic must be a string and trailing levels may be null" },
            ],
          },
          knownVocabulary: opts.knownVocabulary ?? null,
          statements: userPayload,
        },
        null,
        2,
      ),
      jsonMode: false,
      maxTokens: 2048,
      temperature: 0.0,
    };
    let parsed: { assignments?: RawAssignment[] } | null = null;
    try {
      const res = await opts.provider.chat(req);
      parsed = tryParseJson(res.text) as { assignments?: RawAssignment[] } | null;
    } catch {
      parsed = null;
    }
    const assignments = parsed && Array.isArray(parsed.assignments) ? parsed.assignments : [];
    const map = new Map<string, Breadcrumb>();
    for (const a of assignments) {
      if (typeof a.id !== "string") continue;
      const bc = coerceBreadcrumb(a.breadcrumb);
      if (bc) map.set(a.id, bc);
    }

    for (let j = 0; j < batch.length; j++) {
      const tempId = ids[j];
      const breadcrumb = map.get(tempId);
      if (!breadcrumb) continue; // skip loci the topologizer failed on
      result.push({
        ...batch[j],
        tempId,
        breadcrumb,
        lattice: latticeCoord(breadcrumb),
      });
    }
  }

  return result;
}

export const _internals = { tryParseJson, coerceBreadcrumb, buildVocabHint };
