// Compose wrappers scoped to a Repo2Prod-owned project. No global Docker cleanup.
// Must never import vscode, never run compose without -p, never log env values.

import { join } from 'node:path';
import { fileExists } from '../analyzers/fsUtils.js';
import { formatCommand } from './processRunner.js';
import type { ProcessRunner, CommandOutcome, ProcessRunResult } from './processRunner.js';

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
  /** Container image name/tag as reported by Compose. */
  image: string;
  /** Host↔container port mappings extracted from Publishers or Ports string. */
  publishedPorts: { target: number; published: number }[];
}

/** Result of `composePs`. */
export interface ComposePsResult extends CommandOutcome {
  services: ComposeServiceStatus[];
  /** Null on success; populated when the command failed or output could not be parsed. */
  error: string | null;
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
async function runCompose(ctx: ComposeContext, subArgs: string[], timeoutMs: number): Promise<CommandOutcome> {
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
 * Returns null (not a message) when not found; use noComposeFileMessage for UI text.
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
  return runCompose(ctx, ['build'], COMPOSE_TIMEOUTS_MS.build);
}

/**
 * Starts the stack in detached mode, removing any stale orphan containers.
 * Note: exit code 0 here is NOT proof the app runs — `up -d` returns 0 even if
 * a container crashes immediately after start. Use composePs to check states.
 * --remove-orphans prevents a renamed/removed service from leaving a stale exited
 * container that would confuse ps results during the subsequent health check.
 */
export async function composeUp(ctx: ComposeContext): Promise<CommandOutcome> {
  return runCompose(ctx, ['up', '-d', '--remove-orphans'], COMPOSE_TIMEOUTS_MS.up);
}

// ─── ps parsing ──────────────────────────────────────────────────────────────

/*
 * Compose v2 `ps --format json` produces either:
 *   (a) a JSON array:  [ {...}, {...} ]           — older v2 versions
 *   (b) one JSON object per line (NDJSON):  {...}\n{...}\n  — v5+
 * We handle both shapes.
 *
 * On v5.5.1, published ports are in the Publishers array (not the Ports string).
 * Publishers: [{"URL":"0.0.0.0","TargetPort":8000,"PublishedPort":8000,"Protocol":"tcp"}, ...]
 * We prefer Publishers when present; fall back to parsing the Ports string for older versions.
 */

interface RawPublisher {
  URL?: string;
  TargetPort?: number;
  PublishedPort?: number;
  Protocol?: string;
}

interface RawPsRow {
  Service?: string;
  Name?: string;
  State?: string;
  Health?: string;
  ExitCode?: number | string;
  Image?: string;
  /** v5+ array of port-binding objects. */
  Publishers?: RawPublisher[];
  /** Older versions: "0.0.0.0:8000->8000/tcp, ..." string. */
  Ports?: string;
}

/** Parse published ports from the v5 Publishers array, deduplicating IPv4+IPv6 entries. */
function parsePublishers(publishers: RawPublisher[]): { target: number; published: number }[] {
  const seen = new Set<string>();
  const result: { target: number; published: number }[] = [];
  for (const p of publishers) {
    if (p.TargetPort == null || p.PublishedPort == null || p.PublishedPort === 0) continue;
    const key = `${p.TargetPort}:${p.PublishedPort}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ target: p.TargetPort, published: p.PublishedPort });
    }
  }
  return result;
}

/** Parse published ports from the legacy Ports string ("0.0.0.0:8000->8000/tcp"). */
function parsePortsString(ports: string): { target: number; published: number }[] {
  const seen = new Set<string>();
  const result: { target: number; published: number }[] = [];
  // Each mapping: "HOST_IP:HOST_PORT->CONTAINER_PORT/proto"
  for (const segment of ports.split(',')) {
    const m = segment.trim().match(/:(\d+)->(\d+)/);
    if (!m) continue;
    const published = parseInt(m[1], 10);
    const target = parseInt(m[2], 10);
    if (!published || !target) continue;
    const key = `${target}:${published}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ target, published });
    }
  }
  return result;
}

function parsePsRow(row: RawPsRow): ComposeServiceStatus {
  let publishedPorts: { target: number; published: number }[];
  if (Array.isArray(row.Publishers) && row.Publishers.length > 0) {
    publishedPorts = parsePublishers(row.Publishers);
  } else if (row.Ports) {
    publishedPorts = parsePortsString(row.Ports);
  } else {
    publishedPorts = [];
  }
  return {
    service:       row.Service  ?? '',
    container:     row.Name     ?? '',
    state:         row.State    ?? '',
    health:        row.Health   ?? '',
    exitCode:      row.ExitCode != null ? Number(row.ExitCode) : null,
    image:         row.Image    ?? '',
    publishedPorts,
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
  const outcome = await runCompose(ctx, ['ps', '-a', '--format', 'json'], COMPOSE_TIMEOUTS_MS.ps);

  if (!outcome.ok) {
    const reason = outcome.run.stderr.trim() || outcome.run.spawnError || 'non-zero exit';
    return { ...outcome, services: [], error: `docker compose ps failed: ${reason}` };
  }

  const services = parsePsOutput(outcome.run.stdout);
  if (services === null) {
    return {
      command: outcome.command,
      ok: false,
      run: outcome.run,
      services: [],
      error: 'Could not parse `docker compose ps` output.',
    };
  }
  return { ...outcome, services, error: null };
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
): Promise<{ command: string; hostPort: number | null; run: ProcessRunResult }> {
  const subArgs = ['port', service, String(containerPort)];
  const outcome = await runCompose(ctx, subArgs, COMPOSE_TIMEOUTS_MS.port);

  if (!outcome.ok) {
    // Container may have exited; treat as no mapping rather than an error.
    return { command: outcome.command, hostPort: null, run: outcome.run };
  }

  // Output is "0.0.0.0:PORT\n" or ":::PORT\n"
  const match = outcome.run.stdout.trim().match(/:(\d+)$/);
  const hostPort = match ? parseInt(match[1], 10) : null;
  // Port 0 means the OS chose an ephemeral port at bind time but the container has exited.
  return { command: outcome.command, hostPort: hostPort === 0 ? null : hostPort, run: outcome.run };
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
  return runCompose(
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
  return runCompose(ctx, ['run', '--rm', '-T', service, ...command], COMPOSE_TIMEOUTS_MS.run);
}

// ─── down ─────────────────────────────────────────────────────────────────────

/** Stops and removes containers; optionally removes named volumes too. */
export async function composeDown(
  ctx: ComposeContext,
  opts: { removeVolumes: boolean },
): Promise<CommandOutcome> {
  const extra = opts.removeVolumes ? ['down', '--remove-orphans', '-v'] : ['down', '--remove-orphans'];
  return runCompose(ctx, extra, COMPOSE_TIMEOUTS_MS.down);
}
