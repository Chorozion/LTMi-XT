# LTMi-XT v0.3.1 — Empirical Findings (2026-05-12)

**Status:** Open draft, public release
**Editor:** Thomas Garren · SOPHIA XT LLC
**License:** Apache 2.0
**Predecessor:** `file-format-spec.md` (v0.1, 2026-05-08)

This document records the empirical walk-back and corrected findings on the
LTMi-XT lattice channel based on rigorous ablation work conducted today.

## Headline

**The 3D lattice coordinate channel, as consumed by triple-attention path 3
in our Cassandra T2 reference implementation, is empirically content-free.**
Three coord schemes — BLAKE2b (legacy default), PCA-3D (proposed v0.3 default,
walked back), and uniform-random per-locus — produce statistically
indistinguishable downstream behavior on held-out forced-anchor evaluation.

This does not invalidate the LTMi-XT format. It invalidates the specific
implementation of `attention_use_ltmi_priors=True` we shipped in v0.1. The
file format itself (locus + breadcrumb + statement + provenance + lattice +
horizon + confidence) remains useful as a retrieval-grounded training data
schema; the lattice field becomes a per-locus deterministic identifier
rather than a semantic conditioning signal.

## Methodology

### Three-way coord scheme ablation

Identical Cassandra T2 architecture, identical training data (C1/C2/C3
bundles, 144 (Q, A, locus) triples), identical warm-start from v1.5,
identical optimizer, identical 500-step continued-pretrain schedule.
Only the lattice coord assignment per locus differs:

| Arm | Coord scheme |
|---|---|
| v2_ltmi_triple | BLAKE2b digest of breadcrumb prefix (LTMi-XT v0.1 §2.4) |
| v2_5_pca | PCA-3D of frozen-encoder embeddings, fit on training corpus, quantized to 64³ |
| v2_5_random | Uniform-random per-locus from {0..63}³, deterministic seed=0xC0FFEE |

### Evaluation

Paired-by-query bootstrap (n_boot=2000) on n=36 held-out (corpus, query)
pairs across C5/C6/C7 (medical, legal, cooking). Both forced-anchor and
unforced decoding. Metrics: corpus_overlap, english_ratio,
anchor_preservation.

### Results

**v2_5_pca vs v2_ltmi_triple (BLAKE2b):**

| Metric | Point | 95% CI | p>0 | Differs CI-sig? |
|---|---|---|---|---|
| forced corpus_overlap | −0.002 | [−0.034, +0.029] | 0.47 | no |
| forced english_ratio | +0.011 | [−0.012, +0.033] | 0.84 | no |
| unforced corpus_overlap | exactly 0 | [0.000, 0.000] | — | no |
| unforced english_ratio | exactly 0 | [0.000, 0.000] | — | no |

**v2_5_random vs v2_ltmi_triple (BLAKE2b):**

| Metric | Point | 95% CI | p>0 | Differs CI-sig? |
|---|---|---|---|---|
| forced corpus_overlap | −0.016 | [−0.054, +0.022] | 0.20 | no |
| forced english_ratio | −0.013 | [−0.044, +0.016] | 0.20 | no |
| unforced corpus_overlap | exactly 0 | [0.000, 0.000] | — | no |
| unforced english_ratio | exactly 0 | [0.000, 0.000] | — | no |

**Critically**, all three arms' training loss curves landed at byte-identical
`recent_avg=0.2834`. Unforced inference is byte-identical between random and
BLAKE2b arms (CI [0.0000, 0.0000]) — the trained weights are functionally
the same. The lattice channel did not affect training gradients enough to
change the model between arms.

## Mercury 2 adversarial review

The Mercury 2 masked-diffusion model was given the full architecture audit
including the three-way ablation. Its substantive critiques:

1. **n=36 too small.** The underlying v2_ltmi_triple − v1.5 forced
   corpus_overlap effect bounces between +0.058 and +0.038 across
   identically-seeded eval sessions (~0.02 noise floor from torch/CUDA
   float16 non-determinism). For ±0.02 nats CI half-width, need n≥200
   documents. (We have since expanded to n=172 for next round.)

2. **Lattice channel cannot be reactive.** As implemented in v0.1
   (additive embedding sum into Path-3 K, scalar gate at 0.0-0.1), the
   gradient path through the channel is too weak to make it useful.
   Either redesign as attention bias (direction D1 in audit) or retire.

