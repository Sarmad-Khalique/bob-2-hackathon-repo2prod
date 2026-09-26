// Compose wrappers scoped to a Repo2Prod-owned project. No global Docker cleanup.
// Must never import vscode, never run compose without -p, never log env values.

import { join } from 'node:path';
import { fileExists } from '../analyzers/fsUtils.js';
import { formatCommand } from './processRunner.js';
import type { ProcessRunner, CommandOutcome } from './processRunner.js';

// ─── Timeouts ───────────────────────────────────────────────────────────────

/** Centralised timeout budget for every Compose command (milliseconds). */
export const COMPOSE_TIMEOUTS_MS = {
  check:  15_000,   // version query — instant
  build:  600_000,  // cold build ~90 s; leave headroom for slow networks
  up:     120_000,  // up -d — starts containers; app health is verified separately
  ps:     15_000,   // ps -a
  port:   15_000,   // port lookup
  logs:   30_000,   // bounded log tail
  run:    600_000,  // one-off containers can include migrations etc.
  down:   120_000,  // stop + remove
} as const;

// ─── Public context type ─────────────────────────────────────────────────────

/** Everything a Compose command needs to know about the target project. */
export interface ComposeContext {
  runner: ProcessRunner;
  cwd: string;
  projectName: string;
  /** Explicit compose file path; omit to let Docker Compose use its default discovery. */
  composeFile?: string;
  signal?: AbortSignal;
}

// ─── Service status ───────────────────────────────────────────────────────────

/** Parsed row from `docker compose ps -a --format json`. */
export interface ComposeServiceStatus {
  service: string;
  container: string;
  state: string;
  health: string;
  exitCode: number | null;
}

/** Result of `composePs`. */
export interface ComposePsResult extends CommandOutcome {
  services: ComposeServiceStatus[];
}

// ─── Private arg builder ─────────────────────────────────────────────────────

/**
 * Builds the `docker compose` argument list with --ansi, --progress, -p, and optional -f.
 * ALL Compose commands (except checkCompose) must call this — it is the single place -p is set.
 */
function composeArgs(ctx: Pick<ComposeContext, 'projectName' | 'composeFile'>, ...rest: string[]): string[] {
  const base = ['compose', '--ansi', 'never', '--progress', 'plain', '-p', ctx.projectName];
  if (ctx.composeFile) base.push('-f', ctx.composeFile);
  return [...base, ...rest];
}

/** Runs a Compose command and wraps the result in a CommandOutcome. */
async function runComposeT(ctx: ComposeContext, subArgs: string[], timeoutMs: number): Promise<CommandOutcome> {
  const args = composeArgs(ctx, ...subArgs);
  const command = formatCommand('docker', args);
  const run = await ctx.runner({
    cwd: ctx.cwd,
    command: 'docker',
    args,
    timeoutMs,
    signal: ctx.signal,
  });
  return { command, ok: run.exitCode === 0 && !run.spawnError && !run.timedOut && !run.cancelled, run };
}

// ─── Project-name derivation ─────────────────────────────────────────────────

/**
 * Derives a Compose project name from a workspace root path.
 * Must produce exactly the same output as the bash rule in reset-demo-fixture.sh.
 */
export function deriveComposeProjectName(workspaceRoot: string): string {
  // Step 1: last path segment (basename).
  const lastSlash = workspaceRoot.replace(/\/+$/, '').lastIndexOf('/');
  const base = lastSlash >= 0 ? workspaceRoot.slice(lastSlash + 1) : workspaceRoot;

  // Step 2: lowercase.
  const lower = base.toLowerCase();

  // Step 3: replace each character outside [a-z0-9-] with '-'.
  // tr -cs 'a-z0-9-' '-' also squeezes ALL consecutive '-' in the output,
  // including original dashes merged with replacement dashes.
  const replaced = lower.replace(/[^a-z0-9-]/g, '-');
  // Squeeze any run of '-' (originals + replacements) into a single '-'.
  const safe = replaced.replace(/-{2,}/g, '-');

  // Step 4: remove exactly one trailing '-' (${var%-} in bash removes one).
  const trimmed = safe.endsWith('-') ? safe.slice(0, -1) : safe;

  return `repo2prod-${trimmed}`;
}

// ─── Compose file discovery ───────────────────────────────────────────────────

/** Docker Compose's own file-discovery precedence order. */
const COMPOSE_FILE_NAMES = [
  'compose.yaml',
  'compose.yml',
  'docker-compose.yaml',
  'docker-compose.yml',
] as const;

/**
 * Returns the first Compose file found in workspaceRoot, or null if none exist.
 * Returns a `message` describing the search when null, so callers can surface it.
 */
export async function findComposeFile(workspaceRoot: string): Promise<string | null> {
  for (const name of COMPOSE_FILE_NAMES) {
    const candidate = join(workspaceRoot, name);
    if (await fileExists(candidate)) return candidate;
  }
  return null;
}

/** Human-readable error describing where Compose file discovery looked. */
export function noComposeFileMessage(workspaceRoot: string): string {
  return `No Compose file found in ${workspaceRoot} (looked for ${COMPOSE_FILE_NAMES.join(', ')}).`;
}

// ─── Exported commands ────────────────────────────────────────────────────────

/**
 * Checks whether `docker compose` is available. No -p because it touches no project.
 */
export async function checkCompose(runner: ProcessRunner, cwd: string): Promise<CommandOutcome> {
  const args = ['compose', 'version'];
  const command = formatCommand('docker', args);
  const run = await runner({ cwd, command: 'docker', args, timeoutMs: COMPOSE_TIMEOUTS_MS.check });
  return { command, ok: run.exitCode === 0 && !run.spawnError, run };
}

