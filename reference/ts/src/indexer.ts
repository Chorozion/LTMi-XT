// Stage 4 — Indexing: compose the full pipeline and emit a Bundle.

import {
  type Bundle,
  type Locus,
  type Manifest,
  LTMI_VERSION,
} from "./types.js";
import {
  buildBreadcrumbTree,
  deriveCorpusId,
  deriveSourceId,
} from "./format/ltmi.js";
import { crystallize, type CrystallizerOptions } from "./crystallizer.js";
import { topologize, type TopologizerOptions } from "./topologizer.js";
import { chronologize, type ChronoOptions } from "./chronologizer.js";
import { applyPersona } from "./persona.js";

export interface IngestSource {
  /** Source label, e.g. filename or URL. Optional, just informational. */
  label?: string;
  /** Source body. */
  text: string;
  /** Optional ISO-8601 timestamp. Defaults to "now". */
  timestamp?: string;
  /** If true, force long-horizon at ingest. */
  canonical?: boolean;
  /** If true, force short-horizon at ingest. */
  transient?: boolean;
}

export interface IndexOptions {
  crystallizer: Omit<CrystallizerOptions, "provider"> & { provider: CrystallizerOptions["provider"] };
  topologizer: Omit<TopologizerOptions, "provider"> & { provider: TopologizerOptions["provider"] };
  chrono?: Pick<ChronoOptions, "now" | "recentDays">;
  /** Producer string for the manifest. */
  producer?: string;
  /** Notes / tags for the manifest. */
  notes?: string;
  tags?: string[];
  /**
   * Optional persona prefix wrapping the system prompts so the underlying
   * model self-identifies as Sophia (SOPHIA XT). Default: "sophia".
   */
  persona?: "sophia" | "none";
}

/** Build a full Bundle from a list of input sources. */
export async function buildBundle(
  inputs: IngestSource[],
  opts: IndexOptions,
): Promise<Bundle> {
  const sources = new Map<string, string>();
  const allLoci: Locus[] = [];
  const knownVocab = { topics: new Set<string>(), subtopics: new Set<string>(), concepts: new Set<string>() };

  // Apply Sophia persona prefix to system prompts unless explicitly disabled.
  const persona = opts.persona ?? "sophia";
  const crystallizerOpts: CrystallizerOptions = {
    ...opts.crystallizer,
    systemPrompt: applyPersona(persona, opts.crystallizer.systemPrompt),
  };
  const topologizerSystemPrompt = applyPersona(persona, opts.topologizer.systemPrompt);

  for (const input of inputs) {
    const sourceId = deriveSourceId(input.text);
    sources.set(sourceId, input.text);

    // Stage 1
    const crystallized = await crystallize(input.text, crystallizerOpts);

    // Stage 2 — pass running vocab so the model reuses levels
    const topologized = await topologize(crystallized, {
      ...opts.topologizer,
      systemPrompt: topologizerSystemPrompt,
      knownVocabulary: {
        topics: Array.from(knownVocab.topics),
        subtopics: Array.from(knownVocab.subtopics),
        concepts: Array.from(knownVocab.concepts),
      },
    });
    for (const t of topologized) {
      if (t.breadcrumb[0]) knownVocab.topics.add(t.breadcrumb[0]);
      if (t.breadcrumb[1]) knownVocab.subtopics.add(t.breadcrumb[1]);
      if (t.breadcrumb[2]) knownVocab.concepts.add(t.breadcrumb[2]);
    }

    // Stage 3
    const chrono = chronologize(topologized, {
      source: {
        id: sourceId,
        timestamp: input.timestamp,
        canonical: input.canonical,
        transient: input.transient,
      },
      ...opts.chrono,
    });
    allLoci.push(...chrono);
  }

  const corpusId = deriveCorpusId(allLoci.map((l) => l.id));
  const manifest: Manifest = {
    v: LTMI_VERSION,
    kind: "manifest",
    corpus_id: corpusId,
    loci: allLoci.length,
    lattice: { dim: 64, shape: "cube" },
    created: new Date().toISOString(),
    sources: Array.from(sources.keys()),
    producer: opts.producer ?? "ltmi-xt-ts/0.1",
    crystallizer_model: opts.crystallizer.provider.name,
    topologizer_model: opts.topologizer.provider.name,
  };
  if (opts.notes) manifest.notes = opts.notes;
  if (opts.tags?.length) manifest.tags = opts.tags;

  return {
    manifest,
    loci: allLoci,
    sources,
    breadcrumbTree: buildBreadcrumbTree(allLoci),
  };
}
