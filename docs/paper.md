# LTMi-XT: Layered Topological Memory Indexing — Extended Technology

A document-crystallization and lattice-indexed retrieval architecture for messy
documentation, optimized for hallucination-bounded retrieval and structured
fine-tune ingestion.

**Author:** Thomas Garren
**Affiliation:** SOPHIA XT LLC, St. Louis, MO
**Version:** 0.1 (draft, open release)
**License:** Apache 2.0
**Date:** 2026-05-08

---

## Abstract

LTMi-XT is an open-released pipeline and file format that ingests messy
documentation (technical manuals, internal wikis, support transcripts,
research notes, repair logs), **crystallizes** the prose into atomic
self-contained statements ("loci"), and places each locus at a coordinate on
a 64³ topological lattice. Each locus carries an explicit hierarchical
breadcrumb path (`Topic > Subtopic > Concept > Claim`), a chronological horizon
tag (short-term / long-term) with a decay weight, byte-offset provenance back
to source, and a confidence score.

The resulting `.ltmi` artifact is dual-purpose: it supports breadcrumb-anchored
retrieval (LLM answers are grounded to specific loci with full provenance
chains) and direct ingestion as fine-tune training rows. The lattice
coordinate is hash-derived from the breadcrumb path in v0.1, so structurally
similar loci cluster spatially without requiring a learned embedding step.

LTMi-XT extends prior atomic-fact retrieval work by adding (1) explicit
topological lattice positioning anchored to the classical method of loci,
(2) a dual-horizon memory model with consolidation rules drawn from episodic
/ semantic memory cognitive science, (3) byte-offset provenance with
inspectable reasoning chains, and (4) an open file-format spec designed for
fine-tune ingestion as a first-class use case.

This paper specifies the v0.1 architecture, the file format, the retrieval
algorithm, and the open reference implementation. We deliberately do not
publish benchmark numbers in v0.1; an evaluation plan is provided.

---

## 1 — Introduction

### 1.1 The horizon problem

Retrieval-Augmented Generation systems chunk documents into fixed-size
windows and embed each chunk for nearest-neighbor retrieval. This creates the
"horizon problem": context the LLM needs to interpret a chunk often falls
just outside the chunk's window. A pronoun like "it" or "this" inside a chunk
may refer to an entity defined two paragraphs earlier; a numeric value may
have been redefined in a later section the chunk does not see.

### 1.2 Atomic-fact retrieval

Prior work on **atomic-fact retrieval** ([Stakelum 2024]; [Lee et al. 2023];
arXiv 2305.13214) proposes splitting documents into self-contained atomic
statements where each statement carries enough internal context to stand
alone. This eliminates pronoun ambiguity and the horizon problem at the cost
of a heavier preprocessing pipeline.

LTMi-XT inherits this premise. It departs in three ways: (a) it adds an
explicit *topological* index over the resulting atomic units, (b) it
formalizes the data structure as an open file format suitable for both
retrieval and fine-tune ingestion, and (c) it models memory dynamics
(short-term decay vs long-term consolidation) explicitly rather than
treating all atoms as equally permanent.

### 1.3 Why a lattice

Classical mnemonic technique places to-be-remembered items at distinct loci
in an imagined spatial structure (the "method of loci" or memory palace).
Retrieval is performed by walking the structure rather than searching by
identity. Cognitive evidence suggests spatial organization is a strong
indexing strategy for ordered recall and provenance reconstruction.

We adopt this directly: every crystallized statement is a *locus*. The
lattice is a discrete 64³ topological cube. The lattice coordinate of a
locus is derived deterministically from the locus's breadcrumb path so that
loci with shared prefixes land in spatially adjacent cells. Retrieval is
breadcrumb-anchored lattice traversal followed by neighborhood expansion.

This builds on prior SOPHIA XT spatial-diffusion work (Sophia Q3M, the
Cassandra T1 PDE-lattice scheduler at github.com/Chorozion/Casandra-t1-
diffusion-edge-model), but is intentionally simpler in v0.1: hash-derived
coordinates, no learned embedding step, no diffusion inference.

### 1.4 Why a dual-purpose file format

The `.ltmi` artifact is the same artifact whether the downstream consumer is
a retrieval system or a fine-tune pipeline. This is a deliberate design
choice: we observed that operationally important documents are *both*
retrieved live (via RAG) and used as training data (via SFT or LoRA). Having
two pipelines that fork from a shared, structured representation is much
simpler than maintaining two parallel preprocessing toolchains.

