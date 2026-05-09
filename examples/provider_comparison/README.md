# Provider Comparison — Mercury 2 Crystallization Benchmark

A reproducible benchmark of `mercury-2` (Inception Labs) on the LTMi-XT crystallization task across five diverse domains (operations, technical spec, business prose, medical, legal). Measures latency, token usage, throughput, and structural-output reliability.

## Run

```bash
node bench_mercury.mjs
```

Reads `INCEPTION_API_KEY` from `../../../.env` (or `SophiaXtPortal/.env`).

## Results — 2026-05-09

| Corpus | Length (chars) | Latency | Loci | Output tok/s | Total tokens | Parse rate |
|---|---:|---:|---:|---:|---:|---:|
| Operations memo | 284 | 1,450 ms | 5 | 133 | 795 | 100% |
| Architecture spec | 388 | 1,451 ms | 14 | 302 | 1,432 | 100% |
| Business memo | 332 | 1,237 ms | 9 | 286 | 1,321 | 100% |
| Medical reference | 345 | 1,070 ms | 5 | 284 | 1,022 | 100% |
| Legal contract | 352 | 847 ms | 5 | 222 | 822 | 100% |

### Aggregate

| Metric | Value |
|---|---:|
| Average latency | **1,211 ms** |
| Average throughput (output) | **250 tok/s** |
| Total loci across 5 inputs | 38 |
| Aggregate token usage | 5,392 (727 prompt + 3,154 reasoning + 1,511 completion) |
| **Structured-output parse rate** | **100% (every line valid JSONL)** |

### What this measures

- **Latency**: end-to-end wall-clock time from request to full response, including TCP/TLS, queue, model inference, and JSON serialization.
- **Throughput**: completion-token output rate. Excludes reasoning tokens (which Mercury 2 emits internally before the final structured response).
- **Parse rate**: fraction of model output lines that parse as valid JSON in the LTMi-XT locus shape `{breadcrumb, statement, kind}`. This is the strict structural correctness measure.

### Why this is useful

The LTMi-XT pipeline depends on the upstream LLM emitting strictly-formatted JSONL with no commentary, no markdown fences, no malformed lines. **Mercury 2 hits 100% across all five test domains.** That structural reliability — not just generative quality — is the property that makes a model viable as a crystallizer at scale.

The 1.2-second average latency and 250 tok/s throughput are also notable for a reasoning model. Mercury 2's masked-diffusion architecture allows parallel token generation, which produces output faster than autoregressive reasoning models typically achieve.

## What this benchmark does not do

- **Compare against other providers.** Adding GPT-4o-mini, Claude Haiku, and other reasoning models is on the roadmap; pull requests welcome. We've kept this Mercury-only to avoid maintaining six API accounts.
- **Stress-test parallel concurrent requests.** Real production workloads issue many crystallizations concurrently; latency under load is not measured here.
- **Test very long inputs.** All five inputs are under 400 characters. Longer documents (8 KB–32 KB) will produce more loci and may exhibit different latency characteristics.

## Reproducibility

The script is fully self-contained — manual `.env` parsing, no external dependencies beyond Node.js's built-in `fs` and `fetch`. Re-runs against the live Inception Labs API will produce different exact token counts (Mercury 2 is non-deterministic at temperature > 0) but should land within ±15% of the aggregates above.

---

*SOPHIA XT LLC · 2026-05-09 · part of the [LTMi-XT v0.1 evaluation suite](../../docs/benchmarks-v0.1.md)*
