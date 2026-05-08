# LTMi-XT

**Layered Topological Memory Indexing — Extended Technology.**
A document-crystallization and lattice-indexed retrieval architecture for messy
documentation, optimized for hallucination-bounded retrieval, structured
fine-tune ingestion, **and effective context-window extension** for any LLM.

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Status: v0.1](https://img.shields.io/badge/status-v0.1-9BFFE8.svg)](docs/paper.md)
[![Format: .ltmi](https://img.shields.io/badge/format-.ltmi%20JSONL-FFD93D.svg)](docs/file-format-spec.md)
[![Lattice: 64³](https://img.shields.io/badge/lattice-64%C2%B3-00D4FF.svg)](docs/paper.md#5--lattice-topology-and-breadcrumb-derived-coordinates)
[![Demo: LIVE](https://img.shields.io/badge/demo-LIVE%20%E2%86%97-3DDC97.svg)](https://sophiaxt.com/tools/ltmi-xt)
[![Free via Puter](https://img.shields.io/badge/free%20via%20Puter-GPT--4o%20%2B%20Claude%20%2B%20more-FFD93D.svg)](https://docs.puter.com/AI/chat/)
[![Benchmarks: 13/15 top-1](https://img.shields.io/badge/benchmarks-13%2F15%20top--1%20%C2%B7%204%2C370ms%20median-9BFFE8.svg)](docs/benchmarks-v0.1.md)

## 🎯 Try the live demo right now

> **<https://sophiaxt.com/tools/ltmi-xt>**

Paste messy text, watch it crystallize into a lattice index, query it. The
demo ships with a model picker (GPT-4o · Claude Sonnet 4.5 · DeepSeek R1 ·
OpenAI o4-mini) running through **Puter.js** so end users pay for their own
inference and the operator pays nothing. The same demo also works against
your own provider keys (Q3M / Mercury 2 / Grok / OpenAI) if you self-host.

Research page: **<https://sophiaxt.com/research/ltmi-xt>**
Paper: [`docs/paper.md`](docs/paper.md) · Format spec: [`docs/file-format-spec.md`](docs/file-format-spec.md)

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

## 🧠 Use LTMi-XT to extend any LLM's effective context

Most LLMs have a hard context window. Even when the window is large, paying
for and reasoning over a 100,000-token corpus on every chat turn is wasteful
and slow. LTMi-XT lets you do this once, then keep the corpus warm forever:

```
ONE-TIME · ingest                    PER-QUERY · retrieve only what you need
─────────────────                    ─────────────────────────────────────────
big_doc.md  ─┐                                          ┌→ top-K loci as context
   …         ├─→  crystallize  ─→  corpus.ltmi          │   (e.g. 6 loci ≈ 800 tokens)
all your     │      (1 LLM      (durable, cheap          │
 PDFs        │       call per     to store)              │
 logs        │       2KB slab)                           │
 wiki        │                                          ▲
─────────────┘                                          │
                                                        │
                user query "what was the claim       ┌──┴───────────┐
                amount on coolant losses?"   ───────►│ retrieve     │
                                                     │ (lattice walk│
                                                     │  + breadcrumb│
                                                     │  prefix)     │
                                                     └──────────────┘
```

**Concretely:**

1. **Crystallize once.** Run a long document through `crystallize` — get a
   stable `.ltmi` bundle. You can store this in a file, S3, a database row,
   anywhere. It's plain JSONL.

2. **For each user query, retrieve only top-K loci.** The lattice walk
   surfaces 4–8 loci (typically 500–1,200 tokens) that are breadcrumb-anchored
   to the query. Feed those + the question to your LLM.

3. **Net effect.** The LLM sees a **focused, breadcrumb-tagged subset** of
   your corpus instead of the whole thing. Token cost per query drops by
   100–1000× vs. dumping the full document into the prompt. The breadcrumb
   path is part of the prompt so the LLM grounds its answer to a specific
   place in the source.

4. **Provenance comes for free.** Every locus has a `source.id` and byte
   offset, so the LLM's answer can be traced back to the exact span in the
   original document. Useful for audit, citation, and "show your work."

5. **Same artifact = fine-tune data.** Run `train-export` against the same
   `.ltmi` and you get JSONL training rows with breadcrumb-derived
   instructions, ready for SFT/LoRA.

### Minimal code (Node)

```ts
import {
  buildBundle, retrieve, serializeJsonl, createPuterProvider,
} from "@sophiaxt/ltmi-xt";

// 1. CRYSTALLIZE — runs once per document
const bundle = await buildBundle(
  [{ label: "wiki.md", text: hugeDocument }],
  {
    crystallizer: { provider: chatProvider, systemPrompt: cryPrompt },
    topologizer:  { provider: chatProvider, systemPrompt: topPrompt },
    persona: "sophia", // every model self-identifies as Sophia
  }
);
fs.writeFileSync("wiki.ltmi", serializeJsonl(bundle));

// 2. PER QUERY — retrieve top-K loci, hand to your LLM
const result = await retrieve("What were the workflow failure modes?", {
  loci: bundle.loci,
  provider: chatProvider,
  systemPrompt: topPrompt,
  k: 6,
});

const context = result.results
  .map(r => `[${r.locus.breadcrumb.filter(Boolean).join(" > ")}] ${r.locus.statement}`)
  .join("\n");

// Feed `context` + the user's question to whatever LLM you want.
```

#Classical mnemonic technique places information at distinct **loci** in a
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

## ⚡ Free, scalable hosting via Puter — zero per-query operator cost

LTMi-XT v0.1 ships a `PuterProvider` that calls `puter.ai.chat()` directly
from the user's browser. Puter uses a **user-pays cost model** — your end
users pay for their own inference through their own Puter accounts; the
operator pays nothing per query. This makes it practical to host a public
demo at any scale.

```html
<!-- Drop this on your page; that's the whole setup. -->
<script src="https://js.puter.com/v2/"></script>
```

```ts
import { buildBundle, createPuterProvider } from "@sophiaxt/ltmi-xt";

const provider = createPuterProvider({ model: "gpt-4o-mini" });

const bundle = await buildBundle(
  [{ label: "doc.md", text: messy }],
  {
    crystallizer: { provider, systemPrompt: cryPrompt },
    topologizer:  { provider, systemPrompt: topPrompt },
    persona: "sophia",
  }
);
```

Recommended models (all available via Puter):

| Model | Notes |
|---|---|
| `gpt-4o-mini` | Default · fast · reliable JSON |
| `gpt-4o` | Higher quality · slower |
| `claude-sonnet-4-5` | Strong reasoning · readable breadcrumbs |
| `deepseek/deepseek-r1` | Reasoning model · cost-efficient |
| `o4-mini` | OpenAI reasoning model |

The live demo at <https://sophiaxt.com/tools/ltmi-xt> exposes this list as
a model picker. Whichever model is selected is wrapped automatically by the
Sophia persona prefix (see next section).

## 🪞 Sophia persona — every model self-identifies as Sophia

By default LTMi-XT wraps the system prompt with a short **Sophia persona**
preamble so the underlying model self-identifies as `Sophia from SOPHIA XT`
when asked, and operates with elevated reasoning posture (higher
signal-to-noise, structured detail, no fabrication). This default applies
to every provider — Puter, Q3M (Mercury 2), Grok, OpenAI.

To disable, pass `persona: "none"` in the index options. The persona is
implemented as a 9-line string constant exported from
`reference/ts/src/persona.ts` so it's auditable and trivially overridable.

## Run it locally

Three paths depending on what you want.

### Path A — CLI (fastest)

```bash
git clone https://github.com/Chorozion/LTMi-XT.git
cd LTMi-XT
npm install
npm run build

# Inspect the included example corpus — no API key needed.
node apps/cli/dist/main.js inspect examples/corpus.ltmi

# Or link the binary so you can call `ltmi` directly.
cd apps/cli && npm link
ltmi inspect examples/corpus.ltmi
ltmi train-export examples/corpus.ltmi --out training.jsonl
```

To crystallize new documents, set ONE of:

```bash
export Q3M_API_KEY=…       # Inception Mercury — preferred
export GROK_API_KEY=…      # xAI Grok
export OPENAI_API_KEY=…    # OpenAI or any OpenAI-compatible endpoint
```

Then:

```bash
ltmi crystallize examples/messy-input.md --out my.ltmi
ltmi retrieve my.ltmi "what are the workflow failure modes?"
```

### Path B — Local server with web UI

```bash
ltmi serve --port 3030
# → open http://localhost:3030
```

The server exposes `POST /api/ltmi-xt/crystallize` and
`POST /api/ltmi-xt/retrieve` plus a static web UI from `apps/web/`. Same
endpoints and same code as <https://sophiaxt.com/tools/ltmi-xt>.

Read-only commands (`inspect`, `train-export`) work without a provider.
The web UI shows a "no provider" badge if none is configured.

### Path C — Docker

```bash
docker build -t ltmi-xt:0.1 .
docker run -p 3030:3030 -e Q3M_API_KEY=$Q3M_API_KEY ltmi-xt:0.1
# → open http://localhost:3030
```

Provider env vars (`Q3M_API_KEY`, `GROK_API_KEY`, `OPENAI_API_KEY`) are
passed through with `-e`.

### Path D — Library import

```ts
import {
  buildBundle, createQ3MProvider, serializeJsonl, retrieve,
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
```

`createGrokProvider({apiKey})` and `createOpenAiProvider({apiKey})` are also
exported.

## Benchmarks

Real measurements against the live `https://sophiaxt.com/api/ltmi-xt/*`
endpoint on **2026-05-08**, Mercury 2 backend. Numbers describe **this
deployment at this time** — they are not generalizable.

| Metric | Value |
|---|---:|
| Top-1 hit rate (15 hand-authored queries, 3 corpora) | **13 / 15 = 86.7 %** *(grader-corrected)* |
| `/crystallize` median latency (700–1,100 char input) | **4,370 ms** |
| `/retrieve` median latency (single query, k=6) | **1,228 ms** |
| Lattice coordinate stability (10,000 trials) | 100.0 % |
| Locus id stability (10,000 trials) | 100.0 % |
| Canonical JSON stability (10,000 trials) | 100.0 % |
| Format JSONL round-trip (23 loci) | byte-identical |

Full methodology, raw numbers, per-query results, and the two real misses
documented honestly: see [`docs/benchmarks-v0.1.md`](docs/benchmarks-v0.1.md).

To reproduce locally:

```bash
npm install && npm run build
node examples/benchmarks/micro_bench.mjs       # deterministic, no network
python3 examples/benchmarks/run_bench.py       # live API, ~5 min, respects rate limits
```

Raw artifacts (logs, captured `.ltmi` bundles, queries) are committed
under [`examples/benchmarks/`](examples/benchmarks).

## Tests

```bash
npm test     # 10 deterministic smoke tests, no network, no LLM
```

Tests cover the format invariants — canonical JSON sort, hash-derived
lattice coordinate stability, content-addressed locus / source / corpus
ids, JSONL round-trip, breadcrumb tree construction, and fine-tune row
shape.

## Repository layout

```
LTMi-XT/
├── README.md                       this file
├── LICENSE                         Apache 2.0
├── NOTICE.md                       plain-English license summary
├── Dockerfile                      one-command runnable image
├── package.json                    npm workspaces root
├── docs/
│   ├── paper.md                    13-section research paper
│   └── file-format-spec.md         formal v0.1 .ltmi specification
├── examples/
│   ├── messy-input.md              sample messy doc
│   └── corpus.ltmi                 the resulting .ltmi bundle
├── apps/
│   ├── cli/                        runnable CLI
│   │   └── src/
│   │       ├── main.ts             dispatcher
│   │       ├── commands/           crystallize, retrieve, inspect,
│   │       │                       train-export, serve
│   │       ├── provider.ts         Q3M / Grok / OpenAI from env
│   │       └── prompts.ts          loads reference/prompts/
│   └── web/                        vanilla static demo UI
│       ├── index.html
│       ├── style.css
│       └── app.js
├── reference/
│   ├── ts/                         TypeScript reference library
│   │   └── src/                    types, format, 6 pipeline stages,
│   │                               OpenAI-compatible providers
│   └── prompts/
│       ├── crystallize-system.md
│       ├── topologize-system.md
│       └── instruction-template.md
└── tests/
    └── smoke.test.mts              10 deterministic format tests
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

Apache License 2.0 — formal terms in [`LICENSE`](LICENSE), plain-English
summary in [`NOTICE.md`](NOTICE.md).

Short version:

- The **code** is Apache 2.0 — use, modify, redistribute, and ship inside
  closed-source products freely.
- The **`.ltmi` file format** is open — produce, store, exchange, sell,
  and fine-tune on `.ltmi` bundles without notification or fee.
- The **project name "LTMi-XT"** and the **file extension `.ltmi`** are
  SOPHIA XT marks. Informal references ("uses LTMi-XT", "`.ltmi`
  compatible") are fine; please don't ship a competing product *named*
  LTMi-XT without permission. See [`NOTICE.md`](NOTICE.md) for the
  trademark scope and four common use cases.

---

LTMi-XT is part of the **SOPHIA XT** model family · <https://sophiaxt.com/research/ltmi-xt>
