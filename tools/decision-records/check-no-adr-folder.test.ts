import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkRepo } from "./check-no-adr-folder.mjs";

let root: string | undefined;

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function repo(files: string[]) {
  root = mkdtempSync(join(tmpdir(), "no-adr-"));
  for (const path of files) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), "");
  }
  return root;
}

describe("checkRepo", () => {
  it("passes when there is no docs/adr/ folder", () => {
    expect(checkRepo(repo(["docs/architecture/decisions.md"]))).toEqual([]);
  });

  it("fails on a docs/adr/ folder and points to decisions.md", () => {
    const problems = checkRepo(repo(["docs/adr/0001-something.md"]));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("docs/adr/ exists");
    expect(problems[0]).toContain("docs/architecture/decisions.md");
  });

  it("fails on an empty docs/adr/ folder", () => {
    const dir = repo([]);
    mkdirSync(join(dir, "docs/adr"), { recursive: true });
    expect(checkRepo(dir)).toHaveLength(1);
  });
});
