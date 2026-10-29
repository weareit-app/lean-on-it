"""F2 spike, NON-PRODUCTION. Plays the trusted runner of #9 for every case, without a sandbox:

  phase 1  f2phase1 <exercise> <submission> <export>   (runs the learner's code; untrusted)
  phase 2  f2verify <exercise> <export>                (trusted; never sees the submission)
  classify from phase 2's output only; phase 1's stdout decides nothing, except that a phase-1
  rejection with no export is reported as `rejected`, authority `advisory`.

Writes build/results.ndjson and prints a Markdown table; exit 1 if any case differs from
build/cases/cases.json. Run with `python3 -I scripts/evaluate.py` after `source env.sh`.
"""
import json, os, re, subprocess, sys, time

F2 = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
B = os.path.join(F2, "build")
P1 = os.path.join(F2, ".lake", "build", "bin", "f2phase1")
P2 = os.path.join(F2, ".lake", "build", "bin", "f2verify")
MARK = "F2-LEARNER-CODE-RAN"


def timed(cmd):
    t = time.monotonic()
    p = subprocess.run(["/usr/bin/time", "-l"] + cmd, capture_output=True, text=True, timeout=600)
    rss = re.search(r"(\d+)\s+maximum resident set size", p.stderr)
    err = "\n".join(l for l in p.stderr.splitlines()
                    if not re.match(r"\s*\d+\s+\S", l) and " real " not in l)
    return p.returncode, p.stdout, err, time.monotonic() - t, int(rss.group(1)) if rss else 0


def last_json(text):
    for line in reversed(text.strip().splitlines()):
        try:
            return json.loads(line)
        except ValueError:
            continue
    return None


def classify(export_exists, p1_out, v):
    if export_exists:
        return v.get("verdict", "infrastructure_failure"), v.get("authority", "runtime")
    p1 = last_json(p1_out) or {}
    if p1.get("phase1") == "rejected":
        return "rejected", "advisory"
    return "infrastructure_failure", "runtime"


def main():
    cases = json.load(open(os.path.join(B, "cases", "cases.json")))
    os.makedirs(os.path.join(B, "out"), exist_ok=True)
    order = sorted(cases, key=lambda c: (c[0] != "h", c))  # honest first: f04 reuses h01's export
    rows, bad, results = [], 0, []
    for case in order:
        m = cases[case]
        sub = os.path.join(B, "cases", case + ".lean")
        out = os.path.join(B, "out", case + ".ndjson")
        text = open(sub, encoding="utf-8").read()
        if "@OUT@" in text:
            text = text.replace("@OUT@", out).replace(
                "@COMP_EXPORT@", os.path.join(B, "out", "h01-comprehension-tactic.ndjson"))
            sub = os.path.join(B, "out", case + ".lean")
            open(sub, "w", encoding="utf-8").write(text)
        if os.path.exists(out):
            os.remove(out)
        c1, o1, e1, w1, r1 = timed([P1, m["exercise"], sub, out])
        exists = os.path.exists(out)
        v, c2, e2, w2, r2 = {}, None, "", 0.0, 0
        if exists:
            c2, o2, e2, w2, r2 = timed([P2, m["exercise"], out])
            v = last_json(o2) or {"verdict": "unparsable"}
        cat, auth = classify(exists, o1, v)
        checks = sorted({r["check"] for r in v.get("reasons", [])})
        exp = m["expect"].split(":")
        ok = cat == exp[0] and (len(exp) == 1 or set(exp[1].split(",")) <= set(checks))
        ok = ok and (cat != "accepted" or (auth == "verified" and c2 == 0))
        ok = ok and MARK not in e2 and not e2.strip()
        bad += not ok
        p1 = last_json(o1) or {}
        ran = (e1.count(MARK), e2.count(MARK))
        why = "; ".join(f'({r["check"]}) {r["name"]}: {r["detail"]}' for r in v.get("reasons", [])[:2]) \
            or v.get("error", "") or (p1.get("kind", "") + (": " + p1["detail"][:150] if p1.get("detail") else ""))
        res = {"case": case, "exercise": m["exercise"], "expect": m["expect"], "category": cat,
               "authority": auth, "ok": ok, "phase1": {"exit": c1, "stdoutLastLine": o1.strip().splitlines()[-1:],
               "stdoutLines": len(o1.strip().splitlines()), "stderr": e1[-500:], "wallS": round(w1, 2), "maxRss": r1},
               "export": {"exists": exists, "bytes": os.path.getsize(out) if exists else 0},
               "phase2": {"exit": c2, "result": v, "stderr": e2[-500:], "wallS": round(w2, 2), "maxRss": r2},
               "learnerCodeRan": {"phase1": ran[0], "phase2": ran[1]}}
        results.append(res)
        ex = v.get("export", {})
        rows.append(f'| `{case}` | {m["exercise"].split(".")[1]} | {m["description"]} | {m["expect"]} | '
                    f'{p1.get("phase1", "—")}{" (" + p1["kind"] + ")" if p1.get("kind") else ""} '
                    f'| {"yes, " + str(res["export"]["bytes"]) + " B, " + str(ex.get("constants", "?")) + " consts, " + str(ex.get("trustedNamed", "?")) + " trusted" if exists else "no"} '
                    f'| **{cat}** ({auth}) {",".join(checks)} | {"pass" if ok else "FAIL"} | '
                    f'{why.replace("|", "/").replace(chr(10), " ")[:220]} | {w1:.1f} / {w2:.1f} |')
        print(case, cat, auth, checks, "ok" if ok else "FAIL", file=sys.stderr)
    with open(os.path.join(B, "results.ndjson"), "w") as f:
        for r in results:
            f.write(json.dumps(r) + "\n")
    print("| Case | Exercise | Submission | Expected | Phase 1 (advisory) | Export | Final category | Result | Reason | Wall s (p1 / p2) |")
    print("|---|---|---|---|---|---|---|---|---|---|")
    print("\n".join(rows))
    print(f"{len(rows) - bad}/{len(rows)} cases as expected", file=sys.stderr)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
