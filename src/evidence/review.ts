// Attaching a fidelity review: a separate act from verification. It runs no
// Lean and changes nothing but the review list and the fidelity status.
import { type EvidenceManifest, fidelityReviewSchema } from "./manifest.ts";
import {
  deriveStatus,
  type ValidationResult,
  validateManifest,
} from "./validate.ts";

export function attachFidelityReview(
  manifest: EvidenceManifest,
  review: unknown,
): ValidationResult {
  const parsed = fidelityReviewSchema.safeParse(review);
  if (!parsed.success)
    return {
      ok: false,
      errors: parsed.error.issues.map(
        (issue) => `review.${issue.path.join(".")}: ${issue.message}`,
      ),
    };
  if (manifest.fidelityReviews.some((r) => r.id === parsed.data.id))
    return {
      ok: false,
      errors: [`a review with id "${parsed.data.id}" is already recorded`],
    };
  const fidelityReviews = [...manifest.fidelityReviews, parsed.data];
  const status = deriveStatus({ ...manifest, fidelityReviews });
  return validateManifest({
    ...manifest,
    fidelityReviews,
    status: { kernel: manifest.status.kernel, fidelity: status.fidelity },
  });
}
