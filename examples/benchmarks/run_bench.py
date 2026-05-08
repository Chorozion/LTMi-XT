#!/usr/bin/env python3
"""LTMi-XT v0.1 benchmark runner.

Hits the live production endpoint at sophiaxt.com and records every
measurement to bench_log.jsonl. The doc that summarizes the run reads
from this log so anyone can reproduce or audit.

Honest scope: small-N, single deployment (sophiaxt.com), single LLM
(mercury-2 via Inception Labs), single rate-limited IP. Numbers are not
generalizable — they describe THIS deployment AT THIS TIME.
"""
from __future__ import annotations
import json
import os
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

API_BASE = "https://sophiaxt.com/api/ltmi-xt"
HERE = Path(__file__).parent
LOG_PATH = HERE / "bench_log.jsonl"
BUNDLES_DIR = HERE / "bundles"
BUNDLES_DIR.mkdir(exist_ok=True)


def post_json(path: str, body: dict, timeout: int = 120) -> tuple[int, dict, float]:
    """Returns (status_code, response_json, elapsed_seconds)."""
    url = API_BASE + path
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={"Content-Type": "application/json", "User-Agent": "ltmi-bench/0.1"},
    )
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            elapsed = time.time() - t0
            return resp.status, json.loads(resp.read().decode("utf-8")), elapsed
    except urllib.error.HTTPError as e:
        elapsed = time.time() - t0
        try:
            payload = json.loads(e.read().decode("utf-8"))
        except Exception:
            payload = {"error": "non-json error response", "status": e.code}
        return e.code, payload, elapsed


def log(record: dict) -> None:
    record["ts"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    with LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")
    print(json.dumps({"event": record.get("event"), **{k: v for k, v in record.items() if k in ("corpus", "ms", "loci", "topics", "topK", "hit")}}))


def crystallize(corpus_id: str, text: str) -> dict | None:
    print(f"[crystallize] {corpus_id} ({len(text)} chars)…")
    status, payload, elapsed = post_json("/crystallize", {"text": text, "label": corpus_id})
    log({
        "event": "crystallize",
        "corpus": corpus_id,
        "input_chars": len(text),
        "status": status,
        "ms": int(elapsed * 1000),
        "success": payload.get("success", False),
        "error": payload.get("error") if not payload.get("success") else None,
        "loci": len(payload.get("loci", [])) if payload.get("success") else 0,
        "topics_distinct": len(set(l["breadcrumb"][0] for l in payload.get("loci", []))) if payload.get("success") else 0,
    })
    if status == 200 and payload.get("success"):
        with (BUNDLES_DIR / f"{corpus_id}.json").open("w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
        return payload
    return None


def retrieve(corpus_id: str, bundle: dict, query: str, expect_keywords: list[str], k: int = 6) -> dict:
    body = {
        "query": query,
        "bundle": {"manifest": bundle["manifest"], "loci": bundle["loci"]},
        "k": k,
    }
    status, payload, elapsed = post_json("/retrieve", body, timeout=60)
    if not payload.get("success"):
        log({
            "event": "retrieve",
            "corpus": corpus_id,
            "query": query,
            "status": status,
            "ms": int(elapsed * 1000),
            "success": False,
            "error": payload.get("error"),
        })
        return {"hit_at": None, "results": []}

    results = payload.get("results", [])
    expected_lower = [kw.lower() for kw in expect_keywords]
    hit_at = None
    for i, r in enumerate(results):
        haystack = (r["statement"] + " " + " ".join([b for b in r["breadcrumb"] if b])).lower()
        if all(kw in haystack for kw in expected_lower):
            hit_at = i + 1
            break

    log({
        "event": "retrieve",
        "corpus": corpus_id,
        "query": query,
        "status": status,
        "ms": int(elapsed * 1000),
        "success": True,
        "topK": len(results),
        "hit": hit_at,
        "expected": expect_keywords,
        "top1_statement": results[0]["statement"] if results else None,
        "top1_breadcrumb": [b for b in results[0]["breadcrumb"] if b] if results else None,
    })
    return {"hit_at": hit_at, "results": results}


def main():
    LOG_PATH.write_text("", encoding="utf-8")
    log({"event": "run_start", "endpoint": API_BASE})

    queries = json.loads((HERE / "queries.json").read_text(encoding="utf-8"))

    # Crystallize each corpus once, with delay between to avoid rate-limit edge cases.
    bundles: dict[str, dict] = {}
    for cid in ["C1", "C2", "C3"]:
        text = (HERE / "corpora" / f"{cid}-cold-storage.md").read_text(encoding="utf-8") if cid == "C1" else \
               (HERE / "corpora" / f"{cid}-architecture-spec.md").read_text(encoding="utf-8") if cid == "C2" else \
               (HERE / "corpora" / f"{cid}-mixed-memo.md").read_text(encoding="utf-8")
        text = text.strip()
        bundle = crystallize(cid, text)
        if bundle:
            bundles[cid] = bundle
        time.sleep(2)  # be polite

    # Retrieve queries.
    summary = {"corpora": {}, "totals": {"queries": 0, "hit_at_1": 0, "hit_at_3": 0, "miss": 0}}
    for cid, qlist in queries.items():
        if cid not in bundles:
            continue
        cstats = {"loci": len(bundles[cid]["loci"]), "topics": len(set(l["breadcrumb"][0] for l in bundles[cid]["loci"])), "queries": []}
        for q in qlist:
            r = retrieve(cid, bundles[cid], q["q"], q["expect_keywords"], k=6)
            cstats["queries"].append({
                "q": q["q"],
                "hit_at": r["hit_at"],
                "expected": q["expect_keywords"],
            })
            summary["totals"]["queries"] += 1
            if r["hit_at"] == 1:
                summary["totals"]["hit_at_1"] += 1
            if r["hit_at"] is not None and r["hit_at"] <= 3:
                summary["totals"]["hit_at_3"] += 1
            if r["hit_at"] is None:
                summary["totals"]["miss"] += 1
            time.sleep(1)
        summary["corpora"][cid] = cstats

    log({"event": "run_end", "summary": summary})
    print("\n--- SUMMARY ---")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
