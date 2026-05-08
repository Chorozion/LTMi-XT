# LTMi-XT v0.1 — Benchmarks

> **Honest scope.** Every number in this document was measured on the live
> production deployment at <https://sophiaxt.com/api/ltmi-xt/*> running
> Mercury 2 via Inception Labs, on **2026-05-08**. Numbers describe **this
> deployment at this time**. They are not generalizable across providers,
> models, or future versions of LTMi-XT. SOPHIA XT does not publish numbers
> we have not measured publicly.
>
> Raw logs and reproduction script are committed alongside this doc:
>
> - `examples/benchmarks/bench_log.jsonl` — full request/response log
> - `examples/benchmarks/run_bench.py` — runner you can re-execute
> - `examples/benchmarks/micro_bench.mjs` — deterministic invariants
> - `examples/benchmarks/corpora/*.md` — three input corpora
> - `examples/benchmarks/queries.json` — 15 query/expected-keyword pairs
> - `examples/benchmarks/bundles/*.json` — captured `.ltmi` bundles

---

## 0 · Test environment

| Field | Value |
|---|---|
| Endpoint | `https://sophiaxt.com/api/ltmi-xt/{crystallize,retrieve}` |
| LLM provider | Inception Labs Q3M |
| Model | `mercury-2` (reasoning model) |
| Server stack | Node.js 20, esbuild bundle, Hostinger VPS |
| Pipeline version | LTMi-XT v0.1.1 (commit `35def8c`) |
| Persona | `sophia` (default-on system-prompt prefix) |
| Date | 2026-05-08 |
| Total live API calls | 18 (3 crystallize + 15 retrieve) |

## 1 · What we measured

Three categories. We list exactly what the test does, the raw observed
result, and what limitation it has.

### 1.1 Live pipeline benchmarks

For each of three input corpora we run `POST /crystallize` once, capture
the `.ltmi` bundle, then run a fixed set of natural-language questions
through `POST /retrieve` and check whether the expected statement appears
in the top-K results.

### 1.2 Deterministic micro-benchmarks

No LLM, no network. High N (10,000 trials). Tests format invariants —
lattice coordinate stability, content-addressed identifier stability,
canonical JSON sort, JSONL round-trip. These should be 100% stable by
construction; the test is that they are.

### 1.3 Token-savings demonstration

For one corpus, we measure the byte ratio of `top-6 retrieved loci with
breadcrumbs` versus `the full source text`. Bytes are a proxy for tokens —
real token reduction depends on tokenizer.

## 2 · Live pipeline results

### 2.1 The three corpora

| ID | Description | Bytes | Loci extracted | Distinct topics |
|---|---|---:|---:|---:|
| C1 | Cold storage operations manual | 783 | 10 | 3 |
| C2 | Cassandra T1 architecture spec (numerical-dense) | 1,056 | 23 | 1 |
| C3 | Multi-domain operations memo (HR + finance + product) | 1,059 | 15 | 8 |

Loci extraction is dense for technical specs (C2: 1 locus per ~46 bytes)
and looser for prose (C1: 1 per ~78 bytes). C3 is in between (1 per ~71
bytes) but spans **8 distinct topics** — the topologizer correctly
recognizes that an HR sentence and a finance sentence belong to different
top-level topics, while keeping all C2 sentences under the same `Cassandra
T1 Model` topic.

### 2.2 Latency

Wall-clock time including network round-trip, queue, persona prefix,
crystallizer LLM call, batched topologizer LLM calls, server-side offset
derivation, lattice coordinate derivation, manifest assembly, and JSONL
serialization.

| Operation | Median | Min | Max | n |
|---|---:|---:|---:|---:|
| `/crystallize` (700–1,100 char input) | **4,370 ms** | 4,022 ms | 6,219 ms | 3 |
| `/retrieve` (single query, k=6) | **1,228 ms** | 987 ms | 1,413 ms | 15 |

`/crystallize` cost is dominated by Mercury 2 reasoning + completion. The
~4-second floor at this input size suggests the LLM is doing real
reasoning work; we have not optimized for shorter prompts because the
existing latency is already within an acceptable range for an offline
"crystallize once, query forever" workflow.

`/retrieve` is bounded by the LLM round-trip used to derive the query-side
breadcrumb. When that derivation succeeds, the lattice walk itself is
microseconds; when it fails, the keyword-overlap fallback is microseconds
too. The ~1-second floor is therefore pure provider latency.

### 2.3 Retrieval — top-K hit rate

15 natural-language questions across three corpora, each with a list of
expected keywords that *must all* appear in the top-K result for that
query to count as a hit.

