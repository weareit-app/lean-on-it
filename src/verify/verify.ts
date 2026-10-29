// A read-only verification run of one declaration in a trusted workspace.
// Every check happens before any process starts; then four steps run through
// `lake env` with the workspace as working directory, none writing to it:
//
//   freshness      lake build --no-build <module>   (never builds)
//   elaborate      lake env lean --json <module file>
//   inspect        lake env lean --json <run dir>/Probe.lean
//   kernel_replay  lake env leanchecker [--fresh] <module>
//
// The manifest records only what these steps established; anything they did
// not establish is marked unavailable, and the statuses are derived from the
// records, so a run can never report more than it found.
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import {
  claimSchema,
  DEFAULT_ALLOWED_AXIOMS,
  type EvidenceManifest,
  type FormalDeclaration,
  MANIFEST_SCHEMA,
  MANIFEST_SCHEMA_VERSION,
  type VerificationRun,
  type VerificationStep,
} from "../evidence/manifest.ts";
import type { EvidenceArtifact } from "../evidence/bundle.ts";
import { sha256 } from "../evidence/digest.ts";
import { deriveStatus, validateManifest } from "../evidence/validate.ts";
import {
  allowlistedEnv,
  type CommandResult,
  type CommandRunner,
  nodeCommandRunner,
} from "./command-runner.ts";
import {
  countDiagnostics,
  PROBE_DECLARATION_ENV,
  PROBE_NONCE_ENV,
  type ProbeRecord,
  parseProbeOutput,
  probeSource,
} from "./probe.ts";
import {
  AccessDenied,
  checkLeanName,
  moduleSourceFile,
  resolveTrustedWorkspace,
} from "./trusted-workspace.ts";

export interface VerifyRequest {
  /** Roots the operator trusts; never taken from the caller of a tool. */
  trustedRoots: readonly string[];
  workspace: string;
  module: string;
  declaration: string;
  /** The intended claim; validated against the manifest's claim record. */
  claim: unknown;
  /** Who ran the verification; may not later review its fidelity. */
  operator?: string | null;
  /** `fresh` replays the module and all its imports; `module` only the module. */
  kernelReplay?: "fresh" | "module";
  allowedAxioms?: readonly string[];
  timeoutMs?: number;
  maxOutputBytes?: number;
  runner?: CommandRunner;
  now?: () => Date;
}

export interface EvidenceBundle {
  manifest: EvidenceManifest;
  artifacts: EvidenceArtifact[];
}

/** The request is malformed; nothing was run. */
export class InvalidRequest extends Error {
  override name = "InvalidRequest";
}

const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

const TOOL_VERSION: string = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
).version;

const lakeManifestSchema = z.object({
  packagesDir: z.string().optional(),
  name: z.string().optional(),
  packages: z.array(
    z.object({
      name: z.string(),
      type: z.string().optional(),
      url: z.string().optional(),
      dir: z.string().optional(),
      rev: z.string().optional(),
      inputRev: z.string().nullable().optional(),
    }),
  ),
});

/** Replaces host paths with placeholders, longest first. */
function redactor(pairs: [string, string][]): (text: string) => string {
  const expanded = pairs.flatMap(([path, label]) => {
    const variants = new Set([path]);
    try {
      variants.add(realpathSync(path));
    } catch {}
    return [...variants].map((v) => [v, label] as const);
  });
  expanded.sort((a, b) => b[0].length - a[0].length);
  return (text) =>
    expanded.reduce((t, [path, label]) => t.split(path).join(label), text);
}

function readLakeManifest(workspace: string) {
  const raw = readFileSync(join(workspace, "lake-manifest.json"));
  let parsed: z.infer<typeof lakeManifestSchema>;
  try {
    parsed = lakeManifestSchema.parse(JSON.parse(raw.toString("utf8")));
  } catch (error) {
    throw new InvalidRequest(`lake-manifest.json is not readable: ${error}`);
  }
  const packagesDir = parsed.packagesDir ?? ".lake/packages";
  const missing = parsed.packages.filter((p) => {
    const dir =
      p.type === "path" && p.dir
        ? resolve(workspace, p.dir)
        : join(workspace, packagesDir, p.name);
    return !existsSync(dir);
  });
  if (missing.length > 0)
    throw new AccessDenied(
      `Lake packages are missing from the workspace (${missing.map((p) => p.name).join(", ")}); fetch them yourself first — lean-on-it never fetches`,
    );
  return { raw, manifest: parsed };
}

