#!/usr/bin/env node
// The lean-on-it command line: verify a declaration, attach a fidelity
// review, or validate an evidence bundle. Trusted roots come from
// --trusted-root flags and LEAN_ON_IT_TRUSTED_ROOTS, set by the operator.
//
// Exit codes: 0 success (verify: kernel-checked), 1 invalid or rejected,
// 2 incomplete evidence, 64 refused or misused.
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { delimiter, dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  MANIFEST_FILE,
  readBundle,
  writeBundle,
  writeManifest,
} from "./evidence/bundle.ts";
import type { EvidenceManifest } from "./evidence/manifest.ts";
import { attachFidelityReview } from "./evidence/review.ts";
import { AccessDenied } from "./verify/trusted-workspace.ts";
import { InvalidRequest, verifyDeclaration } from "./verify/verify.ts";

const USAGE = `usage:
  lean-on-it verify --workspace <dir> --module <Module> --declaration <Name>
                    --claim <claim.json> --out <dir> [--trusted-root <dir>]...
                    [--operator <id>] [--kernel-replay fresh|module]
                    [--timeout-seconds <n>]
  lean-on-it review <bundle-dir> <review.json>
  lean-on-it validate <bundle-dir>`;

class Refused extends Error {}

function summary(manifest: EvidenceManifest): string {
  const { kernel, fidelity } = manifest.status;
  return [
    `declaration: ${manifest.declaration.name}`,
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
  const trustedRoots = [
    ...(values["trusted-root"] ?? []),
    ...(process.env.LEAN_ON_IT_TRUSTED_ROOTS?.split(delimiter).filter(
      Boolean,
    ) ?? []),
  ];
  const workspacePath = resolve(workspace);
  const outPath = canonicalTarget(out);
  if (existsSync(workspacePath)) {
    const ws = realpathSync(workspacePath);
    if (outPath === ws || outPath.startsWith(`${ws}/`))
      throw new Refused(
        `--out is inside the workspace; verification never writes there: ${out}`,
      );
  }
  const seconds = values["timeout-seconds"];
  const bundle = await verifyDeclaration({
    trustedRoots,
    workspace: workspacePath,
    module,
    declaration,
    claim: JSON.parse(readFileSync(claim, "utf8")),
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
    JSON.parse(readFileSync(reviewFile, "utf8")),
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
