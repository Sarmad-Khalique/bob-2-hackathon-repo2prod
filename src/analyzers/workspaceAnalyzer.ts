// Workspace analyzer — combines all sub-analyzers into a single Evidence object.
//
// Runs analyzeExistingOps, analyzeFramework, collectEnvNames, and
// analyzeCandidatePorts in parallel, then merges the results into the
// Evidence shape from src/core/types.ts.
//
// This file does NOT:
//   - write any file (saveEvidence lives in src/core/evidence.ts)
//   - run git or any child process (gitDirty is set by Member A's Git guard)
//   - call Bob or any LLM
//   - read .env or any env value

import { stat } from 'node:fs/promises';
import type { Evidence } from '../core/types';
import { createEmptyEvidence } from '../core/evidence';
import { analyzeExistingOps } from './existingOpsAnalyzer';
import { analyzeFramework } from './frameworkAnalyzer';
import { collectEnvNames } from './envAnalyzer';
import { analyzeCandidatePorts } from './portAnalyzer';
import { isEnoent } from './fsUtils';

/**
 * Collect deterministic workspace evidence for the repository at `root`.
 *
 * Runs all sub-analyzers in parallel and merges their results.
 * `gitDirty` is always `null` — Member A's Git guard sets that field
 * before persisting the final Evidence.
 *
 * @param root - Absolute path to the repository root.
 * @returns A fully populated Evidence object (gitDirty excluded).
 * @throws "Repo2Prod: workspace root does not exist or is not a directory: <root>"
 *         if `root` is missing or is not a directory.
 * @throws Any filesystem error from a sub-analyzer (rethrown as-is).
 */
export async function analyzeWorkspace(root: string): Promise<Evidence> {
  // ---- 1. Validate root ----
  try {
    const s = await stat(root);
    if (!s.isDirectory()) {
      throw new Error(
        `Repo2Prod: workspace root does not exist or is not a directory: ${root}`,
      );
    }
  } catch (err: unknown) {
    if (isEnoent(err)) {
      throw new Error(
        `Repo2Prod: workspace root does not exist or is not a directory: ${root}`,
      );
    }
    // Re-check: if it's already our own error, rethrow it directly.
    if (err instanceof Error && err.message.startsWith('Repo2Prod:')) {
      throw err;
    }
    throw new Error(
      `Repo2Prod: workspace root does not exist or is not a directory: ${root}`,
    );
  }

  // ---- 2. Start from safe empty defaults ----
  const evidence = createEmptyEvidence(root);

  // ---- 3. Run all sub-analyzers in parallel ----
  const [existingOps, stack, envScan, ports] = await Promise.all([
    analyzeExistingOps(root),
    analyzeFramework(root),
    collectEnvNames(root),
    analyzeCandidatePorts(root),
  ]);

  // ---- 4. Fill Evidence ----
  evidence.framework         = stack.framework;
  evidence.dockerfilePresent = existingOps.dockerfilePresent;
  evidence.composePresent    = existingOps.composePresent;
  evidence.ciPresent         = existingOps.ciPresent;
  evidence.envNames          = envScan.names;
  evidence.candidatePorts    = ports;
  // gitDirty stays null — Member A's Git guard owns this field.

  return evidence;
}
