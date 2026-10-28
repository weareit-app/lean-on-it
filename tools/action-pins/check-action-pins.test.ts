import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { checkActionPins, checkRepo } from "./check-action-pins.mjs";

const SHA = "3d3c42e5aac5ba805825da76410c181273ba90b1";
const OTHER_SHA = "820762786026740c76f36085b0efc47a31fe5020";
const EMBEDDED_SHA = "0123456789abcdef0123456789abcdef01234567";
const UNREVIEWED_SHA = "1111111111111111111111111111111111111111";
const NO_DIST_SHA = "2222222222222222222222222222222222222222";
const WRAPPED_SHA = "3333333333333333333333333333333333333333";
const CODE_BLOCK_SHA = "4444444444444444444444444444444444444444";
const DIGEST = "b".repeat(64);
const UNCHECKED_DIGEST = "c".repeat(64);
const UNRECORDED_DIGEST = "d".repeat(64);

const PINS_PATH = "docs/architecture/ci-actions.md";

const pins = `# CI actions

Prose that mentions \`${OTHER_SHA}\` without pinning it.

## Pins

- \`actions/checkout\` v7.0.1, \`${SHA}\`. Reviewed 2026-10-20: read the source; \`dist/\` was not compared.
- A sha256 that only contains a SHA: \`${EMBEDDED_SHA}0000\`.
- \`actions/setup-node\` v7.0.0, \`${UNREVIEWED_SHA}\`, not yet looked at.
- \`actions/upload-artifact\` v7.0.1, \`${NO_DIST_SHA}\`. Reviewed 2026-10-20: read the source.
- \`pnpm/action-setup\` v6.1.0, \`${WRAPPED_SHA}\`.
  Reviewed 2026-10-20: read the source; \`dist/\` was not compared.

## Images

- \`postgres\` 17.11-alpine, \`sha256:${DIGEST}\`. Checked 2026-10-21 against the registry.
- \`redis\` 8.2.1, \`sha256:${UNCHECKED_DIGEST}\`, not yet looked at.

An indented example after prose:

    ${CODE_BLOCK_SHA} Reviewed 2026-10-20: \`dist/\`
`;

function check(steps: string) {
  return checkActionPins({
    files: [
      {
        path: ".github/workflows/ci.yml",
        text: `jobs:\n  check:\n    steps:\n${steps}`,
      },
    ],
    pins,
  });
}

