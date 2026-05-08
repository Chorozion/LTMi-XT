// Deterministic micro-benchmarks for LTMi-XT v0.1.
// No LLM, no network. Pure invariant checks at high N.
//
// Run from the repo root after `npm run build`:
//   node examples/benchmarks/micro_bench.mjs

import {
  latticeCoord,
  chebyshev,
  breadcrumbPrefixMatch,
  deriveLocusId,
  deriveSourceId,
  deriveCorpusId,
  serializeJsonl,
  parseJsonl,
  buildBreadcrumbTree,
  canonicalJson,
  locusToRow,
  toTrainingJsonl,
} from "../../reference/ts/dist/index.js";

const trials = 10_000;
const out = [];

function time(label, fn) {
  const t0 = process.hrtime.bigint();
  let r = null;
  for (let i = 0; i < trials; i++) r = fn(i);
  const t1 = process.hrtime.bigint();
  const totalMs = Number(t1 - t0) / 1e6;
  const perOp = totalMs / trials;
  out.push({ test: label, trials, totalMs: +totalMs.toFixed(2), perOpUs: +(perOp * 1000).toFixed(2) });
  return r;
}

// ----- Lattice coord stability -----
function randBreadcrumb(seed) {
  const r = (n) => Math.abs(((seed * 2654435761) ^ n) % 1000);
  return [`Topic-${r(1) % 100}`, `Sub-${r(2) % 100}`, `Concept-${r(3) % 100}`, `Claim-${r(4) % 1000}`];
}

let stableCount = 0;
for (let i = 0; i < trials; i++) {
  const bc = randBreadcrumb(i);
  const a = latticeCoord(bc);
  const b = latticeCoord(bc);
  if (a[0] === b[0] && a[1] === b[1] && a[2] === b[2]) stableCount++;
}
out.push({ test: "lattice_coord_stable", trials, stable: stableCount, fraction: stableCount / trials });

// Cell collisions: how many distinct cells emerge from N random breadcrumbs?
const cells = new Set();
for (let i = 0; i < trials; i++) {
  const bc = randBreadcrumb(i);
  const c = latticeCoord(bc);
  cells.add(`${c[0]},${c[1]},${c[2]}`);
}
out.push({ test: "lattice_cell_distinctness", trials, distinct_cells: cells.size, max_possible: 64 ** 3, utilization: +(cells.size / (64 ** 3) * 100).toFixed(2) });

// Prefix-locality: breadcrumbs sharing topic+subtopic+concept must share cells.
let prefixCollisions = 0, prefixTrials = 1000;
for (let i = 0; i < prefixTrials; i++) {
  const a = ["AI", "Diffusion", "Cassandra", `Claim-${i}-A`];
  const b = ["AI", "Diffusion", "Cassandra", `Claim-${i}-B`];
  const ca = latticeCoord(a);
  const cb = latticeCoord(b);
  if (ca[0] === cb[0] && ca[1] === cb[1] && ca[2] === cb[2]) prefixCollisions++;
}
out.push({ test: "lattice_prefix_locality", trials: prefixTrials, share_cell_when_prefix_matches: prefixCollisions, fraction: prefixCollisions / prefixTrials });

// ----- Locus id stability -----
const baseBC = ["AI", "Diffusion", "Cassandra T1", "Architecture"];
const baseStmt = "Cassandra T1 uses 28 transformer layers.";
const baseSrc = { id: "s-test", offset: [0, 50] };
let idStable = 0;
for (let i = 0; i < trials; i++) {
  const a = deriveLocusId(baseBC, baseStmt, baseSrc);
  const b = deriveLocusId(baseBC, baseStmt, baseSrc);
  if (a === b) idStable++;
}
out.push({ test: "locus_id_stable", trials, stable: idStable, fraction: idStable / trials });

// ----- canonicalJson -----
let canonStable = 0;
for (let i = 0; i < trials; i++) {
  const a = canonicalJson({ z: i, a: i + 1, m: { y: i, b: i + 2 } });
  const b = canonicalJson({ a: i + 1, m: { b: i + 2, y: i }, z: i });
  if (a === b) canonStable++;
}
out.push({ test: "canonical_json_stable", trials, stable: canonStable, fraction: canonStable / trials });

// ----- Performance micro-benchmarks -----
time("latticeCoord_perf", (i) => latticeCoord(["t" + (i % 50), "s" + (i % 30), "c" + (i % 20), "x"]));
time("deriveLocusId_perf", (i) => deriveLocusId(["AI", "Diffusion", "Cassandra T1", "x"], baseStmt + i, baseSrc));
time("canonicalJson_perf", (i) => canonicalJson({ z: i, a: i + 1, nested: { y: i, b: [i, i + 1, i + 2] } }));
time("chebyshev_perf", (i) => chebyshev([i % 64, (i + 1) % 64, (i + 2) % 64], [(i + 5) % 64, (i + 8) % 64, (i + 13) % 64]));

// ----- Format round-trip -----
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));
const C2bundle = JSON.parse(readFileSync(resolve(__dirname, "bundles/C2.json"), "utf8"));
const jsonl = serializeJsonl({
  manifest: C2bundle.manifest,
  loci: C2bundle.loci,
  sources: new Map([[C2bundle.sources[0].id, "src"]]),
  breadcrumbTree: C2bundle.breadcrumbTree,
});
const reparsed = parseJsonl(jsonl);
out.push({
  test: "jsonl_roundtrip_C2",
  loci_in: C2bundle.loci.length,
  loci_out: reparsed.loci.length,
  match: reparsed.loci.length === C2bundle.loci.length,
});

// ----- Token savings simulation -----
// For corpus C2, what fraction of tokens does "top-6 loci" represent vs. the full corpus?
const fullCorpusBytes = 1056; // C2 input
const sampleStmt = C2bundle.loci.slice(0, 6).reduce((acc, l) => acc + l.statement.length + l.breadcrumb.filter(Boolean).join(" > ").length + 6, 0);
out.push({
  test: "token_savings_C2_top6",
  full_corpus_bytes: fullCorpusBytes,
  top6_loci_bytes: sampleStmt,
  reduction_factor: +(fullCorpusBytes / sampleStmt).toFixed(2),
  note: "Bytes proxy for tokens. Real token reduction will vary with tokenizer.",
});

console.log(JSON.stringify(out, null, 2));