---

## 2 — Related work

This is an applied integration paper rather than a novel-algorithm paper.
We position relative to four lines of prior work:

1. **Atomic-fact retrieval and graph fact synthesis** — Stakelum 2024;
   arXiv 2305.13214. We adopt the atomic-statement premise.
2. **Persistent / episodic memory in agent systems** — public agent-memory
   architectures and recent work on immutable memory chains (arXiv
   2506.13246). We adopt the persistence premise but use a content-addressed
   JSONL artifact rather than a blockchain.
3. **Spatial diffusion and lattice memory** — SOPHIA XT prior work on
   lattice-grounded spatial diffusion (Sophia Q3M, internal); the Cassandra
   T1 PDE-lattice scheduler (open release). We borrow the lattice substrate.
4. **Method of loci / memory palace** — classical mnemonic technique.
   Provides the conceptual frame for treating loci as spatial entities.

We do not claim algorithmic novelty over (1) or (2) individually. The
contribution is (a) the integration into a single open file format, (b)
explicit lattice positioning anchored to (4), and (c) the dual-purpose
retrieval-and-fine-tune ingestion design.

---

## 3 — System architecture

### 3.1 Pipeline

```
                                           ┌─────────────┐
                                           │ messy input │
                                           │ MD/TXT/PDF  │
                                           └──────┬──────┘
                                                  │
                                                  ▼
                                         ┌──────────────────┐
                                         │  CRYSTALLIZATION │  ← LLM call 1
                                         │  prose → loci    │
                                         └────────┬─────────┘
                                                  │
                                                  ▼
                                         ┌──────────────────┐
                                         │  TOPOLOGIZATION  │  ← LLM call 2
                                         │  breadcrumb +    │
                                         │  lattice coord   │
                                         └────────┬─────────┘
                                                  │
                                                  ▼
                                         ┌──────────────────┐
                                         │ CHRONOLOGIZATION │
                                         │  horizon + decay │
                                         └────────┬─────────┘
                                                  │
                                                  ▼
                                         ┌──────────────────┐
                                         │      INDEX       │
                                         │   write .ltmi    │
                                         └────────┬─────────┘
                                                  │
                              ┌───────────────────┼───────────────────┐
                              ▼                   ▼                   ▼
                       ┌─────────────┐    ┌──────────────┐    ┌──────────────┐
                       │  RETRIEVAL  │    │  FINE-TUNE   │    │  INSPECTION  │
                       │   (live)    │    │  ingestion   │    │  (audit)     │
                       └─────────────┘    └──────────────┘    └──────────────┘
```

### 3.2 Stage 1 — Crystallization

The crystallizer takes a slab of input prose and produces a stream of *loci*.
A locus is a JSON object with fields:

- `statement` — one self-contained sentence; pronouns resolved; references
  expanded; no compound claims.
- `kind` ∈ {`fact`, `definition`, `claim`, `example`, `instruction`,
  `opinion`, `uncertainty`}.
- `confidence` ∈ [0, 1] — the model's reported confidence in the
  faithfulness of the extraction (not the truth of the statement).
- `source_offset` — `[start, end]` byte offsets in the original input.

Crystallization is performed by a single LLM call per ~2KB slab with the
system prompt at `reference/prompts/crystallize-system.md`. The prompt
enforces the no-pronouns-no-compound-claims constraint and rejects
non-substantive sentences.

The crystallizer is **stateless across slabs** — long inputs are split into
overlapping windows so that pronoun antecedents are reachable by the model
within a single call.

### 3.3 Stage 2 — Topologization

A second LLM call assigns each locus its `breadcrumb` path:

```
breadcrumb: ["Topic", "Subtopic", "Concept", "Claim"]
```

The depth is normalized to four levels. Shorter natural paths are padded
right with `null`; longer paths are coalesced. The depth-4 budget keeps the
lattice coordinate derivation stable across corpora.

The lattice coordinate is then deterministic:

```
hash(breadcrumb) → seed → (x, y, z) ∈ [0, 63]³
```

We use BLAKE2b-128 truncated to 24 bits, three 8-bit slices for the three
axes. This guarantees:

1. The same breadcrumb path always lands at the same lattice cell across
   corpora.
2. Loci with shared prefixes are spatially close (because we hash each
   prefix level and combine, rather than hashing the full path as one
   string — see §6).

### 3.4 Stage 3 — Chronologization

Each locus receives:

