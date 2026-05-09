"""Context-length stress test + chronological vs topological ordering.

For each (model, query, K, ordering):
  - Pick top-K loci (or all if K=ALL)
  - Sort the selected set by `ordering`
  - Build the prompt with all K loci as FACTS
  - Generate, score with strict + lenient grader

K values: 3, 10, 30, ALL (~48 across the pooled C1+C2+C3 bundle)
Orderings:
  - chrono   : by corpus order (C1<C2<C3) then source byte offset
                = order information appears in the source document
  - topo     : by breadcrumb tuple (lexicographic; concept-grouped)
                = order by lattice/topology
  - relevance: by retrieval score (highest relevance first)

The hypothesis: at large K, topo > chrono > relevance (relevance puts the
right answer at position 0 — easy; topo groups related concepts so the
model's locality bias helps; chrono scatters the answer across irrelevant
content).
"""
from __future__ import annotations
import sys, json, time, re, random
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parent.parent
QUERIES_PATH = ROOT / "queries.json"
BUNDLE_PATHS = {cid: ROOT / f"{cid}.json" for cid in ("C1", "C2", "C3")}

SYS_PROMPT = "You are a helpful assistant. Answer the user's question concisely and accurately, based on the provided structured facts. If the answer is not in the facts, say so."

# ─── Graders ───────────────────────────────────────────────────
def hit_strict(text: str, kws: list[str]) -> bool:
    t = text.lower()
    return all(kw.lower() in t for kw in kws)

def hit_lenient(text: str, kws: list[str]) -> bool:
    no_ws = re.sub(r"\s+", "", text.lower())
    return all(re.sub(r"\s+", "", kw.lower()) in no_ws for kw in kws)

# ─── Tokenization for retrieval ───────────────────────────────
STOPWORDS = set("the a an is are was were be been being of to in on at by for with as and or but not this that these those it its what which who whom how why do does did done have has had can could will would should may might i you they them their our my me company companies each also into from over than".split())

def _tok(s: str) -> set[str]:
    return {t for t in re.split(r"[^a-z0-9]+", s.lower()) if t and t not in STOPWORDS and len(t) >= 2}


# ─── Loading + augmenting loci with chronological order ───────
CORPUS_ORDER = {"C1": 0, "C2": 1, "C3": 2}

def load_all_loci() -> list[dict]:
    """Load loci from all 3 bundles, attach corpus_id and chrono_key."""
    out = []
    for cid, path in BUNDLE_PATHS.items():
        b = json.loads(path.read_text(encoding="utf-8"))
        for l in b["loci"]:
            l = dict(l)
            l["_corpus"] = cid
            # Chronological key: corpus order × 1e6 + source byte offset start
            offset_start = (l.get("source", {}).get("offset") or [0, 0])[0]
            l["_chrono_key"] = CORPUS_ORDER[cid] * 1_000_000 + offset_start
            # Topological key: breadcrumb tuple
            l["_topo_key"] = tuple(l.get("breadcrumb", []))
            out.append(l)
    return out


def relevance_score(locus: dict, query: str) -> float:
    qt = _tok(query)
    if not qt:
        return 0.0
    haystack = " ".join(locus.get("breadcrumb", [])) + " " + locus.get("statement", "")
    ht = _tok(haystack)
    if not ht:
        return 0.0
    return len(qt & ht) / len(qt)


def select_topk(loci: list[dict], query: str, k: int | None) -> list[dict]:
    """Return loci ranked by relevance, top-K (or all if k is None)."""
    scored = [(relevance_score(l, query), l) for l in loci]
    scored.sort(key=lambda x: -x[0])
    if k is None:
        return [l for _, l in scored]
    return [l for _, l in scored[:k]]


def order_by(loci: list[dict], how: str, query: str | None = None) -> list[dict]:
    if how == "chrono":
        return sorted(loci, key=lambda l: l["_chrono_key"])
    if how == "topo":
        return sorted(loci, key=lambda l: l["_topo_key"])
    if how == "relevance":
        return sorted(loci, key=lambda l: -relevance_score(l, query or ""))
    if how == "shuffle":
        rnd = random.Random(42)
        out = list(loci)
        rnd.shuffle(out)
        return out
    raise ValueError(how)


def build_facts_prompt(query: str, loci: list[dict]) -> str:
    facts = []
    for i, l in enumerate(loci, 1):
        bc = " > ".join(l.get("breadcrumb", []))
        facts.append(f"{i}. [{bc}] {l['statement']}")
    fact_block = "\n".join(facts)
    return (
        "Use the following structured facts to answer the question. Each fact has a topic path. If the answer is not in the facts, say so.\n\n"
        f"FACTS ({len(loci)} total):\n{fact_block}\n\n"
        f"QUESTION: {query}"
    )


# ─── Stress driver ────────────────────────────────────────────
K_SWEEP = [3, 10, 30, None]   # None = ALL loci
ORDERINGS = ["relevance", "chrono", "topo"]


