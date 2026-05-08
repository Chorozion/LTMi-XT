# LTMi-XT

**Layered Topological Memory Indexing — Extended Technology.**
A document-crystallization and lattice-indexed retrieval architecture for messy
documentation, optimized for hallucination-bounded retrieval **and** structured
fine-tune ingestion.

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Status: v0.1](https://img.shields.io/badge/status-v0.1-9BFFE8.svg)](docs/paper.md)
[![Format: .ltmi](https://img.shields.io/badge/format-.ltmi%20JSONL-FFD93D.svg)](docs/file-format-spec.md)
[![Lattice: 64³](https://img.shields.io/badge/lattice-64%C2%B3-00D4FF.svg)](docs/paper.md#5--lattice-topology-and-breadcrumb-derived-coordinates)
[![Demo: live](https://img.shields.io/badge/demo-live-3DDC97.svg)](https://sophiaxt.com/tools/ltmi-xt)

> Live demo: **<https://sophiaxt.com/tools/ltmi-xt>**
> Research page: **<https://sophiaxt.com/research/ltmi-xt>**
> Paper: [`docs/paper.md`](docs/paper.md) · Format spec: [`docs/file-format-spec.md`](docs/file-format-spec.md)

## What it does

LTMi-XT ingests messy documentation (technical manuals, internal wikis,
support transcripts, repair logs, research notes), **crystallizes** the prose
into atomic self-contained statements ("loci"), and places each locus at a
coordinate on a **64³ topological lattice**. Each locus carries:

- a four-level hierarchical breadcrumb path: `Topic > Subtopic > Concept > Claim`
- a deterministic lattice coordinate derived from the breadcrumb prefix
- a chronological horizon (`short` decaying / `long` consolidated) with a decay weight
- byte-offset provenance back to source
- a confidence score
- a content-addressed identifier (BLAKE2b-128 of canonical JSON)

The resulting `.ltmi` artifact is **dual-purpose**: it supports breadcrumb-
anchored retrieval (LLM answers grounded to specific loci with full provenance)
*and* direct ingestion as fine-tune training rows.

## Why a lattice

Classical mnemonic technique places information at distinct **loci** in a
spatial structure ("method of loci" / memory palace). Retrieval is a walk
through the structure rather than a search by identity. LTMi-XT applies this
literally: every crystallized statement is a locus, the lattice is a discrete
64³ topological cube, and retrieval is breadcrumb-anchored lattice traversal
followed by neighborhood expansion.

The lattice coordinate is hash-derived from the breadcrumb path in v0.1,
which gives:

1. Determinism — same breadcrumb always lands at the same cell.
2. Inspectability — anyone can see why a locus landed where it did.
3. No upstream model dependency — usable in environments without a sentence
   embedding model.

## Pipeline

```
[INGEST] → [CRYSTALLIZE] → [TOPOLOGIZE] → [PLACE ON LATTICE] →
                          [CHRONOLOGIZE] → [INDEX → .ltmi] →
                          ┌────────────────┬────────────────┐
                          ↓                ↓                ↓
                    [RETRIEVE]      [FINE-TUNE]      [INSPECT]
                     (lattice         (training         (audit)
                      walk)             rows)
```

Two LLM round-trips per ~2KB slab — one for crystallization, one for
batched topologization. The topologizer uses a running vocabulary so it
reuses topic / subtopic / concept levels across slabs instead of inventing
new ones for similar content.

## Quickstart

```bash
cd reference/ts
npm install
npm run build
```

```ts
import {
  buildBundle,
  createQ3MProvider,
  serializeJsonl,
  retrieve,
} from "@sophiaxt/ltmi-xt";
import * as fs from "node:fs/promises";

const crystallizeSystem = await fs.readFile(
  "reference/prompts/crystallize-system.md", "utf8");
const topologizeSystem = await fs.readFile(
  "reference/prompts/topologize-system.md", "utf8");

const provider = createQ3MProvider({ apiKey: process.env.Q3M_API_KEY! });

const bundle = await buildBundle(
  [{ label: "manual.md", text: messyText }],
  {
    crystallizer: { provider, systemPrompt: crystallizeSystem },
    topologizer:  { provider, systemPrompt: topologizeSystem },
  }
);

await fs.writeFile("corpus.ltmi", serializeJsonl(bundle));

const result = await retrieve("What are the workflow failure modes?", {
  loci: bundle.loci,
  provider,
  systemPrompt: topologizeSystem,
});
```

A `createGrokProvider({ apiKey })` factory is also available for xAI Grok 3.

## Repository layout

```
LTMi-XT/
├── README.md                       this file
├── LICENSE                         Apache 2.0
├── docs/
│   ├── paper.md                    13-section research paper
│   └── file-format-spec.md         formal v0.1 .ltmi specification
├── examples/
│   ├── messy-input.md              sample messy doc
│   └── corpus.ltmi                 the resulting .ltmi bundle
├── reference/
│   ├── ts/                         TypeScript reference implementation
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── README.md
│   │   └── src/
│   │       ├── index.ts            public API
│   │       ├── types.ts            strict v0.1 types
│   │       ├── crystallizer.ts     stage 1
│   │       ├── topologizer.ts      stage 2
│   │       ├── chronologizer.ts    stage 3 (pure)
│   │       ├── indexer.ts          stage 4 (composes pipeline)
│   │       ├── retriever.ts        stage 5 (lattice walk)
│   │       ├── fine-tune.ts        stage 6 (locus → training row)
│   │       ├── format/
│   │       │   ├── ltmi.ts         .ltmi read/write + id derivation
│   │       │   ├── lattice.ts      hash-derived coordinate
│   │       │   └── canonical-json.ts
│   │       └── providers/
│   │           └── openai-compat.ts  Q3M + Grok 3 (OpenAI-compatible)
│   └── prompts/
│       ├── crystallize-system.md
│       ├── topologize-system.md
│       └── instruction-template.md
└── tests/
    └── golden/                     deterministic golden corpora (planned)
```

## File format — the `.ltmi` bundle

Plain JSONL, one object per line. First line is the manifest; every
subsequent line is a locus. Companion files (`manifest.json`,
`breadcrumb-tree.json`, `instruction.md`, `provenance.csv`, `sources/`)
are reproducible from the JSONL alone.

Example locus line:

```json
{"id":"a-7f2c4d6e8a1b3c5d","breadcrumb":["AI","Diffusion Models","Cassandra T1","Architecture"],"lattice":[12,38,7],"statement":"Cassandra T1 uses 28 transformer layers with a 2,048 hidden size.","kind":"fact","confidence":1.0,"horizon":"long","decay":1.0,"source":{"id":"s-001","offset":[1245,1308]},"first_seen":"2026-05-08T12:34:56Z","last_referenced":"2026-05-08T12:34:56Z","references":0}
```

See [`docs/file-format-spec.md`](docs/file-format-spec.md) for the full
v0.1 specification — required fields, constraints, identifier derivation,
versioning, conformance criteria.

## Honest limitations (v0.1)

- v0.1 is **not benchmarked publicly yet**. The paper specifies the
  architecture, file format, retrieval algorithm, and fine-tune integration;
  evaluation results come later, only after they have been measured and can
  be released with reproducible scripts.
- Hash-derived coordinates have no semantic geometry — two loci about the
  same concept under different breadcrumb paths land far apart. This is the
  trade-off for inspectability and determinism.
- Two LLM round-trips per slab.
- Lattice radius is fixed in v0.1.
- English-only crystallizer in v0.1.
- Confidence scores are model-reported, not calibrated against held-out human
  judgments.

See the paper §11 and §12 for the full limitations + roadmap.

## License

Apache License 2.0. See [`LICENSE`](LICENSE).

The `.ltmi` file format is open; users may produce, store, and exchange
`.ltmi` artifacts without notifying or paying SOPHIA XT.

The acronym **LTMi-XT** and the file extension `.ltmi` are SOPHIA XT
trademarks; informal use is unrestricted, but commercial product names
should not collide.

---

LTMi-XT is part of the **SOPHIA XT** model family · <https://sophiaxt.com/research/ltmi-xt>
