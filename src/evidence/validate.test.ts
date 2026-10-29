import { describe, expect, it } from "vitest";
import type { EvidenceManifest } from "./manifest.ts";
import { sampleManifest } from "./sample-manifest.ts";
import { deriveStatus, validateManifest } from "./validate.ts";

function errorsOf(manifest: unknown): string[] {
  const result = validateManifest(manifest);
  return result.ok ? [] : result.errors;
}

/** A manifest changed by `edit`, with its stated statuses left as they were. */
function edited(edit: (m: EvidenceManifest) => void): EvidenceManifest {
  const manifest = sampleManifest();
  edit(manifest);
  return manifest;
}

describe("validateManifest", () => {
  it("accepts a kernel-checked, not-reviewed manifest", () => {
    expect(validateManifest(sampleManifest())).toMatchObject({ ok: true });
  });

  it("rejects unknown keys", () => {
    const manifest = { ...sampleManifest(), verified: true };
    expect(errorsOf(manifest).join("\n")).toMatch(/verified/);
  });

  it("rejects an unknown schema version", () => {
    const manifest = { ...sampleManifest(), schemaVersion: "2.0.0" };
    expect(errorsOf(manifest).join("\n")).toMatch(/schemaVersion/);
  });

  it("rejects a run that refers to another declaration", () => {
    const manifest = edited((m) => {
      m.verification.declarationId = "declaration:Other";
    });
    expect(errorsOf(manifest).join("\n")).toMatch(/declarationId/);
  });

  describe("misleading kernel status", () => {
    it.each<[string, (m: EvidenceManifest) => void, string]>([
      [
        "the declaration depends on sorryAx",
        (m) => {
          m.verification.axioms = { status: "captured", names: ["sorryAx"] };
        },
        "rejected",
      ],
      [
        "it depends on an axiom outside the policy",
        (m) => {
          m.verification.axioms = {
            status: "captured",
            names: ["propext", "Sample.cheat"],
          };
        },
        "rejected",
      ],
      [
        "elaboration reported a sorry warning",
        (m) => {
          m.verification.diagnostics = {
            status: "captured",
            errors: 0,
            warnings: 1,
            sorryWarnings: 1,
          };
        },
        "rejected",
      ],
      [
        "elaboration failed",
        (m) => {
          m.verification.steps[1]!.outcome = "failed";
        },
        "rejected",
      ],
      [
        "the kernel replay failed",
        (m) => {
          m.verification.steps[3]!.outcome = "failed";
        },
        "rejected",
      ],
      [
        "the declaration was not found",
        (m) => {
          m.declaration.lookup = {
            status: "not_found",
            reason: "no such name",
          };
        },
        "rejected",
      ],
      [
        "the elaborated type was not captured",
        (m) => {
          m.declaration.elaboratedType = {
            status: "unavailable",
            reason: "probe crashed",
          };
        },
        "incomplete",
      ],
      [
        "axioms were not captured",
        (m) => {
          m.verification.axioms = { status: "unavailable", reason: "timeout" };
        },
        "incomplete",
      ],
      [
        "the dependency closure was not captured",
        (m) => {
          m.verification.dependencies = {
            status: "unavailable",
            reason: "timeout",
          };
        },
        "incomplete",
      ],
      [
        "the Lean version was not captured",
        (m) => {
          m.declaration.environment.lean = {
            status: "unavailable",
            reason: "lean --version failed",
          };
        },
        "incomplete",
      ],
      [
        "a step could not run",
        (m) => {
          m.verification.steps[0]!.outcome = "error";
        },
        "incomplete",
      ],
      [
        "a step is missing",
        (m) => {
          m.verification.steps.pop();
        },
        "incomplete",
      ],
    ])("refuses kernel_checked when %s", (_case, edit, derived) => {
      const manifest = edited(edit);
      expect(deriveStatus(manifest).kernel.status).toBe(derived);
      expect(errorsOf(manifest).join("\n")).toContain(
        `kernel status is "kernel_checked" but the records support "${derived}"`,
      );
    });
  });

  describe("misleading fidelity status", () => {
    it("derives not_reviewed from a fully kernel-checked run", () => {
      const status = deriveStatus(sampleManifest());
      expect(status.kernel.status).toBe("kernel_checked");
      expect(status.fidelity.status).toBe("not_reviewed");
    });

    it("refuses approved fidelity with no review", () => {
      const manifest = edited((m) => {
        m.status.fidelity = { status: "approved", reasons: [] };
      });
      expect(errorsOf(manifest).join("\n")).toContain(
        'fidelity status is "approved" but the records support "not_reviewed"',
      );
    });
  });
});
