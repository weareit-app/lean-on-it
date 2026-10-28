// Fails when a `docs/adr/` folder exists. Decision records live in one file,
// docs/architecture/decisions.md, but some vendored skills write ADRs to `docs/adr/`.
// Run from the repo root: `node tools/decision-records/check-no-adr-folder.mjs`.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ADR_DIR = "docs/adr";
const DECISIONS_PATH = "docs/architecture/decisions.md";

/** One message per problem in the checkout at `root`; empty when there is no `docs/adr/`. */
export function checkRepo(root) {
  if (!existsSync(join(root, ADR_DIR))) return [];
  return [
    `${ADR_DIR}/ exists; record decisions in ${DECISIONS_PATH} instead (edit the topic's entry and add a dated change-log line), then delete ${ADR_DIR}/`,
  ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = checkRepo(process.cwd());
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log(`Decision records: no ${ADR_DIR}/ folder.`);
}
