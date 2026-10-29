import { createHash } from "node:crypto";

/** A manifest digest: `sha256:` and the hex digest of `content`. */
export const sha256 = (content: string | Buffer): string =>
  `sha256:${createHash("sha256").update(content).digest("hex")}`;

/**
 * JSON with object keys sorted and no whitespace. For values made only of
 * strings, booleans, null, arrays and objects (as an intended claim is), this
 * is the RFC 8785 canonical form, and the same as `jq -S -c`.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value);
}

/** The digest a fidelity review binds to: the whole intended claim record. */
export const claimDigest = (claim: unknown): string =>
  sha256(canonicalJson(claim));
