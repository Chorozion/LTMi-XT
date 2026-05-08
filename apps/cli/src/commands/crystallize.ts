// `ltmi crystallize <input> [--out corpus.ltmi]`
// Reads messy text from a file (or stdin if input is "-"), runs the full
// pipeline, writes the .ltmi JSONL to disk or stdout.

import * as fs from "node:fs/promises";
import { buildBundle, serializeJsonl } from "@sophiaxt/ltmi-xt";
import { loadProvider, providerHint } from "../provider.js";
import { loadPrompts } from "../prompts.js";
import { type ParsedArgs, C, header, ok, err, warn, dim, bytes } from "../util.js";

async function readInput(arg: string): Promise<string> {
  if (arg === "-" || arg === "--") {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString("utf8");
  }
  return fs.readFile(arg, "utf8");
}

export async function run(args: ParsedArgs): Promise<number> {
  const input = args.positional[0];
  if (!input) {
    err("Usage: ltmi crystallize <input.md|-> [--out corpus.ltmi] [--label name] [--canonical] [--transient]");
    return 2;
  }
  const out = (args.flags.out as string | undefined) || (args.flags.o as string | undefined);
  const label = (args.flags.label as string | undefined) || input;
  const canonical = Boolean(args.flags.canonical);
  const transient = Boolean(args.flags.transient);

  const info = loadProvider();
  if (!info) {
    err(providerHint());
    return 3;
  }

  let text: string;
  try {
    text = await readInput(input);
  } catch (e) {
    err(`Could not read input: ${(e as Error).message}`);
    return 4;
  }
  if (text.length === 0) {
    err("Input is empty.");
    return 4;
  }

  header(`LTMi-XT crystallize`);
  console.log(`${dim("provider")}     ${info.name} (${info.model})`);
  console.log(`${dim("input")}        ${label}  ·  ${bytes(text.length)}`);
  console.log(`${dim("horizon hint")} ${canonical ? "long (canonical)" : transient ? "short (transient)" : "auto"}`);
  console.log("");

  let prompts;
  try {
    prompts = await loadPrompts();
  } catch (e) {
    err((e as Error).message);
    return 5;
  }

  try {
    const t0 = Date.now();
    const bundle = await buildBundle(
      [{ label, text, canonical, transient }],
      {
        crystallizer: { provider: info.provider, systemPrompt: prompts.crystallize },
        topologizer: { provider: info.provider, systemPrompt: prompts.topologize },
        producer: "ltmi-cli/0.1",
      },
    );
    const ms = Date.now() - t0;

    if (bundle.loci.length === 0) {
      warn("No loci extracted. The input may be too short or non-substantive.");
      return 6;
    }

    const jsonl = serializeJsonl(bundle);
    if (out) {
      await fs.writeFile(out, jsonl, "utf8");
      ok(`Wrote ${out}  ·  ${bundle.loci.length} loci  ·  ${bytes(jsonl.length)}  ·  ${ms} ms`);
    } else {
      process.stdout.write(jsonl);
      process.stdout.write("\n");
    }

    // Brief summary
    if (process.stdout.isTTY) {
      const horizons: Record<string, number> = {};
      const kinds: Record<string, number> = {};
      for (const l of bundle.loci) {
        horizons[l.horizon] = (horizons[l.horizon] ?? 0) + 1;
        kinds[l.kind] = (kinds[l.kind] ?? 0) + 1;
      }
      console.log("");
      console.log(`${dim("horizons")}  ${Object.entries(horizons).map(([k, v]) => `${k}=${v}`).join("  ")}`);
      console.log(`${dim("kinds")}     ${Object.entries(kinds).map(([k, v]) => `${k}=${v}`).join("  ")}`);
      console.log(`${dim("manifest")}  ${bundle.manifest.corpus_id}`);
    }
    return 0;
  } catch (e) {
    err(`Pipeline failed: ${(e as Error).message}`);
    return 1;
  }
}
