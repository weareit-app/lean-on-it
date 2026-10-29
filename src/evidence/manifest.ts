// The evidence manifest, schema 1.0.0: four separate records (intended
// claim, formal declaration, verification run, fidelity reviews) and the
// statuses derived from them. The schema is strict: unknown keys and unknown
// versions are rejected rather than guessed at.
import { z } from "zod";

export const MANIFEST_SCHEMA = "lean-on-it/evidence-manifest";
export const MANIFEST_SCHEMA_VERSION = "1.0.0";

/** Lean's standard axioms, the default policy for kernel-checked status. */
export const DEFAULT_ALLOWED_AXIOMS = [
  "propext",
  "Classical.choice",
  "Quot.sound",
] as const;

const text = z.string().min(1);
const timestamp = z.iso.datetime();
export const digestSchema = z
  .string()
  .regex(/^sha256:[0-9a-f]{64}$/, "expected sha256:<64 hex digits>");

/** Evidence a run either captured, or could not, with the reason why. */
function evidence<T extends z.ZodRawShape>(shape: T) {
  return z.discriminatedUnion("status", [
    z.strictObject({ status: z.literal("captured"), ...shape }),
    z.strictObject({ status: z.literal("unavailable"), reason: text }),
  ]);
}

export const claimSchema = z.strictObject({
  id: text,
  statement: text,
  assumptions: z.array(text),
  scope: text,
  source: z.strictObject({
    title: text,
    locator: text,
    version: text,
    uri: text.optional(),
    digest: digestSchema.optional(),
  }),
  notes: z.array(text),
});

export const environmentSchema = z.strictObject({
  lean: evidence({ version: text, commit: text }),
  lake: evidence({ version: text }),
  toolchain: text,
  lakeManifestDigest: digestSchema,
  packages: z.array(
    z.strictObject({
      name: text,
      url: text,
      rev: text,
      inputRev: text.nullable(),
    }),
  ),
  workspace: z.strictObject({
    package: text,
    revision: z.discriminatedUnion("vcs", [
      z.strictObject({
        vcs: z.literal("git"),
        commit: text,
        dirty: z.boolean(),
      }),
      z.strictObject({ vcs: z.literal("none") }),
    ]),
  }),
});

export const declarationSchema = z.strictObject({
  id: text,
  name: text,
  module: text,
  sourceFile: text,
  sourceDigest: digestSchema,
  lookup: z.discriminatedUnion("status", [
    z.strictObject({
      status: z.literal("found"),
      kind: z.enum(["theorem", "definition", "axiom", "opaque", "other"]),
      definedInModule: z.boolean(),
      levelParams: z.array(text),
    }),
    z.strictObject({ status: z.literal("not_found"), reason: text }),
    z.strictObject({ status: z.literal("unavailable"), reason: text }),
  ]),
  elaboratedType: evidence({
    pretty: text,
    explicit: text,
    digest: digestSchema,
  }),
  environment: environmentSchema,
});

export const STEP_IDS = [
  "freshness",
  "elaborate",
  "inspect",
  "kernel_replay",
] as const;

export const stepSchema = z.strictObject({
  id: z.enum(STEP_IDS),
  argv: z.array(text),
  exitCode: z.number().int().nullable(),
  durationMs: z.number().nonnegative(),
  outcome: z.enum(["passed", "failed", "error", "skipped"]),
  detail: z.string(),
  log: text.nullable(),
});

export const artifactSchema = z.strictObject({
  name: text,
  digest: digestSchema,
  bytes: z.number().int().nonnegative(),
});

export const verificationRunSchema = z.strictObject({
  id: text,
  declarationId: text,
  operator: text.nullable(),
  tool: z.strictObject({ name: z.literal("lean-on-it"), version: text }),
  startedAt: timestamp,
  finishedAt: timestamp,
  axiomPolicy: z.strictObject({ allowed: z.array(text) }),
  steps: z.array(stepSchema),
  diagnostics: evidence({
    errors: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
    sorryWarnings: z.number().int().nonnegative(),
  }),
  axioms: evidence({ names: z.array(text) }),
  dependencies: evidence({
    direct: z.array(text),
    closureSize: z.number().int().nonnegative(),
    modules: z.array(text),
    closureDigest: digestSchema,
    artifact: text,
  }),
  artifacts: z.array(artifactSchema),
  limitations: z.array(text),
});

export const FINDING_CATEGORIES = [
  "missing_hypothesis",
  "added_or_restrictive_hypothesis",
  "quantifier_mismatch",
  "definitional_mismatch",
  "conclusion_mismatch",
  "vacuity",
  "undetermined",
] as const;

export const findingSchema = z.strictObject({
  category: z.enum(FINDING_CATEGORIES),
  severity: z.enum(["critical", "major", "minor"]),
  description: text,
  claimLocator: text.optional(),
  leanLocator: text.optional(),
});

export const fidelityReviewSchema = z.strictObject({
  id: text,
  claimId: text,
  declarationId: text,
  reviewedTypeDigest: digestSchema,
  reviewer: z.strictObject({
    id: text,
    kind: z.enum(["human", "ai_model"]),
    competence: text.optional(),
  }),
  independence: z.strictObject({
    participatedInFormalization: z.boolean(),
    readTypeBeforeClaim: z.boolean(),
    conflicts: z.array(text),
  }),
  readback: text,
  verdict: z.enum(["faithful", "not_faithful", "undetermined"]),
  findings: z.array(findingSchema),
  limitations: z.array(text),
  reviewedAt: timestamp,
});

export const KERNEL_STATUSES = [
  "kernel_checked",
  "rejected",
  "incomplete",
] as const;

export const FIDELITY_STATUSES = [
  "not_reviewed",
  "approved",
  "rejected",
  "inconclusive",
  "ai_screened",
  "stale",
] as const;

const derivedStatus = <T extends readonly [string, ...string[]]>(values: T) =>
  z.strictObject({ status: z.enum(values), reasons: z.array(text) });

export const statusSummarySchema = z.strictObject({
  kernel: derivedStatus(KERNEL_STATUSES),
  fidelity: derivedStatus(FIDELITY_STATUSES),
});

export const evidenceManifestSchema = z.strictObject({
  schema: z.literal(MANIFEST_SCHEMA),
  schemaVersion: z.literal(MANIFEST_SCHEMA_VERSION),
  generatedAt: timestamp,
  claim: claimSchema,
  declaration: declarationSchema,
  verification: verificationRunSchema,
  fidelityReviews: z.array(fidelityReviewSchema),
  status: statusSummarySchema,
});

export type IntendedClaim = z.infer<typeof claimSchema>;
export type FormalEnvironment = z.infer<typeof environmentSchema>;
export type FormalDeclaration = z.infer<typeof declarationSchema>;
export type VerificationStep = z.infer<typeof stepSchema>;
export type VerificationRun = z.infer<typeof verificationRunSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type FidelityReview = z.infer<typeof fidelityReviewSchema>;
export type KernelStatus = (typeof KERNEL_STATUSES)[number];
export type FidelityStatus = (typeof FIDELITY_STATUSES)[number];
export type StatusSummary = z.infer<typeof statusSummarySchema>;
export type EvidenceManifest = z.infer<typeof evidenceManifestSchema>;
