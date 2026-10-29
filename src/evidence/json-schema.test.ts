import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MANIFEST_JSON_SCHEMA_PATH,
  manifestJsonSchema,
} from "./json-schema.ts";

describe("published JSON Schema", () => {
  it("matches the Zod schema (regenerate with pnpm schema:write)", () => {
    const published = JSON.parse(
      readFileSync(MANIFEST_JSON_SCHEMA_PATH, "utf8"),
    );
    expect(published).toEqual(manifestJsonSchema());
  });
});
