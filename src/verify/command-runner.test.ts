import { describe, expect, it } from "vitest";
import { allowlistedEnv, nodeCommandRunner } from "./command-runner.ts";

const node = process.execPath;
const base = { cwd: process.cwd(), timeoutMs: 10_000, maxOutputBytes: 1 << 20 };

describe("allowlistedEnv", () => {
  it("passes PATH and HOME but withholds tokens", () => {
    const env = allowlistedEnv(
      {
        PATH: "/bin",
        HOME: "/home/x",
        GITHUB_TOKEN: "secret",
        AWS_SECRET_ACCESS_KEY: "s",
      },
      { LEAN_ON_IT_NONCE: "n" },
    );
    expect(env).toEqual({
      PATH: "/bin",
      HOME: "/home/x",
      LEAN_ON_IT_NONCE: "n",
    });
  });
});

describe("nodeCommandRunner", () => {
  it("runs without a shell and reports the exit code", async () => {
    const result = await nodeCommandRunner({
      ...base,
      argv: [node, "-e", "process.stdout.write('$HOME;'); process.exit(3)"],
      env: {},
    });
    expect(result).toMatchObject({ exitCode: 3, stdout: "$HOME;" });
  });

  it("gives the child only the environment it is handed", async () => {
    const result = await nodeCommandRunner({
      ...base,
      argv: [
        node,
        "-e",
        "process.stdout.write(JSON.stringify(Object.keys(process.env)))",
      ],
      env: { ONLY: "1" },
    });
    expect(JSON.parse(result.stdout)).not.toContain("GITHUB_TOKEN");
    expect(JSON.parse(result.stdout)).toContain("ONLY");
  });

  it("stops a command at its time limit", async () => {
    const result = await nodeCommandRunner({
      ...base,
      timeoutMs: 200,
      argv: [node, "-e", "setTimeout(() => {}, 60000)"],
      env: {},
    });
    expect(result).toMatchObject({ exitCode: null, failure: "timeout" });
  });

  it("stops a command at its output cap", async () => {
    const result = await nodeCommandRunner({
      ...base,
      maxOutputBytes: 1000,
      argv: [
        node,
        "-e",
        "setInterval(() => process.stdout.write('x'.repeat(500)), 1)",
      ],
      env: {},
    });
    expect(result).toMatchObject({ exitCode: null, failure: "output_limit" });
    expect(result.stdout.length).toBeLessThanOrEqual(1000);
  });

  it("reports a command that cannot start", async () => {
    const result = await nodeCommandRunner({
      ...base,
      argv: ["lean-on-it-no-such-command"],
      env: {},
    });
    expect(result).toMatchObject({ exitCode: null, failure: "spawn_error" });
  });
});
