# Architecture decisions

The one record of this repository's decisions, newest last within each section. Changing an agreed choice in `AGENTS.md` adds a dated entry here.

## Starting point

Decided when the repository was generated (see its first commit).

- Visibility: public.
- Licence. Repository: Apache-2.0.
- TypeScript on Node 24.21.0 with pnpm 11.25.0: strict TypeScript run through Node's type stripping (no build step), Biome for formatting and lint, Vitest for tests.
- Local stdio only. No network listener and no public code-execution endpoint.
- A successful Lean build is not a statement-fidelity review; keep the two statuses separate.
- Lean mathematics never imports this toolkit.
- Decisions live in this file; `docs/adr/` is not used, and `tools/decision-records/check-no-adr-folder.mjs` fails if it exists.

## 2026-10-28: Verification and fidelity evidence manifest

Spec: weareit-app/lean-on-it#1.

- Issues and specs move from local Markdown under `.scratch/` to GitHub Issues on `weareit-app/lean-on-it` (`docs/agents/issue-tracker.md`). Specs carry the `spec` label; tickets are sub-issues with native blocking edges.
- Evidence is an **evidence manifest** (schema `lean-on-it/evidence-manifest`, version `1.0.0`, `schemas/`) with four separate records: intended claim, formal declaration, verification run, fidelity reviews. Terms are in `GLOSSARY.md`.
- Statuses are derived from the records and checked on every validation; a manifest whose stated status differs from the derived one is invalid. Kernel status is never an input to fidelity status, so a successful Lean run cannot approve fidelity.
- Kernel-checked needs every step passed, the elaborated type, axioms and dependency closure captured, and only allowed axioms (default `propext`, `Classical.choice`, `Quot.sound`). Missing evidence gives `incomplete`, never success.
- Approved fidelity needs a current, blind, independent human review with a faithful verdict. A review is current only while both statements it compared are unchanged: it records the elaborated-type digest and the digest of the whole intended claim (canonical JSON), and a change to either makes it stale. Validation also recomputes the elaborated-type digest from the recorded text and rejects a mismatch. An AI-only faithful review gives at most `ai_screened` (VALIDATION G2). lean-on-it and the run's operator cannot review. Any current not-faithful verdict gives `rejected`.
- Verification is read-only and never builds or fetches: `lake build --no-build`, fresh elaboration of the declaring module, an inspection probe in a private run directory, and `leanchecker`. Imports load from the workspace's existing build outputs; the manifest says so. Kernel-checked needs `leanchecker --fresh` (module and all imports); a faster module-only replay is recorded and derives `incomplete`.
- Trusted workspace roots are fixed by the operator at start-up (CLI flags, `LEAN_ON_IT_TRUSTED_ROOTS`, or the MCP server's start-up flags), never by a tool call. Paths are canonicalized before the containment check; names are validated and the declaration name reaches Lean through an environment variable, not source text. Lean subprocesses get an allowlisted environment and per-step time and output caps. Manifests and logs replace host paths with placeholders.
- This repository's own MCP tools are kebab-case (`verify-declaration`, `validate-manifest`), following the naming decision in weareit-app/lean-on-it#7, which renames the existing `lean_tooling`.
- MCP stays stdio-only; `verify-declaration` refuses every call when no roots are configured. The lean-lsp-mcp disabled-tools list is unchanged.
- Manifests carry sha256 digests, not signatures; signing is later work.