describe("checkActionPins", () => {
  it("passes on the repo's own workflows and pins", () => {
    const root = fileURLToPath(new URL("../..", import.meta.url));
    expect(checkRepo(root)).toEqual([]);
  });

  it("passes a recorded SHA pin with a version comment", () => {
    expect(check(`      - uses: actions/checkout@${SHA} # v7.0.1\n`)).toEqual(
      [],
    );
  });

  it("exempts local actions", () => {
    expect(check("      - uses: ./.github/actions/setup\n")).toEqual([]);
  });

  it("fails a tag-only pin", () => {
    const problems = check("      - uses: actions/checkout@v7\n");
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(
      /^\.github\/workflows\/ci\.yml:4: "actions\/checkout@v7" isn't pinned/,
    );
  });

  it("fails a SHA pin without a version comment", () => {
    expect(check(`      - uses: actions/checkout@${SHA}\n`)).toHaveLength(1);
  });

  it("fails a short SHA", () => {
    expect(
      check(`      - uses: actions/checkout@3d3c42e # v7.0.1\n`),
    ).toHaveLength(1);
  });

  it("fails a SHA that isn't recorded", () => {
    const unrecorded = "0123456789abcdef0123456789abcdef01234567";
    const problems = check(
      `      - uses: actions/setup-node@${unrecorded} # v7.0.0\n`,
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(`${unrecorded} isn't recorded`);
  });

  it("fails a SHA mentioned only in prose, not in a list item", () => {
    expect(
      check(`      - uses: actions/setup-node@${OTHER_SHA} # v7.0.0\n`),
    ).toHaveLength(1);
  });

  it("checks quoted values and uses without a list dash", () => {
    expect(
      check(`      - name: x\n        uses: "actions/checkout@v7"\n`),
    ).toHaveLength(1);
    expect(
      check(
        `      - name: x\n        uses: "actions/checkout@${SHA}" # v7.0.1\n`,
      ),
    ).toEqual([]);
  });

  it("fails a SHA that appears only inside a longer hex string", () => {
    const problems = check(
      `      - uses: actions/setup-node@${EMBEDDED_SHA} # v7.0.0\n`,
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("isn't recorded");
  });

  it("reads a quoted uses key", () => {
    expect(check(`      - "uses": actions/checkout@v7\n`)).toHaveLength(1);
    expect(check(`      - "uses": actions/checkout@${SHA} # v7.0.1\n`)).toEqual(
      [],
    );
  });

  it("fails flow-style uses it can't read", () => {
    for (const steps of [
      "      - { name: x, uses: actions/checkout@v7 }\n",
      `    steps: [{ uses: "actions/checkout@${SHA}" }]\n`,
    ]) {
      const problems = check(steps);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain("on its own block-style line");
    }
  });

  it("ignores uses: inside run blocks", () => {
    const steps = [
      "      - run: |",
      "          echo start",
      "",
      "          uses: not-an-action",
      "      - name: folded",
      "        run: >-",
      "          uses: also-not-an-action",
      `      - uses: actions/checkout@${SHA} # v7.0.1`,
      "",
    ].join("\n");
    expect(check(steps)).toEqual([]);
  });

  it("still checks a uses after a run block ends", () => {
    const steps =
      "      - run: |\n          echo hi\n      - uses: actions/checkout@v7\n";
    expect(check(steps)).toHaveLength(1);
  });

  it("ignores commented-out uses", () => {
    expect(check("      # - uses: actions/checkout@v7\n")).toEqual([]);
  });

  it("fails a recorded SHA whose entry has no dated review note", () => {
    const problems = check(
      `      - uses: actions/setup-node@${UNREVIEWED_SHA} # v7.0.0\n`,
    );
    expect(problems).toEqual([
      `.github/workflows/ci.yml:4: the entry for ${UNREVIEWED_SHA} in ${PINS_PATH} has no "Reviewed YYYY-MM-DD:" note saying whether dist/ was compared with the source`,
    ]);
  });

  it("fails a review note that doesn't mention dist/", () => {
    expect(
      check(`      - uses: actions/upload-artifact@${NO_DIST_SHA} # v7.0.1\n`),
    ).toHaveLength(1);
  });

  it("reads a review note on the entry's continuation line", () => {
    expect(
      check(`      - uses: pnpm/action-setup@${WRAPPED_SHA} # v6.1.0\n`),
    ).toEqual([]);
  });

  it("doesn't count a SHA in an indented block after prose", () => {
    const problems = check(
      `      - uses: actions/checkout@${CODE_BLOCK_SHA} # v7.0.1\n`,
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("isn't recorded");
  });
});

describe("image pins", () => {
  function checkService(image: string, path = ".github/workflows/ci.yml") {
    return checkActionPins({
      files: [
        {
          path,
          text: `services:\n  postgres:\n    image: ${image}\n`,
        },
      ],
      pins,
    });
  }

  it("passes a recorded image pinned by version tag and digest", () => {
    expect(checkService(`postgres:17.11-alpine@sha256:${DIGEST}`)).toEqual([]);
    expect(checkService(`"postgres:17.11-alpine@sha256:${DIGEST}"`)).toEqual(
      [],
    );
    expect(
      checkService(`postgres:17.11-alpine@sha256:${DIGEST} # pinned`),
    ).toEqual([]);
  });

  it("fails a tag-only image", () => {
    expect(checkService("postgres:17-alpine")).toEqual([
      `.github/workflows/ci.yml:3: image "postgres:17-alpine" isn't pinned as name:<version tag>@sha256:<64-char lowercase digest>`,
    ]);
  });

  it("fails a digest whose tag isn't an exact version", () => {
    expect(checkService(`postgres:17-alpine@sha256:${DIGEST}`)).toHaveLength(1);
    expect(checkService(`postgres@sha256:${DIGEST}`)).toHaveLength(1);
  });

  it("fails a digest that isn't recorded", () => {
    const problems = checkService(
      `postgres:17.11-alpine@sha256:${UNRECORDED_DIGEST}`,
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(`sha256:${UNRECORDED_DIGEST} isn't recorded`);
  });

  it("fails a recorded digest whose entry has no dated check note", () => {
    expect(checkService(`redis:8.2.1@sha256:${UNCHECKED_DIGEST}`)).toEqual([
      `.github/workflows/ci.yml:3: the entry for sha256:${UNCHECKED_DIGEST} in ${PINS_PATH} has no "Checked YYYY-MM-DD" note`,
    ]);
  });

  it("checks a container given as a single image", () => {
    const problems = checkActionPins({
      files: [
        {
          path: ".github/workflows/ci.yml",
          text: "jobs:\n  check:\n    container: node:24\n",
        },
      ],
      pins,
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('image "node:24" isn\'t pinned');
  });

  it("leaves a container mapping to its image key", () => {
    const text = `jobs:\n  check:\n    container:\n      image: postgres:17.11-alpine@sha256:${DIGEST}\n`;
    expect(
      checkActionPins({
        files: [{ path: ".github/workflows/ci.yml", text }],
        pins,
      }),
    ).toEqual([]);
  });

  it("fails a flow-style image it can't read", () => {
    const problems = checkActionPins({
      files: [
        {
          path: ".github/workflows/ci.yml",
          text: `services:\n  postgres: { image: "postgres:17.11-alpine@sha256:${DIGEST}" }\n`,
        },
      ],
      pins,
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("on its own block-style line");
  });

  it("ignores image: inside run blocks and comments", () => {
    const steps = [
      "    steps:",
      "      - run: |",
      "          image: not-an-image",
      "      # image: postgres:17-alpine",
      "",
    ].join("\n");
    expect(
      checkActionPins({
        files: [{ path: ".github/workflows/ci.yml", text: steps }],
        pins,
      }),
    ).toEqual([]);
  });
});

describe("checkRepo", () => {
  let root: string | undefined;
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  function repo(files: Record<string, string>) {
    root = mkdtempSync(join(tmpdir(), "action-pins-"));
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    return root;
  }

  it("checks composite actions under .github/actions", () => {
    const dir = repo({
      [PINS_PATH]: pins,
      ".github/workflows/ci.yml": `    steps:\n      - uses: actions/checkout@${SHA} # v7.0.1\n      - uses: ./.github/actions/setup\n`,
      ".github/actions/setup/action.yml":
        "runs:\n  using: composite\n  steps:\n    - uses: pnpm/action-setup@v6\n",
      ".github/actions/other/action.yaml": `runs:\n  steps:\n    - uses: actions/checkout@${SHA} # v7.0.1\n`,
    });
    expect(checkRepo(dir)).toEqual([
      `.github/actions/setup/action.yml:4: "pnpm/action-setup@v6" isn't pinned as owner/repo@<40-char lowercase SHA> # vX.Y.Z`,
    ]);
  });

  it("checks images in compose.yaml", () => {
    const dir = repo({
      [PINS_PATH]: pins,
      ".github/workflows/ci.yml": `      - uses: actions/checkout@${SHA} # v7.0.1\n`,
      "compose.yaml": "services:\n  postgres:\n    image: postgres:17-alpine\n",
    });
    expect(checkRepo(dir)).toEqual([
      `compose.yaml:3: image "postgres:17-alpine" isn't pinned as name:<version tag>@sha256:<64-char lowercase digest>`,
    ]);
  });

  it("fails when the pins file is missing", () => {
    const dir = repo({
      ".github/workflows/ci.yml": `      - uses: actions/checkout@${SHA} # v7.0.1\n`,
    });
    expect(checkRepo(dir)).toEqual([
      `${PINS_PATH} is missing; it records each action's pin and review`,
    ]);
  });

  it("fails when there are no workflows to check", () => {
    const dir = repo({ [PINS_PATH]: pins });
    expect(checkRepo(dir)).toEqual([
      "found no workflows in .github/workflows to check",
    ]);
  });
});