3. **Prior art was missed.** Xu/Alon ICML 2023 (kNN-LM output-side
   dominance) and Doostmohammadi ACL 2023 already documented this type
   of partial-attribution failure mode for retrieval-conditioned
   architectures. The lab's contribution remains the anchor-mask +
   triple-attention decomposition; the lattice claim was over-extended.

## What v0.3.1 specifies

### Default coord scheme: BLAKE2b (legacy retained)

The v0.1 §2.4 BLAKE2b derivation continues to be the recommended
default. Reason: empirically equivalent to PCA-3D and random on
downstream metrics, with zero encoder dependency, zero basis-file
shipping, fully deterministic from breadcrumb alone.

### Optional coord schemes (use case dependent)

- **PCA-3D** is documented as a valid alternative for visualization,
  hierarchical retrieval-by-coord-similarity, and topic-clustering
  analysis. It wins on coord-space topic geometry (96.7% 1-NN topic
  accuracy vs BLAKE2b 21.7%) but this geometric advantage does NOT
  translate to perplexity gains in our reference T2 setup. Use PCA-3D
  if your downstream consumer needs semantic neighborhood structure
  in coord space.
- **Random per-locus** is a valid coord scheme if all you need is a
  deterministic ID per locus. It is functionally equivalent to BLAKE2b
  for the conditioning use case.

### The lattice field is a tag, not a signal

The `lattice` field on every locus continues to be REQUIRED per v0.1
§2.4 (for format compatibility), but its semantic interpretation is
amended:

> The lattice coordinate is a deterministic per-locus identifier
> derivable from the breadcrumb. It is NOT a semantic conditioning
> signal in the v0.1 reference implementation
> (`attention_use_ltmi_priors=True`). Implementations may choose any
> coord scheme that is deterministic per locus; semantic-clustering
> coord schemes (PCA-3D) do not provide downstream advantage over
> hash-based schemes (BLAKE2b) in the reference Cassandra T2 setup.

### Two-role separation (retained from v0.2)

The clarification from v0.2 stands:

- **Role A (retrieval index):** use TF-IDF cosine (or another classical
  IR primitive). Lattice-NN retrieval is NOT recommended.
- **Role B (conditioning tag):** the lattice field carries deterministic
  per-locus identity. Per today's findings, this role is empirically
  non-load-bearing at our scale and architecture; redesign needed to
  give the channel an actual gradient path.

## What v0.4 may specify

A working group is investigating mechanisms to give the lattice channel
a gradient path:

- **Lattice-as-attention-bias** (D1 from the architecture audit). Make
  the coord enter attention SCORES rather than K vectors. Established
  prior art: ALiBi (Press 2022), T5 relative position bias (Raffel 2020).
- **Learned MLP projection** on coords + multi-resolution embeddings.
- **Aux contrastive loss** forcing lattice-conditioned logits to differ
  from unconditioned at locked positions.
- **Gate temperature annealing** to force the path-mix gate to commit.

These are being tested under a pre-registered protocol (V1-V6 LoRA
variants × 3 seeds, n=172 paired bootstrap, PASS = ≥2 of 4 metrics
CI-sig improvement with consistent sign across seeds). Verdict
expected mid-May 2026. If no variant passes, v0.4 will formally
deprecate the `attention_use_ltmi_priors` interface.

## Citations

This finding is corroborated by published prior art on retrieval-grounded
LMs:

- Xu & Alon (ICML 2023) — kNN-LM output-side dominance
- Doostmohammadi et al. (ACL 2023) — BM25 ≥ dense retrieval at small scale
- Cuconasu et al. (SIGIR 2024) — Power of Noise; retrieval signal can be
  near-random without harm
- Pang et al. (ACL 2024) — Anchor-based LLMs; anchor-conditioning works
  primarily via direct token presence, not lattice geometry

## Lab live feed cards documenting this finding

- `1778600451549-t5ja` — PCA-3D null result
- `1778604866975-ugrn` — Mercury 2 adversarial review
- `1778605934535-8oo6` — Random-coord ablation conclusive
- `1778609096104-1hjr` — V1-V6 pre-registered remediation test plan

Posted to `sophiaxt.com/lab/live` thread `cassandra-foundation-design`.

## Reference implementation

- `lens-xt` Python library (Apache 2.0): https://github.com/Chorozion/lens-xt
- `cassandra-eval` harness (working repo, not yet public): per-arm training
  + paired-bootstrap analysis scripts at `runner/`
