// Tiny argument parser + ANSI color helpers. No dependencies.

export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next != null && !next.startsWith("--")) {
        flags[key] = next;
        i += 2;
      } else {
        flags[key] = true;
        i += 1;
      }
    } else if (a.startsWith("-") && a.length > 1) {
      flags[a.slice(1)] = true;
      i += 1;
    } else {
      positional.push(a);
      i += 1;
    }
  }
  return { positional, flags };
}

const TTY = process.stdout.isTTY && process.env.NO_COLOR == null;
const ESC = (code: string) => (TTY ? `\x1b[${code}m` : "");
export const C = {
  reset: ESC("0"),
  dim: ESC("2"),
  bold: ESC("1"),
  cyan: ESC("36"),
  yellow: ESC("33"),
  green: ESC("32"),
  red: ESC("31"),
  mag: ESC("35"),
  blue: ESC("34"),
};

export function header(text: string) {
  console.log(`${C.bold}${C.cyan}${text}${C.reset}`);
}
export function ok(text: string) {
  console.log(`${C.green}✓${C.reset} ${text}`);
}
export function warn(text: string) {
  console.log(`${C.yellow}!${C.reset} ${text}`);
}
export function err(text: string) {
  console.error(`${C.red}✗${C.reset} ${text}`);
}
export function dim(text: string) {
  return `${C.dim}${text}${C.reset}`;
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / 1024 / 1024).toFixed(2)} MiB`;
}
