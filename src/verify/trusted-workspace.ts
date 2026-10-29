// Which Lean projects lean-on-it may run Lean in. Trusted roots come from the
// operator's start-up configuration, never from a request. Requested paths
// are canonicalized (symlinks resolved) before the containment check, so `..`
// and symlinks cannot escape a root. A trusted workspace is not a sandbox:
// Lean runs its code with the operator's permissions.
import { existsSync, realpathSync, statSync } from "node:fs";
import { delimiter, isAbsolute, join, relative, sep } from "node:path";

/** A request refused before any process starts. */
export class AccessDenied extends Error {
  override name = "AccessDenied";
}

export interface TrustedWorkspace {
  /** Canonical absolute path of the Lake project. */
  root: string;
}

function canonical(path: string, what: string): string {
  try {
    return realpathSync(path);
  } catch {
    throw new AccessDenied(`${what} does not exist: ${path}`);
  }
}

/** Whether `child` is `parent` or lies under it; both should be canonical. */
export function isWithin(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return (
    rel === "" ||
    !(rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel))
  );
}

export function resolveTrustedWorkspace(
  trustedRoots: readonly string[],
  requested: string,
): TrustedWorkspace {
  if (trustedRoots.length === 0)
    throw new AccessDenied("no trusted workspace roots are configured");
  if (!isAbsolute(requested))
    throw new AccessDenied(`workspace path must be absolute: ${requested}`);
  const workspace = canonical(requested, "workspace");
  const roots = trustedRoots.map((r) => {
    try {
      return realpathSync(r);
    } catch {
      // Name no path: a caller must not learn the operator's roots.
      throw new AccessDenied("a configured trusted root does not exist");
    }
  });
  if (!roots.some((r) => isWithin(r, workspace)))
    throw new AccessDenied(
      `workspace is outside the trusted roots: ${requested}`,
    );
  if (!statSync(workspace).isDirectory())
    throw new AccessDenied(`workspace is not a directory: ${requested}`);
  const hasLakefile = ["lakefile.toml", "lakefile.lean"].some((f) =>
    existsSync(join(workspace, f)),
  );
  const hasPins = ["lean-toolchain", "lake-manifest.json"].every((f) =>
    existsSync(join(workspace, f)),
  );
  if (!hasLakefile || !hasPins)
    throw new AccessDenied(
      `workspace is not a Lake project with a lakefile, lean-toolchain and lake-manifest.json: ${requested}`,
    );
  return { root: workspace };
}

const MAX_NAME_LENGTH = 512;
// Lean identifiers without «» quoting: letters, digits, _, ', subscripts,
// and (for declarations) a trailing-style ! or ?.
const SEGMENT = {
  declaration: /^[\p{L}_][\p{L}\p{N}_'!?]*$/u,
  module: /^[\p{L}_][\p{L}\p{N}_']*$/u,
};

/** Returns `name` if it is a plain dotted Lean name, or refuses it. */
export function checkLeanName(
  kind: "declaration" | "module",
  name: string,
): string {
  const ok =
    name.length > 0 &&
    name.length <= MAX_NAME_LENGTH &&
    name.split(".").every((segment) => SEGMENT[kind].test(segment));
  if (!ok)
    throw new AccessDenied(
      `not a plain Lean ${kind} name: ${JSON.stringify(name)}`,
    );
  return name;
}

/** The module's source file, which must resolve inside the workspace. */
export function moduleSourceFile(
  workspace: TrustedWorkspace,
  module: string,
): { absolute: string; relative: string } {
  checkLeanName("module", module);
  const rel = `${join(...module.split("."))}.lean`;
  const path = join(workspace.root, rel);
  if (!existsSync(path))
    throw new AccessDenied(`no source file for module ${module}: ${rel}`);
  const real = realpathSync(path);
  if (!isWithin(workspace.root, real))
    throw new AccessDenied(`module ${module} resolves outside the workspace`);
  return { absolute: real, relative: rel };
}

/** Trusted roots from flags plus LEAN_ON_IT_TRUSTED_ROOTS, set by the operator. */
export function operatorTrustedRoots(
  flags: readonly string[] | undefined,
  env: NodeJS.ProcessEnv,
): string[] {
  return [
    ...(flags ?? []),
    ...(env.LEAN_ON_IT_TRUSTED_ROOTS?.split(delimiter).filter(Boolean) ?? []),
  ];
}
