// Runs one external command for a verification step: no shell, an
// allowlisted environment, a wall-time limit and an output cap. The whole
// process group is killed on a limit, so Lake's child Lean processes go too.
import { spawn } from "node:child_process";

export interface CommandRequest {
  argv: readonly string[];
  cwd: string;
  env: Record<string, string>;
  timeoutMs: number;
  maxOutputBytes: number;
}

export interface CommandResult {
  /** Null when the process did not exit on its own. */
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  /** Set when the command did not run to completion. */
  failure?: "timeout" | "output_limit" | "spawn_error";
  failureDetail?: string;
}

export type CommandRunner = (request: CommandRequest) => Promise<CommandResult>;

/** Variables Lean, Lake, elan and git need; everything else is withheld. */
export const ENV_ALLOWLIST = [
  "PATH",
  "HOME",
  "ELAN_HOME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
] as const;

export function allowlistedEnv(
  source: NodeJS.ProcessEnv,
  extra: Record<string, string> = {},
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of ENV_ALLOWLIST) {
    const value = source[key];
    if (value !== undefined) env[key] = value;
  }
  return { ...env, ...extra };
}

export const nodeCommandRunner: CommandRunner = (request) =>
  new Promise((resolve) => {
    const started = performance.now();
    const [command, ...args] = request.argv;
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let bytes = 0;
    let failure: CommandResult["failure"];
    let failureDetail: string | undefined;

    const child = spawn(command ?? "", args, {
      cwd: request.cwd,
      env: request.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      detached: true,
    });
    const stop = (reason: NonNullable<CommandResult["failure"]>) => {
      failure ??= reason;
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    };
    const timer = setTimeout(() => stop("timeout"), request.timeoutMs);
    const collect = (into: Buffer[]) => (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > request.maxOutputBytes) stop("output_limit");
      else into.push(chunk);
    };
    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));
    child.on("error", (error) => {
      failure ??= "spawn_error";
      failureDetail = error.message;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: failure ? null : code,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        durationMs: Math.round(performance.now() - started),
        ...(failure ? { failure } : {}),
        ...(failureDetail ? { failureDetail } : {}),
      });
    });
  });
