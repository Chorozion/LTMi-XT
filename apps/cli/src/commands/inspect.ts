// `ltmi inspect <corpus.ltmi>` — read-only. No LLM required.

import * as fs from "node:fs/promises";
import { buildBreadcrumbTree, parseJsonl, type Locus, type BreadcrumbTreeNode } from "@sophiaxt/ltmi-xt";
import { type ParsedArgs, C, header, err, dim } from "../util.js";

function printTree(node: BreadcrumbTreeNode, lociById: Map<string, Locus>, depth = 0, prefix = "") {
  const isRoot = node.name === "ROOT";
  if (!isRoot) {
    console.log(`${prefix}${C.cyan}${node.name}${C.reset}`);
  }
  const childPrefix = isRoot ? "" : prefix + "  ";
  if (node.children) {
    for (const c of node.children) printTree(c, lociById, depth + 1, childPrefix);
  }
  if (node.loci) {
    for (const id of node.loci) {
      const locus = lociById.get(id);
      if (!locus) continue;
      const horizon = locus.horizon === "long" ? `${C.green}long${C.reset}` : `${C.yellow}short${C.reset}`;
      const conf = locus.confidence.toFixed(2);
      console.log(`${childPrefix}${dim("·")} ${locus.statement}  ${dim(`[${locus.kind} · ${horizon} · conf ${conf}]`)}`);
    }
  }
}

export async function run(args: ParsedArgs): Promise<number> {
  const input = args.positional[0];
  if (!input) {
    err("Usage: ltmi inspect <corpus.ltmi> [--json]");
    return 2;
  }

  let raw: string;
  try {
    raw = await fs.readFile(input, "utf8");
  } catch (e) {
    err(`Could not read ${input}: ${(e as Error).message}`);
    return 4;
  }

  let parsed: { manifest: ReturnType<typeof parseJsonl>["manifest"]; loci: Locus[] };
  try {
    parsed = parseJsonl(raw);
  } catch (e) {
    err(`Invalid .ltmi: ${(e as Error).message}`);
    return 5;
  }

  if (args.flags.json) {
    console.log(JSON.stringify({ manifest: parsed.manifest, loci: parsed.loci }, null, 2));
    return 0;
  }

  header(`LTMi-XT corpus  ·  ${input}`);
  console.log(`${dim("version")}    ${parsed.manifest.v}`);
  console.log(`${dim("corpus_id")}  ${parsed.manifest.corpus_id}`);
  console.log(`${dim("created")}    ${parsed.manifest.created}`);
  console.log(`${dim("loci")}       ${parsed.manifest.loci}`);
  console.log(`${dim("sources")}    ${parsed.manifest.sources.length}`);
  if (parsed.manifest.crystallizer_model) {
    console.log(`${dim("crystallizer")} ${parsed.manifest.crystallizer_model}`);
  }
  console.log("");

  const lociById = new Map<string, Locus>();
  for (const l of parsed.loci) lociById.set(l.id, l);

  const tree = buildBreadcrumbTree(parsed.loci);
  printTree(tree, lociById);

  return 0;
}
