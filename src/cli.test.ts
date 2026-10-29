// The CLI seam: run `node src/cli.ts` as a user would.
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { writeBundle } from "./evidence/bundle.ts";
import {
  SAMPLE_CLAIM_DIGEST,
  SAMPLE_TYPE_DIGEST,
  sampleManifest,
  sampleReview,
} from "./evidence/sample-manifest.ts";

const FIXTURE = new URL("../fixtures/lean/core-sample", import.meta.url)
  .pathname;

function cli(...args: string[]) {
  const result = spawnSync(process.execPath, ["src/cli.ts", ...args], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "" },
  });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lean-on-it-cli-"));
});

describe("lean-on-it validate", () => {
  it("accepts a valid bundle", () => {
    writeBundle(join(dir, "b"), sampleManifest(), []);
    const { code, out } = cli("validate", join(dir, "b"));
    expect(code).toBe(0);
    expect(out).toMatch(/kernel: kernel_checked/);
    expect(out).toMatch(/fidelity: not_reviewed/);
    expect(out).toContain(`claim digest: ${SAMPLE_CLAIM_DIGEST}`);
    expect(out).toContain(`elaborated type digest: ${SAMPLE_TYPE_DIGEST}`);
  });

  it("rejects a hand-edited approval, with the reason", () => {
    const manifest = sampleManifest();
    manifest.status.fidelity = { status: "approved", reasons: [] };
    writeBundle(join(dir, "b"), manifest, []);
    const { code, err } = cli("validate", join(dir, "b"));
    expect(code).toBe(1);
    expect(err).toMatch(/records support "not_reviewed"/);
  });

  it("rejects an artifact altered after the run", () => {
    const manifest = sampleManifest();
    manifest.verification.artifacts = [
      {
        name: "logs/elaborate.log",
        digest: `sha256:${"0".repeat(64)}`,
        bytes: 3,
      },
    ];
    writeBundle(join(dir, "b"), manifest, [
      { name: "logs/elaborate.log", content: "ok\n" },
    ]);
    const { code, err } = cli("validate", join(dir, "b"));
    expect(code).toBe(1);
    expect(err).toMatch(/logs\/elaborate.log does not match/);
  });
});

describe("lean-on-it review", () => {
  it("attaches a review and recomputes the fidelity status", () => {
    writeBundle(join(dir, "b"), sampleManifest(), []);
    writeFileSync(join(dir, "review.json"), JSON.stringify(sampleReview()));
    const { code, out } = cli(
      "review",
      join(dir, "b"),
      join(dir, "review.json"),
    );
    expect(code).toBe(0);
    expect(out).toMatch(/fidelity: approved/);
    const saved = JSON.parse(
      readFileSync(join(dir, "b", "manifest.json"), "utf8"),
    );
    expect(saved.fidelityReviews).toHaveLength(1);
  });

  it("refuses a self-review and leaves the manifest unchanged", () => {
    writeBundle(join(dir, "b"), sampleManifest(), []);
    const before = readFileSync(join(dir, "b", "manifest.json"), "utf8");
    writeFileSync(
      join(dir, "review.json"),
      JSON.stringify({
        ...sampleReview(),
        reviewer: { id: "lean-on-it", kind: "human" },
      }),
    );
    const { code } = cli("review", join(dir, "b"), join(dir, "review.json"));
    expect(code).toBe(1);
    expect(readFileSync(join(dir, "b", "manifest.json"), "utf8")).toBe(before);
  });
});

describe("lean-on-it verify", () => {
  let workspace: string;
  beforeEach(() => {
    workspace = join(dir, "trusted", "core-sample");
    cpSync(FIXTURE, workspace, { recursive: true });
    writeFileSync(
      join(dir, "claim.json"),
      JSON.stringify(sampleManifest().claim),
    );
  });

  const verifyArgs = (out: string, ...extra: string[]) => [
    "verify",
    "--workspace",
    workspace,
    "--module",
    "CoreSample.Good",
    "--declaration",
    "CoreSample.add_zero'",
    "--claim",
    join(dir, "claim.json"),
    "--out",
    out,
    ...extra,
  ];

  it("refuses a workspace that no trusted root covers", () => {
    const out = join(dir, "evidence");
    const { code, err } = cli(...verifyArgs(out));
    expect(code).toBe(64);
    expect(err).toMatch(/no trusted workspace roots/);
    expect(existsSync(out)).toBe(false);
  });

  it("refuses a trusted root that does not cover the workspace", () => {
    const out = join(dir, "evidence");
    const elsewhere = mkdtempSync(join(tmpdir(), "lean-on-it-other-"));
    const { code, err } = cli(...verifyArgs(out, "--trusted-root", elsewhere));
    expect(code).toBe(64);
    expect(err).toMatch(/outside the trusted roots/);
    expect(existsSync(out)).toBe(false);
  });

  it("refuses a malformed timeout before running anything", () => {
    const out = join(dir, "evidence");
    const { code, err } = cli(
      ...verifyArgs(
        out,
        "--trusted-root",
        join(dir, "trusted"),
        "--timeout-seconds",
        "abc",
      ),
    );
    expect(code).toBe(64);
    expect(err).toMatch(/timeout-seconds/);
    expect(existsSync(out)).toBe(false);
  });

  it("refuses an unreadable claim file without a stack trace", () => {
    writeFileSync(join(dir, "claim.json"), "{not json");
    const out = join(dir, "evidence");
    const { code, err } = cli(
      ...verifyArgs(out, "--trusted-root", join(dir, "trusted")),
    );
    expect(code).toBe(64);
    expect(err).toMatch(/cannot read --claim as JSON/);
    expect(err).not.toMatch(/at .*\.ts:\d+/);
    expect(existsSync(out)).toBe(false);
  });

  it("refuses to write evidence into the workspace", () => {
    const out = join(workspace, "evidence");
    const { code, err } = cli(
      ...verifyArgs(out, "--trusted-root", join(dir, "trusted")),
    );
    expect(code).toBe(64);
    expect(err).toMatch(/inside the workspace/);
    expect(existsSync(out)).toBe(false);
  });
});
