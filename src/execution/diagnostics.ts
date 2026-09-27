// Bounded, redacted failure-bundle creation and persistence.
// Must never read .env files, never import vscode, never write outside .repo2prod/diagnostics/.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FailureBundle } from '../core/types.js';
import { Repo2ProdState } from '../core/state.js';
import { redactText } from '../core/redaction.js';
import { findComposeFile } from './compose.js';
import type { VerificationOutcome } from './verifier.js';

// ─── Limits ──────────────────────────────────────────────────────────────────

/** Hard cap on diagnostic excerpt size sent to Bob. */
export const DIAGNOSTICS_LIMITS = { maxLines: 150, maxBytes: 12_288 } as const;

// ─── Phase mapping ────────────────────────────────────────────────────────────

/** Explicit mapping — no casts. ExecutionPhase → Repo2ProdState. */
function phaseToState(phase: 'BUILDING' | 'STARTING' | 'VERIFYING_HEALTH' | 'RUNNING_TESTS'): Repo2ProdState {
  switch (phase) {
    case 'BUILDING':        return Repo2ProdState.BUILDING;
    case 'STARTING':        return Repo2ProdState.STARTING;
    case 'VERIFYING_HEALTH': return Repo2ProdState.VERIFYING_HEALTH;
    case 'RUNNING_TESTS':   return Repo2ProdState.RUNNING_TESTS;
  }
}

// ─── Relevant files by checkId ───────────────────────────────────────────────

/** Returns only the files that exist on disk (never .env*). */
async function relevantFiles(
  checkId: string,
  workspaceRoot: string,
): Promise<string[]> {
  const composeFile = await findComposeFile(workspaceRoot);
  const compose = composeFile ? path.basename(composeFile) : null;

  const candidates: string[] = [];
  switch (checkId) {
    case 'build':
      candidates.push('Dockerfile', '.dockerignore');
      if (compose) candidates.push(compose);
      candidates.push('requirements.txt', 'pyproject.toml', 'package.json');
      break;
    case 'database':
    case 'app':
      if (compose) candidates.push(compose);
      candidates.push('Dockerfile', '.dockerignore');
      break;
    case 'health':
      if (compose) candidates.push(compose);
      candidates.push('Dockerfile', '.repo2prod/health-endpoint.json');
      break;
    case 'tests':
      if (compose) candidates.push(compose);
      candidates.push('Dockerfile');
      break;
    default:
      // docker / compose checks: environment problem, no specific files.
      return [];
  }

  const present: string[] = [];
  for (const f of candidates) {
    const abs = path.resolve(workspaceRoot, f);
    if (fs.existsSync(abs)) present.push(f);
  }
  return present;
}

// ─── Excerpt bounding ─────────────────────────────────────────────────────────

/** Bounds the combined header+tail to DIAGNOSTICS_LIMITS, keeping the header intact.
 *  Redact BEFORE bounding so the limits apply to the final safe content. */
function boundExcerpt(header: string, tail: string): { text: string; wasTrimmed: boolean } {
  const separator = '--- log tail (redacted) ---\n';
  const full = header + separator + tail;

  const bytes = Buffer.byteLength(full, 'utf8');
  const lines = full.split('\n');

  if (bytes <= DIAGNOSTICS_LIMITS.maxBytes && lines.length <= DIAGNOSTICS_LIMITS.maxLines) {
    return { text: full, wasTrimmed: false };
  }

  // Keep header intact; trim the tail from the beginning (keep the end — most relevant).
  const headerLines = (header + separator).split('\n').length;
  const tailLines = tail.split('\n');
  let kept: string[] = [];
  let keptBytes = Buffer.byteLength(header + separator, 'utf8');

  // Walk tail from the end, accumulating until we'd exceed limits.
  for (let i = tailLines.length - 1; i >= 0; i--) {
    const lineBytes = Buffer.byteLength(tailLines[i] + '\n', 'utf8');
    if (
      keptBytes + lineBytes > DIAGNOSTICS_LIMITS.maxBytes ||
      headerLines + kept.length + 1 > DIAGNOSTICS_LIMITS.maxLines
    ) {
      break;
    }
    kept.unshift(tailLines[i]);
    keptBytes += lineBytes;
  }

  return { text: header + separator + kept.join('\n'), wasTrimmed: true };
}

// ─── Exit-code line ───────────────────────────────────────────────────────────