function stepOutcome(
  result: CommandResult,
): Pick<VerificationStep, "exitCode" | "outcome" | "detail"> {
  if (result.failure)
    return {
      exitCode: null,
      outcome: "error",
      detail: `did not complete: ${result.failure}${result.failureDetail ? ` (${result.failureDetail})` : ""}`,
    };
  return {
    exitCode: result.exitCode,
    outcome: result.exitCode === 0 ? "passed" : "error",
    detail: result.exitCode === 0 ? "" : `exited with ${result.exitCode}`,
  };
}

export async function verifyDeclaration(
  request: VerifyRequest,
): Promise<EvidenceBundle> {
  // Everything below this block is refused before any process starts.
  const workspace = resolveTrustedWorkspace(
    request.trustedRoots,
    request.workspace,
  );
  const declaration = checkLeanName("declaration", request.declaration);
  const module = checkLeanName("module", request.module);
  const source = moduleSourceFile(workspace, module);
  const claim = claimSchema.safeParse(request.claim);
  if (!claim.success)
    throw new InvalidRequest(
      `invalid intended claim: ${claim.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  const lake = readLakeManifest(workspace.root);

  const runner = request.runner ?? nodeCommandRunner;
  const now = request.now ?? (() => new Date());
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputBytes = request.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const replayMode = request.kernelReplay ?? "fresh";
  const allowedAxioms = [...(request.allowedAxioms ?? DEFAULT_ALLOWED_AXIOMS)];
  const startedAt = now().toISOString();
  const runDir = mkdtempSync(join(tmpdir(), "lean-on-it-run-"));
  const redact = redactor([
    [workspace.root, "<workspace>"],
    [runDir, "<run>"],
    [homedir(), "~"],
  ]);
  const artifacts: EvidenceArtifact[] = [];
  const env = allowlistedEnv(process.env);

  const run = (argv: string[], extraEnv: Record<string, string> = {}) =>
    runner({
      argv,
      cwd: workspace.root,
      env: { ...env, ...extraEnv },
      timeoutMs,
      maxOutputBytes,
    });
  const log = (name: string, argv: string[], result: CommandResult) => {
    artifacts.push({
      name,
      content: redact(
        [
          `$ ${argv.join(" ")}`,
          `exit: ${result.exitCode ?? "none"}${result.failure ? ` (${result.failure})` : ""}`,
          "--- stdout",
          result.stdout,
          "--- stderr",
          result.stderr,
        ].join("\n"),
      ),
    });
  };
  const steps: VerificationStep[] = [];
  const step = async (
    id: VerificationStep["id"],
    argv: string[],
    classify: (
      r: CommandResult,
    ) => ReturnType<typeof stepOutcome> = stepOutcome,
    extraEnv?: Record<string, string>,
  ): Promise<CommandResult> => {
    const result = await run(argv, extraEnv);
    const name = `logs/${id}.log`;
    log(name, argv, result);
    steps.push({
      id,
      argv: argv.map(redact),
      durationMs: result.durationMs,
      log: name,
      ...classify(result),
    });
    return result;
  };
  const skip = (id: VerificationStep["id"], argv: string[], why: string) =>
    steps.push({
      id,
      argv: argv.map(redact),
      exitCode: null,
      durationMs: 0,
      outcome: "skipped",
      detail: why,
      log: null,
    });

  try {
    // Formal environment.
    const capture = async (name: string, argv: string[]) => {
      const result = await run(argv);
      log(`logs/environment-${name}.log`, argv, result);
      return result;
    };
    const lakeVersion = await capture("lake-version", ["lake", "--version"]);
    const leanVersion = await capture("lean-version", [
      "lake",
      "env",
      "lean",
      "--version",
    ]);
    const gitCommit = await capture("git-commit", ["git", "rev-parse", "HEAD"]);
    const gitDirty = await capture("git-status", [
      "git",
      "status",
      "--porcelain",
      "--",
      ".",
    ]);
    const leanMatch =
      leanVersion.exitCode === 0
        ? /Lean \(version ([^,\s]+),.*commit ([0-9a-f]+)/.exec(
            leanVersion.stdout,
          )
        : null;
    const lakeMatch =
      lakeVersion.exitCode === 0
        ? /Lake version (\S+)/.exec(lakeVersion.stdout)
        : null;
    const commit = gitCommit.stdout.trim();
    const hasGit =
      gitCommit.exitCode === 0 &&
      gitDirty.exitCode === 0 &&
      /^[0-9a-f]{40,64}$/.test(commit);

    // Steps.
    const freshnessArgv = ["lake", "build", "--no-build", module];
    const freshness = await step("freshness", freshnessArgv, (r) => {
      const base = stepOutcome(r);
      return base.outcome === "passed"
        ? base
        : {
            ...base,
            detail: `${base.detail}; build outputs are missing or out of date for ${module} (lean-on-it never builds: run lake build in the workspace first)`,
          };
    });
    const fresh = freshness.exitCode === 0 && !freshness.failure;

    const elaborateArgv = ["lake", "env", "lean", "--json", source.relative];
    const elaboration = await step("elaborate", elaborateArgv, (r) => {
      const counts = countDiagnostics(r.stdout);
      return !r.failure && counts.errors > 0
        ? {
            exitCode: r.exitCode,
            outcome: "failed",
            detail: `${counts.errors} error(s) elaborating ${source.relative}`,
          }
        : stepOutcome(r);
    });
    const elaborationCounts = countDiagnostics(elaboration.stdout);
    const diagnostics: VerificationRun["diagnostics"] = elaboration.failure
      ? { status: "unavailable", reason: `elaboration ${elaboration.failure}` }
      : elaboration.exitCode !== 0 && elaborationCounts.errors === 0
        ? {
            status: "unavailable",
            reason: `lean exited with ${elaboration.exitCode} without reporting an error`,
          }
        : { status: "captured", ...elaborationCounts };

    const probePath = join(runDir, "Probe.lean");
    const probeArgv = ["lake", "env", "lean", "--json", probePath];
    let probe: ProbeRecord | null = null;
    let gap = "inspection was skipped because build outputs are not fresh";
    if (fresh) {
      const probeText = probeSource(module);
      writeFileSync(probePath, probeText);
      artifacts.push({ name: "probe/Probe.lean", content: probeText });
      const nonce = randomUUID();
      const parse = (r: CommandResult) =>
        stepOutcome(r).outcome === "passed"
          ? parseProbeOutput(r.stdout, nonce)
          : null;
      const describeGap = (r: CommandResult) =>
        stepOutcome(r).outcome === "passed"
          ? "the probe printed no record for this run"
          : `the probe ${stepOutcome(r).detail}`;
      const inspection = await step(
        "inspect",
        probeArgv,
        (r) =>
          parse(r)
            ? stepOutcome(r)
            : { ...stepOutcome(r), outcome: "error", detail: describeGap(r) },
        { [PROBE_DECLARATION_ENV]: declaration, [PROBE_NONCE_ENV]: nonce },
      );
      probe = parse(inspection);
      if (!probe) gap = describeGap(inspection);
    } else skip("inspect", probeArgv, gap);

    const replayArgv = [
      "lake",
      "env",
      "leanchecker",
      ...(replayMode === "fresh" ? ["--fresh"] : []),
      module,
    ];
    if (fresh)
      await step("kernel_replay", replayArgv, (r) => {
        const base = stepOutcome(r);
        if (base.outcome === "passed" || r.failure) return base;
        // leanchecker reports kernel problems as "(kernel) ..." exceptions.
        return /\(kernel\)|found a problem/.test(r.stderr)
          ? {
              ...base,
              outcome: "failed",
              detail: "the kernel rejected a replayed declaration",
            }
          : base;
      });
    else
      skip(
        "kernel_replay",
        replayArgv,
        "replay was skipped because build outputs are not fresh",
      );

    // Records.
    const found = probe?.found ? probe : null;
    const missing = probe ? "declaration not found" : gap;
    const lookup: FormalDeclaration["lookup"] =
      probe === null
        ? { status: "unavailable", reason: gap }
        : found
          ? {
              status: "found",
              kind: found.kind,
              definedInModule: found.module === module,
              levelParams: found.levelParams,
            }
          : {
              status: "not_found",
              reason: `${declaration} is not in the environment after importing ${module}`,
            };

    const closure = found ? [...found.closure].sort() : [];
    const closureText = `${closure.join("\n")}\n`;
    if (found)
      artifacts.push({
        name: "dependency-closure.json",
        content: `${JSON.stringify(
          {
            declaration,
            constants: closure,
            modules: [...found.closureModules].sort(),
          },
          null,
          2,
        )}\n`,
      });

    const manifestPackages = lake.manifest.packages.map((p) => ({
      name: p.name,
      url: redact(p.url ?? (p.dir ? `path:${p.dir}` : "unknown")),
      rev: p.rev ?? "unknown",
      inputRev: p.inputRev ?? null,
    }));

    const declarationRecord: FormalDeclaration = {
      id: `declaration:${declaration}`,
      name: declaration,
      module,
      sourceFile: source.relative,
      sourceDigest: sha256(readFileSync(source.absolute)),
      lookup,
      elaboratedType: found
        ? {
            status: "captured",
            pretty: found.typePretty,
            explicit: found.typeExplicit,
            digest: sha256(found.typeExplicit),
          }
        : {
            status: "unavailable",
            reason: missing,
          },
      environment: {
        lean:
          leanMatch?.[1] && leanMatch[2]
            ? {
                status: "captured",
                version: leanMatch[1],
                commit: leanMatch[2],
              }
            : {
                status: "unavailable",
                reason: "lean --version gave no version",
              },
        lake: lakeMatch?.[1]
          ? { status: "captured", version: lakeMatch[1] }
          : { status: "unavailable", reason: "lake --version gave no version" },
        toolchain: readFileSync(
          join(workspace.root, "lean-toolchain"),
          "utf8",
        ).trim(),
        lakeManifestDigest: sha256(lake.raw),
        packages: manifestPackages,
        workspace: {
          package: lake.manifest.name ?? "unknown",
          revision: hasGit
            ? { vcs: "git", commit, dirty: gitDirty.stdout.trim() !== "" }
            : { vcs: "none" },
        },
      },
    };

    const limitations = [
      "Lean ran the workspace's own code with the operator's permissions; the run is not sandboxed.",
      "Imported modules were loaded from the workspace's existing build outputs, not rebuilt from source.",
      replayMode === "fresh"
        ? "leanchecker --fresh replayed the module and all its imports through the Lean kernel; it is the same kernel, not an external checker."
        : "leanchecker replayed only the module's own declarations through the Lean kernel; imports were trusted as loaded, so the run is incomplete.",
      "The dependency closure follows constants referenced by types and values; it omits anything used only during elaboration.",
    ];
    if (
      declarationRecord.environment.workspace.revision.vcs === "git" &&
      declarationRecord.environment.workspace.revision.dirty
    )
      limitations.push("The workspace had uncommitted changes.");

    const verification: VerificationRun = {
      id: `run:${startedAt}:${randomUUID().slice(0, 8)}`,
      declarationId: declarationRecord.id,
      operator: request.operator ?? null,
      tool: { name: "lean-on-it", version: TOOL_VERSION },
      startedAt,
      finishedAt: now().toISOString(),
      axiomPolicy: { allowed: allowedAxioms },
      kernelReplay: replayMode,
      steps,
      diagnostics,
      axioms: !found
        ? {
            status: "unavailable",
            reason: missing,
          }
        : "names" in found.axioms
          ? { status: "captured", names: [...found.axioms.names].sort() }
          : {
              status: "unavailable",
              reason: `collecting axioms failed: ${found.axioms.error}`,
            },
      dependencies: found
        ? {
            status: "captured",
            direct: [...found.direct].sort(),
            closureSize: closure.length,
            modules: [...found.closureModules].sort(),
            closureDigest: sha256(closureText),
            artifact: "dependency-closure.json",
          }
        : {
            status: "unavailable",
            reason: missing,
          },
      artifacts: artifacts.map((a) => ({
        name: a.name,
        digest: sha256(a.content),
        bytes: Buffer.byteLength(a.content),
      })),
      limitations,
    };

    const records = {
      claim: claim.data,
      declaration: declarationRecord,
      verification,
      fidelityReviews: [],
    };
    const manifest: EvidenceManifest = {
      schema: MANIFEST_SCHEMA,
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      generatedAt: now().toISOString(),
      ...records,
      status: deriveStatus(records),
    };
    const check = validateManifest(manifest);
    if (!check.ok)
      throw new Error(
        `lean-on-it produced an invalid manifest: ${check.errors.join("; ")}`,
      );
    return { manifest, artifacts };
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
}
