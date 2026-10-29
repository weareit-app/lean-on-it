# F1 spike, NON-PRODUCTION. Source this file: sets the toolchain and a read-only LEAN_PATH.
# Mathlib v4.35.0 is used read-only from the learn-to-prove-it checkout's built packages.
F1_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
TC="${TC:-$HOME/.elan/toolchains/leanprover--lean4---v4.35.0}"
LTP_PKGS="${LTP_PKGS:-$HOME/Research/weareit-app/learn-to-prove-it/.lake/packages}"
F1_BUILD="${F1_BUILD:-$F1_DIR/build}"
LEAN_PATH="$TC/lib/lean"
for p in mathlib batteries aesop Qq plausible proofwidgets importGraph LeanSearchClient Cli; do
  LEAN_PATH="$LEAN_PATH:$LTP_PKGS/$p/.lake/build/lib/lean"
done
LEAN_PATH="$LEAN_PATH:$F1_BUILD/lean"
export F1_DIR TC LTP_PKGS F1_BUILD LEAN_PATH
export PATH="$TC/bin:$PATH"
