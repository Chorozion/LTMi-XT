// Shared base for OpenAI-compatible chat-completion providers.
// Q3M (Inception Labs) and xAI Grok both speak the OpenAI Chat Completions
// schema, so a single implementation covers both with different base URLs
// and credentials.

import type { ChatRequest, ChatResponse, Provider } from "../types.js";

export interface OpenAiCompatConfig {
  /** Provider display name (e.g. "q3m", "grok"). */
  name: string;
  /** Endpoint for chat completions. */
  baseUrl: string;
  /** Bearer token. */
  apiKey: string;
  /** Model identifier the provider expects. */
  model: string;
  /** Optional: custom fetch (for tests). */
  fetchImpl?: typeof fetch;
  /** Optional: per-request timeout, ms. Default 60_000. */
  timeoutMs?: number;
}

export class OpenAiCompatProvider implements Provider {
  public readonly name: string;
  private readonly cfg: OpenAiCompatConfig;

  constructor(cfg: OpenAiCompatConfig) {
    this.cfg = cfg;
    this.name = cfg.name;
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const fetcher = this.cfg.fetchImpl ?? fetch;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs ?? 60_000);

    const messages: Array<{ role: string; content: string }> = [];
    if (req.system) messages.push({ role: "system", content: req.system });
    messages.push({ role: "user", content: req.user });

    const body: Record<string, unknown> = {
      model: this.cfg.model,
      messages,
      max_tokens: req.maxTokens ?? 2048,
      temperature: req.temperature ?? 0.1,
    };
    if (req.jsonMode) {
      body.response_format = { type: "json_object" };
    }

    try {
      const res = await fetcher(this.cfg.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.cfg.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Provider ${this.name} HTTP ${res.status}: ${detail.slice(0, 240)}`);
      }
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const text = json.choices?.[0]?.message?.content ?? "";
      const usage = json.usage
        ? {
            input: json.usage.prompt_tokens ?? 0,
            output: json.usage.completion_tokens ?? 0,
          }
        : undefined;
      return { text, usage };
    } finally {
      clearTimeout(t);
    }
  }
}

/** Q3M (Mercury / Inception Labs) provider factory. */
export function createQ3MProvider(opts: {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}): OpenAiCompatProvider {
  return new OpenAiCompatProvider({
    name: "q3m",
    baseUrl: opts.baseUrl ?? "https://api.inceptionlabs.ai/v1/chat/completions",
    apiKey: opts.apiKey,
    model: opts.model ?? "mercury-coder-small",
  });
}

/** xAI Grok provider factory. */
export function createGrokProvider(opts: {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}): OpenAiCompatProvider {
  return new OpenAiCompatProvider({
    name: "grok",
    baseUrl: opts.baseUrl ?? "https://api.x.ai/v1/chat/completions",
    apiKey: opts.apiKey,
    model: opts.model ?? "grok-3",
  });
}