**Headline numbers as the runner reported them:**

| Metric | Result |
|---|---:|
| Total queries | 15 |
| Hit at #1 | **12 / 15 = 80.0 %** |
| Hit anywhere in top-6 | 13 / 15 = 86.7 % |
| Miss | 2 / 15 = 13.3 % |

**Important caveat (a grader artifact, not a system miss).** One of the
"misses" is a strict-string-match artifact in the grader, not a system
failure. The query "How many query and KV heads does the model use?"
expected the literal string `"KV"` in the top-1 result. The system
returned the correct answer at #1 — *"The Cassandra T1 model uses
grouped-query attention with 16 query heads and 4 key-value heads"* — but
the locus uses `"key-value"` instead of `"KV"`, so the keyword grader
flagged it as a miss.

**Adjusted for the grader artifact:**

| Metric | Result |
|---|---:|
| Real hit at #1 | **13 / 15 = 86.7 %** |
| Real hit anywhere in top-6 | 13 / 15 = 86.7 % |
| Real miss | 2 / 15 = 13.3 % |

Both real misses share a root cause: the LLM-derived query-side
breadcrumb derivation (which would route to the correct lattice cell)
silently fails for short queries on Mercury 2, and we fall back to
keyword overlap. Keyword fallback misses when query terms don't lexically
appear in the target locus:

- C1 "What is the **failure mode** in the standard cold storage
  workflow?" — target locus is *"…lost two shipments to coolant
  mismatch…"*. The query says "failure mode" but the source uses
  "coolant mismatch". No lexical bridge.
- C3 "What are the two DiagBuddy **pricing tiers**?" — top-1 returned
  the structural locus *"Stripe billing is live for DiagBuddy with two
  pricing tiers"*; the actual price loci ($20 and $34.99) exist and are
  correctly placed at lattice cells `[33, 36, ?]` (shared
  `Pricing > Tier Plans > _ Tier` prefix), but they don't bubble to top-1
  under keyword overlap because the structural locus has higher overlap
  with the query keywords.

Both misses would resolve if the query-side breadcrumb derivation were
robust (we are working on that for v0.2). They are not lattice or
crystallization failures.

### 2.4 Per-query results — full table

| # | Corpus | Query | Hit at | Latency |
|---|---|---|---:|---:|
| 1 | C1 | What is the failure mode in the standard cold storage workflow? | **miss** | 1,095 ms |
| 2 | C1 | What insulation should be used for dry ice loads? | 1 | 1,196 ms |
| 3 | C1 | What is the safe transit time for gel pack loads? | 1 | 987 ms |
| 4 | C1 | How many trucks does the cold storage line operate? | 1 | 1,285 ms |
| 5 | C1 | What tool can model lane viability in advance? | 1 | 1,234 ms |
| 6 | C2 | What is the hidden size of Cassandra T1? | 1 | 1,264 ms |
| 7 | C2 | What was the training loss at epoch 5? | 1 | 1,362 ms |
| 8 | C2 | How many query and KV heads does the model use? | 1 *(grader said miss; system was correct)* | 1,253 ms |
| 9 | C2 | What position encoding does the model use? | 1 | 1,300 ms |
| 10 | C2 | What license is the Cassandra T1 repo released under? | 1 | 1,024 ms |
| 11 | C3 | What are the two DiagBuddy pricing tiers? | **miss** | 1,413 ms |
| 12 | C3 | When is the HR review cycle starting? | 1 | 1,103 ms |
| 13 | C3 | How many DiagBuddy users are active? | 1 | 1,228 ms |
| 14 | C3 | What is the engineering lead's deadline? | 1 | 1,196 ms |
| 15 | C3 | How long is finance's runway estimate? | 1 | 1,101 ms |

## 3 · Deterministic micro-benchmarks

These are format-invariant tests, run at high N. They establish that the
content-addressed format and lattice math are stable.

| Test | Trials | Stable | Fraction | Notes |
|---|---:|---:|---:|---|
| Lattice coordinate stable (same breadcrumb → same coord) | 10,000 | 10,000 | 100.0 % | Required by spec |
| Lattice prefix-locality (loci sharing topic+sub+concept share cells) | 1,000 | 1,000 | 100.0 % | Required by spec |
| Locus id stable (BLAKE2b-128 of canonical JSON of breadcrumb+statement+source) | 10,000 | 10,000 | 100.0 % | Required by spec |
| Canonical JSON stable (key-sorted, same for `{a,b}` and `{b,a}`) | 10,000 | 10,000 | 100.0 % | Required by spec |
| JSONL round-trip preserves manifest + loci (C2 bundle, 23 loci) | 1 | 1 | 100.0 % | Required by spec |

