// Load the system prompts from the repo's reference/prompts directory.
// Resolves relative to the CLI's runtime location so it works after
// `npm link` AND when run from a checkout via `npm run dev`.

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Walk up from `apps/cli/dist/` to the repo root, then into reference/prompts/.
const candidates = [
  path.resolve(__dirname, "..", "..", "..", "reference", "prompts"),
  path.resolve(__dirname, "..", "..", "reference", "prompts"),
  path.resolve(__dirname, "..", "reference", "prompts"),
  path.resolve(process.cwd(), "reference", "prompts"),
];

let cached: { crystallize: string; topologize: string; instruction: string } | null = null;

export async function loadPrompts(): Promise<{
  crystallize: string;
  topologize: string;
  instruction: string;
}> {
  if (cached) return cached;
  let lastErr: unknown = null;
  for (const dir of candidates) {
    try {
      const [c, t, i] = await Promise.all([
        fs.readFile(path.join(dir, "crystallize-system.md"), "utf8"),
        fs.readFile(path.join(dir, "topologize-system.md"), "utf8"),
        fs.readFile(path.join(dir, "instruction-template.md"), "utf8"),
      ]);
      cached = { crystallize: c, topologize: t, instruction: i };
      return cached;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    "Could not locate reference/prompts/. Tried: " +
      candidates.join(", ") +
      ". Last error: " +
      String(lastErr),
  );
}
