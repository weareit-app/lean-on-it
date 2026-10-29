// Starts the server on stdio. There is no network transport: this server is
// for local clients only. Trusted workspace roots and the operator's identity
// are fixed here, at start-up, from --trusted-root and --operator flags and
// LEAN_ON_IT_TRUSTED_ROOTS; with no roots, the server runs no Lean.
import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.ts";
import { operatorTrustedRoots } from "./verify/trusted-workspace.ts";

const { values } = parseArgs({
  options: {
    "trusted-root": { type: "string", multiple: true },
    operator: { type: "string" },
  },
  strict: true,
});

await createServer({
  trustedRoots: operatorTrustedRoots(values["trusted-root"], process.env),
  operator: values.operator ?? null,
}).connect(new StdioServerTransport());
