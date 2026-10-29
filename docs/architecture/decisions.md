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

## Naming

- 2026-10-28: MCP tools that this repository defines are named in kebab-case (`health`, `lean-tooling`; `lean_tooling` was renamed to `lean-tooling`). TypeScript functions, methods and tool input/output fields are camelCase; TypeScript types are PascalCase. Tools that come from wrapped upstream servers, such as `lean-lsp-mcp` (`lean_goal`, `lean_run_code`, `lean_build`, …), keep their upstream snake_case names: they are not renamed or aliased, including where this repository lists them (`DEFAULT_DISABLED_TOOLS`) or passes them to the upstream server (`LEAN_MCP_DISABLED_TOOLS`). `src/server.test.ts` checks that this server's own tool names are kebab-case.
