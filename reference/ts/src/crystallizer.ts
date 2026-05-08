// Stage 1 — Crystallization: messy prose → atomic loci.
// One LLM round-trip per ~2KB slab. Slabs overlap so pronouns can be resolved
// within a single call.

import type {
  ChatRequest,
  Locus,
  LocusKind,
  Provider,
} from "./types.js";

const SLAB_BYTES_DEFAULT = 2_000;
const SLAB_OVERLAP_DEFAULT = 240;

const VALID_KINDS = new Set<LocusKind>([
  "fact",
  "definition",
  "claim",
  "example",
  "instruction",
  "opinion",
  "uncertainty",
]);

export interface CrystallizerOptions {
  provider: Provider;
  systemPrompt: string;
  slabBytes?: number;
  slabOverlap?: number;
}

/**
 * Output of the crystallizer — a partial locus that has not yet been given a
 * breadcrumb, lattice coordinate, or chronological metadata. Source is
 * attached but the id is not yet derived.
 */
export interface CrystallizedLocus {
  statement: string;
  kind: LocusKind;
  confidence: number;
  source: { id: string; offset: [number, number] };
}

interface RawLocus {
  statement?: unknown;
  kind?: unknown;
  confidence?: unknown;
  source_offset?: unknown;
}

function splitSlabs(text: string, slabBytes: number, overlap: number): Array<{ slab: string; start: number }> {
  if (text.length <= slabBytes) return [{ slab: text, start: 0 }];
  const slabs: Array<{ slab: string; start: number }> = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(text.length, i + slabBytes);
    slabs.push({ slab: text.slice(i, end), start: i });
    if (end === text.length) break;
    i = end - overlap;
  }
  return slabs;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Try to recover a fenced JSON block.
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1]);
      } catch {}
    }
    // Try to recover the largest balanced JSON object.
    const start = text.indexOf("{");
    if (start === -1) throw new Error("No JSON object in crystallizer output.");
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
    throw new Error("Unbalanced JSON object in crystallizer output.");
  }
}

function coerceLocus(raw: RawLocus, slabStart: number): CrystallizedLocus | null {
  if (typeof raw.statement !== "string" || raw.statement.trim().length === 0) return null;
  const statement = raw.statement.trim();
  if (statement.length > 600) return null;

  let kind: LocusKind = "claim";
  if (typeof raw.kind === "string" && VALID_KINDS.has(raw.kind as LocusKind)) {
    kind = raw.kind as LocusKind;
  }

  let confidence = 0.7;
  if (typeof raw.confidence === "number" && raw.confidence >= 0 && raw.confidence <= 1) {
    confidence = raw.confidence;
  }

  let offset: [number, number] = [slabStart, slabStart + Math.min(120, statement.length)];
  if (Array.isArray(raw.source_offset) && raw.source_offset.length === 2) {
    const a = Number(raw.source_offset[0]);
    const b = Number(raw.source_offset[1]);
    if (Number.isFinite(a) && Number.isFinite(b) && a >= 0 && b >= a) {
      offset = [Math.floor(slabStart + a), Math.floor(slabStart + b)];
    }
  }

  return {
    statement,
    kind,
    confidence,
    source: { id: "", offset }, // source.id filled in by the indexer
  };
}

export async function crystallizeSlab(
  slab: string,
  slabStart: number,
  opts: CrystallizerOptions,
): Promise<CrystallizedLocus[]> {
  const req: ChatRequest = {
    system: opts.systemPrompt,
    user: slab,
    jsonMode: true,
    maxTokens: 2048,
    temperature: 0.1,
  };
  const res = await opts.provider.chat(req);
  const parsed = tryParseJson(res.text) as { loci?: RawLocus[] };
  const arr = Array.isArray(parsed?.loci) ? parsed.loci : [];
  const out: CrystallizedLocus[] = [];
  for (const raw of arr) {
    const c = coerceLocus(raw, slabStart);
    if (c) out.push(c);
  }
  return out;
}

export async function crystallize(
  text: string,
  opts: CrystallizerOptions,
): Promise<CrystallizedLocus[]> {
  const slabs = splitSlabs(
    text,
    opts.slabBytes ?? SLAB_BYTES_DEFAULT,
    opts.slabOverlap ?? SLAB_OVERLAP_DEFAULT,
  );
  const all: CrystallizedLocus[] = [];
  for (const { slab, start } of slabs) {
    const out = await crystallizeSlab(slab, start, opts);
    all.push(...out);
  }
  return dedupeByStatement(all);
}

function dedupeByStatement(loci: CrystallizedLocus[]): CrystallizedLocus[] {
  const seen = new Set<string>();
  const out: CrystallizedLocus[] = [];
  for (const l of loci) {
    const key = l.statement.replace(/\s+/g, " ").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }
  return out;
}

export const _internals = { splitSlabs, tryParseJson, coerceLocus, dedupeByStatement };
