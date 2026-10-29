# Spike F1: trusted replay of an untrusted export (NON-PRODUCTION)

Research code for weareit-app/lean-on-it#10. Not part of the package, not under `src/`, not run
by `pnpm check`. The findings are in `docs/research/f1-trusted-replay.md`.

- `verifier/F1Verify.lean`: the minimal trusted verifier (`lake build` in `verifier/`).
- `lean/F1Trusted.lean`: the pinned trusted environment, a labelled copy of learn-to-prove-it's
  reasoning obligation on top of Mathlib `v4.35.0`.
- `lean/F1Sub/`, `lean/F1Forged/`: submission sources, one per source-built case.
- `scripts/mkcases.py`: copies and handcrafts the case exports into `build/cases/`.
- `scripts/run-cases.sh`, `scripts/summarize.py`: run every case, compare with expectations.
- `results/`: the recorded run.

Prerequisites: the Lean `v4.35.0` toolchain from elan, and a built Mathlib `v4.35.0`. `env.sh`
reads it, read-only, from `~/Research/weareit-app/learn-to-prove-it/.lake/packages`
(override with `LTP_PKGS`). Run everything with `./run-all.sh`.
