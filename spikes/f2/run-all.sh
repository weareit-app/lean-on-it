#!/usr/bin/env bash
# F2 spike, NON-PRODUCTION. Rebuilds everything and reruns every case.
set -euo pipefail
cd "$(dirname "$0")"
source ./env.sh
# learn-to-prove-it PR #5 at a pinned commit, read with `git archive` (the checkout is not modified).
rm -rf build/ltp build/lean && mkdir -p build/ltp build/lean
git -C "$LTP_REPO" archive "$LTP_COMMIT" LearnToProveIt LearnToProveIt.lean docs/exercises \
  LearnToProveItTest | tar -x -C build/ltp
(cd build/ltp && for m in LearnToProveIt/GraphComp/Comprehension LearnToProveIt/GraphComp/Reasoning \
    LearnToProveIt/GraphComp/Transfer; do
  mkdir -p "../lean/$(dirname "$m")"
  lean -R . -o "../lean/$m.olean" -i "../lean/$m.ilean" "$m.lean"
done)
diff -u build/ltp/LearnToProveIt/Checker.lean lean/F2/CheckerL2.lean > build/checker-l2.diff || true
cmp build/checker-l2.diff checker-l2.diff
(LEAN_PATH= lake build)
# F1's cases are inputs to the d* tamper cases.
[ -d ../f1/build/cases ] || ../f1/run-all.sh
python3 -I scripts/cases.py
python3 -I scripts/evaluate.py > build/summary.md
lean -R lean_closure -o build/lean/F2Closure.olean lean_closure/F2Closure.lean
leanexport F2Closure -- LeanOnIt.Submission.proof > build/out/x01-closure.leanexport.ndjson
python3 -I scripts/tamper.py
python3 -I scripts/run-tamper.py > build/tamper-summary.md
