// A hand-written, known-good manifest for tests: kernel-checked and not yet
// reviewed. Tests copy it and change one thing.
import type { EvidenceManifest, FidelityReview } from "./manifest.ts";

const hex = (c: string) => `sha256:${c.repeat(64)}`;

export const SAMPLE_TYPE_DIGEST = hex("a");

export function sampleManifest(): EvidenceManifest {
  return {
    schema: "lean-on-it/evidence-manifest",
    schemaVersion: "1.0.0",
    generatedAt: "2026-10-28T12:00:00.000Z",
    claim: {
      id: "claim:sample",
      statement:
        "Composing a function's graph with a relation is substitution.",
      assumptions: [],
      scope: "Arbitrary types and relations.",
      source: {
        title: "sample fixture",
        locator: "Sample.lean, docstring",
        version: "git:0000000",
      },
      notes: [],
    },
    declaration: {
      id: "declaration:Sample.thm",
      name: "Sample.thm",
      module: "Sample",
      sourceFile: "Sample.lean",
      sourceDigest: hex("b"),
      lookup: {
        status: "found",
        kind: "theorem",
        definedInModule: true,
        levelParams: [],
      },
      elaboratedType: {
        status: "captured",
        pretty: "1 = 1",
        explicit: "@Eq.{1} Nat 1 1",
        digest: SAMPLE_TYPE_DIGEST,
      },
      environment: {
        lean: { status: "captured", version: "4.35.0", commit: "eb6cafb" },
        lake: { status: "captured", version: "5.0.0" },
        toolchain: "leanprover/lean4:v4.35.0",
        lakeManifestDigest: hex("c"),
        packages: [],
        workspace: {
          package: "sample",
          revision: { vcs: "git", commit: "0000000", dirty: false },
        },
      },
    },
    verification: {
      id: "run:sample",
      declarationId: "declaration:Sample.thm",
      operator: "operator@example",
      tool: { name: "lean-on-it", version: "0.0.0" },
      startedAt: "2026-10-28T12:00:00.000Z",
      finishedAt: "2026-10-28T12:01:00.000Z",
      axiomPolicy: { allowed: ["propext", "Classical.choice", "Quot.sound"] },
      steps: (
        ["freshness", "elaborate", "inspect", "kernel_replay"] as const
      ).map((id) => ({
        id,
        argv: ["lake", "env", "lean"],
        exitCode: 0,
        durationMs: 1,
        outcome: "passed" as const,
        detail: "",
        log: `logs/${id}.log`,
      })),
      diagnostics: {
        status: "captured",
        errors: 0,
        warnings: 0,
        sorryWarnings: 0,
      },
      axioms: { status: "captured", names: ["propext"] },
      dependencies: {
        status: "captured",
        direct: ["Eq"],
        closureSize: 1,
        modules: ["Init.Prelude"],
        closureDigest: hex("d"),
        artifact: "dependency-closure.json",
      },
      artifacts: [],
      limitations: [],
    },
    fidelityReviews: [],
    status: {
      kernel: { status: "kernel_checked", reasons: [] },
      fidelity: {
        status: "not_reviewed",
        reasons: ["no fidelity review has been recorded"],
      },
    },
  };
}

/** A blind, independent human review that finds the statement faithful. */
export function sampleReview(): FidelityReview {
  return {
    id: "review:sample",
    claimId: "claim:sample",
    declarationId: "declaration:Sample.thm",
    reviewedTypeDigest: SAMPLE_TYPE_DIGEST,
    reviewer: { id: "reviewer@example", kind: "human" },
    independence: {
      participatedInFormalization: false,
      readTypeBeforeClaim: true,
      conflicts: [],
    },
    readback: "One equals one.",
    verdict: "faithful",
    findings: [],
    limitations: [],
    reviewedAt: "2026-10-29T12:00:00.000Z",
  };
}
