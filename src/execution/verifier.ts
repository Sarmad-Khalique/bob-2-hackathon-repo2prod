// Verification engine: image build, infra readiness, app stability, health, tests.
// Must never import vscode, never write files, never clean up containers, never log env values.

import { join } from 'node:path';
import { readTextIfExists } from '../analyzers/fsUtils.js';
import type { RuntimeManifest, VerificationResult, CheckResult } from '../core/types.js';
import type { ProcessRunner } from './processRunner.js';
import {
  deriveComposeProjectName,
  findComposeFile,
  noComposeFileMessage,
  checkCompose,
  composeBuild,
  composeUp,
  composePs,
  composePort,
  composeLogs,
  composeRun,
  type ComposeContext,
  type ComposeServiceStatus,
} from './compose.js';
import { checkDocker } from './docker.js';

// ─── Public constants and types ───────────────────────────────────────────────

/** The four named phases, reported to the orchestrator layer via onPhase. */
export type ExecutionPhase = 'BUILDING' | 'STARTING' | 'VERIFYING_HEALTH' | 'RUNNING_TESTS';

/** Fixed ordered check identifiers; every run returns exactly these 7, in this order. */
export const CHECK_IDS = ['docker', 'compose', 'build', 'database', 'app', 'health', 'tests'] as const;
export type CheckId = typeof CHECK_IDS[number];

/** Timeout budgets (milliseconds) for the verification loop. */
export const VERIFY_TIMEOUTS_MS = {
  dbReady:       60_000,   // wait for all infra services to be healthy/running
  appStable:      5_000,   // app must stay running for this long after `up`
  health:        45_000,   // whole health-polling window (includes migrate + boot time)
  healthRequest:  3_000,   // per HTTP request timeout
  pollInterval:   1_000,   // interval between ps/health polls
} as const;

/** A health endpoint path and whether it came from a declared file or a conventional guess. */
export interface HealthTarget {
  path: string;
  source: 'declared' | 'conventional';
}

/** All inputs the verifier needs; built from the manifest by buildVerifyOptions. */
export interface VerifyOptions {
  workspaceRoot: string;
  projectName: string;
  appService: string;
  infraServices: { id: string; name: string }[];
  appContainerPort: number | null;
  healthTargets: HealthTarget[];
  testCommand: string[] | null;
}

/** Failure detail attached to VerificationOutcome when a check fails. */
export interface VerificationOutcome {
  result: VerificationResult;
  failedPhase: ExecutionPhase | null;
  cancelled: boolean;
  failure: {
    checkId: CheckId;
    command: string | null;
    exitCode: number | null;
    exitCodeSource: 'command' | 'container' | null;
    failedService: string | null;
    /** Bounded (≤200 lines), NOT redacted — C4 redacts before persisting. */
    rawOutputTail: string;
    truncated: boolean;
  } | null;
}

// ─── Private constants ────────────────────────────────────────────────────────

/** Conventional health paths tried in order when no declared endpoint exists. */
const CONVENTIONAL_HEALTH_PATHS: string[] = ['/health/', '/healthz'];

/** Stack-specific defaults; testCommand is null when no test runner is known. */
const STACK_DEFAULTS: Record<string, { testCommand: string[] }> = {
  django: { testCommand: ['python', 'manage.py', 'test', '--noinput'] },
  // --noinput prevents an interactive prompt when a leftover test db exists (no TTY).
};

// ─── Health endpoint file ─────────────────────────────────────────────────────

interface HealthEndpointFile {
  path: string;
  method: string;
  expectStatus: number;
}

/** Reads .repo2prod/health-endpoint.json; returns null if missing, invalid JSON, or fails validation. */
async function readDeclaredHealthEndpoint(workspaceRoot: string): Promise<HealthEndpointFile | null> {
  const filePath = join(workspaceRoot, '.repo2prod', 'health-endpoint.json');
  const raw = await readTextIfExists(filePath);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof parsed !== 'object' || parsed === null ||
      typeof parsed.path !== 'string' ||
      !parsed.path.startsWith('/') ||
      parsed.method !== 'GET' ||
      parsed.expectStatus !== 200
    ) {
      return null;
    }
    return parsed as unknown as HealthEndpointFile;
  } catch {
    // Malformed JSON is silently ignored; verifier falls back to conventional paths.
    return null;
  }
}

