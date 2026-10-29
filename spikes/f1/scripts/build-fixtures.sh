#!/usr/bin/env bash
# F1 spike, NON-PRODUCTION. Elaborates the trusted fixture and every submission source, then
# writes one export per submission with the toolchain's `leanexport`.
set -euo pipefail
source "$(dirname "$0")/../env.sh"
mkdir -p "$F1_BUILD/lean/F1Sub" "$F1_BUILD/lean/F1Forged" "$F1_BUILD/exports"
cd "$F1_DIR/lean"
lean -R . -o "$F1_BUILD/lean/F1Trusted.olean" F1Trusted.lean
for f in F1Sub/*.lean F1Forged/*.lean; do
  m="${f%.lean}"
  echo "== elaborate $m"
  lean -R . -o "$F1_BUILD/lean/$m.olean" "$f" || echo "   (lean exit $?)"
done
for f in F1Sub/*.lean F1Forged/*.lean; do
  m="${f%.lean}"; mod="${m//\//.}"; out="$F1_BUILD/exports/${mod}.ndjson"
  leanexport "$mod" -- LeanOnIt.Submission.proof > "$out"
  echo "== export $mod: $(wc -c < "$out") bytes, $(wc -l < "$out") lines"
done
# Trusted reference data for the obligation alone (its dependency closure).
leanexport F1Trusted -- LearnToProveIt.GraphComp.Reasoning.obligation \
  > "$F1_BUILD/exports/F1Trusted.obligation.ndjson"
echo "== export obligation closure: $(wc -c < "$F1_BUILD/exports/F1Trusted.obligation.ndjson") bytes"
