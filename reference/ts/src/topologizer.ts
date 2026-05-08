// Stage 2 — Topologization: assign breadcrumb path + lattice coord.
// Batched LLM calls so we pay one round-trip per ~30 loci instead of one per
// locus.

import type { Breadcrumb, ChatRequest, Provider } from "./types.js";
import { latticeCoord } from "./format/lattice.js";
import type { CrystallizedLocus } from "./crystallizer.js";

const BATCH_SIZE_DEFAULT = 30;

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

function tryParseJson(text: string): unknown {
  try { return JSON.parse(text); } catch {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try { return JSON.parse(fenced[1]); } catch {}
  }
  const start = text.indexOf("{");
  if (start === -1) throw new Error("No JSON in topologizer output.");
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
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error("Unbalanced JSON in topologizer output.");
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
      user: vocabHint + "Loci to assign:\n" + JSON.stringify(userPayload, null, 2),
      jsonMode: true,
      maxTokens: 2048,
      temperature: 0.0,
    };
    const res = await opts.provider.chat(req);
    const parsed = tryParseJson(res.text) as { assignments?: RawAssignment[] };
    const assignments = Array.isArray(parsed?.assignments) ? parsed.assignments : [];
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
