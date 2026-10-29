# F2 spike, NON-PRODUCTION. Source this file. Extends F1's env.sh (toolchain and the read-only
# Mathlib v4.35.0 from the learn-to-prove-it checkout) with F2's build of PR #5's modules.
F2_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
source "$F2_DIR/../f1/env.sh"
LTP_REPO="${LTP_REPO:-$HOME/Research/weareit-app/learn-to-prove-it}"
LTP_COMMIT=75590c0c628162727fb3d60632e46a4cd4de5706
export F2_DIR LTP_REPO LTP_COMMIT
export LEAN_PATH="$LEAN_PATH:$F2_DIR/build/lean"
