// Stage 6 — Fine-tune ingestion: locus → training row.
// Deterministic, lossless given the same .ltmi input.

import type { Locus } from "./types.js";

export interface TrainingRow {
  instruction: string;
  input: string;
  output: string;
  weight: number;
  tags: { horizon: string; kind: string };
  // Provenance back to the source locus, useful for downstream debugging.
  meta: { locus_id: string; source_id: string };
}

function instructionFor(breadcrumb: Locus["breadcrumb"]): string {
  const subtopic = breadcrumb[1] ?? "this domain";
  const concept = breadcrumb[2] ?? "the concept";
  const claim = breadcrumb[3] ?? "the relevant claim";
  return `Provide the ${concept} of ${subtopic}: ${claim}.`;
}

function inputFor(breadcrumb: Locus["breadcrumb"]): string {
  const lines: string[] = [];
  if (breadcrumb[0]) lines.push("Topic: " + breadcrumb[0]);
  if (breadcrumb[1]) lines.push("Subtopic: " + breadcrumb[1]);
  if (breadcrumb[2]) lines.push("Concept: " + breadcrumb[2]);
  return lines.join("\n");
}

export function locusToRow(locus: Locus): TrainingRow {
  return {
    instruction: instructionFor(locus.breadcrumb),
    input: inputFor(locus.breadcrumb),
    output: locus.statement,
    weight: locus.decay * locus.confidence,
    tags: { horizon: locus.horizon, kind: locus.kind },
    meta: { locus_id: locus.id, source_id: locus.source.id },
  };
}

/**
 * Convert a stream of loci into JSONL training rows. Returns a single string
 * suitable for writing to e.g. a `training.jsonl` file consumed by HF TRL,
 * Axolotl, etc.
 */
export function toTrainingJsonl(loci: Locus[]): string {
  return loci.map((l) => JSON.stringify(locusToRow(l))).join("\n");
}
