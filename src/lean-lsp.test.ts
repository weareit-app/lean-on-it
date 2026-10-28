import { describe, expect, it } from "vitest";
import { DEFAULT_DISABLED_TOOLS, leanLspLaunch } from "./lean-lsp.ts";

describe("leanLspLaunch", () => {
  it("pins lean-lsp-mcp and uses stdio", () => {
    const launch = leanLspLaunch();
    expect(launch.command).toBe("uvx");
    expect(launch.args[0]).toMatch(/^lean-lsp-mcp==\d+\.\d+\.\d+$/);
    expect(launch.args.slice(1, 3)).toEqual(["--transport", "stdio"]);
  });

  it("disables code-running, build and outside-search tools by default", () => {
    const disabled = leanLspLaunch().env.LEAN_MCP_DISABLED_TOOLS!.split(",");
    expect(disabled).toEqual([...DEFAULT_DISABLED_TOOLS]);
    expect(disabled).toContain("lean_run_code");
    expect(disabled).toContain("lean_build");
  });

  it("enables a tool only when asked", () => {
    const disabled = leanLspLaunch({
      enable: ["lean_build"],
    }).env.LEAN_MCP_DISABLED_TOOLS!.split(",");
    expect(disabled).not.toContain("lean_build");
    expect(disabled).toContain("lean_run_code");
  });
});
