// Mercury 2 self-test — does feeding LTMi-XT-restructured context to Mercury 2
// improve its own outputs vs raw RAG vs no context at all?
//
// 3 modes × 15 queries × 1 model = 45 Mercury 2 calls. Reuses existing
// crystallized bundles (no new crystallizations). Total spend ~$0.80.
//
// Modes:
//   A — Baseline       Question only, no context
//   B — Raw RAG        Question + raw corpus chunk by sentence overlap
//   C — LTMi-XT        Question + top-K LTMi-XT loci with breadcrumbs
//
// Headline metrics: hit rate (strict + lenient), token cost, latency.

import fs from "fs";
import path from "path";

// ─── env (manual parse, no dotenv dep) ────────────────────────────
const envText = fs.readFileSync("I:/cool/SophiaXtPortal (1)/SophiaXtPortal/.env", "utf-8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const apiKey = env.INCEPTION_API_KEY;
const baseUrl = (env.INCEPTION_BASE_URL || "https://api.inceptionlabs.ai/v1").replace(/\/+$/, "");
const model = env.INCEPTION_MODEL || "mercury-2";

// ─── load fixtures (reuse existing benchmarks data) ───────────────
const BENCH_DIR = "I:/cool/SophiaXtPortal (1)/SophiaXtPortal/github/ltmi-xt/examples/benchmarks";
const corpora = {
  C1: fs.readFileSync(path.join(BENCH_DIR, "corpora/C1-cold-storage.md"), "utf-8"),
  C2: fs.readFileSync(path.join(BENCH_DIR, "corpora/C2-architecture-spec.md"), "utf-8"),
  C3: fs.readFileSync(path.join(BENCH_DIR, "corpora/C3-mixed-memo.md"), "utf-8"),
};
const bundles = {
  C1: JSON.parse(fs.readFileSync(path.join(BENCH_DIR, "bundles/C1.json"), "utf-8")),
  C2: JSON.parse(fs.readFileSync(path.join(BENCH_DIR, "bundles/C2.json"), "utf-8")),
  C3: JSON.parse(fs.readFileSync(path.join(BENCH_DIR, "bundles/C3.json"), "utf-8")),
};
const queries = JSON.parse(fs.readFileSync(path.join(BENCH_DIR, "queries.json"), "utf-8"));

// ─── graders ──────────────────────────────────────────────────────
function gradeStrict(text, kws) {
  const t = text.toLowerCase();
  return kws.every(k => t.includes(k.toLowerCase()));
}
function gradeLenient(text, kws) {
  const t = text.toLowerCase().replace(/\s+/g, "");
  return kws.every(k => t.includes(k.toLowerCase().replace(/\s+/g, "")));
}

// ─── retrieval (lightweight, in-process) ──────────────────────────
const STOPWORDS = new Set("the a an is are was were be been being of to in on at by for with as and or but not this that these those it its what which who whom how why do does did done have has had can could will would should may might i you they them their our my me company companies each also into from over than".split(" "));
function tokenize(s) {
  return new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter(t => t && !STOPWORDS.has(t) && t.length >= 2));
}
function retrieveTopKLoci(loci, query, k = 6) {
  const qt = tokenize(query);
  const scored = loci.map(l => {
    const ht = tokenize((l.breadcrumb || []).join(" ") + " " + l.statement);
    let overlap = 0;
    for (const w of qt) if (ht.has(w)) overlap++;
    return { score: overlap / Math.max(1, qt.size), locus: l };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map(s => s.locus);
}
function retrieveRawChunk(corpus, query, maxChars = 800) {
  const sentences = corpus.split(/(?<=[.!?])\s+/).filter(s => s.trim().length >= 12);
  const qt = tokenize(query);
  const scored = sentences.map(s => {
    const ht = tokenize(s);
    let overlap = 0;
    for (const w of qt) if (ht.has(w)) overlap++;
    return { score: overlap / Math.max(1, qt.size), s };
  });
  scored.sort((a, b) => b.score - a.score);
  let chunk = "", used = 0;
  for (const { s } of scored) {
    if (used + s.length + 1 > maxChars) break;
    chunk += (chunk ? " " : "") + s;
    used += s.length + 1;
  }
  return chunk;
}

// ─── prompt builders ──────────────────────────────────────────────
const SYSTEM = "You are a helpful assistant. Answer the question concisely and accurately, using the provided context if any. If the context does not contain the answer, say so directly.";
function promptA(query) {
  return `QUESTION: ${query}`;
}
function promptB(query, rawChunk) {
  return `Use the following context to answer the question.\n\nCONTEXT:\n${rawChunk}\n\nQUESTION: ${query}`;
}
function promptC(query, loci) {
  const facts = loci.map((l, i) => {
    const bc = (l.breadcrumb || []).join(" > ");
    return `${i + 1}. [${bc}] ${l.statement}`;
  }).join("\n");
  return `Use the following structured facts to answer the question. Each fact has a topic path. If the answer is not in the facts, say so.\n\nFACTS (${loci.length} total):\n${facts}\n\nQUESTION: ${query}`;
}

// ─── Mercury 2 caller ─────────────────────────────────────────────
async function mercury(prompt) {
  const t0 = Date.now();
  const r = await fetch(baseUrl + "/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 500,
    }),
  });
  const dt = Date.now() - t0;
  const data = await r.json();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return {
    text: data.choices?.[0]?.message?.content || "",
    usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, reasoning_tokens: 0, total_tokens: 0 },
    latency_ms: dt,
  };
}

