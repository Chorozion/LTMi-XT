// Hash-derived lattice coordinate. See paper §5.2 + docs/empirical-findings-2026-05-12.md.
//
// We hash each cumulative breadcrumb prefix and combine to produce a
// (x, y, z) ∈ [0, 63]³ such that loci sharing the first three breadcrumb
// levels land at the same cell.
//
// EMPIRICAL STATUS (v0.3.1, 2026-05-12)
// -------------------------------------
// The lattice coordinate is a per-locus DETERMINISTIC IDENTIFIER. In our
// reference Cassandra T2 implementation it is NOT a semantic conditioning
// signal — three-way ablation (BLAKE2b vs PCA-3D vs uniform-random per
// locus) showed statistically indistinguishable downstream behavior, with
// unforced inference byte-identical between the random and BLAKE2b arms.
//
// Recommended uses for this coordinate:
//   1. Spatial clustering for retrieval-time topic neighborhood discovery
//      (loci sharing k breadcrumb levels share k lattice coords by
//      construction — that's a MECHANICAL property, not a statistical claim)
//   2. Deterministic per-locus identity (acts as a fingerprint)
//
// NOT recommended:
//   - Treat as a learned semantic embedding the LM will exploit. It won't —
//     not at our scale, not in our v0.1 reference triple-attention
//     implementation. See docs/empirical-findings-2026-05-12.md for the
//     full ablation.

import { createHash } from "node:crypto";
import type { Breadcrumb, LatticeCoord } from "../types.js";

const LATTICE_DIM = 64;

export function blake2b128Hex(input: string): string {
  // Node OpenSSL exposes blake2b512 starting in modern releases. Truncate
  // to 128 bits (32 hex chars).
  const h = createHash("blake2b512").update(input, "utf8").digest("hex");
  return h.slice(0, 32);
}

function firstByte(hashHex: string): number {
  return parseInt(hashHex.slice(0, 2), 16);
}

/**
 * Compute the lattice coordinate for a breadcrumb path.
 *
 * Cell address uses topic / subtopic / concept levels. The fourth `claim`
 * level is intentionally not part of the cell address — multiple claims at
 * the same concept share a cell, which is the property retrieval relies on.
 */
export function latticeCoord(breadcrumb: Breadcrumb): LatticeCoord {
  const topic = breadcrumb[0] ?? "";
  const subtopic = breadcrumb[1] ?? "";
  const concept = breadcrumb[2] ?? "";

  const hT = blake2b128Hex("ltmi/topic:" + topic);
  const hS = blake2b128Hex("ltmi/sub:" + topic + "|" + subtopic);
  const hC = blake2b128Hex("ltmi/con:" + topic + "|" + subtopic + "|" + concept);

  const x = firstByte(hT) % LATTICE_DIM;
  const y = firstByte(hS) % LATTICE_DIM;
  const z = firstByte(hC) % LATTICE_DIM;
  return [x, y, z] as const;
}

/** Chebyshev (L∞) distance between two cells. */
export function chebyshev(a: LatticeCoord, b: LatticeCoord): number {
  return Math.max(
    Math.abs(a[0] - b[0]),
    Math.abs(a[1] - b[1]),
    Math.abs(a[2] - b[2]),
  );
}

/** How many leading breadcrumb levels match. */
export function breadcrumbPrefixMatch(a: Breadcrumb, b: Breadcrumb): number {
  let n = 0;
  for (let i = 0; i < 4; i++) {
    if (a[i] != null && a[i] === b[i]) n++;
    else break;
  }
  return n;
}

export const LATTICE = { DIM: LATTICE_DIM } as const;