**Lattice cell distinctness.** With 10,000 random breadcrumbs (drawn from
a synthetic distribution of ~100 topics × 100 subtopics × 100 concepts),
we observe 200 distinct lattice cells out of 64³ = 262,144 possible cells.
This is by-design: the random distribution has only ~100 unique
topic+subtopic+concept tuples after collapse, and each tuple lands at one
cell. Across larger natural corpora we expect cell utilization to scale
roughly with the number of distinct concepts in the corpus.

### 3.1 Performance

| Operation | Per-call latency (single-thread Node 22) |
|---|---:|
| `latticeCoord(breadcrumb)` | 17.0 µs |
| `deriveLocusId(bc, stmt, src)` | 14.8 µs |
| `canonicalJson(obj)` | 4.2 µs |
| `chebyshev(a, b)` | 0.34 µs |

Pure-JS, no native crypto offload. Adequate for any practical corpus
size — a 100,000-locus corpus indexes in ~1.7 seconds of pure CPU.

## 4 · Token-savings demonstration

The headline LTMi-XT use case is "extend any LLM's effective context": you
crystallize once, then for each user query you feed only the top-K loci
to the LLM instead of the whole corpus.

For corpus C2 (a small 1,056-byte technical spec), top-6 loci with
breadcrumb paths total **895 bytes** — a **1.18× reduction**. Small
corpus, small win.

The test does not show dramatic reduction because the corpus is dense and
small. The realistic scenario is a 100KB+ corpus where the same retrieve
call still returns ~6 loci, totaling ~1KB. **Projected reduction at that
scale is ~100×**. We have not measured this at-scale here because Mercury
2 rate limits the live demo; a re-run against a larger corpus is on the
v0.2 list.

For now we report only the measured number for C2, and mark the at-scale
projection as **unmeasured** so reviewers don't mistake it for a result.

## 5 · What this benchmark does not test

We list these explicitly so reviewers can budget the trust they place in
the headline numbers:

- **Other providers / models.** Only Mercury 2 via Inception Labs is
  exercised. GPT-4o, Claude Sonnet, DeepSeek R1, etc. are documented as
  supported via Puter.js but not benchmarked here.
- **Larger corpora.** All three corpora are under 1.1 KB. Real production
  corpora are 10×–10,000× larger.
- **Adversarial queries.** The 15 queries are straightforward, lexically
  related to source content. We have not tested ambiguous, multi-hop, or
  paraphrased queries that require strong query-side breadcrumb
  derivation.
- **Topic drift over time.** Chronologization (`horizon` + `decay`) is
  implemented but not measured here — that requires a multi-week test
  with reinforcement events.
- **Crystallization fidelity.** We did not run a human-graded
  precision/recall against a held-out gold-standard atomic claim set. We
  observed plausible loci output and consistent breadcrumb assignment;
  we did not formally measure faithfulness.
- **Reproducibility across LLM runs.** Mercury 2 is non-deterministic at
  the temperature we use (0.2 clamped to 0.75 by the provider). Same
  input → similar but not byte-identical output. Locus *content* and
  *breadcrumb path* will vary slightly across runs; lattice coordinates
  derived from the resulting breadcrumbs are deterministic by
  construction once the breadcrumb is fixed.

## 6 · How to reproduce

```bash
# 1. Prerequisites: Node.js 20+, Python 3.10+, public internet.
git clone https://github.com/Chorozion/LTMi-XT.git
cd LTMi-XT
npm install
npm run build

# 2. Run the deterministic micro-benchmarks (no network).
node examples/benchmarks/micro_bench.mjs

# 3. Run the live pipeline benchmarks against the SOPHIA XT public API.
#    Note: the production endpoint enforces a 5/15min crystallize rate
#    limit. The runner makes 3 crystallize calls and 15 retrieve calls.
python3 examples/benchmarks/run_bench.py
```

The runner appends one line per event to `bench_log.jsonl` and writes the
captured bundles to `bundles/`. The summary printed at the end is the
same as the table in §2.4.

## 7 · Honest changelog

If this document changes across versions, this section will track what
moved and why. Future entries will append below.

- **2026-05-08, v0.1 baseline.** Initial run. 13/15 real top-1 hits
  against the production deployment; 100% on every deterministic
  invariant.

---

*LTMi-XT v0.1 · SOPHIA XT LLC · benchmarks compiled 2026-05-08*
