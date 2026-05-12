# Changelog

All notable changes to LTMi-XT are documented in this file.

The file format itself follows semantic versioning. The reference TypeScript
implementation tracks the format version. Patch revisions (e.g., 0.3.1)
amend documentation and empirical findings without changing the format.

## [0.3.1] — 2026-05-12

### Reframed (file format unchanged)

- **`lattice` field semantics.** Reframed from "model-conditioning signal"
  (v0.1 framing) to "per-locus deterministic identifier." The bytes on
  disk are unchanged; downstream consumers should NOT assume the lattice
  coord carries semantic information their model will exploit. See
  [`docs/empirical-findings-2026-05-12.md`](docs/empirical-findings-2026-05-12.md)
  for the three-way ablation (BLAKE2b / PCA-3D / uniform-random per-locus)
  that drove this reframing.

### Added

- `latticeRandomPerLocus(locusId, dim, seed)` in `reference/ts/src/format/lattice.ts`
  — uniform-random per-locus 3D coord, deterministic by (locusId, seed).
  The negative-control coord scheme used in the 2026-05-12 ablation;
  shipped as a primitive for downstream labs that want to replicate.
- `multiResolutionCoord(coord, fineDim)` — decomposes a fine-grained 3D
  coord into coarse/medium/fine levels (4³ / 16³ / 64³ by default).
  Useful for visualization and multi-scale consumers.
- Both helpers exported from `index.ts` with a `MultiResCoord` type.
- 2 smoke tests for the new helpers (determinism, in-range, math correctness).
- `docs/empirical-findings-2026-05-12.md` — full ablation results,
  Mercury 2 adversarial review, and v0.4 pre-registered remediation plan.

### Updated

- `docs/file-format-spec.md` — title bumped to v0.3.1; added §0 amendment
  summary at the top.
- `reference/ts/src/format/lattice.ts` — header comment block updated
  with EMPIRICAL STATUS section noting recommended vs not-recommended uses.
- `docs/paper.md` §12 — roadmap rewritten to reflect v0.4 conditioning
  redesign (attention-bias direction + V1-V6 LoRA remediation experiment).

### Walked back

- v0.3's recommendation that PCA-3D be the new default coord scheme.
  Today's downstream-perplexity test (paired bootstrap, n=36, 4 metrics)
  shows PCA-3D and BLAKE2b are statistically indistinguishable. BLAKE2b
  is restored as the recommended default for the T2 use case (zero
  encoder dependency, zero basis-file shipping).

## [0.2.0] — 2026-05-11

### Updated

- Two-role separation for the lattice field clarified: Role A (retrieval
  index) deprecated in favor of TF-IDF cosine; Role B (model-conditioning
  tag) retained. See `docs/file-format-spec.md` §0 v0.2 amendment.

## [0.1.0] — 2026-05-08

### Added

- Initial open release of the LTMi-XT format and reference TypeScript
  implementation. Pipeline stages: crystallize → topologize → chronologize
  → index. Apache 2.0 license on code, CC BY 4.0 on spec.
- Reference CLI under `apps/cli/`.
- File format spec `docs/file-format-spec.md`.
- Paper `docs/paper.md`.
- Benchmarks `docs/benchmarks-v0.1.md`.
