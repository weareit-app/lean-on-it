// The committed evidence bundles were produced by `lean-on-it verify` against
// real checkouts. CI has no Lean toolchain, so it checks them as data: the
// manifest validates, every artifact matches its digest, and the statuses are
// the ones the records support.
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readBundle } from "./bundle.ts";

const bundle = (path: string) =>
  fileURLToPath(new URL(`../../evidence/${path}`, import.meta.url));

describe("learn-to-prove-it graph_comp_iff evidence", () => {
  const result = readBundle(
    bundle("learn-to-prove-it/LearnToProveIt.graph_comp_iff"),
  );

  it("validates, artifacts included", () => {
    expect(result.ok ? [] : result.errors).toEqual([]);
  });

  it("is kernel-checked and not yet independently reviewed", () => {
    if (!result.ok) throw new Error(result.errors.join("\n"));
    const { manifest } = result;
    expect(manifest.declaration.name).toBe("LearnToProveIt.graph_comp_iff");
    expect(manifest.declaration.environment.lean).toMatchObject({
      status: "captured",
      version: "4.35.0",
    });
    expect(manifest.declaration.environment.workspace.revision).toMatchObject({
      vcs: "git",
      dirty: false,
    });
    expect(manifest.status.kernel.status).toBe("kernel_checked");
    expect(manifest.status.fidelity.status).toBe("not_reviewed");
    expect(manifest.fidelityReviews).toEqual([]);
  });
});
