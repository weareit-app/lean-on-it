# lean-on-it

Local-first Lean formalization, verification and provenance tooling, wrapping pinned upstream tools.

Status: early. The first feature, verification and fidelity evidence, works locally; see `docs/agents/evidence.md`.

## Evidence manifests

`lean-on-it verify` checks one Lean declaration in a trusted workspace, read-only, and writes an evidence manifest that keeps the intended claim, the formal declaration, the verification run and any fidelity reviews as separate records. A successful run records kernel evidence only; fidelity stays `not_reviewed` until an independent review is attached with `lean-on-it review`.

```sh
pnpm lean-on-it verify --trusted-root ~/Research/weareit-app \
  --workspace ~/Research/weareit-app/learn-to-prove-it \
  --module LearnToProveIt.Basic --declaration LearnToProveIt.graph_comp_iff \
  --claim fixtures/claims/learn-to-prove-it-graph-comp-iff.json \
  --out /tmp/evidence
pnpm lean-on-it validate evidence/learn-to-prove-it/LearnToProveIt.graph_comp_iff
```

The first real manifest is in `evidence/learn-to-prove-it/`.

## Getting started

```sh
pnpm install
pnpm check
```

`pnpm check` runs typecheck, Biome, the Vitest tests, and the skills-sync and decision-record checks.

## Licence

- Repository: Apache-2.0.
