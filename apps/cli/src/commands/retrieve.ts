// `ltmi retrieve <corpus.ltmi> <query>` — uses LLM to derive query breadcrumb.
// Falls back to no-breadcrumb scoring if no provider is configured.

import * as fs from "node:fs/promises";
import { parseJsonl, retrieve } from "@sophiaxt/ltmi-xt";
import { loadProvider } from "../provider.js";
import { loadPrompts } from "../prompts.js";
import { type ParsedArgs, C, header, err, dim } from "../util.js";

export async function run(args: ParsedArgs): Promise<number> {
  const input = args.positional[0];
  const query = args.positional.slice(1).join(" ");
  if (!input || !query) {
    err('Usage: ltmi retrieve <corpus.ltmi> "<query>" [--k 8] [--json]');
    return 2;
  }
  const k = Number(args.flags.k ?? 8);

  let raw: string;
  try {
    raw = await fs.readFile(input, "utf8");
  } catch (e) {
    err(`Could not read ${input}: ${(e as Error).message}`);
    return 4;
  }

  let parsed: ReturnType<typeof parseJsonl>;
  try {
    parsed = parseJsonl(raw);
  } catch (e) {
    err(`Invalid .ltmi: ${(e as Error).message}`);
    return 5;
  }

  const info = loadProvider();
  let prompts: { topologize: string } | null = null;
  if (info) {
    try { prompts = await loadPrompts(); } catch { prompts = null; }
  }

  const result = await retrieve(query, {
    loci: parsed.loci,
    provider: info?.provider,
    systemPrompt: prompts?.topologize,
    k: Number.isFinite(k) && k > 0 ? Math.min(k, 32) : 8,
  });

  if (args.flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  header(`Query  ·  ${query}`);
  if (result.queryBreadcrumb) {
    const path = result.queryBreadcrumb.filter(Boolean).join("  →  ");
    console.log(`${dim("breadcrumb")}  ${C.cyan}${path}${C.reset}`);
  } else {
    console.log(`${dim("breadcrumb")}  ${dim("(no LLM provider — ranking by confidence × decay only)")}`);
  }
  if (result.queryCell) {
    console.log(`${dim("cell")}        [${result.queryCell.join(", ")}]`);
  }
  console.log("");

  if (result.results.length === 0) {
    console.log(dim("No loci matched within the default lattice radius."));
    return 0;
  }

  for (let i = 0; i < result.results.length; i++) {
    const r = result.results[i];
    const path = r.locus.breadcrumb.filter(Boolean).join("  →  ");
    const score = r.score.toFixed(3);
    console.log(
      `${C.bold}${C.yellow}#${i + 1}${C.reset}  ${dim(`score ${score} · d=${r.latticeDistance} · px=${r.prefixDepth}`)}`,
    );
    console.log(`     ${r.locus.statement}`);
    console.log(`     ${dim(path)}`);
    console.log("");
  }

  return 0;
}
