# `@sophiaxt/ltmi-xt` — reference implementation

LTMi-XT v0.1 in TypeScript. Apache 2.0.

This module ingests messy documentation, crystallizes it into atomic
self-contained statements, places each statement at a coordinate on a 64³
lattice keyed by hierarchical breadcrumbs, tags it with chronological
horizon + decay, and emits an open `.ltmi` artifact that retrieval and
fine-tune pipelines can both consume.

See `../../docs/paper.md` and `../../docs/file-format-spec.md` for the
architecture and format specification.

## Install (workspace-local)

```bash
cd reference/ts
npm install
npm run build
```

Node 20+ required (uses `crypto.createHash('blake2b512')` and ESM).

## Quick start

```ts
import {
  buildBundle,
  createQ3MProvider,
  serializeJsonl,
  retrieve,
} from "@sophiaxt/ltmi-xt";

import fs from "node:fs/promises";

const crystallizeSystem = await fs.readFile(
  "../prompts/crystallize-system.md", "utf8");
const topologizeSystem = await fs.readFile(
  "../prompts/topologize-system.md", "utf8");

const provider = createQ3MProvider({ apiKey: process.env.Q3M_API_KEY! });

const bundle = await buildBundle(
  [{ label: "manual.md", text: messyText }],
  {
    crystallizer: { provider, systemPrompt: crystallizeSystem },
    topologizer:  { provider, systemPrompt: topologizeSystem },
  }
);

await fs.writeFile("corpus.ltmi", serializeJsonl(bundle));

const result = await retrieve(
  "What are the cold-storage workflow failure modes?",
  {
    loci: bundle.loci,
    provider,
    systemPrompt: topologizeSystem,
  }
);

for (const r of result.results) {
  console.log(r.locus.breadcrumb.join(" > "), "-", r.locus.statement);
}
```

## Provider

Both Q3M (Inception Labs / Mercury) and xAI Grok 3 are supported with the
same OpenAI-compatible client. Override base URL or model with the factory
options.

## Public API

- `buildBundle(inputs, options)` — full pipeline from messy text to Bundle
- `serializeJsonl(bundle)` / `parseJsonl(text)` — `.ltmi` JSONL I/O
- `retrieve(query, opts)` — lattice-walk + scored ranking
- `touch(loci, ids)` — mark loci as referenced (drives consolidation)
- `locusToRow(locus)` / `toTrainingJsonl(loci)` — fine-tune ingestion
- `latticeCoord(breadcrumb)` — pure deterministic coordinate
- `createQ3MProvider({apiKey})` / `createGrokProvider({apiKey})`

## Determinism

- Locus ids are content-addressed (BLAKE2b-128 of canonical JSON).
- Source ids are content-addressed (BLAKE2b-128 of source bytes).
- Lattice coordinates are derived deterministically from breadcrumbs.
- Identical input produces identical output. Useful for golden tests.

## License

Apache 2.0. See repository `LICENSE`.
