// LTMi-XT v0.1 type definitions.
// Mirrors docs/file-format-spec.md.

export const LTMI_VERSION = "ltmi/0.1" as const;

export type LocusKind =
  | "fact"
  | "definition"
  | "claim"
  | "example"
  | "instruction"
  | "opinion"
  | "uncertainty";

export type Horizon = "short" | "long";

/** Three-level hierarchical path with optional fourth claim level. */
export type Breadcrumb = [string, string | null, string | null, string | null];

/** Lattice coordinate in [0, 63]³. */
export type LatticeCoord = readonly [number, number, number];

export interface SourceRef {
  id: string; // s-…
  offset: [number, number]; // byte offsets [start, end)
}

export interface Manifest {
  v: typeof LTMI_VERSION;
  kind: "manifest";
  corpus_id: string; // c-…
  loci: number;
  lattice: { dim: 64; shape: "cube" };
  created: string; // ISO-8601 UTC
  sources: string[]; // s-…
  producer?: string;
  crystallizer_model?: string;
  topologizer_model?: string;
  notes?: string;
  tags?: string[];
}

export interface Locus {
  id: string; // a-…
  breadcrumb: Breadcrumb;
  lattice: LatticeCoord;
  statement: string;
  kind: LocusKind;
  confidence: number; // [0, 1]
  horizon: Horizon;
  decay: number; // [0, 1]
  source: SourceRef;
  first_seen: string; // ISO-8601 UTC
  last_referenced: string; // ISO-8601 UTC
  references?: number;
  relations?: { type: string; target: string }[];
  extraction_pass?: number;
  notes?: string;
  tags?: string[];
}

/** Bundle written to disk. */
export interface Bundle {
  manifest: Manifest;
  loci: Locus[];
  sources: Map<string, string>; // s-… → text
  breadcrumbTree: BreadcrumbTreeNode;
}

export interface BreadcrumbTreeNode {
  name: string;
  children?: BreadcrumbTreeNode[];
  loci?: string[];
}

/** Provider-agnostic chat completion request. */
export interface ChatRequest {
  system?: string;
  user: string;
  jsonMode?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatResponse {
  text: string;
  usage?: { input: number; output: number };
}

export interface Provider {
  name: string;
  chat(req: ChatRequest): Promise<ChatResponse>;
}
