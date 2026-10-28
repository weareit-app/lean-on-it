// Starts the server on stdio. There is no network transport: this server is
// for local clients only.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.ts";

await createServer().connect(new StdioServerTransport());
