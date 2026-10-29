"""F2 spike, NON-PRODUCTION. Derives trailer and check-(a) cases from honest phase-1 exports and
writes build/tamper/<case>.ndjson plus expected.json. Python's hashlib recomputes a trailer only
where a case plays a fully compromised phase 1 (t06, x01). Run with `python3 -I`."""
import hashlib, json, os

F2 = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
B = os.path.join(F2, "build")
OUT = os.path.join(B, "tamper")


def trailer(body: bytes) -> bytes:
    t = {"trailer": {"lines": body.count(b"\n"), "sha256": hashlib.sha256(body).hexdigest()}}
    return json.dumps(t, separators=(",", ":")).encode() + b"\n"


def split(raw: bytes):
    lines = raw.split(b"\n")[:-1]
    return lines[:-1], lines[-1]


def main():
    os.makedirs(OUT, exist_ok=True)
    raw = open(os.path.join(B, "out", "h03-reasoning-match.ndjson"), "rb").read()
    body, tr = split(raw)
    join = lambda ls: b"".join(l + b"\n" for l in ls)
    mid = len(body) // 2
    cases = {}

    def w(name, data, expect, desc, ex="graph-comp.reasoning"):
        open(os.path.join(OUT, name + ".ndjson"), "wb").write(data)
        cases[name] = {"expect": expect, "description": desc, "exercise": ex}

    w("t00-untouched", raw, "accepted", "h03's export as phase 1 wrote it")
    w("t01-no-trailer", join(body), "infrastructure_failure", "trailer line removed")
    w("t02-line-removed", join(body[:mid] + body[mid + 1:] + [tr]), "infrastructure_failure",
      "one body line removed, trailer kept")
    i = next(k for k, l in enumerate(body) if b'"binderInfo":"default"' in l)
    altered = list(body)
    altered[i] = altered[i].replace(b'"binderInfo":"default"', b'"binderInfo":"implicit"', 1)
    w("t03-byte-altered", join(altered + [tr]), "infrastructure_failure",
      "one binder annotation changed, trailer kept")
    w("t04-truncated-mid-line", raw[: len(raw) // 2], "infrastructure_failure", "first half of the bytes")
    w("t05-theorem-line-removed", join(body[:-1] + [tr]), "infrastructure_failure",
      "the theorem's line removed, trailer kept")
    thm = json.loads(body[-1])
    thm["thm"]["value"] = thm["thm"]["type"]
    forged = body[:-1] + [json.dumps(thm, separators=(",", ":")).encode()]
    w("t06-altered-trailer-recomputed", join(forged) + trailer(join(forged)), "policy_violation:e",
      "theorem value replaced by its type, trailer recomputed (a compromised phase 1)")
    w("t07-duplicate-trailer", join(body + [tr, tr]), "infrastructure_failure", "trailer twice")
    bad = json.loads(tr)
    bad["trailer"]["sha256"] = 0
    w("t08-malformed-trailer", join(body + [json.dumps(bad).encode()]), "infrastructure_failure",
      "trailer digest is a number")
    w("t09-blank-after-trailer", raw + b"\n", "infrastructure_failure", "an empty line after the trailer")
    w("t10-line-after-trailer", raw + body[1] + b"\n", "infrastructure_failure",
      "a body line after the trailer")
    clo = open(os.path.join(B, "out", "x01-closure.leanexport.ndjson"), "rb").read()
    w("x01-closure-export", clo + trailer(clo), "policy_violation:a",
      "stock leanexport closure export of an honest proof, with a valid trailer")
    # F1's malformed-body cases (spike/f1-trusted-replay, scripts/mkcases.py), each given a valid
    # trailer, so that the body-level decoder limits run behind the trailer check.
    f1 = os.path.join(F2, "..", "f1", "build", "cases")
    for name in ["63-header-missing", "64-wrong-format-version", "65-wrong-lean-version",
                 "66-invalid-json", "67-unknown-object", "68-undefined-index", "69-duplicate-index",
                 "70-duplicate-declaration", "71-wrong-field-type", "73b-nested-json-short",
                 "74-long-line", "76-expr-depth-bomb", "77-level-depth-bomb", "78-name-depth-bomb"]:
        b = open(os.path.join(f1, name + ".ndjson"), "rb").read()
        w("d" + name, b + trailer(b), "infrastructure_failure", f"F1 case {name}, with a valid trailer")
    json.dump(cases, open(os.path.join(OUT, "expected.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
