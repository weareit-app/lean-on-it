#!/usr/bin/env bash
# F1 spike, NON-PRODUCTION. Runs the trusted verifier and, for comparison, the stock
# `leanchecker --from-export` on every case. Records verdict, exit status, wall time and
# peak resident memory (`/usr/bin/time -l`, macOS) in build/results.ndjson.
set -uo pipefail
source "$(dirname "$0")/../env.sh"
V="$F1_DIR/verifier/.lake/build/bin/f1verify"
OUT="$F1_BUILD/results.ndjson"
: > "$OUT"
for f in "$F1_BUILD"/cases/*.ndjson; do
  case_id="$(basename "$f" .ndjson)"
  /usr/bin/time -l "$V" "$f" > "$F1_BUILD/v.out" 2> "$F1_BUILD/v.err"
  vexit=$?
  rss=$(awk '/maximum resident set size/ {print $1}' "$F1_BUILD/v.err")
  real=$(awk '/ real / {print $1}' "$F1_BUILD/v.err")
  /usr/bin/time -p leanchecker --from-export "$f" > "$F1_BUILD/l.out" 2> "$F1_BUILD/l.err"
  lexit=$?
  lmsg=$(head -c 300 "$F1_BUILD/l.out" | head -1)
  sha=$(shasum -a 256 "$f" | cut -c1-16)
  python3 -I - "$case_id" "$vexit" "$rss" "$real" "$lexit" "$lmsg" "$sha" "$F1_BUILD/v.out" "$F1_BUILD/v.err" >> "$OUT" <<'EOF'
import json, sys
case, vexit, rss, real, lexit, lmsg, sha, vout, verr = sys.argv[1:]
text = open(vout, encoding="utf-8", errors="replace").read().strip()
try:
    verdict = json.loads(text)
except ValueError:
    verdict = {"unparsable_stdout": text[:2000]}
stderr = [l for l in open(verr, encoding="utf-8", errors="replace").read().splitlines()
          if "resident" not in l and not l.strip()[:1].isdigit() and " real " not in l]
print(json.dumps({"case": case, "sha256_16": sha, "exit": int(vexit), "maxRssBytes": int(rss or 0),
                  "wallS": float(real or 0), "stderr": stderr[:5], "result": verdict,
                  "leanchecker": {"exit": int(lexit), "stdout": lmsg}}))
EOF
  echo "$case_id exit=$vexit rss=$rss real=$real leanchecker=$lexit"
done
