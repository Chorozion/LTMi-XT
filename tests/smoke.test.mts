// Deterministic smoke tests — no LLM calls, no network. Verifies the
// format invariants: lattice coordinate stability, content-addressed ids,
// JSONL round-trip, breadcrumb tree construction, fine-tune row shape.
//
// Run from repo root:    npm test
// Or directly:           node --test --import tsx tests/smoke.test.mts

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBreadcrumbTree,
  canonicalJson,
  chebyshev,
  deriveCorpusId,
  deriveLocusId,
  deriveSourceId,
  latticeCoord,
  locusToRow,
  parseJsonl,
  serializeJsonl,
  toTrainingJsonl,
  type Bundle,
  type Locus,
} from "../reference/ts/src/index.js";

function fixtureLocus(overrides: Partial<Locus> = {}): Locus {
  const breadcrumb = overrides.breadcrumb ?? ["AI", "Diffusion", "Cassandra T1", "Architecture"] as Locus["breadcrumb"];
  const statement = overrides.statement ?? "Cassandra T1 uses 28 transformer layers.";
  const source = overrides.source ?? { id: "s-test", offset: [0, 50] as [number, number] };
  return {
    id: deriveLocusId(breadcrumb, statement, source),
    breadcrumb,
    lattice: latticeCoord(breadcrumb),
    statement,
    kind: "fact",
    confidence: 0.95,
    horizon: "long",
    decay: 1.0,
    source,
    first_seen: "2026-05-08T12:34:56Z",
    last_referenced: "2026-05-08T12:34:56Z",
    references: 0,
    ...overrides,
  } as Locus;
}

// ────────────────────────────────────────────────────────────────────────
test("canonical JSON sorts keys at every level", () => {
  const a = canonicalJson({ z: 1, a: 2, m: { y: 3, b: 4 } });
  const b = canonicalJson({ a: 2, m: { b: 4, y: 3 }, z: 1 });
  assert.equal(a, b);
  assert.equal(a, '{"a":2,"m":{"b":4,"y":3},"z":1}');
});

test("lattice coord is deterministic and breadcrumb-prefix-stable", () => {
  const a = latticeCoord(["AI", "Diffusion", "Cassandra T1", "Architecture"]);
  const b = latticeCoord(["AI", "Diffusion", "Cassandra T1", "Training"]);
  // Same first 3 levels → same cell.
  assert.deepEqual(a, b);

  const c = latticeCoord(["AI", "Diffusion", "Cassandra T1", "Architecture"]);
  assert.deepEqual(a, c, "same input should give the same coord");

  const d = latticeCoord(["AI", "Diffusion", "Other Model", "Architecture"]);
  // Different concept → different cell (with overwhelming probability).
  assert.notDeepEqual(a, d);

  // All coordinates are in [0, 63].
  for (const coord of [a, b, c, d]) {
    for (const v of coord) assert.ok(v >= 0 && v < 64, `coord ${v} out of range`);
  }
});

test("chebyshev distance is correct", () => {
  assert.equal(chebyshev([0, 0, 0], [0, 0, 0]), 0);
  assert.equal(chebyshev([0, 0, 0], [3, 1, 2]), 3);
  assert.equal(chebyshev([10, 20, 30], [13, 22, 31]), 3);
});

test("locus id is content-addressed and stable", () => {
  const bc = ["AI", "Diffusion", "Cassandra T1", "Architecture"] as Locus["breadcrumb"];
  const stmt = "Cassandra T1 uses 28 transformer layers.";
  const src = { id: "s-1", offset: [0, 50] as [number, number] };
  const id1 = deriveLocusId(bc, stmt, src);
  const id2 = deriveLocusId(bc, stmt, src);
  assert.equal(id1, id2);
  assert.match(id1, /^a-[0-9a-f]{32}$/);

  // Different statement → different id.
  const id3 = deriveLocusId(bc, "Something else.", src);
  assert.notEqual(id1, id3);
});

test("source id is content-addressed", () => {
  const a = deriveSourceId("hello world");
  const b = deriveSourceId("hello world");
  assert.equal(a, b);
  assert.match(a, /^s-[0-9a-f]{32}$/);

  const c = deriveSourceId("hello mars");
  assert.notEqual(a, c);
});

test("corpus id is order-independent over the locus set", () => {
  const ids = ["a-1", "a-2", "a-3"];
  const a = deriveCorpusId(ids);
  const b = deriveCorpusId([...ids].reverse());
  assert.equal(a, b, "corpus id should not depend on locus order");
});

