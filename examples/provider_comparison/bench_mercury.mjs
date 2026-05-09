// Mercury 2 crystallization benchmark
// Measures: latency, prompt/reasoning/completion tokens, locus quality, throughput

import fs from "fs";
import path from "path";

// Manual .env parser (avoids needing dotenv installed)
const envText = fs.readFileSync("I:/cool/SophiaXtPortal (1)/SophiaXtPortal/.env", "utf-8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const apiKey = env.INCEPTION_API_KEY;
const baseUrl = (env.INCEPTION_BASE_URL || "https://api.inceptionlabs.ai/v1").replace(/\/+$/, "");
const model = env.INCEPTION_MODEL || "mercury-2";

// Read 5 test corpora of varying length and topic
const corpora = [
  { id: "ops", text: "The customer support team is on call from 9am to 6pm Eastern. Tickets must be acknowledged within 2 hours. Critical bugs escalate to engineering on-call within 30 minutes via PagerDuty. Customer billing questions go to finance@sophiaxt.com. Refunds over $500 require manager approval." },
  { id: "tech", text: "The Cassandra T1 model is a 28-layer transformer with hidden size 2048 and 32K vocabulary. It uses grouped-query attention with 16 query heads and 4 key-value heads. Position encoding is RoPE with theta 500000. Normalization is RMSNorm with epsilon 1e-6. The intermediate FFN size is 5632 with SwiGLU activation. The model trains using masked diffusion with span masking probability 0.15." },
  { id: "biz", text: "Q4 revenue grew 18% YoY to $42M, driven by enterprise expansion in healthcare and financial services. Gross margin remained stable at 76%. Sales hired 12 reps in Q4, bringing total headcount to 240. The new product line generated $3.2M in its first quarter, exceeding the $2M target. Customer NPS scored 67, up from 62 last quarter." },
  { id: "med", text: "Heparin-induced thrombocytopenia is a serious immune-mediated adverse drug reaction. It typically develops 5-10 days after initial heparin exposure. Diagnosis requires the 4Ts score and confirmatory antibody testing. Argatroban or fondaparinux are first-line alternatives. Platelet transfusions are contraindicated unless severe bleeding occurs." },
  { id: "law", text: "Contract Section 4.2 requires written notice 30 days prior to termination. Late payment fees accrue at 1.5% per month after a 10-day grace period. Liability is capped at fees paid in the preceding 12 months. Either party may invoke binding arbitration under AAA rules with venue in Delaware. Confidentiality obligations survive termination for 5 years." },
];

const SYSTEM = `You are a fact crystallizer. Read the provided text and emit one JSON object per line. Each line must contain: {"breadcrumb": [topic, subtopic, concept, claim], "statement": <atomic factual claim>, "kind": "fact"}. Output only JSONL, no commentary, no markdown fences.`;

async function crystallize(text) {
  const t0 = Date.now();
  const r = await fetch(baseUrl + "/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: `Text:\n\n${text}` }],
      temperature: 0.2,
      max_tokens: 1900,
    }),
  });
  const dt = Date.now() - t0;
  const data = await r.json();
  if (!r.ok) {
    console.error("API error:", r.status, JSON.stringify(data).slice(0, 300));
    return null;
  }
  const content = data.choices?.[0]?.message?.content || "";
  const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
  let validLoci = 0;
  for (const ln of lines) {
    try { JSON.parse(ln); validLoci++; } catch {}
  }
  return {
    elapsed_ms: dt,
    usage: data.usage,
    locus_count: validLoci,
    raw_lines: lines.length,
    parse_rate: validLoci / Math.max(1, lines.length),
    content,
  };
}

console.log("=== Mercury 2 Crystallization Benchmark ===");
console.log(`model: ${model}`);
console.log(`corpora: ${corpora.length}`);
console.log("");

const results = [];
for (const c of corpora) {
  process.stdout.write(`[${c.id}] (${c.text.length} chars) ... `);
  const r = await crystallize(c.text);
  if (r) {
    results.push({ id: c.id, chars: c.text.length, ...r });
    const tps = r.usage.completion_tokens / (r.elapsed_ms / 1000);
    console.log(`${r.elapsed_ms}ms | ${r.locus_count} loci | ${tps.toFixed(0)} tok/s | usage=${JSON.stringify(r.usage)}`);
  }
}

const total_in = results.reduce((s, r) => s + r.usage.prompt_tokens, 0);
const total_reasoning = results.reduce((s, r) => s + (r.usage.reasoning_tokens || 0), 0);
const total_completion = results.reduce((s, r) => s + r.usage.completion_tokens, 0);
const total_ms = results.reduce((s, r) => s + r.elapsed_ms, 0);
const total_loci = results.reduce((s, r) => s + r.locus_count, 0);
const avg_parse = results.reduce((s, r) => s + r.parse_rate, 0) / results.length;

console.log("\n=== TOTALS ===");
console.log(`prompt_tokens:     ${total_in}`);
console.log(`reasoning_tokens:  ${total_reasoning}`);
console.log(`completion_tokens: ${total_completion}`);
console.log(`total_tokens:      ${total_in + total_reasoning + total_completion}`);
console.log(`avg latency:       ${(total_ms / results.length).toFixed(0)}ms`);
console.log(`total loci:        ${total_loci}`);
console.log(`tok/sec (output):  ${(total_completion / (total_ms / 1000)).toFixed(0)}`);
console.log(`parse rate:        ${(avg_parse * 100).toFixed(1)}% (valid JSONL/all lines)`);

fs.writeFileSync("D:/cassandra-eval/provider_bench/mercury_results.json", JSON.stringify({
  model, corpora_count: corpora.length, results, totals: {
    prompt_tokens: total_in,
    reasoning_tokens: total_reasoning,
    completion_tokens: total_completion,
    total_tokens: total_in + total_reasoning + total_completion,
    avg_latency_ms: Math.round(total_ms / results.length),
    total_loci,
    tok_per_sec: Math.round(total_completion / (total_ms / 1000)),
    parse_rate: avg_parse,
  },
}, null, 2));
console.log("\n-> wrote D:/cassandra-eval/provider_bench/mercury_results.json");
