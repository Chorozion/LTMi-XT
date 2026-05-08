# LTMi-XT File Format Specification (v0.1)

**Status:** Draft, open
**Last updated:** 2026-05-08
**Editor:** Thomas Garren · SOPHIA XT LLC
**License:** Apache 2.0

---

## 1 — Overview

An **`.ltmi` bundle** is a directory containing a JSONL primary file plus
several companion artifacts. The bundle is the on-disk form of a LTMi-XT
crystallized corpus. It is produced by the LTMi-XT pipeline and consumed
by retrievers, fine-tune ingesters, and human inspectors.

### 1.1 Design goals

1. **Plain JSONL.** No proprietary container. Every tool already speaks it.
2. **Inspectable.** A human reading the file can understand every field.
3. **Forward-compatible.** Unknown fields are preserved by readers.
4. **Content-addressed.** Locus and source identifiers are deterministic
   hashes of canonical content; identical input always produces identical
   identifiers.
5. **Streaming-friendly.** Producers can emit one locus at a time; consumers
   can process the file with a single linear pass.
6. **Dual-use.** Same file serves retrieval consumers and fine-tune
   pipelines without conversion.

### 1.2 Bundle layout

```
my-corpus.ltmi/
├── corpus.ltmi              ← primary JSONL (manifest + loci)
├── manifest.json            ← duplicate of the manifest line, for fast read
├── breadcrumb-tree.json     ← navigable hierarchical view
├── instruction.md           ← model-facing usage instruction
├── provenance.csv           ← tabular source → offsets → locus map
└── sources/                 ← verbatim source texts, content-addressed
    ├── s-001.txt
    ├── s-002.txt
    └── ...
```

A producer MAY emit only `corpus.ltmi` for compact transport; the other
files MUST be reproducible from `corpus.ltmi` alone.

The directory MAY be packaged as a `.tar.gz` or `.zip` for transport. The
recommended file extension for the archive is `.ltmi.tar.gz`.

---

## 2 — `corpus.ltmi` — the JSONL primary

### 2.1 Container rules

- Encoding: UTF-8.
- Line separator: `\n` (LF). CRLF MUST NOT be used.
- One JSON object per line. No multi-line objects.
- The first line MUST be a `manifest` record (§3).
- All subsequent lines MUST be `locus` records (§4) until end of file.
- Trailing blank lines are not permitted.

### 2.2 Common field types

- **Identifiers**: lowercase hex string of a 128-bit BLAKE2b hash, prefixed
  with type. Locus ids are `a-` (atom — a single locus); sources are `s-`;
  corpora are `c-`. Example: `a-7f2c4d6e8a1b3c5d`.
- **Timestamps**: ISO-8601 UTC with `Z` suffix. Example:
  `2026-05-08T12:34:56Z`.
- **Lattice coordinates**: 3-tuple of integers in `[0, 63]`.
- **Confidence / decay**: floats in `[0.0, 1.0]`.

---

## 3 — `manifest` record

The first line of `corpus.ltmi`.

### 3.1 Required fields

| Field | Type | Description |
|---|---|---|
| `v` | string | Format version. MUST be `"ltmi/0.1"` for this spec. |
| `kind` | string | MUST be `"manifest"`. |
| `corpus_id` | string | Content-addressed corpus id (`c-…`). |
| `loci` | integer | Number of locus records that follow. |
| `lattice` | object | `{ "dim": 64, "shape": "cube" }`. |
| `created` | string | ISO-8601 UTC timestamp of bundle creation. |
| `sources` | array<string> | List of source ids (`s-…`) referenced by loci. |

### 3.2 Optional fields

| Field | Type | Description |
|---|---|---|
| `producer` | string | Producer software name+version. |
| `crystallizer_model` | string | Provider/model that produced loci. |
| `topologizer_model` | string | Provider/model that produced breadcrumbs. |
| `notes` | string | Free-form. |
| `tags` | array<string> | Free-form descriptive tags. |

### 3.3 Example

```json
{"v":"ltmi/0.1","kind":"manifest","corpus_id":"c-9a8b7c6d5e4f3a2b","loci":42,"lattice":{"dim":64,"shape":"cube"},"created":"2026-05-08T12:34:56Z","sources":["s-7f2c4d6e8a1b3c5d","s-2b3c4d5e6f7a8b9c"],"producer":"ltmi-xt-ts/0.1","crystallizer_model":"q3m@inception","topologizer_model":"q3m@inception"}
```

---

## 4 — `locus` record

Every line after the manifest.

### 4.1 Required fields

| Field | Type | Description |
|---|---|---|
| `id` | string | Locus id (`a-…`); content-addressed, deterministic. |
| `breadcrumb` | array<string> | Length 4. Hierarchical path: `[topic, subtopic, concept, claim]`. Lower levels MAY be `null` for shorter natural paths. |
| `lattice` | array<int> | 3-tuple in `[0, 63]³`. Derived from `breadcrumb`. |
| `statement` | string | One self-contained sentence. No pronouns referring outside the statement. No compound claims. |
| `kind` | string | One of `fact`, `definition`, `claim`, `example`, `instruction`, `opinion`, `uncertainty`. |
| `confidence` | number | `[0, 1]`. The producer's reported confidence in extraction faithfulness. |
| `horizon` | string | `"short"` or `"long"`. |
| `decay` | number | `[0, 1]`. Long-horizon loci MUST have `decay = 1.0`. |
| `source` | object | `{ "id": <s-…>, "offset": [start, end] }`. Byte offsets into the source text. |
| `first_seen` | string | ISO-8601 UTC. |
| `last_referenced` | string | ISO-8601 UTC. |

### 4.2 Optional fields

