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
