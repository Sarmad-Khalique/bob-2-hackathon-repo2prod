// Readiness report — deterministic summary of what Repo2Prod actually verified.
//
// Rules:
//   - Uses only observed VerificationResult checks; never fabricates evidence.
//   - Overall PASS requires core checks (docker, compose, build, app, health) to
//     each have status=PASS and observed=true.
//   - database NOT_RUN is acceptable (SQLite apps have no separate infra service).
//   - tests NOT_RUN is acceptable (repositories with no test suite).
//   - Any FAIL → overall FAIL.
//   - Any UNKNOWN → overall UNKNOWN (if no FAIL).
//   - Any WARN → overall WARN (if no FAIL/UNKNOWN).
//   - Missing/NOT_RUN core check → overall NOT_RUN.
//   - Otherwise → PASS.
//
// Never writes .env values or secret values.

import * as fs from 'fs';
import * as path from 'path';
import type { ReadinessReport, RunStatus, VerificationResult } from './types';

// ---------------------------------------------------------------------------
// Core checks that must individually be PASS + observed for overall PASS
// ---------------------------------------------------------------------------

const REQUIRED_CORE_CHECKS: readonly string[] = ['docker', 'compose', 'build', 'app', 'health'];

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Build a ReadinessReport from a completed VerificationResult.
 * No LLM involved — purely deterministic.
 */
export function buildReadinessReport(
  verification: VerificationResult,
  repairAttemptsUsed: number,
): ReadinessReport {
  const checks = verification.checks;

  // ── Derive overall status ──────────────────────────────────────────────────
  const overall = deriveOverall(checks);

  // ── Build summary string ───────────────────────────────────────────────────
  const summary = buildSummary(checks, overall, repairAttemptsUsed);

  return {
    overall,
    checks,
    repairAttemptsUsed,
    summary,
  };
}

// ---------------------------------------------------------------------------
// Overall status derivation
// ---------------------------------------------------------------------------

function deriveOverall(checks: VerificationResult['checks']): RunStatus {
  // 1. Any FAIL → FAIL.
  if (checks.some(c => c.status === 'FAIL')) {
    return 'FAIL';
  }

  // 2. Any UNKNOWN → UNKNOWN.
  if (checks.some(c => c.status === 'UNKNOWN')) {
    return 'UNKNOWN';
  }

  // 3. Any WARN → WARN.
  if (checks.some(c => c.status === 'WARN')) {
    return 'WARN';
  }

  // 4. All required core checks must be PASS and observed.
  for (const id of REQUIRED_CORE_CHECKS) {
    const check = checks.find(c => c.id === id);
    if (!check || check.status !== 'PASS' || !check.observed) {
      return 'NOT_RUN';
    }
  }

  // 5. All core checks present and passing — overall PASS.
  return 'PASS';
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function buildSummary(
  checks: VerificationResult['checks'],
  overall: RunStatus,
  repairAttemptsUsed: number,
): string {
  const passed = checks.filter(c => c.status === 'PASS' && c.observed).map(c => c.id);
  const notRun = checks.filter(c => c.status === 'NOT_RUN').map(c => c.id);
  const failed = checks.filter(c => c.status === 'FAIL').map(c => c.id);

  const parts: string[] = [];

  if (overall === 'PASS') {
    parts.push(`Local runtime verified. Passed: ${passed.join(', ')}.`);
  } else if (overall === 'FAIL') {
    parts.push(`Local runtime verification failed. Failed checks: ${failed.join(', ')}.`);
    if (passed.length > 0) {
      parts.push(`Passed: ${passed.join(', ')}.`);
    }
  } else {
    parts.push(`Local runtime status: ${overall}.`);
    if (passed.length > 0) {
      parts.push(`Passed: ${passed.join(', ')}.`);
    }
  }

  if (notRun.length > 0) {
    const notRunDescriptions = notRun.map(id => {
      if (id === 'database') return 'No separate database service was required.';
      if (id === 'tests') return 'No tests were found.';
      return `${id}: not run.`;
    });
    parts.push(...notRunDescriptions);
  }

  const repairWord = repairAttemptsUsed === 1 ? 'attempt' : 'attempts';
  parts.push(`${repairAttemptsUsed} repair ${repairWord} used.`);

  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Persist
// ---------------------------------------------------------------------------

const REPO2PROD_DIR = '.repo2prod';
const REPORT_FILE = 'readiness-report.json';

/**
 * Save the readiness report to .repo2prod/readiness-report.json.
 * Creates .repo2prod/ if it does not yet exist.
 * Returns the absolute path where the file was written.
 * Throws a descriptive Repo2Prod error on failure.
 */
export async function saveReadinessReport(
  workspaceRoot: string,
  report: ReadinessReport,
): Promise<string> {
  const dir = path.join(workspaceRoot, REPO2PROD_DIR);
  const filePath = path.join(dir, REPORT_FILE);

  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Repo2Prod: failed to save readiness report to ${REPO2PROD_DIR}/${REPORT_FILE}: ${message}`,
    );
  }

  return filePath;
}

/**
 * Returns true if .repo2prod/readiness-report.json exists.
 */
export function readinessReportExists(workspaceRoot: string): boolean {
  return fs.existsSync(path.join(workspaceRoot, REPO2PROD_DIR, REPORT_FILE));
}
