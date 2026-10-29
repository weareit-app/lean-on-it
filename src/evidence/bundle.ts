// An evidence bundle on disk: `manifest.json` beside the artifacts it lists,
// each checked against its recorded digest when the bundle is read.
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { EvidenceManifest } from "./manifest.ts";
import { type ValidationResult, validateManifest } from "./validate.ts";

export const MANIFEST_FILE = "manifest.json";

export interface BundleArtifact {
  name: string;
  content: string;
}

/** The path of an artifact inside `dir`, refusing names that escape it. */
function artifactPath(dir: string, name: string): string {
  const path = resolve(dir, name);
  const rel = relative(resolve(dir), path);
  if (rel === "" || rel.startsWith(`..${sep}`) || rel === "..")
    throw new Error(`artifact name escapes the bundle: ${name}`);
  return path;
}

export function writeBundle(
  dir: string,
  manifest: EvidenceManifest,
  artifacts: readonly BundleArtifact[],
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
    const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    if (digest !== artifact.digest || bytes.length !== artifact.bytes)
      errors.push(
        `artifact ${artifact.name} does not match its recorded digest`,
      );
  }
  return errors.length > 0 ? { ok: false, errors } : result;
}
