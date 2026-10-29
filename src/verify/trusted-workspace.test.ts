import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  AccessDenied,
  checkLeanName,
  moduleSourceFile,
  resolveTrustedWorkspace,
} from "./trusted-workspace.ts";

let base: string;
let root: string;
let outside: string;

function lakeProject(dir: string): string {
  mkdirSync(join(dir, "Pkg"), { recursive: true });
  writeFileSync(join(dir, "lean-toolchain"), "leanprover/lean4:v4.35.0\n");
  writeFileSync(join(dir, "lakefile.toml"), 'name = "pkg"\n');
  writeFileSync(join(dir, "lake-manifest.json"), "{}\n");
  writeFileSync(
    join(dir, "Pkg", "Basic.lean"),
    "theorem t : True := trivial\n",
  );
  return dir;
}

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "lean-on-it-trust-"));
  root = join(base, "trusted");
  outside = lakeProject(join(base, "outside"));
  lakeProject(join(root, "project"));
});

describe("resolveTrustedWorkspace", () => {
  it("accepts a Lake project inside a trusted root", () => {
    const workspace = resolveTrustedWorkspace([root], join(root, "project"));
    expect(workspace.root).toMatch(/trusted[/\\]project$/);
  });

  it("refuses when no roots are trusted", () => {
    expect(() => resolveTrustedWorkspace([], join(root, "project"))).toThrow(
      AccessDenied,
    );
  });

  it("refuses a workspace outside every trusted root", () => {
    expect(() => resolveTrustedWorkspace([root], outside)).toThrow(
      /outside the trusted roots/,
    );
  });

  it("refuses .. traversal out of a trusted root", () => {
    const sneaky = join(root, "project", "..", "..", "outside");
    expect(() => resolveTrustedWorkspace([root], sneaky)).toThrow(
      /outside the trusted roots/,
    );
  });

  it("refuses a symlink inside a root that points outside it", () => {
    const link = join(root, "link");
    symlinkSync(outside, link);
    expect(() => resolveTrustedWorkspace([root], link)).toThrow(
      /outside the trusted roots/,
    );
  });

  it("refuses a sibling whose name only starts with the root's", () => {
    const sibling = lakeProject(`${root}-evil`);
    expect(() => resolveTrustedWorkspace([root], sibling)).toThrow(
      /outside the trusted roots/,
    );
  });

  it("refuses a relative path", () => {
    expect(() => resolveTrustedWorkspace([root], "trusted/project")).toThrow(
      /absolute/,
    );
  });

  it("refuses a directory that is not a Lake project", () => {
    const plain = join(root, "plain");
    mkdirSync(plain);
    expect(() => resolveTrustedWorkspace([root], plain)).toThrow(
      /not a Lake project/,
    );
  });

  it("refuses a missing directory", () => {
    expect(() => resolveTrustedWorkspace([root], join(root, "nope"))).toThrow(
      AccessDenied,
    );
  });
});

describe("checkLeanName", () => {
  it.each(["LearnToProveIt.graph_comp_iff", "Nat.add_zero'", "CoreSample.α₁"])(
    "accepts %s",
    (name) => {
      expect(checkLeanName("declaration", name)).toBe(name);
    },
  );

  it.each([
    "",
    "Foo..bar",
    ".Foo",
    "Foo bar",
    'Foo"\n#eval IO.Process.exit 0',
    "«weird name»",
    "Foo/Bar",
    "x".repeat(600),
  ])("refuses %j", (name) => {
    expect(() => checkLeanName("declaration", name)).toThrow(AccessDenied);
  });

  it("refuses ! and ? in module names", () => {
    expect(() => checkLeanName("module", "Foo.bar!")).toThrow(AccessDenied);
  });
});

describe("moduleSourceFile", () => {
  it("maps a module to its source file inside the workspace", () => {
    const workspace = resolveTrustedWorkspace([root], join(root, "project"));
    expect(moduleSourceFile(workspace, "Pkg.Basic").relative).toBe(
      join("Pkg", "Basic.lean"),
    );
  });

  it("refuses a module whose file is missing", () => {
    const workspace = resolveTrustedWorkspace([root], join(root, "project"));
    expect(() => moduleSourceFile(workspace, "Pkg.Missing")).toThrow(
      /no source file/,
    );
  });

  it("refuses a module file that is a symlink out of the workspace", () => {
    const workspace = resolveTrustedWorkspace([root], join(root, "project"));
    symlinkSync(
      join(outside, "Pkg", "Basic.lean"),
      join(root, "project", "Pkg", "Leak.lean"),
    );
    expect(() => moduleSourceFile(workspace, "Pkg.Leak")).toThrow(
      /outside the workspace/,
    );
  });
});