/** Builds all images declared in the Compose file. */
export async function composeBuild(ctx: ComposeContext): Promise<CommandOutcome> {
  return runComposeT(ctx, ['build'], COMPOSE_TIMEOUTS_MS.build);
}

/**
 * Starts the stack in detached mode.
 * Note: exit code 0 here is NOT proof the app runs — `up -d` returns 0 even if
 * a container crashes immediately after start. Use composePs to check states.
 */
export async function composeUp(ctx: ComposeContext): Promise<CommandOutcome> {
  return runComposeT(ctx, ['up', '-d'], COMPOSE_TIMEOUTS_MS.up);
}

// ─── ps parsing ──────────────────────────────────────────────────────────────

/*
 * Compose v2 `ps --format json` produces either:
 *   (a) a JSON array:  [ {...}, {...} ]           — older v2 versions
 *   (b) one JSON object per line (NDJSON):  {...}\n{...}\n  — v5+
 * We handle both shapes.
 */

interface RawPsRow {
  Service?: string;
  Name?: string;
  State?: string;
  Health?: string;
  ExitCode?: number | string;
}

function parsePsRow(row: RawPsRow): ComposeServiceStatus {
  return {
    service:   row.Service  ?? '',
    container: row.Name     ?? '',
    state:     row.State    ?? '',
    health:    row.Health   ?? '',
    exitCode:  row.ExitCode != null ? Number(row.ExitCode) : null,
  };
}

function parsePsOutput(raw: string): ComposeServiceStatus[] | null {
  const text = raw.trim();
  if (!text) return [];

  // Try JSON array first (shape a).
  if (text.startsWith('[')) {
    try {
      const arr = JSON.parse(text) as RawPsRow[];
      return arr.map(parsePsRow);
    } catch { /* fall through to NDJSON */ }
  }

  // Try NDJSON — one object per line (shape b).
  const lines = text.split('\n').filter(l => l.trim());
  try {
    return lines.map(l => parsePsRow(JSON.parse(l) as RawPsRow));
  } catch { return null; }
}

/** Lists all containers in the Compose project, including stopped ones. */
export async function composePs(ctx: ComposeContext): Promise<ComposePsResult> {
  const outcome = await runComposeT(ctx, ['ps', '-a', '--format', 'json'], COMPOSE_TIMEOUTS_MS.ps);

  if (!outcome.ok) {
    return { ...outcome, services: [] };
  }

  const services = parsePsOutput(outcome.run.stdout);
  if (services === null) {
    return {
      command: outcome.command,
      ok: false,
      run: outcome.run,
      services: [],
      // Attach a message via stderr so callers can surface it.
    };
  }
  return { ...outcome, services };
}

// ─── port ─────────────────────────────────────────────────────────────────────

/**
 * Returns the host port number bound to `containerPort` on `service`, or null.
 * Returns null (does not throw) when the container has exited or port is unmapped.
 */
export async function composePort(
  ctx: ComposeContext,
  service: string,
  containerPort: number,
): Promise<{ command: string; hostPort: number | null; run: import('./processRunner.js').ProcessRunResult }> {
  const subArgs = ['port', service, String(containerPort)];
  const args = composeArgs(ctx, ...subArgs);
  const command = formatCommand('docker', args);
  const run = await ctx.runner({
    cwd: ctx.cwd,
    command: 'docker',
    args,
    timeoutMs: COMPOSE_TIMEOUTS_MS.port,
    signal: ctx.signal,
  });

  if (run.exitCode !== 0 || run.spawnError) {
    // Container may have exited; treat as no mapping rather than an error.
    return { command, hostPort: null, run };
  }

  // Output is "0.0.0.0:PORT\n" or ":::PORT\n"
  const match = run.stdout.trim().match(/:(\d+)$/);
  const hostPort = match ? parseInt(match[1], 10) : null;
  return { command, hostPort, run };
}

// ─── logs ─────────────────────────────────────────────────────────────────────

/**
 * Returns bounded log output for `service`.
 * --no-log-prefix strips the "service-1  |" prefix so diagnostics stay clean.
 */
export async function composeLogs(
  ctx: ComposeContext,
  service: string,
  tailLines: number,
): Promise<CommandOutcome> {
  return runComposeT(
    ctx,
    ['logs', '--no-color', '--no-log-prefix', '--tail', String(tailLines), service],
    COMPOSE_TIMEOUTS_MS.logs,
  );
}

// ─── run ──────────────────────────────────────────────────────────────────────

/**
 * Runs a one-off command in a new container and removes it after exit.
 * -T disables pseudo-TTY allocation (no TTY in the VS Code extension host).
 */
export async function composeRun(
  ctx: ComposeContext,
  service: string,
  command: string[],
): Promise<CommandOutcome> {
  return runComposeT(ctx, ['run', '--rm', '-T', service, ...command], COMPOSE_TIMEOUTS_MS.run);
}

// ─── down ─────────────────────────────────────────────────────────────────────

/** Stops and removes containers; optionally removes named volumes too. */
export async function composeDown(
  ctx: ComposeContext,
  opts: { removeVolumes: boolean },
): Promise<CommandOutcome> {
  const extra = opts.removeVolumes ? ['down', '--remove-orphans', '-v'] : ['down', '--remove-orphans'];
  return runComposeT(ctx, extra, COMPOSE_TIMEOUTS_MS.down);
}