// ─── Public: buildVerifyOptions ───────────────────────────────────────────────

/** Derives all verification parameters from the manifest plus the workspace root. */
export async function buildVerifyOptions(
  workspaceRoot: string,
  manifest: RuntimeManifest,
): Promise<VerifyOptions> {
  const projectName = deriveComposeProjectName(workspaceRoot);

  const appService = 'app';
  const infraServices = manifest.services
    .filter(s => s.id !== appService)
    .map(s => ({ id: s.id, name: s.name }));

  const appManifestService = manifest.services.find(s => s.id === appService);
  const appContainerPort = appManifestService?.ports[0] ?? null;

  // Build health target list: declared (if valid) first, then conventional paths.
  const declared = await readDeclaredHealthEndpoint(workspaceRoot);
  const healthTargets: HealthTarget[] = [];
  if (declared) {
    healthTargets.push({ path: declared.path, source: 'declared' });
  }
  for (const p of CONVENTIONAL_HEALTH_PATHS) {
    // Skip if this path is already covered by the declared endpoint.
    if (declared && declared.path === p) continue;
    healthTargets.push({ path: p, source: 'conventional' });
  }

  const framework = manifest.stack.framework?.toLowerCase() ?? null;
  const defaults = framework ? STACK_DEFAULTS[framework] : undefined;
  const testCommand = defaults?.testCommand ?? null;

  return { workspaceRoot, projectName, appService, infraServices, appContainerPort, healthTargets, testCommand };
}

// ─── Private: result builders ─────────────────────────────────────────────────

function makeCheck(id: CheckId, status: CheckResult['status'], observed: boolean, detail: string | null): CheckResult {
  return { id, status, observed, detail };
}

function makeNotRun(id: CheckId, detail: string): CheckResult {
  return makeCheck(id, 'NOT_RUN', false, detail);
}

/** Marks all remaining check IDs NOT_RUN with the given detail (skip or cancel). */
function markRemaining(ids: readonly CheckId[], detail: string): CheckResult[] {
  return ids.map(id => makeNotRun(id, detail));
}

// ─── Private: bounded tail helper ─────────────────────────────────────────────

/** Returns at most `maxLines` lines from the tail of `text`, joined by newlines. */
function tailLines(text: string, maxLines: number): string {
  const lines = text.trim().split('\n');
  return lines.slice(-maxLines).join('\n');
}

// ─── Private: ps helpers ─────────────────────────────────────────────────────

/** Finds an app row: exact service name match. */
function findAppRow(services: ComposeServiceStatus[], name: string): ComposeServiceStatus | undefined {
  return services.find(s => s.service === name);
}

/** Finds an infra row: exact id match first, then image-contains-name fallback. */
function findInfraRow(services: ComposeServiceStatus[], id: string, name: string): ComposeServiceStatus | undefined {
  return services.find(s => s.service === id)
    ?? services.find(s => s.image.toLowerCase().includes(name.toLowerCase()));
}

/** "restarting" is a crash: Compose is cycling a failing container (e.g. restart: unless-stopped). */
function isAppCrashState(state: string): 'restarting' | 'exited' | null {
  const s = state.toLowerCase();
  if (s.includes('restarting')) return 'restarting';
  if (s.includes('exit') || s === 'dead') return 'exited';
  return null;
}

/** Returns true when a container is fully ready (running + healthy, or running + no healthcheck). */
function isReadyOk(row: ComposeServiceStatus): boolean {
  const state = row.state.toLowerCase();
  const health = row.health.toLowerCase();
  if (!state.includes('running')) return false;
  if (health === 'unhealthy') return false;
  // '' means no healthcheck; 'healthy' means check passed; 'starting' means still checking.
  return health === '' || health === 'healthy';
}

// ─── Public: runVerification ──────────────────────────────────────────────────

/**
 * Runs the full verification sequence and returns an outcome with per-check results.
 * Leaves containers running for inspection; cleanup is the caller's responsibility.
 */