def run_stress(model, log_path: Path, *, max_new: int = 96, k_sweep=K_SWEEP, orderings=ORDERINGS) -> dict:
    queries = json.loads(QUERIES_PATH.read_text(encoding="utf-8"))
    all_loci = load_all_loci()
    print(f"\n[stress] {model.name} | {len(all_loci)} total loci across pooled bundles")

    log_f = log_path.open("w", encoding="utf-8")
    rows = []
    aggregate: dict[tuple[int | None, str], list[bool]] = {}

    # Mode A baseline (no context)
    print(f"\n--- mode A (no context, baseline) ---")
    a_strict, a_lenient, a_total_ms = 0, 0, 0
    for cid, qlist in queries.items():
        for q in qlist:
            full = model.chat(q["q"], system="You are a helpful assistant. Answer concisely.")
            t0 = time.time(); text = model.generate(full, max_new=max_new).strip(); dt = time.time() - t0
            a_total_ms += int(dt * 1000)
            s, l = hit_strict(text, q["expect_keywords"]), hit_lenient(text, q["expect_keywords"])
            a_strict += int(s); a_lenient += int(l)
    n_q = sum(len(v) for v in queries.values())
    print(f"  -> A: strict={a_strict}/{n_q} ({a_strict/n_q*100:.1f}%) lenient={a_lenient}/{n_q} ({a_lenient/n_q*100:.1f}%) avg {a_total_ms/n_q:.0f}ms")

    # K-sweep × orderings
    for k in k_sweep:
        for ordering in orderings:
            label = f"K={k or 'ALL'}/{ordering}"
            print(f"\n--- {label} ---")
            cell_strict, cell_lenient, cell_ms = 0, 0, 0
            for cid, qlist in queries.items():
                for q in qlist:
                    selected = select_topk(all_loci, q["q"], k)
                    if not selected:
                        continue
                    ordered = order_by(selected, ordering, query=q["q"])
                    user_msg = build_facts_prompt(q["q"], ordered)
                    full = model.chat(user_msg, system=SYS_PROMPT)
                    t0 = time.time(); text = model.generate(full, max_new=max_new).strip(); dt = time.time() - t0
                    s = hit_strict(text, q["expect_keywords"])
                    l = hit_lenient(text, q["expect_keywords"])
                    cell_strict += int(s); cell_lenient += int(l); cell_ms += int(dt * 1000)
                    rows.append({
                        "model": model.name, "k": k, "ordering": ordering,
                        "corpus": cid, "query": q["q"],
                        "expected_keywords": q["expect_keywords"],
                        "n_loci_in_context": len(ordered),
                        "first_locus": ordered[0]["statement"][:80] if ordered else None,
                        "text": text, "strict": s, "lenient": l, "ms": int(dt * 1000),
                    })
                    log_f.write(json.dumps(rows[-1], ensure_ascii=False) + "\n"); log_f.flush()
            n = sum(len(v) for v in queries.values())
            print(f"  -> {label}: strict={cell_strict}/{n} ({cell_strict/n*100:.1f}%) lenient={cell_lenient}/{n} ({cell_lenient/n*100:.1f}%) avg {cell_ms/n:.0f}ms")
            aggregate[(k, ordering)] = (cell_strict, cell_lenient, cell_ms)

    log_f.close()

    return {
        "model": model.name,
        "n_queries": n_q,
        "n_loci_pool": len(all_loci),
        "mode_A": {"strict": a_strict, "lenient": a_lenient, "avg_ms": a_total_ms / max(1, n_q)},
        "matrix": {
            f"{k or 'ALL'}/{o}": {"strict": s, "lenient": l, "avg_ms": ms / max(1, n_q)}
            for (k, o), (s, l, ms) in aggregate.items()
        },
    }


# ─── Entry point ──────────────────────────────────────────────
def main(target: str):
    from models import HFModel, GGUFModel

    out_dir = ROOT / "stress_out"
    out_dir.mkdir(exist_ok=True)
    summary_path = out_dir / f"summary_{target}.json"
    log_path = out_dir / f"stress_{target}.jsonl"

    if target == "phi":
        m = HFModel("microsoft/Phi-3-mini-4k-instruct")
        # Phi-3 has 4K context, ALL=48 loci × ~30 tokens each = ~1440 tokens, OK
    elif target == "tiny" or target == "tinyllama":
        m = HFModel("TinyLlama/TinyLlama-1.1B-Chat-v1.0")
        # TinyLlama has 2K context, ALL=48 × 30 = 1440 tokens, tight but OK
    elif target == "gemma" or target == "gemma4":
        # Gemma 4 has 128K native context — give it room
        m = GGUFModel(
            "D:/Downloads new/Gemma-4-E2B-Uncensored-HauhauCS-Aggressive-Q6_K_P.gguf",
            n_ctx=8192, n_gpu_layers=0,
        )
    else:
        raise ValueError(target)

    summary = run_stress(m, log_path)
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"\n[done] summary -> {summary_path}")
    print(f"[done] log -> {log_path}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "phi")