function exitCodeLine(
  exitCode: number | null,
  source: 'command' | 'container' | null,
): string {
  if (source === 'container') {
    return `${exitCode} (container exit code; the command itself exited 0)`;
  }
  if (source === 'command') {
    return `${exitCode} (command exit code)`;
  }
  return 'n/a';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Builds a bounded, redacted FailureBundle ready for Bob's /repo2prod-repair skill.
 * Throws "No failure to record" if the outcome has no failure or no failedPhase.
 */
export async function createFailureBundle(input: {
  attempt: number;
  outcome: VerificationOutcome;
  workspaceRoot: string;
  previous?: { attempt: number; phase: string } | null;
  extraSecrets?: readonly string[];
}): Promise<FailureBundle> {
  const { attempt, outcome, workspaceRoot, previous, extraSecrets } = input;

  if (!outcome.failure || !outcome.failedPhase) {
    throw new Error('No failure to record');
  }

  const { failure, failedPhase } = outcome;
  const phase = phaseToState(failedPhase);

  // Redact command and tail BEFORE bounding so limits apply to safe content.
  const redactedCommand = failure.command ? redactText(failure.command, extraSecrets) : null;
  const redactedTail = redactText(failure.rawOutputTail, extraSecrets);

  // Find the failing check detail for the header.
  const failedCheck = outcome.result.checks.find(c => c.id === failure.checkId);
  const checkDetail = failedCheck?.detail ?? '';

  // Collect relevant files that actually exist on disk (never .env*).
  const files = await relevantFiles(failure.checkId, workspaceRoot);
  const relevantFilesStr = files.length > 0 ? files.join(', ') : 'none (Docker/Compose environment problem)';

  // Facts only in the header — no guesses, no "likely cause" commentary.
  let header =
    `Repo2Prod diagnostic (attempt ${attempt})\n` +
    `Phase: ${phase}\n` +
    `Failed check: ${failure.checkId} - ${checkDetail}\n` +
    `Failed service: ${failure.failedService ?? 'none'}\n` +
    `Command: ${redactedCommand ?? 'none'}\n` +
    `Exit code: ${exitCodeLine(failure.exitCode, failure.exitCodeSource)}\n` +
    `Relevant files: ${relevantFilesStr}\n` +
    `Runtime manifest: .repo2prod/runtime-manifest.json\n`;

  if (previous) {
    header +=
      `Previous failure: attempt ${previous.attempt} at ${previous.phase}` +
      ` (see .repo2prod/diagnostics/attempt-${previous.attempt}.json)\n`;
  }

  header += '\n';

  const { text: redactedExcerpt, wasTrimmed } = boundExcerpt(header, redactedTail);
  const truncated = failure.truncated || wasTrimmed;

  return { attempt, phase, command: redactedCommand, exitCode: failure.exitCode, redactedExcerpt, truncated };
}

/** Validates a FailureBundle value against the diagnostics schema (6 required keys, no extras). */
export function validateFailureBundle(value: unknown): asserts value is FailureBundle {
  const problems: string[] = [];

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Failure bundle is invalid: root must be an object');
  }

  const obj = value as Record<string, unknown>;
  const required = ['attempt', 'phase', 'command', 'exitCode', 'redactedExcerpt', 'truncated'];

  for (const key of required) {
    if (!(key in obj)) problems.push(`missing required key "${key}"`);
  }

  const extra = Object.keys(obj).filter(k => !required.includes(k));
  if (extra.length > 0) problems.push(`extra keys not allowed: ${extra.join(', ')}`);

  if ('attempt' in obj && (typeof obj.attempt !== 'number' || !Number.isInteger(obj.attempt) || (obj.attempt as number) < 0)) {
    problems.push('"attempt" must be an integer >= 0');
  }
  if ('phase' in obj && typeof obj.phase !== 'string') {
    problems.push('"phase" must be a string');
  }
  if ('command' in obj && obj.command !== null && typeof obj.command !== 'string') {
    problems.push('"command" must be a string or null');
  }
  if ('exitCode' in obj && obj.exitCode !== null && (typeof obj.exitCode !== 'number' || !Number.isInteger(obj.exitCode))) {
    problems.push('"exitCode" must be an integer or null');
  }
  if ('redactedExcerpt' in obj && typeof obj.redactedExcerpt !== 'string') {
    problems.push('"redactedExcerpt" must be a string');
  }
  if ('truncated' in obj && typeof obj.truncated !== 'boolean') {
    problems.push('"truncated" must be a boolean');
  }

  if (problems.length > 0) {
    throw new Error(`Failure bundle is invalid: ${problems.join('; ')}`);
  }
}

/**
 * Validates, then writes the bundle to attempt-<n>.json and latest.json.
 * Creates .repo2prod/diagnostics/ if needed.
 * Returns the path to latest.json.
 */
export async function writeFailureBundle(workspaceRoot: string, bundle: FailureBundle): Promise<string> {
  validateFailureBundle(bundle);

  const dir = path.join(workspaceRoot, '.repo2prod', 'diagnostics');
  const latestPath = path.join(dir, 'latest.json');
  const attemptPath = path.join(dir, `attempt-${bundle.attempt}.json`);
  const content = JSON.stringify(bundle, null, 2) + '\n';

  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(attemptPath, content, 'utf8');
    fs.writeFileSync(latestPath, content, 'utf8');
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Repo2Prod: failed to write .repo2prod/diagnostics/latest.json: ${reason}`);
  }

  return latestPath;
}

/**
 * Deletes only *.json files directly inside .repo2prod/diagnostics/.
 * No recursion. Missing directory is fine.
 */
export async function clearDiagnostics(workspaceRoot: string): Promise<void> {
  const dir = path.join(workspaceRoot, '.repo2prod', 'diagnostics');
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    // Directory doesn't exist — nothing to clear.
    return;
  }
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    const full = path.join(dir, name);
    // Only remove direct children (readdirSync is non-recursive by default).
    if (fs.statSync(full).isFile()) {
      fs.unlinkSync(full);
    }
  }
}
