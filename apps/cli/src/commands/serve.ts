// `ltmi serve [--port 3030]` — start a local HTTP server with the same
// /api/ltmi-xt/{crystallize,retrieve} endpoints used in production, plus a
// static web UI from the `apps/web/` directory of this repo.
//
// Zero non-stdlib runtime dependencies — uses node:http directly so the user
// can read every line of the server.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildBundle,
  retrieve,
  serializeJsonl,
  toTrainingJsonl,
  type Bundle,
} from "@sophiaxt/ltmi-xt";
import { loadProvider, providerHint } from "../provider.js";
import { loadPrompts } from "../prompts.js";
import { type ParsedArgs, C, header, ok, warn, err, dim } from "../util.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WEB_CANDIDATES = [
  path.resolve(__dirname, "..", "..", "..", "apps", "web"),
  path.resolve(__dirname, "..", "..", "web"),
  path.resolve(__dirname, "..", "web"),
  path.resolve(process.cwd(), "apps", "web"),
];

function resolveWebDir(): string {
  for (const c of WEB_CANDIDATES) {
    try {
      // sync-ish via require-style check; we'll just trust the first one
      // and let the actual fs.readFile fail if wrong.
      return c;
    } catch {}
  }
  return WEB_CANDIDATES[0];
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const MAX_INPUT_BYTES = 64_000;

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.from(chunk);
    total += buf.length;
    if (total > MAX_INPUT_BYTES) {
      throw Object.assign(new Error("Body too large."), { statusCode: 413 });
    }
    chunks.push(buf);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (text.length === 0) return {};
  try { return JSON.parse(text); }
  catch { throw Object.assign(new Error("Invalid JSON body."), { statusCode: 400 }); }
}

function setCors(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  setCors(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function serveStatic(webDir: string, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const u = new URL(req.url ?? "/", "http://localhost");
  let p = u.pathname;
  if (p === "/" || p === "") p = "/index.html";
  // Block path traversal.
  if (p.includes("..")) return false;
  const fp = path.resolve(path.join(webDir, p));
  if (!fp.startsWith(path.resolve(webDir))) return false;
  try {
    const data = await fs.readFile(fp);
    const ext = path.extname(fp).toLowerCase();
    res.statusCode = 200;
    res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

export async function run(args: ParsedArgs): Promise<number> {
  const port = Number(args.flags.port ?? args.flags.p ?? 3030);
  const host = (args.flags.host as string | undefined) ?? "127.0.0.1";

  const info = loadProvider();
  if (!info) warn("No LLM provider configured. /api/ltmi-xt/crystallize will return 503.\n" + providerHint());

  let prompts: { crystallize: string; topologize: string } | null = null;
  try { prompts = await loadPrompts(); }
  catch (e) { err(`Could not load prompts: ${(e as Error).message}`); return 5; }

  const webDir = resolveWebDir();

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const p = url.pathname;

    if (req.method === "OPTIONS") {
      setCors(res);
      res.statusCode = 204;
      res.end();
      return;
    }

    try {
      // ── API routes ──────────────────────────────────────────────────
      if (p === "/api/health" && req.method === "GET") {
        return sendJson(res, 200, {
          ok: true,
          provider: info ? { name: info.name, model: info.model } : null,
          version: "ltmi-xt-cli/0.1",
        });
      }

      if (p === "/api/ltmi-xt/crystallize" && req.method === "POST") {
        if (!info || !prompts) {
          return sendJson(res, 503, { success: false, error: providerHint(), code: "provider_unconfigured" });
        }
        const body = await readBody(req) as { text?: string; label?: string; canonical?: boolean; transient?: boolean };
        if (typeof body?.text !== "string" || body.text.trim().length === 0) {
          return sendJson(res, 400, { success: false, error: "`text` required.", code: "missing_text" });
        }
        const bundle: Bundle = await buildBundle(
          [{
            label: body.label || "input",
            text: body.text,
            canonical: !!body.canonical,
            transient: !!body.transient,
          }],
          {
            crystallizer: { provider: info.provider, systemPrompt: prompts.crystallize },
            topologizer: { provider: info.provider, systemPrompt: prompts.topologize },
            producer: "ltmi-cli-server/0.1",
          },
        );
        const ltmi = serializeJsonl(bundle);
        const trainingJsonl = toTrainingJsonl(bundle.loci);
        return sendJson(res, 200, {
          success: true,
          manifest: bundle.manifest,
          loci: bundle.loci,
          breadcrumbTree: bundle.breadcrumbTree,
          sources: Array.from(bundle.sources.entries()).map(([id, text]) => ({ id, bytes: text.length })),
          artifacts: { ltmi, trainingJsonl },
        });
      }

      if (p === "/api/ltmi-xt/retrieve" && req.method === "POST") {
        const body = await readBody(req) as { query?: string; bundle?: { loci: unknown[] }; k?: number };
        if (typeof body?.query !== "string" || body.query.trim().length === 0) {
          return sendJson(res, 400, { success: false, error: "`query` required.", code: "missing_query" });
        }
        if (!body.bundle || !Array.isArray(body.bundle.loci)) {
          return sendJson(res, 400, { success: false, error: "`bundle.loci` required.", code: "missing_bundle" });
        }
        const result = await retrieve(body.query, {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          loci: body.bundle.loci as any,
          provider: info?.provider,
          systemPrompt: prompts?.topologize,
          k: typeof body.k === "number" && body.k > 0 ? Math.min(body.k, 32) : 8,
        });
        return sendJson(res, 200, {
          success: true,
          query: result.query,
          queryBreadcrumb: result.queryBreadcrumb,
          queryCell: result.queryCell,
          results: result.results.map((r) => ({
            id: r.locus.id,
            score: Number(r.score.toFixed(4)),
            latticeDistance: r.latticeDistance,
            prefixDepth: r.prefixDepth,
            breadcrumb: r.locus.breadcrumb,
            statement: r.locus.statement,
            kind: r.locus.kind,
            confidence: r.locus.confidence,
            horizon: r.locus.horizon,
            decay: Number(r.locus.decay.toFixed(4)),
            source: r.locus.source,
          })),
        });
      }

      // ── Static web UI ───────────────────────────────────────────────
      if (req.method === "GET") {
        const served = await serveStatic(webDir, req, res);
        if (served) return;
      }

      sendJson(res, 404, { success: false, error: "Not found.", code: "not_found" });
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode ?? 500;
      sendJson(res, status, {
        success: false,
        error: (e as Error).message || "Server error.",
        code: "server_error",
      });
    }
  });

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      header(`LTMi-XT  ·  http://${host}:${port}`);
      console.log(`${dim("provider")}  ${info ? `${info.name} (${info.model})` : "(none — read-only)"}`);
      console.log(`${dim("web ui")}    http://${host}:${port}/`);
      console.log(`${dim("api")}       POST http://${host}:${port}/api/ltmi-xt/crystallize`);
      console.log(`           POST http://${host}:${port}/api/ltmi-xt/retrieve`);
      console.log(`           GET  http://${host}:${port}/api/health`);
      console.log("");
      ok(`ready. Ctrl-C to stop.`);
    });

    const stop = () => {
      console.log("");
      server.close(() => resolve(0));
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}
