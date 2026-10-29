// The verify seam. Real-Lean tests copy the core-only fixture to a temporary
// trusted root, build it there (test setup, not the verifier), and verify its
// declarations; they skip when no Lean toolchain is installed. Substituted
// runners cover outcomes real Lean does not easily produce.
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { IntendedClaim } from "../evidence/manifest.ts";
import { validateManifest } from "../evidence/validate.ts";
import type { CommandRequest, CommandRunner } from "./command-runner.ts";
import { AccessDenied } from "./trusted-workspace.ts";
import { type VerifyRequest, verifyDeclaration } from "./verify.ts";

const FIXTURE = new URL("../../fixtures/lean/core-sample", import.meta.url)
  .pathname;

const claim: IntendedClaim = {
  id: "claim:core-sample",
  statement: "Adding zero to a natural number leaves it unchanged.",
  assumptions: [],
  scope: "Natural numbers.",
  source: {
    title: "core-sample fixture",
    locator: "CoreSample/Good.lean",
    version: "lean-on-it test fixture",
  },
  notes: [],
};

function hasLake(): boolean {
  try {
    execFileSync("lake", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** A trusted root holding a copy of the fixture. */
function copyFixture(): { root: string; workspace: string } {
  const root = mkdtempSync(join(tmpdir(), "lean-on-it-verify-"));
  const workspace = join(root, "core-sample");
  cpSync(FIXTURE, workspace, { recursive: true });
  return { root, workspace };
}

/** Every file under `dir` with its size and modification time. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of readdirSync(dir, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    const stat = statSync(path);
    out[path] = `${stat.size}:${stat.mtimeMs}`;
  }
  return out;
}

describe.skipIf(!hasLake())("verifyDeclaration against real Lean", () => {
  let base: Omit<VerifyRequest, "module" | "declaration">;

  beforeAll(() => {
    const { root, workspace } = copyFixture();
    execFileSync("lake", ["build"], { cwd: workspace, stdio: "ignore" });
    base = { trustedRoots: [root], workspace, claim, kernelReplay: "module" };
  }, 300_000);

  it("records a sound theorem as kernel-checked and not reviewed", async () => {
    const before = snapshot(base.workspace);
    const { manifest, artifacts } = await verifyDeclaration({
      ...base,
      module: "CoreSample.Good",
      declaration: "CoreSample.add_zero'",
    });
    expect(validateManifest(manifest)).toMatchObject({ ok: true });
    expect(manifest.status.kernel).toEqual({
      status: "kernel_checked",
      reasons: [],
    });
    expect(manifest.status.fidelity.status).toBe("not_reviewed");
    expect(manifest.declaration.elaboratedType).toMatchObject({
      status: "captured",
      pretty: "∀ (n : Nat), n + 0 = n",
    });
    expect(manifest.verification.axioms).toEqual({
      status: "captured",
      names: [],
    });
    expect(manifest.declaration.environment.lean).toMatchObject({
      status: "captured",
      version: "4.35.0",
    });
    expect(artifacts.map((a) => a.name)).toContain("dependency-closure.json");
    expect(snapshot(base.workspace)).toEqual(before);
  }, 120_000);

  it("accepts an allowed axiom", async () => {
    const { manifest } = await verifyDeclaration({
      ...base,
      module: "CoreSample.Good",
      declaration: "CoreSample.and_self'",
    });
    expect(manifest.verification.axioms).toEqual({
      status: "captured",
      names: ["propext"],
    });
    expect(manifest.status.kernel.status).toBe("kernel_checked");
  }, 120_000);

  it("rejects a theorem closed with sorry", async () => {
    const { manifest } = await verifyDeclaration({
      ...base,
      module: "CoreSample.Sorry",
      declaration: "CoreSample.unproved",
    });
    expect(manifest.status.kernel.status).toBe("rejected");
    expect(manifest.status.kernel.reasons.join("\n")).toMatch(/sorryAx/);
    expect(manifest.status.fidelity.status).toBe("not_reviewed");
  }, 120_000);

  it("rejects a theorem resting on a custom axiom", async () => {
    const { manifest } = await verifyDeclaration({
      ...base,
      module: "CoreSample.Axiom",
      declaration: "CoreSample.via_cheat",
    });
    expect(manifest.status.kernel.status).toBe("rejected");
    expect(manifest.status.kernel.reasons.join("\n")).toMatch(
      /disallowed axiom\(s\): CoreSample\.cheat/,
    );
  }, 120_000);

  it("rejects a module that does not elaborate", async () => {
    const { manifest } = await verifyDeclaration({
      ...base,
      module: "CoreSample.Broken",
      declaration: "CoreSample.broken",
    });
    expect(manifest.status.kernel.status).toBe("rejected");
    expect(manifest.status.kernel.reasons.join("\n")).toMatch(/error/);
  }, 120_000);

  it("rejects a declaration missing from its module", async () => {
    const { manifest } = await verifyDeclaration({
      ...base,
      module: "CoreSample.Good",
      declaration: "CoreSample.no_such_theorem",
    });
    expect(manifest.status.kernel.status).toBe("rejected");
    expect(manifest.declaration.lookup.status).toBe("not_found");
  }, 120_000);

  it("replays the module and its imports from fresh", async () => {
    const { manifest } = await verifyDeclaration({
      ...base,
      kernelReplay: "fresh",
      module: "CoreSample.Good",
      declaration: "CoreSample.add_zero'",
    });
    const replay = manifest.verification.steps.find(
      (s) => s.id === "kernel_replay",
    );
    expect(replay).toMatchObject({ outcome: "passed" });
    expect(replay?.argv).toContain("--fresh");
    expect(manifest.status.kernel.status).toBe("kernel_checked");
  }, 300_000);

  it("keeps absolute host paths out of the manifest and logs", async () => {
    const { manifest, artifacts } = await verifyDeclaration({
      ...base,
      module: "CoreSample.Broken",
      declaration: "CoreSample.broken",
    });
    const everything = [
      JSON.stringify(manifest),
      ...artifacts.map((a) => a.content),
    ];
    for (const text of everything) {
      expect(text).not.toContain(base.workspace);
      expect(text).not.toContain(homedir());
      expect(text).not.toContain(tmpdir());
    }
  }, 120_000);
});

/** A runner that answers every command with `answer` and records requests. */
function fakeRunner(
  answer: (r: CommandRequest) => Partial<ReturnType<typeof ok>>,
) {
  const requests: CommandRequest[] = [];
  const runner: CommandRunner = async (request) => {
    requests.push(request);
    return { ...ok(), ...answer(request) };
  };
  return { runner, requests };
}

function ok() {
  return {
    exitCode: 0 as number | null,
    stdout: "",
    stderr: "",
    durationMs: 1,
  };
}

/** The probe's argv ends in its generated file. */
const isProbe = (r: CommandRequest) =>
  r.argv.at(-1)?.endsWith("Probe.lean") ?? false;

describe("verifyDeclaration with a substituted runner", () => {
  let request: VerifyRequest;

  beforeAll(() => {
    const { root, workspace } = copyFixture();
    request = {
      trustedRoots: [root],
      workspace,
      claim,
      module: "CoreSample.Good",
      declaration: "CoreSample.add_zero'",
    };
  });

  it("refuses an untrusted workspace before running anything", async () => {
    const { runner, requests } = fakeRunner(() => ({}));
    const outside = copyFixture().workspace;
    await expect(
      verifyDeclaration({ ...request, workspace: outside, runner }),
    ).rejects.toThrow(AccessDenied);
    expect(requests).toEqual([]);
  });

  it("refuses an injected declaration name before running anything", async () => {
    const { runner, requests } = fakeRunner(() => ({}));
    await expect(
      verifyDeclaration({
        ...request,
        declaration: "x\n#eval IO.Process.exit 0",
        runner,
      }),
    ).rejects.toThrow(AccessDenied);
    expect(requests).toEqual([]);
  });

  it("refuses an invalid intended claim before running anything", async () => {
    const { runner, requests } = fakeRunner(() => ({}));
    await expect(
      verifyDeclaration({ ...request, claim: { statement: "" }, runner }),
    ).rejects.toThrow(/claim/);
    expect(requests).toEqual([]);
  });

  it("refuses when a Lake package is missing, before running anything", async () => {
    const { root, workspace } = copyFixture();
    writeFileSync(
      join(workspace, "lake-manifest.json"),
      JSON.stringify({
        version: "1.3.0",
        packagesDir: ".lake/packages",
        packages: [
          {
            name: "mathlib",
            url: "https://example.invalid/m",
            rev: "abc",
            type: "git",
          },
        ],
        name: "core_sample",
      }),
    );
    const { runner, requests } = fakeRunner(() => ({}));
    await expect(
      verifyDeclaration({
        ...request,
        trustedRoots: [root],
        workspace,
        runner,
      }),
    ).rejects.toThrow(/mathlib/);
    expect(requests).toEqual([]);
  });

  it("passes only allowlisted environment variables to Lean", async () => {
    const { runner, requests } = fakeRunner(() => ({}));
    process.env.LEAN_ON_IT_TEST_SECRET = "do-not-leak";
    try {
      await verifyDeclaration({ ...request, runner });
    } finally {
      delete process.env.LEAN_ON_IT_TEST_SECRET;
    }
    for (const r of requests)
      expect(Object.keys(r.env)).not.toContain("LEAN_ON_IT_TEST_SECRET");
  });

  it("is incomplete, not checked, when the probe prints nothing", async () => {
    const { runner } = fakeRunner(() => ({}));
    const { manifest } = await verifyDeclaration({ ...request, runner });
    expect(manifest.status.kernel.status).toBe("incomplete");
    expect(manifest.declaration.elaboratedType.status).toBe("unavailable");
    expect(manifest.verification.axioms.status).toBe("unavailable");
    expect(manifest.verification.dependencies.status).toBe("unavailable");
  });

  it("is incomplete when the probe cannot collect axioms", async () => {
    const { runner } = fakeRunner((r) => {
      if (!isProbe(r)) return {};
      const nonce = r.env.LEAN_ON_IT_NONCE;
      const record = {
        found: true,
        kind: "theorem",
        module: "CoreSample.Good",
        levelParams: [],
        typePretty: "True",
        typeExplicit: "True",
        axioms: { error: "maximum recursion depth" },
        direct: ["True"],
        closure: ["True"],
        closureModules: ["Init.Prelude"],
      };
      return {
        stdout: `${JSON.stringify({ severity: "information", data: `LEAN_ON_IT_EVIDENCE:${nonce}:${JSON.stringify(record)}` })}\n`,
      };
    });
    const { manifest } = await verifyDeclaration({ ...request, runner });
    expect(manifest.status.kernel.status).toBe("incomplete");
    expect(manifest.status.kernel.reasons.join("\n")).toMatch(
      /maximum recursion depth/,
    );
  });

  it("ignores a probe record carrying another run's nonce", async () => {
    const { runner } = fakeRunner((r) =>
      isProbe(r)
        ? {
            stdout: `${JSON.stringify({ severity: "information", data: 'LEAN_ON_IT_EVIDENCE:forged:{"found":false}' })}\n`,
          }
        : {},
    );
    const { manifest } = await verifyDeclaration({ ...request, runner });
    expect(manifest.declaration.lookup.status).toBe("unavailable");
    expect(manifest.status.kernel.status).toBe("incomplete");
  });

  it("is incomplete when a step times out", async () => {
    const { runner } = fakeRunner((r) =>
      r.argv.includes("leanchecker")
        ? { exitCode: null, failure: "timeout" }
        : {},
    );
    const { manifest } = await verifyDeclaration({ ...request, runner });
    expect(
      manifest.verification.steps.find((s) => s.id === "kernel_replay"),
    ).toMatchObject({
      outcome: "error",
    });
    expect(manifest.status.kernel.status).toBe("incomplete");
  });

  it("is incomplete when a step overflows its output cap", async () => {
    const { runner } = fakeRunner((r) =>
      r.argv.includes("--json") && !isProbe(r)
        ? { exitCode: null, failure: "output_limit" }
        : {},
    );
    const { manifest } = await verifyDeclaration({ ...request, runner });
    expect(manifest.verification.diagnostics.status).toBe("unavailable");
    expect(manifest.status.kernel.status).toBe("incomplete");
  });

  it("skips inspection and replay when build outputs are stale", async () => {
    const { runner, requests } = fakeRunner((r) =>
      r.argv.includes("--no-build") ? { exitCode: 3 } : {},
    );
    const { manifest } = await verifyDeclaration({ ...request, runner });
    const outcomes = Object.fromEntries(
      manifest.verification.steps.map((s) => [s.id, s.outcome]),
    );
    expect(outcomes).toEqual({
      freshness: "error",
      elaborate: "passed",
      inspect: "skipped",
      kernel_replay: "skipped",
    });
    expect(requests.some(isProbe)).toBe(false);
    expect(manifest.status.kernel.status).toBe("incomplete");
  });

  it("never runs lake build without --no-build", async () => {
    const { runner, requests } = fakeRunner(() => ({}));
    await verifyDeclaration({ ...request, runner });
    for (const r of requests)
      if (r.argv.includes("build")) expect(r.argv).toContain("--no-build");
  });

  it("records the claim it was given verbatim", async () => {
    const { runner } = fakeRunner(() => ({}));
    const { manifest } = await verifyDeclaration({ ...request, runner });
    expect(manifest.claim).toEqual(claim);
    expect(
      readFileSync(join(request.workspace, "lean-toolchain"), "utf8").trim(),
    ).toBe(manifest.declaration.environment.toolchain);
  });
});
