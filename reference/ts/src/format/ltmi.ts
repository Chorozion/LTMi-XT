// LTMi-XT bundle reader / writer.
// In-memory only — disk I/O is out of scope for the reference module so that
// the same code runs in the browser, in serverless, and on a workstation.

import { canonicalJson } from "./canonical-json.js";
import { blake2b128Hex } from "./lattice.js";
import {
  type Breadcrumb,
  type Bundle,
  type BreadcrumbTreeNode,
  type Locus,
  type Manifest,
  LTMI_VERSION,
} from "../types.js";

/** Serialize a Bundle to the on-the-wire JSONL form (single string). */
export function serializeJsonl(bundle: Bundle): string {
  const lines: string[] = [];
  lines.push(JSON.stringify(bundle.manifest));
  for (const locus of bundle.loci) lines.push(JSON.stringify(locus));
  return lines.join("\n");
}

/** Parse a JSONL string into a partial Bundle (no sources, no tree). */
export function parseJsonl(text: string): { manifest: Manifest; loci: Locus[] } {
  const lines = text.split("\n").filter((l) => l.length > 0);
  if (lines.length === 0) throw new Error("Empty .ltmi stream.");
  const manifest = JSON.parse(lines[0]) as Manifest;
  if (manifest.kind !== "manifest" || manifest.v !== LTMI_VERSION) {
    throw new Error(`Unsupported LTMi version or manifest. v=${(manifest as Manifest).v}`);
  }
  const loci: Locus[] = [];
  for (let i = 1; i < lines.length; i++) {
    loci.push(JSON.parse(lines[i]) as Locus);
  }
  if (manifest.loci !== loci.length) {
    throw new Error(
      `Manifest declares ${manifest.loci} loci, found ${loci.length}.`,
    );
  }
  return { manifest, loci };
}

/** Build the breadcrumb tree from a list of loci. */
export function buildBreadcrumbTree(loci: Locus[]): BreadcrumbTreeNode {
  const root: BreadcrumbTreeNode = { name: "ROOT", children: [] };

  for (const locus of loci) {
    let node = root;
    for (let i = 0; i < 4; i++) {
      const name = locus.breadcrumb[i];
      if (name == null) break;
      if (!node.children) node.children = [];
      let child = node.children.find((c) => c.name === name);
      if (!child) {
        child = { name };
        node.children.push(child);
      }
      node = child;
    }
    if (!node.loci) node.loci = [];
    node.loci.push(locus.id);
  }
  return root;
}

/** Compute the deterministic locus id from breadcrumb + statement + source. */
export function deriveLocusId(
  breadcrumb: Breadcrumb,
  statement: string,
  source: { id: string; offset: [number, number] },
): string {
  return "a-" + blake2b128Hex(canonicalJson({ breadcrumb, statement, source }));
}

/** Compute the deterministic source id from raw source text. */
export function deriveSourceId(text: string): string {
  return "s-" + blake2b128Hex(text);
}

/** Compute the deterministic corpus id from sorted locus ids. */
export function deriveCorpusId(lociIds: string[]): string {
  const sorted = [...lociIds].sort();
  return "c-" + blake2b128Hex(canonicalJson(sorted));
}
