// The MCP server: its tools, independent of any transport.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { leanLspLaunch } from "./lean-lsp.ts";

export const SERVER_NAME = "lean-on-it";

export function createServer(): McpServer {
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

  return server;
}
