// Copies the repo's skills from `.claude/skills` (the source) to `.agents/skills`, the folder
// Codex reads. OpenSpec generates its `openspec-*` skills and `.openspec-target` in each folder
// for its own tool, so those are left alone. The folder's `LICENSE` (the vendored skills'
// notice) is copied too. With `--check`, changes nothing and fails naming each skill, or the
// notice, whose two copies differ.
// Run from the repo root: `node tools/skills-sync/sync-skills.mjs [--check]`.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SOURCE_DIR = ".claude/skills";
export const TARGET_DIR = ".agents/skills";
const NOTICE = "LICENSE";

/** Skill folders in `dir` that the copy owns: everything but OpenSpec's and dotfiles. */
function skillNames(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith(".") && !name.startsWith("openspec-"))
    .sort();
}

/** Paths of the files under `dir`, relative to it, skipping dotfiles such as `.DS_Store`. */
function filesIn(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
    .map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1))
    .sort();
}

function sameFiles(source, target) {
  if (!existsSync(target)) return false;
  const files = filesIn(source);
  const targetFiles = filesIn(target);
  return (
    files.length === targetFiles.length &&
    files.every(
      (path, index) =>
        path === targetFiles[index] &&
        readFileSync(join(source, path)).equals(
          readFileSync(join(target, path)),
        ),
    )
  );
}

/** One message per skill whose `.agents/skills` copy differs from `.claude/skills`; empty when in step. */
export function checkSkills(root) {
  const source = join(root, SOURCE_DIR);
  const target = join(root, TARGET_DIR);
  if (skillNames(source).length === 0) {
    return [`found no skills in ${SOURCE_DIR} to copy`];
  }
  const problems = [];
  const notice = join(source, NOTICE);
  if (!existsSync(notice)) {
    problems.push(
      `${NOTICE}: ${SOURCE_DIR}/${NOTICE} is missing; vendored skills keep their licence notice`,
    );
  } else if (
    !existsSync(join(target, NOTICE)) ||
    !readFileSync(notice).equals(readFileSync(join(target, NOTICE)))
  ) {
    problems.push(
      `${NOTICE}: ${TARGET_DIR}/${NOTICE} differs from ${SOURCE_DIR}/${NOTICE}`,
    );
  }
  for (const name of skillNames(source)) {
    if (!sameFiles(join(source, name), join(target, name))) {
      problems.push(
        `${name}: ${TARGET_DIR}/${name} differs from ${SOURCE_DIR}/${name}`,
      );
    }
  }
  const sourceNames = new Set(skillNames(source));
  for (const name of skillNames(target)) {
    if (!sourceNames.has(name)) {
      problems.push(
        `${name}: ${TARGET_DIR}/${name} has no source in ${SOURCE_DIR}`,
      );
    }
  }
  return problems;
}

/** Makes each skill's `.agents/skills` copy equal to its `.claude/skills` source, and removes copies with no source. */
export function syncSkills(root) {
  const source = join(root, SOURCE_DIR);
  const target = join(root, TARGET_DIR);
  const sourceNames = new Set(skillNames(source));
  for (const name of skillNames(target)) {
    if (!sourceNames.has(name)) rmSync(join(target, name), { recursive: true });
  }
  if (existsSync(join(source, NOTICE))) {
    mkdirSync(target, { recursive: true });
    copyFileSync(join(source, NOTICE), join(target, NOTICE));
  }
  for (const name of sourceNames) {
    rmSync(join(target, name), { recursive: true, force: true });
    for (const path of filesIn(join(source, name))) {
      mkdirSync(dirname(join(target, name, path)), { recursive: true });
      copyFileSync(join(source, name, path), join(target, name, path));
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  if (!process.argv.includes("--check")) syncSkills(root);
  const problems = checkSkills(root);
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    console.error(
      `Edit skills in ${SOURCE_DIR}, then run \`node tools/skills-sync/sync-skills.mjs\` to copy them.`,
    );
    process.exit(1);
  }
  console.log(
    `Skills: ${TARGET_DIR} matches ${SOURCE_DIR} (openspec-* skipped).`,
  );
}
