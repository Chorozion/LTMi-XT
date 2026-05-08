// `ltmi train-export <corpus.ltmi> [--out training.jsonl]` — no LLM required.

import * as fs from "node:fs/promises";
import { parseJsonl, toTrainingJsonl } from "@sophiaxt/ltmi-xt";
import { type ParsedArgs, err, ok, bytes } from "../util.js";

export async function run(args: ParsedArgs): Promise<number> {
  const input = args.positional[0];
  if (!input) {
    err("Usage: ltmi train-export <corpus.ltmi> [--out training.jsonl]");
    return 2;
  }
  const out = (args.flags.out as string | undefined) || (args.flags.o as string | undefined);

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

  const jsonl = toTrainingJsonl(parsed.loci);

  if (out) {
    await fs.writeFile(out, jsonl, "utf8");
    ok(`Wrote ${out}  ·  ${parsed.loci.length} rows  ·  ${bytes(jsonl.length)}`);
  } else {
    process.stdout.write(jsonl);
    process.stdout.write("\n");
  }
  return 0;
}
