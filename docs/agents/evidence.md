# Evidence manifests

How to produce, review and check verification and fidelity evidence. Terms are defined in `GLOSSARY.md`; the decisions behind them are the 2026-10-28 entry in `docs/architecture/decisions.md`.

## Verify

```sh
pnpm lean-on-it verify --trusted-root <root> --workspace <lake-project> \
  --module <Module> --declaration <Full.Name> --claim <claim.json> --out <dir>
```

- The workspace must lie inside a `--trusted-root` (or a root in `LEAN_ON_IT_TRUSTED_ROOTS`, `:`-separated). Only use roots you trust: Lean runs the project's own code with your permissions.
- Build the workspace yourself first (`lake exe cache get`, `lake build`). The run never builds or fetches; stale outputs make it `incomplete`.
- `--out` must be outside the workspace and empty. It receives `manifest.json` and every artifact it lists (logs, the generated probe, the dependency closure), each with a sha256 digest.
- `--kernel-replay module` replays only the module's own declarations. It is much faster than the default `fresh`, but the run is then `incomplete`, never kernel-checked: imports were not re-checked.
- Exit code: 0 kernel-checked, 1 rejected, 2 incomplete, 64 refused before anything ran.

The claim file is the manifest's `claim` record (see `schemas/evidence-manifest-1.0.0.schema.json`). Write it from the source, not from the Lean statement, and record where it came from.

## Review

A fidelity review is a separate act by someone other than the formalizer and the run's operator. Read the elaborated type (`declaration.elaboratedType.explicit`) before reading the intended claim, write a readback of what it says, then compare.

```sh
pnpm lean-on-it review <bundle-dir> <review.json>
```

The review binds two statements, so it names two digests, both printed by `validate`: `reviewedTypeDigest`, the sha256 of the elaborated type's explicit text, and `reviewedClaimDigest`, the sha256 of the intended claim record in canonical JSON (keys sorted, no whitespace; the same as `jq -S -c`). Changing either the Lean statement or the claim, even under the same claim id, makes the review stale. File each discrepancy as a typed finding (`missing_hypothesis`, `added_or_restrictive_hypothesis`, `quantifier_mismatch`, `definitional_mismatch`, `conclusion_mismatch`, `vacuity`, `undetermined`). Only a blind, independent human `faithful` verdict approves; an AI review screens.

## Validate

```sh
pnpm lean-on-it validate <bundle-dir>
```

Checks the schema, that the stated statuses are the ones the records support, and every artifact digest. CI validates the committed bundles under `evidence/`.

## MCP

Start the server with roots and, optionally, your identity: `node src/main.ts --trusted-root <root> --operator <id>`. It speaks stdio only. `verify-declaration` returns the manifest and its artifacts (left out above 4 MiB; the digests stay in the manifest) and refuses every call when no root is configured; errors other than refusals are reported without detail, so host paths stay on the server. `validate-manifest` runs nothing.

## Known limits

- The probe's per-run nonce reaches Lean through an environment variable, so code in a trusted workspace could read it and forge a probe record. The nonce guards against stale or stray output, not against the workspace itself; that is what workspace trust is for.
- Nothing records who formalized a declaration; a reviewer's `participatedInFormalization` is their own disclosure.
