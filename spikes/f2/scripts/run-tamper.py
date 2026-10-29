"""F2 spike, NON-PRODUCTION. Runs the phase-2 verifier alone on every build/tamper/ export and
compares with expected.json. Prints a Markdown table; exit 1 on any mismatch."""
import json, os, subprocess, sys

F2 = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T = os.path.join(F2, "build", "tamper")
V = os.path.join(F2, ".lake", "build", "bin", "f2verify")
exp = json.load(open(os.path.join(T, "expected.json")))
rows, bad, res = [], 0, []
for case in sorted(exp):
    m = exp[case]
    p = subprocess.run([V, m["exercise"], os.path.join(T, case + ".ndjson")], capture_output=True, text=True)
    v = json.loads(p.stdout.strip().splitlines()[-1])
    checks = sorted({r["check"] for r in v.get("reasons", [])})
    want = m["expect"].split(":")
    ok = v["verdict"] == want[0] and (len(want) == 1 or set(want[1].split(",")) <= set(checks)) \
        and not p.stderr.strip() and p.returncode == {"accepted": 0, "policy_violation": 1}.get(want[0], 2)
    bad += not ok
    why = "; ".join(f'({r["check"]}) {r["name"]}: {r["detail"]}' for r in v.get("reasons", [])[:2]) or v.get("error", "")
    if len(v.get("reasons", [])) > 2:
        why += f'; … {len(v["reasons"]) - 2} more'
    rows.append(f'| `{case}` | {m["description"]} | {m["expect"]} | **{v["verdict"]}** ({v["authority"]}) {",".join(checks)} | {"pass" if ok else "FAIL"} | {why.replace("|", "/")[:200]} |')
    res.append({"case": case, "exit": p.returncode, "result": v, "stderr": p.stderr, "ok": ok})
open(os.path.join(F2, "build", "tamper-results.ndjson"), "w").write("".join(json.dumps(r) + "\n" for r in res))
print("| Case | Export | Expected | Observed | Result | Reason (verifier output) |\n|---|---|---|---|---|---|")
print("\n".join(rows))
print(f"{len(rows) - bad}/{len(rows)} tamper cases as expected", file=sys.stderr)
sys.exit(1 if bad else 0)
