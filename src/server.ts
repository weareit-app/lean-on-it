// The MCP server: its tools, independent of any transport.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { claimSchema } from "./evidence/manifest.ts";
import { validateManifest } from "./evidence/validate.ts";
import { leanLspLaunch } from "./lean-lsp.ts";
import type { CommandRunner } from "./verify/command-runner.ts";
import { AccessDenied } from "./verify/trusted-workspace.ts";
import { InvalidRequest, verifyDeclaration } from "./verify/verify.ts";

/** Larger artifact sets are left out of a tool result; their digests remain. */
const MAX_INLINE_ARTIFACT_BYTES = 4 * 1024 * 1024;

export const SERVER_NAME = "lean-on-it";

export interface ServerOptions {
  /**
   * Roots the operator trusts, fixed when the server starts. With none,
   * verify-declaration refuses every call and no Lean runs.
   */
  trustedRoots?: readonly string[];
  /** Who runs verifications; recorded so they cannot later review fidelity. */
  operator?: string | null;
  /** Substitutes the process runner, for tests. */
  runner?: CommandRunner;
}

const toolError = (message: string) => ({
  isError: true,
  content: [{ type: "text" as const, text: message }],
});

export function createServer(options: ServerOptions = {}): McpServer {
  const trustedRoots = [...(options.trustedRoots ?? [])];
  const server = new McpServer({ name: SERVER_NAME, version: "0.0.0" });
  server.registerTool(
    "health",
    {
      title: "Health",
      description: "Reports that the server is running, and its name.",
    },
    async () => ({
      content: [{ type: "text", text: `${SERVER_NAME} is running` }],
    }),
  );
  server.registerTool(
    "lean_tooling",
    {
      title: "Lean tooling",
      description:
        "Reports how the pinned lean-lsp-mcp would be launched, and which of its tools are disabled. Runs nothing.",
    },
    async () => ({
      content: [{ type: "text", text: JSON.stringify(leanLspLaunch()) }],
    }),
  );
  server.registerTool(
    "verify-declaration",
    {
      title: "Verify a declaration",
      description:
        "Runs a read-only verification of one Lean declaration in a workspace inside the operator's trusted roots, and returns the evidence manifest and its artifacts (logs, probe, dependency closure), each listed in the manifest by digest. Records kernel evidence only: fidelity stays not reviewed until an independent review is attached. Refuses workspaces outside the trusted roots before running anything.",
      inputSchema: z.strictObject({
        workspace: z.string().describe("Absolute path of the Lake project"),
        module: z.string().describe("Module declaring it, e.g. Foo.Basic"),
        declaration: z.string().describe("Fully qualified declaration name"),
        claim: claimSchema.describe("The intended claim it should capture"),
        kernelReplay: z.enum(["fresh", "module"]).optional(),
      }),
    },
    async (args) => {
      try {
        const { manifest, artifacts } = await verifyDeclaration({
          trustedRoots,
          workspace: args.workspace,
          module: args.module,
          declaration: args.declaration,
          claim: args.claim,
          operator: options.operator ?? null,
          ...(args.kernelReplay ? { kernelReplay: args.kernelReplay } : {}),
          ...(options.runner ? { runner: options.runner } : {}),
        });
        const bytes = artifacts.reduce(
          (n, a) => n + Buffer.byteLength(a.content),
          0,
        );
        const result =
          bytes <= MAX_INLINE_ARTIFACT_BYTES
            ? { manifest, artifacts }
            : {
                manifest,
                artifacts: null,
                note: `artifacts (${bytes} bytes) exceed the inline limit; run the CLI to write the full bundle`,
              };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        // Refusals carry only what the caller sent; anything else could name
        // host paths, so it is reported without detail.
        return toolError(
          error instanceof AccessDenied || error instanceof InvalidRequest
            ? error.message
            : "verification failed with an internal error; see the server's stderr",
        );
      }
    },
  );
  server.registerTool(
    "validate-manifest",
    {
      title: "Validate an evidence manifest",
      description:
        "Checks an evidence manifest's schema and that its stated kernel and fidelity statuses are the ones its records support. Runs nothing.",
      inputSchema: z.strictObject({ manifest: z.unknown() }),
    },
    async ({ manifest }) => {
      const result = validateManifest(manifest);
      return result.ok
        ? {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  ok: true,
                  status: result.manifest.status,
                }),
              },
            ],
          }
        : toolError(JSON.stringify({ ok: false, errors: result.errors }));
    },
  );

  return server;
}
