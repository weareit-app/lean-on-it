// How lean-on-it launches the upstream lean-lsp-mcp: one replaceable
// boundary, so the tool or its version can change without touching callers.
// Local stdio only; tools that run code or builds, or query outside search
// services, are disabled unless a caller enables them on purpose.

export const LEAN_LSP_MCP_VERSION = "0.31.0";

export const DEFAULT_DISABLED_TOOLS = [
  "lean_run_code",
  "lean_multi_attempt",
  "lean_profile_proof",
  "lean_build",
  "lean_leansearch",
  "lean_loogle",
  "lean_leanfinder",
  "lean_hammer_premise",
] as const;

export interface LeanLspLaunch {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface LeanLspOptions {
  /** The trusted Lean project the tool may read; required to launch. */
  projectPath?: string;
  /** Tools to enable despite the default list. */
  enable?: readonly string[];
}

export function leanLspLaunch(options: LeanLspOptions = {}): LeanLspLaunch {
  const enabled = new Set(options.enable ?? []);
  const disabled = DEFAULT_DISABLED_TOOLS.filter((tool) => !enabled.has(tool));
  return {
    command: "uvx",
    args: [
      `lean-lsp-mcp==${LEAN_LSP_MCP_VERSION}`,
      "--transport",
      "stdio",
      ...(options.projectPath
        ? ["--lean-project-path", options.projectPath]
        : []),
    ],
    env: { LEAN_MCP_DISABLED_TOOLS: disabled.join(",") },
  };
}
