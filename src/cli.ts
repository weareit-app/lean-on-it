#!/usr/bin/env node
// The lean-on-it command line: verify a declaration, attach a fidelity
// review, or validate an evidence bundle. Trusted roots come from
// --trusted-root flags and LEAN_ON_IT_TRUSTED_ROOTS, set by the operator.
//
// Exit codes: 0 success (verify: kernel-checked), 1 invalid or rejected,
// 2 incomplete evidence, 64 refused or misused.
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  MANIFEST_FILE,
  readBundle,
  writeBundle,
  writeManifest,
} from "./evidence/bundle.ts";
import { claimDigest } from "./evidence/digest.ts";
import type { EvidenceManifest } from "./evidence/manifest.ts";
import { attachFidelityReview } from "./evidence/review.ts";
import {
  AccessDenied,
  isWithin,
  operatorTrustedRoots,
} from "./verify/trusted-workspace.ts";
import { InvalidRequest, verifyDeclaration } from "./verify/verify.ts";

const USAGE = `usage:
  lean-on-it verify --workspace <dir> --module <Module> --declaration <Name>
                    --claim <claim.json> --out <dir> [--trusted-root <dir>]...
                    [--operator <id>] [--kernel-replay fresh|module]
                    [--timeout-seconds <n>]
  lean-on-it review <bundle-dir> <review.json>
  lean-on-it validate <bundle-dir>`;

class Refused extends Error {}

function readJson(path: string, what: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Refused(
      `cannot read ${what} as JSON: ${error instanceof Error ? error.message : error}`,
    );
  }
}

function summary(manifest: EvidenceManifest): string {
  const { kernel, fidelity } = manifest.status;
  const type = manifest.declaration.elaboratedType;
  return [
    `declaration: ${manifest.declaration.name}`,
    // What a fidelity review must name as reviewedClaimDigest and
    // reviewedTypeDigest.
    `claim digest: ${claimDigest(manifest.claim)}`,
    `elaborated type digest: ${type.status === "captured" ? type.digest : "unavailable"}`,
    `kernel: ${kernel.status}`,
    ...kernel.reasons.map((r) => `  - ${r}`),
    `fidelity: ${fidelity.status}`,
    ...fidelity.reasons.map((r) => `  - ${r}`),
  ].join("\n");
}

/** The canonical form of `path`, resolving the nearest existing ancestor. */
function canonicalTarget(path: string): string {
  let existing = resolve(path);
  const rest: string[] = [];
  while (!existsSync(existing)) {
    rest.unshift(existing.slice(dirname(existing).length));
    existing = dirname(existing);
  }
  return realpathSync(existing) + rest.join("");
}

async function verify(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      workspace: { type: "string" },
      module: { type: "string" },
      declaration: { type: "string" },
      claim: { type: "string" },
      out: { type: "string" },
      "trusted-root": { type: "string", multiple: true },
      operator: { type: "string" },
      "kernel-replay": { type: "string" },
      "timeout-seconds": { type: "string" },
    },
    strict: true,
  });
  const { workspace, module, declaration, claim, out } = values;
  if (!workspace || !module || !declaration || !claim || !out)
    throw new Refused(USAGE);
  const replay = values["kernel-replay"] ?? "fresh";
  if (replay !== "fresh" && replay !== "module")
    throw new Refused("--kernel-replay must be fresh or module");
  const trustedRoots = operatorTrustedRoots(
    values["trusted-root"],
    process.env,
  );
  const workspacePath = resolve(workspace);
  const outPath = canonicalTarget(out);
  if (existsSync(workspacePath)) {
    const ws = realpathSync(workspacePath);
    if (isWithin(ws, outPath))
      throw new Refused(
        `--out is inside the workspace; verification never writes there: ${out}`,
      );
  }
  const seconds = values["timeout-seconds"];
  if (seconds !== undefined && !/^[1-9][0-9]*$/.test(seconds))
    throw new Refused("--timeout-seconds must be a positive whole number");
  const bundle = await verifyDeclaration({
    trustedRoots,
    workspace: workspacePath,
    module,
    declaration,
    claim: readJson(claim, "--claim"),
    operator: values.operator ?? null,
    kernelReplay: replay,
    ...(seconds ? { timeoutMs: Number(seconds) * 1000 } : {}),
  });
  writeBundle(outPath, bundle.manifest, bundle.artifacts);
  console.log(
    `${summary(bundle.manifest)}\nwrote ${resolve(out, MANIFEST_FILE)}`,
  );
  return { kernel_checked: 0, rejected: 1, incomplete: 2 }[
    bundle.manifest.status.kernel.status
  ];
}

function review(args: string[]): number {
  const [dir, reviewFile] = args;
  if (!dir || !reviewFile || args.length > 2) throw new Refused(USAGE);
  const bundle = readBundle(dir);
  if (!bundle.ok) {
    console.error(bundle.errors.join("\n"));
    return 1;
  }
  const result = attachFidelityReview(
    bundle.manifest,
    readJson(reviewFile, "review"),
  );
  if (!result.ok) {
    console.error(result.errors.join("\n"));
    return 1;
  }
  writeManifest(dir, result.manifest);
  console.log(summary(result.manifest));
  return 0;
}

function validate(args: string[]): number {
  const [dir] = args;
  if (!dir || args.length > 1) throw new Refused(USAGE);
  const result = readBundle(dir);
  if (!result.ok) {
    console.error(result.errors.join("\n"));
    return 1;
  }
  console.log(summary(result.manifest));
  return 0;
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  try {
    if (command === "verify") return await verify(rest);
    if (command === "review") return review(rest);
    if (command === "validate") return validate(rest);
    throw new Refused(USAGE);
  } catch (error) {
    if (
      error instanceof Refused ||
      error instanceof AccessDenied ||
      error instanceof InvalidRequest
    ) {
      console.error(error.message);
      return 64;
    }
    throw error;
  }
}

process.exitCode = await main(process.argv.slice(2));