export async function runVerification(
  options: VerifyOptions,
  runner: ProcessRunner,
  onPhase: (phase: ExecutionPhase) => void,
  signal?: AbortSignal,
): Promise<VerificationOutcome> {
  const { workspaceRoot, projectName, appService, infraServices, appContainerPort, healthTargets, testCommand } = options;

  const ctx: ComposeContext = { runner, cwd: workspaceRoot, projectName, signal };

  // Mutable check list built up as we go.
  const checks: CheckResult[] = [];

  // Helper: record a failing check and mark all remaining NOT_RUN.
  // Set pushCheck=false when the failedCheck was already pushed to `checks`.
  function fail(
    failedCheck: CheckResult,
    failedPhase: ExecutionPhase,
    remaining: readonly CheckId[],
    failure: VerificationOutcome['failure'],
    pushCheck = true,
  ): VerificationOutcome {
    if (pushCheck) checks.push(failedCheck);
    checks.push(...markRemaining(remaining, 'Skipped: earlier check failed'));
    return { result: { checks }, failedPhase, cancelled: false, failure };
  }

  // Helper: cancel path — fill remaining with "Cancelled".
  function cancel(remaining: readonly CheckId[]): VerificationOutcome {
    checks.push(...markRemaining(remaining, 'Cancelled'));
    return { result: { checks }, failedPhase: null, cancelled: true, failure: null };
  }

  // Helper: check signal at any await boundary.
  function isCancelled(): boolean {
    return signal?.aborted === true;
  }

  // ── Phase: BUILDING ────────────────────────────────────────────────────────

  onPhase('BUILDING');

  // docker
  const dockerResult = await checkDocker(runner, workspaceRoot);
  if (isCancelled()) return cancel(['docker', 'compose', 'build', 'database', 'app', 'health', 'tests']);
  if (!dockerResult.ok) {
    return fail(
      makeCheck('docker', 'FAIL', true, dockerResult.message),
      'BUILDING',
      ['compose', 'build', 'database', 'app', 'health', 'tests'],
      {
        checkId: 'docker', command: dockerResult.command, exitCode: dockerResult.run.exitCode,
        exitCodeSource: 'command', failedService: null,
        rawOutputTail: tailLines(dockerResult.run.stderr || dockerResult.run.stdout, 200),
        truncated: dockerResult.run.stderrTruncated || dockerResult.run.stdoutTruncated,
      },
    );
  }
  checks.push(makeCheck('docker', 'PASS', true, dockerResult.message));

  // compose
  const composeResult = await checkCompose(runner, workspaceRoot);
  const composeFile = await findComposeFile(workspaceRoot);
  if (isCancelled()) return cancel(['compose', 'build', 'database', 'app', 'health', 'tests']);
  if (!composeResult.ok || composeFile === null) {
    const detail = !composeResult.ok
      ? 'docker compose is not available'
      : noComposeFileMessage(workspaceRoot);
    return fail(
      makeCheck('compose', 'FAIL', true, detail),
      'BUILDING',
      ['build', 'database', 'app', 'health', 'tests'],
      {
        checkId: 'compose', command: composeResult.command, exitCode: composeResult.run.exitCode,
        exitCodeSource: 'command', failedService: null,
        rawOutputTail: tailLines(composeResult.run.stderr || composeResult.run.stdout, 200),
        truncated: composeResult.run.stderrTruncated || composeResult.run.stdoutTruncated,
      },
    );
  }
  checks.push(makeCheck('compose', 'PASS', true, null));

  // build
  const t0Build = Date.now();
  const buildResult = await composeBuild(ctx);
  if (isCancelled()) return cancel(['build', 'database', 'app', 'health', 'tests']);
  if (!buildResult.ok) {
    const output = buildResult.run.stderr + buildResult.run.stdout;
    return fail(
      makeCheck('build', 'FAIL', true, 'Image build failed'),
      'BUILDING',
      ['database', 'app', 'health', 'tests'],
      {
        checkId: 'build', command: buildResult.command, exitCode: buildResult.run.exitCode,
        exitCodeSource: 'command', failedService: null,
        rawOutputTail: tailLines(output, 200),
        truncated: buildResult.run.stderrTruncated || buildResult.run.stdoutTruncated,
      },
    );
  }
  const buildSecs = ((Date.now() - t0Build) / 1000).toFixed(1);
  checks.push(makeCheck('build', 'PASS', true, `built in ${buildSecs}s`));

  // ── Phase: STARTING ────────────────────────────────────────────────────────

  onPhase('STARTING');

  const upResult = await composeUp(ctx);
  if (isCancelled()) return cancel(['database', 'app', 'health', 'tests']);

  // ── database ───────────────────────────────────────────────────────────────

  if (infraServices.length === 0) {
    // No infra declared in manifest — normal for SQLite-only apps.
    checks.push(makeCheck('database', 'NOT_RUN', false, 'No infrastructure service in manifest'));
  } else {
    // Poll ps until every infra service is ready, or we time out / fail.
    const dbDeadline = Date.now() + VERIFY_TIMEOUTS_MS.dbReady;
    let dbCheck: CheckResult | null = null;
    let dbFailure: VerificationOutcome['failure'] | null = null;
    let lastDbPsError: string | null = null;
    let lastDbServices: ComposeServiceStatus[] = [];
    let dbHadSuccessfulPs = false;

    while (Date.now() < dbDeadline) {
      if (isCancelled()) return cancel(['database', 'app', 'health', 'tests']);
      const psResult = await composePs(ctx);
      if (isCancelled()) return cancel(['database', 'app', 'health', 'tests']);

      if (!psResult.ok) {
        lastDbPsError = psResult.error;
        await new Promise<void>(r => setTimeout(r, VERIFY_TIMEOUTS_MS.pollInterval));
        continue;
      }
      dbHadSuccessfulPs = true;
      lastDbServices = psResult.services;

      let allReady = true;
      let firstFail: { svc: typeof infraServices[0]; row: ComposeServiceStatus | undefined } | null = null;

      for (const svc of infraServices) {
        const row = findInfraRow(psResult.services, svc.id, svc.name);
        if (!row) {
          allReady = false;
          firstFail = { svc, row: undefined };
          break;
        }
        const state = row.state.toLowerCase();
        const health = row.health.toLowerCase();
        // Container has exited or healthcheck failed — terminal.
        if (state.includes('exit') || state === 'dead' || health === 'unhealthy') {
          allReady = false;
          firstFail = { svc, row };
          break;
        }
        // Still starting up (state 'starting', health 'starting').
        if (!isReadyOk(row)) {
          allReady = false;
          break;
        }
      }

      if (allReady) {
        // Summarise using the first infra service.
        const svc = infraServices[0];
        const row = findInfraRow(psResult.services, svc.id, svc.name)!;
        const statusWord = row.health === 'healthy' ? 'healthy' : 'running';
        dbCheck = makeCheck('database', 'PASS', true, `${svc.name} (${svc.id}) ${statusWord}`);
        break;
      }

      if (firstFail) {
        // Terminal failure: container exited or missing.
        const { svc, row } = firstFail;
        const logsResult = await composeLogs(ctx, row?.service ?? svc.id, 120);
        const logText = logsResult.ok ? logsResult.run.stdout : '';
        // Only an exited/dead container has a real exit code; an unhealthy one is still running.
        const state = row?.state.toLowerCase() ?? '';
        const exited = row !== undefined && (state.includes('exit') || state === 'dead');
        const exitCode = exited ? row.exitCode : null;
        if (row === undefined) {
          dbCheck = makeCheck('database', 'FAIL', true, `Manifest expects ${svc.name}; Compose has none`);
        } else if (exited) {
          const exitInfo = exitCode !== null ? ` (code ${exitCode})` : '';
          dbCheck = makeCheck('database', 'FAIL', true, `${svc.name} (${svc.id}) ${state}${exitInfo}`);
        } else {
          dbCheck = makeCheck('database', 'FAIL', true, `${svc.name} (${svc.id}) unhealthy`);
        }
        dbFailure = {
          checkId: 'database',
          command: null,
          exitCode,
          exitCodeSource: exitCode !== null ? 'container' : null,
          failedService: row?.service ?? svc.id,
          rawOutputTail: tailLines(logText, 120),
          truncated: logsResult.run?.stdoutTruncated ?? false,
        };
        break;
      }

      await new Promise<void>(r => setTimeout(r, VERIFY_TIMEOUTS_MS.pollInterval));
    }

    if (dbCheck === null) {
      if (!dbHadSuccessfulPs) {
        dbCheck = makeCheck('database', 'FAIL', true, 'Could not read container status');
        dbFailure = {
          checkId: 'database', command: null, exitCode: null, exitCodeSource: null,
          failedService: infraServices[0].id,
          rawOutputTail: lastDbPsError ?? '',
          truncated: false,
        };
      } else {
        // Timed out waiting for infra.
        const svc = infraServices[0];
        const row = findInfraRow(lastDbServices, svc.id, svc.name);
        const logsResult = await composeLogs(ctx, row?.service ?? svc.id, 120);
        const logText = logsResult.ok ? logsResult.run.stdout : '';
        dbCheck = makeCheck('database', 'FAIL', true, `${svc.name} (${svc.id}) not ready after ${VERIFY_TIMEOUTS_MS.dbReady / 1000}s`);
        dbFailure = {
          checkId: 'database', command: null, exitCode: null, exitCodeSource: null,
          failedService: row?.service ?? svc.id,
          rawOutputTail: tailLines(logText, 120),
          truncated: logsResult.run?.stdoutTruncated ?? false,
        };
      }
    }

    checks.push(dbCheck);
    if (dbCheck.status === 'FAIL') {
      // dbCheck already pushed above — don't push again.
      return fail(dbCheck, 'STARTING', ['app', 'health', 'tests'], dbFailure, false);
    }
  }

  // ── app (only if database didn't fail) ────────────────────────────────────

  if (isCancelled()) return cancel(['app', 'health', 'tests']);

  // composeUp failed — treat as app failure (up -d exit 0 is not evidence; non-zero is.)
  if (!upResult.ok) {
    const output = upResult.run.stderr + upResult.run.stdout;
    return fail(
      makeCheck('app', 'FAIL', true, 'docker compose up failed'),
      'STARTING',
      ['health', 'tests'],
      {
        checkId: 'app', command: upResult.command, exitCode: upResult.run.exitCode,
        exitCodeSource: 'command', failedService: null,
        rawOutputTail: tailLines(output, 200),
        truncated: upResult.run.stderrTruncated || upResult.run.stdoutTruncated,
      },
    );
  }

  // Poll ps for appStable — app must stay running the whole time.
  const appDeadline = Date.now() + VERIFY_TIMEOUTS_MS.appStable;
  let appCheck: CheckResult | null = null;
  let appFailure: VerificationOutcome['failure'] | null = null;
  let lastAppPsError: string | null = null;
  let appHadSuccessfulPs = false;

  while (Date.now() < appDeadline) {
    if (isCancelled()) return cancel(['app', 'health', 'tests']);
    const psResult = await composePs(ctx);
    if (isCancelled()) return cancel(['app', 'health', 'tests']);

    if (!psResult.ok) {
      lastAppPsError = psResult.error;
      await new Promise<void>(r => setTimeout(r, VERIFY_TIMEOUTS_MS.pollInterval));
      continue;
    }
    appHadSuccessfulPs = true;

    const appRow = findAppRow(psResult.services, appService);
    if (!appRow) {
      // V10: exitCode null → exitCodeSource must also be null.
      appCheck = makeCheck('app', 'FAIL', true, `Compose has no '${appService}' service`);
      appFailure = {
        checkId: 'app', command: upResult.command, exitCode: null, exitCodeSource: null,
        failedService: appService, rawOutputTail: '', truncated: false,
      };
      break;
    }

    const crash = isAppCrashState(appRow.state);
    if (crash) {
      const logsResult = await composeLogs(ctx, appService, 120);
      const logText = logsResult.ok ? logsResult.run.stdout : '';
      // V9: restarting containers report ExitCode 0 in `ps`; that 0 is false evidence.
      // The real exit code is unknown — report null so Bob is not misled.
      const detail = crash === 'restarting'
        ? 'app is restart-looping (it keeps crashing)'
        : `app exited with code ${appRow.exitCode ?? '?'} during startup`;
      appCheck = makeCheck('app', 'FAIL', true, detail);
      appFailure = {
        checkId: 'app',
        command: upResult.command,
        exitCode: crash === 'restarting' ? null : appRow.exitCode,
        exitCodeSource: crash === 'restarting' ? null : 'container',
        // V10: use the matched row's service name as failedService.
        failedService: appRow.service,
        rawOutputTail: tailLines(logText, 120),
        truncated: logsResult.run?.stdoutTruncated ?? false,
      };
      break;
    }

    await new Promise<void>(r => setTimeout(r, VERIFY_TIMEOUTS_MS.pollInterval));
  }

  if (appCheck === null) {
    if (!appHadSuccessfulPs) {
      // V10: exitCode null → exitCodeSource must also be null.
      appCheck = makeCheck('app', 'FAIL', true, 'Could not read container status');
      appFailure = {
        checkId: 'app', command: upResult.command, exitCode: null, exitCodeSource: null,
        failedService: appService, rawOutputTail: lastAppPsError ?? '', truncated: false,
      };
    } else {
      appCheck = makeCheck('app', 'PASS', true, 'running');
    }
  }

  checks.push(appCheck);
  if (appCheck.status === 'FAIL') {
    // appCheck already pushed above — don't push again.
    return fail(appCheck, 'STARTING', ['health', 'tests'], appFailure, false);
  }

  // ── Phase: VERIFYING_HEALTH ────────────────────────────────────────────────

  onPhase('VERIFYING_HEALTH');
  if (isCancelled()) return cancel(['health', 'tests']);

  // Determine the host port to probe.
  let hostPort: number | null = null;
  let psFallbackError: string | null = null;
  if (appContainerPort !== null) {
    const portResult = await composePort(ctx, appService, appContainerPort);
    hostPort = portResult.hostPort;
  }
  if (hostPort === null) {
    // Fall back to first publishedPort from the latest ps row.
    const psFallback = await composePs(ctx);
    if (!psFallback.ok) {
      psFallbackError = psFallback.error;
    } else {
      const appRow = findAppRow(psFallback.services, appService);
      hostPort = appRow?.publishedPorts[0]?.published ?? null;
    }
  }
  if (isCancelled()) return cancel(['health', 'tests']);

  if (hostPort === null) {
    return fail(
      makeCheck('health', 'FAIL', true, 'App publishes no port; cannot probe health'),
      'VERIFYING_HEALTH',
      ['tests'],
      { checkId: 'health', command: null, exitCode: null, exitCodeSource: null, failedService: appService, rawOutputTail: psFallbackError ?? '', truncated: false },
    );
  }

  // Health polling loop.
  const healthDeadline = Date.now() + VERIFY_TIMEOUTS_MS.health;
  let healthCheck: CheckResult | null = null;
  let healthFailure: VerificationOutcome['failure'] | null = null;

  // Last observed HTTP status per path (connection errors are not recorded).
  const lastStatusByPath = new Map<string, number>();
  let lastStatusPath: string | null = null;
  let lastStatus = 0;
  let lastBodySnippet = '';

  healthLoop:
  while (Date.now() < healthDeadline) {
    if (isCancelled()) return cancel(['health', 'tests']);

    // Re-check ps before each request; skip this iteration's re-check if ps failed.
    const midPs = await composePs(ctx);
    if (isCancelled()) return cancel(['health', 'tests']);
    if (midPs.ok) {
      const midRow = findAppRow(midPs.services, appService);
      const crash = midRow ? isAppCrashState(midRow.state) : null;
      if (midRow && crash) {
        const logsResult = await composeLogs(ctx, appService, 120);
        const logText = logsResult.ok ? logsResult.run.stdout : '';
        // V9: restarting containers report ExitCode 0; that is false evidence.
        const detail = crash === 'restarting'
          ? 'app is restart-looping (it keeps crashing)'
          : `app exited with code ${midRow.exitCode ?? '?'} while waiting for health`;
        healthCheck = makeCheck('health', 'FAIL', true, detail);
        healthFailure = {
          checkId: 'health', command: `GET http://127.0.0.1:${hostPort}${healthTargets[0]?.path ?? '/'}`,
          exitCode: crash === 'restarting' ? null : midRow.exitCode,
          exitCodeSource: crash === 'restarting' ? null : 'container',
          // V10: use the matched row's service name as failedService.
          failedService: midRow.service,
          rawOutputTail: tailLines(logText, 120),
          truncated: logsResult.run?.stdoutTruncated ?? false,
        };
        break healthLoop;
      }
    }

    for (const target of healthTargets) {
      if (isCancelled()) return cancel(['health', 'tests']);
      const url = `http://127.0.0.1:${hostPort}${target.path}`;
      let status = 0;
      let bodySnippet = '';

      try {
        const fetchSignal = AbortSignal.any([
          AbortSignal.timeout(VERIFY_TIMEOUTS_MS.healthRequest),
          ...(signal ? [signal] : []),
        ]);
        const resp = await fetch(url, { signal: fetchSignal });
        status = resp.status;
        lastStatus = status;
        lastStatusByPath.set(target.path, status);
        lastStatusPath = target.path;
        // Read up to 500 chars of body for failure context (don't stream large responses).
        const bodyText = await resp.text().catch(() => '');
        bodySnippet = bodyText.slice(0, 500);
        lastBodySnippet = bodySnippet;
      } catch {
        if (signal?.aborted) return cancel(['health', 'tests']);
        // Timeout / connection error / unknown: retry within the window.
        continue;
      }

      if (status === 200) {
        const sourceLabel = target.source === 'declared' ? '(declared)' : '(conventional path)';
        healthCheck = makeCheck('health', 'PASS', true, `GET ${target.path} -> 200 ${sourceLabel}`);
        break healthLoop;
      }

      // 503: app may still be booting (migrate/startup); retry declared and conventional.
      if (status === 503) {
        break;
      }

      if (status === 404 && target.source === 'conventional') {
        continue;
      }

      // 404 declared, other 4xx, other 5xx: decisive.
      healthCheck = makeCheck('health', 'FAIL', true, `GET ${target.path} -> HTTP ${status}`);
      break;
    }

    if (healthCheck !== null) break healthLoop;

    // Smoke-probe "/" only when every conventional path's last status was 404 (not conn-error/503).
    const conventionalTargets = healthTargets.filter(t => t.source === 'conventional');
    if (
      healthTargets.every(t => t.source !== 'declared') &&
      conventionalTargets.length > 0 &&
      conventionalTargets.every(t => lastStatusByPath.get(t.path) === 404)
    ) {
      const rootUrl = `http://127.0.0.1:${hostPort}/`;
      try {
        const fetchSignal = AbortSignal.any([
          AbortSignal.timeout(VERIFY_TIMEOUTS_MS.healthRequest),
          ...(signal ? [signal] : []),
        ]);
        const resp = await fetch(rootUrl, { signal: fetchSignal });
        lastStatus = resp.status;
        lastStatusByPath.set('/', lastStatus);
        lastStatusPath = '/';
        lastBodySnippet = (await resp.text().catch(() => '')).slice(0, 500);
        if (lastStatus < 500) {
          // Server responds with some non-error status — WARN (no dedicated health path).
          healthCheck = makeCheck('health', 'WARN', true, `Server responds (HTTP ${lastStatus}); no health endpoint`);
        } else {
          healthCheck = makeCheck('health', 'FAIL', true, `GET / -> HTTP ${lastStatus}`);
        }
      } catch {
        if (signal?.aborted) return cancel(['health', 'tests']);
        // Connection refused or timeout — server is still not up; keep retrying.
      }
      if (healthCheck !== null) break healthLoop;
    }

    await new Promise<void>(r => setTimeout(r, VERIFY_TIMEOUTS_MS.pollInterval));
  }

  if (healthCheck === null) {
    if (lastStatusPath !== null) {
      const st = lastStatusByPath.get(lastStatusPath) ?? lastStatus;
      healthCheck = makeCheck('health', 'FAIL', true, `GET ${lastStatusPath} -> HTTP ${st} for ${VERIFY_TIMEOUTS_MS.health / 1000}s`);
    } else {
      healthCheck = makeCheck('health', 'FAIL', true, `No HTTP response on port ${hostPort} within ${VERIFY_TIMEOUTS_MS.health / 1000}s`);
    }
    const logsResult = await composeLogs(ctx, appService, 120);
    const logText = logsResult.ok ? logsResult.run.stdout : '';
    const rawOutputTail = `Last status: ${lastStatus || 'none'}\nBody: ${lastBodySnippet}\n${tailLines(logText, 120)}`;
    healthFailure = {
      checkId: 'health',
      command: `GET http://127.0.0.1:${hostPort}${healthTargets[0]?.path ?? '/'}`,
      exitCode: null, exitCodeSource: null, failedService: appService,
      rawOutputTail: tailLines(rawOutputTail, 200),
      truncated: logsResult.run?.stdoutTruncated ?? false,
    };
  } else if (healthCheck.status === 'FAIL' && healthFailure === null) {
    // Build failure detail from last HTTP status + app logs.
    const logsResult = await composeLogs(ctx, appService, 120);
    const logText = logsResult.ok ? logsResult.run.stdout : '';
    const rawOutputTail = `Last status: ${lastStatus}\nBody: ${lastBodySnippet}\n${tailLines(logText, 120)}`;
    healthFailure = {
      checkId: 'health',
      command: `GET http://127.0.0.1:${hostPort}${healthTargets.find(t => t.source === 'declared')?.path ?? healthTargets[0]?.path ?? '/'}`,
      exitCode: null, exitCodeSource: null, failedService: appService,
      rawOutputTail: tailLines(rawOutputTail, 200),
      truncated: logsResult.run?.stdoutTruncated ?? false,
    };
  }

  checks.push(healthCheck);
  if (healthCheck.status === 'FAIL') {
    // healthCheck already pushed above — don't push again.
    return fail(healthCheck, 'VERIFYING_HEALTH', ['tests'], healthFailure, false);
  }

  // ── Phase: RUNNING_TESTS ───────────────────────────────────────────────────

  onPhase('RUNNING_TESTS');
  if (isCancelled()) return cancel(['tests']);

  if (testCommand === null) {
    checks.push(makeCheck('tests', 'NOT_RUN', false, 'No test command known for this stack'));
    return { result: { checks }, failedPhase: null, cancelled: false, failure: null };
  }

  const testResult = await composeRun(ctx, appService, testCommand);
  if (isCancelled()) return cancel(['tests']);

  const testOutput = testResult.run.stdout + testResult.run.stderr;

  // "NO TESTS RAN" or "Ran 0 tests" means the suite exists but nothing ran — report NOT_RUN.
  // This guards against a dry-run that exits 0 giving a false PASS.
  if (testOutput.includes('NO TESTS RAN') || /Ran 0 tests/.test(testOutput)) {
    checks.push(makeCheck('tests', 'NOT_RUN', true, 'No tests found'));
    return { result: { checks }, failedPhase: null, cancelled: false, failure: null };
  }

  if (testResult.run.exitCode === 0) {
    // Parse "Ran N tests" from Django test output.
    const m = testOutput.match(/Ran (\d+) test/);
    const detail = m ? `Ran ${m[1]} tests` : 'Tests passed';
    checks.push(makeCheck('tests', 'PASS', true, detail));
    return { result: { checks }, failedPhase: null, cancelled: false, failure: null };
  }

  // Test run failed.
  return fail(
    makeCheck('tests', 'FAIL', true, 'Tests failed'),
    'RUNNING_TESTS',
    [],
    {
      checkId: 'tests',
      command: testResult.command,
      exitCode: testResult.run.exitCode,
      exitCodeSource: 'command',
      failedService: appService,
      rawOutputTail: tailLines(testOutput, 200),
      truncated: testResult.run.stdoutTruncated || testResult.run.stderrTruncated,
    },
  );
}