// ─── run ──────────────────────────────────────────────────────────
console.log(`=== Mercury 2 self-test === model=${model}\n`);
const results = [];
let callCount = 0;
const totalCalls = Object.values(queries).reduce((a, b) => a + b.length, 0) * 3;

for (const [cid, qlist] of Object.entries(queries)) {
  for (const q of qlist) {
    for (const mode of ["A_baseline", "B_raw_rag", "C_ltmi_xt"]) {
      callCount++;
      let prompt;
      if (mode === "A_baseline") {
        prompt = promptA(q.q);
      } else if (mode === "B_raw_rag") {
        prompt = promptB(q.q, retrieveRawChunk(corpora[cid], q.q));
      } else {
        prompt = promptC(q.q, retrieveTopKLoci(bundles[cid].loci, q.q, 6));
      }
      const promptChars = prompt.length;
      try {
        const out = await mercury(prompt);
        const strict = gradeStrict(out.text, q.expect_keywords);
        const lenient = gradeLenient(out.text, q.expect_keywords);
        const row = {
          corpus: cid,
          query: q.q,
          expected: q.expect_keywords,
          mode,
          prompt_chars: promptChars,
          response: out.text,
          usage: out.usage,
          latency_ms: out.latency_ms,
          strict,
          lenient,
        };
        results.push(row);
        const total = out.usage.total_tokens || 0;
        console.log(`[${callCount}/${totalCalls}] ${cid} ${mode.padEnd(12)} | ${total}t ${out.latency_ms}ms S=${strict ? 1 : 0} L=${lenient ? 1 : 0} | ${q.q.slice(0, 60)}`);
      } catch (err) {
        console.error(`[${callCount}/${totalCalls}] ${cid} ${mode} FAILED:`, err.message);
        results.push({ corpus: cid, query: q.q, mode, error: err.message });
      }
    }
  }
}

// ─── aggregate ────────────────────────────────────────────────────
function summarize(mode) {
  const sub = results.filter(r => r.mode === mode && !r.error);
  const n = sub.length;
  if (n === 0) return null;
  const strict = sub.filter(r => r.strict).length;
  const lenient = sub.filter(r => r.lenient).length;
  const totalTokens = sub.reduce((s, r) => s + (r.usage.total_tokens || 0), 0);
  const totalReasoning = sub.reduce((s, r) => s + (r.usage.reasoning_tokens || 0), 0);
  const totalCompletion = sub.reduce((s, r) => s + (r.usage.completion_tokens || 0), 0);
  const totalPrompt = sub.reduce((s, r) => s + (r.usage.prompt_tokens || 0), 0);
  const avgLatency = sub.reduce((s, r) => s + r.latency_ms, 0) / n;
  const avgPromptChars = sub.reduce((s, r) => s + r.prompt_chars, 0) / n;
  return {
    n,
    strict_hits: strict,
    strict_pct: +(strict / n * 100).toFixed(1),
    lenient_hits: lenient,
    lenient_pct: +(lenient / n * 100).toFixed(1),
    avg_prompt_chars: Math.round(avgPromptChars),
    total_prompt_tokens: totalPrompt,
    total_reasoning_tokens: totalReasoning,
    total_completion_tokens: totalCompletion,
    total_tokens: totalTokens,
    avg_tokens_per_call: Math.round(totalTokens / n),
    avg_latency_ms: Math.round(avgLatency),
  };
}

const summary = {
  model,
  ran_at: new Date().toISOString(),
  total_calls: results.length,
  modes: {
    A_baseline: summarize("A_baseline"),
    B_raw_rag: summarize("B_raw_rag"),
    C_ltmi_xt: summarize("C_ltmi_xt"),
  },
};

console.log("\n=== SUMMARY ===");
console.log(JSON.stringify(summary, null, 2));

// ─── save ─────────────────────────────────────────────────────────
fs.mkdirSync("D:/cassandra-eval/mercury_self_test/out", { recursive: true });
fs.writeFileSync(
  "D:/cassandra-eval/mercury_self_test/out/results.jsonl",
  results.map(r => JSON.stringify(r)).join("\n") + "\n",
  "utf-8",
);
fs.writeFileSync(
  "D:/cassandra-eval/mercury_self_test/out/summary.json",
  JSON.stringify(summary, null, 2),
  "utf-8",
);
console.log("\nWrote results.jsonl + summary.json to D:/cassandra-eval/mercury_self_test/out/");
