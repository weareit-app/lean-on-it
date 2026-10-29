// The manifest schema as JSON Schema, for tools that do not use Zod. The
// checked-in copy is generated from the Zod schema and kept in sync by a test.
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  evidenceManifestSchema,
  MANIFEST_SCHEMA,
  MANIFEST_SCHEMA_VERSION,
} from "./manifest.ts";

export const MANIFEST_JSON_SCHEMA_PATH = fileURLToPath(
  new URL(
    `../../schemas/evidence-manifest-${MANIFEST_SCHEMA_VERSION}.schema.json`,
    import.meta.url,
  ),
);

export function manifestJsonSchema(): Record<string, unknown> {
  return {
    $id: `https://github.com/weareit-app/lean-on-it/schemas/evidence-manifest-${MANIFEST_SCHEMA_VERSION}.schema.json`,
    title: `${MANIFEST_SCHEMA} ${MANIFEST_SCHEMA_VERSION}`,
    ...z.toJSONSchema(evidenceManifestSchema, { target: "draft-2020-12" }),
  };
}
