// Stage 3 — Chronologization: horizon + decay + timestamps.
// Pure function. No LLM call.

import type { Horizon, Locus } from "./types.js";
import type { TopologizedLocus } from "./topologizer.js";
import { deriveLocusId } from "./format/ltmi.js";

export interface ChronoOptions {
  /** Source-level metadata. */
  source: {
    /** Source id (s-…). */
    id: string;
    /** Source timestamp, ISO-8601 UTC. Defaults to "now". */
    timestamp?: string;
    /** If true, all loci from this source initialize as long-horizon. */
    canonical?: boolean;
    /** If true, all loci from this source initialize as short-horizon. */
    transient?: boolean;
  };
  /** Now. Mostly for tests. */
  now?: () => Date;
  /** Days threshold below which a source is considered "recent" → short. */
  recentDays?: number;
}

const RECENT_DAYS_DEFAULT = 30;

function decayWeight(horizon: Horizon, deltaDays: number): number {
  if (horizon === "long") return 1.0;
  // Half-life 7 days.
  const lambda = Math.log(2) / 7;
  return Math.exp(-lambda * Math.max(0, deltaDays));
}

export function chronologize(
  loci: TopologizedLocus[],
  opts: ChronoOptions,
): Locus[] {
  const now = opts.now ? opts.now() : new Date();
  const sourceTs = opts.source.timestamp
    ? new Date(opts.source.timestamp)
    : now;
  const ageDays = Math.max(0, (now.getTime() - sourceTs.getTime()) / 86_400_000);

  const recentDays = opts.recentDays ?? RECENT_DAYS_DEFAULT;
  const initialHorizon: Horizon =
    opts.source.canonical ? "long"
    : opts.source.transient ? "short"
    : ageDays < recentDays ? "short"
    : "long";

  const out: Locus[] = [];
  for (const t of loci) {
    const fullSource = { id: opts.source.id, offset: t.source.offset };
    const id = deriveLocusId(t.breadcrumb, t.statement, fullSource);
    const decay = decayWeight(initialHorizon, ageDays);
    out.push({
      id,
      breadcrumb: t.breadcrumb,
      lattice: t.lattice,
      statement: t.statement,
      kind: t.kind,
      confidence: t.confidence,
      horizon: initialHorizon,
      decay,
      source: fullSource,
      first_seen: now.toISOString(),
      last_referenced: now.toISOString(),
      references: 0,
    });
  }
  return out;
}

export const _internals = { decayWeight };