- `horizon` ∈ {`short`, `long`} — initially `short` for any locus from a
  source with timestamp newer than 30 days. After a locus is referenced N
  times across queries (default N=3), it consolidates to `long`.
- `decay` ∈ [0, 1] — short-horizon loci fade by a configurable half-life
  (default 7 days) unless reinforced. Long-horizon loci have decay = 1.0
  (stable).
- `first_seen`, `last_referenced` — ISO-8601 timestamps.

This mirrors the episodic-to-semantic consolidation literature ([Tulving
1972]; [McClelland et al. 1995]) without claiming biological fidelity. It
serves a practical purpose: in operational settings, recently-added documents
should be heavily weighted while still in the "review" period, then
consolidate into stable long-term reference once they prove useful.

### 3.5 Stage 4 — Indexing

The indexer emits a `.ltmi` bundle (six files, see §4 for spec):

```
corpus.ltmi              — JSONL, one locus per line + manifest header
manifest.json            — version, source list, atom count, lattice dims
breadcrumb-tree.json     — hierarchical view, navigable
instruction.md           — model-facing usage instruction
provenance.csv           — source → byte-offsets → locus id
sources/                 — verbatim source texts, content-addressed
```

### 3.6 Stage 5 — Retrieval

Given a query Q, the retriever:

1. Calls the LLM to derive a query-side breadcrumb prefix (one LLM round-
   trip; cached aggressively per query).
2. Hashes the prefix to a query lattice cell `(qx, qy, qz)`.
3. Returns loci within a Chebyshev-distance-`r` neighborhood of the query
   cell, ranked by:

   ```
   score = α · (1 − chebyshev/r)
         + β · confidence
         + γ · decay
         + δ · breadcrumb_prefix_match_depth
   ```

   Default weights: α = 0.4, β = 0.2, γ = 0.1, δ = 0.3. The retriever
   returns the top-K loci with full breadcrumb paths and provenance.

4. Updates `last_referenced` and increments the reference counter, which
   may trigger consolidation to `long` horizon.

### 3.7 Stage 6 — Fine-tune ingestion

For SFT or LoRA, each locus becomes a training row of the form:

```
{
  "instruction": <task derived from breadcrumb path>,
  "input": <breadcrumb context>,
  "output": <statement>,
  "weight": <decay × confidence>
}
```

The `weight` field controls the per-example loss multiplier so that
high-confidence consolidated loci dominate training. The breadcrumb path
provides the task framing automatically — `["AI","Diffusion","Cassandra T1",
"Architecture"]` becomes a question like "What is Cassandra T1's
architecture?" — without manual instruction-tuning data.

---

## 4 — The .ltmi file format (v0.1)

See `docs/file-format-spec.md` for the formal specification. Summary:

- **Container**: JSONL.
- **First line**: `manifest` record.
- **Subsequent lines**: `locus` records.
- **No nested objects deeper than 2 levels** (parser-friendly).
- **All identifiers are content-addressed** (BLAKE2b-128 of canonical JSON).
- **All timestamps ISO-8601 UTC**.
- **Forward-compatible**: unknown fields are preserved by readers.

Example (truncated):

```jsonl
{"v":"ltmi/0.1","kind":"manifest","corpus_id":"abc123","sources":["s-001"],"loci":42,"lattice":{"dim":64,"shape":"cube"},"created":"2026-05-08T12:34:56Z"}
{"id":"a-001","breadcrumb":["AI","Diffusion Models","Masked Diffusion","Architecture"],"lattice":[12,38,7],"statement":"Cassandra T1 uses 28 transformer layers with a 2,048 hidden size.","kind":"fact","confidence":1.0,"horizon":"long","decay":1.0,"source":{"id":"s-001","offset":[1245,1308]},"first_seen":"2026-05-08","last_referenced":"2026-05-08"}
```

---

## 5 — Lattice topology and breadcrumb-derived coordinates

### 5.1 Why hash-derived

A learned embedding step (Sentence-Transformer or similar) would give
coordinates with semantic geometry: similar *meaning* at nearby cells. We
considered this and rejected it for v0.1 for three reasons:

1. **Determinism.** Hash-derived coordinates are reproducible across
   environments without model versioning.
2. **Inspectability.** A reader can trivially see *why* a locus landed where
   it did — just look at the breadcrumb. With a learned embedding, the
   geometry is opaque.
3. **No upstream model dependency.** The format is usable in environments
   without a sentence-embedding model.

### 5.2 Hierarchical hash

