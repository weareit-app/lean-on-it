#!/usr/bin/env bash
# F1 spike, NON-PRODUCTION. Rebuilds everything and reruns every case.
set -euo pipefail
cd "$(dirname "$0")"
source ./env.sh
scripts/build-fixtures.sh
(cd verifier && LEAN_PATH= lake build)
python3 -I scripts/mkcases.py
scripts/run-cases.sh
python3 -I scripts/summarize.py > build/summary.md
lean --run scripts/EnvStats.lean > build/env-stats.txt
lean --run scripts/BinderDiag.lean build/exports/F1Sub.NativeDecide.ndjson > build/binder-diag.txt