| Field | Type | Description |
|---|---|---|
| `kind` | string | If absent, defaults to `claim`. |
| `references` | integer | Reference counter; defaults to 0. Used by horizon consolidation. |
| `relations` | array<object> | List of `{ "type": <str>, "target": <a-…> }`. Free-form relational graph. |
| `extraction_pass` | integer | 1 = first crystallization pass, 2+ = post-edit. |
| `notes` | string | Free-form. |
| `tags` | array<string> | Free-form descriptive tags. |

### 4.3 Constraints

- `breadcrumb` MUST have length exactly 4. Trailing `null`s allowed; leading
  `null`s are not.
- `statement` MUST NOT exceed 600 characters in v0.1.
- `statement` MUST NOT begin with an unresolved pronoun (`it`, `this`,
  `they`, `that`) without immediate antecedent.
- `lattice` MUST be derivable from `breadcrumb` via §5 of the paper. A
  consumer MAY recompute and reject a locus whose `lattice` does not match.
- If `horizon = "long"`, `decay` MUST be `1.0`.
- `source.offset` start ≤ end; both MUST be valid byte offsets into the
  source identified by `source.id`.

### 4.4 Identifier derivation

```
locus.id = "a-" + blake2b_128(canonical_json({
  "breadcrumb":  locus.breadcrumb,
  "statement":   locus.statement,
  "source":      locus.source
}))
```

`canonical_json` is the JSON Canonicalization Scheme (RFC 8785)
representation. This guarantees that two producers consuming the same
input emit the same locus id.

### 4.5 Example

```json
{"id":"a-7f2c4d6e8a1b3c5d","breadcrumb":["AI","Diffusion Models","Masked Diffusion","Architecture"],"lattice":[12,38,7],"statement":"Cassandra T1 uses 28 transformer layers with a 2,048 hidden size.","kind":"fact","confidence":1.0,"horizon":"long","decay":1.0,"source":{"id":"s-9a8b7c6d5e4f3a2b","offset":[1245,1308]},"first_seen":"2026-05-08T12:34:56Z","last_referenced":"2026-05-08T12:34:56Z","references":0}
```

---

## 5 — `manifest.json` (companion)

Same content as the manifest line in `corpus.ltmi`, written as a standalone
JSON file. Provided so that consumers can read the manifest in O(1) without
parsing the full JSONL stream.

If both `corpus.ltmi` first-line manifest and `manifest.json` exist and
disagree, the in-stream manifest wins.

---

## 6 — `breadcrumb-tree.json` (companion)

A navigable nested tree, useful for UIs and human inspection.

```json
{
  "name": "ROOT",
  "children": [
    {
      "name": "AI",
      "children": [
        {
          "name": "Diffusion Models",
          "children": [
            {
              "name": "Masked Diffusion",
              "children": [
                {
                  "name": "Architecture",
                  "loci": ["a-7f2c4d6e8a1b3c5d", "a-2b3c4d5e6f7a8b9c"]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

A leaf node is any node with `loci` non-empty. Loci at non-leaf levels are
also permitted (e.g., a fact about the entire `Topic > Subtopic` pair, with
trailing `null` breadcrumb entries).

---

## 7 — `instruction.md` (companion)

A markdown file written for an LLM consumer. Explains the schema, retrieval
policy, citation conventions, and decay semantics. Producers emit a default
template; users can customize per corpus.

A reference template is published at
`reference/prompts/instruction-template.md` in the repository.

---

## 8 — `provenance.csv` (companion)

Tabular export for spreadsheet inspection. Columns:

```
locus_id, source_id, source_offset_start, source_offset_end, breadcrumb_topic, breadcrumb_subtopic, breadcrumb_concept, breadcrumb_claim, statement_excerpt
```

`statement_excerpt` is the first 80 characters of `statement`, with newlines
replaced by spaces, for at-a-glance review.

---

## 9 — `sources/` directory

Each source text is stored verbatim as a UTF-8 file named `<source_id>.txt`.
The `source_id` is `"s-" + blake2b_128(source_text_bytes)`.

Storing sources verbatim (rather than only offsets) means a `.ltmi` bundle
is fully self-contained and re-crystallizable: a consumer can re-run the
pipeline against any source and verify the resulting loci match.

---

## 10 — Versioning

The format version is the `v` field in the manifest, currently `ltmi/0.1`.

Backwards-incompatible changes increment the minor version (`0.2`, `0.3`,
…) within the `0.x` series. The `1.0` mark indicates a stabilized format.

Producers SHOULD emit only the highest version they support.
Consumers SHOULD reject corpora with versions newer than they understand,
but MAY ignore unknown optional fields within a version they support.

---

## 11 — Reserved namespaces

The following key prefixes are reserved for future use:

- `x-…` — experimental fields (will not be standardized).
- `_…` — implementation-internal fields (consumer SHOULD strip).

Custom application-specific fields MUST use one of these prefixes to avoid
colliding with future spec additions.

---

## 12 — Conformance

A producer is **conformant v0.1** if every emitted bundle:

1. Validates against this spec for every required field.
2. Has every `lattice` value derivable from its `breadcrumb` per §5 of the
   paper.
3. Has every `id` derivable per §4.4.
4. Has every `source.offset` valid against the corresponding source file.

A consumer is **conformant v0.1** if it:

1. Accepts any bundle whose manifest version is `ltmi/0.1`.
2. Preserves unknown optional fields when round-tripping a bundle.
3. Rejects bundles whose required fields are missing or malformed.

---

## 13 — Reference

- Reference implementation: `reference/ts/` in this repository.
- Validation tool: `reference/ts/src/validator.ts` (planned in v0.2).
- Golden test corpora: `tests/golden/` in this repository.

---

*LTMi-XT v0.1 file format · SOPHIA XT LLC · 2026-05-08*
