// Stage 5 — Retrieval: lattice walk + scored ranking.
// Optionally calls the LLM once per query to derive a query-side breadcrumb;
// the caller can also pass a breadcrumb directly to skip the round-trip.

import type {
  Breadcrumb,
  ChatRequest,
  Locus,
  Provider,
} from "./types.js";
import { breadcrumbPrefixMatch, chebyshev, latticeCoord } from "./format/lattice.js";

export interface RetrieverOptions {
  /** Locus stream to retrieve from. */
  loci: Locus[];
  /** Optional provider for query → breadcrumb derivation. */
  provider?: Provider;
  /** System prompt for query → breadcrumb. Same shape as topologizer. */
  systemPrompt?: string;
  /** Max neighborhood radius (Chebyshev). Default 4. */
  radius?: number;
  /** Top-K to return. Default 8. */
  k?: number;
  /** Score weights — see paper §3.6 / §7. */
  weights?: { lattice: number; confidence: number; decay: number; prefix: number };
}

export interface RetrievalResult {
  query: string;
  queryBreadcrumb: Breadcrumb | null;
  queryCell: [number, number, number] | null;
  results: Array<{ locus: Locus; score: number; latticeDistance: number; prefixDepth: number }>;
}

const DEFAULT_WEIGHTS = { lattice: 0.4, confidence: 0.2, decay: 0.1, prefix: 0.3 };

async function deriveQueryBreadcrumb(
  query: string,
  opts: RetrieverOptions,
): Promise<Breadcrumb | null> {
  if (!opts.provider || !opts.systemPrompt) return null;
  const req: ChatRequest = {
    system: opts.systemPrompt,
    user: "Loci to assign:\n" + JSON.stringify([{ id: "q-0", statement: query, kind: "claim" }], null, 2),
    jsonMode: true,
    maxTokens: 256,
    temperature: 0.0,
  };
  try {
    const res = await opts.provider.chat(req);
    const parsed = JSON.parse(extractJson(res.text)) as { assignments?: Array<{ id: string; breadcrumb: unknown }> };
    const a = parsed.assignments?.[0];
    if (!a || !Array.isArray(a.breadcrumb)) return null;
    const out: (string | null)[] = [];
    for (let i = 0; i < 4; i++) {
      const v = (a.breadcrumb as unknown[])[i];
      out.push(typeof v === "string" && v.length > 0 ? v : null);
    }
    if (!out[0]) return null;
    return out as Breadcrumb;
  } catch {
    return null;
  }
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1];
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON in response.");
  return text.slice(start, end + 1);
}

export async function retrieve(query: string, opts: RetrieverOptions): Promise<RetrievalResult> {
  const radius = opts.radius ?? 4;
  const k = opts.k ?? 8;
  const w = opts.weights ?? DEFAULT_WEIGHTS;

  const queryBreadcrumb = await deriveQueryBreadcrumb(query, opts);
  const queryCell = queryBreadcrumb ? latticeCoord(queryBreadcrumb) : null;

  const scored = opts.loci.map((locus) => {
    const dLat = queryCell
      ? chebyshev(locus.lattice as [number, number, number], queryCell)
      : Infinity;
    const dPref = queryBreadcrumb
      ? breadcrumbPrefixMatch(locus.breadcrumb, queryBreadcrumb)
      : 0;
    const latNorm = queryCell ? Math.max(0, 1 - dLat / radius) : 0;
    const score =
      w.lattice * latNorm +
      w.confidence * locus.confidence +
      w.decay * locus.decay +
      w.prefix * (dPref / 4);
    return { locus, score, latticeDistance: dLat, prefixDepth: dPref };
  });

  // If no query breadcrumb, fall back to confidence × decay only.
  const filtered = queryCell
    ? scored.filter((s) => s.latticeDistance <= radius)
    : scored;

  filtered.sort((a, b) => b.score - a.score);
  const top = filtered.slice(0, k);

  return {
    query,
    queryBreadcrumb,
    queryCell: queryCell ? [queryCell[0], queryCell[1], queryCell[2]] : null,
    results: top,
  };
}

/** Mark loci as referenced after retrieval. Mutates the array in place. */
export function touch(
  loci: Locus[],
  ids: string[],
  consolidationThreshold = 3,
): void {
  const now = new Date().toISOString();
  const idSet = new Set(ids);
  for (const locus of loci) {
    if (!idSet.has(locus.id)) continue;
    locus.references = (locus.references ?? 0) + 1;
    locus.last_referenced = now;
    if (locus.horizon === "short" && locus.references >= consolidationThreshold) {
      locus.horizon = "long";
      locus.decay = 1.0;
    }
  }
}
