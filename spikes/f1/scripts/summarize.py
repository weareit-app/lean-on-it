"""F1 spike, NON-PRODUCTION. Compares build/results.ndjson with build/cases/expected.json and
prints a Markdown table. Exit status 1 if any case's outcome differs from its expectation."""
import json, os, sys
F1 = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
exp = json.load(open(os.path.join(F1, "build", "cases", "expected.json")))
rows, bad = [], 0
for line in open(os.path.join(F1, "build", "results.ndjson")):
    r = json.loads(line)
    e = exp[r["case"]]
    res = r["result"]
    verdict = res.get("verdict", "?")
    checks = sorted({x["check"] for x in res.get("reasons", [])})
    if e["expected"] == "accepted":
        ok = verdict == "accepted" and r["exit"] == 0
    elif e["expected"] == "decoder":
        ok = verdict == "infrastructure_failure" and r["exit"] == 2 and "decoder:" in res.get("error", "")
    else:
        want = set(e["expected"].split(","))
        # The kernel must run exactly when (e) is the only expected reason.
        ok = (verdict == "refused" and r["exit"] == 1 and want <= set(checks)
              and res.get("kernelRan") == (want == {"e"}))
    ok = ok and not r["stderr"]  # no panic or other diagnostic on stderr
    bad += not ok
    if res.get("reasons"):
        why = "; ".join(f'({x["check"]}) {x["name"]}: {x["detail"]}' for x in res["reasons"][:3])
        if len(res["reasons"]) > 3:
            why += f"; … {len(res['reasons']) - 3} more"
    else:
        why = res.get("error", "")
    why = why.replace("|", "\\|").replace("\n", " ")[:260]
    lc = "accepts" if r["leanchecker"]["exit"] == 0 else "rejects"
    rows.append(f'| `{r["case"]}` | {e["description"]} | {e["expected"]} | **{verdict}** {",".join(checks)} | {"pass" if ok else "FAIL"} | {why} | {lc} | {r["wallS"]:.2f} | {r["maxRssBytes"]/2**20:.0f} |')
print("| Case | Export | Expected | Observed | Result | Stated reason (verifier output) | `leanchecker --from-export` | Wall s | Peak RSS MiB |")
print("|---|---|---|---|---|---|---|---|---|")
print("\n".join(rows))
print(f"\n{len(rows) - bad}/{len(rows)} cases as expected", file=sys.stderr)
sys.exit(1 if bad else 0)
