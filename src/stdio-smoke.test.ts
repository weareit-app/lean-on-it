// Runtime smoke test: start the real server over stdio, complete the MCP
// handshake, and check the operating system reports no network socket for
// the process. It catches a server that starts listening; it is not a
// sandbox, and it does not replace process isolation or permission limits.
import { execFileSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, it } from "vitest";

let transport: StdioClientTransport | undefined;
afterEach(async () => {
  await transport?.close();
});

/** Lines describing the process's internet sockets, from lsof (macOS) or ss (Linux). */
function networkSockets(pid: number): string[] {
  try {
    const out = execFileSync(
      "lsof",
      ["-a", "-p", String(pid), "-i", "-P", "-n"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return out.split("\n").slice(1).filter(Boolean);
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 1) return []; // lsof found no matching sockets
    const out = execFileSync("ss", ["-tunap"], { encoding: "utf8" });
    return out.split("\n").filter((line) => line.includes(`pid=${pid},`));
  }
}

describe("stdio server", () => {
  it("speaks MCP over stdio and holds no network socket", async () => {
    transport = new StdioClientTransport({
      command: process.execPath,
      args: ["src/main.ts"],
      stderr: "pipe",
    });
    const client = new Client({ name: "smoke", version: "0.0.0" });
    await client.connect(transport);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toContain("health");
    const pid = transport.pid;
    expect(pid).toBeTypeOf("number");
    expect(networkSockets(pid!)).toEqual([]);
  });
});
