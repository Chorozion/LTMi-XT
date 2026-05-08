#!/usr/bin/env node
// LTMi-XT CLI entry point.
//
//   ltmi crystallize <input>     run the full pipeline
//   ltmi retrieve <corpus> <q>   query an existing corpus
//   ltmi inspect <corpus>        show the breadcrumb tree
//   ltmi train-export <corpus>   emit fine-tune training rows
//   ltmi serve [--port 3030]     local HTTP API + web UI
//
// Read-only commands (`inspect`, `train-export`) do not need an API key.

import { parseArgs, C, header, err, dim } from "./util.js";

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const args = parseArgs(argv.slice(1));

  if (!cmd || cmd === "help" || args.flags.help || args.flags.h) {
    printHelp();
    return cmd ? 0 : 2;
  }
  if (cmd === "version" || args.flags.version || args.flags.v) {
    console.log("ltmi-xt-cli 0.1.0  ·  https://sophiaxt.com/research/ltmi-xt");
    return 0;
  }

  switch (cmd) {
    case "crystallize": {
      const m = await import("./commands/crystallize.js");
      return m.run(args);
    }
    case "retrieve": {
      const m = await import("./commands/retrieve.js");
      return m.run(args);
    }
    case "inspect": {
      const m = await import("./commands/inspect.js");
      return m.run(args);
    }
    case "train-export":
    case "export": {
      const m = await import("./commands/train-export.js");
      return m.run(args);
    }
    case "serve": {
      const m = await import("./commands/serve.js");
      return m.run(args);
    }
    default:
      err(`Unknown command: ${cmd}`);
      printHelp();
      return 2;
  }
}

function printHelp() {
  header("LTMi-XT CLI  ·  v0.1");
  console.log(`${dim("Layered Topological Memory Indexing — Extended Technology")}`);
  console.log("");
  console.log(`${C.bold}Commands${C.reset}`);
  console.log(`  ltmi crystallize <input>             ${dim("messy text → corpus.ltmi  (requires API key)")}`);
  console.log(`  ltmi retrieve <corpus> "<query>"     ${dim("lattice-walk retrieval")}`);
  console.log(`  ltmi inspect <corpus.ltmi>           ${dim("show the breadcrumb tree    (no API key)")}`);
  console.log(`  ltmi train-export <corpus.ltmi>      ${dim("emit fine-tune training rows (no API key)")}`);
  console.log(`  ltmi serve [--port 3030]             ${dim("local HTTP API + web UI")}`);
  console.log(`  ltmi version                         ${dim("print version")}`);
  console.log(`  ltmi help                            ${dim("show this message")}`);
  console.log("");
  console.log(`${C.bold}Provider environment${C.reset}`);
  console.log(`  Q3M_API_KEY=…       (Inception Mercury — preferred)`);
  console.log(`  GROK_API_KEY=…      (xAI Grok)`);
  console.log(`  OPENAI_API_KEY=…    (OpenAI or any OpenAI-compatible endpoint)`);
  console.log("");
  console.log(`${C.bold}Examples${C.reset}`);
  console.log(`  ltmi inspect examples/corpus.ltmi`);
  console.log(`  ltmi crystallize examples/messy-input.md --out my.ltmi`);
  console.log(`  ltmi retrieve my.ltmi "what are the failure modes?"`);
  console.log(`  ltmi serve --port 3030`);
  console.log("");
  console.log(`${dim("Docs:")}  https://sophiaxt.com/research/ltmi-xt`);
  console.log(`${dim("Repo:")}  https://github.com/Chorozion/LTMi-XT`);
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    err((e as Error).message || "Unhandled error.");
    process.exit(1);
  });
