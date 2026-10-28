# Dependencies

Versions are pinned exactly. A new or upgraded dependency is the newest release at least two weeks old, unless a note here says why not. Review a new dependency's source, licence and install scripts before adding it, and record it here.

- Node 24.21.0 and pnpm 11.25.0, pinned in `mise.toml` and `packageManager`; `mise` is optional.
- Tooling: `@biomejs/biome` 2.5.15, `@types/node` 24.19.2, `typescript` 5.9.3, `vitest` 5.0.5.
- `@modelcontextprotocol/sdk` 1.32.1 (MIT, released 2026-10-05; 1.32.2 was too new on 2026-10-28) with `zod` 4.6.7. Only its stdio transport is used. The SDK also depends on HTTP server packages (express, hono) for transports this repository does not use.
- `lean-lsp-mcp` 0.31.0 (MIT, Python, released 2026-09-30; 0.32.0 was too new on 2026-10-28), run through `uvx` at that exact version, not an npm dependency. Needs `uv` and a Lean toolchain (`elan`) only when a caller actually launches it.
