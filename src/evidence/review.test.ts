import { describe, expect, it } from "vitest";
import type { FidelityReview } from "./manifest.ts";
import { attachFidelityReview } from "./review.ts";
import { sampleManifest, sampleReview } from "./sample-manifest.ts";
import { deriveStatus, validateManifest } from "./validate.ts";

function review(edit: (r: FidelityReview) => void = () => {}): FidelityReview {
  const r = sampleReview();
  edit(r);
  return r;
}

function fidelityAfter(...reviews: FidelityReview[]): string {
  let manifest = sampleManifest();
  for (const r of reviews) {
    const result = attachFidelityReview(manifest, r);
    if (!result.ok) throw new Error(result.errors.join("\n"));
    manifest = result.manifest;
  }
  return manifest.status.fidelity.status;
}

function refusal(r: FidelityReview): string {
  const result = attachFidelityReview(sampleManifest(), r);
  expect(result.ok).toBe(false);
  return result.ok ? "" : result.errors.join("\n");
}

describe("attachFidelityReview", () => {
  it("approves on a blind, independent human faithful review", () => {
    expect(fidelityAfter(review())).toBe("approved");
  });

  it("produces a manifest that validates", () => {
    const result = attachFidelityReview(sampleManifest(), review());
    expect(result.ok && validateManifest(result.manifest).ok).toBe(true);
  });

  it("leaves the kernel status and verification run untouched", () => {
    const before = sampleManifest();
    const result = attachFidelityReview(before, review());
    if (!result.ok) throw new Error(result.errors.join("\n"));
    expect(result.manifest.status.kernel).toEqual(before.status.kernel);
    expect(result.manifest.verification).toEqual(before.verification);
  });

  it("treats a review of another elaborated type as stale", () => {
    const old = review((r) => {
      r.reviewedTypeDigest = `sha256:${"e".repeat(64)}`;
    });
    expect(fidelityAfter(old)).toBe("stale");
  });

  it("treats a review as stale once the claim's content changes under the same id", () => {
    const attached = attachFidelityReview(sampleManifest(), review());
    if (!attached.ok) throw new Error(attached.errors.join("\n"));
    const changed = structuredClone(attached.manifest);
    changed.claim.assumptions.push("f is injective");
    expect(changed.claim.id).toBe(attached.manifest.claim.id);
    expect(deriveStatus(changed).fidelity.status).toBe("stale");
  });

  it("treats a review as stale once the claim's statement is reworded", () => {
    const attached = attachFidelityReview(sampleManifest(), review());
    if (!attached.ok) throw new Error(attached.errors.join("\n"));
    const changed = structuredClone(attached.manifest);
    changed.claim.statement =
      "Composing a relation with a function's graph is substitution.";
    expect(deriveStatus(changed).fidelity.status).toBe("stale");
    expect(validateManifest(changed).ok).toBe(false);
  });

  it("treats a review of another claim version as stale", () => {
    const other = review((r) => {
      r.reviewedClaimDigest = `sha256:${"f".repeat(64)}`;
    });
    expect(fidelityAfter(other)).toBe("stale");
  });

  it("only AI-screens on an AI faithful review", () => {
    const ai = review((r) => {
      r.reviewer = { id: "model:example", kind: "ai_model" };
    });
    expect(fidelityAfter(ai)).toBe("ai_screened");
  });

  it("does not approve a reviewer who took part in the formalization", () => {
    const insider = review((r) => {
      r.independence.participatedInFormalization = true;
    });
    expect(fidelityAfter(insider)).toBe("inconclusive");
  });

  it("does not approve a reviewer who saw the claim before the type", () => {
    const unblinded = review((r) => {
      r.independence.readTypeBeforeClaim = false;
    });
    expect(fidelityAfter(unblinded)).toBe("inconclusive");
  });

  it("rejects on any current not-faithful verdict", () => {
    const objection = review((r) => {
      r.id = "review:objection";
      r.reviewer = { id: "model:example", kind: "ai_model" };
      r.verdict = "not_faithful";
      r.findings = [
        {
          category: "missing_hypothesis",
          severity: "critical",
          description: "The claim needs f injective.",
        },
      ];
    });
    expect(fidelityAfter(review(), objection)).toBe("rejected");
  });

  it("is inconclusive on an undetermined verdict", () => {
    const unsure = review((r) => {
      r.verdict = "undetermined";
      r.findings = [
        {
          category: "undetermined",
          severity: "major",
          description: "Cannot tell which composition order is intended.",
        },
      ];
    });
    expect(fidelityAfter(unsure)).toBe("inconclusive");
  });

  it("refuses a faithful verdict that carries a critical finding", () => {
    const contradictory = review((r) => {
      r.findings = [
        {
          category: "vacuity",
          severity: "critical",
          description: "The hypotheses are unsatisfiable.",
        },
      ];
    });
    expect(refusal(contradictory)).toMatch(/faithful.*critical/);
  });

  it("allows a faithful verdict with a minor finding", () => {
    const minor = review((r) => {
      r.findings = [
        {
          category: "definitional_mismatch",
          severity: "minor",
          description: "Uses Relation.Comp rather than set composition.",
        },
      ];
    });
    expect(fidelityAfter(minor)).toBe("approved");
  });

  it("refuses lean-on-it itself as a reviewer", () => {
    const self = review((r) => {
      r.reviewer.id = "lean-on-it";
    });
    expect(refusal(self)).toMatch(/reviewer/);
  });

  it("refuses the run's operator as a reviewer", () => {
    const operator = review((r) => {
      r.reviewer.id = "operator@example";
    });
    expect(refusal(operator)).toMatch(/operator/);
  });

  it("refuses a review of another declaration", () => {
    const elsewhere = review((r) => {
      r.declarationId = "declaration:Other";
    });
    expect(refusal(elsewhere)).toMatch(/declarationId/);
  });

  it("refuses a review with an id already in the manifest", () => {
    const first = attachFidelityReview(sampleManifest(), review());
    if (!first.ok) throw new Error(first.errors.join("\n"));
    const again = attachFidelityReview(first.manifest, review());
    expect(again.ok ? "" : again.errors.join("\n")).toMatch(/already/);
  });

  it("refuses a malformed review", () => {
    const result = attachFidelityReview(sampleManifest(), {
      ...review(),
      verdict: "approved",
    } as unknown as FidelityReview);
    expect(result.ok).toBe(false);
  });
});
