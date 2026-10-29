// An evidence bundle on disk: `manifest.json` beside the artifacts it lists,
// each checked against its recorded digest when the bundle is read.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { isWithin } from "../verify/trusted-workspace.ts";
import { sha256 } from "./digest.ts";
import type { EvidenceManifest } from "./manifest.ts";
import { type ValidationResult, validateManifest } from "./validate.ts";

export const MANIFEST_FILE = "manifest.json";

/** One file of an evidence bundle, named by its path inside the bundle. */
export interface EvidenceArtifact {
  name: string;
  content: string;
}

/** The path of an artifact inside `dir`, refusing names that escape it. */
function artifactPath(dir: string, name: string): string {
  const path = resolve(dir, name);
  if (path === resolve(dir) || !isWithin(resolve(dir), path))
    throw new Error(`artifact name escapes the bundle: ${name}`);
  return path;
}

export function writeBundle(
  dir: string,
  manifest: EvidenceManifest,
  artifacts: readonly EvidenceArtifact[],
): void {
  if (existsSync(dir) && readdirSync(dir).length > 0)
    throw new Error(`bundle directory is not empty: ${dir}`);
  mkdirSync(dir, { recursive: true });
  for (const artifact of artifacts) {
    const path = artifactPath(dir, artifact.name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, artifact.content);
  }
  writeManifest(dir, manifest);
}

export function writeManifest(dir: string, manifest: EvidenceManifest): void {
  writeFileSync(
    join(dir, MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

/** Validates the manifest in `dir` and every artifact digest it records. */
export function readBundle(dir: string): ValidationResult {
  let input: unknown;
  try {
    input = JSON.parse(readFileSync(join(dir, MANIFEST_FILE), "utf8"));
  } catch (error) {
    return { ok: false, errors: [`cannot read ${MANIFEST_FILE}: ${error}`] };
  }
  const result = validateManifest(input);
  if (!result.ok) return result;
  const errors: string[] = [];
  for (const artifact of result.manifest.verification.artifacts) {
    let bytes: Buffer;
    try {
      bytes = readFileSync(artifactPath(dir, artifact.name));
    } catch (error) {
      errors.push(`artifact ${artifact.name}: ${error}`);
      continue;
    }
    if (sha256(bytes) !== artifact.digest || bytes.length !== artifact.bytes)
      errors.push(
        `artifact ${artifact.name} does not match its recorded digest`,
      );
  }
  return errors.length > 0 ? { ok: false, errors } : result;
}
