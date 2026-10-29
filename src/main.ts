// Starts the server on stdio. There is no network transport: this server is
// for local clients only. Trusted workspace roots are fixed here, at start-up,
// from --trusted-root flags and LEAN_ON_IT_TRUSTED_ROOTS; with none, the
// server runs no Lean.
import { delimiter } from "node:path";
import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.ts";

const { values } = parseArgs({
  options: { "trusted-root": { type: "string", multiple: true } },
  strict: true,
});
const trustedRoots = [
  ...(values["trusted-root"] ?? []),
  ...(process.env.LEAN_ON_IT_TRUSTED_ROOTS?.split(delimiter).filter(Boolean) ??
    []),
];

await createServer({ trustedRoots }).connect(new StdioServerTransport());
