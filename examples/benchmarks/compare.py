#!/usr/bin/env python3
"""Head-to-head comparison: LTMi-XT vs BM25 vs naive keyword overlap.

All three methods get the same 3 corpora and 15 queries. The grader is
identical: a result counts as a hit if every expected keyword appears in
the result text. We score top-1 and top-3 hit rate per method.

LTMi-XT results are read from bench_log.jsonl (already captured against
the live API). BM25 and keyword overlap are computed locally from the
raw corpus text — no API calls needed, sub-millisecond per query.
"""
from __future__ import annotations
import json
import math
import re
import time
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).parent
LOG_PATH = HERE / "bench_log.jsonl"

CORPUS_FILES = {
    "C1": HERE / "corpora" / "C1-cold-storage.md",
    "C2": HERE / "corpora" / "C2-architecture-spec.md",
    "C3": HERE / "corpora" / "C3-mixed-memo.md",
}
QUERIES_PATH = HERE / "queries.json"

# ──────────────────────────────────────────────────────────────────────
# Tokenization + stopwords (shared across baselines for fair comparison)
# ──────────────────────────────────────────────────────────────────────
STOPWORDS = {
    "the","a","an","is","are","was","were","be","been","being","of","to","in","on","at","by",
    "for","with","as","and","or","but","not","this","that","these","those","it","its","what",
    "which","who","whom","how","why","do","does","did","done","have","has","had","can","could",
    "will","would","should","may","might","i","you","they","them","their","our","my","me",
    "company","companies","each","also","into","from","over","than",
}

def tokenize(text: str) -> list[str]:
    return [t for t in re.split(r"[^a-z0-9]+", text.lower()) if t and t not in STOPWORDS and len(t) >= 2]

def split_sentences(text: str) -> list[str]:
    # Split on sentence terminators while keeping non-trivial fragments.
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [p.strip() for p in parts if len(p.strip()) >= 12]

# ──────────────────────────────────────────────────────────────────────
# BM25 (Okapi) — classic IR baseline
# ──────────────────────────────────────────────────────────────────────
class BM25:
    def __init__(self, docs: list[str], k1: float = 1.5, b: float = 0.75):
        self.docs = docs
        self.tokens = [tokenize(d) for d in docs]
        self.doc_len = [len(t) for t in self.tokens]
        self.avg_dl = sum(self.doc_len) / max(1, len(self.doc_len))
        self.k1 = k1
        self.b = b
        # Document frequency
        df = Counter()
        for t in self.tokens:
            for term in set(t):
                df[term] += 1
        self.df = df
        self.N = len(docs)
        # idf (Robertson-Sparck-Jones)
        self.idf = {term: math.log((self.N - n + 0.5) / (n + 0.5) + 1.0) for term, n in df.items()}

    def score(self, query: str) -> list[tuple[int, float]]:
        qtokens = tokenize(query)
        scores: dict[int, float] = defaultdict(float)
        for q in qtokens:
            if q not in self.idf:
                continue
            idf_q = self.idf[q]
            for i, doc in enumerate(self.tokens):
                tf = doc.count(q)
                if tf == 0:
                    continue
                dl = self.doc_len[i]
                norm = 1 - self.b + self.b * (dl / max(1, self.avg_dl))
                scores[i] += idf_q * (tf * (self.k1 + 1)) / (tf + self.k1 * norm)
        return sorted(scores.items(), key=lambda kv: -kv[1])

# ──────────────────────────────────────────────────────────────────────
# Naive keyword overlap — simplest possible baseline
# ──────────────────────────────────────────────────────────────────────
def keyword_overlap_rank(docs: list[str], query: str) -> list[tuple[int, float]]:
    qtokens = set(tokenize(query))
    scored = []
    for i, d in enumerate(docs):
        dtokens = set(tokenize(d))
        if not qtokens:
            scored.append((i, 0.0))
            continue
        overlap = len(qtokens & dtokens) / len(qtokens)
        scored.append((i, overlap))
    return sorted(scored, key=lambda kv: -kv[1])

# ──────────────────────────────────────────────────────────────────────
# Grader — identical to run_bench.py
# ──────────────────────────────────────────────────────────────────────
def hit_at(top_k_texts: list[str], expect_keywords: list[str]) -> int | None:
    expected_lower = [kw.lower() for kw in expect_keywords]
    for i, t in enumerate(top_k_texts):
        haystack = t.lower()
        if all(kw in haystack for kw in expected_lower):
            return i + 1
    return None

# ──────────────────────────────────────────────────────────────────────
# Read LTMi-XT results from the existing bench log
# ──────────────────────────────────────────────────────────────────────
def load_ltmi_results() -> dict:
    """Returns {(corpus, query): {hit, ms, top_k_statements}}."""
    out = {}
    log = [json.loads(l) for l in LOG_PATH.read_text(encoding="utf-8").splitlines() if l.strip()]
    for r in log:
        if r.get("event") != "retrieve" or not r.get("success"):
            continue
        out[(r["corpus"], r["query"])] = {
            "hit": r.get("hit"),
            "ms": r.get("ms", 0),
            "top1": r.get("top1_statement"),
        }
    return out

