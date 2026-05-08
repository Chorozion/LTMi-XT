// Provider selection from environment variables.
//
// Priority (first that matches wins):
//   LTMI_PROVIDER=q3m     + Q3M_API_KEY     [+ Q3M_MODEL] [+ Q3M_BASE_URL]
//   LTMI_PROVIDER=grok    + GROK_API_KEY    [+ GROK_MODEL]
//   LTMI_PROVIDER=openai  + OPENAI_API_KEY  [+ OPENAI_MODEL] [+ OPENAI_BASE_URL]
//
// If LTMI_PROVIDER is unset, we autodetect based on which API_KEY is set.
// If nothing is set, returns null and the caller should print a friendly hint.

import {
  createGrokProvider,
  createOpenAiProvider,
  createQ3MProvider,
  type OpenAiCompatProvider,
} from "@sophiaxt/ltmi-xt";

export interface ProviderInfo {
  provider: OpenAiCompatProvider;
  name: "q3m" | "grok" | "openai";
  model: string;
  baseUrl: string;
}

export function loadProvider(): ProviderInfo | null {
  const explicit = (process.env.LTMI_PROVIDER || "").toLowerCase().trim();
  const tries: Array<"q3m" | "grok" | "openai"> = explicit
    ? [explicit as "q3m" | "grok" | "openai"]
    : ["q3m", "grok", "openai"];

  for (const name of tries) {
    if (name === "q3m") {
      const key = process.env.Q3M_API_KEY || process.env.INCEPTION_API_KEY;
      if (!key) continue;
      const model = process.env.Q3M_MODEL || "mercury-coder-small";
      const baseUrl = process.env.Q3M_BASE_URL
        ? process.env.Q3M_BASE_URL.replace(/\/+$/, "") + "/chat/completions"
        : "https://api.inceptionlabs.ai/v1/chat/completions";
      return {
        provider: createQ3MProvider({ apiKey: key, model, baseUrl }),
        name: "q3m",
        model,
        baseUrl,
      };
    }
    if (name === "grok") {
      const key = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
      if (!key) continue;
      const model = process.env.GROK_MODEL || "grok-3";
      const baseUrl = "https://api.x.ai/v1/chat/completions";
      return {
        provider: createGrokProvider({ apiKey: key, model }),
        name: "grok",
        model,
        baseUrl,
      };
    }
    if (name === "openai") {
      const key = process.env.OPENAI_API_KEY;
      if (!key) continue;
      const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
      const baseUrl = process.env.OPENAI_BASE_URL
        ? process.env.OPENAI_BASE_URL.replace(/\/+$/, "") + "/chat/completions"
        : "https://api.openai.com/v1/chat/completions";
      return {
        provider: createOpenAiProvider({ apiKey: key, model, baseUrl }),
        name: "openai",
        model,
        baseUrl,
      };
    }
  }
  return null;
}

export function providerHint(): string {
  return [
    "No LLM provider is configured. Set ONE of:",
    "  Q3M_API_KEY=…       (Inception Mercury — preferred)",
    "  GROK_API_KEY=…      (xAI Grok)",
    "  OPENAI_API_KEY=…    (OpenAI or any OpenAI-compatible endpoint)",
    "",
    "For local OpenAI-compatible endpoints (Ollama, vLLM, llama.cpp), set",
    "  OPENAI_API_KEY=anything OPENAI_BASE_URL=http://localhost:11434/v1",
    "",
    "Read-only commands (`inspect`, `train-export`) work without a provider.",
  ].join("\n");
}
