// LTMi-XT v0.1 reference implementation — public API.
//
// Quick start:
//
//   import {
//     buildBundle,
//     createQ3MProvider,
//     serializeJsonl,
//     retrieve,
//   } from "@sophiaxt/ltmi-xt";
//   import crystallizeSystem from "./prompts/crystallize-system.md?raw";
//   import topologizeSystem from "./prompts/topologize-system.md?raw";
//
//   const provider = createQ3MProvider({ apiKey: process.env.Q3M_API_KEY! });
//   const bundle = await buildBundle(
//     [{ label: "manual.md", text: messyText }],
//     {
//       crystallizer: { provider, systemPrompt: crystallizeSystem },
//       topologizer:  { provider, systemPrompt: topologizeSystem },
//     }
//   );
//   const ltmi = serializeJsonl(bundle); // string ready to write to disk.
//   const result = await retrieve("How many layers does Cassandra T1 have?", {
//     loci: bundle.loci,
//     provider,
//     systemPrompt: topologizeSystem,
//   });

export * from "./types.js";

// Format helpers
export {
  serializeJsonl,
  parseJsonl,
  buildBreadcrumbTree,
  deriveLocusId,
  deriveSourceId,
  deriveCorpusId,
} from "./format/ltmi.js";
export { latticeCoord, chebyshev, breadcrumbPrefixMatch, LATTICE } from "./format/lattice.js";
export { canonicalJson } from "./format/canonical-json.js";

// Pipeline stages
export { crystallize, crystallizeSlab } from "./crystallizer.js";
export type { CrystallizedLocus, CrystallizerOptions } from "./crystallizer.js";

export { topologize } from "./topologizer.js";
export type { TopologizedLocus, TopologizerOptions } from "./topologizer.js";

export { chronologize } from "./chronologizer.js";
export type { ChronoOptions } from "./chronologizer.js";

export { buildBundle } from "./indexer.js";
export type { IngestSource, IndexOptions } from "./indexer.js";

export { retrieve, touch } from "./retriever.js";
export type { RetrieverOptions, RetrievalResult } from "./retriever.js";

export { locusToRow, toTrainingJsonl } from "./fine-tune.js";
export type { TrainingRow } from "./fine-tune.js";

// Providers
export {
  OpenAiCompatProvider,
  createQ3MProvider,
  createGrokProvider,
  createOpenAiProvider,
} from "./providers/openai-compat.js";
export type { OpenAiCompatConfig } from "./providers/openai-compat.js";

export {
  PuterProvider,
  createPuterProvider,
  PUTER_RECOMMENDED_MODELS,
} from "./providers/puter.js";
export type { PuterProviderConfig } from "./providers/puter.js";

// Persona
export { SOPHIA_PERSONA, applyPersona } from "./persona.js";
