import { createHash } from "node:crypto";

/** A manifest digest: `sha256:` and the hex digest of `content`. */
export const sha256 = (content: string | Buffer): string =>
  `sha256:${createHash("sha256").update(content).digest("hex")}`;
