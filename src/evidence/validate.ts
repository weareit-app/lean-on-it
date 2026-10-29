// Validation and status derivation. Statuses are never trusted as stated: a
// manifest is valid only if its stated statuses are the ones its records
// support. Kernel status is derived from the verification run alone and is
// not an input to fidelity status.
import {
  type EvidenceManifest,
  evidenceManifestSchema,
  type FidelityReview,
  type FidelityStatus,
  type FormalDeclaration,
  type KernelStatus,
  STEP_IDS,
  type StatusSummary,
  type VerificationRun,
} from "./manifest.ts";

export type ValidationResult =
  | { ok: true; manifest: EvidenceManifest }
  | { ok: false; errors: string[] };

interface Derived<S> {
  status: S;
  reasons: string[];
}

export interface StatusInputs {
  declaration: FormalDeclaration;
  verification: VerificationRun;
  fidelityReviews: FidelityReview[];
}

/** The statuses a manifest's records support. */
export function deriveStatus(records: StatusInputs): StatusSummary {
  return {
    kernel: deriveKernelStatus(records.declaration, records.verification),
    fidelity: deriveFidelityStatus(
      records.declaration,
      records.fidelityReviews,
    ),
  };
}

function deriveKernelStatus(
  declaration: FormalDeclaration,
  run: VerificationRun,
): Derived<KernelStatus> {
  const rejected: string[] = [];
  const incomplete: string[] = [];

  for (const id of STEP_IDS) {
    const step = run.steps.find((s) => s.id === id);
    if (!step) incomplete.push(`step ${id} is missing`);
    else if (step.outcome === "failed")
      rejected.push(`step ${id} failed: ${step.detail}`);
    else if (step.outcome !== "passed")
      incomplete.push(`step ${id} did not complete (${step.outcome})`);
  }

  const { lookup } = declaration;
  if (lookup.status === "not_found")
    rejected.push(`declaration not found: ${lookup.reason}`);
  else if (lookup.status === "unavailable")
    incomplete.push(`declaration lookup unavailable: ${lookup.reason}`);
  else if (!lookup.definedInModule)
    rejected.push(`declaration is not defined in module ${declaration.module}`);

  for (const tool of ["lean", "lake"] as const) {
    const found = declaration.environment[tool];
    if (found.status === "unavailable")
      incomplete.push(`${tool} version unavailable: ${found.reason}`);
  }

  if (declaration.elaboratedType.status === "unavailable")
    incomplete.push(
      `elaborated type unavailable: ${declaration.elaboratedType.reason}`,
    );

  const { diagnostics, axioms, dependencies } = run;
  if (diagnostics.status === "unavailable")
    incomplete.push(`diagnostics unavailable: ${diagnostics.reason}`);
  else {
    if (diagnostics.errors > 0)
      rejected.push(`elaboration reported ${diagnostics.errors} error(s)`);
    if (diagnostics.sorryWarnings > 0)
      rejected.push(
        `elaboration reported ${diagnostics.sorryWarnings} sorry warning(s)`,
      );
  }

  if (axioms.status === "unavailable")
    incomplete.push(`axioms unavailable: ${axioms.reason}`);
  else {
    const allowed = new Set(run.axiomPolicy.allowed);
    const disallowed = axioms.names.filter((name) => !allowed.has(name));
    if (disallowed.length > 0)
      rejected.push(`depends on disallowed axiom(s): ${disallowed.join(", ")}`);
  }

  if (dependencies.status === "unavailable")
    incomplete.push(`dependency closure unavailable: ${dependencies.reason}`);

  if (rejected.length > 0)
    return { status: "rejected", reasons: [...rejected, ...incomplete] };
  if (incomplete.length > 0)
    return { status: "incomplete", reasons: incomplete };
  return { status: "kernel_checked", reasons: [] };
}

/** Why a faithful review cannot approve, or nothing if it can. */
function approvalBlockers(review: FidelityReview): string[] {
  const blockers: string[] = [];
  if (review.reviewer.kind !== "human")
    blockers.push("an AI review screens but does not certify");
  if (review.independence.participatedInFormalization)
    blockers.push("the reviewer took part in the formalization");
  if (!review.independence.readTypeBeforeClaim)
    blockers.push("the reviewer saw the intended claim before the Lean type");
  return blockers;
}

