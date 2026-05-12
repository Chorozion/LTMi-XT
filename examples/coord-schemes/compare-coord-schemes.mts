/**
 * Compare the three lattice coord schemes side-by-side.
 *
 *   BLAKE2b (latticeCoord)         — default; hash of breadcrumb prefix
 *   PCA-3D                         — not implemented in TS reference yet
 *                                    (see Python lensx.ltmi for PCA)
 *   uniform-random (latticeRandomPerLocus)  — negative-control scheme
 *
 * Run:
 *   tsx examples/coord-schemes/compare-coord-schemes.mts
 *
 * Or after build:
 *   node --import tsx examples/coord-schemes/compare-coord-schemes.mts
 *
 * Output: a small table showing how each scheme assigns coords to a
 * shared set of breadcrumb paths. Useful for:
 *   - verifying the helpers behave deterministically
 *   - seeing the "prefix-stable" property of BLAKE2b vs the "no structure"
 *     property of random
 *   - inspecting multi-resolution decomposition for visualization
 *
 * Empirical note: the 2026-05-12 ablation showed all three coord schemes
 * are statistically indistinguishable on Cassandra T2 downstream metrics.
 * The choice between them is operational (deterministic-from-breadcrumb
 * vs requires-encoder vs requires-seed-table), not empirical. See
 * docs/empirical-findings-2026-05-12.md.
 */

import {
  latticeCoord,
  latticeRandomPerLocus,
  multiResolutionCoord,
  chebyshev,
  type LatticeCoord,
} from "../../reference/ts/src/index.js";

// ─── Sample corpus — breadcrumb paths that share prefixes ──────────────

const SAMPLE_BREADCRUMBS = [
  ["Medicine", "Cardiology", "Heart", "chambers"],
  ["Medicine", "Cardiology", "Heart", "valves"],          // shares 3-prefix with above
  ["Medicine", "Cardiology", "Blood", "plasma"],          // shares 2-prefix
  ["Medicine", "Neurology", "Cortex", "neurons"],         // shares 1-prefix
  ["Law", "Contracts", "Formation", "consideration"],     // shares 0-prefix
  ["Law", "Contracts", "Formation", "offer"],             // shares 3-prefix with above
] as const;

// Stable locus IDs for the random scheme (in practice, these come from
// `deriveLocusId(breadcrumb, statement, source)`)
const LOCUS_IDS = SAMPLE_BREADCRUMBS.map(
  (bc) => `a-${bc.join("/")}`,
);


function fmtCoord(c: LatticeCoord): string {
  return `(${c[0].toString().padStart(2)}, ${c[1].toString().padStart(2)}, ${c[2].toString().padStart(2)})`;
}


// ─── BLAKE2b vs random — coord assignment per locus ───────────────────

console.log("=".repeat(78));
console.log("Lattice coord assignment per breadcrumb (BLAKE2b vs uniform-random)");
console.log("=".repeat(78));
console.log("");

const header =
  `${"breadcrumb".padEnd(52)}  ${"BLAKE2b".padEnd(16)}  ${"random".padEnd(16)}`;
console.log(header);
console.log("-".repeat(header.length));

for (let i = 0; i < SAMPLE_BREADCRUMBS.length; i++) {
  const bc = SAMPLE_BREADCRUMBS[i] as any;
  const id = LOCUS_IDS[i]!;
  const blake = latticeCoord(bc);
  const rand = latticeRandomPerLocus(id);
  const bcStr = bc.join(" > ");
  console.log(
    `${bcStr.padEnd(52)}  ${fmtCoord(blake)}  ${fmtCoord(rand)}`,
  );
}

// ─── Prefix-stability property check (BLAKE2b only) ───────────────────

console.log("");
console.log("=".repeat(78));
console.log("Property check: BLAKE2b is prefix-stable, random is not");
console.log("=".repeat(78));
console.log("");

// Loci that share 3 breadcrumb levels should share 3 lattice coord axes
// (BLAKE2b only — the property is mechanical, not statistical).
const a = SAMPLE_BREADCRUMBS[0] as any;  // Medicine/Cardiology/Heart/chambers
const b = SAMPLE_BREADCRUMBS[1] as any;  // Medicine/Cardiology/Heart/valves
const aCoord = latticeCoord(a);
const bCoord = latticeCoord(b);
const aRand = latticeRandomPerLocus(LOCUS_IDS[0]!);
const bRand = latticeRandomPerLocus(LOCUS_IDS[1]!);

console.log(`Two loci sharing 3 breadcrumb levels (.../Heart/chambers vs .../Heart/valves):`);
console.log(`  BLAKE2b: ${fmtCoord(aCoord)}  vs  ${fmtCoord(bCoord)}  cheb=${chebyshev(aCoord, bCoord)}`);
console.log(`     → axes 0,1,2 identical (level-1,2,3 hashes match); only 4th level differs`);
console.log(`     → BUT the 4th level isn't part of the coord, so coords ARE identical`);
console.log(`  random : ${fmtCoord(aRand)}  vs  ${fmtCoord(bRand)}  cheb=${chebyshev(aRand, bRand)}`);
console.log(`     → random gives no prefix structure (expected: any chebyshev distance)`);


// ─── Multi-resolution decomposition demo ──────────────────────────────

console.log("");
console.log("=".repeat(78));
console.log("Multi-resolution decomposition (coarse 4³ + medium 16³ + fine 64³)");
console.log("=".repeat(78));
console.log("");

const sample = aCoord;  // (x, y, z) at fine 64³ resolution
const multi = multiResolutionCoord(sample, 64);
console.log(`Fine 64³ coord:   ${fmtCoord(sample)}`);
console.log(`Medium 16³:       ${fmtCoord(multi.medium)}   (each axis = fine // 4)`);
console.log(`Coarse 4³:        ${fmtCoord(multi.coarse)}   (each axis = fine // 16)`);
console.log("");
console.log("Use case: render a zooming hierarchy where you cluster at coarse,");
console.log("expand to medium on hover, and pinpoint specific loci at fine.");


// ─── Seed sensitivity for random scheme ────────────────────────────────

console.log("");
console.log("=".repeat(78));
console.log("Random scheme: changing the seed gives a completely different layout");
console.log("=".repeat(78));
console.log("");

console.log(`${"breadcrumb".padEnd(48)}  ${"seed=0xC0FFEE".padEnd(16)}  ${"seed=42".padEnd(16)}`);
console.log("-".repeat(82));
for (let i = 0; i < Math.min(3, SAMPLE_BREADCRUMBS.length); i++) {
  const id = LOCUS_IDS[i]!;
  const seed1 = latticeRandomPerLocus(id, 64, 0xC0FFEE);
  const seed2 = latticeRandomPerLocus(id, 64, 42);
  const bcStr = (SAMPLE_BREADCRUMBS[i] as any).join(" > ");
  console.log(`${bcStr.padEnd(48)}  ${fmtCoord(seed1)}  ${fmtCoord(seed2)}`);
}
console.log("");
console.log("This is the negative-control property used in the 2026-05-12 ablation:");
console.log("if model behavior is invariant to coord values, the channel is content-free.");
