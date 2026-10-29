# Spike F2: new-only export from the actual checker (NON-PRODUCTION)

Research code for weareit-app/lean-on-it#12. Not part of the package, not under `src/`, not run
by `pnpm check`. Findings: `docs/research/f2-new-only-export.md`.

- `lean/F2/CheckerL2.lean`: LABELLED COPY of learn-to-prove-it PR #5's `LearnToProveIt/Checker.lean`
  (commit 75590c0c…, sha256 adcf55a4…), standing in for L2. `checker-l2.diff` is every difference.
- `lean/F2/NewOnlyExport.lean`: new-only exporter on `LeanExport.Basic`, with the trailer.
- `lean/F2Phase1.lean`: phase-1 driver (`f2phase1 <exercise> <submission> <out>`).
- `lean/F2Verify.lean`: copy of F1's verifier (spike/f1-trusted-replay @ 76c99bb), adapted;
  `verifier-f2.diff` is every difference.
- `lean/F2/Sha256.lean`, `lean/F2Sha.lean`: SHA-256 for the trailer, and a check tool.
- `scripts/`: `cases.py` (submissions), `evaluate.py` (the trusted runner), `tamper.py` and
  `run-tamper.py` (trailer and check (a) cases on exports).
- `results/`: the recorded run.

Prerequisites as for F1 (`../f1/README.md`), plus the learn-to-prove-it checkout with PR #5's
commit fetched. Run `./run-all.sh`.
