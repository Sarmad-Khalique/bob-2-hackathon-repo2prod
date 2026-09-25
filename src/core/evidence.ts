// Evidence model helpers — constructors and safe defaults for Evidence objects.
//
// This file does NOT scan the filesystem or call any external process.
// All scanning lives in src/analyzers/.

import type { Evidence } from './types';

/**
 * Return an Evidence object with safe "nothing known yet" defaults.
 *
 * @param workspaceRoot - Absolute path to the workspace being analysed.
 * @returns An Evidence value with all optional fields set to null / false / [].
 *
 * Pure function — no side effects, no filesystem access.
 */
export function createEmptyEvidence(workspaceRoot: string): Evidence {
  return {
    workspaceRoot,
    framework: null,
    dockerfilePresent: false,
    composePresent: false,
    ciPresent: false,
    envNames: [],
    candidatePorts: [],
    gitDirty: null,
  };
}