def main():
    queries = json.loads(QUERIES_PATH.read_text(encoding="utf-8"))
    corpora = {cid: CORPUS_FILES[cid].read_text(encoding="utf-8").strip() for cid in CORPUS_FILES}

    # Pre-build retrievers
    bm25 = {cid: BM25(split_sentences(text)) for cid, text in corpora.items()}
    sentences = {cid: split_sentences(text) for cid, text in corpora.items()}
    ltmi = load_ltmi_results()

    methods = ["LTMi-XT", "BM25", "keyword-overlap"]
    scoreboard = {m: {"hit_at_1": 0, "hit_at_3": 0, "miss": 0, "total_ms": 0.0, "n": 0} for m in methods}

    per_query: list[dict] = []

    for cid, qlist in queries.items():
        for q in qlist:
            row = {"corpus": cid, "query": q["q"], "expected": q["expect_keywords"]}
            # LTMi-XT (live)
            ltmi_r = ltmi.get((cid, q["q"]))
            row["ltmi_hit"] = ltmi_r["hit"] if ltmi_r else None
            row["ltmi_ms"] = ltmi_r["ms"] if ltmi_r else None
            row["ltmi_top1"] = ltmi_r["top1"] if ltmi_r else None
            scoreboard["LTMi-XT"]["n"] += 1
            scoreboard["LTMi-XT"]["total_ms"] += (ltmi_r["ms"] or 0) if ltmi_r else 0
            if ltmi_r and ltmi_r["hit"] == 1:
                scoreboard["LTMi-XT"]["hit_at_1"] += 1
            if ltmi_r and ltmi_r["hit"] is not None and ltmi_r["hit"] <= 3:
                scoreboard["LTMi-XT"]["hit_at_3"] += 1
            if not ltmi_r or ltmi_r["hit"] is None:
                scoreboard["LTMi-XT"]["miss"] += 1

            # BM25
            t0 = time.time()
            bm25_ranked = bm25[cid].score(q["q"])[:6]
            bm25_ms = (time.time() - t0) * 1000
            bm25_top_k_texts = [sentences[cid][idx] for idx, _ in bm25_ranked]
            bm25_hit = hit_at(bm25_top_k_texts, q["expect_keywords"])
            row["bm25_hit"] = bm25_hit
            row["bm25_ms"] = round(bm25_ms, 2)
            row["bm25_top1"] = bm25_top_k_texts[0] if bm25_top_k_texts else None
            scoreboard["BM25"]["n"] += 1
            scoreboard["BM25"]["total_ms"] += bm25_ms
            if bm25_hit == 1:
                scoreboard["BM25"]["hit_at_1"] += 1
            if bm25_hit is not None and bm25_hit <= 3:
                scoreboard["BM25"]["hit_at_3"] += 1
            if bm25_hit is None:
                scoreboard["BM25"]["miss"] += 1

            # Keyword overlap
            t0 = time.time()
            kw_ranked = keyword_overlap_rank(sentences[cid], q["q"])[:6]
            kw_ms = (time.time() - t0) * 1000
            kw_top_k_texts = [sentences[cid][idx] for idx, _ in kw_ranked]
            kw_hit = hit_at(kw_top_k_texts, q["expect_keywords"])
            row["kw_hit"] = kw_hit
            row["kw_ms"] = round(kw_ms, 2)
            row["kw_top1"] = kw_top_k_texts[0] if kw_top_k_texts else None
            scoreboard["keyword-overlap"]["n"] += 1
            scoreboard["keyword-overlap"]["total_ms"] += kw_ms
            if kw_hit == 1:
                scoreboard["keyword-overlap"]["hit_at_1"] += 1
            if kw_hit is not None and kw_hit <= 3:
                scoreboard["keyword-overlap"]["hit_at_3"] += 1
            if kw_hit is None:
                scoreboard["keyword-overlap"]["miss"] += 1

            per_query.append(row)

    # Print human-readable summary
    print("\n=== HEAD-TO-HEAD ===")
    print(f"{'Method':<22} {'top-1 hit':<12} {'top-3 hit':<12} {'avg ms':<10}")
    for m, s in scoreboard.items():
        n = max(1, s["n"])
        avg_ms = s["total_ms"] / n
        print(f"{m:<22} {s['hit_at_1']}/{n} = {s['hit_at_1']/n*100:.1f}%   {s['hit_at_3']}/{n} = {s['hit_at_3']/n*100:.1f}%   {avg_ms:8.2f}")

    print("\n=== PER-QUERY (top-1 hit per method) ===")
    print(f"{'corpus':<6} {'L':<3} {'B':<3} {'K':<3}  query")
    for r in per_query:
        l = str(r['ltmi_hit']) if r['ltmi_hit'] else 'X'
        b = str(r['bm25_hit']) if r['bm25_hit'] else 'X'
        k = str(r['kw_hit']) if r['kw_hit'] else 'X'
        print(f"{r['corpus']:<6} {l:<3} {b:<3} {k:<3}  {r['query'][:70]}")

    # Save raw output for the doc
    out = {
        "compared_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "methods": list(methods),
        "scoreboard": {
            m: {
                "hit_at_1": s["hit_at_1"],
                "hit_at_1_pct": round(s["hit_at_1"] / max(1, s["n"]) * 100, 1),
                "hit_at_3": s["hit_at_3"],
                "hit_at_3_pct": round(s["hit_at_3"] / max(1, s["n"]) * 100, 1),
                "miss": s["miss"],
                "n": s["n"],
                "avg_ms": round(s["total_ms"] / max(1, s["n"]), 2),
            }
            for m, s in scoreboard.items()
        },
        "per_query": per_query,
    }
    (HERE / "compare_results.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    print("\nWrote compare_results.json")


if __name__ == "__main__":
    main()
