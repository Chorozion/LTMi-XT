#!/usr/bin/env python3
"""Crawl every public route on sophiaxt.com + key external links, HEAD-check
each, report 404s and other failures."""
from __future__ import annotations
import urllib.request, urllib.error, json
from concurrent.futures import ThreadPoolExecutor

INTERNAL = [
    # Core
    "/", "/research", "/research/ltmi-xt", "/tools/ltmi-xt",
    "/models", "/models/cassandra", "/cassandra",
    "/investors", "/faq", "/contact", "/atlas",
    "/lead-leak-scanner",
    # Services
    "/services/ai-implementation-assurance", "/services/automation-systems",
    "/services/custom-model-design-training", "/services/ai-workflow-audit",
    "/systems/ai-workflow-automation",
    "/solutions/appliance-diagnostics-ai",
    "/industries/hvac-ai-automation",
    "/solutions", "/enterprise/agentic-workflow",
    # Tools / chat
    "/chat", "/search", "/sophia-qw", "/sophia-pi-os", "/cognitrhive",
    "/easymatepdf", "/you-comic", "/q3/lotu",
    "/diagbuddy-case-study",
    # Research
    "/research/sophia-q3m", "/research/stack-architecture",
    "/research/agi-alignment", "/research/quantum-computing",
    "/research/ternary-quantum", "/research/physics",
    "/research/magnetic-confinement", "/research/spatial-comprehension",
    "/research/fluid-dynamics", "/research/kpi", "/research/ethical",
    "/research/cahokia-mounds", "/research/digital-feudalism",
    "/research/telemetric-pathfinding", "/research/ai-web",
    "/research/sophia-qw-architecture", "/research/sophia-xtq2-whitepaper",
    "/research/constillation",
    # Whitepapers
    "/whitepapers/xt-q2", "/whitepapers/nlp-hybrid",
    # Company
    "/founder", "/founder-projects", "/what-were-working-on",
    "/signup", "/legalese", "/ai-humanity-convergence",
    "/in-memoriam-nuno-loureiro",
    # API + LLM signals
    "/api/about.json", "/api/services.json", "/api/models.json",
    "/api/team.json",
    "/api/ltmi-xt", "/api/ltmi-xt/crystallize", "/api/ltmi-xt/retrieve",
    "/sitemap.xml", "/llms.txt", "/llms-full.txt", "/robots.txt",
]

EXTERNAL = [
    "https://github.com/Chorozion/LTMi-XT",
    "https://github.com/Chorozion/Casandra-t1-diffusion-edge-model",
    "https://github.com/Chorozion/LTMi-XT/blob/main/docs/benchmarks-v0.1.md",
    "https://github.com/Chorozion/LTMi-XT/blob/main/examples/benchmarks/bench_log.jsonl",
    "https://github.com/Chorozion/LTMi-XT/tree/main/examples/benchmarks/bundles",
    "https://github.com/Chorozion/LTMi-XT/blob/main/docs/file-format-spec.md",
    "https://docs.puter.com/AI/chat/",
    "https://js.puter.com/v2/",
    "https://diagbuddyai.com",
    "https://fixappliancesnow.com",
]

BASE = "https://sophiaxt.com"

def check(url: str) -> tuple[str, int, str]:
    if not url.startswith("http"):
        url = BASE + url
    try:
        req = urllib.request.Request(url, method="GET", headers={"User-Agent": "ltmi-link-check/0.1"})
        with urllib.request.urlopen(req, timeout=15) as r:
            return (url, r.status, "")
    except urllib.error.HTTPError as e:
        return (url, e.code, str(e))
    except Exception as e:
        return (url, 0, str(e))

def main():
    print(f"Checking {len(INTERNAL)} internal + {len(EXTERNAL)} external links\n")
    rows = []
    with ThreadPoolExecutor(max_workers=10) as ex:
        for url, status, err in ex.map(check, INTERNAL + EXTERNAL):
            rows.append({"url": url, "status": status, "error": err})

    bad = [r for r in rows if r["status"] >= 400 or r["status"] == 0]
    ok = [r for r in rows if r["status"] < 400 and r["status"] > 0]

    print(f"OK:  {len(ok)}/{len(rows)}")
    print(f"BAD: {len(bad)}/{len(rows)}\n")

    if bad:
        print("=== BROKEN ===")
        for r in bad:
            print(f"  {r['status']:>3}  {r['url']}")
            if r['error']:
                print(f"        {r['error'][:120]}")
        print()
    else:
        print("All links return 2xx/3xx.\n")

    print("=== ALL OK (status / url) ===")
    for r in ok:
        print(f"  {r['status']}  {r['url']}")

    open("link_check_results.json", "w", encoding="utf-8").write(json.dumps(rows, indent=2))

if __name__ == "__main__":
    main()