Naive `hash(full_path)` would scatter loci uniformly. We instead hash each
breadcrumb level cumulatively and combine:

```
h_topic     = blake2b(breadcrumb[0])
h_subtopic  = blake2b(breadcrumb[0:2])
h_concept   = blake2b(breadcrumb[0:3])
h_claim     = blake2b(breadcrumb[0:4])

x = h_topic[0]    & 63   # 0..63
y = h_subtopic[0] & 63
z = h_concept[0]  & 63
```

The `claim` level acts as a fine-grained tiebreaker for retrieval ranking
but is not part of the cell address — multiple claims share a cell when
their first three breadcrumb levels match.

This guarantees cell-locality for loci sharing the first three breadcrumb
levels, which is the property retrieval depends on.

### 5.3 Future: learned coordinates

v0.1 is the inspectable baseline. A future extension can keep the hash-
derived coordinate as a fallback while training a learned mapping
`breadcrumb → R^3` on a target corpus to maximize retrieval recall.

---

## 6 — Dual-horizon memory and decay

### 6.1 Motivation

Operational corpora have a bimodal age distribution: a tail of long-lived
canonical documents (the corporate playbook, product specs, regulatory
references) and a head of recent fast-moving content (last week's incidents,
yesterday's standup notes, today's customer ticket). A flat retrieval index
treats both equally, which over-weights stale fresh-content noise and
under-weights canonical references.

LTMi-XT distinguishes two horizons explicitly.

### 6.2 Short horizon

Loci with `horizon = "short"`:

- Initialized when source timestamp is within 30 days, OR when the source is
  flagged `transient = true` at ingest.
- Decay weight `decay = exp(-Δt / τ)` where `τ` is the half-life (default
  7 days) and `Δt` is days since last reference.
- Rule: every retrieval that returns a short-horizon locus increments its
  reference counter and refreshes `last_referenced`.

### 6.3 Long horizon

A short-horizon locus is **consolidated** to `horizon = "long"` when:

- Reference count ≥ 3 (default), OR
- Source is explicitly flagged `canonical = true`.

Long-horizon loci have `decay = 1.0` and do not fade.

### 6.4 Eviction

Short-horizon loci with `decay < 0.05` and zero references in the last 90
days are eligible for eviction in periodic compaction passes. Eviction
removes the locus from the index but leaves the source text in `sources/`
for re-crystallization if needed.

---

## 7 — Retrieval algorithm

```python
def retrieve(query: str, index: LtmiIndex, k: int = 8) -> list[Locus]:
    breadcrumb_q = derive_query_breadcrumb(query)        # LLM, cached
    cell_q       = lattice_coord(breadcrumb_q)
    candidates   = index.cells_within(cell_q, radius=4)  # Chebyshev

    scored = []
    for locus in candidates:
        d_lat   = chebyshev(locus.lattice, cell_q)
        d_pref  = breadcrumb_prefix_match(locus.breadcrumb, breadcrumb_q)
        score   = (
            0.4 * (1 - d_lat / 4) +
            0.2 * locus.confidence +
            0.1 * locus.decay +
            0.3 * (d_pref / 4)
        )
        scored.append((score, locus))

    top_k = nlargest(k, scored, key=lambda s: s[0])
    for _, locus in top_k:
        index.touch(locus.id)                             # increment ref
    return [locus for _, locus in top_k]
```

Returned loci are presented with their full breadcrumb path so the consuming
LLM has explicit hierarchical context, not just a chunk.

---

## 8 — Fine-tune ingestion

A second consumer view of the `.ltmi` artifact converts loci to training
rows (Stage 6 above). The conversion is deterministic and lossless — given
the same `.ltmi`, two runs of the converter produce byte-identical training
data.

Default conversion:

```
Locus → Training Row
{
  "instruction":   "Provide the {breadcrumb[2]} of {breadcrumb[1]}: " +
                   "{breadcrumb[3]}.",
  "input":         "Topic: " + breadcrumb[0] + "\n" +
                   "Subtopic: " + breadcrumb[1] + "\n" +
                   "Concept: " + breadcrumb[2],
  "output":        statement,
  "weight":        decay * confidence,
  "tags":          { "horizon": horizon, "kind": kind }
}
```

The `weight` field is honored by training loops that support per-example
weighting (e.g., HuggingFace TRL with custom data collators). Without
support, it is informational only.

---

## 9 — Reference implementation

The open repo at `github.com/Chorozion/LTMi-XT` ships:

