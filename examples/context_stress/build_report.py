"""Build the cross-model context-stress + chrono-vs-topo report.

Reads summary_phi.json, summary_tiny.json, summary_gemma.json from stress_out/,
produces a markdown report with cross-model comparison tables.
"""
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "stress_out"

K_LABELS = ["3", "10", "30", "ALL"]
ORDERINGS = ["relevance", "chrono", "topo"]


def fmt_cell(v: dict) -> str:
    return f"{v['lenient']}/15 = {v['lenient']/15*100:.1f}%"


def main():
    summaries = {}
    for label in ("phi", "tiny", "gemma"):
        p = OUT / f"summary_{label}.json"
        if p.exists():
            summaries[label] = json.loads(p.read_text(encoding="utf-8"))

    if not summaries:
        print("no summaries found")
        return

    print(f"=== Cross-model report ({len(summaries)} models) ===\n")

    md = []
    md.append("# Context-stress + chronological-vs-topological memory test\n")
    md.append("Same 15 LTMi-XT bench queries, same 48-locus pool (C1+C2+C3 bundles), three autoregressive edge models. For each model we sweep how many loci appear in the prompt (K) and how those loci are ordered (relevance / chrono / topo). Score = lenient grader (BPE-aware substring match on expected keywords).\n")
    md.append("**Hypothesis under test**: at large context-fill, *topological* ordering (group by breadcrumb hierarchy = related concepts adjacent) beats *chronological* (source byte offset = order seen) and *relevance* (highest-similarity first), because the model's locality bias rewards adjacent related concepts.\n")
    md.append("**Models** (all evaluated on identical inputs):")
    for label, s in summaries.items():
        name = s["model"]
        md.append(f"- `{label}` — {name}")
    md.append("")

    # ─── Mode A baselines ─────────────────────────────────
    md.append("## Mode A (no context) baselines\n")
    md.append("| Model | Strict | Lenient | Avg ms |")
    md.append("|---|---:|---:|---:|")
    for label, s in summaries.items():
        a = s["mode_A"]
        md.append(f"| {s['model']} | {a['strict']}/15 = {a['strict']/15*100:.1f}% | {a['lenient']}/15 = {a['lenient']/15*100:.1f}% | {a['avg_ms']:.0f} |")
    md.append("\nWithout context, all three models are at or near 0% (they don't know SOPHIA-XT-internal facts). Adding any RAG-style context dominates this baseline.\n")

    # ─── Per-model K × ordering matrices ──────────────────
    md.append("## Per-model K × ordering matrices (lenient hit rate)\n")
    for label, s in summaries.items():
        md.append(f"### {s['model']}\n")
        md.append("| K | relevance | chrono | topo |")
        md.append("|---:|---:|---:|---:|")
        for k in K_LABELS:
            row = [k]
            for ord_name in ORDERINGS:
                key = f"{k}/{ord_name}"
                cell = s["matrix"].get(key, {})
                if cell:
                    row.append(f"{cell['lenient']/15*100:.1f}%")
                else:
                    row.append("—")
            md.append(f"| {row[0]} | {row[1]} | {row[2]} | {row[3]} |")
        md.append("")

    # ─── Cross-model "robustness" view ────────────────────
    md.append("## Robustness: how each ordering degrades as K grows\n")
    md.append("The most informative cell. For each model + ordering, hit rate at K=3 vs K=30 vs K=ALL. Lower delta = more robust to context-stuffing.\n")
    md.append("| Model | Ordering | K=3 | K=10 | K=30 | K=ALL | K=3→K=30 delta |")
    md.append("|---|---|---:|---:|---:|---:|---:|")
    for label, s in summaries.items():
        for ord_name in ORDERINGS:
            row = [s["model"], ord_name]
            for k in K_LABELS:
                key = f"{k}/{ord_name}"
                cell = s["matrix"].get(key, {})
                row.append(f"{cell.get('lenient', '—')}/15" if cell else "—")
            # Delta
            k3 = s["matrix"].get(f"3/{ord_name}", {}).get("lenient", 0)
            k30 = s["matrix"].get(f"30/{ord_name}", {}).get("lenient", 0)
            delta = (k30 - k3) / 15 * 100
            row.append(f"{delta:+.1f} pp")
            md.append(f"| {row[0]} | {row[1]} | {row[2]} | {row[3]} | {row[4]} | {row[5]} | {row[6]} |")
    md.append("")

    md.append("## Read it honestly\n")
    md.append("This test answers two questions:\n")
    md.append("1. **Does any structure-aware ordering beat naive relevance ordering at moderate K (e.g. K=10–30)?** If yes, LTMi-XT's lattice topology pays for itself even when context isn't catastrophically stuffed.")
    md.append("2. **Where does each model break?** The K at which all orderings collapse is the model's effective context limit on this task — useful as a deployment number.\n")
    md.append("If topo > chrono > relevance at K=10/30 across multiple models, that's the LTMi-XT structural advantage *as a RAG format*, separate from its retrieval claim. If they tie, LTMi-XT's value is in retrieval (which we already showed in the v0.1 head-to-head) but not in ordering.\n")

    md_path = OUT / "stress_report.md"
    md_path.write_text("\n".join(md), encoding="utf-8")
    print(f"\nwrote {md_path}")
    print("\n---preview---")
    print("\n".join(md[:60]))


if __name__ == "__main__":
    main()
