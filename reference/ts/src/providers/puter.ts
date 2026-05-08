// Browser-side Puter.js provider.
//
// Puter (https://puter.com) exposes free, user-pays LLM access from any
// browser via its `puter.ai.chat()` API. End users pay for their own
// inference through Puter; the developer pays nothing. This is the
// recommended provider for public demos because it scales to any traffic
// without per-call cost on the operator.
//
// Add this script tag to the page before importing this module:
//
//   <script src="https://js.puter.com/v2/"></script>
//
// Models — see https://docs.puter.com/AI/chat/ for the full list. As of
// v0.1 of LTMi-XT we default to "gpt-4o-mini" because it (a) follows the
// JSON-only instruction reliably, (b) handles the topologizer's batched
// payload without truncation, and (c) is fast.

import type { ChatRequest, ChatResponse, Provider } from "../types.js";

interface PuterChatOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface PuterChatResponse {
  message?: {
    content?:
      | string
      | Array<{ type?: string; text?: string }>;
  };
  text?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace globalThis {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    var puter: any;
  }
}

export interface PuterProviderConfig {
  /** Provider display name (e.g. "puter:gpt-4o-mini"). */
  name?: string;
  /** Model identifier. See https://docs.puter.com/AI/chat/. */
  model?: string;
  /** Optional override of the default request timeout, ms. */
  timeoutMs?: number;
}

const DEFAULT_MODEL = "gpt-4o-mini";

export class PuterProvider implements Provider {
  public readonly name: string;
  public readonly model: string;
  private readonly timeoutMs: number;

  constructor(cfg: PuterProviderConfig = {}) {
    this.model = cfg.model || DEFAULT_MODEL;
    this.name = cfg.name || `puter:${this.model}`;
    this.timeoutMs = cfg.timeoutMs ?? 60_000;
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    if (typeof globalThis.puter === "undefined" || !globalThis.puter?.ai?.chat) {
      throw new Error(
        'Puter SDK not loaded. Add <script src="https://js.puter.com/v2/"></script> to the page before using PuterProvider.',
      );
    }

    const messages: Array<{ role: string; content: string }> = [];
    if (req.system) messages.push({ role: "system", content: req.system });
    messages.push({ role: "user", content: req.user });

    const opts: PuterChatOptions = {
      model: this.model,
      temperature: req.temperature ?? 0.2,
      max_tokens: req.maxTokens ?? 2048,
      stream: false,
    };

    // Puter accepts a messages array in the first arg — see
    // https://docs.puter.com/AI/chat/#full-signature.
    const racePromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Puter ${this.model} timed out after ${this.timeoutMs}ms`)), this.timeoutMs),
    );

    const callPromise = globalThis.puter.ai.chat(messages, opts) as Promise<PuterChatResponse | string>;

    const result = await Promise.race([callPromise, racePromise]);

    let text: string;
    if (typeof result === "string") {
      text = result;
    } else {
      text = extractText(result) ?? "";
    }

    return { text };
  }
}

function extractText(r: PuterChatResponse | undefined | null): string | null {
  if (!r) return null;
  if (typeof r.text === "string") return r.text;
  const c = r.message?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    const parts = c.map((p) => p?.text ?? "").filter(Boolean);
    if (parts.length > 0) return parts.join("\n");
  }
  return null;
}

/** Factory mirroring the createQ3MProvider/createGrokProvider pattern. */
export function createPuterProvider(opts?: PuterProviderConfig): PuterProvider {
  return new PuterProvider(opts);
}

/** Curated subset of Puter's catalog that works well with the LTMi-XT pipeline. */
export const PUTER_RECOMMENDED_MODELS: Array<{ id: string; label: string; note: string }> = [
  { id: "gpt-4o-mini", label: "GPT-4o mini", note: "Default · fast · reliable JSON" },
  { id: "gpt-4o", label: "GPT-4o", note: "Higher quality · slower" },
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", note: "Strong reasoning" },
  { id: "deepseek/deepseek-r1", label: "DeepSeek R1", note: "Reasoning model · cost-efficient" },
  { id: "o4-mini", label: "OpenAI o4-mini", note: "Reasoning model" },
];