- `reference/ts/` — TypeScript reference implementation, runnable on
  Node.js 20+, with no GPU dependencies.
- `reference/prompts/` — the system prompts for crystallization and
  topologization (we publish them; they are short).
- `examples/` — a sample messy input plus the resulting `.ltmi` bundle, so
  reviewers can verify the pipeline end-to-end without running it.
- `tests/golden/` — deterministic golden corpora for regression testing.

The reference implementation calls out to a Q3M (Mercury) endpoint by
default, with a Grok 3 fallback configurable through environment variables.
Both are pluggable; any chat-completion provider with a tool-call or JSON-
mode interface should work.

---

## 10 — Evaluation plan

We deliberately publish v0.1 without benchmark numbers. SOPHIA XT does not
publish numbers it has not measured publicly. Planned evaluations:

### 10.1 Crystallization fidelity

Given a held-out corpus and a human-annotated set of atomic claims, measure
precision/recall of crystallizer output against the human gold standard.
Report per-`kind` breakdown (facts vs claims vs definitions etc.).

### 10.2 Retrieval recall

For a held-out QA set with provenance-level ground truth (which loci are
needed to answer each question), measure recall@K and provenance precision.
Compare against:

- Flat dense retrieval (all-MiniLM embeddings)
- Atomic-fact retrieval without lattice
- Full LTMi-XT pipeline

### 10.3 Citation accuracy

Measure how often a downstream LLM, given retrieved loci with breadcrumbs
and provenance, produces citations the loci actually support. This is the
hallucination metric we care about.

### 10.4 Fine-tune yield

Train a small adapter on the same corpus using (a) raw chunk SFT and (b)
LTMi-XT-derived training rows. Compare on a held-out QA set the adapter
should now answer.

---

## 11 — Limitations

- **v0.1 is not benchmarked publicly yet.** Section 10 is a plan, not a
  result.
- **Hash-derived coordinates have no semantic geometry.** Two loci about
  the same concept but filed under different breadcrumb paths land far
  apart. This is the trade-off for inspectability and determinism.
- **Two LLM calls per slab.** Crystallization + topologization. Mitigated
  by aggressive caching and batching, but a non-trivial cost on large
  corpora.
- **Lattice radius is fixed.** A more sophisticated retriever would expand
  radius adaptively.
- **English-only in v0.1.** Multilingual breadcrumb hashing is consistent
  but the crystallization prompt is English-only.
- **Confidence scores are model-reported, not calibrated.** A future
  release can calibrate against held-out human judgments.

---

## 12 — Roadmap

- **v0.2**: learned breadcrumb-to-coordinate mapping (optional, falls back
  to hash). Adaptive lattice radius. Multilingual crystallizer.
- **v0.3**: incremental indexing (add documents to an existing `.ltmi`
  without re-running the full pipeline).
- **v0.4**: hosted reference service with rate-limited free tier.
- **v0.5**: integration with the SOPHIA XT Cassandra T1 inference path —
  loci as conditioning tokens for masked-diffusion generation.
- **v1.0**: published evaluation results across at least three corpora,
  including operational service-business documentation.

---

## 13 — License

The reference implementation, file-format specification, prompts, and this
paper are released under the **Apache License 2.0**. The `.ltmi` file
format is open; users may produce, store, and exchange `.ltmi` artifacts
without notifying or paying SOPHIA XT.

The format extension `.ltmi` and the acronym **LTMi-XT** are SOPHIA XT
trademarks; informal use is unrestricted, but commercial product names
should not collide.

---

## References

- arXiv 2305.13214 — "Atomic Inference for NLI with Generated Facts as
  Atoms" (atomic-fact framing).
- arXiv 2506.13246 — "On Immutable Memory Systems for Artificial Agents"
  (persistent memory framing).
- arXiv 2512.12818 — "Hindsight: Structured Memory in Agent AI" (agent
  memory architecture).
- Tulving, E. (1972). "Episodic and semantic memory." Organization of
  Memory.
- McClelland, J. L., McNaughton, B. L., & O'Reilly, R. C. (1995). "Why
  there are complementary learning systems in the hippocampus and
  neocortex." Psychological Review, 102(3).
- Yates, F. A. (1966). "The Art of Memory" (method of loci).
- SOPHIA XT (2026). "Cassandra T1 — Open masked-diffusion edge model."
  github.com/Chorozion/Casandra-t1-diffusion-edge-model.

---

*LTMi-XT v0.1 · SOPHIA XT LLC · St. Louis, MO · 2026-05-08*
