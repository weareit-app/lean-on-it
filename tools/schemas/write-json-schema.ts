// Regenerates the checked-in JSON Schema from the Zod manifest schema.
import { writeFileSync } from "node:fs";
import {
  MANIFEST_JSON_SCHEMA_PATH,
  manifestJsonSchema,
} from "../../src/evidence/json-schema.ts";

writeFileSync(
  MANIFEST_JSON_SCHEMA_PATH,
  `${JSON.stringify(manifestJsonSchema(), null, 2)}\n`,
);
console.log(`Wrote ${MANIFEST_JSON_SCHEMA_PATH}`);
