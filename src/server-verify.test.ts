// The MCP seam for evidence tools, through the SDK's in-memory client. A
// substituted runner records whether any process would have started.
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeEach, describe, expect, it } from "vitest";
import { sampleManifest } from "./evidence/sample-manifest.ts";
import { DEFAULT_DISABLED_TOOLS, leanLspLaunch } from "./lean-lsp.ts";
import { createServer, type ServerOptions } from "./server.ts";
import type { CommandRunner } from "./verify/command-runner.ts";

const FIXTURE = new URL("../fixtures/lean/core-sample", import.meta.url)
  .pathname;

let launches: string[][];
const runner: CommandRunner = async (request) => {
  launches.push([...request.argv]);
  return { exitCode: 0, stdout: "", stderr: "", durationMs: 1 };
};

async function connect(options: ServerOptions): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer({ runner, ...options }).connect(serverSide);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientSide);
  return client;
}

const text = (result: Awaited<ReturnType<Client["callTool"]>>) =>
  (result.content as { text: string }[])[0]!.text;

let root: string;
let workspace: string;
beforeEach(() => {
  launches = [];
  root = mkdtempSync(join(tmpdir(), "lean-on-it-mcp-"));
  workspace = join(root, "core-sample");
  cpSync(FIXTURE, workspace, { recursive: true });
});

const verifyArgs = () => ({
  workspace,
  module: "CoreSample.Good",
  declaration: "CoreSample.add_zero'",
  claim: sampleManifest().claim,
});

describe("verify_declaration", () => {
  it("refuses every call when no roots are configured, launching nothing", async () => {
    const client = await connect({ trustedRoots: [] });
    const result = await client.callTool({
      name: "verify_declaration",
      arguments: verifyArgs(),
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/no trusted workspace roots/);
    expect(launches).toEqual([]);
  });

  it("refuses a workspace outside the configured roots", async () => {
    const other = mkdtempSync(join(tmpdir(), "lean-on-it-mcp-other-"));
    const client = await connect({ trustedRoots: [other] });
    const result = await client.callTool({
      name: "verify_declaration",
      arguments: verifyArgs(),
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/outside the trusted roots/);
    expect(launches).toEqual([]);
  });

  it("refuses traversal out of a configured root", async () => {
    const client = await connect({
      trustedRoots: [join(root, "core-sample", "CoreSample")],
    });
    const result = await client.callTool({
      name: "verify_declaration",
      arguments: {
        ...verifyArgs(),
        workspace: join(root, "core-sample", "CoreSample", ".."),
      },
    });
    expect(result.isError).toBe(true);
    expect(launches).toEqual([]);
  });

  it("does not let tool arguments add trusted roots", async () => {
    const client = await connect({ trustedRoots: [] });
    const result = await client.callTool({
      name: "verify_declaration",
      arguments: { ...verifyArgs(), trustedRoots: [root] },
    });
    expect(result.isError).toBe(true);
    expect(launches).toEqual([]);
  });

  it("runs inside a configured root and returns a manifest", async () => {
    const client = await connect({ trustedRoots: [root] });
    const result = await client.callTool({
      name: "verify_declaration",
      arguments: verifyArgs(),
    });
    expect(result.isError).toBeFalsy();
    const manifest = JSON.parse(text(result));
    expect(manifest.schema).toBe("lean-on-it/evidence-manifest");
    // The substituted runner prints no probe record, so nothing is claimed.
    expect(manifest.status.kernel.status).toBe("incomplete");
    expect(manifest.status.fidelity.status).toBe("not_reviewed");
    expect(launches.length).toBeGreaterThan(0);
  });
});

describe("validate_manifest", () => {
  it("accepts a valid manifest", async () => {
    const client = await connect({});
    const result = await client.callTool({
      name: "validate_manifest",
      arguments: { manifest: sampleManifest() },
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(text(result))).toMatchObject({ ok: true });
  });

  it("reports a misleading status", async () => {
    const manifest = sampleManifest();
    manifest.status.fidelity = { status: "approved", reasons: [] };
    const client = await connect({});
    const result = await client.callTool({
      name: "validate_manifest",
      arguments: { manifest },
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(text(result)).errors.join("\n")).toMatch(
      /records support "not_reviewed"/,
    );
  });
});

describe("tool policy", () => {
  it("leaves the lean-lsp-mcp disabled-tools list unchanged", () => {
    expect(leanLspLaunch().env.LEAN_MCP_DISABLED_TOOLS).toBe(
      DEFAULT_DISABLED_TOOLS.join(","),
    );
  });
});
