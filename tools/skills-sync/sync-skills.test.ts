import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkSkills, syncSkills } from "./sync-skills.mjs";

let root: string | undefined;

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function write(path: string, text: string) {
  if (!root) throw new Error("call repo() first");
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

/** A checkout with the given files, relative to its root. */
function repo(files: Record<string, string>) {
  root = mkdtempSync(join(tmpdir(), "skills-sync-"));
  for (const [path, text] of Object.entries(files)) write(path, text);
  return root;
}

const inStep = {
  ".claude/skills/LICENSE": "MIT",
  ".agents/skills/LICENSE": "MIT",
  ".claude/skills/pains-review/SKILL.md": "review",
  ".claude/skills/tdd/SKILL.md": "tdd",
  ".claude/skills/tdd/agents/openai.yaml": "yaml",
  ".agents/skills/pains-review/SKILL.md": "review",
  ".agents/skills/tdd/SKILL.md": "tdd",
  ".agents/skills/tdd/agents/openai.yaml": "yaml",
};

describe("checkSkills", () => {
  it("passes when every skill's two copies match", () => {
    expect(checkSkills(repo(inStep))).toEqual([]);
  });

  it("names a skill edited in one folder only", () => {
    const dir = repo(inStep);
    write(".claude/skills/pains-review/SKILL.md", "review, edited");
    expect(checkSkills(dir)).toEqual([
      "pains-review: .agents/skills/pains-review differs from .claude/skills/pains-review",
    ]);
  });

  it("names a skill with a file added, or missing from the copy", () => {
    const dir = repo(inStep);
    write(".agents/skills/tdd/extra.md", "extra");
    write(".claude/skills/new-skill/SKILL.md", "new");
    expect(checkSkills(dir)).toEqual([
      "new-skill: .agents/skills/new-skill differs from .claude/skills/new-skill",
      "tdd: .agents/skills/tdd differs from .claude/skills/tdd",
    ]);
  });

  it("names a copy whose source was removed", () => {
    const dir = repo(inStep);
    write(".agents/skills/to-spec/SKILL.md", "removed upstream");
    expect(checkSkills(dir)).toEqual([
      "to-spec: .agents/skills/to-spec has no source in .claude/skills",
    ]);
  });

  it("names a LICENSE notice that differs or is missing", () => {
    const dir = repo(inStep);
    write(".agents/skills/LICENSE", "edited");
    expect(checkSkills(dir)).toEqual([
      "LICENSE: .agents/skills/LICENSE differs from .claude/skills/LICENSE",
    ]);
    rmSync(join(dir, ".claude/skills/LICENSE"));
    rmSync(join(dir, ".agents/skills/LICENSE"));
    expect(checkSkills(dir)).toEqual([
      "LICENSE: .claude/skills/LICENSE is missing; vendored skills keep their licence notice",
    ]);
  });

  it("ignores OpenSpec's generated skills and dotfiles", () => {
    const dir = repo({
      ...inStep,
      ".claude/skills/openspec-propose/SKILL.md": "/opsx:propose",
      ".agents/skills/openspec-propose/SKILL.md": "$openspec-propose",
      ".agents/skills/.openspec-target": "codex",
      ".claude/skills/tdd/.DS_Store": "",
    });
    expect(checkSkills(dir)).toEqual([]);
  });
});

describe("syncSkills", () => {
  it("brings the copy in step and leaves OpenSpec's files alone", () => {
    const dir = repo({
      ...inStep,
      ".claude/skills/pains-review/SKILL.md": "review, edited",
      ".agents/skills/LICENSE": "stale",
      ".agents/skills/tdd/extra.md": "extra",
      ".agents/skills/to-spec/SKILL.md": "removed upstream",
      ".claude/skills/openspec-propose/SKILL.md": "/opsx:propose",
      ".agents/skills/openspec-propose/SKILL.md": "$openspec-propose",
      ".agents/skills/.openspec-target": "codex",
    });
    syncSkills(dir);
    expect(checkSkills(dir)).toEqual([]);
    expect(
      readFileSync(join(dir, ".agents/skills/pains-review/SKILL.md"), "utf8"),
    ).toBe("review, edited");
    expect(existsSync(join(dir, ".agents/skills/tdd/extra.md"))).toBe(false);
    expect(existsSync(join(dir, ".agents/skills/to-spec"))).toBe(false);
    expect(
      readFileSync(
        join(dir, ".agents/skills/openspec-propose/SKILL.md"),
        "utf8",
      ),
    ).toBe("$openspec-propose");
    expect(existsSync(join(dir, ".agents/skills/.openspec-target"))).toBe(true);
  });
});