// ────────────────────────────────────────────────────────────────────────
test("JSONL round-trip preserves manifest and loci", () => {
  const loci = [
    fixtureLocus(),
    fixtureLocus({
      breadcrumb: ["Operations", "Cold Storage", "Pack-out", "Dry Ice"] as Locus["breadcrumb"],
      statement: "Cold Storage dry-ice loads always use VIP panel inserts.",
      kind: "instruction",
      confidence: 0.9,
      source: { id: "s-test", offset: [200, 280] },
    }),
  ];
  const bundle: Bundle = {
    manifest: {
      v: "ltmi/0.1",
      kind: "manifest",
      corpus_id: deriveCorpusId(loci.map((l) => l.id)),
      loci: loci.length,
      lattice: { dim: 64, shape: "cube" },
      created: "2026-05-08T12:00:00Z",
      sources: ["s-test"],
    },
    loci,
    sources: new Map([["s-test", "the source text"]]),
    breadcrumbTree: buildBreadcrumbTree(loci),
  };

  const jsonl = serializeJsonl(bundle);
  const parsed = parseJsonl(jsonl);

  assert.equal(parsed.manifest.corpus_id, bundle.manifest.corpus_id);
  assert.equal(parsed.loci.length, loci.length);
  for (let i = 0; i < loci.length; i++) {
    assert.equal(parsed.loci[i].id, loci[i].id);
    assert.equal(parsed.loci[i].statement, loci[i].statement);
    assert.deepEqual(parsed.loci[i].lattice, loci[i].lattice);
  }
});

test("JSONL parser rejects mismatched manifest count", () => {
  const broken =
    JSON.stringify({
      v: "ltmi/0.1",
      kind: "manifest",
      corpus_id: "c-1",
      loci: 99,
      lattice: { dim: 64, shape: "cube" },
      created: "2026-05-08T12:00:00Z",
      sources: [],
    }) + "\n" +
    JSON.stringify(fixtureLocus());
  assert.throws(() => parseJsonl(broken), /Manifest declares 99 loci/);
});

// ────────────────────────────────────────────────────────────────────────
test("breadcrumb tree groups by shared prefix", () => {
  const a = fixtureLocus({
    breadcrumb: ["AI", "Diffusion", "Cassandra T1", "Architecture"] as Locus["breadcrumb"],
    statement: "Cassandra T1 uses 28 transformer layers.",
    source: { id: "s-1", offset: [0, 60] },
  });
  const b = fixtureLocus({
    breadcrumb: ["AI", "Diffusion", "Cassandra T1", "Training"] as Locus["breadcrumb"],
    statement: "Cassandra T1 trained 5 epochs.",
    source: { id: "s-1", offset: [70, 120] },
  });
  const c = fixtureLocus({
    breadcrumb: ["Operations", "Cold Storage", "Pack-out", "Dry Ice"] as Locus["breadcrumb"],
    statement: "Use VIP panel inserts for dry ice loads.",
    source: { id: "s-2", offset: [0, 80] },
  });
  const tree = buildBreadcrumbTree([a, b, c]);
  assert.equal(tree.name, "ROOT");
  assert.equal(tree.children?.length, 2);

  const ai = tree.children?.find((n) => n.name === "AI")!;
  assert.ok(ai);
  // AI > Diffusion > Cassandra T1 has both Architecture and Training as leaves.
  const cas = ai.children?.[0].children?.[0]!;
  assert.equal(cas.name, "Cassandra T1");
  assert.equal(cas.children?.length, 2);
  const namesUnderCas = cas.children!.map((c) => c.name).sort();
  assert.deepEqual(namesUnderCas, ["Architecture", "Training"]);
});

// ────────────────────────────────────────────────────────────────────────
test("locusToRow produces a stable training row", () => {
  const l = fixtureLocus();
  const row = locusToRow(l);
  assert.equal(typeof row.instruction, "string");
  assert.equal(typeof row.input, "string");
  assert.equal(row.output, l.statement);
  assert.equal(row.weight, l.decay * l.confidence);
  assert.equal(row.tags.horizon, "long");
  assert.equal(row.tags.kind, "fact");
  assert.equal(row.meta.locus_id, l.id);

  const jsonl = toTrainingJsonl([l, l]);
  const lines = jsonl.split("\n");
  assert.equal(lines.length, 2);
  for (const line of lines) {
    const parsed = JSON.parse(line);
    assert.equal(parsed.output, l.statement);
  }
});
