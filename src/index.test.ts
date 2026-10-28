import { describe, expect, it } from "vitest";
import { packageName } from "./index.ts";

describe("packageName", () => {
  it("names the package", () => {
    expect(packageName()).toBe("lean-on-it");
  });
});