function deriveFidelityStatus(
  declaration: FormalDeclaration,
  reviews: FidelityReview[],
): Derived<FidelityStatus> {
  if (reviews.length === 0)
    return {
      status: "not_reviewed",
      reasons: ["no fidelity review has been recorded"],
    };
  const type = declaration.elaboratedType;
  const currentDigest = type.status === "captured" ? type.digest : null;
  const current = reviews.filter((r) => r.reviewedTypeDigest === currentDigest);
  if (current.length === 0)
    return {
      status: "stale",
      reasons: [
        currentDigest
          ? "every review is of an elaborated type other than the current one"
          : "the current elaborated type was not captured, so no review can be bound to it",
      ],
    };

  const objections = current.filter((r) => r.verdict === "not_faithful");
  if (objections.length > 0)
    return {
      status: "rejected",
      reasons: objections.map(
        (r) => `${r.id} found the statement not faithful`,
      ),
    };
  const undetermined = current.filter((r) => r.verdict === "undetermined");
  if (undetermined.length > 0)
    return {
      status: "inconclusive",
      reasons: undetermined.map((r) => `${r.id} could not determine fidelity`),
    };
  const approvals = current.filter((r) => approvalBlockers(r).length === 0);
  if (approvals.length > 0)
    return {
      status: "approved",
      reasons: approvals.map(
        (r) => `${r.id}: blind, independent human review found it faithful`,
      ),
    };
  const reasons = current.flatMap((r) =>
    approvalBlockers(r).map((b) => `${r.id}: ${b}`),
  );
  return current.every((r) => r.reviewer.kind === "ai_model")
    ? { status: "ai_screened", reasons }
    : { status: "inconclusive", reasons };
}

/** The identities that may never act as a fidelity reviewer. */
function selfReviewers(manifest: EvidenceManifest): Map<string, string> {
  const ids = new Map<string, string>([
    [manifest.verification.tool.name, "the verifier"],
  ]);
  if (manifest.verification.operator)
    ids.set(manifest.verification.operator, "the verification run's operator");
  return ids;
}

/** Problems with how the records refer to each other, and contradictions. */
function crossReferenceErrors(manifest: EvidenceManifest): string[] {
  const errors: string[] = [];
  const declarationId = manifest.declaration.id;
  if (manifest.verification.declarationId !== declarationId)
    errors.push(
      `verification.declarationId "${manifest.verification.declarationId}" does not match declaration.id "${declarationId}"`,
    );
  const forbidden = selfReviewers(manifest);
  const seen = new Set<string>();
  for (const review of manifest.fidelityReviews) {
    if (seen.has(review.id))
      errors.push(`review id "${review.id}" is recorded more than once`);
    seen.add(review.id);
    if (review.declarationId !== declarationId)
      errors.push(
        `${review.id}: declarationId "${review.declarationId}" does not match declaration.id "${declarationId}"`,
      );
    if (review.claimId !== manifest.claim.id)
      errors.push(
        `${review.id}: claimId "${review.claimId}" does not match claim.id "${manifest.claim.id}"`,
      );
    const role = forbidden.get(review.reviewer.id);
    if (role)
      errors.push(
        `${review.id}: reviewer "${review.reviewer.id}" is ${role} and cannot review fidelity`,
      );
    const serious = review.findings.filter((f) => f.severity !== "minor");
    if (review.verdict === "faithful" && serious.length > 0)
      errors.push(
        `${review.id}: a faithful verdict cannot carry ${serious.map((f) => f.severity).join(", ")} finding(s)`,
      );
  }
  return errors;
}

export function validateManifest(input: unknown): ValidationResult {
  const parsed = evidenceManifestSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      errors: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
      ),
    };
  const manifest = parsed.data;
  const errors = crossReferenceErrors(manifest);
  const derived = deriveStatus(manifest);
  if (manifest.status.kernel.status !== derived.kernel.status)
    errors.push(
      `kernel status is "${manifest.status.kernel.status}" but the records support "${derived.kernel.status}": ${derived.kernel.reasons.join("; ")}`,
    );
  if (manifest.status.fidelity.status !== derived.fidelity.status)
    errors.push(
      `fidelity status is "${manifest.status.fidelity.status}" but the records support "${derived.fidelity.status}": ${derived.fidelity.reasons.join("; ")}`,
    );
  return errors.length > 0 ? { ok: false, errors } : { ok: true, manifest };
}
